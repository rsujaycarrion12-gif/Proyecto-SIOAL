"""
Paso 1 — Prepara los datos reales (manifiestos TITANICSOFT) para el entrenamiento.

Uso:    python preparar_datos_reales.py [carpeta_excel]
        (por defecto lee ../Datos)
Salida: datos/reales/
          manifiestos_limpios.csv   un registro por manifiesto, sin nombres de conductores
          observaciones.csv         manifiestos con alguna observación de calidad y su motivo
          resumen_archivos.csv      filas y columnas por archivo Excel
          semanal.csv               serie semanal para entrenar (excluye solo registros inválidos)
          semanal_regla_app.csv     serie semanal con la regla de la app (excluye además kg/bulto > 500)
          diario.csv                serie diaria (para revisar días sin viajes)
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

from src.datos_reales import agregar_diario, agregar_semanal, leer_excels, limpiar

BASE = Path(__file__).parent
ORIGEN = Path(sys.argv[1]) if len(sys.argv) > 1 else BASE.parent / 'Datos'
DESTINO = BASE / 'datos' / 'reales'
DESTINO.mkdir(parents=True, exist_ok=True)

MOTIVOS = {
    'obs_fecha_invalida': 'Fecha inválida → excluido',
    'obs_vacio': 'Manifiesto vacío (0 kg / 0 bultos) → excluido',
    'obs_duplicado': 'Número duplicado → excluido',
    'obs_kg_por_bulto_alto': 'Más de 500 kg por bulto (la app lo pone en cuarentena) → revisar',
    'obs_peso_alto': 'Peso mayor a 35 000 kg → revisar posible sobrecarga o error',
    'obs_importe_bajo': 'Importe menor a S/ 0,15 por kg → posible error de digitación',
    'obs_importe_alto': 'Importe mayor a S/ 1,20 por kg → revisar',
    'obs_placa_formato': 'Placa de vehículo o semirremolque con formato incorrecto o vacía',
}

crudo, resumen = leer_excels(ORIGEN)
if crudo.empty:
    sys.exit(f'No se encontraron Excel en {ORIGEN}')
df = limpiar(crudo)

# Observaciones (se incluyen placas solo donde hay que corregirlas; nunca nombres de conductores)
obs_cols = list(MOTIVOS)
marcados = df[df[obs_cols].any(axis=1)].copy()
marcados['motivo'] = marcados[obs_cols].apply(lambda r: ' | '.join(MOTIVOS[c] for c in obs_cols if r[c]), axis=1)
placas = crudo.set_index(crudo['NÚMERO'].astype(str).str.strip())[['VEHÍCULO', 'SEMIREMOLQUE']]
marcados = marcados.join(placas, on='numero')
marcados.loc[~marcados.obs_placa_formato, ['VEHÍCULO', 'SEMIREMOLQUE']] = ''
marcados[['numero', 'fecha', 'archivo', 'fila_excel', 'kg', 'bultos', 'importe_soles', 'kg_por_bulto',
          'soles_por_kg', 'VEHÍCULO', 'SEMIREMOLQUE', 'motivo']].to_csv(DESTINO / 'observaciones.csv', index=False)

df.to_csv(DESTINO / 'manifiestos_limpios.csv', index=False)
pd.DataFrame(resumen).to_csv(DESTINO / 'resumen_archivos.csv', index=False)
agregar_semanal(df).to_csv(DESTINO / 'semanal.csv', index=False)
agregar_semanal(df, 'excluir_regla_app').to_csv(DESTINO / 'semanal_regla_app.csv', index=False)
agregar_diario(df).to_csv(DESTINO / 'diario.csv', index=False)

sem = pd.read_csv(DESTINO / 'semanal.csv')
print(f'Archivos leídos: {len(resumen)} | manifiestos: {len(df)} | excluidos: {int(df.excluir.sum())} '
      f'| con observación: {len(marcados)}')
print(f'Rango: {df.fecha.min():%Y-%m-%d} a {df.fecha.max():%Y-%m-%d} | semanas: {len(sem)} '
      f'| completas: {int(sem.semana_completa.sum())}')
print('Datos guardados en', DESTINO)
