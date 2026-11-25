"""
Dibuja los 3 gráficos del proyecto a partir de los datos (Excel o datos_publicos/) y de los resultados.

  resultados/graficos/fig_viajes_semanales.png   Viajes por semana y tipo de camión (propio / tercero)
  resultados/graficos/fig_pronostico_real.png    Peso semanal real vs pronóstico de SIOAL vs repetir la semana anterior
  resultados/graficos/fig_proyeccion_semana.png  Error del total semanal según el día en que se corrige

Requiere haber ejecutado antes:  python caso_real_corto.py  y  python proyeccion_intrasemana.py
Uso:  python figuras.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
from src.fuente import semanal  # noqa: E402
from src.vectorial import pronosticos  # noqa: E402

OUT = BASE / 'resultados' / 'graficos'
OUT.mkdir(parents=True, exist_ok=True)
MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
AZUL, GRIS, NARANJA = '#1f6fb2', '#c9ced6', '#d9822b'
plt.rcParams.update({'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False})


def etiqueta(d):
    return f'{d.day} {MESES[d.month - 1]}'


def miles(x, _=None):
    return f'{x:,.0f}'.replace(',', ' ')


s, origen = semanal()
ter = s.viajes_terceros.sum() / s.viajes.sum() * 100            # todos los manifiestos (220 viajes)
s = s[s.semana_completa].reset_index(drop=True)
print(f'Datos: {origen} · {len(s)} semanas completas')
x = np.arange(len(s))
lab = [etiqueta(d) for d in s.semana]

# 1. Viajes por semana y tipo de camión ------------------------------------------------------------
fig, ax = plt.subplots(figsize=(9, 4))
ax.bar(x, s.viajes_terceros, color=AZUL, label='Camiones de terceros')
ax.bar(x, s.viajes_propios, bottom=s.viajes_terceros, color=GRIS, label='Camiones propios')
for i, t in enumerate(s.viajes):
    ax.text(i, t + 0.4, f'{int(t)}', ha='center', fontsize=9)
ax.set_xticks(x, lab, rotation=45, ha='right')
ax.set_ylabel('Viajes por semana')
ax.set_title(f'Viajes despachados por semana: {ter:.0f} % en camiones de terceros', loc='left', fontsize=11)
ax.legend(frameon=False, loc='upper right')
fig.tight_layout()
fig.savefig(OUT / 'fig_viajes_semanales.png', dpi=160)
plt.close(fig)

# 2. Peso semanal real vs pronóstico ----------------------------------------------------------------
y = s.kg.to_numpy(float)
F = pronosticos(y[None, :], ['naive', 'ma3', 'ses', 'ses_opt'])
comb = ((F['ma3'] + F['ses'] + F['ses_opt']) / 3)[0]
naive = F['naive'][0]
k = np.arange(4, len(y))
w = lambda f: 100 * np.abs(y[k] - f[k]).sum() / y[k].sum()  # noqa: E731
fig, ax = plt.subplots(figsize=(9, 4))
ax.plot(x, y, '-o', color='#222', lw=2, label='Peso real despachado')
ax.plot(k, comb[k], '-o', color=AZUL, label=f'Pronóstico SIOAL (combinación): error {w(comb):.2f} %'.replace('.', ','))
ax.plot(k, naive[k], '--', color=NARANJA, label=f'Repetir la semana anterior: error {w(naive):.2f} %'.replace('.', ','))
ax.axvspan(-0.5, 3.5, color='#f1f3f6')
ax.text(1.5, ax.get_ylim()[1] * 0.97, 'historia inicial', ha='center', va='top', fontsize=9, color='#666')
ax.yaxis.set_major_formatter(miles)
ax.set_xticks(x, lab, rotation=45, ha='right')
ax.set_ylabel('kg por semana')
ax.set_title('Peso semanal real frente al pronóstico (cada semana pronosticada solo con las anteriores)',
             loc='left', fontsize=11)
ax.legend(frameon=False, loc='lower right', fontsize=9)
fig.tight_layout()
fig.savefig(OUT / 'fig_pronostico_real.png', dpi=160)
plt.close(fig)

# 3. Error según el día de la corrección -------------------------------------------------------------
r = pd.read_csv(BASE / 'resultados' / 'caso_real' / 'proyeccion_intrasemana.csv')
r = r[r.variable == 'kg']
dias = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
r = r.iloc[:6]
fig, ax = plt.subplots(figsize=(9, 4))
ax.plot(dias, r.WAPE_solo_pronostico, '--', color=NARANJA, label='Solo el pronóstico del lunes')
ax.plot(dias, r.WAPE_solo_avance, '-s', color=GRIS, label='Solo lo ya despachado')
ax.plot(dias, r.WAPE_hibrido, '-o', color=AZUL, lw=2, label='SIOAL: despachado + lo que falta pronosticado')
for d, v in zip(dias, r.WAPE_hibrido):
    ax.text(d, v - 1.9, f'{v:.2f} %'.replace('.', ','), ha='center', fontsize=9, color=AZUL)
ax.set_ylabel('Error del total semanal de peso (WAPE, %)')
ax.set_xlabel('Día en que se corrige el total de la semana')
ax.set_title('Corregir a mitad de semana reduce el error del total semanal (11 semanas reales)',
             loc='left', fontsize=11)
ax.set_ylim(0, None)
ax.legend(frameon=False, fontsize=9)
fig.tight_layout()
fig.savefig(OUT / 'fig_proyeccion_semana.png', dpi=160)
plt.close(fig)
print('Gráficos guardados en', OUT)
