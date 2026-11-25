"""
ENTRENAMIENTO DEL MODELO DE PRONÓSTICO — SIOAL (Transportes Ochoa)

Entrena con los manifiestos reales de TITANICSOFT, con la misma lógica que la app mejorada:

  1. Lee y limpia los Excel (../Datos)          → excluye vacíos y > 500 kg/bulto (regla de la app)
  2. Arma series semanales completas             → kg, bultos y viajes
  3. Partición temporal                          → entrenamiento / validación / prueba
  4. Entrena y compara 6 modelos                 → elige con la regla robusta de la app
  5. Mide el error final en la prueba            → semanas que el modelo nunca vio
  6. Reentrena con todo el historial             → pronóstico de 4 semanas con rangos 80 % / 95 %
  7. Guarda el modelo entrenado                  → resultados/entrenamiento/modelo_entrenado.json

Uso:
    pip install -r requirements.txt
    python entrenar_modelo.py                          # lee ../Datos
    python entrenar_modelo.py --datos "ruta/Excel" --horizonte 4
"""
from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path

import matplotlib
import numpy as np
import pandas as pd

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402

from src.datos_reales import agregar_semanal, leer_excels, limpiar  # noqa: E402
from src.fuente import hay_excel  # noqa: E402
from src.evaluacion import (INICIO_HISTORIAL, UMBRAL_WAPE_APP, evaluar_tramo,  # noqa: E402
                            intervalos_horizonte, particion_v2, seleccionar_modelo)
from src.modelos import MODELOS_APP, alpha_optimo, pronostico_multipaso  # noqa: E402

BASE = Path(__file__).parent
VARIABLES = {'kg': ('kg', 'Kilogramos por semana', 'kg'),
             'bultos': ('qty', 'Bultos por semana', 'bultos'),
             'viajes': ('orders', 'Viajes (manifiestos) por semana', 'viajes')}


def lunes(d: date) -> pd.Timestamp:
    d = pd.Timestamp(d).normalize()
    return d - pd.Timedelta(days=d.day_of_week)


def parametros(modelo: str, serie) -> dict:
    """Parámetros del modelo ajustado con todo el historial (para documentarlo y reutilizarlo)."""
    if modelo == 'ses':
        return {'alpha': 0.35}
    if modelo == 'ses_opt':
        return {'alpha': alpha_optimo(serie)}
    if modelo == 'ma3':
        return {'ventana': 3}
    if modelo == 'wma3':
        return {'pesos': [0.2, 0.3, 0.5]}
    if modelo == 'trend':
        return {'ventana': 8}
    return {}


