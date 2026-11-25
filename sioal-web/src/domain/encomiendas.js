/**
 * Ciclo de vida de una encomienda: registro, recepción, entrega e incidencias.
 */
'use strict';

function getParcel(id) {
  return db.items.find(p => p.id === id);
}

// AUDITORÍA 14: un único validador de secuencia para formularios, recepción,
// despacho y restauración. No se inventan fechas cuando faltan en un histórico.
function parcelChronologyIssue(p) {
  if (!p || typeof p.date !== 'string' || !trainingDay(p.date) || p.date > isoDay())
    return 'Fecha de orden inválida o futura';
  const received = p.receivedAt,
    delivered = p.deliveredAt;
  if (received !== undefined && received !== null && received !== '') {
    if (typeof received !== 'string' || !trainingDay(received) || received > isoDay())
      return 'Fecha de recepción inválida o futura';
    if (received < p.date) return 'La recepción no puede ser anterior a la fecha de orden';
  }
  if (delivered !== undefined && delivered !== null && delivered !== '') {
    if (typeof delivered !== 'string' || !trainingDay(delivered) || delivered > isoDay())
      return 'Fecha de entrega inválida o futura';
    if (delivered < p.date) return 'La entrega no puede ser anterior a la fecha de orden';
    if (received && delivered < received) return 'La entrega no puede ser anterior a la recepción física';
  }
  return '';
}

function saveParcel(form) {
  let fd = new FormData(form);
  let editing = !!ui.editingId,
    p = editing ? getParcel(ui.editingId) : {};
  if (editing && !p) return notify('No se encontró el registro', 'error');
  let code =
    (fd.get('code') || '').trim() ||
    'ENC-' +
      String(
        Math.max(0, ...db.items.map(x => Number((x.code || '').match(/^ENC-(\d+)$/)?.[1]) || 0)) + 1
      ).padStart(6, '0');
  if (db.items.some(x => norm(x.code) === norm(code) && x.id !== p.id))
    return notify('El código ya está registrado. Utiliza uno diferente.', 'error');
  let rawQty = String(fd.get('qty') ?? '').trim(),
    qty = /^\d+$/.test(rawQty) ? Number(rawQty) : NaN,
    kg = Number(fd.get('kg')),
    width = Number(fd.get('width')),
    length = Number(fd.get('length'));
  if (
    !Number.isSafeInteger(qty) ||
    qty < 1 ||
    !Number.isFinite(kg) ||
    kg <= 0 ||
    !Number.isFinite(width) ||
    !Number.isFinite(length) ||
    width < 0 ||
    length < 0
  )
    return notify('Revisa cantidad, peso y medidas: no pueden ser negativos.', 'error');
  let updated = {
    ...p,
    id: p.id || 'P-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
    code,
    date: String(fd.get('date') || isoDay()),
    recipient: String(fd.get('recipient') || '').trim(),
    sender: String(fd.get('sender') || '').trim(),
    dest: String(fd.get('dest')),
    type: String(fd.get('type')),
    qty,
    kg,
    width,
    length,
    priority: String(fd.get('priority')),
    fragile: fd.has('fragile'),
    zone: String(fd.get('zone')),
    note: String(fd.get('note') || ''),
    status: p.status || 'almacen',
    source: p.source || 'manual'
  };
  if (!updated.recipient) return notify('Indica el destinatario', 'error');
  if (editing && updated.zone !== p.zone)
    return notify(
      'No se cambia una ubicación física desde Editar. Utiliza Mapa digital y confirma el movimiento realmente efectuado.',
      'error'
    );
  if (!editing && updated.zone !== 'SIN')
    return notify(
      'Las guías nuevas comienzan sin zona; confirma su colocación real desde Mapa digital.',
      'error'
    );
  if (isUnlocated(updated) && updated.zone !== 'SIN')
    return notify(
      'Mercancía no localizada: resuelve primero la incidencia y confirma una nueva ubicación física.',
      'error'
    );
  if (!trainingDay(updated.date) || updated.date > isoDay())
    return notify('La fecha de la encomienda no es válida o es posterior a hoy.', 'error');
  const chronology = parcelChronologyIssue(updated);
  if (chronology) return notify('Error en secuencia de fechas: ' + chronology, 'error');
  const shapeIssue = physicalEnvelopeProblem(updated);
  if (
    shapeIssue &&
    (updated.zone !== 'SIN' ||
      (updated.width > 0 && updated.length > 0) ||
      Math.max(updated.width, updated.length) > GEOMETRY.length)
  )
    return notify(
      'Dimensiones incompatibles con el almacén: ' + shapeIssue + '. Revisa las medidas antes de registrar.',
      'error'
    );
  const weightIssue = weightReviewReason(updated);
  if (
    weightIssue &&
    updated.zone !== 'SIN' &&
    (!editing || p.zone !== updated.zone || p.kg !== updated.kg || p.qty !== updated.qty)
  )
    return notify(
      'Ubicación pendiente de revisión de peso: ' +
        weightIssue +
        '. Selecciona Sin asignar o verifica el dato.',
      'error'
    );
  if (['transito', 'pendiente_recepcion'].includes(updated.status) && updated.zone !== 'SIN')
    return notify('Debes confirmar la recepción antes de asignar una zona física.', 'error');
  if (updated.status === 'entregado' && updated.zone === 'SIN') updated.zone = p.zone || 'SIN';
  if (updated.zone !== 'SIN' && updated.status !== 'entregado') {
    const check = validatedAssignment({ [updated.id]: updated.zone }, true, updated);
    if (!check.ok)
      return notify('No se pudo guardar la ubicación: ' + check.problems.slice(0, 2).join(' · '), 'error');
  }
  if (editing) db.items = db.items.map(x => (x.id === p.id ? updated : x));
  else db.items.unshift(updated);
  db.demo = db.demo && updated.source === 'demo';
  updateAutomaticABC();
  audit(editing ? 'edicion' : 'registro', `${editing ? 'Se editó' : 'Se registró'} ${updated.code}`);
  closeModal();
  render();
  notify(
    weightIssue
      ? 'Guardada; peso pendiente de revisión para ABC: ' + weightIssue
      : editing
        ? 'Cambios guardados'
        : 'Encomienda registrada correctamente',
    'success'
  );
}

