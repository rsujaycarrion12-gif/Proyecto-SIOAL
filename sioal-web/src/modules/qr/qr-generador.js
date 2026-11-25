/**
 * Generador de códigos QR (versión 3-L) y etiquetas descargables.
 */
'use strict';

/* Código QR v3-L, datos hasta 53 bytes UTF-8 (versión fija para uso demostrativo). */
function qrMatrix(text) {
  let data = new TextEncoder().encode(String(text));
  if (data.length > 53) throw new Error('La etiqueta admite hasta 53 bytes. Utiliza un código más corto.');
  let bits = [];
  function add(v, n) {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  }
  add(4, 4);
  add(data.length, 8);
  data.forEach(b => add(b, 8));
  for (let i = 0; i < Math.min(4, 440 - bits.length); i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  let payload = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    payload.push(v);
  }
  let padN = 0;
  while (payload.length < 55) payload.push(padN++ % 2 === 0 ? 0xec : 0x11);
  function mul(a, b) {
    let out = 0;
    for (let i = 7; i >= 0; i--) {
      out = (out << 1) ^ (out & 0x80 ? 0x11d : 0);
      if ((b >>> i) & 1) out ^= a;
    }
    return out;
  }
  let gen = [1],
    root = 1;
  for (let i = 0; i < 15; i++) {
    let next = Array(gen.length + 1).fill(0);
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gen[j];
      next[j + 1] ^= mul(gen[j], root);
    }
    gen = next;
    root = mul(root, 2);
  }
  let ecc = Array(15).fill(0);
  for (let b of payload) {
    let factor = b ^ ecc.shift();
    ecc.push(0);
    for (let j = 0; j < 15; j++) ecc[j] ^= mul(gen[j + 1], factor);
  }
  let all = [...payload, ...ecc],
    N = 29,
    mat = Array.from({ length: N }, () => Array(N).fill(false)),
    isFunc = Array.from({ length: N }, () => Array(N).fill(false));
  function set(x, y, v) {
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    mat[y][x] = !!v;
    isFunc[y][x] = true;
  }
  function finder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        let distance = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, distance !== 2 && distance !== 4);
      }
  }
  finder(3, 3);
  finder(N - 4, 3);
  finder(3, N - 4);
  for (let i = 8; i < N - 8; i++) {
    set(i, 6, i % 2 === 0);
    set(6, i, i % 2 === 0);
  }
  for (let y = 20; y <= 24; y++)
    for (let x = 20; x <= 24; x++) {
      let d = Math.max(Math.abs(x - 22), Math.abs(y - 22));
      set(x, y, d !== 1);
    }
  /* Reservar bits de formato QR (nivel L + máscara 0). */
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) set(8, i, false);
    if (i !== 6) set(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    set(N - 1 - i, 8, false);
    set(8, N - 1 - i, false);
  }
  set(8, N - 8, true);
  let dataBits = [];
  for (let b of all) addByte(b);
  function addByte(b) {
    for (let i = 7; i >= 0; i--) dataBits.push((b >>> i) & 1);
  }
  let k = 0;
  for (let right = N - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < N; vert++) {
      let y = ((right + 1) & 2) === 0 ? N - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        let x = right - j;
        if (!isFunc[y][x]) {
          let bit = k < dataBits.length ? dataBits[k++] : 0;
          mat[y][x] = !!(bit ^ ((x + y) % 2 === 0));
        }
      }
    }
  }
  let formatData = 8,
    rem = formatData;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ (((rem >>> 9) & 1) * 0x537);
  let f = ((formatData << 10) | rem) ^ 0x5412;
  function formatBit(i) {
    return ((f >>> i) & 1) !== 0;
  }
  for (let i = 0; i <= 5; i++) set(8, i, formatBit(i));
  set(8, 7, formatBit(6));
  set(8, 8, formatBit(7));
  set(7, 8, formatBit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, formatBit(i));
  for (let i = 0; i < 8; i++) set(N - 1 - i, 8, formatBit(i));
  for (let i = 8; i < 15; i++) set(8, N - 15 + i, formatBit(i));
  set(8, N - 8, true);
  return mat;
}
function qrSvg(text) {
  let mat = qrMatrix(text),
    quiet = 4,
    n = mat.length + quiet * 2;
  let body = mat
    .flatMap((r, y) =>
      r.map((c, x) => (c ? `<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>` : ''))
    )
    .join('');
  return `<svg viewBox="0 0 ${n} ${n}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código QR de ${esc(text)}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="white"/><g fill="#22172d">${body}</g></svg>`;
}
function qrLabel(id) {
  let p = getParcel(id);
  if (!p) return;
  let code = p.code;
  if (new TextEncoder().encode(code).length > 53)
    return notify('El código es demasiado largo para la etiqueta QR de este prototipo.', 'error');
  openModal(
    'Etiqueta de identificación',
    `Código: ${code}`,
    `<div class="print-label"><div style="font-size:18px;font-weight:900;color:#50213f">SIOAL 2.0 · OCHOA</div><p class="sub">Encomienda identificada</p><div class="qr-container">${qrSvg(code)}</div><strong class="mono" style="font-size:20px;letter-spacing:1px">${esc(code)}</strong><div style="margin-top:8px">${esc(p.recipient)} · ${esc(p.dest)} · ${esc(p.zone === 'SIN' ? 'SIN ZONA' : 'ZONA ' + p.zone)}</div><div class="modal-actions no-print" style="margin-top:17px;padding:0;justify-content:center">${btn('label-download', ic('download') + ' Exportar SVG QR', 'soft', `data-id="${esc(p.id)}"`)}${btn('label-print', ic('file') + ' Imprimir etiqueta', 'primary')}</div></div>`,
    470
  );
}
function downloadQr(id) {
  let p = getParcel(id);
  if (!p) return;
  let content = qrSvg(p.code).replace('<svg ', '<svg width="300" height="300" ');
  downloadBlob(
    new Blob([content], { type: 'image/svg+xml;charset=utf-8' }),
    `QR_${safeFilename(p.code)}.svg`
  );
}
