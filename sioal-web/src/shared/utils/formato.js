/**
 * Utilidades de formato: escape HTML, números, redondeo y fechas ISO.
 */
'use strict';

const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const money = (n, dp = 1) =>
  Number(n || 0).toLocaleString('es-PE', { maximumFractionDigits: dp, minimumFractionDigits: 0 });
const nval = v => Math.max(0, Number(v) || 0);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const isoDay = (v = new Date()) => {
  let d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime())
    ? ''
    : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const shiftDay = (days, from = new Date()) => {
  let d = new Date(from);
  d.setDate(d.getDate() + days);
  return isoDay(d);
};
function daySpan(date) {
  if (!date) return 0;
  let a = new Date(date + 'T12:00:00'),
    b = new Date(isoDay() + 'T12:00:00');
  return Math.max(0, Math.round((b - a) / 86400000));
}