function confirmReceive(id) {
  const p = getParcel(id);
  if (!p || !['transito', 'pendiente_recepcion'].includes(p.status))
    return notify('Esta orden no está pendiente de recepción física.', 'error');
  openModal(
    'Confirmar recepción física',
    p.code,
    `<p class="sub">¿Confirmas que esta encomienda ya llegó al almacén? Solo después de esta comprobación se sumará al inventario y podrá asignarse a una zona A, B o C.</p><div class="modal-actions">${btn('modal-close', 'Cancelar')}${btn('receive-confirm', 'Confirmar llegada', 'primary', `data-id="${esc(p.id)}"`)}</div>`
  );
}
function receiveParcel(id) {
  const p = getParcel(id);
  if (!p || !['transito', 'pendiente_recepcion'].includes(p.status))
    return notify('La encomienda no está pendiente de recepción.', 'error');
  const candidate = { ...p, status: 'almacen', zone: 'SIN', receivedAt: isoDay() };
  const chrono = parcelChronologyIssue(candidate);
  if (chrono) return notify('Recepción no permitida: ' + chrono, 'error');
  p.status = 'almacen';
  p.zone = 'SIN';
  p.receivedAt = candidate.receivedAt;
  updateAutomaticABC();
  audit('recepcion', `Recepción física confirmada: ${p.code}`);
  closeModal();
  render();
  notify(
    'Llegada confirmada. SIOAL ha recalculado la zona ABC automáticamente; consulta el mapa para confirmar la colocación.'
  );
}
function confirmDeliver(id) {
  let p = getParcel(id);
  if (!p || p.status === 'entregado') return;
  if (['transito', 'pendiente_recepcion'].includes(p.status))
    return notify('Confirma la recepción física antes de gestionar el despacho.', 'error');
  if (p.status === 'incidencia')
    return openModal(
      'Incidencia pendiente',
      p.code,
      `<div class="callout">Esta encomienda presenta una incidencia: <strong>${esc(p.incident || 'Sin detalle')}</strong>. Revisa el registro antes de marcar su entrega.</div><div class="modal-actions" style="padding:16px 0 0">${btn('edit', 'Revisar registro', 'primary', `data-id="${esc(p.id)}"`)}</div>`
    );
  openModal(
    'Confirmar entrega',
    `Código ${p.code}`,
    `<p class="sub" style="font-size:13px">¿Confirmas que <strong>${esc(p.recipient)}</strong> recibió esta encomienda? Se registrará la fecha de salida de hoy.</p><div class="modal-actions" style="padding:10px 0 0">${btn('modal-close', 'Cancelar')}${btn('deliver-confirm', 'Confirmar despacho', 'green', `data-id="${esc(p.id)}"`)}</div>`
  );
}
function deliver(id) {
  const p = getParcel(id);
  if (!p || p.status === 'entregado')
    return notify('No se encontró una encomienda pendiente de entrega.', 'error');
  if (p.status === 'incidencia')
    return notify('Entrega bloqueada: resuelve y verifica la incidencia antes del despacho.', 'error');
  if (p.status !== 'almacen')
    return notify('Estado incompatible con una entrega. Revisa la encomienda.', 'error');
  const candidate = { ...p, status: 'entregado', deliveredAt: isoDay() };
  const chrono = parcelChronologyIssue(candidate);
  if (chrono) return notify('Entrega no permitida: ' + chrono, 'error');
  p.status = 'entregado';
  p.deliveredAt = candidate.deliveredAt;
  updateAutomaticABC();
  audit('entrega', `Entrega registrada: ${p.code}`);
  closeModal();
  render();
  notify('Entrega registrada; se actualizó el inventario');
}
function openIncident(id) {
  let p = getParcel(id);
  if (!p) return;
  if (!['almacen', 'incidencia'].includes(p.status))
    return notify(
      'Para registrar una incidencia física, la mercancía debe tener recepción confirmada y no estar entregada.',
      'error'
    );
  openModal(
    'Registrar incidencia',
    p.code,
    `<form id="incidentForm"><div class="field"><label>Tipo de incidencia</label><select name="reason">${['Embalaje dañado', 'Guía incompleta', 'Mercancía no localizada', 'Diferencia de bultos', 'Otro'].map(v => `<option>${v}</option>`).join('')}</select></div><div class="field"><label>Detalle</label><textarea name="description" required placeholder="Describe el problema encontrado"></textarea></div><div class="modal-actions" style="padding:0">${btn('modal-close', 'Cancelar')}<button class="btn danger" type="submit">Registrar incidencia</button></div></form>`
  );
  ui.incidentId = id;
}
