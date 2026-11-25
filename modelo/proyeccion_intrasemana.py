"""
Modelo de proyección en tiempo real (dentro de la semana) con las semanas reales de TITANICSOFT.

Total estimado de la semana al cierre del día d:
    T̂(d) = acumulado(d) + F · (1 − p(d))
F = pronóstico de la semana hecho el lunes (combinación MA3 + SES 0,35 + SES α óptimo, solo con semanas previas)
p(d) = fracción de la carga semanal que normalmente ya salió al cierre del día d (perfil por día de la semana,
       estimado SIN la semana evaluada: validación dejando una semana fuera).
Se compara con «solo pronóstico» (F) y «solo avance» (acumulado / p(d)).

Salida: resultados/caso_real/proyeccion_intrasemana.csv  (11 semanas evaluadas: ilustrativo)
"""
import sys
from pathlib import Path
import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
from src.fuente import diario  # noqa: E402
from src.vectorial import pronosticos  # noqa: E402

DIAS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']
PRIMERA, ULTIMA = '2026-08-03', '2026-11-09'      # semanas completas de la exportación real


def main():
    v, origen = diario()                            # Excel en ../Datos o, si no están, datos_publicos/
    print('Datos:', origen)
    v['semana'] = v.fecha.dt.to_period('W-SUN').dt.start_time
    v['dia'] = v.fecha.dt.dayofweek
    filas = []
    for var in ['kg', 'viajes']:
        v['valor'] = v[var]
        tab = (v.pivot_table(index='semana', columns='dia', values='valor', aggfunc='sum', fill_value=0)
                .reindex(columns=range(7), fill_value=0).loc[PRIMERA:ULTIMA])
        tot = tab.sum(1).to_numpy(float)
        F = pronosticos(tot[None, :], ['ma3', 'ses', 'ses_opt'])
        comb = ((F['ma3'] + F['ses'] + F['ses_opt']) / 3)[0]
        for dd in range(7):
            ef = en = eh = den = 0.0
            for i in range(4, len(tot)):
                otras = tab.drop(index=tab.index[i])
                p = (otras.cumsum(1).sum() / otras.values.sum()).to_numpy()
                acum = tab.iloc[i, :dd + 1].sum()
                ef += abs(tot[i] - comb[i])
                en += abs(tot[i] - acum / p[dd])
                eh += abs(tot[i] - (acum + comb[i] * (1 - p[dd])))
                den += tot[i]
            filas.append({'variable': var, 'dia': DIAS[dd], 'avance_esperado_%': 100 * (tab.cumsum(1).sum() / tab.values.sum()).iloc[dd],
                          'WAPE_solo_pronostico': 100 * ef / den, 'WAPE_solo_avance': 100 * en / den,
                          'WAPE_hibrido': 100 * eh / den, 'semanas': len(tot) - 4})
    r = pd.DataFrame(filas)
    out = BASE / 'resultados' / 'caso_real'
    out.mkdir(parents=True, exist_ok=True)
    r.to_csv(out / 'proyeccion_intrasemana.csv', index=False)
    print(r.round(2).to_string())


if __name__ == '__main__':
    main()
