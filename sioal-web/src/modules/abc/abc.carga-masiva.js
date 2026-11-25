/**
 * Clasificación ABC masiva desde CSV (hasta 150.000 filas).
 */
'use strict';

// Un solo separador seguido de exactamente tres dígitos resulta ambiguo:
// "1.234" o "1,234" pueden representar 1,234 o 1234 kg según el país.
function ambiguousKgFormat(raw) {
  if (raw === null || raw === undefined) return false;
  const x = String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s*(KGS?|KILOGRAMOS?|KILOS?)\s*$/, '')
    .replace(/\s/g, '');
  return /^\d{1,3}[.,]\d{3}$/.test(x);
}
function parseStrictKg(raw) {
  if (raw === null || raw === undefined || ambiguousKgFormat(raw)) return null;
  let x = String(raw)
    .trim()
    .toUpperCase()
    .replace(/\s*(KGS?|KILOGRAMOS?|KILOS?)\s*$/, '')
    .replace(/\s/g, '');
  if (!x || !/^[0-9][0-9.,]*$/.test(x)) return null;
  if (x.includes(',') && x.includes('.')) {
    if (/^\d{1,3}(?:\.\d{3})+,\d+$/.test(x)) x = x.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(x)) x = x.replace(/,/g, '');
    else return null;
  } else if (x.includes(',')) {
    if (/^\d{1,3}(?:,\d{3}){2,}$/.test(x)) x = x.replace(/,/g, '');
    else if (/^\d+,\d+$/.test(x)) x = x.replace(',', '.');
    else return null;
  } else if (x.includes('.')) {
    if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(x)) x = x.replace(/\./g, '');
    else if (!/^\d+\.\d+$/.test(x)) return null;
  } else if (!/^\d+$/.test(x)) return null;
  const v = Number(x);
  return Number.isFinite(v) && v > 0 && v < 1e10 ? v : null;
}

