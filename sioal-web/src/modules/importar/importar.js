/**
 * Pantalla: Importar Excel (vista previa, colisiones y confirmación).
 */
'use strict';

function rowsToParcels(rows) {
  if (rows.length < 2) throw Error('El archivo no tiene filas.');
  const col = columnLookup(rows[0]);
  if (col.code < 0) throw Error('Falta la columna NÚMERO O.S. o código.');
  const get = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '');
  const valid = [],
    issues = [],
    counts = {
      duplicateOrderInFile: 0,
      invalidWeight: 0,
      invalidQty: 0,
      invalidDate: 0,
      contradictoryStatus: 0,
      missingCode: 0,
      conflictOrders: 0
    },
    seen = new Set();
  const rawGroups = new Map(),
    conflictCodes = new Set();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.some(x => String(x ?? '').trim())) continue;
    const key = norm(get(r, 'code'));
    if (!key) continue;
    if (!rawGroups.has(key)) rawGroups.set(key, []);
    rawGroups.get(key).push(r);
  }
  // Antes de escoger el primer registro, detectar discrepancias en peso, cantidad, fecha y estado.
  for (const [key, group] of rawGroups) {
    if (group.length < 2) continue;
    const signature = r =>
      JSON.stringify([
        excelDate(get(r, 'date')),
        parseStrictKg(get(r, 'kg')) ?? get(r, 'kg'),
        get(r, 'qty'),
        norm(get(r, 'delivery')),
        norm(get(r, 'orderStatus'))
      ]);
    if (group.some(r => signature(r) !== signature(group[0]))) conflictCodes.add(key);
  }

  let rejected = 0,
    missingName = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.some(x => String(x ?? '').trim())) continue;
    const code = get(r, 'code');
    let problem = '';
    if (!code) {
      counts.missingCode++;
      problem = 'Número de orden vacío';
    }
    if (code && conflictCodes.has(norm(code))) {
      counts.conflictOrders++;
      problem = 'NÚMERO O.S. con versiones contradictorias: conciliación obligatoria';
    } else if (seen.has(norm(code))) {
      counts.duplicateOrderInFile++;
      problem = 'NÚMERO O.S. duplicado';
    }
    const status = statusFromTwo(get(r, 'delivery'), get(r, 'orderStatus'));
    if (!status.valid) {
      counts.contradictoryStatus++;
      problem ||= status.reason;
    }
    const kg = parseStrictKg(get(r, 'kg')),
      rawQty = get(r, 'qty');
    const qty = /^\d+$/.test(rawQty) ? Number(rawQty) : NaN;
    if (kg === null) {
      counts.invalidWeight++;
      problem ||= ambiguousKgFormat(get(r, 'kg'))
        ? 'Peso ambiguo: confirmar separador decimal o de millares'
        : 'Peso inválido';
    }
    if (!Number.isSafeInteger(qty) || qty <= 0) {
      counts.invalidQty++;
      problem ||= 'Cantidad inválida';
    }
    const date = excelDate(get(r, 'date'));
    if (!trainingDay(date) || date > isoDay()) {
      counts.invalidDate++;
      problem ||= date > isoDay() ? 'Fecha futura, requiere revisión' : 'Fecha inválida';
    }
    if (problem) {
      rejected++;
      if (issues.length < 100) issues.push({ fila: i + 1, code, problem });
      continue;
    }
    seen.add(norm(code)); // El código solo se reserva cuando el registro es válido.
    const recipient = get(r, 'recipient') || 'No especificado';
    if (recipient === 'No especificado') missingName++;
    valid.push({
      id: 'P-' + Date.now().toString(36) + '-' + i,
      code,
      date,
      sender: get(r, 'sender'),
      recipient,
      dest: get(r, 'dest') || 'No especificado',
      type: (get(r, 'type') || 'Encomienda').slice(0, 120),
      qty,
      kg,
      width: 0,
      length: 0,
      priority: 'media',
      fragile: false,
      zone: 'SIN',
      status: status.delivered ? 'entregado' : status.inTransit ? 'transito' : 'pendiente_recepcion',
      deliveredAt: '',
      incident: '',
      note: get(r, 'note'),
      source: 'importado'
    });
  }
  return {
    valid,
    rejected,
    missingName,
    total: rows.length - 1,
    headers: rows[0],
    issues,
    problemCounts: counts
  };
}

