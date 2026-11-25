"""
Lectura, limpieza y revisión de los manifiestos de carga reales exportados de TITANICSOFT.

Cada fila de los Excel es un MANIFIESTO (viaje de camión, MF01-xxxxxxxx) con su peso total,
bultos e importe. No son órdenes de servicio individuales.
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

COLUMNAS_ESPERADAS = ['ACCIÓN', 'FECHA', 'NÚMERO', 'MONITOREO', 'VEHÍCULO', 'TIPO', 'SEMIREMOLQUE',
                      'CONDUCTOR', 'AGENCIA TERCERO', 'COSTO FLETE', 'T. PESO', 'T. BULTOS', 'T. IMPORTE']

# Umbrales de revisión (no se corrige nada automáticamente: solo se marca)
UMBRAL_KG_POR_BULTO_APP = 500      # mismo piso estadístico que usa la app SIOAL
UMBRAL_PESO_ALTO_KG = 35_000       # carga útil mayor a la habitual de un semirremolque
UMBRAL_SOLES_KG_BAJO = 0.15        # importe sospechosamente bajo por kg (posible error de digitación)
UMBRAL_SOLES_KG_ALTO = 1.20        # importe sospechosamente alto por kg
PATRON_PLACA = re.compile(r'^[A-Z0-9]{3}-[A-Z0-9]{3}$')


def origen_archivo(ruta: Path) -> str:
    """
    'real' si el Excel es una exportación directa de TITANICSOFT (sin metadatos de autor);
    'simulado' si fue generado por un programa (metadatos de openpyxl u otra librería).
    """
    import re
    import zipfile
    if Path(ruta).name.upper().startswith('SIMULADO'):
        return 'simulado'
    with zipfile.ZipFile(ruta) as z:
        if 'docProps/core.xml' not in z.namelist():
            return 'real'
        core = z.read('docProps/core.xml').decode('utf-8', 'ignore')
        app = z.read('docProps/app.xml').decode('utf-8', 'ignore') if 'docProps/app.xml' in z.namelist() else ''
    autor = (re.search(r'<dc:creator>([^<]*)</dc:creator>', core) or [None, ''])[1].lower()
    return 'simulado' if 'openpyxl' in autor or 'openpyxl' in app.lower() else 'real'


def _numero(texto) -> float:
    s = re.sub(r'[^\d.]', '', str(texto if texto is not None else ''))
    return float(s) if s else np.nan


def leer_excels(carpeta: Path) -> tuple[pd.DataFrame, list[dict]]:
    """Lee todos los .xlsx de la carpeta. Devuelve los registros crudos y un resumen por archivo."""
    import openpyxl

    filas, resumen = [], []
    for f in sorted(Path(carpeta).glob('*.xlsx')):
        ws = openpyxl.load_workbook(f, read_only=True, data_only=True).worksheets[0]
        datos = list(ws.iter_rows(values_only=True))
        cab = [str(c).strip() if c is not None else '' for c in datos[0]]
        faltan = [c for c in COLUMNAS_ESPERADAS if c not in cab]
        origen = origen_archivo(f)
        for i, r in enumerate(datos[1:], start=2):
            if not any(v not in (None, '') for v in r):
                continue
            filas.append({**dict(zip(cab, r)), 'archivo': f.name, 'fila_excel': i, 'origen': origen})
        resumen.append({'archivo': f.name, 'origen': origen, 'filas': len(datos) - 1,
                        'columnas_faltantes': ', '.join(faltan) or '—'})
    return pd.DataFrame(filas), resumen


def limpiar(crudo: pd.DataFrame) -> pd.DataFrame:
    """Convierte tipos y agrega columnas de observación (banderas). No elimina filas."""
    df = pd.DataFrame({
        'numero': crudo['NÚMERO'].astype(str).str.strip(),
        'fecha': pd.to_datetime(crudo['FECHA'], format='%d/%m/%Y', errors='coerce'),
        'tipo_vehiculo': crudo['TIPO'].astype(str).str.strip(),
        'kg': crudo['T. PESO'].map(_numero),
        'bultos': pd.to_numeric(crudo['T. BULTOS'], errors='coerce'),
        'importe_soles': crudo['T. IMPORTE'].map(_numero),
        'archivo': crudo['archivo'],
        'origen': crudo['origen'],
        'fila_excel': crudo['fila_excel'],
    })
    placa_ok = crudo['VEHÍCULO'].astype(str).str.match(PATRON_PLACA)
    semi_ok = crudo['SEMIREMOLQUE'].astype(str).str.match(PATRON_PLACA)
    kg_bulto = df.kg / df.bultos.replace(0, np.nan)
    soles_kg = df.importe_soles / df.kg.replace(0, np.nan)

    df['obs_fecha_invalida'] = df.fecha.isna()
    df['obs_vacio'] = (df.kg.fillna(0) <= 0) | (df.bultos.fillna(0) <= 0)
    df['obs_duplicado'] = df.numero.duplicated(keep='first')
    df['obs_kg_por_bulto_alto'] = kg_bulto > UMBRAL_KG_POR_BULTO_APP
    df['obs_peso_alto'] = df.kg > UMBRAL_PESO_ALTO_KG
    df['obs_importe_bajo'] = soles_kg < UMBRAL_SOLES_KG_BAJO
    df['obs_importe_alto'] = soles_kg > UMBRAL_SOLES_KG_ALTO
    df['obs_placa_formato'] = ~placa_ok | ~semi_ok
    df['kg_por_bulto'] = kg_bulto.round(2)
    df['soles_por_kg'] = soles_kg.round(3)
    # Uso en el modelo
    df['excluir'] = df.obs_fecha_invalida | df.obs_vacio | df.obs_duplicado
    df['excluir_regla_app'] = df.excluir | df.obs_kg_por_bulto_alto
    return df.sort_values('numero').reset_index(drop=True)


def semana_inicio(fechas: pd.Series) -> pd.Series:
    """Lunes de la semana (igual que weekStart() de la app)."""
    return (fechas - pd.to_timedelta(fechas.dt.day_of_week, unit='D')).dt.normalize()


def agregar_semanal(df: pd.DataFrame, excluir_col: str = 'excluir') -> pd.DataFrame:
    d = df[~df[excluir_col]].copy()
    d['semana'] = semana_inicio(d.fecha)
    s = d.groupby('semana').agg(viajes=('numero', 'size'), kg=('kg', 'sum'), bultos=('bultos', 'sum'),
                                importe_soles=('importe_soles', 'sum'), dias_con_viajes=('fecha', 'nunique'),
                                n_real=('origen', lambda o: int((o == 'real').sum())))
    todas = pd.date_range(s.index.min(), s.index.max(), freq='7D')
    s = s.reindex(todas, fill_value=0)
    s.index.name = 'semana'
    ini, fin = df.fecha.min(), df.fecha.max()
    s['semana_completa'] = [(w >= ini) and (w + pd.Timedelta(days=6) <= fin) for w in s.index]
    # Origen de la semana: real solo si sus 7 días están dentro del periodo exportado de TITANICSOFT
    reales = df[df.origen == 'real'].fecha
    if len(reales):
        r0, r1 = reales.min(), reales.max()
        s['origen'] = ['real' if (w >= r0 and w + pd.Timedelta(days=6) <= r1)
                       else 'simulado' if (w + pd.Timedelta(days=6) < r0 or w > r1) else 'mixta' for w in s.index]
    else:
        s['origen'] = 'simulado'
    return s.reset_index()


def agregar_diario(df: pd.DataFrame) -> pd.DataFrame:
    d = df[~df.excluir]
    s = d.groupby('fecha').agg(viajes=('numero', 'size'), kg=('kg', 'sum'), bultos=('bultos', 'sum'))
    s = s.reindex(pd.date_range(df.fecha.min(), df.fecha.max()), fill_value=0)
    s.index.name = 'fecha'
    s = s.reset_index()
    s['dia_semana'] = s.fecha.dt.day_name()
    return s
