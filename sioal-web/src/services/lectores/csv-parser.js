/**
 * Parser de CSV/TSV con detección estricta de delimitador.
 */
'use strict';

function csvDelimiterStrict(text) {
  const first =
    text
      .slice(0, 2000)
      .replace(/^\uFEFF/, '')
      .split(/\r?\n/)[0] || '';
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let quoted = false;
  for (let i = 0; i < first.length; i++) {
    const ch = first[i];
    if (ch === '"') {
      if (quoted && first[i + 1] === '"') {
        i++;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (!quoted && Object.prototype.hasOwnProperty.call(counts, ch)) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}
function parseDelimitedSioal(text, maxRows = 15000) {
  const sep = csvDelimiterStrict(text);
  let rows = [],
    row = [],
    cell = '',
    quoted = false,
    justClosed = false;
  const emit = () => {
    row.push(cell);
    if (row.some(x => String(x).trim())) rows.push(row);
    if (rows.length > maxRows + 1)
      throw new Error(`El archivo supera ${maxRows} filas. Divídelo para continuar.`);
    row = [];
    cell = '';
    justClosed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          justClosed = true;
        }
      } else cell += ch;
      continue;
    }
    if (ch === '"') {
      if (cell.length || justClosed)
        throw new Error('CSV inválido: comillas mal ubicadas. Revisa la fila ' + (rows.length + 1));
      quoted = true;
      continue;
    }
    if (justClosed && ch !== sep && ch !== '\n' && ch !== '\r') {
      if (ch === ' ' || ch === '\t') continue;
      throw new Error('CSV inválido: texto después de comillas. Fila ' + (rows.length + 1));
    }
    if (ch === sep) {
      row.push(cell);
      cell = '';
      justClosed = false;
      continue;
    }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      emit();
      continue;
    }
    cell += ch;
  }
  if (quoted) throw new Error('CSV inválido: comillas sin cerrar al terminar el archivo.');
  if (row.length || cell.length || justClosed) emit();
  return rows;
}
function parseCsv(text) {
  return parseDelimitedSioal(text, 15000);
}
