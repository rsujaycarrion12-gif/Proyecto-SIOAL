/**
 * Componentes de interfaz reutilizables: notificaciones, botones, badges,
 * encabezados de página, tarjetas KPI y ventanas modales.
 */
'use strict';

function notify(t, type = 'success') {
  let old = document.querySelector('.notification');
  if (old) old.remove();
  let d = document.createElement('div');
  d.className = 'notification ' + type;
  d.innerHTML = ic(type === 'error' ? 'info' : 'check') + `<span>${esc(t)}</span>`;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4100);
}
function btn(action, title, kind = 'secondary', extra = '') {
  return `<button type="button" class="btn ${kind === 'secondary' ? '' : kind}" data-action="${action}" ${extra}>${title}</button>`;
}
function capStyle(z) {
  return { A: '#e83d3d', B: '#e9b513', C: '#2467db' }[z] || '#9f94a7';
}
function zoneBadge(z) {
  return z === 'SIN'
    ? '<span class="pill orange">Sin asignar</span>'
    : `<span class="pill" style="background:${z === 'A' ? '#fff0ee' : z === 'B' ? '#fff7dc' : '#eaf2ff'};color:${z === 'A' ? '#b92e32' : z === 'B' ? '#946b00' : '#215ac5'};border:1px solid ${z === 'A' ? '#ffd1cc' : z === 'B' ? '#f8e2a4' : '#c8dcff'}">Zona ${esc(z)}</span>`;
}
function statusBadge(s) {
  return `<span class="pill ${s === 'entregado' ? 'green' : s === 'incidencia' ? 'red' : s === 'transito' || s === 'pendiente_recepcion' ? 'orange' : 'blue'}">${s === 'entregado' ? 'Entregada' : s === 'incidencia' ? 'Con incidencia' : s === 'transito' ? 'En tránsito' : s === 'pendiente_recepcion' ? 'Recepción por confirmar' : 'En almacén'}</span>`;
}

function head(title, sub, action = '') {
  return `<div class="page-head"><div><div class="eyebrow">SIOAL 2.0 / ${esc(pages[ui.page].title)}</div><h1>${title}</h1><p>${sub}</p></div>${action ? `<div class="flex-row">${action}</div>` : ''}</div>`;
}
function kpi(label, value, note, ico, color = '') {
  return `<div class="card kpi"><div><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-note">${note}</div></div><div class="kpi-icon ${color}">${ic(ico, 20)}</div></div>`;
}

function openModal(title, sub, html, width = 610) {
  let root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-backdrop"><div class="modal" style="width:min(${width}px,100%)" role="dialog" aria-modal="true"><div class="modal-head"><div><h2>${esc(title)}</h2><p class="sub" style="margin:0">${esc(sub || '')}</p></div><button class="icon-btn" data-action="modal-close" title="Cerrar">${ic('close', 17)}</button></div><div class="modal-body">${html}</div></div></div>`;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  document.body.style.overflow = '';
}
