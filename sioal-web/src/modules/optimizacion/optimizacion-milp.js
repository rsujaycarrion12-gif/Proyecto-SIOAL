/**
 * Pantalla: Optimización de ubicaciones (heurística voraz + ramificación y poda).
 */
'use strict';

function objectiveWeight(p) {
  return { alta: 5, media: 2, baja: 1 }[p.priority] || 2;
}
function optimizeAssignments(parcels) {
  const zones = ['A', 'B', 'C'],
    dist = [1, 1.5, 2],
    cap = zones.map(z => Number(db.config.capacity[z]) || 0),
    maxkg = zones.map(z => Number(db.config.maxKg[z]) || 0);
  const n = parcels.length,
    orders = [...parcels];
  const areaOf = p => footprint(p),
    weightOf = p => Number(p.kg) || 0,
    priority = p => objectiveWeight(p);
  const feasible = (p, j, a, k) =>
    !physicalEnvelopeProblem(p) &&
    a[j] + areaOf(p) <= cap[j] + 1e-8 &&
    (!maxkg[j] || k[j] + weightOf(p) <= maxkg[j] + 1e-8);
  const better = (a, b) =>
    !b ||
    a.missing.length < b.missing.length ||
    (a.missing.length === b.missing.length && a.score < b.score - 1e-8);
  const sorters = [
    (a, b) => areaOf(b) - areaOf(a) || priority(b) - priority(a) || weightOf(b) - weightOf(a),
    (a, b) => priority(b) * areaOf(b) - priority(a) * areaOf(a) || areaOf(b) - areaOf(a),
    (a, b) => weightOf(b) - weightOf(a) || areaOf(b) - areaOf(a),
    (a, b) => priority(b) - priority(a) || areaOf(b) - areaOf(a)
  ];
  function greedy(order, mode = 0) {
    const a = [0, 0, 0],
      k = [0, 0, 0],
      assignment = {},
      missing = [];
    let score = 0;
    for (const p of order) {
      let opts = [0, 1, 2].filter(j => feasible(p, j, a, k));
      if (!opts.length) {
        missing.push(p.code);
        continue;
      }
      opts.sort((j, h) => {
        const metric = x =>
          mode === 0
            ? cap[x] - a[x] - areaOf(p)
            : mode === 1
              ? dist[x]
              : mode === 2
                ? maxkg[x] > 0
                  ? (maxkg[x] - k[x] - weightOf(p)) / maxkg[x]
                  : cap[x] - a[x] - areaOf(p)
                : -a[x];
        return metric(j) - metric(h) || dist[j] - dist[h];
      });
      const j = opts[0];
      assignment[p.id] = zones[j];
      a[j] += areaOf(p);
      k[j] += weightOf(p);
      score += priority(p) * dist[j];
    }
    return { assignment, missing, score, area: a, kg: k };
  }
  let best = null;
  for (const sorter of sorters) {
    const order = [...orders].sort((a, b) => sorter(a, b) || String(a.id).localeCompare(String(b.id)));
    for (let m = 0; m < 4; m++) {
      let p = greedy(order, m);
      if (better(p, best)) best = p;
    }
  }
  if (n > 28)
    return {
      ...best,
      method: 'Heurística multiarranque (resultado NO certificado)',
      optimal: false,
      nodes: 0,
      certified: false
    };
  // En conjuntos manejables se prueba además una búsqueda de ramificación y poda.
  const sorted = [...orders].sort(
    (a, b) => areaOf(b) - areaOf(a) || weightOf(b) - weightOf(a) || priority(b) - priority(a)
  );
  const used = [0, 0, 0],
    usedkg = [0, 0, 0],
    picked = {},
    suffixArea = Array(n + 1).fill(0),
    suffixWeight = Array(n + 1).fill(0),
    suffixCost = Array(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    suffixArea[i] = suffixArea[i + 1] + areaOf(sorted[i]);
    suffixWeight[i] = suffixWeight[i + 1] + weightOf(sorted[i]);
    suffixCost[i] = suffixCost[i + 1] + priority(sorted[i]);
  }
  let nodes = 0,
    cut = false;
  const limit = 350000;
  function dfs(i, score) {
    if (++nodes > limit) {
      cut = true;
      return;
    }
    if (suffixArea[i] > cap.reduce((t, c, j) => t + Math.max(0, c - used[j]), 0) + 1e-8) return;
    if (
      maxkg.every(k => k > 0) &&
      suffixWeight[i] > maxkg.reduce((t, c, j) => t + Math.max(0, c - usedkg[j]), 0) + 1e-8
    )
      return;
    if (best?.missing.length === 0 && score + suffixCost[i] * dist[0] >= best.score - 1e-8) return;
    if (i === n) {
      best = { assignment: { ...picked }, missing: [], score, area: [...used], kg: [...usedkg] };
      return;
    }
    const p = sorted[i];
    const opts = [0, 1, 2]
      .filter(j => feasible(p, j, used, usedkg))
      .sort((a, b) => dist[a] - dist[b] || cap[a] - used[a] - (cap[b] - used[b]));
    const symmetric = new Set();
    for (const j of opts) {
      const fingerprint = `${Math.round((cap[j] - used[j]) * 100000)}:${maxkg[j] > 0 ? Math.round((maxkg[j] - usedkg[j]) * 100000) : 'libre'}:${dist[j]}`;
      if (symmetric.has(fingerprint)) continue;
      symmetric.add(fingerprint);
      used[j] += areaOf(p);
      usedkg[j] += weightOf(p);
      picked[p.id] = zones[j];
      dfs(i + 1, score + priority(p) * dist[j]);
      used[j] -= areaOf(p);
      usedkg[j] -= weightOf(p);
      delete picked[p.id];
      if (cut) return;
    }
  }
  dfs(0, 0);
  return {
    ...best,
    method: cut
      ? 'Búsqueda acotada y heurística (no certificada)'
      : 'Búsqueda completa por ramificación y poda',
    optimal: !cut && best.missing.length === 0,
    nodes,
    certified: !cut
  };
}

