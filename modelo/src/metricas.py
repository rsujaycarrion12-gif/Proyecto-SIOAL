"""Métricas de error y pruebas estadísticas (solo numpy + math, sin scipy)."""
from __future__ import annotations
import math
import numpy as np


def metricas(real, pred, train=None, m: int = 1) -> dict:
    """
    MAE, RMSE, MAPE, sMAPE, WAPE, Sesgo, MASE, R² y U de Theil.
    error = real − pronóstico (positivo = el modelo se quedó corto).
    """
    y, f = np.asarray(real, float), np.asarray(pred, float)
    e = y - f
    n = len(e)
    if n == 0:
        return {k: np.nan for k in ['n', 'MAE', 'RMSE', 'MAPE_%', 'sMAPE_%', 'WAPE_%', 'Sesgo', 'Sesgo_%', 'MASE', 'R2', 'U_Theil']}
    mae = np.mean(np.abs(e))
    out = {
        'n': n,
        'MAE': mae,
        'RMSE': math.sqrt(np.mean(e ** 2)),
        'MAPE_%': 100 * np.mean(np.abs(e[y != 0] / y[y != 0])) if np.any(y != 0) else np.nan,
        'sMAPE_%': 100 * np.mean(2 * np.abs(e) / (np.abs(y) + np.abs(f) + 1e-12)),
        'WAPE_%': 100 * np.sum(np.abs(e)) / np.sum(np.abs(y)) if np.sum(np.abs(y)) else np.nan,
        'Sesgo': np.mean(e),
        'Sesgo_%': 100 * np.sum(e) / np.sum(y) if np.sum(y) else np.nan,
    }
    if train is not None and len(train) > m:
        tr = np.asarray(train, float)
        escala = np.mean(np.abs(tr[m:] - tr[:-m]))
        out['MASE'] = mae / escala if escala else np.nan
    else:
        out['MASE'] = np.nan
    ss_tot = np.sum((y - y.mean()) ** 2)
    out['R2'] = 1 - np.sum(e ** 2) / ss_tot if ss_tot else np.nan
    # U de Theil (U2): <1 mejor que el ingenuo, >1 peor
    if n > 1:
        naive_err = y[1:] - y[:-1]
        num, den = np.sum(e[1:] ** 2), np.sum(naive_err ** 2)
        out['U_Theil'] = math.sqrt(num / den) if den else np.nan
    else:
        out['U_Theil'] = np.nan
    return out


def _norm_sf(z):
    return 0.5 * math.erfc(z / math.sqrt(2))


def _chi2_sf(x, k):
    """Aproximación de Wilson–Hilferty para P(X² > x)."""
    if x <= 0:
        return 1.0
    z = ((x / k) ** (1 / 3) - (1 - 2 / (9 * k))) / math.sqrt(2 / (9 * k))
    return _norm_sf(z)


def autocorrelacion(e, lag):
    e = np.asarray(e, float) - np.mean(e)
    den = np.sum(e ** 2)
    return float(np.sum(e[lag:] * e[:-lag]) / den) if den and len(e) > lag else np.nan


def ljung_box(e, lags: int = 4) -> dict:
    """H0: los residuos son ruido blanco (no queda patrón por explicar)."""
    n = len(e)
    q = n * (n + 2) * sum(autocorrelacion(e, k) ** 2 / (n - k) for k in range(1, lags + 1))
    return {'Q': q, 'p_valor': _chi2_sf(q, lags)}


def diebold_mariano(e1, e2, h: int = 1) -> dict:
    """
    Compara dos modelos (pérdida cuadrática). H0: igual precisión.
    estadístico < 0 → el modelo 1 es mejor.
    """
    d = np.asarray(e1, float) ** 2 - np.asarray(e2, float) ** 2
    n = len(d)
    dbar = d.mean()
    gamma = [np.mean((d[k:] - dbar) * (d[:n - k] - dbar)) for k in range(h)]
    var = (gamma[0] + 2 * sum(gamma[1:])) / n
    if var <= 0:
        return {'DM': np.nan, 'p_valor': np.nan}
    dm = dbar / math.sqrt(var)
    return {'DM': dm, 'p_valor': 2 * _norm_sf(abs(dm))}
