"""Esquema de evaluación temporal (mismo criterio que trainingRun() de la app)."""
from __future__ import annotations
import numpy as np
import pandas as pd
from .modelos import predecir_app, pronostico_multipaso
from .metricas import metricas

UMBRAL_WAPE_APP = 25  # MAX_ACCEPTABLE_WAPE en la app
INICIO_HISTORIAL = 8  # TRAIN_CV_START en la app: primera semana pronosticada en el historial
TOLERANCIA_EMPATE = 0.02  # TIE_TOLERANCE en la app


def particion_app(n: int) -> dict:
    """Divide la serie igual que la app: entrenamiento -> validación (selección) -> prueba (final)."""
    test = min(26, n // 4) if n >= 60 else 0
    val = min(26, int((n - test) * 0.3)) if n >= 60 else min(6, max(0, n - 4))
    t0 = n - test
    v0 = t0 - val
    return {'n': n, 'ini_validacion': v0, 'ini_prueba': t0, 'sem_validacion': val, 'sem_prueba': test}


def un_paso(serie, modelo, inicio, fin):
    """Pronóstico a 1 semana con ventana creciente (origen móvil), como trainingModelEval()."""
    filas = []
    for t in range(max(4, inicio), min(len(serie), fin)):
        p = predecir_app(modelo, serie[:t])
        filas.append({'t': t, 'real': serie[t], 'pronostico': p, 'error': serie[t] - p})
    return pd.DataFrame(filas)


def evaluar_tramo(serie, modelos, inicio, fin):
    filas, errores = [], {}
    for m in modelos:
        df = un_paso(serie, m, inicio, fin)
        errores[m] = df
        filas.append({'modelo': m, **metricas(df['real'], df['pronostico'], train=serie[:inicio])})
    return pd.DataFrame(filas), errores


def multihorizonte(serie, modelo, inicio, fin, H=4):
    """Origen móvil: desde cada semana t se pronostican t, t+1, ..., t+H-1."""
    filas = []
    for t in range(max(4, inicio), fin):
        fc = pronostico_multipaso(modelo, serie[:t], H)
        for h in range(1, H + 1):
            if t + h - 1 < fin:
                filas.append({'origen': t, 'h': h, 'real': serie[t + h - 1], 'pronostico': fc[h - 1]})
    df = pd.DataFrame(filas)
    df['error'] = df['real'] - df['pronostico']
    return df


def intervalos(residuos_val, niveles=(0.80, 0.95)):
    r = np.asarray(residuos_val, float)
    return {lv: (np.quantile(r, (1 - lv) / 2), np.quantile(r, 1 - (1 - lv) / 2)) for lv in niveles}


def particion_v2(n: int) -> dict:
    """Partición de la app mejorada (trainingSplit): ≥60 sem. hasta 26+26; 24–59 sem. 8+8; <24 solo validación."""
    if n >= 60:
        test = min(26, n // 4)
        val = min(26, int((n - test) * 0.3))
        tipo = 'completa'
    elif n >= 24:
        test, val, tipo = 8, 8, 'exploratoria'
    else:
        test, val, tipo = 0, min(6, max(0, n - 4)), 'experimental'
    return {'tipo': tipo, 'n': n, 'sem_entrenamiento': n - test - val, 'sem_validacion': val, 'sem_prueba': test,
            'ini_validacion': n - test - val, 'ini_prueba': n - test}


def seleccionar_modelo(met_validacion: pd.DataFrame, met_historial: pd.DataFrame, modelos) -> str:
    """
    Regla de la app mejorada: menor MAE en validación; si otros modelos están a menos de 2 % de ese MAE,
    gana el que tuvo menor MAE en todo el historial previo a la prueba.
    """
    v = met_validacion[met_validacion.modelo.isin(modelos) & (met_validacion.n >= 4)].sort_values('MAE', kind='stable')
    if v.empty:
        return 'ses'
    empatados = v[v.MAE <= v.MAE.iloc[0] * (1 + TOLERANCIA_EMPATE)].modelo
    h = met_historial.set_index('modelo').MAE
    return min(empatados, key=lambda m: h.get(m, np.inf))


def intervalos_horizonte(serie, modelo, horizonte=4, inicio=INICIO_HISTORIAL):
    """Errores reales del modelo a 1..h semanas en todo el historial → cuantiles 80 % y 95 % (como la app)."""
    df = multihorizonte(serie, modelo, inicio, len(serie), horizonte)
    out = []
    for h in range(1, horizonte + 1):
        e = df[df.h == h].error.to_numpy()
        out.append(None if len(e) < 8 else {
            'q10': float(np.quantile(e, .10)), 'q90': float(np.quantile(e, .90)),
            'q025': float(np.quantile(e, .025)), 'q975': float(np.quantile(e, .975)), 'n': int(len(e))})
    return out
