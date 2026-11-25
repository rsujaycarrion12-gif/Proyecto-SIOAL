/**
 * Pantalla: Clasificación ABC por peso.
 */
'use strict';

function abcCurrent() {
  return classedWeight(activeItems().filter(p => p.status === 'almacen'));
}
function abcClassBadge(z) {
  if (!z) return '<span class="pill orange">Peso por revisar</span>';
  return `<span class="pill" style="background:${z === 'A' ? '#fff0ee' : z === 'B' ? '#fff8d9' : '#eaf2ff'};color:${z === 'A' ? '#bb2d36' : z === 'B' ? '#916d00' : '#1d5bc6'};font-weight:800">Clase ${z}</span>`;
}
function abcSummaryMini() {
  const x = abcCurrent();
  return `<div class="card card-pad" style="margin:0 0 18px"><div class="card-header"><h3>${ic('layers', 17)} Clasificación automática por peso</h3>${btn('nav', 'Ver clasificación ' + ic('arrow', 15), 'small', 'data-page="abc"')}</div><div class="grid-3">${['A', 'B', 'C'].map(z => `<div class="soft-box"><div class="info-label">Clase ${z} · ${z === 'A' ? 'Mayor peso' : z === 'B' ? 'Peso intermedio' : 'Menor peso'}</div><strong style="font-size:22px">${money(x.stats[z].count, 0)}</strong><p class="sub" style="margin:5px 0 0">${money(x.stats[z].kg)} kg en registros activos</p></div>`).join('')}</div><p class="inline-note">Las clases por peso son recomendaciones. El número de encomiendas físicamente colocadas se muestra más abajo y puede ser diferente por falta de medidas.</p></div>`;
}
function abcOptimizationNotice() {
  return `<div class="callout blue" style="margin-bottom:17px;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap"><span><strong>Nuevo:</strong> clasificación automática ABC según peso total. Empates de peso permanecen en la misma categoría; los porcentajes son aproximados. Las órdenes con pesos estadísticamente sospechosos quedan SIN categoría ABC para revisión; esto no demuestra un límite físico. La clase por peso no equivale a una ubicación física confirmada.</span>${btn('nav', ic('layers', 16) + ' Clasificación ABC por peso', 'primary', 'data-page="abc"')}</div>`;
}
function saveABCConfig(form) {
  const fd = new FormData(form),
    a = Number(fd.get('pctA')),
    b = Number(fd.get('pctB')),
    maxW = Number(fd.get('maxKgCheck'));
  if (!(a >= 1 && a <= 80 && b >= 1 && b <= 80 && a + b <= 95))
    return notify('Los porcentajes A y B deben ser válidos y dejar al menos 5% para C.', 'error');
  if (!(maxW >= 1 && maxW <= 10000000))
    return notify('El umbral para revisión de pesos extremos debe ser positivo.', 'error');
  const priorWeightLimit = sharedReviewWeightKg();
  db.config.abc = { pctA: a, pctB: b, maxKgCheck: maxW, priorityTie: fd.has('priorityTie') };
  // Versión reforzada · Auditoría 16: NO guardar TRAIN_KEY y el inventario como si fuera una transacción.
  // Si cambia el límite, el histórico depurado queda desactualizado y debe reimportarse.
  // trainingRun() y trainingModelsTab() bloquearán cualquier resultado anterior.
  updateAutomaticABC();
  audit('abc', `Se actualizó la clasificación ABC por peso: A ${a}%, B ${b}%, C ${100 - a - b}%.`);
  render();
  notify(
    priorWeightLimit !== maxW
      ? 'ABC guardado. El histórico de entrenamiento requiere nueva importación por cambio de umbral.'
      : 'Clasificación ABC recalculada automáticamente'
  );
}
function previewABCPlacement() {
  const plan = autoZonePlan(),
    assignment = Object.fromEntries(plan.recommendations);
  abcPlacement = {
    assignment,
    assigned: plan.available,
    withoutDims: plan.blocked.filter(p => !(p.width > 0 && p.length > 0)).map(p => p.code),
    withoutWeight: plan.blocked.filter(p => !plan.rank.map.has(p.id)).map(p => p.code),
    withoutSpace: plan.blocked.filter(p => (plan.reason.get(p.id) || '').includes('zona')).map(p => p.code),
    signature: abcSignature(),
    created: isoDay(),
    pending: plan.blocked.map(p => ({ code: p.code, reason: plan.reason.get(p.id) }))
  };
  render();
  notify(
    `Clasificación automática actualizada: ${plan.available} ubicaciones recomendadas, ${plan.reviewed} por revisar.`
  );
}
function abcSignature() {
  return proposalFingerprint();
}
function applyABCPlacement() {
  const plan = autoZonePlan();
  if (!plan.available) {
    render();
    return notify('No hay ubicaciones nuevas que puedan recomendarse.', 'error');
  }
  abcPlacement = null;
  go('mapa');
  notify(
    `Las ${plan.available} zonas recomendadas se muestran en el mapa. Confirma físicamente cada colocación.`
  );
}
function abcMetrics(classStats, invalid = 0) {
  const totalKg = ['A', 'B', 'C'].reduce((s, z) => s + classStats[z].kg, 0),
    colors = { A: '#e83b3e', B: '#e4b510', C: '#2866db' };
  return `<div class="abc-cards">${['A', 'B', 'C']
    .map(z => {
      let x = classStats[z],
        percent = totalKg ? (x.kg / totalKg) * 100 : 0;
      return `<section class="abc-col"><div class="abc-col-head"><div class="abc-letter" style="background:${colors[z]}">${z}</div><div><strong>Clase ${z}</strong><div class="abc-sub">${z === 'A' ? 'Encomiendas más pesadas' : z === 'B' ? 'Peso intermedio' : 'Encomiendas más ligeras'}</div></div></div><div class="abc-col-body"><div class="abc-big">${money(x.count, 0)} <span style="font-size:13px;font-weight:500">guías</span></div><div class="abc-sub">${money(x.kg, 1)} kg registrados</div><div class="abc-meter"><span style="width:${percent}%;background:${colors[z]}"></span></div><div class="abc-sub">${money(percent, 1)}% del peso total clasificado</div></div></section>`;
    })
    .join(
      ''
    )}</div>${invalid ? `<div class="abc-note">${ic('info', 15)} <strong>${money(invalid, 0)} registros</strong> sin peso válido, con peso cero o con peso extremo; quedan sin clasificar y requieren revisión.</div>` : ''}`;
}
function renderABC() {
  const result = abcCurrent(),
    plan = autoZonePlan(),
    opts = abcPrefs(),
    pending = activeItems().filter(p => !p.width || !p.length),
    a = abcPlacement;
  let ranked = activeItems()
    .filter(p => result.map.has(p.id))
    .sort((x, y) => y.kg - x.kg)
    .slice(0, 60);
  return `${head('Distribución ABC automática por peso', 'Clasificación basada en los kilogramos de cada encomienda, actualizada al registrar, importar o despachar.', btn('abc-preview', ic('spark') + ' Recalcular propuestas', 'primary') + btn('abc-export', ic('download') + ' Exportar ABC', 'secondary'))}
 <div class="abc-hero"><div><span class="pill">MOTOR AUTOMÁTICO · PESO</span><h2>Mayor peso → Clase A · Peso medio → B · Menor peso → C</h2><p>El sistema ordena las guías activas de mayor a menor peso y calcula las clases automáticamente. Los códigos con pesos o fechas contradictorias requieren conciliación, sin elegir una versión automáticamente. La ubicación física solo se propone si la encomienda tiene largo y ancho; los pasillos, recepción, baño y accesos permanecen excluidos.</p></div><div style="font-size:66px;font-weight:900;opacity:.18">ABC</div></div>
 ${autoZoneDashboard()}${abcMetrics(result.stats, result.invalidCount)}
 <div class="grid-2"><section class="card card-pad"><div class="card-header"><h3>Regla de clasificación por peso</h3><span class="pill wine">Personalizable</span></div><p class="sub">Distribución por <strong>porcentaje de encomiendas</strong> ordenadas según kg, no por precio o valor de venta. Las encomiendas con exactamente el mismo peso permanecen en la misma clase; por ello los porcentajes son aproximados.</p><form id="abcConfigForm" class="abc-form-inline"><div class="field"><label>Clase A · más pesadas (%)</label><input name="pctA" type="number" min="1" max="80" step="1" value="${opts.pctA}" required></div><div class="field"><label>Clase B · intermedias (%)</label><input name="pctB" type="number" min="1" max="80" step="1" value="${opts.pctB}" required></div><div class="field"><label>Clase C · restantes (%)</label><input value="${100 - Number(opts.pctA) - Number(opts.pctB)}" disabled aria-label="Porcentaje clase C"></div><div class="field"><label>Umbral compartido ABC / IA: revisar si supera (kg)</label><input name="maxKgCheck" type="number" min="1" step="1" value="${opts.maxKgCheck}" required></div><button class="btn primary" type="submit" style="height:42px">${ic('check', 16)} Aplicar regla</button></form><label class="check-row" style="margin-top:15px"><input type="checkbox" name="priorityTie" form="abcConfigForm" ${opts.priorityTie ? 'checked' : ''}> Ordenar por prioridad dentro de un mismo peso (sin dividir la clase ABC)</label><div class="abc-note" style="margin-top:16px">Regla inicial orientativa: 20% de guías más pesadas en A, 30% siguientes en B y 50% restantes en C. Los empates de peso pueden modificar estos porcentajes. Puedes modificarla. <strong>No es el ABC financiero tradicional</strong>, que utiliza valor monetario o consumo valorizado.</div></section>
 <section class="card card-pad"><div class="card-header"><h3>Asignación automática al mapa</h3><span class="pill orange">Simulación</span></div><div class="detail-list"><div class="detail-row"><span>Con peso válido</span><strong>${money(result.validCount, 0)}</strong></div><div class="detail-row"><span>Sin peso válido</span><strong>${money(result.invalidCount, 0)}</strong></div><div class="detail-row"><span>Sin dimensiones</span><strong>${money(pending.length, 0)}</strong></div><div class="detail-row"><span>Capacidades de las zonas</span><strong>Por validar</strong></div></div><div style="margin-top:14px">${btn('abc-preview', ic('spark') + ' Calcular ubicaciones factibles', 'primary', 'style="width:100%"')}</div>${a ? `<div class="soft-box" style="margin-top:14px"><strong style="font-size:15px">${money(a.assigned, 0)} asignaciones posibles</strong><div class="abc-weight-row"><span>Sin medidas o dimensiones incompatibles</span><strong>${a.withoutDims.length}</strong></div><div class="abc-weight-row"><span>Sin peso válido</span><strong>${a.withoutWeight.length}</strong></div><div class="abc-weight-row"><span>Sin capacidad simulada</span><strong>${a.withoutSpace.length}</strong></div></div><div style="margin-top:13px">${btn('abc-apply', ic('map') + ' Ver propuestas en el mapa', 'soft', `style="width:100%" ${a.assigned ? '' : 'disabled'}`)}</div>` : '<p class="inline-note">Las clases ABC se actualizan automáticamente; se excluyen temporalmente los pesos sospechosos del cálculo. Las recomendaciones están calculadas automáticamente; verifica cada colocación en el mapa para que se refleje como ubicación física.</p>'}</section></div>
 <section class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Encomiendas clasificadas automáticamente</h3><span class="pill">Primeras ${Math.min(60, ranked.length)} por peso</span></div><div class="table-scroll abc-table"><table><thead><tr><th>Orden / destinatario</th><th>Peso total</th><th>Clase automática</th><th>Ubicación registrada</th><th>Medidas</th></tr></thead><tbody>${ranked.map(p => `<tr><td><strong>${esc(p.code)}</strong><span class="td-muted">${esc(p.recipient || 'Sin destinatario')}</span></td><td><strong>${money(p.kg)} kg</strong></td><td>${abcClassBadge(result.map.get(p.id))}</td><td>${zoneBadge(p.zone)}${autoZoneCell(p, plan)}</td><td>${footprint(p) ? money(footprint(p)) + ' m²' : '<span class="pill orange">Pendiente</span>'}</td></tr>`).join('')}</tbody></table></div>${result.total > 60 ? `<p class="inline-note">Se muestran las 60 guías de mayor peso. Exporta el CSV ABC para consultar la clasificación de todos los registros activos.</p>` : ''}</section>
 <section class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Clasificar un archivo grande sin guardar las órdenes en el navegador</h3><span class="pill blue">120.000 filas CSV</span></div><p class="sub">Esta opción analiza un CSV o Excel y exporta las columnas originales con clase ABC, tipo de clasificación y observaciones. Una orden EN TRÁNSITO recibe solo una PRECLASIFICACIÓN orientativa; ninguna orden se incorpora al inventario físico sin confirmar la recepción.</p><div class="grid-2"><div class="field"><label>Archivo masivo (.csv o .xlsx)</label><input type="file" id="abcBulkFile" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div><div class="field"><label>Filas que se clasificarán</label><select id="abcBulkFilter"><option value="pending" ${abcBulkFilter === 'pending' ? 'selected' : ''}>Órdenes no entregadas · preclasificación</option><option value="all" ${abcBulkFilter === 'all' ? 'selected' : ''}>Todas las órdenes (análisis histórico)</option></select></div></div><div id="abc-bulk-wait" class="abc-demo-caption" style="margin:8px 0">${abcBusy ? 'Analizando archivo, espera…' : 'Se procesa localmente. No requiere enviar la información a un servidor.'}</div>${abcBulk ? `<div class="info-strip">Archivo: <strong>${esc(abcBulk.file)}</strong> · ${money(abcBulk.records.length, 0)} filas · ${money(abcBulk.eligible, 0)} clases por peso (${money(abcBulk.preclassified || 0, 0)} preclasificaciones sin recepción confirmada) · ${money(abcBulk.bad, 0)} por revisar · ${money(abcBulk.duplicates, 0)} duplicados · ${money(abcBulk.conflicts || 0, 0)} órdenes en conciliación · ${money(abcBulk.excluded, 0)} excluidas del inventario activo</div>${abcMetrics(abcBulk.stats, 0)}<div style="margin-top:12px">${btn('abc-bulk-export', ic('download') + ' Exportar CSV con clases ABC', 'primary')} ${btn('abc-bulk-reset', 'Quitar archivo', 'soft')}</div><p class="inline-note">El CSV añade TIPO_CLASIFICACION para distinguir PRECLASIFICACIÓN de HISTÓRICO. Ninguna fila del archivo masivo se contabiliza como existencia física sin recepción confirmada; tampoco se inventan dimensiones ni ubicaciones.</p>` : '<div class="abc-note">Prueba con <strong>SIOAL_2_0_120000_ordenes_completas.csv</strong> o con cualquiera de los libros Excel de 10.000 órdenes que descargaste.</div>'}</section>`;
}
function exportABCCurrent() {
  updateAutomaticABC();
  const review = abcCurrent().reviewReasons,
    plan = autoZonePlan();
  const h = [
    'NÚMERO O.S.',
    'FECHA',
    'DESTINATARIO',
    'DESTINO',
    'T. PESO',
    'CLASE_ABC_PESO',
    'ZONA_ACTUAL',
    'ZONA_RECOMENDADA',
    'VALIDACIÓN'
  ];
  const rows = [
    h,
    ...db.items.map(p => [
      p.code,
      p.date,
      p.recipient,
      p.dest,
      p.kg + ' KG',
      p.status === 'entregado'
        ? 'EXCLUIDA_ENTREGADA'
        : ['transito', 'pendiente_recepcion'].includes(p.status)
          ? 'PENDIENTE_RECEPCION'
          : p.abcClass || 'REVISAR_PESO',
      p.zone,
      plan.recommendations.get(p.id) || '',
      review.get(p.id) ||
        (!footprint(p)
          ? 'Faltan dimensiones para ubicación física'
          : 'Clasificación por peso; verificar capacidad física')
    ])
  ];
  downloadBlob(
    new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }),
    'SIOAL_ABC_peso_inventario.csv'
  );
}
