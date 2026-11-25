"""
Motor vectorizado de pronóstico a 1 paso (origen móvil, ventana creciente).

Reproduce EXACTAMENTE la lógica de `modelos.predecir_app` / `predecir_ref` (y por tanto de la app SIOAL),
pero calcula a la vez miles de series: Y tiene forma (R, T) y cada modelo devuelve F (R, T) con
F[:, t] = pronóstico de Y[:, t] usando solo Y[:, :t]. Antes de t = 4 el valor es NaN (la app empieza en 4).

La equivalencia con la versión escalar se verifica en `tests_vectorial()`.
"""
from __future__ import annotations
import numpy as np

GRID = np.round(np.arange(0.05, 1.0, 0.05), 2)          # mismo grid que la app
BETAS = np.array([0.01, 0.05, 0.1, 0.2, 0.3])           # mismo grid de Holt que modelos.py
T0 = 4                                                  # primera semana pronosticada (app)
MODELOS = ['naive', 'ma3', 'wma3', 'ses', 'ses_opt', 'trend', 'holt', 'snaive52']


def _clip(F):
    return np.where(np.isnan(F), np.nan, np.maximum(F, 0.0))


def _ses_niveles(Y, alphas):
    """Nivel tras observar Y[:, :t] para cada α → (R, A, T+1); y SSE acumulado del prefijo → (R, A, T+1)."""
    R, T = Y.shape
    A = len(alphas)
    a = np.asarray(alphas)[None, :]
    L = np.full((R, A, T + 1), np.nan)
    S = np.zeros((R, A, T + 1))
    lvl = np.repeat(Y[:, :1], A, axis=1)               # nivel inicial = primer dato
    L[:, :, 1] = lvl
    sse = np.zeros((R, A))
    for k in range(1, T):
        v = Y[:, k:k + 1]
        sse = sse + (v - lvl) ** 2
        lvl = a * v + (1 - a) * lvl
        L[:, :, k + 1] = lvl
        S[:, :, k + 1] = sse
    return L, S


def _holt(Y):
    """Holt con el mismo grid (α-mayor, luego β) y la misma inicialización que modelos._holt."""
    R, T = Y.shape
    pares = [(a, b) for a in GRID for b in BETAS]
    al = np.array([p[0] for p in pares])[None, :]
    be = np.array([p[1] for p in pares])[None, :]
    P = len(pares)
    F = np.full((R, T), np.nan)
    if T < 2:
        return F
    lvl = np.repeat(Y[:, :1], P, axis=1)
    tr = np.repeat(Y[:, 1:2] - Y[:, :1], P, axis=1)
    sse = np.zeros((R, P))
    # pronóstico en el origen t usa data = Y[:, :t]; con t = 1 la app devuelve el último valor
    for k in range(1, T):
        v = Y[:, k:k + 1]
        f = lvl + tr
        sse = sse + (v - f) ** 2
        nl = al * v + (1 - al) * (lvl + tr)
        tr = be * (nl - lvl) + (1 - be) * tr
        lvl = nl
        t = k + 1                                        # ya se observó Y[:, :t]
        if t < T:
            best = np.argmin(sse, axis=1)                # primer mínimo, igual que min() de Python
            F[:, t] = (lvl + tr)[np.arange(R), best]
    return F


def pronosticos(Y, modelos=MODELOS):
    Y = np.asarray(Y, float)
    R, T = Y.shape
    out = {}
    idx = np.arange(T)
    if 'naive' in modelos:
        F = np.full((R, T), np.nan); F[:, 1:] = Y[:, :-1]; out['naive'] = F
    if 'ma3' in modelos or 'wma3' in modelos:
        Fm = np.full((R, T), np.nan); Fw = np.full((R, T), np.nan)
        w = np.array([0.2, 0.3, 0.5])
        for t in range(1, T):
            k = Y[:, max(0, t - 3):t]
            Fm[:, t] = k.mean(axis=1)
            ww = w[-k.shape[1]:]
            Fw[:, t] = (k * ww).sum(axis=1) / ww.sum()
        out['ma3'], out['wma3'] = Fm, Fw
    if 'ses' in modelos or 'ses_opt' in modelos:
        L, S = _ses_niveles(Y, GRID)
        i35 = int(np.where(np.isclose(GRID, 0.35))[0][0])
        Fs = np.full((R, T), np.nan); Fo = np.full((R, T), np.nan)
        for t in range(1, T):
            Fs[:, t] = L[:, i35, t]
            b = np.argmin(S[:, :, t], axis=1)
            Fo[:, t] = L[np.arange(R), b, t]
        out['ses'], out['ses_opt'] = Fs, Fo
    if 'trend' in modelos:
        F = np.full((R, T), np.nan)
        for t in range(1, T):
            a = Y[:, max(0, t - 8):t]
            N = a.shape[1]
            if N < 3:
                F[:, t] = Y[:, t - 1]; continue
            x = np.arange(N) - (N - 1) / 2
            my = a.mean(axis=1)
            slope = (a * x).sum(axis=1) / (x ** 2).sum()     # Σ(x-mx)(y-my) = Σ(x-mx)·y
            F[:, t] = my + slope * ((N - 1) / 2 + 1)
        out['trend'] = F
    if 'holt' in modelos:
        F = _holt(Y); F[:, 1] = Y[:, 0]; out['holt'] = F
    if 'snaive52' in modelos:
        F = np.full((R, T), np.nan)
        for t in range(1, T):
            F[:, t] = Y[:, t - 52] if t >= 52 else Y[:, t - 1]
        out['snaive52'] = F
    for m in out:
        out[m] = _clip(out[m])
        out[m][:, :T0] = np.nan
    return out


