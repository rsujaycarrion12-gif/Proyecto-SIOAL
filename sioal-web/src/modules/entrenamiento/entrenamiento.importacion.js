/**
 * Entrenamiento IA: lectura de CSV por lotes (hasta 350.000 filas).
 */
'use strict';

/* Lectura por lotes: no almacena 120.000 órdenes completas en RAM. */
async function trainingCSVStream(file) {
  // Mismo criterio de comillas estricto que parseDelimitedSioal, sin cargar el CSV completo en RAM.
  const reader = file.stream().getReader(),
    decoder = new TextDecoder('utf-8');
  let sep = null,
    acc = null,
    pending = '',
    state = 'START',
    cell = '',
    row = [],
    rowNo = 1,
    skipLF = false;
  function emit() {
    row.push(cell);
    if (row.some(v => String(v).trim())) acc.add(row);
    row = [];
    cell = '';
    state = 'START';
    rowNo++;
    if (rowNo > 350001) throw Error('Máximo 350.000 filas en el navegador.');
  }
  function feed(chunk) {
    for (let i = 0; i < chunk.length; i++) {
      const ch = chunk[i];
      if (skipLF) {
        skipLF = false;
        if (ch === '\n') continue;
      }
      if (state === 'QUOTED') {
        if (ch === '"') {
          state = 'AFTER_QUOTE';
        } else cell += ch;
        continue;
      }
      if (state === 'AFTER_QUOTE') {
        if (ch === '"') {
          cell += '"';
          state = 'QUOTED';
          continue;
        }
        if (ch === ' ' || ch === '\t') continue;
        if (ch !== sep && ch !== '\n' && ch !== '\r')
          throw Error('CSV inválido: texto después de comillas. Fila ' + rowNo);
      } else if (ch === '"') {
        if (state !== 'START') throw Error('CSV inválido: comillas mal ubicadas. Fila ' + rowNo);
        state = 'QUOTED';
        continue;
      }
      if (ch === sep) {
        row.push(cell);
        cell = '';
        state = 'START';
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        emit();
        if (ch === '\r') skipLF = true;
        continue;
      }
      if (state === 'START') state = 'UNQUOTED';
      cell += ch;
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      let text = decoder.decode(value, { stream: true });
      if (sep === null) {
        pending += text;
        const ix = pending.indexOf('\n');
        if (ix < 0) {
          if (pending.length > 200000) throw Error('Cabecera CSV demasiado grande.');
          continue;
        }
        const first = pending
          .slice(0, ix)
          .replace(/\r$/, '')
          .replace(/^\uFEFF/, '');
        sep = csvDelimiterStrict(first);
        const h = parseDelimitedSioal(first + '\n', 2)[0];
        if (!h || h.length < 2) throw Error('No se encontraron columnas CSV válidas.');
        acc = createTrainingAccumulator(h, file.name);
        text = pending.slice(ix + 1);
        pending = '';
        rowNo = 2;
      }
      feed(text);
    }
    const remainder = decoder.decode();
    if (remainder) feed(remainder);
    if (state === 'QUOTED') throw Error('CSV inválido: comillas sin cerrar al final del archivo.');
    if (!acc) throw Error('CSV sin encabezados y filas de datos.');
    if (row.length || cell.length || state === 'AFTER_QUOTE') emit();
    return acc.finish();
  } finally {
    reader.releaseLock();
  }
}

