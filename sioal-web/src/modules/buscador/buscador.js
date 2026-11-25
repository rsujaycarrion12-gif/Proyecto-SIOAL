/**
 * Pantalla: Buscador inteligente con puntuación por campo.
 */
'use strict';

function searchScore(p, q) {
  let v = norm(q);
  if (!v) return 1;
  let score = 0;
  for (let [field, points] of [
    [p.code, 15],
    [p.recipient, 9],
    [p.sender, 5],
    [p.dest, 2],
    [p.type, 3],
    [p.note, 3],
    [p.incident, 3]
  ]) {
    let s = norm(field);
    if (s === v) score += points * 3;
    else if (s.startsWith(v)) score += points * 2;
    else if (s.includes(v)) score += points;
  }
  return score;
}
function renderSearch() {
  let q = ui.query;
  let result = db.items
    .map(p => ({ p, score: searchScore(p, q) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, q ? 80 : 15);
  return `${head('Buscador inteligente', 'Encuentra encomiendas utilizando código, destinatario, origen o características.', btn('nav', ic('map') + ' Explorar mapa', 'secondary', 'data-page="mapa"'))}<div class="card card-pad"><div style="display:flex;align-items:center;gap:13px;margin:7px 0 20px"><div class="input-search" style="flex:1">${ic('search', 21)}<input id="smartSearch" class="search-input" style="height:51px;font-size:14px" placeholder="Ej. ENC-000123, María Quispe, caja, Puno..." value="${esc(q)}" autofocus></div>${btn('qr-go', ic('scan') + ' Escanear', 'soft')}</div><div class="flex-row" style="margin-bottom:20px"><span class="sub">Búsquedas rápidas:</span>${['Caja', 'Juliaca', 'Alta', 'ENC-'].map(s => `<button class="pill wine" data-action="search-chip" data-term="${s}" style="border:none;cursor:pointer">${s}</button>`).join('')}</div><div class="callout blue" style="margin-bottom:18px">Este prototipo utiliza coincidencias inteligentes y ponderadas de texto, sin conectarse a un modelo de inteligencia artificial externo. No inventa ubicaciones: muestra solo la zona registrada.</div><div class="card-header"><h3>${q ? 'Resultados de la búsqueda' : 'Encomiendas recientes'}</h3><span class="pill">${result.length} coincidencias visibles</span></div><div class="table-scroll"><table><thead><tr><th>Código y destinatario</th><th>Información</th><th>Ubicación</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${result.map(({ p }) => `<tr><td><strong>${esc(p.code)}</strong><span class="td-muted">${esc(p.recipient)}</span></td><td>${esc(p.type)} · ${money(p.kg)} kg<div class="td-muted">${esc(p.dest)}</div></td><td>${zoneBadge(p.zone)}</td><td>${statusBadge(p.status)}</td><td>${btn('detail', ic('eye') + ' Detalle', 'small', `data-id="${esc(p.id)}"`)} ${btn('label', ic('scan') + ' QR', 'small', `data-id="${esc(p.id)}"`)}</td></tr>`).join('')}</tbody></table></div>${!result.length ? '<div class="empty">No se encontraron coincidencias. Revisa el código o el nombre.</div>' : ''}</div>`;
}