function parseCsvBulk(t) {
  // Reutiliza el mismo analizador de CSV, pero sin el límite de 15.000 del registro operativo.
  // Admite 150.000 filas: cubre el archivo de ensayo de 120.000.
  return parseCsvOriginalBulk(t);
}
function parseCsvOriginalBulk(text) {
  return parseDelimitedSioal(text, 150000);
}
async function loadABCBulk(file) {
  if (!file) return;
  let ext = file.name.toLowerCase().split('.').pop();
  if (!['csv', 'xlsx'].includes(ext)) return notify('Selecciona un CSV o Excel XLSX.', 'error');
  abcBusy = true;
  abcBulk = null;
  render();
  try {
    await new Promise(r => setTimeout(r, 40));
    const rows = ext === 'xlsx' ? await readXlsx(file) : parseCsvBulk(await file.text());
    if (rows.length < 2) throw new Error('El archivo no contiene registros para clasificar.');
    const head = rows[0],
      hdr = head.map(stripKey),
      idx = {
        kg: hdr.findIndex(h => aliases.kg.includes(h)),
        code: columnLookup(head).code,
        date: columnLookup(head).date,
        qty: columnLookup(head).qty,
        status: hdr.findIndex(h => h === 'entrega'),
        statusAlt: hdr.findIndex(h => h === 'estado')
      };
    if (idx.kg < 0) throw new Error('No se encontró la columna T. PESO o PESO.');
    if (idx.code < 0) throw new Error('Falta NÚMERO O.S.; no se puede garantizar el control de duplicados.');
    if (idx.date < 0 || idx.qty < 0)
      throw new Error('El ABC masivo requiere FECHA y T. CANTIDAD para comprobar la validez de las órdenes.');
    const records = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some(v => String(v).trim())) continue;
      const code = String(row[idx.code] || '').trim();
      const kg = parseStrictKg(row[idx.kg]);
      const rawDate = String(row[idx.date] ?? '').trim(),
        date = excelDate(rawDate);
      const rawQty = String(row[idx.qty] ?? '').trim(),
        qty = /^\d+$/.test(rawQty) ? Number(rawQty) : NaN;
      const dateProblem = !trainingDay(date)
        ? 'FECHA INVÁLIDA O VACÍA'
        : date > isoDay()
          ? 'FECHA FUTURA'
          : null;
      const qtyProblem = !Number.isSafeInteger(qty) || qty <= 0 ? 'CANTIDAD DE BULTOS INVÁLIDA' : null;
      const statusResult = statusFromTwo(
        idx.status >= 0 ? row[idx.status] : '',
        idx.statusAlt >= 0 ? row[idx.statusAlt] : ''
      );
      const contradiction = !statusResult.valid;
      const delivered = statusResult.delivered;
      records.push({
        id: i,
        row,
        code,
        kg,
        qty,
        date,
        delivered,
        inTransit: !!statusResult.inTransit,
        receiptConfirmed: false,
        duplicate: false,
        contradiction,
        statusReason: statusResult.reason,
        dateProblem,
        qtyProblem,
        abc: '',
        comment: '',
        classificationType: ''
      });
    }
    abcBulk = {
      file: file.name,
      head,
      records,
      stats: null,
      bad: 0,
      duplicates: 0,
      conflicts: 0,
      excluded: 0,
      eligible: 0
    };
    recalcABCBulk();
    notify(`Archivo clasificado: ${money(records.length, 0)} filas`);
  } catch (e) {
    abcBulk = null;
    notify('No se pudo clasificar el archivo: ' + (e.message || e), 'error');
  } finally {
    abcBusy = false;
    render();
  }
}
function recalcABCBulk() {
  if (!abcBulk) return;
  const all = abcBulk.records;
  let bad = 0,
    dups = 0,
    conflicts = 0,
    excluded = 0,
    preclassified = 0;
  const groups = new Map(),
    eligible = [],
    inventoryByCode = new Map(db.items.map(p => [norm(p.code), p]));
  // Conciliación previa: comparar todas las variantes, incluidas entregadas, anuladas y pesos fuera del umbral.
  const variants = new Map(),
    contradictoryCodes = new Set();
  for (const p of all) {
    if (!p.code) continue;
    const key = norm(p.code);
    if (!variants.has(key)) variants.set(key, []);
    variants.get(key).push(p);
  }
  for (const [key, entries] of variants) {
    if (entries.length > 1 && entries.some(x => orderVariantConflict(entries[0], x)))
      contradictoryCodes.add(key);
  }
  for (const p of all) {
    p.abc = '';
    p.comment = '';
    p.classificationType = '';
    p.duplicate = false;
    if (!p.code) {
      p.comment = 'NÚMERO O.S. VACÍO: revisar';
      bad++;
      continue;
    }
    if (contradictoryCodes.has(norm(p.code))) {
      p.abc = '';
      p.classificationType = 'CONCILIACIÓN';
      p.comment = 'CONTRADICCIÓN ENTRE VERSIONES DEL MISMO NÚMERO O.S.: resolver antes de clasificar';
      bad++;
      if ((variants.get(norm(p.code)) || [])[0] === p) conflicts++;
      else {
        dups++;
        p.duplicate = true;
      }
      continue;
    }
    const existing = inventoryByCode.get(norm(p.code));
    if (existing) {
      const collision = importCollisionReason(existing, {
        kg: p.kg,
        qty: p.qty,
        date: p.date,
        status: p.delivered ? 'entregado' : p.inTransit ? 'transito' : 'pendiente_recepcion'
      });
      if (collision) {
        p.classificationType = 'CONCILIACIÓN';
        p.comment = 'ORDEN EXISTENTE: ' + collision;
        bad++;
        conflicts++;
        continue;
      }
    }
    if (p.contradiction) {
      p.comment = (p.statusReason || 'ESTADO O ENTREGA INVÁLIDOS').toUpperCase() + ': revisar';
      bad++;
      continue;
    }
    if (p.dateProblem) {
      p.comment = p.dateProblem + ': revisar';
      bad++;
      continue;
    }
    if (p.qtyProblem) {
      p.comment = p.qtyProblem + ': revisar';
      bad++;
      continue;
    }
    if (abcBulkFilter === 'pending' && p.delivered) {
      p.comment = 'ENTREGADA: excluida del inventario activo';
      excluded++;
      continue;
    }
    if (!validABCWeight(p.kg)) {
      p.comment =
        (ambiguousKgFormat(p.row[abcBulk.head.map(stripKey).findIndex(h => aliases.kg.includes(h))])
          ? 'PESO AMBIGUO (DECIMAL O MILLARES)'
          : abcWeightIssue(p.kg).toUpperCase()) + ': revisar';
      bad++;
      continue;
    }
    const code = norm(p.code);
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(p);
  }
  // Ninguna variante contradictoria participa en el IQR o la clasificación.
  const cleanGroups = [];
  for (const group of groups.values()) {
    const first = group[0];
    const conflict = group.some(p => orderVariantConflict(first, p));
    if (conflict) {
      conflicts++;
      bad += group.length;
      dups += group.length - 1;
      for (let i = 0; i < group.length; i++) {
        const p = group[i];
        p.duplicate = i > 0;
        p.abc = '';
        p.classificationType = 'CONCILIACIÓN';
        p.comment =
          'ORDEN CONTRADICTORIA: varias filas del mismo NÚMERO O.S. con pesos, fechas, cantidades o estados diferentes; revisar todas las variantes';
      }
      continue;
    }
    cleanGroups.push(group);
  }
  const representatives = cleanGroups.map(group => group[0]);
  const representativeReview = sharedWeightReview(representatives);
  for (const group of cleanGroups) {
    for (let i = 1; i < group.length; i++) {
      const p = group[i];
      p.duplicate = true;
      p.comment = 'DUPLICADO IDÉNTICO: excluido';
      p.classificationType = 'DUPLICADO';
      dups++;
    }
    const chosen = group[0];
    if (representativeReview.reasons.has(chosen.id)) {
      chosen.abc = '';
      chosen.classificationType = 'REVISIÓN_PESO';
      chosen.comment = representativeReview.reasons.get(chosen.id) + ': revisar antes de clasificar';
      bad++;
      continue;
    }
    eligible.push(chosen);
  }
  const rank = classedWeight(eligible);
  for (const p of eligible) {
    if (rank.reviewReasons.has(p.id)) {
      p.abc = '';
      p.classificationType = 'REVISIÓN_PESO';
      p.comment = rank.reviewReasons.get(p.id) + ': revisar antes de clasificar';
      bad++;
      continue;
    }
    p.abc = rank.map.get(p.id);
    // El archivo de órdenes NO acredita una recepción física, aunque diga NO ENTREGADO.
    p.classificationType = p.delivered ? 'HISTÓRICO' : 'PRECLASIFICACIÓN';
    p.comment = p.delivered
      ? 'HISTÓRICO ENTREGADO: no está en almacén'
      : p.inTransit
        ? 'PRECLASIFICACIÓN EN TRÁNSITO: fuera del inventario físico; recepción pendiente'
        : 'PRECLASIFICACIÓN: recepción física y dimensiones por confirmar';
    if (!p.delivered) preclassified++;
  }
  abcBulk.stats = rank.stats;
  abcBulk.bad = bad;
  abcBulk.duplicates = dups;
  abcBulk.conflicts = conflicts;
  abcBulk.excluded = excluded;
  abcBulk.eligible = rank.validCount;
  abcBulk.preclassified = preclassified;
  abcBulk.physicalConfirmed = 0;
}
function bulkCsvEscape(v) {
  return csvEscape(v);
}
function exportABCBulk() {
  if (!abcBulk) return notify('Primero carga un archivo.', 'error');
  const head = [
    ...abcBulk.head,
    'CLASE_ABC_PESO',
    'TIPO_CLASIFICACION',
    'OBSERVACION_ABC',
    'UBICACION_FISICA'
  ];
  let lines = ['\uFEFF' + head.map(bulkCsvEscape).join(';')];
  for (const p of abcBulk.records)
    lines.push(
      [
        ...p.row,
        p.abc || 'NO CLASIFICADA',
        p.classificationType || 'EXCLUIDA / POR REVISAR',
        p.comment || 'Revisar',
        'SIN UBICACIÓN FÍSICA CONFIRMADA'
      ]
        .map(bulkCsvEscape)
        .join(';')
    );
  const name = 'SIOAL_ABC_PESO_' + (abcBulkFilter === 'pending' ? 'PENDIENTES' : 'HISTORICO') + '.csv';
  downloadBlob(new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), name);
  notify('CSV de clasificación ABC exportado.');
}