function trainingRowsToDataset(rows, fileName) {
  if (rows.length < 2) throw Error('El archivo no contiene registros suficientes.');
  const acc = createTrainingAccumulator(rows[0], fileName);
  for (let i = 1; i < rows.length; i++) acc.add(rows[i]);
  return acc.finish();
}
function trainingFromStored() {
  if (!db.items.length) throw Error('No hay encomiendas registradas.');
  let rows = [['NÚMERO O.S.', 'FECHA', 'T. CANTIDAD', 'T. PESO']];
  for (const p of db.items) rows.push([p.code, p.date, p.qty, p.kg]);
  const d = trainingRowsToDataset(rows, 'Registros actuales del prototipo');
  d.kind = db.demo ? 'demo-registros' : 'registros';
  return d;
}
function trainingDemo() {
  let weeks = [],
    d = '2026-06-01';
  for (let i = 0; i < 22; i++) {
    let orders = Math.round(700 + i * 13 + 65 * Math.sin(i * 0.68) + (i % 5 === 0 ? 45 : 0));
    let qty = Math.round(orders * 5.7 + 180 * Math.sin(i * 0.43)),
      kg = Math.round(orders * 175 + 12500 * Math.cos(i * 0.55));
    weeks.push({ week: d, orders, qty, kg });
    d = trainingNextWeek(d);
  }
  return {
    source: 'Datos ficticios generados exclusivamente para probar el entrenamiento',
    kind: 'demo',
    records: weeks.reduce((s, x) => s + x.orders, 0),
    valid: weeks.reduce((s, x) => s + x.orders, 0),
    rejected: 0,
    duplicates: 0,
    invalidWeight: 0,
    invalidQty: 0,
    from: weeks[0].week,
    to: trainingNextDay(weeks.at(-1).week, 6),
    weeks,
    trained: null,
    createdAt: isoDay(),
    originalFile: 'Simulación de 22 semanas',
    note: 'Datos sintéticos. Nunca deben confundirse con actividad real de Transportes Ochoa.'
  };
}
/**
 * Varios Excel de TITANICSOFT (p. ej. una exportación por mes) en un solo conjunto.
 * Las columnas de cada archivo se alinean por nombre con las del primero; el acumulador concilia
 * después los NÚMERO repetidos entre archivos (duplicados idénticos se cuentan una sola vez).
 */
async function trainingRowsFromFiles(files) {
  let headers = null,
    out = [];
  const meta = [];
  for (const f of files) {
    const rows = await readXlsx(f);
    if (rows.length < 2) {
      meta.push({ archivo: f.name, filas: 0 });
      continue;
    }
    if (!headers) {
      headers = rows[0];
      out.push(headers);
    }
    const keys = headers.map(stripKey),
      own = rows[0].map(stripKey),
      map = keys.map(k => own.indexOf(k));
    if (map.every(i => i < 0)) throw Error(`Las columnas de ${f.name} no coinciden con las del primer archivo.`);
    for (let i = 1; i < rows.length; i++) out.push(map.map(j => (j >= 0 ? rows[i][j] : '')));
    meta.push({ archivo: f.name, filas: rows.length - 1 });
  }
  if (!headers) throw Error('Los archivos no contienen registros.');
  return { rows: out, meta };
}
async function trainingImportFile(input) {
  const files = Array.isArray(input) ? input.filter(Boolean) : input ? [input] : [];
  if (files.length > 1) return trainingImportFiles(files);
  const file = files[0];
  if (!file) return;
  const ext = file.name.toLowerCase().split('.').pop();
  if (!['xlsx', 'csv', 'txt'].includes(ext)) return notify('Selecciona Excel XLSX o CSV.', 'error');
  try {
    notify('Leyendo y validando los registros; archivos grandes pueden tardar…');
    const next =
      ext === 'xlsx' ? trainingRowsToDataset(await readXlsx(file), file.name) : await trainingCSVStream(file);
    next.sourceVerified = false;
    training = next;
    trainUI.tab = 'validacion';
    if (!trainingSave()) {
      render();
      return;
    }
    render();
    notify(
      `Analizadas ${money(next.records, 0)} filas: ${money(next.valid, 0)} válidas y ${money(next.duplicates, 0)} duplicadas.`
    );
  } catch (err) {
    notify('Error de importación: ' + (err.message || err), 'error');
    console.error(err);
  }
}

async function trainingImportFiles(files) {
  if (files.some(f => f.name.toLowerCase().split('.').pop() !== 'xlsx'))
    return notify('Para combinar varios archivos selecciona solo Excel .xlsx exportados de TITANICSOFT.', 'error');
  try {
    notify(`Leyendo ${files.length} archivos y conciliando manifiestos repetidos…`);
    const t0 = performance.now();
    const { rows, meta } = await trainingRowsFromFiles(files);
    const next = trainingRowsToDataset(rows, files.map(f => f.name).join(' + '));
    next.sourceFiles = meta;
    next.importMs = Math.round(performance.now() - t0);
    next.sourceVerified = false;
    training = next;
    trainUI.tab = 'validacion';
    if (!trainingSave()) {
      render();
      return;
    }
    render();
    notify(
      `${files.length} archivos · ${money(next.records, 0)} filas: ${money(next.valid, 0)} válidas y ${money(next.duplicates, 0)} repetidas entre archivos.`
    );
  } catch (err) {
    notify('Error de importación: ' + (err.message || err), 'error');
    console.error(err);
  }
}
