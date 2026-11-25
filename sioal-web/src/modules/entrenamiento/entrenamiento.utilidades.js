/**
 * Entrenamiento IA: fechas, números, detección de atípicos y acumulador de datos.
 */
'use strict';

function trainingDay(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? d : null;
}
function trainingNextWeek(iso, offset = 1) {
  const d = trainingDay(iso);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + 7 * offset);
  return d.toISOString().slice(0, 10);
}
function trainingDays(a, b) {
  let x = trainingDay(a),
    y = trainingDay(b);
  return x && y ? Math.round((y - x) / 86400000) : 0;
}
function trainingFormatDay(d) {
  if (!d) return '—';
  const x = trainingDay(d);
  return x ? x.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', timeZone: 'UTC' }) : d;
}
function trainingWeeksFilled(data) {
  let arr = (data.weeks || []).slice().sort((a, b) => a.week.localeCompare(b.week));
  if (!arr.length) return [];
  let result = [],
    cursor = arr[0].week,
    lookup = new Map(arr.map(w => [w.week, w]));
  let limit = 0;
  while (cursor <= arr[arr.length - 1].week && limit++ < 550) {
    let found = lookup.get(cursor) || { week: cursor, orders: 0, qty: 0, kg: 0, gap: true };
    let end = trainingNextWeek(cursor, 1);
    let startComplete = data.from <= cursor,
      endComplete = data.to >= trainingNextDay(cursor, 6);
    result.push({
      ...found,
      full: startComplete && endComplete,
      hasData: !!lookup.get(cursor),
      missing: !lookup.get(cursor)
    });
    cursor = end;
  }
  return result;
}
function trainingNextDay(iso, offset) {
  const d = trainingDay(iso);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function trainingFullWeeks() {
  return trainingWeeksFilled(training).filter(w => w.full && w.hasData);
}
function trainingNumber(value) {
  let raw = String(value ?? '')
    .toUpperCase()
    .replace(/KILOGRAMOS|KILOS|KILO|KG|BULTOS|UNIDADES|UND\.?/g, '')
    .replace(/\s/g, '')
    .replace(/[^0-9,.-]/g, '');
  if (!raw) return null;
  const commas = (raw.match(/,/g) || []).length,
    dots = (raw.match(/\./g) || []).length;
  if (commas && dots) {
    const dec = raw.lastIndexOf(',') > raw.lastIndexOf('.') ? ',' : '.';
    raw = raw.replace(dec === ',' ? /\./g : /,/g, '').replace(dec, '.');
  } else if (commas === 1 && dots === 0) raw = raw.replace(',', '.');
  else if (commas > 1) raw = raw.replace(/,/g, '');
  else if (dots > 1) raw = raw.replace(/\./g, '');
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}
// Umbral CONSERVADOR de alerta para el conjunto de prueba, NO es límite físico verificado.
// Los valores sospechosos se ponen en cuarentena, jamás se reemplazan automáticamente.
const TRAIN_WEIGHT_REVIEW_LIMIT_KG = 10000; // valor por defecto solo cuando no hay configuración ABC
// Manifiestos de carga (un camión completo por fila, ~20 000 kg): umbral propio, no el de órdenes.
const TRAIN_MANIFEST_REVIEW_LIMIT_KG = 60000;
const TRAIN_MANIFEST_MEDIAN_KG = 3000; // mediana por registro desde la cual el archivo se trata como manifiestos
function trainingReviewLimitKg(data = training) {
  return data?.recordUnit === 'manifiesto'
    ? Math.max(TRAIN_MANIFEST_REVIEW_LIMIT_KG, sharedReviewWeightKg())
    : sharedReviewWeightKg();
}
function sharedReviewWeightKg() {
  const configured = Number(db?.config?.abc?.maxKgCheck);
  return Number.isFinite(configured) && configured > 0 ? configured : TRAIN_WEIGHT_REVIEW_LIMIT_KG;
}
function trainingWeightConfigMismatch() {
  return (
    !!training &&
    training.reviewThresholdKg !== undefined &&
    training.reviewThresholdKg !== null &&
    Number.isFinite(Number(training.reviewThresholdKg)) &&
    Number(training.reviewThresholdKg) !== trainingReviewLimitKg(training)
  );
}
function trainingWeightAnomaly(kg, limit = sharedReviewWeightKg()) {
  return !Number.isFinite(kg) || kg <= 0
    ? 'Peso no válido'
    : kg > limit
      ? `Peso por encima de ${limit} kg (umbral de revisión ${limit === sharedReviewWeightKg() ? 'compartido ABC/IA' : 'de manifiestos'})`
      : null;
}
// Cuartiles de kg por bulto: criterio conservador, NO es un límite físico ni implica error automático.
function quantileSorted(sorted, p) {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
function trainingStatisticalFence(candidates) {
  if (candidates.length < 30) return null;
  const ordered = candidates
    .map(p => Math.log10(p.kg / p.qty))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (ordered.length < 30) return null;
  const q1 = quantileSorted(ordered, 0.25),
    q3 = quantileSorted(ordered, 0.75),
    med = quantileSorted(ordered, 0.5);
  // Escala logarítmica e IQR permiten comparar mercancías con cantidades distintas.
  // Piso de revisión 500 kg/bulto y ocho veces la mediana: evita alertas por pequeñas fluctuaciones.
  const fence = Math.max(500, 8 * 10 ** med, 10 ** (q3 + 3 * (q3 - q1)));
  return {
    kgPerParcel: fence,
    medianKgPerParcel: 10 ** med,
    q1: 10 ** q1,
    q3: 10 ** q3,
    method: 'IQR log10 × 3, mínimo 500 kg/bulto y 8 veces mediana'
  };
}

// Regla central compartida por entrenamiento y ABC masivo.
// Un número de orden solo puede deduplicarse automáticamente si sus campos operativos coinciden.
function orderVariantConflict(first, other) {
  const d1 = first.ds ?? first.date ?? '',
    d2 = other.ds ?? other.date ?? '';
  return (
    first.kg !== other.kg ||
    first.qty !== other.qty ||
    d1 !== d2 ||
    !!first.delivered !== !!other.delivered ||
    !!first.inTransit !== !!other.inTransit
  );
}
function createTrainingAccumulator(headers, fileName) {
  const col = columnLookup(headers);
  if (col.date < 0) throw Error('Falta FECHA.');
  if (col.kg < 0 || col.qty < 0)
    throw Error('Para entrenar ambos pronósticos se necesitan las columnas T. PESO y T. CANTIDAD.');
  const at = (r, k) => (col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '');
  // Los candidatos solo viven en RAM durante esta importación; se guarda únicamente el resumen.
  const candidates = [],
    weekmap = new Map(),
    d = {
      source: fileName,
      originalFile: fileName,
      kind: 'excel',
      records: 0,
      valid: 0,
      rejected: 0,
      duplicates: 0,
      invalidWeight: 0,
      invalidQty: 0,
      contradictoryStatus: 0,
      missingCode: 0,
      kgValid: 0,
      qtyValid: 0,
      extremeWeight: 0,
      extremeAbsolute: 0,
      extremeStatistical: 0,
      extremeSamples: [],
      conflictingOrders: 0,
      conflictingRows: 0,
      conflictSamples: [],
      reviewThresholdKg: sharedReviewWeightKg(),
      from: '',
      to: '',
      createdAt: isoDay(),
      trained: null,
      sourceVerified: false,
      note: 'FECHA corresponde a la orden, no a llegada física. Cuarentena de pesos sospechosos sin corrección automática.'
    };
  function quarantine(p, reason, kind) {
    d.extremeWeight++;
    d.rejected++;
    if (kind === 'statistical') d.extremeStatistical++;
    else d.extremeAbsolute++;
    if (d.extremeSamples.length < 3000)
      d.extremeSamples.push({ orden: p.code, fecha: p.ds, pesoKg: p.kg, bultos: p.qty, motivo: reason });
  }
  function add(r) {
    if (!r?.some(v => String(v ?? '').trim())) return;
    d.records++;
    const code = at(r, 'code');
    if (!code) {
      d.missingCode++;
      d.rejected++;
      return;
    }
    const state =
      col.delivery < 0 && col.orderStatus < 0
        ? { valid: true, delivered: false }
        : statusFromTwo(at(r, 'delivery'), at(r, 'orderStatus'));
    if (!state.valid) {
      d.contradictoryStatus++;
      d.rejected++;
      return;
    }
    const ds = excelDate(at(r, 'date'));
    if (!trainingDay(ds) || ds > isoDay()) {
      d.rejected++;
      d.futureDates = (d.futureDates || 0) + (ds > isoDay() ? 1 : 0);
      return;
    }
    const kg = parseStrictKg(at(r, 'kg'));
    const qraw = at(r, 'qty'),
      qty = /^\d+$/.test(qraw) ? Number(qraw) : null;
    const weightOk = kg !== null && Number.isFinite(kg) && kg > 0;
    const qtyOk = Number.isSafeInteger(qty) && qty > 0;
    if (!weightOk) d.invalidWeight++;
    if (!qtyOk) d.invalidQty++;
    if (!weightOk || !qtyOk) {
      d.rejected++;
      return;
    }
    // No seleccionar ni descartar una variante antes de conciliar todas las filas del mismo código.
    candidates.push({ code, ds, kg, qty, delivered: !!state.delivered, inTransit: !!state.inTransit });
  }
  function finish() {
    // Motor V2.1: conciliación de NÚMERO O.S. ANTES de calcular cuartiles o entrenar.
    // Duplicados idénticos: se conserva una fila. Variantes discrepantes: ninguna es elegible.
    const byCode = new Map();
    for (const p of candidates) {
      const key = norm(p.code);
      if (!byCode.has(key)) byCode.set(key, []);
      byCode.get(key).push(p);
    }
    const unique = [];
    for (const group of byCode.values()) {
      const first = group[0];
      d.duplicates += group.length - 1;
      const contradiction = group.some(p => orderVariantConflict(first, p));
      if (contradiction) {
        d.conflictingOrders++;
        d.conflictingRows += group.length;
        d.rejected++; // cuenta una orden no elegible; las otras filas figuran como duplicadas
        if (d.conflictSamples.length < 300)
          d.conflictSamples.push({
            orden: first.code,
            filas: group.length,
            variantes: group.slice(0, 4).map(p => ({
              fecha: p.ds,
              pesoKg: p.kg,
              bultos: p.qty,
              entregada: p.delivered,
              transito: p.inTransit
            })),
            motivo:
              'CONCILIAR: variantes del mismo NÚMERO O.S. con fechas, pesos, cantidades o estados distintos'
          });
        continue;
      }
      unique.push(first);
    }
    // Unidad del archivo: si la mediana por registro supera 3 000 kg son manifiestos (camiones), no órdenes.
    const kgsSorted = unique.map(p => p.kg).sort((a, b) => a - b);
    d.recordUnit =
      kgsSorted.length && quantileSorted(kgsSorted, 0.5) >= TRAIN_MANIFEST_MEDIAN_KG ? 'manifiesto' : 'orden';
    d.reviewThresholdKg = trainingReviewLimitKg(d);
    const limit = d.reviewThresholdKg;
    const fence = trainingStatisticalFence(unique.filter(p => !trainingWeightAnomaly(p.kg, limit)));
    d.statisticalFence = fence;
    for (const p of unique) {
      const absolute = trainingWeightAnomaly(p.kg, limit);
      if (absolute) {
        quarantine(p, absolute, 'absolute');
        continue;
      }
      if (fence && p.kg / p.qty > fence.kgPerParcel) {
        quarantine(
          p,
          `Atípico estadístico: ${round(p.kg / p.qty, 2)} kg/bulto supera ${round(fence.kgPerParcel, 2)} kg/bulto`,
          'statistical'
        );
        continue;
      }
      d.kgValid++;
      d.qtyValid++;
      d.valid++;
      const wk = weekStart(p.ds);
      if (!weekmap.has(wk)) weekmap.set(wk, { week: wk, orders: 0, kg: 0, qty: 0 });
      const w = weekmap.get(wk);
      w.orders++;
      w.kg += p.kg;
      w.qty += p.qty;
      if (!d.from || p.ds < d.from) d.from = p.ds;
      if (p.ds > d.to) d.to = p.ds;
    }
    if (!d.valid) throw Error('No hay filas válidas tras la conciliación de códigos y revisión de pesos.');
    return {
      ...d,
      weeks: [...weekmap.values()]
        .sort((a, b) => a.week.localeCompare(b.week))
        .map(w => ({ ...w, kg: round(w.kg, 2), qty: round(w.qty, 2) }))
    };
  }
  return { add, finish };
}
function trainingCsvDelimiter(head) {
  return [';', ',', '\t'].map(sep => [sep, head.split(sep).length]).sort((a, b) => b[1] - a[1])[0][0];
}