// Compara una importación con la orden ya registrada. Nunca se sobreescribe
// una versión distinta ni se decide por el orden de llegada de las filas.
function importCollisionReason(existing, incoming) {
  if (!existing || !incoming) return '';
  const issues = [];
  if (Math.abs(Number(existing.kg) - Number(incoming.kg)) > 1e-7) issues.push('peso');
  if (Number(existing.qty) !== Number(incoming.qty)) issues.push('cantidad de bultos');
  if ((existing.date || '') !== (incoming.date || '')) issues.push('fecha de orden');
  const wasDelivered = existing.status === 'entregado',
    newDelivered = incoming.status === 'entregado';
  if (wasDelivered !== newDelivered)
    issues.push('estado de entrega (puede corresponder a otra actualización)');
  return issues.length
    ? 'Diferencia en ' + issues.join(', ') + '. Conciliación obligatoria; no se cambió la orden existente.'
    : '';
}
function refreshImportCollisions() {
  const byCode = new Map(db.items.map(p => [norm(p.code), p]));
  for (const p of ui.importRows) {
    const current = byCode.get(norm(p.code));
    p._duplicate = !!current;
    p._conflictExisting = current ? importCollisionReason(current, p) : '';
  }
  if (ui.importStats) {
    ui.importStats.duplicates = ui.importRows.filter(p => p._duplicate).length;
    ui.importStats.conflictsExisting = ui.importRows.filter(p => p._conflictExisting).length;
  }
}

async function loadImport(file) {
  if (!file) return;
  const ext = file.name.toLowerCase().split('.').pop();
  if (!['xlsx', 'csv', 'txt'].includes(ext)) return notify('Usa archivos .xlsx o CSV.', 'error');
  try {
    const rows = ext === 'xlsx' ? await readXlsx(file) : parseCsv(await file.text());
    if (rows.length > 15001)
      throw Error(
        'Importación operativa: máximo 15.000 filas. Para 120.000 usa Entrenamiento IA o ABC masivo (sin guardar el inventario).'
      );
    const result = rowsToParcels(rows),
      existing = new Set(db.items.map(p => norm(p.code)));
    const incoming = result.valid.map(p => ({ ...p, _duplicate: existing.has(norm(p.code)) }));
    ui.importRows = incoming;
    ui.importFile = file.name;
    ui.importStats = { ...result, duplicates: incoming.filter(p => p._duplicate).length };
    refreshImportCollisions();
    render();
    notify(`Revisadas ${result.total} filas: ${incoming.length} válidas, ${result.rejected} rechazadas.`);
  } catch (e) {
    notify(String(e.message || e), 'error');
  }
}

function confirmImport() {
  if (!ui.importRows.length) return notify('No hay órdenes pendientes de importar.', 'error');
  // Revalidación en el momento del guardado: otra pestaña o una operación posterior
  // puede haber alterado la orden desde que se presentó la vista previa.
  refreshImportCollisions();
  const batchSeen = new Set(),
    fresh = [],
    conflicts = [];
  for (const p of ui.importRows) {
    const key = norm(p.code);
    if (!key) continue;
    if (p._conflictExisting) {
      conflicts.push(p);
      continue;
    }
    if (p._duplicate || batchSeen.has(key)) continue;
    batchSeen.add(key);
    fresh.push(p);
  }
  if (!fresh.length) {
    render();
    return notify(
      conflicts.length
        ? `${conflicts.length} órdenes requieren conciliación con el inventario. No se importaron ni se modificaron.`
        : 'Las órdenes ya existen. No se agregaron duplicados.',
      'error'
    );
  }
  if (db.items.length + fresh.length > 15000)
    return notify(
      'El inventario local supera 15.000 registros. Utiliza entrenamiento o ABC masivo.',
      'error'
    );
  db.items = [...db.items, ...fresh.map(({ _duplicate, _conflictExisting, ...rest }) => rest)];
  db.demo = false;
  updateAutomaticABC();
  db.activity.unshift({
    at: new Date().toISOString(),
    type: 'importacion',
    desc: `Se importaron ${fresh.length} guías de ${ui.importFile}; ${conflicts.length} requieren conciliación.`,
    actor: ui.role === 'admin' ? 'Administrador (demo)' : 'Trabajador (demo)'
  });
  db.activity = db.activity.slice(0, 180);
  if (!save()) {
    render();
    return notify('Falló el guardado; no se confirmó ninguna orden nueva.', 'error');
  }
  ui.importRows = conflicts;
  ui.importStats = conflicts.length
    ? { ...ui.importStats, duplicates: conflicts.length, conflictsExisting: conflicts.length }
    : null;
  if (!conflicts.length) ui.importFile = '';
  render();
  notify(
    `Importadas ${fresh.length} guías. ${conflicts.length} discrepancias quedaron en revisión, sin modificar órdenes anteriores.`
  );
}

