/**
 * Lector de archivos Excel (.xlsx) sin librerías: ZIP + XML.
 */
'use strict';

function xmlChildren(node, name) {
  return Array.from(node.getElementsByTagName(name));
}
function cellIndex(ref) {
  let letters = String(ref || '').match(/^[A-Z]+/)?.[0] || 'A',
    n = 0;
  for (let c of letters) n = n * 26 + c.charCodeAt(0) - 64;
  return n - 1;
}
function excelDate(value) {
  if (value === undefined || value === null) return '';
  const s = String(value).trim();
  if (!s) return '';
  let y, m, d, match;
  if (
    (match = s.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/
    ))
  ) {
    [, y, m, d] = match;
  } else if ((match = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/))) {
    [, d, m, y] = match;
  } else if ((match = s.match(/^(\d{4})[\/](\d{1,2})[\/](\d{1,2})$/))) {
    [, y, m, d] = match;
  } else if (/^\d{4,6}(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 25000 && n < 80000) {
      const day = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
      return day.toISOString().slice(0, 10);
    }
    return '';
  } else return '';
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return trainingDay(iso) ? iso : '';
}
async function readZipEntries(file) {
  if (file.size > 25_000_000)
    throw Error('Excel demasiado grande para este importador local (máximo 25 MB). Utiliza CSV por lotes.');
  let buf = await file.arrayBuffer(),
    v = new DataView(buf),
    u = new Uint8Array(buf),
    pos = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      pos = i;
      break;
    }
  }
  if (pos < 0) throw new Error('Archivo ZIP/XLSX no reconocido.');
  let offset = v.getUint32(pos + 16, true),
    total = v.getUint16(pos + 10, true),
    entries = new Map(),
    dec = new TextDecoder();
  for (let i = 0; i < total; i++) {
    if (v.getUint32(offset, true) !== 0x02014b50) throw new Error('Directorio de XLSX incompleto.');
    let method = v.getUint16(offset + 10, true),
      length = v.getUint32(offset + 20, true),
      nameLen = v.getUint16(offset + 28, true),
      extraLen = v.getUint16(offset + 30, true),
      commentLen = v.getUint16(offset + 32, true),
      localOffset = v.getUint32(offset + 42, true),
      name = dec.decode(u.slice(offset + 46, offset + 46 + nameLen));
    entries.set(name, { method, length, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, u, v };
}
async function getZipEntry(zip, name) {
  let x = zip.entries.get(name);
  if (!x) return null;
  let { u, v } = zip,
    o = x.localOffset;
  if (v.getUint32(o, true) !== 0x04034b50) throw new Error('Cabecera XLSX dañada.');
  let start = o + 30 + v.getUint16(o + 26, true) + v.getUint16(o + 28, true),
    slice = u.slice(start, start + x.length);
  if (x.method === 0) return new TextDecoder().decode(slice);
  if (x.method !== 8) throw new Error('Compresión XLSX no compatible.');
  if (typeof DecompressionStream === 'undefined')
    throw new Error('Tu navegador no admite descompresión ZIP. Convierte el Excel a CSV.');
  try {
    let ds = new DecompressionStream('deflate-raw');
    let stream = new Blob([slice]).stream().pipeThrough(ds);
    let reader = stream.getReader(),
      parts = [],
      bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 65_000_000) {
        await reader.cancel();
        throw Error('Entrada XLSX descomprimida demasiado grande.');
      }
      parts.push(value);
    }
    let result = new Uint8Array(bytes),
      offset = 0;
    for (const chunk of parts) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(result);
  } catch (e) {
    if (String(e?.message || '').includes('demasiado grande')) throw e;
    throw new Error('No se pudo descomprimir el XLSX en este navegador. Utiliza CSV.');
  }
}
async function readXlsx(file) {
  const z = await readZipEntries(file),
    shared = [];
  let ss = await getZipEntry(z, 'xl/sharedStrings.xml');
  const decode = s =>
    String(s ?? '').replace(/&(#x[\da-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (all, code) => {
      if (code === 'amp') return '&';
      if (code === 'lt') return '<';
      if (code === 'gt') return '>';
      if (code === 'quot') return '"';
      if (code === 'apos') return "'";
      let num = code.startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(num) ? String.fromCodePoint(num) : all;
    });
  if (ss) {
    let re = /<(?:[\w.-]+:)?si\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?si>/g,
      m;
    while ((m = re.exec(ss)) !== null) {
      let out = '';
      for (const t of m[1].matchAll(/<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g))
        out += decode(t[1]);
      shared.push(out);
    }
  }
  const sheets = [...z.entries.keys()].filter(x => /^xl\/worksheets\/[^/]+\.xml$/.test(x)).sort();
  if (!sheets.length) throw Error('No se encontró una hoja de cálculo legible.');
  const book = (await getZipEntry(z, 'xl/workbook.xml')) || '',
    rels = (await getZipEntry(z, 'xl/_rels/workbook.xml.rels')) || '';
  const desired = book.match(
    /<(?:[\w.-]+:)?sheet\b[^>]*\bname=["'](?:Órdenes|Ordenes|ORDENES|ÓRDENES)["'][^>]*>/i
  );
  let named = '';
  if (desired) {
    const id = desired[0].match(/(?:r:)?id=["']([^"']+)["']/)?.[1];
    if (id) {
      const links = [...rels.matchAll(/<(?:[\w.-]+:)?Relationship\b[^>]*>/g)];
      const line = links.find(m => m[0].includes('Id="' + id + '"') || m[0].includes("Id='" + id + "'"));
      const target = line?.[0].match(/\bTarget=["']([^"']+)["']/)?.[1];
      if (target) {
        const path = new URL(target, 'https://sioal.invalid/xl/').pathname.replace(/^\//, '');
        if (z.entries.has(path)) named = path;
      }
    }
  }
  let name = named || sheets[0],
    content = await getZipEntry(z, name);
  if (!named) {
    for (const candidate of sheets) {
      const data = await getZipEntry(z, candidate);
      if (!data) continue;
      const sample = data.slice(0, 35000);
      const headerText = (sample + ' ' + shared.slice(0, 80).join(' ')).toLowerCase();
      if (/n[úu]mero o\.s\.|numeros|t\. peso|tcantidad/i.test(headerText)) {
        name = candidate;
        content = data;
        break;
      }
    }
  }
  if (!content) throw new Error('La hoja Excel está vacía.');
  const rowPattern = /<(?:[\w.-]+:)?row\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?row>/g;
  const cellPattern = /<(?:[\w.-]+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?c>)/g;
  const vPattern = /<(?:[\w.-]+:)?v\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?v>/;
  const tPattern = /<(?:[\w.-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[\w.-]+:)?t>/g;
  const rows = [];
  let rowMatch;
  while ((rowMatch = rowPattern.exec(content)) !== null) {
    if (rows.length >= 15000)
      throw new Error(
        'Excel supera las 15.000 filas por hoja admitidas en el navegador. Divide el XLSX en bloques o usa CSV para entrenamiento masivo.'
      );
    const row = [],
      body = rowMatch[1];
    cellPattern.lastIndex = 0;
    let cm;
    while ((cm = cellPattern.exec(body)) !== null) {
      const attrs = cm[1],
        r = attrs.match(/\br="([A-Z]+\d+)"/),
        type = attrs.match(/\bt="([^"]+)"/)?.[1] || '',
        idx = cellIndex(r?.[1] || 'A');
      const cellBody = cm[2] || '';
      let v = vPattern.exec(cellBody)?.[1] || '';
      if (type === 's') v = shared[Number(v)] || '';
      else if (type === 'inlineStr') {
        v = '';
        for (const tm of cellBody.matchAll(tPattern)) v += decode(tm[1]);
      } else v = decode(v);
      row[idx] = v;
    }
    rows.push(row.map(v => v ?? ''));
  }
  if (!rows.length) throw new Error('No se pudieron leer filas del Excel. Comprueba la hoja Órdenes.');
  return rows;
}
