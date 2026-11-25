/**
 * Pantalla: Reportes y pronósticos semanales/mensuales.
 */
'use strict';

function weekStart(s) {
  if (!s) return '';
  let d = new Date(s + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  let dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return isoDay(d);
}
function weeklyData() {
  let map = new Map();
  for (let p of db.items) {
    let wk = weekStart(p.date);
    if (!wk) continue;
    if (!map.has(wk)) map.set(wk, { week: wk, qty: 0, kg: 0, orders: 0, delivered: 0 });
    let r = map.get(wk);
    r.qty += nval(p.qty);
    r.kg += nval(p.kg);
    r.orders++;
    if (p.status === 'entregado') r.delivered++;
  }
  return [...map.values()].sort((a, b) => a.week.localeCompare(b.week));
}
function monthTotals() {
  let ym = isoDay().slice(0, 7);
  let items = db.items.filter(p => p.date?.startsWith(ym));
  return {
    label: ym,
    orders: items.length,
    kg: round(
      items.reduce((a, p) => a + nval(p.kg), 0),
      1
    ),
    qty: items.reduce((a, p) => a + nval(p.qty), 0)
  };
}
function barChart(data, field) {
  if (!data.length) return '<div class="empty">Sin datos disponibles</div>';
  let max = Math.max(1, ...data.map(x => x[field])),
    width = 620,
    height = 225,
    padL = 20,
    padT = 14,
    barSlot = (width - 45) / data.length,
    barWidth = Math.min(43, barSlot * 0.55);
  let rect = data
    .map((d, i) => {
      let bh = Math.max(2, (d[field] / max) * (height - 70)),
        x = padL + i * barSlot + (barSlot - barWidth) / 2,
        y = height - 45 - bh;
      return `<g><rect x="${x}" y="${y}" width="${barWidth}" height="${bh}" rx="5" fill="${i === data.length - 1 ? '#6a2a55' : '#c99bb7'}"><title>${esc(d.week)} · ${money(d[field])}</title></rect><text x="${x + barWidth / 2}" y="${y - 6}" fill="#69576a" font-size="11" text-anchor="middle">${money(d[field], 0)}</text><text x="${x + barWidth / 2}" y="${height - 21}" fill="#958699" font-size="10" text-anchor="middle">${esc(d.week.slice(5))}</text></g>`;
    })
    .join('');
  return `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Gráfico semanal de ${field === 'kg' ? 'kilogramos' : 'cantidad de encomiendas'}"><path d="M${padL} ${height - 45}H${width - 10}" stroke="#ddd7df"/>${rect}</svg>`;
}
function simpleForecast(data, field) {
  const thisWeek = weekStart(isoDay());
  const complete = data
    .filter(x => trainingDay(x.week) && x.week < thisWeek)
    .sort((a, b) => a.week.localeCompare(b.week));
  const recent = complete.slice(-Math.min(6, complete.length));
  if (recent.length < 4 || trainingNextWeek(recent.at(-1).week) !== thisWeek) return null;
  for (let i = 1; i < recent.length; i++)
    if (trainingNextWeek(recent[i - 1].week) !== recent[i].week) return null;
  if (recent.some(x => !Number.isFinite(Number(x[field])) || Number(x[field]) < 0)) return null;
  const a = recent.map(x => Number(x[field])),
    n = a.length,
    meanx = (n - 1) / 2,
    meany = a.reduce((x, y) => x + y, 0) / n;
  const num = a.reduce((s, y, i) => s + (i - meanx) * (y - meany), 0),
    den = a.reduce((s, _, i) => s + (i - meanx) ** 2, 0),
    slope = den ? num / den : 0;
  return {
    next: round(Math.max(0, meany + (slope * (n + 1)) / 2), 0),
    avg: round(meany, 0),
    slope: round(slope, 1),
    weeks: n
  };
}

function comparableReportWeeks() {
  // Sólo se comparan semanas calendario finalizadas. No se equipara una semana en curso a una completa.
  return weeklyData().filter(w => w.week < weekStart(isoDay()));
}
function reportInsights() {
  let rows = comparableReportWeeks(),
    last = rows.at(-1),
    prev = rows.at(-2),
    m = monthTotals(),
    out = [];
  const adjacent = !!last && !!prev && trainingNextWeek(prev.week) === last.week;
  if (!adjacent)
    out.push(
      'Variación semanal no calculable: faltan dos semanas calendario consecutivas ya finalizadas. La semana en curso no se compara como completa.'
    );
  else {
    const change = prev.kg ? round(((last.kg - prev.kg) / prev.kg) * 100, 1) : null;
    out.push(
      change === null
        ? 'No se puede calcular la variación: la semana anterior no tiene peso registrado.'
        : `Entre las últimas dos semanas calendario finalizadas, el peso registrado ${change >= 0 ? 'aumentó' : 'disminuyó'} ${Math.abs(change)}% (según fecha de orden; revisar cobertura histórica).`
    );
  }
  let c = counts();
  if (c.unassigned)
    out.push(
      `${c.unassigned} encomiendas activas aún no tienen zona asignada; conviene revisar su ubicación.`
    );
  let m2 = Object.values(c.occ).reduce((v, x) => v + x.area, 0);
  out.push(`La superficie estimada actualmente asignada es de ${money(m2)} m², sin representar apilamiento.`);
  if (m.orders > 0) out.push(`Este mes figuran ${m.orders} guías con fecha de registro y ${money(m.kg)} kg.`);
  return out;
}
function renderReports() {
  let wk = weeklyData().slice(-8),
    forecastK = simpleForecast(weeklyData(), 'kg'),
    forecastQty = simpleForecast(weeklyData(), 'qty'),
    m = monthTotals(),
    delNoDate = db.items.filter(p => p.status === 'entregado' && !p.deliveredAt).length,
    c = counts(),
    d = wk.map(w => ({ week: w.week, qty: w.qty, kg: w.kg }));
  return `${head('Reportes y pronósticos', 'Análisis por semanas, flujo registrado y estimación de carga futura.', btn('export-csv', ic('download') + ' Exportar datos CSV', 'primary'))}<div class="callout blue" style="margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><span>El pronóstico histórico simple de esta página es orientativo. Para comparar cinco modelos y evaluar errores utiliza el Centro de entrenamiento IA.</span>${btn('nav', ic('spark', 16) + ' Entrenamiento IA', 'primary', 'data-page="entrenamiento"')}</div><div class="kpi-grid">${kpi('Guías del mes', m.orders, m.label, 'file')}${kpi('Bultos del mes', m.qty, 'Cantidad según registro', 'layers', 'blue')}${kpi('Peso del mes', money(m.kg) + ' kg', 'Órdenes con fecha', 'truck', 'green')}${kpi('Pendientes en almacén', c.active, 'Encomiendas activas', 'box', 'amber')}</div><div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>Ingresos registrados por semana</h3><span class="pill blue">Número de bultos</span></div>${barChart(d, 'qty')}</div><div class="card card-pad"><div class="card-header"><h3>Peso registrado por semana</h3><span class="pill wine">Kilogramos</span></div>${barChart(d, 'kg')}</div></div><div class="grid-2" style="margin-top:18px"><div class="card card-pad"><div class="card-header"><h3>Modelo 03 · Pronóstico de demanda</h3><span class="pill wine">Tendencia simple</span></div>${forecastK && forecastQty ? `<div class="staff-stat"><div><div class="info-label">Próxima semana (kg)</div><strong>${money(forecastK.next, 0)}</strong></div><div><div class="info-label">Bultos estimados</div><strong>${money(forecastQty.next, 0)}</strong></div><div><div class="info-label">Semanas en histórico</div><strong>${weeklyData().length}</strong></div></div><p class="sub" style="margin-top:17px">Se calcula una extrapolación lineal de las últimas semanas registradas. Es referencial, sensible a datos faltantes y no representa una predicción entrenada con IA.</p>` : '<div class="callout">Se necesitan al menos cuatro semanas completas, consecutivas y recientes para mostrar una tendencia.</div>'}</div><div class="card card-pad"><div class="card-header"><h3>Modelo 04 · Flujo del almacén</h3><span class="pill green">Balance de unidades</span></div><div class="detail-list"><div class="detail-row"><span>Registros totales</span><strong>${c.total}</strong></div><div class="detail-row"><span>En almacén (registros)</span><strong>${c.active}</strong></div><div class="detail-row"><span>Entregados (registros)</span><strong>${c.delivered}</strong></div><div class="detail-row"><span>Entregados sin fecha de salida</span><strong>${delNoDate}</strong></div><div class="detail-row"><span>Sin zona asignada</span><strong>${c.unassigned}</strong></div></div><div class="callout blue" style="margin-top:13px">Balance actual de guías = registradas − entregadas. La ocupación histórica exacta requiere fechas de entrada y salida confirmadas para cada mercancía.</div></div></div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>${ic('spark', 17)} Informe automático de gestión</h3><span class="pill wine">Reglas de análisis · sin IA externa</span></div><p class="inline-note">Las variaciones solo comparan semanas calendario finalizadas y consecutivas. La semana actual figura como parcial; una semana finalizada puede seguir teniendo datos faltantes.</p><div class="grid-3">${reportInsights()
    .map(
      (x, i) =>
        `<div class="soft-box"><div class="info-label">Hallazgo ${i + 1}</div><p class="sub" style="margin:10px 0 0">${esc(x)}</p></div>`
    )
    .join(
      ''
    )}</div><p class="inline-note" style="margin-top:14px">Son observaciones calculadas automáticamente a partir de los datos registrados. No sustituyen una validación operativa.</p></div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Resumen histórico por semana</h3><span class="pill">Últimas 12 semanas</span></div><div class="table-scroll"><table><thead><tr><th>Semana que inicia</th><th>Guías registradas</th><th>Bultos</th><th>Peso total</th><th>Estado entregado (sin fecha necesariamente)</th><th>Período</th></tr></thead><tbody>${weeklyData()
    .slice(-12)
    .reverse()
    .map(
      r =>
        `<tr><td><strong>${esc(r.week)}</strong></td><td>${r.orders}</td><td>${r.qty}</td><td>${money(r.kg)} kg</td><td>${r.delivered}</td><td><span class="pill ${r.week >= weekStart(isoDay()) ? 'orange' : 'green'}">${r.week >= weekStart(isoDay()) ? 'En curso · parcial' : 'Calendario cerrado'}</span></td></tr>`
    )
    .join('')}</tbody></table></div></div>`;
}