function renderImport() {
  let stats = ui.importStats,
    rows = ui.importRows;
  return `${head('Importación inteligente de Excel', 'Carga órdenes, revisa campos reconocidos y evita registros duplicados.', btn('export-template', ic('download') + ' Plantilla CSV', 'secondary'))}<div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>${ic('upload', 18)} Cargar archivo de registros</h3><span class="pill wine">.xlsx y .csv</span></div><div class="drop"><div style="color:#a45883;display:flex;justify-content:center;margin-bottom:9px">${ic('file', 35)}</div><div class="drop-title">Selecciona tu Excel o archivo CSV</div><p class="sub" style="max-width:390px;margin:10px auto 15px">Se analiza localmente en tu navegador. No se envía información a un servidor.</p><input id="importFile" type="file" accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div><div class="callout blue" style="margin-top:20px">Reconoce campos como NÚMERO O.S., FECHA, REMITENTE, DESTINATARIO, DESTINO, DETALLE, T. CANTIDAD, T. PESO y ENTREGA. Un estado entregado no permite deducir su fecha de salida.</div><p class="inline-note" style="margin-top:15px">Archivos .xls antiguos: conviértelos a .xlsx o .csv. Hasta 15.000 órdenes para incorporación operativa; para entrenar con más registros utiliza Entrenamiento IA o ABC masivo.</p></div><div class="card card-pad"><div class="card-header"><h3>Validación de importación</h3>${stats ? '<span class="pill green">Vista previa lista</span>' : '<span class="pill">Esperando archivo</span>'}</div>${
    stats
      ? `<h3 style="font-size:13px;margin-bottom:12px">${esc(ui.importFile)}</h3><div class="staff-stat"><div><div class="info-label">Registros leídos</div><strong>${rows.length}</strong></div><div><div class="info-label">Duplicados</div><strong>${stats.duplicates}</strong></div><div><div class="info-label">Para importar</div><strong>${rows.filter(p => !p._duplicate && !p._conflictExisting).length}</strong></div></div><div class="metric-line"><span>Conflictos con órdenes ya registradas</span><strong style="color:#c63748">${stats.conflictsExisting || 0}</strong></div>${
          stats.conflictsExisting
            ? `<div class="callout"><strong>Conciliación:</strong> ${rows
                .filter(p => p._conflictExisting)
                .slice(0, 5)
                .map(p => esc(p.code + ': ' + p._conflictExisting))
                .join(' · ')}. No se sobrescribirá ninguna orden.</div>`
            : ''
        }<div class="metric-line"><span>Filas rechazadas (errores/contradicciones)</span><strong style="color:#c63748">${stats.rejected || 0}</strong></div><div class="metric-line"><span>Sin destinatario explícito</span><strong>${stats.missingName}</strong></div>${
          stats.issues?.length
            ? `<div class="callout"><strong>Ejemplos para revisión:</strong> ${stats.issues
                .slice(0, 3)
                .map(x => esc('Fila ' + x.fila + ': ' + x.problem))
                .join(' · ')}</div>`
            : ''
        }<div class="metric-line"><span>Sin dimensiones físicas</span><strong>${rows.length}</strong></div><div class="callout" style="margin-top:12px">Las guías importadas quedan en tránsito o pendientes de recepción. No se asignan zonas ni se cuentan como existencias físicas hasta confirmar la llegada. Después se necesitarán dimensiones para ubicarlas.</div><div style="margin-top:18px">${btn('import-confirm', ic('check') + ' Confirmar importación', 'primary', `style="width:100%" ${!rows.some(p => !p._duplicate && !p._conflictExisting) ? 'disabled' : ''}`)}</div>`
      : `<div class="empty"><div class="empty-icon">${ic('file', 23)}</div><strong>Sin archivo seleccionado</strong><p>Selecciona tu Excel para revisar las filas antes de registrarlas.</p></div>`
  }</div></div>${
    stats
      ? `<div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Vista previa de registros (${rows.length})</h3><span class="pill">Primeras 25 filas</span></div><div class="table-scroll import-preview"><table><thead><tr><th>Código</th><th>Destinatario</th><th>Fecha</th><th>Peso</th><th>Estado</th><th>Validación</th></tr></thead><tbody>${rows
          .slice(0, 25)
          .map(
            x =>
              `<tr><td class="mono">${esc(x.code)}</td><td>${esc(x.recipient)}</td><td>${esc(x.date || 'Sin fecha')}</td><td>${money(x.kg)} kg</td><td>${statusBadge(x.status)}</td><td><span class="pill ${x._duplicate ? 'red' : 'orange'}">${x._conflictExisting ? 'Conciliar' : x._duplicate ? 'Duplicado' : 'Revisar medidas'}</span></td></tr>`
          )
          .join('')}</tbody></table></div></div>`
      : ''
  }`;
}
