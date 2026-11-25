"""
Genera datos_publicos/ a partir de los Excel de TITANICSOFT (../Datos).

Solo guarda TOTALES por semana y por día (viajes, kg y bultos), sin números de manifiesto,
conductores, placas, clientes ni importes. Estos archivos sí se suben al repositorio y permiten
reproducir las cifras y los gráficos sin los datos de la empresa.

Uso:  python exportar_datos_publicos.py
"""
from __future__ import annotations

import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE))
from src.fuente import CARPETA_EXCEL, CARPETA_PUBLICA, diario, hay_excel, semanal  # noqa: E402

if not hay_excel():
    raise SystemExit(f'No hay Excel en {CARPETA_EXCEL}: no se puede regenerar datos_publicos/.')

CARPETA_PUBLICA.mkdir(exist_ok=True)
s, _ = semanal()
s['semana'] = s.semana.dt.strftime('%Y-%m-%d')
s.to_csv(CARPETA_PUBLICA / 'semanal.csv', index=False)
d, _ = diario()
d['fecha'] = d.fecha.dt.strftime('%Y-%m-%d')
d.to_csv(CARPETA_PUBLICA / 'diario.csv', index=False)
print(f'semanal.csv: {len(s)} semanas ({int(s.semana_completa.sum())} completas) · diario.csv: {len(d)} días')
print('Guardado en', CARPETA_PUBLICA)