def main():
    ap = argparse.ArgumentParser(description='Entrena el pronóstico semanal de SIOAL con datos de TITANICSOFT.')
    ap.add_argument('--datos', default=str(BASE.parent / 'Datos'), help='carpeta con los Excel de TITANICSOFT')
    ap.add_argument('--horizonte', type=int, default=4, help='semanas a pronosticar')
    ap.add_argument('--hoy', default=None, help='fecha de referencia AAAA-MM-DD (por defecto, hoy)')
    ap.add_argument('--salida', default=str(BASE / 'resultados' / 'entrenamiento'))
    args = ap.parse_args()
    salida = Path(args.salida)
    salida.mkdir(parents=True, exist_ok=True)
    hoy = pd.Timestamp(args.hoy) if args.hoy else pd.Timestamp(date.today())

    # ---------------------------------------------------------------- 1-2. Datos
    if hay_excel(Path(args.datos)):
        crudo, archivos = leer_excels(Path(args.datos))
        df = limpiar(crudo)
        semanal = agregar_semanal(df, 'excluir_regla_app')
        origen_json = {'carpeta': Path(args.datos).name, 'archivos': [a['archivo'] for a in archivos],
                       'manifiestos': int(len(df)), 'usados': int((~df.excluir_regla_app).sum()),
                       'desde': f'{df.fecha.min():%Y-%m-%d}', 'hasta': f'{df.fecha.max():%Y-%m-%d}'}
        fuente_txt = f'{len(archivos)} archivos · {len(df)} manifiestos · {int((~df.excluir_regla_app).sum())} usados'
    else:   # sin los Excel de la empresa: totales anonimizados del repositorio
        semanal = pd.read_csv(BASE / 'datos_publicos' / 'semanal.csv', parse_dates=['semana'])
        origen_json = {'carpeta': 'datos_publicos', 'archivos': ['semanal.csv'],
                       'desde': f'{semanal.semana.min():%Y-%m-%d}', 'hasta': f'{semanal.semana.max():%Y-%m-%d}'}
        fuente_txt = 'datos_publicos/semanal.csv (sin Excel)'
    comp = semanal[semanal.semana_completa].reset_index(drop=True)
    n = len(comp)
    print(f'[1] {fuente_txt} '
          f'· {n} semanas completas ({comp.semana[0]:%d-%m-%Y} a {comp.semana[n - 1]:%d-%m-%Y})')

    # ---------------------------------------------------------------- 3. Partición
    p = particion_v2(n)
    v0, t0 = p['ini_validacion'], p['ini_prueba']
    print(f'[2] Partición {p["tipo"]}: entrenamiento {p["sem_entrenamiento"]} · validación {p["sem_validacion"]} '
          f'· prueba {p["sem_prueba"]} semanas')

    # Semana desde la que se pronostica (igual que la app: si faltan semanas recientes, desde la semana actual)
    ultima = comp.semana[n - 1]
    siguiente = ultima + pd.Timedelta(weeks=1)
    desfase = (siguiente < lunes(hoy)) and ((lunes(hoy) - siguiente).days // 7 <= 8)
    objetivo = lunes(hoy) if desfase else siguiente
    inicio = max(1, round((objetivo - ultima).days / 7))
    H = inicio + args.horizonte - 1

    modelo_json = {
        'generado': datetime.now().isoformat(timespec='seconds'),
        'origen': origen_json,
        'particion': p, 'regla_seleccion': 'menor MAE en validación; empate (< 2 %) → menor MAE en el historial',
        'variables': {}}
    filas_metricas, filas_pronostico = [], []

    # ---------------------------------------------------------------- 4-6. Entrenar, evaluar y pronosticar
    print('[3] Entrenando y evaluando…')
    for var, (campo_app, titulo, unidad) in VARIABLES.items():
        serie = comp[var].to_numpy(float)
        modelos = list(MODELOS_APP)
        met_val, _ = evaluar_tramo(serie, modelos, v0, t0)
        met_hist, _ = evaluar_tramo(serie, modelos, INICIO_HISTORIAL, t0)
        elegido = seleccionar_modelo(met_val, met_hist, modelos)
        prueba = evaluar_tramo(serie, [elegido], t0, n)[0].iloc[0] if p['sem_prueba'] else None

        pasos = pronostico_multipaso(elegido, serie, H)
        rangos = intervalos_horizonte(serie, elegido, H)
        pron = []
        for i in range(args.horizonte):
            h = inicio + i
            f = round(pasos[h - 1], 1)
            r = rangos[h - 1]
            pron.append({'semana': f'{ultima + pd.Timedelta(weeks=h):%Y-%m-%d}', 'pronostico': f,
                         'min_80': round(max(0, f + r['q10']), 1) if r else None, 'max_80': round(f + r['q90'], 1) if r else None,
                         'min_95': round(max(0, f + r['q025']), 1) if r else None, 'max_95': round(f + r['q975'], 1) if r else None})

        for tramo, dfm in (('validacion', met_val), ('historial', met_hist)):
            for _, r in dfm.iterrows():
                filas_metricas.append({'variable': var, 'tramo': tramo, 'modelo': r.modelo, 'elegido': r.modelo == elegido,
                                       **{k: r[k] for k in ['n', 'MAE', 'RMSE', 'WAPE_%', 'MAPE_%', 'Sesgo_%', 'MASE']}})
        if prueba is not None:
            filas_metricas.append({'variable': var, 'tramo': 'prueba', 'modelo': elegido, 'elegido': True,
                                   **{k: prueba[k] for k in ['n', 'MAE', 'RMSE', 'WAPE_%', 'MAPE_%', 'Sesgo_%', 'MASE']}})
        filas_pronostico += [{'variable': var, 'modelo': elegido, **x} for x in pron]

        modelo_json['variables'][var] = {
            'campo_app': campo_app, 'modelo': elegido, 'nombre': MODELOS_APP[elegido],
            'parametros': parametros(elegido, serie), 'ultimo_valor_observado': float(serie[-1]),
            'validacion': met_val.set_index('modelo')[['MAE', 'RMSE', 'WAPE_%']].round(4).to_dict('index'),
            'historial': met_hist.set_index('modelo')[['MAE', 'WAPE_%']].round(4).to_dict('index'),
            'prueba': None if prueba is None else {k: round(float(prueba[k]), 4) for k in ['MAE', 'RMSE', 'WAPE_%', 'Sesgo_%']},
            'cumple_umbral_app': None if prueba is None else bool(prueba['WAPE_%'] <= UMBRAL_WAPE_APP),
            'pronostico': pron}
        wp = '—' if prueba is None else f'{prueba["WAPE_%"]:.2f} %'
        print(f'    {var:7s} → {MODELOS_APP[elegido]:34s} WAPE prueba {wp:>8s} · próxima semana {pron[0]["pronostico"]:,.1f} {unidad} '
              + (f'(80 %: {pron[0]["min_80"]:,.0f}–{pron[0]["max_80"]:,.0f})' if pron[0]["min_80"] is not None else '(sin rango: pocas semanas)'))

    # ---------------------------------------------------------------- 7. Guardar
    (salida / 'modelo_entrenado.json').write_text(json.dumps(modelo_json, ensure_ascii=False, indent=1), encoding='utf-8')
    pd.DataFrame(filas_metricas).to_csv(salida / 'metricas_modelos.csv', index=False)
    pd.DataFrame(filas_pronostico).to_csv(salida / 'pronostico.csv', index=False)

    fig, axs = plt.subplots(3, 1, figsize=(11, 8.5), sharex=True)
    for ax, (var, (_, titulo, _)) in zip(axs, VARIABLES.items()):
        v = modelo_json['variables'][var]
        ax.plot(comp.semana, comp[var], color='#111827', marker='o', ms=2.5, lw=1.4, label='Real')
        ax.axvspan(comp.semana[v0], comp.semana[t0 - 1], color='#fde68a', alpha=.4, label='Validación')
        if p['sem_prueba']:
            ax.axvspan(comp.semana[t0], comp.semana[n - 1], color='#bfdbfe', alpha=.5, label='Prueba')
        f = pd.DataFrame(v['pronostico'])
        f['semana'] = pd.to_datetime(f.semana)
        ax.plot(f.semana, f.pronostico, color='#059669', marker='o', ms=3, label=f'Pronóstico ({v["nombre"]})')
        if f.min_95.notna().all():
            ax.fill_between(f.semana, f.min_95, f.max_95, color='#059669', alpha=.12, label='Rango 95 %')
            ax.fill_between(f.semana, f.min_80, f.max_80, color='#059669', alpha=.25, label='Rango 80 %')
        ax.set_title(titulo, fontsize=10)
        ax.grid(alpha=.3)
        ax.legend(fontsize=7, ncol=6, loc='lower left')
    fig.tight_layout()
    fig.savefig(salida / 'entrenamiento.png', dpi=120)
    plt.close(fig)
    print(f'[4] Modelo guardado en {salida / "modelo_entrenado.json"}')

    # ---------------------------------------------------------------- Verificación con la app (opcional)
    app_file = BASE / 'datos' / 'reales' / 'resultado_app.json'
    if app_file.exists():
        app = json.loads(app_file.read_text(encoding='utf-8'))
        if app.get('version') == 'v2' and 'resultados' in app:
            ok = True
            for var, (campo, _, _) in VARIABLES.items():
                a, py = app['resultados'][campo], modelo_json['variables'][var]
                same = (a['elegido'] == py['modelo']
                        and (py['prueba'] is None or abs(a['prueba']['wape'] - py['prueba']['WAPE_%']) < 1e-3)
                        and abs(a['pronostico'][0] - py['pronostico'][0]['pronostico']) < 0.11)
                ok &= same
                print(f'    verificación {var}: app={a["elegido"]} python={py["modelo"]} → {"✅" if same else "❌"}')
            print('[5] ' + ('La app y Python entrenan exactamente lo mismo.' if ok else '⚠️ Diferencias con la app: revisar.'))


if __name__ == '__main__':
    main()
