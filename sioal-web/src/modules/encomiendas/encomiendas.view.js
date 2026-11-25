/**
 * Pantalla: Encomiendas (listado, filtros, formulario y detalle).
 */
'use strict';

function matchQuery(p, query) {
  let q = norm(query);
  if (!q) return true;
  return norm(
    [p.code, p.recipient, p.sender, p.dest, p.type, p.note, p.incident, p.priority, p.status].join(' ')
  ).includes(q);
}

function listRows(all, limited = false) {
  const plan = autoZonePlan();
  return all
    .slice(0, limited ? 60 : 200)
    .map(
      p =>
        `<tr><td><strong class="mono">${esc(p.code)}</strong><span class="td-muted">${esc(p.date || 'Sin fecha')}</span></td><td><strong>${esc(p.recipient || 'Sin destinatario')}</strong><span class="td-muted">${esc(p.dest || 'Sin destino')}</span></td><td>${esc(p.type)}<div class="td-muted">${p.qty} bulto(s)</div></td><td>${money(p.kg)} kg</td><td>${p.width && p.length ? money(footprint(p)) + ' m²' : '<span class="pill orange">Sin medidas</span>'}</td><td>${zoneBadge(p.zone)}${autoZoneCell(p, plan)}</td><td>${statusBadge(p.status)}</td><td><div class="flex-row" style="gap:5px"><button class="btn small" data-action="detail" data-id="${esc(p.id)}" title="Detalle">${ic('eye', 14)}</button>${ui.role === 'admin' ? `<button class="btn small" data-action="edit" data-id="${esc(p.id)}" title="Editar">${ic('edit', 14)}</button>` : ''}${['transito', 'pendiente_recepcion'].includes(p.status) ? `<button class="btn small green" data-action="receive" data-id="${esc(p.id)}" title="Confirmar recepción física">${ic('check', 14)}</button>` : ''}${['almacen', 'incidencia'].includes(p.status) ? `<button class="btn small green" data-action="deliver" data-id="${esc(p.id)}" title="Registrar entrega">${ic('check', 14)}</button>` : ''}</div></td></tr>`
    )
    .join('');
}
function packageTable(all) {
  return `<div class="table-scroll"><table><thead><tr><th>Código / fecha</th><th>Destinatario</th><th>Tipo</th><th>Peso</th><th>Huella</th><th>Zona</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${listRows(all)}</tbody></table></div>${all.length > 200 ? `<p class="inline-note" style="padding-top:12px">Se muestran 200 de ${all.length} registros. Utiliza el buscador para localizar los demás.</p>` : ''}`;
}
function renderPackages() {
  let fil = ui.filter,
    all = db.items.filter(
      p =>
        (fil === 'todos' ||
          (fil === 'almacen'
            ? ['almacen', 'incidencia'].includes(p.status)
            : fil === 'entregado'
              ? p.status === 'entregado'
              : fil === 'pendiente'
                ? ['transito', 'pendiente_recepcion'].includes(p.status)
                : p.zone === 'SIN' && ['almacen', 'incidencia'].includes(p.status))) &&
        matchQuery(p, ui.query)
    );
  let c = counts();
  return `${head('Gestión de encomiendas', 'Registro completo de mercancías, identificación, ubicación y despacho.', btn('new', ic('plus') + ' Nueva encomienda', 'primary') + (ui.role === 'admin' ? btn('nav', ic('upload') + ' Importar Excel', 'secondary', 'data-page="importar"') : ''))}<div class="card card-pad"><div class="toolbar"><div class="seg">${[
    ['almacen', 'En almacén'],
    ['pendiente', 'Sin confirmar'],
    ['entregado', 'Entregadas'],
    ['sin', 'Sin zona'],
    ['todos', 'Todas']
  ]
    .map(
      ([key, label]) =>
        `<button data-action="filter" data-filter="${key}" class="${fil === key ? 'active' : ''}">${label}</button>`
    )
    .join(
      ''
    )}</div><div class="input-search" style="width:min(100%,310px)">${ic('search')}<input id="packageSearch" class="search-input" placeholder="Buscar código, nombre, destino..." value="${esc(ui.query)}" autocomplete="off"></div></div><div class="info-strip" style="margin-bottom:15px">Mostrando <strong>${all.length}</strong> registros de ${db.items.length}. Sin recepción física confirmada: <strong>${c.awaiting}</strong>. Las guías importadas no equivalen automáticamente a existencias físicas.</div>${all.length ? packageTable(all) : `<div class="empty"><div class="empty-icon">${ic('search', 22)}</div><strong>No encontramos registros</strong><p>Prueba otra búsqueda o registra una nueva encomienda.</p></div>`}</div>`;
}
function parcelForm(p) {
  let editing = !!p;
  let v = p || {
    code: '',
    date: isoDay(),
    sender: '',
    recipient: '',
    dest: 'Juliaca',
    type: 'Caja',
    qty: 1,
    kg: 0,
    width: '',
    length: '',
    priority: 'media',
    fragile: false,
    zone: 'SIN',
    note: ''
  };
  return `<form id="parcelForm"><div class="form-row"><div class="field"><label>Código de encomienda</label><input name="code" maxlength="80" value="${esc(v.code)}" placeholder="Automático si se deja vacío"></div><div class="field"><label>Fecha de registro / referencia</label><input type="date" name="date" value="${esc(v.date || isoDay())}" max="${isoDay()}" required></div></div><div class="form-row"><div class="field"><label>Destinatario *</label><input name="recipient" value="${esc(v.recipient)}" required maxlength="100" placeholder="Nombre del cliente"></div><div class="field"><label>Remitente</label><input name="sender" value="${esc(v.sender)}" maxlength="100" placeholder="Persona o empresa"></div></div><div class="form-row"><div class="field"><label>Destino</label><select name="dest">${['Juliaca', 'Puno', 'Ilave', 'Otro'].map(t => `<option ${v.dest === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div><div class="field"><label>Tipo de encomienda</label><select name="type">${['Caja', 'Fardo', 'Saco', 'Documento', 'Paquete', 'Bulto', 'Otro'].map(t => `<option ${v.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div></div><div class="form-row"><div class="field"><label>Cantidad de bultos *</label><input name="qty" type="number" min="1" step="1" value="${esc(v.qty)}" required></div><div class="field"><label>Peso total (kg) *</label><input name="kg" type="number" min="0" step="0.01" value="${esc(v.kg)}" required></div></div><div class="callout blue" style="margin-bottom:13px">Para la optimización se necesita la huella en el suelo. Si son varios bultos, se usa una estimación conservadora: largo × ancho de cada bulto × cantidad, sin contar apilamiento.</div><div class="form-row"><div class="field"><label>Largo por bulto (m)</label><input name="length" type="number" min="0" step="0.01" value="${esc(v.length || '')}" placeholder="Ej. 0.70"></div><div class="field"><label>Ancho por bulto (m)</label><input name="width" type="number" min="0" step="0.01" value="${esc(v.width || '')}" placeholder="Ej. 0.45"></div></div><div class="form-row"><div class="field"><label>Prioridad de acceso</label><select name="priority">${[
    ['alta', 'Alta'],
    ['media', 'Media'],
    ['baja', 'Baja']
  ]
    .map(([t, k]) => `<option value="${t}" ${v.priority === t ? 'selected' : ''}>${k}</option>`)
    .join(
      ''
    )}</select></div><div class="field"><label>Zona física registrada (solo lectura)</label><input value="${v.zone === 'SIN' ? 'Sin asignar' : 'Zona ' + esc(v.zone)}" disabled><input type="hidden" name="zone" value="${editing ? esc(v.zone) : 'SIN'}"><small style="display:block;margin-top:5px;color:#736b7c">La colocación o el traslado solo se confirma desde Mapa digital, después del movimiento físico.</small></div></div><label class="check-row"><input name="fragile" type="checkbox" ${v.fragile ? 'checked' : ''}> Encomienda frágil (no apilar en esta simulación)</label><div class="field"><label>Observaciones</label><textarea name="note" placeholder="Detalle, manipulación, referencia...">${esc(v.note)}</textarea></div><div class="modal-actions" style="padding:5px 0 0">${btn('modal-close', 'Cancelar')}<button class="btn primary" type="submit" style="min-width:150px">${ic('check')} ${editing ? 'Guardar cambios' : 'Registrar guía'}</button></div></form>`;
}

function newParcel(p) {
  ui.editingId = p?.id || null;
  openModal(
    p ? 'Editar encomienda' : 'Registrar nueva encomienda',
    p ? 'Actualiza sus características y ubicación.' : 'Los campos marcados con * son obligatorios.',
    parcelForm(p)
  );
}

function openDetail(id) {
  let p = getParcel(id);
  if (!p) return notify('No se encontró la encomienda', 'error');
  let rows = [
    ['Código', p.code],
    ['Destinatario', p.recipient],
    ['Remitente', p.sender || '—'],
    ['Destino', p.dest],
    ['Tipo', `${p.type} · ${p.qty} bulto(s)`],
    ['Peso total', money(p.kg) + ' kg'],
    ['Revisión de peso', weightReviewReason(p) || 'Sin alerta según las reglas actuales'],
    ['Dimensiones', p.width && p.length ? `${p.length} × ${p.width} m por bulto` : 'No registradas'],
    ['Superficie estimada', footprint(p) ? money(footprint(p)) + ' m²' : 'Pendiente'],
    ['Prioridad', p.priority],
    ['Ubicación', p.zone === 'SIN' ? 'Sin asignar' : 'Zona ' + p.zone],
    ['Clasificación ABC', abcCurrent().map.get(p.id) || 'Pendiente de revisión'],
    [
      'Zona automática sugerida',
      autoZonePlan().recommendations.get(p.id) || autoZonePlan().reason.get(p.id) || 'Sin cambio'
    ],
    ['Estado', p.status],
    ['Fecha de registro', p.date || '—'],
    ['Fragilidad', p.fragile ? 'Sí' : 'No'],
    ['Observación', p.incident || p.note || '—']
  ];
  openModal(
    'Detalle de encomienda',
    p.code,
    `<div class="detail-list">${rows.map(([k, v]) => `<div class="detail-row"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('')}</div><div class="modal-actions" style="padding:20px 0 0;flex-wrap:wrap">${btn('label', ic('scan') + ' Etiqueta QR', 'soft', `data-id="${esc(p.id)}"`)}${ui.role === 'admin' ? btn('edit', ic('edit') + ' Editar', 'secondary', `data-id="${esc(p.id)}"`) : ''}${['almacen', 'incidencia'].includes(p.status) ? btn('deliver', ic('check') + ' Registrar entrega', 'green', `data-id="${esc(p.id)}"`) : ''}${['transito', 'pendiente_recepcion'].includes(p.status) ? btn('receive', ic('check') + ' Confirmar recepción física', 'primary', `data-id="${esc(p.id)}"`) : ''}</div>`
  );
}
