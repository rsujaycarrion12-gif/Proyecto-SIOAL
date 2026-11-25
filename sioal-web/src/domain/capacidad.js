/**
 * Validación de capacidad física por zona y huella de propuestas.
 */
'use strict';

function physicalEnvelopeProblem(p) {
  const w = Number(p?.width),
    l = Number(p?.length);
  if (!Number.isFinite(w) || !Number.isFinite(l) || w <= 0 || l <= 0) return 'dimensiones sin verificar';
  // Orientación libre: límite NECESARIO, no prueba que la mercancía quepa en un sector.
  const longest = Math.max(w, l),
    shortest = Math.min(w, l);
  if (
    longest > GEOMETRY.length + 1e-9 ||
    shortest > GEOMETRY.operationsWidth + 1e-9 ||
    shortest > GEOMETRY.entranceWidth + 1e-9
  )
    return `dimensiones ${l} × ${w} m incompatibles con largo ${GEOMETRY.length} m, ancho operativo ${GEOMETRY.operationsWidth} m o paso de entrada de ${GEOMETRY.entranceWidth} m (comprobación máxima, pendiente de medición de la puerta)`;
  return '';
}
function validatedAssignment(
  assignment = {},
  strictUnknown = true,
  override = null,
  itemsOverride = null,
  configOverride = null
) {
  const cfg = configOverride || db.config,
    cap = cfg.capacity || {},
    lim = cfg.maxKg || {};
  const totals = {
      A: { area: 0, kg: 0, count: 0 },
      B: { area: 0, kg: 0, count: 0 },
      C: { area: 0, kg: 0, count: 0 }
    },
    problems = [];
  if (!validZoneCapacities(cap))
    problems.push('Capacidades inválidas: comprueba A+B+C y el máximo bruto de referencia.');
  const source = itemsOverride || db.items;
  // Incluye la nueva guía en el cálculo ANTES de guardarla, sin contarla dos veces al editar.
  const candidates = override && !source.some(p => p.id === override.id) ? [...source, override] : source;
  for (const original of candidates) {
    const p = override && original.id === override.id ? override : original;
    if (p.status === 'entregado') continue;
    if (p.status === 'transito' || p.status === 'pendiente_recepcion') {
      if ((Object.prototype.hasOwnProperty.call(assignment, p.id) ? assignment[p.id] : p.zone) !== 'SIN')
        problems.push(`${p.code}: debe confirmarse la recepción antes de asignar zona`);
      continue;
    }
    const z = Object.prototype.hasOwnProperty.call(assignment, p.id) ? assignment[p.id] : p.zone;
    if (z === 'SIN' || z === undefined || z === null) continue;
    if (!['A', 'B', 'C'].includes(z)) {
      problems.push(`${p.code || p.id}: zona incorrecta`);
      continue;
    }
    if (isUnlocated(p)) {
      problems.push(`${p.code || p.id}: mercancía no localizada no puede ocupar zona física`);
      continue;
    }
    const physicalProblem = physicalEnvelopeProblem(p);
    if (physicalProblem) {
      problems.push(`${p.code || p.id}: ${physicalProblem}`);
      continue;
    }
    const area = footprint(p);
    if (!Number.isFinite(area) || area <= 0) {
      if (strictUnknown) problems.push(`${p.code}: faltan medidas para la zona ${z}`);
      continue;
    }
    const kg = Number(p.kg);
    if (!Number.isFinite(kg) || kg <= 0) {
      problems.push(`${p.code}: peso sin verificar`);
      continue;
    }
    totals[z].area += area;
    totals[z].kg += kg;
    totals[z].count++;
  }
  for (const z of ['A', 'B', 'C']) {
    const a = Number(cap[z]),
      k = Number(lim[z] ?? 0);
    if (!Number.isFinite(a) || a <= 0) problems.push(`Zona ${z}: capacidad inválida`);
    else if (totals[z].area > a + 1e-7)
      problems.push(`Zona ${z}: ${round(totals[z].area, 2)} m² supera ${a} m²`);
    if (!Number.isFinite(k) || k < 0) problems.push(`Zona ${z}: límite kg inválido`);
    else if (k > 0 && totals[z].kg > k + 1e-7)
      problems.push(`Zona ${z}: ${round(totals[z].kg, 1)} kg supera ${k} kg`);
  }
  return { ok: problems.length === 0, problems, total: totals };
}

function proposalFingerprint() {
  const items = activeItems()
    .map(p => [
      String(p.id),
      String(p.code),
      p.date,
      p.status,
      p.qty,
      p.kg,
      p.length,
      p.width,
      p.priority,
      p.fragile,
      p.zone
    ])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return JSON.stringify({
    items,
    capacity: db.config.capacity,
    maxKg: db.config.maxKg,
    abc: abcPrefs(),
    geometry: db.config.geometryVersion
  });
}
