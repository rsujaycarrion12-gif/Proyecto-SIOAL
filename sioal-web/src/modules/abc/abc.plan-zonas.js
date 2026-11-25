/**
 * Plan automático de ubicación ABC y traslados entre zonas.
 */
'use strict';

function autoZonePlan() {
  const actual = activeItems(),
    rank = abcCurrent(),
    zones = ['A', 'B', 'C'];
  const baseArea = { A: 0, B: 0, C: 0 },
    baseKg = { A: 0, B: 0, C: 0 },
    planned = { A: [], B: [], C: [] };
  const blocked = [],
    recommendations = new Map(),
    reason = new Map(),
    coordinated = new Set();
  const capacities = db.config.capacity || {},
    limits = db.config.maxKg || {},
    eps = 1e-8;
  for (const p of actual) {
    if (zones.includes(p.zone)) {
      baseArea[p.zone] += footprint(p);
      baseKg[p.zone] += Number(p.kg) || 0;
    }
  }
  const area = { ...baseArea },
    kg = { ...baseKg };
  const candidates = actual
    .filter(
      p =>
        p.zone === 'SIN' ||
        (p.status === 'almacen' &&
          zones.includes(p.zone) &&
          rank.map.has(p.id) &&
          p.zone !== rank.map.get(p.id))
    )
    .sort(
      (a, b) =>
        (rank.map.get(a.id) || 'Z').localeCompare(rank.map.get(b.id) || 'Z') ||
        b.kg - a.kg ||
        String(a.code).localeCompare(String(b.code))
    );
  const eligible = [];
  // No ocultar mercancías físicamente registradas cuya clasificación ABC esté suspendida.
  for (const p of actual) {
    if (zones.includes(p.zone) && !rank.map.has(p.id)) {
      const why =
        p.status !== 'almacen'
          ? 'Incidencia pendiente: verificar la mercancía antes de reclasificar'
          : rank.reviewReasons.get(p.id) || 'Peso pendiente de validación ABC';
      blocked.push(p);
      reason.set(p.id, why);
    }
  }
  for (const p of candidates) {
    const z = rank.map.get(p.id),
      from = zones.includes(p.zone) ? p.zone : null;
    let issue = '';
    if (p.status !== 'almacen') issue = 'Incidencia pendiente, mercancía no localizada o sin recepción';
    else if (p.source === 'importado' && !p.receivedAt) issue = 'Recepción física sin confirmar';
    else if (!z) issue = rank.reviewReasons.get(p.id) || 'Peso pendiente de revisión';
    else if (!(p.length > 0 && p.width > 0) || physicalEnvelopeProblem(p))
      issue = 'Faltan medidas válidas o son incompatibles';
    else if (!Number.isSafeInteger(Number(p.qty)) || Number(p.qty) < 1) issue = 'Cantidad de bultos inválida';
    else if (!Number.isFinite(Number(p.kg)) || Number(p.kg) <= 0) issue = 'Peso inválido';
    else if (!(footprint(p) > 0)) issue = 'Superficie no verificable';
    if (issue) {
      blocked.push(p);
      reason.set(p.id, issue);
    } else eligible.push({ p, z, from, f: footprint(p), w: Number(p.kg) });
  }
  const validCap = z => Number.isFinite(Number(capacities[z])) && Number(capacities[z]) > 0;
  const exceeds = z =>
    !validCap(z) ||
    area[z] > Number(capacities[z]) + eps ||
    (Number(limits[z] || 0) > 0 && kg[z] > Number(limits[z]) + eps);
  // Traslados simultáneos: las salidas y las entradas se contabilizan conjuntamente.
  // Si la solución final rebasa un sector, se retiran traslados entrantes hasta volver
  // a una distribución factible; no se promete optimalidad matemática.
  const remaining = new Map(eligible.filter(e => e.from).map(e => [e.p.id, e]));
  const recompute = () => {
    for (const z of zones) {
      area[z] = baseArea[z];
      kg[z] = baseKg[z];
    }
    for (const e of remaining.values()) {
      area[e.from] -= e.f;
      kg[e.from] -= e.w;
      area[e.z] += e.f;
      kg[e.z] += e.w;
    }
  };
  recompute();
  for (let n = 0; n < eligible.length * 3 + 3; n++) {
    const over = zones.filter(exceeds);
    if (!over.length) break;
    // Si ya existe una zona sobreocupada sin traslados entrantes, no es posible
    // arreglarla retirando más movimientos; se dejan sus alertas visibles.
    const candidatesToRemove = [...remaining.values()].filter(e => over.includes(e.z));
    if (!candidatesToRemove.length) break;
    candidatesToRemove.sort(
      (a, b) => b.f - a.f || b.w - a.w || String(a.p.code).localeCompare(String(b.p.code))
    );
    const e = candidatesToRemove[0];
    remaining.delete(e.p.id);
    reason.set(e.p.id, 'Reorganización conjunta no factible con las capacidades actuales');
    blocked.push(e.p);
    recompute();
  }
  // Si ni siquiera los traslados restantes son compatibles, no se anuncian como viables.
  if (zones.some(exceeds)) {
    for (const e of remaining.values()) {
      reason.set(e.p.id, 'Capacidad de una zona ya sobrepasada; revisar mediciones y mercancías');
      blocked.push(e.p);
    }
    remaining.clear();
    recompute();
  }
  for (const e of remaining.values()) {
    recommendations.set(e.p.id, e.z);
    planned[e.z].push(e.p);
    // Este movimiento por sí solo no cabe AHORA; requiere que primero se libere
    // espacio real (o una salida temporal confirmada y segura).
    if (
      baseArea[e.z] + e.f > Number(capacities[e.z]) + eps ||
      (Number(limits[e.z] || 0) > 0 && baseKg[e.z] + e.w > Number(limits[e.z]) + eps)
    )
      coordinated.add(e.p.id);
  }
  // Los bultos nuevos se añaden solo después de comprobar la ocupación FINAL
  // de los traslados. Se mantienen bloqueados si no existe superficie suficiente.
  for (const e of eligible.filter(x => !x.from)) {
    if (!validCap(e.z) || area[e.z] + e.f > Number(capacities[e.z]) + eps) {
      reason.set(e.p.id, 'Sin superficie disponible en zona ' + e.z);
      blocked.push(e.p);
      continue;
    }
    if (Number(limits[e.z] || 0) > 0 && kg[e.z] + e.w > Number(limits[e.z]) + eps) {
      reason.set(e.p.id, 'Límite de peso configurado en zona ' + e.z);
      blocked.push(e.p);
      continue;
    }
    area[e.z] += e.f;
    kg[e.z] += e.w;
    recommendations.set(e.p.id, e.z);
    planned[e.z].push(e.p);
    if (
      baseArea[e.z] + e.f > Number(capacities[e.z]) + eps ||
      (Number(limits[e.z] || 0) > 0 && baseKg[e.z] + e.w > Number(limits[e.z]) + eps)
    )
      coordinated.add(e.p.id);
  }
  // El plan conjunto informa traslados posibles por resultado final, pero la
  // confirmación de CADA movimiento revisa el estado y la ocupación instantánea.
  return {
    rank,
    recommendations,
    planned,
    blocked,
    reason,
    coordinated,
    area,
    kg,
    baseArea,
    baseKg,
    occupancy: counts().occ,
    candidates: candidates.length,
    available: recommendations.size,
    reviewed: blocked.length,
    moves: [...remaining.values()].length,
    requiresStaging: coordinated.size
  };
}

