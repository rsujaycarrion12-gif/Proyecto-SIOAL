"""
Fuente de datos de los scripts.

1. Si hay Excel de TITANICSOFT en ../Datos (o en la carpeta de la variable SIOAL_DATOS), se usan.
2. Si no los hay, se usan los totales anonimizados de datos_publicos/ (sin conductores, placas ni importes),
   para que cualquiera pueda reproducir las cifras y los gráficos sin los archivos de la empresa.

Ambos caminos dan las mismas series: datos_publicos/ se genera con exportar_datos_publicos.py
a partir de los mismos Excel y con la misma regla de limpieza que la app.
"""
from __future__ import annotations

import os
from pathlib import Path

import pandas as pd

from .datos_reales import agregar_semanal, leer_excels, limpiar, semana_inicio

BASE = Path(__file__).resolve().parents[1]                     # carpeta modelo/
CARPETA_EXCEL = Path(os.environ.get('SIOAL_DATOS', BASE.parent / 'Datos'))
CARPETA_PUBLICA = BASE / 'datos_publicos'


def hay_excel(carpeta: Path = CARPETA_EXCEL) -> bool:
    return Path(carpeta).is_dir() and any(Path(carpeta).glob('*.xlsx'))


def manifiestos(carpeta: Path = CARPETA_EXCEL) -> pd.DataFrame:
    """Manifiestos limpios y aceptados por la regla de la app (solo si hay Excel)."""
    crudo, _ = leer_excels(Path(carpeta))
    df = limpiar(crudo)
    return df[~df.excluir_regla_app].copy()


def semanal(carpeta: Path = CARPETA_EXCEL) -> tuple[pd.DataFrame, str]:
    """Serie semanal (lunes a domingo): viajes, kg y bultos, total y por tipo de camión."""
    if hay_excel(carpeta):
        crudo, _ = leer_excels(Path(carpeta))
        df = limpiar(crudo)
        s = agregar_semanal(df, 'excluir_regla_app')[['semana', 'viajes', 'kg', 'bultos', 'dias_con_viajes',
                                                      'semana_completa']]
        v = df[~df.excluir_regla_app].copy()
        v['semana'] = semana_inicio(v.fecha)
        v['tipo'] = v.tipo_vehiculo.str.upper().map(lambda t: 'terceros' if 'TERCER' in t else 'propios')
        por_tipo = v.pivot_table(index='semana', columns='tipo', values=['kg', 'numero'],
                                 aggfunc={'kg': 'sum', 'numero': 'count'}, fill_value=0)
        por_tipo.columns = [f'{"viajes" if a == "numero" else "kg"}_{b}' for a, b in por_tipo.columns]
        s = s.merge(por_tipo.reset_index(), on='semana', how='left').fillna(0)
        for c in ['viajes_propios', 'viajes_terceros']:
            s[c] = s.get(c, 0).astype(int)
        return s, f'Excel de {carpeta}'
    s = pd.read_csv(CARPETA_PUBLICA / 'semanal.csv', parse_dates=['semana'])
    return s, 'datos_publicos/semanal.csv'


def diario(carpeta: Path = CARPETA_EXCEL) -> tuple[pd.DataFrame, str]:
    """Totales por día: viajes, kg y bultos."""
    if hay_excel(carpeta):
        v = manifiestos(carpeta)
        d = (v.groupby(v.fecha.dt.normalize())
              .agg(viajes=('numero', 'size'), kg=('kg', 'sum'), bultos=('bultos', 'sum'))
              .rename_axis('fecha').reset_index())
        return d, f'Excel de {carpeta}'
    d = pd.read_csv(CARPETA_PUBLICA / 'diario.csv', parse_dates=['fecha'])
    return d, 'datos_publicos/diario.csv'
