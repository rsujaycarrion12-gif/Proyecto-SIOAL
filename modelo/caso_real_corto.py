"""
Caso ilustrativo con las 15 semanas de la exportación TITANICSOFT (ago.–nov. 2026).
Origen móvil desde la semana 5 (4 de historia) → 11 pronósticos a 1 semana por variable.
La regla de la app se re-aplica en cada origen desde t = 8 (7 pronósticos), como si el sistema se
reentrenara cada semana. Muestra muy pequeña: resultados descriptivos.

Entrada: datos/procesados/semanal_con_origen.csv (filas con origen == 'real').
Salida:  resultados/caso_real/wape_caso_real.csv
"""
from pathlib import Path
import numpy as np
import pandas as pd
from src.fuente import semanal
from src.vectorial import pronosticos, seleccion_app

BASE = Path(__file__).resolve().parent
OUT = BASE / 'resultados' / 'caso_real'
CAND = ['naive', 'ma3', 'wma3', 'ses', 'ses_opt', 'trend']


def wape(y, f):
    ok = ~np.isnan(f)
    return 100 * np.sum(np.abs(y[ok] - f[ok])) / np.sum(y[ok]), int(ok.sum())


def main():
    # Semanas completas de las exportaciones reales (Excel en ../Datos o, si no están, datos_publicos/)
    sem, origen = semanal()
    print('Datos:', origen)
    d = sem[(sem.semana >= '2026-08-03') & (sem.semana <= '2026-11-09')]
    OUT.mkdir(parents=True, exist_ok=True)
    filas = []
    for v in ['kg', 'bultos', 'viajes']:
        y = d[v].to_numpy(float)
        Y = y[None, :]
        F = pronosticos(Y, CAND)
        F['comb'] = (F['ma3'] + F['ses'] + F['ses_opt']) / 3
        regla = np.full(len(y), np.nan)
        for t in range(8, len(y)):
            k = seleccion_app(Y[:, :t], {m: F[m][:, :t] for m in CAND}, t, CAND)[0]
            regla[t] = F[CAND[k]][0, t]
        for m in CAND + ['comb']:
            w, n = wape(y[4:], F[m][0, 4:])
            filas.append({'variable': v, 'modelo': m, 'tramo': 'sem. 5-15', 'WAPE_%': w, 'n': n})
        w, n = wape(y, regla)
        filas.append({'variable': v, 'modelo': 'regla_app', 'tramo': 'sem. 9-15', 'WAPE_%': w, 'n': n})
        naive_sub = np.where(np.isnan(regla), np.nan, F['naive'][0])
        w, n = wape(y, naive_sub)
        filas.append({'variable': v, 'modelo': 'naive', 'tramo': 'sem. 9-15', 'WAPE_%': w, 'n': n})
    r = pd.DataFrame(filas)
    r.to_csv(OUT / 'wape_caso_real.csv', index=False)
    print(r.pivot_table(index='modelo', columns=['variable', 'tramo'], values='WAPE_%').round(2))


if __name__ == '__main__':
    main()
