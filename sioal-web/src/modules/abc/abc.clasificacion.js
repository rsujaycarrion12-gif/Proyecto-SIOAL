/**
 * Clasificación ABC por peso: preferencias, revisión de pesos y clases.
 */
'use strict';

/* ===============================================
   CLASIFICACIÓN ABC AUTOMÁTICA POR PESO (v2.2)
   - Categorías por rango de peso, no ABC económico.
   - Las ubicaciones son simulaciones, no posiciones verificadas.
   - Los archivos masivos se clasifican sin guardar datos personales.
   =============================================== */
let abcPlacement = null,
  abcBulk = null,
  abcBulkFilter = 'pending',
  abcBusy = false;
function abcPrefs() {
  if (!db.config.abc)
    db.config.abc = { pctA: 20, pctB: 30, maxKgCheck: TRAIN_WEIGHT_REVIEW_LIMIT_KG, priorityTie: false };
  const v = db.config.abc;
  if (!Number.isFinite(Number(v.pctA))) v.pctA = 20;
  if (!Number.isFinite(Number(v.pctB))) v.pctB = 30;
  if (!Number.isFinite(Number(v.maxKgCheck)) || Number(v.maxKgCheck) <= 0)
    v.maxKgCheck = TRAIN_WEIGHT_REVIEW_LIMIT_KG;
  return v;
}
// AUDITORÍA 14: misma barrera de revisión estadística que Entrenamiento IA.
// No es un máximo físico: una mercancía legítima puede requerir revisión humana.
function sharedWeightReview(items) {
  const candidates = (items || []).filter(
    p =>
      p &&
      Number.isFinite(p.kg) &&
      p.kg > 0 &&
      Number.isSafeInteger(Number(p.qty)) &&
      Number(p.qty) > 0 &&
      p.kg <= sharedReviewWeightKg()
  );
  const fence = trainingStatisticalFence(candidates);
  const reasons = new Map();
  for (const p of items || []) {
    if (!p) continue;
    let reason = trainingWeightAnomaly(Number(p.kg));
    if (!reason && (!Number.isSafeInteger(Number(p.qty)) || Number(p.qty) < 1))
      reason = 'Cantidad de bultos inválida';
    if (!reason && fence && p.kg / p.qty > fence.kgPerParcel)
      reason = `Peso estadísticamente sospechoso: ${round(p.kg / p.qty, 2)} kg/bulto supera ${round(fence.kgPerParcel, 2)} kg/bulto (IQR)`;
    if (reason) reasons.set(p.id, reason);
  }
  return { fence, reasons };
}
function weightReviewReason(p, items = activeItems()) {
  const population = [...(items || []).filter(x => x.id !== p.id), p];
  return sharedWeightReview(population).reasons.get(p.id) || '';
}
function validABCWeight(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= Number(abcPrefs().maxKgCheck);
}
function abcWeightIssue(v) {
  return !Number.isFinite(Number(v)) || Number(v) <= 0
    ? 'Peso vacío, cero o inválido'
    : Number(v) > Number(abcPrefs().maxKgCheck)
      ? 'Peso extremo: revisar'
      : 'Sin incidencia';
}
function classedWeight(items, opts = abcPrefs()) {
  const A = Number(opts.pctA),
    B = Number(opts.pctB),
    map = new Map(),
    stats = { A: { count: 0, kg: 0 }, B: { count: 0, kg: 0 }, C: { count: 0, kg: 0 } };
  const review = sharedWeightReview(items);
  const valid = items.filter(p => !review.reasons.has(p.id));
  valid.sort(
    (a, b) =>
      b.kg - a.kg ||
      (opts.priorityTie ? objectiveWeight(b) - objectiveWeight(a) : 0) ||
      String(a.code || a.id).localeCompare(String(b.code || b.id))
  );
  const aCut = Math.ceil((valid.length * A) / 100),
    bCut = Math.ceil((valid.length * (A + B)) / 100);
  for (let i = 0; i < valid.length;) {
    let j = i + 1;
    while (j < valid.length && valid[j].kg === valid[i].kg) j++;
    const midpoint = (i + j - 1) / 2,
      z = midpoint < aCut ? 'A' : midpoint < bCut ? 'B' : 'C';
    for (let k = i; k < j; k++) {
      const p = valid[k];
      map.set(p.id, z);
      stats[z].count++;
      stats[z].kg += p.kg;
    }
    i = j;
  }
  return {
    map,
    stats,
    reviewReasons: review.reasons,
    statisticalFence: review.fence,
    validCount: valid.length,
    invalidCount: items.length - valid.length,
    total: items.length
  };
}
function updateAutomaticABC() {
  const result = abcCurrent();
  for (const p of db.items) {
    p.abcClass = p.status === 'almacen' ? result.map.get(p.id) || '' : '';
  }
  abcPlacement = null;
  return result;
}

// SIOAL V2.3: Recomendación ABC automática, separada de la ubicación física.
// Planifica solo las encomiendas recibidas, localizadas, con medidas y peso válidos.
// Respeta TODO el espacio ya ocupado; si una clase no tiene cupo, no la fuerza a otra.
// V2.4: plan conjunto de traslados ABC. Primero comprueba la capacidad FINAL,
// luego identifica cuáles requieren liberar una zona mediante un movimiento físico.
// Nunca convierte una simulación en ubicación real sin confirmación humana.
