/**
 * Entrenamiento IA: modelos de pronóstico, validación temporal y métricas (WAPE).
 */
'use strict';

function trainingPredict(model, hist, h = 1) {
  let data = hist.filter(Number.isFinite);
  let n = data.length;
  if (!n) return 0;
  if (model === 'naive') return Math.max(0, data[n - 1]);
  if (model === 'ma3') {
    let k = data.slice(-3);
    return Math.max(0, k.reduce((a, b) => a + b, 0) / k.length);
  }
  if (model === 'wma3') {
    let k = data.slice(-3),
      weights = [0.2, 0.3, 0.5].slice(-k.length),
      sum = weights.reduce((a, b) => a + b, 0);
    return Math.max(0, k.reduce((a, b, i) => a + b * weights[i], 0) / sum);
  }
  if (model === 'ses') {
    let level = data[0],
      alpha = 0.35;
    for (let i = 1; i < n; i++) level = alpha * data[i] + (1 - alpha) * level;
    return Math.max(0, level);
  }
  if (model === 'ses_opt') {
    // α ∈ {0,05 … 0,95} que minimiza el error cuadrático a 1 paso SOLO con el historial recibido.
    let best = null;
    for (let i = 1; i <= 19; i++) {
      const alpha = Math.round(i * 5) / 100;
      let level = data[0],
        sse = 0;
      for (let j = 1; j < n; j++) {
        sse += (data[j] - level) ** 2;
        level = alpha * data[j] + (1 - alpha) * level;
      }
      if (!best || sse < best.sse) best = { sse, level, alpha };
    }
    return Math.max(0, best.level);
  }
  if (model === 'trend') {
    let a = data.slice(-8),
      N = a.length;
    if (N < 3) return Math.max(0, data[n - 1]);
    let meanx = (N - 1) / 2,
      meany = a.reduce((s, v) => s + v, 0) / N,
      num = a.reduce((s, v, i) => s + (i - meanx) * (v - meany), 0),
      den = a.reduce((s, _, i) => s + (i - meanx) ** 2, 0),
      slope = den ? num / den : 0;
    return Math.max(0, meany + slope * ((N - 1) / 2 + h));
  }
  return Math.max(0, data[n - 1]);
}
function trainingForecastSteps(model, series, horizon, startOffset = 1) {
  let hist = series.slice(),
    future = [];
  for (let h = 1; h < startOffset + horizon; h++) {
    // Semanas parciales al final no son entrenamiento: se proyectan pero no se presentan como observadas.
    let forecast =
      model === 'trend' || model === 'ses' || model === 'ses_opt'
        ? trainingPredict(model, series, h)
        : trainingPredict(model, hist, 1);
    if (h >= startOffset) future.push(round(forecast, 1));
    if (model !== 'trend' && model !== 'ses') hist.push(forecast);
  }
  return future;
}
function trainingModelEval(values, model, startIndex = 4, endIndex = values.length) {
  const res = [];
  for (let t = Math.max(4, startIndex); t < Math.min(values.length, endIndex); t++) {
    const actual = values[t],
      pred = trainingPredict(model, values.slice(0, t));
    if (Number.isFinite(actual) && Number.isFinite(pred)) res.push({ actual, pred, error: actual - pred });
  }
  if (!res.length) return { folds: 0, mae: null, rmse: null, wape: null };
  const abs = res.reduce((sum, v) => sum + Math.abs(v.error), 0);
  const denom = res.reduce((sum, v) => sum + Math.abs(v.actual), 0);
  return {
    folds: res.length,
    mae: abs / res.length,
    rmse: Math.sqrt(res.reduce((sum, v) => sum + v.error * v.error, 0) / res.length),
    wape: denom ? (100 * abs) / denom : null
  };
}