# ------------------------------------------------------------------ regla de selección de la app
def particion(n):
    """trainingSplit de la app (= evaluacion.particion_v2)."""
    if n >= 60:
        test = min(26, n // 4); val = min(26, int((n - test) * 0.3))
    elif n >= 24:
        test, val = 8, 8
    else:
        test, val = 0, min(6, max(0, n - 4))
    return n - test - val, n - test                     # [ini_validación, ini_prueba)


def seleccion_app(Y, F, H, candidatos, tol=0.02, inicio_hist=8):
    """
    Para cada serie elige un modelo con la regla de la app usando SOLO las primeras H semanas:
    menor MAE en validación; empates (≤ 2 %) se rompen con el menor MAE del historial (sem. 8 → ini_prueba).
    Devuelve el índice del modelo elegido en `candidatos` → (R,).
    """
    v0, v1 = particion(H)
    v0 = max(T0, v0)
    R = Y.shape[0]
    mv = np.stack([np.nanmean(np.abs(Y[:, v0:v1] - F[m][:, v0:v1]), axis=1) for m in candidatos], axis=1)
    h0 = min(inicio_hist, v1)
    mh = np.stack([np.nanmean(np.abs(Y[:, h0:v1] - F[m][:, h0:v1]), axis=1) if v1 > h0
                   else np.full(R, np.inf) for m in candidatos], axis=1)
    mh = np.where(np.isnan(mh), np.inf, mh)
    # orden estable por MAE de validación, como sort_values(kind='stable')
    best = np.nanmin(mv, axis=1, keepdims=True)
    empate = mv <= best * (1 + tol)
    mh_emp = np.where(empate, mh, np.inf)
    elegido = np.argmin(mh_emp, axis=1)
    # si todos los empatados tienen historial inf, min() de Python devuelve el primero en orden de MAE
    todos_inf = np.all(~np.isfinite(mh_emp), axis=1)
    if todos_inf.any():
        orden = np.argsort(mv, axis=1, kind='stable')[:, 0]
        elegido = np.where(todos_inf, orden, elegido)
    return elegido


def tests_vectorial(seed=7, R=6, T=70):
    """Compara contra la implementación escalar (modelos.predecir_app) y la regla de evaluacion.py."""
    import pandas as pd
    from .modelos import predecir_app
    from .evaluacion import seleccionar_modelo
    rng = np.random.default_rng(seed)
    Y = 100 * np.exp(np.cumsum(rng.normal(0, .05, (R, T)), axis=1)) * (1 + rng.normal(0, .2, (R, T)))
    Y = np.maximum(Y, 0)
    F = pronosticos(Y)
    err = 0.0
    for m in MODELOS:
        for r in range(R):
            for t in range(T0, T):
                f = predecir_app(m, list(Y[r, :t]))
                err = max(err, abs(f - F[m][r, t]))
    # regla de selección
    cand = ['naive', 'ma3', 'wma3', 'ses', 'ses_opt', 'trend']
    malas = 0
    for H in (8, 12, 30, 64):
        sel = seleccion_app(Y[:, :H], {m: F[m][:, :H] for m in cand}, H, cand)
        v0, v1 = particion(H); v0 = max(T0, v0)
        for r in range(R):
            mv = pd.DataFrame([{'modelo': m, 'MAE': np.mean(np.abs(Y[r, v0:v1] - F[m][r, v0:v1])), 'n': v1 - v0}
                               for m in cand])
            mh = pd.DataFrame([{'modelo': m, 'MAE': np.mean(np.abs(Y[r, 8:v1] - F[m][r, 8:v1])) if v1 > 8 else np.inf}
                               for m in cand])
            if cand[sel[r]] != seleccionar_modelo(mv, mh, cand):
                malas += 1
    return err, malas