function autoZoneCell(p, plan = autoZonePlan()) {
  if (plan.recommendations.has(p.id)) {
    const z = plan.recommendations.get(p.id),
      moved = p.zone !== 'SIN',
      wait = plan.coordinated.has(p.id);
    if (wait) {
      return (
        `<div style="margin-top:5px">${zoneBadge(z)} <span class="pill orange">Intercambio coordinado</span></div>` +
        `<span class="td-muted">La zona de destino necesita liberarse antes de confirmar.</span>` +
        (moved
          ? `<button class="btn small soft" style="margin-top:5px" data-action="auto-zone-stage" data-id="${esc(p.id)}">Preparar salida temporal</button>`
          : '')
      );
    }
    return (
      `<div style="margin-top:5px">${zoneBadge(z)} <span class="td-muted">${moved ? 'Reubicación sugerida' : 'Zona automática sugerida'}</span></div>` +
      `<button class="btn small green" style="margin-top:5px" data-action="auto-zone-confirm" data-id="${esc(p.id)}">${moved ? 'Confirmar traslado' : 'Confirmar colocación'}</button>`
    );
  }
  const issue = plan.reason.get(p.id);
  if (issue)
    return `<span class="pill orange">Reubicación pendiente</span><span class="td-muted">${esc(issue)}</span>`;
  const klass = plan.rank.map.get(p.id);
  if (['A', 'B', 'C'].includes(p.zone) && !klass)
    return `<span class="pill orange">Ubicación registrada; ABC suspendido</span><span class="td-muted">${esc(plan.rank.reviewReasons.get(p.id) || 'Estado o peso pendiente de verificación')}. Verificar antes de reclasificar.</span>`;
  if (['A', 'B', 'C'].includes(p.zone) && klass && p.zone !== klass)
    return `<span class="pill orange">Fuera de su clase ABC</span><span class="td-muted">Actual: ${esc(p.zone)} · Recomendada: ${esc(klass)}. Sin traslado factible.</span>`;
  if (['A', 'B', 'C'].includes(p.zone))
    return '<span class="td-muted">Ubicación física registrada · coincide con ABC</span>';
  if (['entregado', 'transito', 'pendiente_recepcion'].includes(p.status))
    return '<span class="td-muted">Recepción no confirmada</span>';
  return '<span class="td-muted">Pendiente de revisión</span>';
}

