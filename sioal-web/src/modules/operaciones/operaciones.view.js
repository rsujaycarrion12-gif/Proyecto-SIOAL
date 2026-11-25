/**
 * Pantalla: Operaciones (recepción, despacho e incidencias).
 */
'use strict';

function renderOperations() {
  let active = activeItems(),
    inc = active.filter(x => x.status === 'incidencia'),
    del = db.items.filter(x => x.status === 'entregado');
  return `${head('Movimientos y despacho', 'Trazabilidad de recepciones, entregas, correcciones e incidencias.', btn('new', ic('plus') + ' Registrar recepción', 'primary'))}<div class="kpi-grid">${kpi('En almacén', counts().active, 'Excluye mercancías no localizadas', 'box')}${kpi('Entregadas', del.length, 'Según datos registrados', 'check', 'green')}${kpi('Con incidencia', inc.length, 'Pendientes de revisión', 'bell', 'amber')}${kpi('Sin recepción confirmada', counts().awaiting, 'Tránsito u órdenes por comprobar', 'truck', 'blue')}</div><div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>Incidencias pendientes</h3><span class="pill red">${inc.length} casos</span></div>${
    inc.length
      ? inc
          .slice(0, 12)
          .map(
            p =>
              `<div class="alert-item"><div class="alert-dot danger">${ic('bell', 16)}</div><div style="flex:1"><button class="hotspot-tag" data-action="detail" data-id="${esc(p.id)}"><strong>${esc(p.code)} · ${esc(p.recipient)}</strong></button><p>${esc(p.incident || 'Pendiente de revisión')}</p></div>${ui.role === 'admin' ? btn('resolve', 'Resolver', 'small', `data-id="${esc(p.id)}"`) : ''}</div>`
          )
          .join('')
      : '<div class="callout green">No hay incidencias pendientes.</div>'
  }</div><div class="card card-pad"><div class="card-header"><h3>Bitácora de movimientos</h3><span class="pill">Últimos ${Math.min(25, db.activity.length)}</span></div><div class="scroll-y">${lastActivity(25)}</div></div></div><div class="card card-pad" style="margin-top:19px"><div class="card-header"><h3>Encomiendas disponibles para despacho</h3></div>${packageTable(active.slice(0, 20))}</div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>En tránsito o recepción pendiente</h3><span class="pill orange">${db.items.filter(p => ['transito', 'pendiente_recepcion'].includes(p.status)).length} guías</span></div><p class="inline-note">Estas órdenes NO suman al inventario físico hasta confirmar su llegada.</p>${packageTable(db.items.filter(p => ['transito', 'pendiente_recepcion'].includes(p.status)).slice(0, 20))}</div>`;
}

function resolveIncident(id) {
  let p = getParcel(id);
  if (!p || p.status !== 'incidencia') return;
  openModal(
    'Resolver incidencia',
    p.code,
    `<p class="sub">¿Se verificó y solucionó la incidencia de esta encomienda?</p><div class="callout">${esc(p.incident || 'No se registró detalle')}</div><div class="modal-actions" style="padding:15px 0 0">${btn('modal-close', 'Cancelar')}${btn('resolve-confirm', ic('check') + ' Marcar resuelta', 'green', `data-id="${esc(id)}"`)}</div>`
  );
}
