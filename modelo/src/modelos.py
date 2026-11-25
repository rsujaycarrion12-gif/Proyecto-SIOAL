"""
Modelos de pronóstico semanal.

Parte 1 — RÉPLICA EXACTA de los 5 modelos de la app SIOAL
(sioal-web/src/modules/entrenamiento/entrenamiento.modelos.js, función trainingPredict).

Parte 2 — SES con α optimizado (incorporado a la app v2) y modelos de REFERENCIA que no están
en la app: estacional ingenuo (52 semanas) y Holt.
"""
from __future__ import annotations
import numpy as np

# ---------------------------------------------------------------- Parte 1: modelos de la app
MODELOS_APP_V1 = {  # app original (5 modelos)
    'naive': 'Último valor (persistencia)',
    'ma3': 'Media móvil (3)',
    'wma3': 'Media ponderada (0,5/0,3/0,2)',
    'ses': 'Suavización exponencial α=0,35',
    'trend': 'Tendencia lineal (últimas 8)',
}
# App mejorada (v2): agrega la suavización exponencial con α optimizado
MODELOS_APP = {**MODELOS_APP_V1, 'ses_opt': 'Suavización exponencial α óptimo'}


def predecir_app(modelo: str, hist, h: int = 1) -> float:
    """Pronóstico a h pasos con la misma lógica que trainingPredict() de la app."""
    data = [float(v) for v in hist if np.isfinite(v)]
    n = len(data)
    if not n:
        return 0.0
    if modelo == 'naive':
        return max(0.0, data[-1])
    if modelo == 'ma3':
        k = data[-3:]
        return max(0.0, sum(k) / len(k))
    if modelo == 'wma3':
        k = data[-3:]
        w = [0.2, 0.3, 0.5][-len(k):]
        return max(0.0, sum(a * b for a, b in zip(k, w)) / sum(w))
    if modelo == 'ses':
        level, alpha = data[0], 0.35
        for v in data[1:]:
            level = alpha * v + (1 - alpha) * level
        return max(0.0, level)
    if modelo == 'trend':
        a = data[-8:]
        N = len(a)
        if N < 3:
            return max(0.0, data[-1])
        mx, my = (N - 1) / 2, sum(a) / N
        num = sum((i - mx) * (v - my) for i, v in enumerate(a))
        den = sum((i - mx) ** 2 for i in range(N))
        slope = num / den if den else 0.0
        return max(0.0, my + slope * ((N - 1) / 2 + h))
    if modelo == 'ses_opt' or modelo in MODELOS_REF:
        return predecir_ref(modelo, data, h)
    return max(0.0, data[-1])


def pronostico_multipaso(modelo: str, serie, horizonte: int):
    """Igual que trainingForecastSteps(): trend/ses usan h directo; el resto es recursivo."""
    hist, out = list(serie), []
    for h in range(1, horizonte + 1):
        if modelo in ('trend', 'ses', 'ses_opt') or modelo in MODELOS_REF:
            f = predecir_app(modelo, serie, h)
        else:
            f = predecir_app(modelo, hist, 1)
            hist.append(f)
        out.append(f)
    return out


# ---------------------------------------------------------------- Parte 2: referencias
MODELOS_REF = {
    'snaive52': 'Estacional ingenuo (misma semana del año anterior)',
    'holt': 'Holt (nivel + tendencia, α y β optimizados)',
}


def _ses_sse(data, alpha):
    level, sse = data[0], 0.0
    for v in data[1:]:
        sse += (v - level) ** 2
        level = alpha * v + (1 - alpha) * level
    return sse, level


def _holt(data, alpha, beta, h=1):
    if len(data) < 2:
        return data[-1], 0.0
    level, trend, sse = data[0], data[1] - data[0], 0.0
    for v in data[1:]:
        f = level + trend
        sse += (v - f) ** 2
        new_level = alpha * v + (1 - alpha) * (level + trend)
        trend = beta * (new_level - level) + (1 - beta) * trend
        level = new_level
    return level + h * trend, sse


_GRID = np.round(np.arange(0.05, 1.0, 0.05), 2)


def predecir_ref(modelo, data, h=1):
    data = list(data)
    if modelo == 'snaive52':
        return max(0.0, data[-52 + ((h - 1) % 52)] if len(data) >= 52 else data[-1])
    if modelo == 'ses_opt':
        best = min(_GRID, key=lambda a: _ses_sse(data, a)[0])
        return max(0.0, _ses_sse(data, best)[1])
    if modelo == 'holt':
        best = min(((a, b) for a in _GRID for b in (0.01, 0.05, 0.1, 0.2, 0.3)),
                   key=lambda ab: _holt(data, *ab)[1])
        return max(0.0, _holt(data, *best, h=h)[0])
    raise ValueError(modelo)


def alpha_optimo(data) -> float:
    """α ∈ {0,05 … 0,95} que minimiza el error a 1 paso en el historial (igual que la app)."""
    return float(min(_GRID, key=lambda a: _ses_sse(list(data), a)[0]))


TODOS = {**MODELOS_APP, **MODELOS_REF}
