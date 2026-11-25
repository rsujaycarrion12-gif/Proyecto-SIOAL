/**
 * Pantalla: Panel de control (dashboard).
 */
'use strict';

function zoneBars() {
  let c = counts(),
    html = '';
  for (let z of ['A', 'B', 'C']) {
    let d = c.occ[z],
      p = Math.max(0, d.percent);
    html += `<div class="zone-row"><div class="zone-name">Zona ${z}</div><div class="zone-track"><span style="width:${Math.min(100, p)}%;background:${capStyle(z)}"></span></div><div class="zone-percent">${money(p)}%</div></div><div class="zone-foot" style="margin:-8px 0 12px 82px"><span>${money(d.area)} m² asignados</span><span>${money(d.cap)} m² útiles (supuesto)</span></div>`;
  }
  return html;
}
function lastActivity(limit = 5) {
  return (
    db.activity
      .slice(0, limit)
      .filter(a => a && typeof a === 'object')
      .map(
        a =>
          `<div class="alert-item"><div class="alert-dot info">${ic(a.type === 'entrega' ? 'check' : a.type === 'optimizacion' ? 'sliders' : 'clipboard', 16)}</div><div><strong>${esc(a.desc)}</strong><p>${esc(a.actor)} · ${esc(String(a?.at ?? '').slice(0, 10))}</p></div></div>`
      )
      .join('') || '<p class="sub">Todavía no hay cambios.</p>'
  );
}
function alertList(limit = 4) {
  let items = alerts().slice(0, limit);
  return items.length
    ? items
        .map(
          a =>
            `<div class="alert-item"><div class="alert-dot ${a.level === 'danger' ? 'danger' : a.level === 'info' ? 'info' : ''}">${ic(a.level === 'danger' ? 'bell' : 'info', 16)}</div><div style="flex:1"><button class="hotspot-tag" data-action="nav" data-page="${a.page}"><strong>${esc(a.title)}</strong></button><p>${esc(a.desc)}</p></div></div>`
        )
        .join('')
    : '<div class="callout green">No hay alertas activas para los parámetros actuales.</div>';
}
function renderDashboard() {
  let c = counts(),
    maxOcc = Math.max(...['A', 'B', 'C'].map(z => c.occ[z].percent));
  return `${head('Control inteligente de almacén', 'Una visión clara de encomiendas, espacios y movimientos.', btn('new', '' + ic('plus', 16) + ' Registrar encomienda', 'primary') + btn('nav', '' + ic('map', 16) + ' Ver mapa', 'secondary', 'data-page="mapa"') + btn('nav', ic('layers', 16) + ' ABC por peso', 'secondary', 'data-page="abc"') + btn('nav', ic('spark', 16) + ' Entrenamiento IA', 'secondary', 'data-page="entrenamiento"'))}<div class="kpi-grid">${kpi('En almacén', money(c.active, 0), 'Registros activos', 'box')}${kpi('Bultos registrados', money(c.qty, 0), 'Pendientes de entrega', 'layers', 'blue')}${kpi('Peso en almacén', money(c.kg) + ' kg', 'Según registros disponibles', 'truck', 'green')}${kpi('Sin ubicación', money(c.unassigned, 0), 'Requieren asignación', 'map', 'amber')}</div>${autoZoneDashboard()}<div class="dashboard-grid"><div><div class="card hero"><small>ALMACÉN INTELIGENTE · SIOAL</small><h2>Del registro de encomiendas a decisiones de almacenamiento.</h2><p>Organiza mercancías por zonas, revisa capacidades y aprueba propuestas de optimización sin bloquear la circulación.</p>${btn('nav', 'Explorar mapa ' + ic('arrow'), 'secondary', 'data-page="mapa"')}</div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>${ic('chart', 17)} Resumen de capacidades</h3><span class="pill wine">Capacidades de ejemplo</span></div>${zoneBars()}<div class="info-strip">El plano real tiene 15 m de largo, 8 m en la entrada y 11 m en el área operativa. Las superficies útiles de A, B y C siguen pendientes de medición.</div></div></div><div><div class="card card-pad"><div class="card-header"><h3>Estado operativo</h3><span class="pill green">En vivo en este navegador</span></div><div class="staff-stat"><div><div class="info-label">Registrados</div><strong>${money(c.total, 0)}</strong></div><div><div class="info-label">Entregados</div><strong>${money(c.delivered, 0)}</strong></div><div><div class="info-label">Ocupación máx.</div><strong>${money(maxOcc)}%</strong></div></div><div class="section-sep"></div><h3 style="font-size:13px">Alertas importantes</h3>${alertList(3)}<div style="margin-top:8px">${btn('nav', 'Ver todas las alertas ' + ic('arrow'), 'soft', 'data-page="alertas"')}</div></div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Movimientos recientes</h3></div>${lastActivity(4)}</div></div></div><div class="card card-pad"><div class="card-header"><h3>Módulos cuantitativos de SIOAL</h3><span class="pill wine">4 modelos</span></div><div class="grid-3"><div class="soft-box"><strong>01 · MILP</strong><p class="sub" style="margin:8px 0 0">Asignación de encomiendas a zonas según prioridad y capacidad.</p></div><div class="soft-box"><strong>02 · Dotación de personal</strong><p class="sub" style="margin:8px 0 0">Escenarios por volumen semanal y mensual. CP-SAT pendiente de conexión.</p></div><div class="soft-box"><strong>03 y 04 · Pronóstico y flujo</strong><p class="sub" style="margin:8px 0 0">Tendencias de ingresos y balances de mercancías con fechas registradas.</p></div></div></div>`;
}