function confirmAutoZone(id) {
  const p = getParcel(id),
    plan = autoZonePlan(),
    z = plan.recommendations.get(id);
  if (!p || !z)
    return notify(
      'La encomienda no tiene una zona factible vigente. Revisa recepción, peso, medidas y capacidad.',
      'error'
    );
  if (plan.coordinated.has(id))
    return notify(
      'Intercambio coordinado: primero libera el sector de destino y vuelve a calcular. No se permiten movimientos que sobreocupen la zona.',
      'error'
    );
  const moving = p.zone !== 'SIN';
  openModal(
    moving ? 'Confirmar traslado físico — Zona ' + z : 'Confirmar ubicación física — Zona ' + z,
    p.code,
    `<p class="sub">SIOAL recomienda la <strong>Zona ${z}</strong> por su peso. ${moving ? `Ubicación anterior: <strong>Zona ${esc(p.zone)}</strong>.` : ''} <strong>No puede comprobar un movimiento físico.</strong> Confirma solo si el trabajador ya colocó realmente la mercancía en ese sector.</p>` +
      `<p class="inline-note">Superficie estimada: ${money(footprint(p))} m² · Peso: ${money(p.kg)} kg. Capacidades de prueba, no medidas físicamente.</p>` +
      `<div class="modal-actions">${btn('modal-close', 'Cancelar')}${btn('auto-zone-commit', 'Confirmar colocación real', 'green', `data-id="${esc(id)}" data-zone="${z}"`)}</div>`
  );
}
function commitAutoZone(id, expected) {
  const p = getParcel(id),
    plan = autoZonePlan(),
    z = plan.recommendations.get(id);
  if (!p || p.status !== 'almacen' || z !== expected || p.zone === z)
    return notify('La recomendación cambió. Recalcula antes de confirmar.', 'error');
  if (plan.coordinated.has(id))
    return notify(
      'No se puede confirmar un traslado conjunto antes de liberar físicamente el espacio.',
      'error'
    );
  if (p.source === 'importado' && !p.receivedAt)
    return notify('Confirma primero la recepción física.', 'error');
  if (weightReviewReason(p)) return notify('Peso pendiente de revisión: ubicación bloqueada.', 'error');
  const from = p.zone;
  const check = validatedAssignment({ [id]: z }, true);
  if (!check.ok)
    return notify('La ubicación ya no es factible: ' + check.problems.slice(0, 2).join(' · '), 'error');
  p.zone = z;
  p.zoneOrigin = 'Clasificación automática ABC; colocación física confirmada por trabajador';
  audit(
    'ubicacion',
    `${p.code}: ${from === 'SIN' ? 'colocación' : 'traslado de ' + from} a Zona ${z} con confirmación física.`
  );
  closeModal();
  updateAutomaticABC();
  render();
  notify(`${p.code}: Zona ${z} confirmada. Se recalcularon las recomendaciones pendientes.`);
}