function trainingQuality(data = training) {
  const records = Math.max(1, Number(data.records) || 0),
    bad = Number(data.rejected) || 0,
    duplicates = Number(data.duplicates) || 0;
  const contradictions = Number(data.contradictoryStatus) || 0,
    invalidWeight = Number(data.invalidWeight) || 0,
    invalidQty = Number(data.invalidQty) || 0,
    conflictingOrders = Number(data.conflictingOrders) || 0;
  const fraction = n => n / records;
  const reasons = [];
  if (conflictingOrders)
    reasons.push(
      `${conflictingOrders} números de orden con variantes contradictorias en conciliación; no se utilizan para entrenar.`
    );
  if (fraction(bad + duplicates) > 0.05)
    reasons.push(`Filas descartadas o duplicadas: ${money(fraction(bad + duplicates) * 100)}% (máximo 5%).`);
  if (fraction(duplicates) > 0.02)
    reasons.push(`Duplicados: ${money(fraction(duplicates) * 100)}% (máximo 2%).`);
  if (fraction(contradictions) > 0.005)
    reasons.push(
      `Estados contradictorios/anulados: ${money(fraction(contradictions) * 100, 2)}% (máximo 0,5%).`
    );
  if (fraction(invalidWeight) > 0.01 || fraction(invalidQty) > 0.01)
    reasons.push('Más del 1% de los registros tiene peso o cantidad inválidos.');
  if (Number(data.futureDates || 0) > 0)
    reasons.push(`${data.futureDates} fechas futuras excluidas: requieren revisión antes de validar.`);
  if (Number(data.extremeWeight || 0) > 0)
    reasons.push(`${data.extremeWeight} pesos atípicos en cuarentena, pendientes de verificación humana.`);
  if (data.kind === 'demo' || data.kind === 'demo-registros')
    reasons.push('Datos de demostración: la precisión no está validada para operaciones reales.');
  // Esta aplicación local no tiene verificador independiente. Nunca confiar en sourceVerified de JSON.
  if (true)
    reasons.push(
      'Procedencia SIN verificación externa independiente: el prototipo no certifica datos reales.'
    );
  if (Number(data.reviewThresholdKg) > 0 && Number(data.reviewThresholdKg) !== trainingReviewLimitKg(data))
    reasons.push('Cambió el umbral compartido ABC/IA: vuelve a importar el Excel antes de entrenar.');
  return {
    ok: reasons.length === 0,
    reasons,
    records,
    qualityPercent: Math.max(0, 100 - 100 * fraction(bad + duplicates))
  };
}
// Partición temporal entrenamiento → validación (elige el modelo) → prueba final independiente.
const TRAIN_CV_START = 8; // primera semana pronosticada en el historial (origen móvil)
function trainingSplit(n) {
  if (n >= 60) {
    const test = Math.min(26, Math.floor(n * 0.25)),
      val = Math.min(26, Math.floor((n - test) * 0.3));
    return {
      kind: 'completa',
      testWeeks: test,
      validationWeeks: val,
      testStart: n - test,
      validationStart: n - test - val
    };
  }
  if (n >= 24)
    return {
      kind: 'exploratoria',
      testWeeks: 8,
      validationWeeks: 8,
      testStart: n - 8,
      validationStart: n - 16
    };
  const val = Math.min(6, Math.max(0, n - 4));
  return { kind: 'experimental', testWeeks: 0, validationWeeks: val, testStart: n, validationStart: n - val };
}
// Rangos de predicción empíricos: errores reales del modelo a h semanas en todo el historial (origen móvil).
function trainingIntervals(series, model, predicted, startOffset) {
  if (!predicted.length) return [];
  const horizon = startOffset + predicted.length - 1,
    errs = Array.from({ length: horizon }, () => []);
  for (let t = TRAIN_CV_START; t < series.length; t++) {
    const steps = trainingForecastSteps(model, series.slice(0, t), horizon, 1);
    for (let h = 1; h <= horizon && t + h - 1 < series.length; h++)
      errs[h - 1].push(series[t + h - 1] - steps[h - 1]);
  }
  return predicted.map((f, i) => {
    const e = errs[startOffset + i - 1].slice().sort((a, b) => a - b);
    if (e.length < 8) return null;
    const q = p => quantileSorted(e, p);
    return {
      min80: round(Math.max(0, f + q(0.1)), 1),
      max80: round(f + q(0.9), 1),
      min95: round(Math.max(0, f + q(0.025)), 1),
      max95: round(f + q(0.975), 1),
      n: e.length
    };
  });
}
function trainingRun() {
  if (trainingWeightConfigMismatch()) {
    notify(
      'Cambió el umbral de revisión de peso. Reimporta los datos para aplicar la nueva regla antes de entrenar.',
      'error'
    );
    return;
  }
  const full = trainingFullWeeks();
  if (full.length < 4) {
    notify('Se requieren al menos 4 semanas completas para un análisis exploratorio.', 'error');
    return;
  }
  if (full.some((w, i) => i > 0 && trainingNextWeek(full[i - 1].week) !== w.week)) {
    notify('Existen semanas discontinuas; revisar el histórico antes de evaluar.', 'error');
    return;
  }
  const MAX_ACCEPTABLE_WAPE = 25,
    TIE_TOLERANCE = 0.02,
    fields = ['kg', 'qty', 'orders'],
    results = {};
  const candidate = trainingNextWeek(full.at(-1).week),
    thisWeek = weekStart(isoDay());
  const gapWeeks = Math.max(0, Math.round(trainingDays(candidate, thisWeek) / 7));
  const stale = candidate < thisWeek,
    historicalOnly = gapWeeks > 8;
  const n = full.length;
  // ≥ 60 semanas: hasta 26 + 26. Entre 24 y 59: 8 de validación + 8 de prueba. Menos de 24: solo validación.
  const split = trainingSplit(n),
    { testWeeks, validationWeeks, testStart, validationStart } = split;
  for (const field of fields) {
    const series = full.map(w => Number(w[field]) || 0);
    const ranked = TRAIN_MODELS.map(m => ({
      id: m.id,
      name: m.short,
      ...trainingModelEval(series, m.id, validationStart, testStart),
      history: trainingModelEval(series, m.id, TRAIN_CV_START, testStart)
    }));
    const candidates = ranked
      .filter(r => r.folds >= 4 && Number.isFinite(r.mae) && Number.isFinite(r.wape))
      .sort((a, b) => a.mae - b.mae);
    let choice = candidates[0] || ranked.find(r => r.id === 'ses') || ranked[0];
    // Selección robusta: entre los modelos a menos de 2 % del mejor MAE de validación, se queda el que
    // menos se equivocó en todo el historial previo a la prueba (evita elegir por ruido de pocas semanas).
    if (candidates.length) {
      const tied = candidates.filter(r => r.mae <= candidates[0].mae * (1 + TIE_TOLERANCE));
      choice = tied.sort((a, b) => (a.history.mae ?? Infinity) - (b.history.mae ?? Infinity))[0];
    }
    // La prueba FINAL nunca interviene en la elección del método.
    const holdout = testWeeks
      ? trainingModelEval(series, choice.id, testStart, n)
      : { folds: 0, mae: null, rmse: null, wape: null };
    const accuracyOk = Number.isFinite(holdout.wape) && holdout.wape <= MAX_ACCEPTABLE_WAPE;
    // Una evaluación estadística aprobada NO es validación operativa. Falta certificación externa del origen.
    const validated = false;
    const targetWeek = stale && !historicalOnly ? thisWeek : candidate;
    const startOffset = Math.max(1, Math.round(trainingDays(full.at(-1).week, targetWeek) / 7));
    // El pronóstico vigente se calcula con TODO el historial (entrenamiento + validación + prueba).
    const predicted = historicalOnly ? [] : trainingForecastSteps(choice.id, series, 4, startOffset);
    results[field] = {
      choice: choice.id,
      validated,
      accuracyOk,
      precisionWape: holdout.wape,
      maxAcceptableWape: MAX_ACCEPTABLE_WAPE,
      folds: holdout.folds,
      ranked,
      holdout,
      split: split.kind,
      trainWeeks: validationStart,
      selectionWeeks: validationWeeks,
      testWeeks,
      tieTolerance: TIE_TOLERANCE,
      forecast: predicted,
      intervals: trainingIntervals(series, choice.id, predicted, startOffset),
      series,
      fullWeeks: full.map(w => w.week),
      startOffset: historicalOnly ? 0 : startOffset,
      nextWeek: historicalOnly ? '' : targetWeek,
      stale,
      historicalOnly,
      lastCompleteWeek: full.at(-1).week,
      gapWeeks
    };
  }
  training.trained = {
    at: new Date().toISOString(),
    results,
    kind: {
      completa: 'evaluacion_temporal_separada',
      exploratoria: 'exploratoria_con_prueba',
      experimental: 'experimental'
    }[split.kind],
    split,
    completeWeeks: n,
    quality: trainingQuality(training),
    stale,
    historicalOnly,
    warning:
      'FECHA corresponde a orden, no a recepción física; muestra sintética nunca valida operaciones reales.'
  };
  if (!trainingSave()) {
    render();
    return;
  }
  trainUI.tab = 'modelos';
  render();
  notify(
    Object.values(results).every(r => r.validated)
      ? 'Pruebas temporales completadas. Verifica además origen y cobertura operativa.'
      : 'Resultados PRELIMINARES: revisar atípicos, calidad, prueba final y fecha real de recepción.'
  );
}