function previewOptimize() {
  const plan = autoZonePlan();
  const missing = plan.blocked.filter(p => !p.width || !p.length).map(p => p.code);
  const assignment = Object.fromEntries(plan.recommendations);
  ui.proposal = {
    assignment,
    missing: plan.blocked.filter(p => !missing.includes(p.code)).map(p => p.code),
    missingDims: missing,
    score: [...plan.recommendations].reduce((sum, [id, z]) => {
      const p = getParcel(id);
      return sum + (p ? objectiveWeight(p) * ({ A: 1, B: 1.5, C: 2 }[z] || 0) : 0);
    }, 0),
    method: 'Planificación automática por clases ABC y capacidad (NO es un solucionador MILP exacto)',
    count: Object.keys(assignment).length,
    baseCount: plan.candidates,
    generatedOn: isoDay(),
    signature: proposalFingerprint()
  };
  render();
  notify(
    `Propuesta automática calculada: ${plan.available} zonas recomendadas, ${plan.reviewed} en revisión. No se asignarán ubicaciones ficticias.`
  );
}
function approveOptimize() {
  const prop = ui.proposal;
  if (!prop) return notify('Calcula antes una propuesta.', 'error');
  if (prop.signature !== proposalFingerprint()) {
    ui.proposal = null;
    render();
    return notify('La propuesta quedó desactualizada; vuelve a calcular.', 'error');
  }
  ui.proposal = null;
  go('mapa');
  notify(
    'Se han mostrado las zonas recomendadas. Un trabajador debe confirmar cada colocación física desde el mapa.'
  );
}
function renderOptimize() {
  let c = counts(),
    p = ui.proposal;
  let missing = activeItems().filter(x => !x.width || !x.length).length;
  return `${head('Optimización de ubicaciones', 'Asignación por zonas A izquierda, B centro y C derecha, con capacidades editables.', btn('optimize-run', ic('spark') + ' Calcular propuesta', 'primary'))}${abcOptimizationNotice()}<div class="plan-grid"><div><div class="card card-pad"><div class="card-header"><h3>Configuración de capacidades y restricciones</h3><span class="model-chip">${ic('sliders', 15)} Asignación tipo MILP</span></div><div class="callout blue" style="margin-bottom:17px">El optimizador bloquea propuestas si existen pesos sospechosos aún por revisar. El modelo asigna encomiendas a los sectores laterales A, B o C; no calcula posiciones exactas en estanterías ni apilamiento. Las capacidades por zona son supuestos configurables. En el plano real todavía no se ha medido la superficie útil de A, B y C.</div><form id="capacityForm"><div class="table-scroll"><table><thead><tr><th>Zona</th><th>Superficie física</th><th>Capacidad útil (m²)</th><th>Límite kg (opcional)</th></tr></thead><tbody>${['A', 'B', 'C'].map(z => `<tr><td>${zoneBadge(z)}</td><td>Por medir</td><td><input aria-label="Capacidad ${z}" type="number" min="0.1" max="165" step="0.1" name="c${z}" value="${db.config.capacity[z]}" style="max-width:112px" class="search-input"></td><td><input aria-label="Límite de peso ${z}" type="number" min="0" step="1" name="w${z}" value="${db.config.maxKg[z] || ''}" placeholder="Sin validar" style="max-width:120px" class="search-input"></td></tr>`).join('')}</tbody></table></div><div style="display:flex;justify-content:flex-end;margin:16px 0 0"><button class="btn soft" type="submit">${ic('check')} Guardar parámetros</button></div></form><div class="section-sep"></div><h3 style="font-size:14px;margin-bottom:13px">Función objetivo</h3><div class="soft-box mono" style="font-size:13px;color:#684b63;overflow:auto">Min Z = Σ prioridadᵢ · índiceABC_z · xᵢz</div><div class="steps" style="margin-top:16px"><div class="step"><span class="step-no">01</span><div><strong>Una zona por encomienda</strong><p class="sub">La variable xᵢz es 0 o 1.</p></div></div><div class="step"><span class="step-no">02</span><div><strong>Respetar la capacidad configurada</strong><p class="sub">Superficie estimada de bultos ≤ capacidad de cada zona.</p></div></div><div class="step"><span class="step-no">03</span><div><strong>Mantener accesos despejados</strong><p class="sub">Se excluyen recepción, baño, pasadizo a otra casa, circulación y maniobras.</p></div></div></div></div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Distribución por sectores ABC</h3></div>${zoneBars()}${btn('nav', ic('map') + ' Abrir mapa', 'soft', 'data-page="mapa"')}</div></div><div><div class="card card-pad"><div class="card-header"><h3>Escenario de optimización</h3><span class="pill wine">${activeItems().length} activos</span></div><div class="detail-list"><div class="detail-row"><span>Encomiendas con medidas</span><strong>${activeItems().length - missing}</strong></div><div class="detail-row"><span>Sin dimensiones</span><strong>${missing}</strong></div><div class="detail-row"><span>Capacidad simulada total</span><strong>${money(Object.values(db.config.capacity).reduce((a, b) => a + nval(b), 0))} m²</strong></div><div class="detail-row"><span>Priorización de acceso</span><strong>Alta / media / baja</strong></div></div><div style="margin-top:20px">${btn('optimize-run', ic('spark') + ' Calcular nueva distribución', 'primary', 'style="width:100%"')}</div></div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Resultado propuesto</h3>${p ? `<span class="pill ${p.missing.length ? 'red' : 'green'}">${p.missing.length || p.missingDims.length ? 'Con restricciones' : 'Calculado'}</span>` : ''}</div>${
    p
      ? `<p class="sub">${esc(p.method)}</p><div class="soft-box"><div class="info-label">Índice ponderado de las ubicaciones propuestas</div><strong style="font-size:23px">${money(p.score)}</strong><div class="sub">Σ prioridad × índice de zona (A=1, B=1,5, C=2), solo para propuestas. No es un óptimo certificado ni mide distancias reales</div></div><div class="section-sep"></div>${[
          'A',
          'B',
          'C'
        ]
          .map(z => {
            let n = Object.values(p.assignment).filter(x => x === z).length;
            return `<div class="metric-line"><span>${zoneBadge(z)}</span><strong>${n} encomiendas</strong></div>`;
          })
          .join(
            ''
          )}<div class="metric-line"><span>Movimientos coordinados (liberar espacio primero)</span><strong>${autoZonePlan().requiresStaging}</strong></div><div class="metric-line"><span>Sin ubicar por capacidad</span><strong>${p.missing.length}</strong></div><div class="metric-line"><span>Sin medidas</span><strong>${p.missingDims.length}</strong></div><div style="margin-top:16px">${btn('optimize-approve', ic('check') + ' Ver recomendaciones en el mapa', 'primary', `style="width:100%" ${p.missing.length || p.missingDims.length ? 'disabled' : ''}`)}</div><p class="inline-note">La propuesta se recalcula automáticamente y NO modifica las ubicaciones físicas sin confirmación. Para hasta 28 encomiendas se intenta búsqueda por ramificación y poda con límite de nodos; con más, una heurística. Los resultados no siempre son óptimos y no constituyen un MILP industrial.</p>`
      : `<div class="empty"><div class="empty-icon">${ic('sliders', 22)}</div><strong>Aún no hay propuesta</strong><p>Configura capacidades y pulsa Calcular propuesta para ver asignaciones.</p></div>`
  }</div></div></div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Vista preliminar de las ubicaciones</h3></div><div class="table-scroll"><table><thead><tr><th>Encomienda</th><th>Prioridad</th><th>Huella</th><th>Actual</th><th>Propuesta</th></tr></thead><tbody>${activeItems()
    .slice(0, 60)
    .map(
      x =>
        `<tr><td><strong>${esc(x.code)}</strong><span class="td-muted">${esc(x.recipient)}</span></td><td><span class="pill ${x.priority === 'alta' ? 'red' : x.priority === 'baja' ? 'blue' : 'orange'}">${esc(x.priority)}</span></td><td>${footprint(x) ? money(footprint(x)) + ' m²' : 'Sin medidas'}</td><td>${zoneBadge(x.zone)}</td><td>${p && p.assignment[x.id] ? zoneBadge(p.assignment[x.id]) : '<span class="muted">—</span>'}</td></tr>`
    )
    .join('')}</tbody></table></div></div>`;
}