// Etapa manual, nunca automática: el trabajador certifica que la mercancía YA
// salió del sector y está en un lugar temporal autorizado que no bloquea accesos.
function confirmAutoStage(id) {
  const p = getParcel(id),
    plan = autoZonePlan();
  if (!p || p.status !== 'almacen' || !['A', 'B', 'C'].includes(p.zone) || !plan.coordinated.has(id))
    return notify('Esta encomienda no requiere una salida temporal en el plan vigente.', 'error');
  openModal(
    'Salida temporal para intercambio ABC',
    p.code,
    `<div class="callout">La recomendación final es la Zona ${esc(plan.recommendations.get(id))}, pero ahora está ocupada. No utilices pasillos, salidas, recepción ni zonas de maniobra como almacenamiento temporal. <strong>SIOAL no ha medido la capacidad de un área temporal.</strong></div>` +
      `<p class="sub">Confirma este paso solamente si la encomienda <strong>ya fue retirada físicamente de la Zona ${esc(p.zone)}</strong> y colocada en un lugar autorizado por el responsable.</p>` +
      `<label class="check-row"><input type="checkbox" id="staging-safe-confirm"> Confirmo que está en un espacio temporal seguro y que no bloquea la circulación.</label>` +
      `<div class="modal-actions">${btn('modal-close', 'Cancelar')}${btn('auto-zone-stage-commit', 'Confirmar salida física', 'green', `data-id="${esc(id)}" data-zone="${esc(p.zone)}"`)}</div>`
  );
}
function commitAutoStage(id, originalZone) {
  const p = getParcel(id),
    plan = autoZonePlan();
  if (!document.getElementById('staging-safe-confirm')?.checked)
    return notify('Confirma primero que existe un espacio temporal real y seguro.', 'error');
  if (!p || p.zone !== originalZone || p.status !== 'almacen' || !plan.coordinated.has(id))
    return notify('La operación cambió: recalcula la reorganización.', 'error');
  p.zone = 'SIN';
  p.zoneOrigin = 'Salida temporal física confirmada, sin sector ABC; pendiente de reubicación';
  p.note = (p.note ? p.note + ' · ' : '') + 'Salida temporal confirmada para intercambio ABC: ' + isoDay();
  audit(
    'ubicacion',
    `${p.code}: salida temporal física confirmada desde Zona ${originalZone}; falta colocación definitiva.`
  );
  closeModal();
  updateAutomaticABC();
  render();
  notify(
    'Salida temporal registrada. Recalcula y confirma los demás movimientos físicos en el orden que permita la capacidad.'
  );
}

function autoZoneDashboard(plan = autoZonePlan()) {
  const rows = ['A', 'B', 'C']
    .map(
      z =>
        `<div class="soft-box" style="border-top:4px solid ${capStyle(z)}"><div class="info-label">Zona ${z} · ${z === 'A' ? 'Mayor peso · Izquierda' : z === 'B' ? 'Peso intermedio · Centro' : 'Menor peso · Derecha'}</div><strong style="font-size:22px">${plan.planned[z].length}</strong><p class="sub" style="margin:5px 0 0">Propuestas automáticas · ${plan.occupancy[z].count} ubicaciones registradas</p></div>`
    )
    .join('');
  return (
    `<div class="card card-pad" style="margin:0 0 18px;border:1px solid #d6e9e2"><div class="card-header"><h3>${ic('layers', 18)} Clasificación y distribución automáticas por peso</h3><span class="pill green">Se recalcula con cada cambio</span></div>` +
    `<div class="grid-3">${rows}</div><p class="inline-note"><strong>${plan.available} recomendaciones factibles</strong> (${plan.moves} traslados propuestos, ${plan.requiresStaging} coordinados) y <strong>${plan.reviewed} pendientes de medidas, seguridad o capacidad</strong>. Los intercambios con zonas llenas requieren liberar físicamente espacio antes de confirmar cada traslado. Capacidades estimadas, todavía por medir.</p>` +
    `<div class="flex-row" style="margin-top:13px">${btn('nav', 'Ver mapa y confirmar movimientos', 'primary', 'data-page="mapa"')}${btn('nav', 'Abrir inventario', 'soft', 'data-page="encomiendas"')}</div></div>`
  );
}
