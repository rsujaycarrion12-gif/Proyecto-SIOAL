/**
 * Pantalla: Entrenamiento IA (pestañas Datos, Validación, Modelos y MILP).
 */
'use strict';

function trainingExport() {
  let blob = new Blob(
    [
      JSON.stringify(
        {
          source: training.source,
          kind: training.kind,
          recordCount: training.records,
          dateRange: [training.from, training.to],
          weeks: trainingWeeksFilled(training),
          modelResults: training.trained,
          quality: trainingQuality(training)
        },
        null,
        2
      )
    ],
    { type: 'application/json;charset=utf-8' }
  );
  downloadBlob(blob, 'SIOAL_analisis_pronosticos_' + isoDay() + '.json');
  notify('Resumen y métricas descargados (sin datos personales).');
}
function trainingCountLabel(data = training) {
  return data?.recordUnit === 'manifiesto' ? 'Viajes (manifiestos)' : 'Órdenes';
}
function trainingMetricTitle() {
  return trainUI.metric === 'kg'
    ? 'Kilogramos registrados'
    : trainUI.metric === 'orders'
      ? trainingCountLabel() + ' por semana'
      : 'Cantidad de bultos';
}
function trainingMetricUnit() {
  return trainUI.metric === 'kg'
    ? 'kg'
    : trainUI.metric === 'orders'
      ? training?.recordUnit === 'manifiesto'
        ? 'viajes'
        : 'órdenes'
      : 'bultos';
}
// Tabla de las próximas semanas con rangos de predicción empíricos (80 % y 95 %).
function trainingForecastTable(res) {
  if (!res?.forecast?.length) return '';
  const rows = res.forecast.map((f, i) => {
    const iv = res.intervals?.[i];
    const wk = trainingNextWeek(res.lastCompleteWeek, (res.startOffset || 1) + i);
    return `<tr><td>${esc(trainingFormatDay(wk))}</td><td><strong>${money(f, 0)}</strong> ${esc(trainingMetricUnit())}</td><td>${iv ? money(iv.min80, 0) + ' – ' + money(iv.max80, 0) : '—'}</td><td>${iv ? money(iv.min95, 0) + ' – ' + money(iv.max95, 0) : '—'}</td></tr>`;
  });
  return `<div class="table-scroll" style="margin-top:14px"><table><thead><tr><th>Semana</th><th>Pronóstico</th><th>Rango 80 %</th><th>Rango 95 %</th></tr></thead><tbody>${rows.join('')}</tbody></table></div><p class="inline-note">Rangos calculados con los errores reales que tuvo el modelo a 1–4 semanas en todo el historial.</p>`;
}
function trainingModelChart() {
  let fld = trainUI.metric,
    rows = trainingWeeksFilled(training),
    full = trainingFullWeeks(),
    res = training.trained?.results?.[fld];
  let tail = full.slice(-Math.min(13, full.length));
  if (!tail.length) return '<div class="empty">Sin semanas completas que mostrar.</div>';
  let forecast = res?.forecast || [],
    gap = res ? Math.max(0, (res.startOffset || 1) - 1) : 0,
    labels = [
      ...tail.map(x => x.week),
      ...Array.from({ length: gap }, (_, i) => trainingNextWeek(tail.at(-1).week, i + 1)),
      ...forecast.map((_, i) => trainingNextWeek(tail.at(-1).week, gap + i + 1))
    ],
    vals = tail.map(x => Number(x[fld]) || 0),
    all = [...vals, ...forecast];
  let max = Math.max(1, ...all) * 1.18,
    W = 860,
    H = 260,
    L = 66,
    R = 17,
    T = 17,
    B = 44,
    w = W - L - R,
    h = H - T - B;
  let x = i => L + (i / Math.max(1, labels.length - 1)) * w,
    y = v => T + h - (v / max) * h;
  const line = (a, offset = 0) =>
    a.map((v, i) => (i ? 'L' : 'M') + x(i + offset).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  let grid = [0, 0.25, 0.5, 0.75, 1]
    .map(
      t =>
        `<line x1="${L}" y1="${y(t * max)}" x2="${W - R}" y2="${y(t * max)}" stroke="#ece5ed" stroke-dasharray="3 4"/><text x="${L - 9}" y="${y(t * max) + 4}" text-anchor="end" fill="#887a89" font-size="11">${esc(money(t * max, 0))}</text>`
    )
    .join('');
  let histPath = `<path d="${line(vals)}" fill="none" stroke="#722f5e" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  let forecastPath = forecast.length
    ? `<path d="${['M' + x(vals.length - 1).toFixed(1) + ',' + y(vals.at(-1)).toFixed(1), ...forecast.map((v, i) => 'L' + x(i + vals.length + gap).toFixed(1) + ',' + y(v).toFixed(1))].join(' ')}" fill="none" stroke="#13a58a" stroke-width="3.2" stroke-dasharray="7 6" stroke-linecap="round"/>`
    : '';
  let dots =
    vals
      .map(
        (v, i) =>
          `<circle cx="${x(i)}" cy="${y(v)}" r="3.8" fill="#722f5e"><title>${labels[i]} · ${money(v, 0)}</title></circle>`
      )
      .join('') +
    forecast
      .map(
        (v, i) =>
          `<circle cx="${x(i + vals.length + gap)}" cy="${y(v)}" r="4.3" fill="#13a58a"><title>${labels[i + vals.length + gap]} · proyección ${money(v, 0)}</title></circle>`
      )
      .join('');
  let ticks = labels
    .map((d, i) =>
      i % Math.max(1, Math.ceil(labels.length / 9)) === 0 || i === labels.length - 1
        ? `<text x="${x(i)}" y="${H - 18}" fill="#887a89" text-anchor="middle" font-size="11">${esc(d.slice(5))}</text>`
        : ''
    )
    .join('');
  return `<div class="training-chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Histórico de ${trainingMetricTitle()} y proyección: ${res?.choice || 'no entrenado'}">${grid}${res ? `<line x1="${x(vals.length - 1) + 12}" x2="${x(vals.length - 1) + 12}" y1="${T}" y2="${H - B}" stroke="#bbb" stroke-dasharray="5 5"/>` : ''}${histPath}${forecastPath}${dots}${ticks}</svg><div class="training-chartlegend"><span><i style="background:#722f5e"></i> Semanas completas observadas</span>${res ? '<span><i style="background:#13a58a"></i> Proyección experimental / evaluada</span>' : ''}</div></div>`;
}
function trainingPeriodNotice() {
  let n = trainingFullWeeks().length,
    t = trainingWeeksFilled(training),
    partial = t.filter(w => !w.full).length;
  return n < 8
    ? `<div class="train-warning">${ic('info', 18)} <div><strong>Histórico corto: ${n} semanas completas${partial ? ', ' + partial + ' semanas parciales' : ''}.</strong> Con menos de ocho semanas completas, los pronósticos son exploratorios y no se seleccionará un modelo como ganador por errores de validación. FECHA representa la emisión de la orden, no la recepción física. Ninguna evaluación con datos sintéticos demuestra utilidad operativa.</div></div>`
    : `<div class="train-ok">${ic('check', 18)} <div><strong>${n} semanas completas disponibles.</strong> Se utilizará validación temporal paso a paso y se comparará cada método con la persistencia.</div></div>`;
}
function trainingStats() {
  const total = trainingWeeksFilled(training),
    full = trainingFullWeeks(),
    kg = total.reduce((s, w) => s + Number(w.kg || 0), 0),
    qty = total.reduce((s, w) => s + Number(w.qty || 0), 0);
  return `<div class="train-statgrid"><div class="train-stat"><span>${training.recordUnit === 'manifiesto' ? 'Manifiestos válidos' : 'Órdenes válidas'}</span><strong>${money(training.valid || 0, 0)}</strong><small>${String(training.kind).includes('demo') ? 'Datos sintéticos · NO uso real' : 'Histórico seleccionado'}</small></div><div class="train-stat"><span>Semanas completas</span><strong>${full.length}</strong><small>Para evaluar el pronóstico</small></div><div class="train-stat"><span>Peso registrado</span><strong>${money(kg, 0)} kg</strong><small>Suma de los registros</small></div><div class="train-stat"><span>Bultos registrados</span><strong>${money(qty, 0)}</strong><small>Suma de T. CANTIDAD / T. BULTOS</small></div></div>`;
}
function trainingDataTab() {
  let rows = trainingWeeksFilled(training);
  return `<div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>${ic('upload', 18)} Importar registros</h3><span class="pill green">Lectura local</span></div><div class="train-drop"><div style="font-size:30px;color:#88436f">${ic('upload', 32)}</div><strong>Selecciona un archivo .xlsx o .csv</strong><p>Reconoce FECHA, NÚMERO O.S. o NÚMERO (manifiesto), T. CANTIDAD o T. BULTOS y T. PESO. Si cada fila es un camión (manifiestos de TITANICSOFT), aplica un umbral de peso propio. No modifica las encomiendas del mapa.</p><input type="file" id="trainingFile" multiple accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" aria-label="Subir Excel para entrenamiento"></div><div class="train-actions"><button class="btn soft" data-action="train-action" data-op="restore">${ic('refresh', 16)} Recuperar histórico de Ochoa</button><button class="btn soft" data-action="train-action" data-op="use-db">Usar registros del sistema</button><button class="btn soft" data-action="train-action" data-op="demo-120k">Ver entrenamiento sintético de 120.000 órdenes</button><button class="btn soft" data-action="train-action" data-op="demo">Cargar demo de 22 semanas</button></div><p class="inline-note">Puedes seleccionar varias exportaciones mensuales de TITANICSOFT a la vez (Ctrl + clic): se combinan y los manifiestos repetidos se cuentan una sola vez. Importar de nuevo reemplaza el conjunto del entrenamiento. Los datos se procesan en el navegador y solo se guarda un resumen semanal.</p></div>
 <div class="card card-pad"><div class="card-header"><h3>Origen y cobertura</h3><span class="pill ${training.kind.includes('demo') ? 'orange' : 'blue'}">${training.kind.includes('demo') ? 'Datos de demostración' : 'Datos agregados'}</span></div><div class="detail-list"><div class="detail-row"><span>Origen</span><strong style="text-align:right;max-width:61%;overflow-wrap:anywhere">${esc(training.source)}</strong></div><div class="detail-row"><span>Primer registro</span><strong>${esc(training.from)}</strong></div><div class="detail-row"><span>Último registro</span><strong>${esc(training.to)}</strong></div><div class="detail-row"><span>Semanas calendario</span><strong>${rows.length}</strong></div><div class="detail-row"><span>Semanas completas</span><strong>${rows.filter(w => w.full).length}</strong></div></div><div class="train-summary-note">${esc(training.note || '')}${training.kind === 'real' ? '<br/>Resumen calculado a partir del Excel de órdenes aportado. No contiene clientes, remitentes ni destinatarios.' : ''}</div></div></div>
 <div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>${ic('chart', 17)} Serie histórica semanal</h3><span class="pill">Semanas parciales señaladas</span></div><div class="table-scroll"><table><thead><tr><th>Semana que comienza</th><th>${esc(trainingCountLabel())}</th><th>Bultos</th><th>Peso (kg)</th><th>Cobertura</th></tr></thead><tbody>${rows.map(w => `<tr><td>${esc(w.week)}</td><td>${money(w.orders, 0)}</td><td>${money(w.qty, 0)}</td><td>${money(w.kg, 0)}</td><td><span class="pill ${w.full ? 'green' : 'orange'}">${w.full ? 'Completa' : w.missing ? 'Sin registros' : 'Parcial'}</span></td></tr>`).join('')}</tbody></table></div></div>`;
}
function trainingValidationTab() {
  const full = trainingFullWeeks(),
    rows = trainingWeeksFilled(training),
    flags = [];
  for (const reason of trainingQuality(training).reasons)
    flags.push('Calidad insuficiente para validar: ' + reason);
  if (training.rejected) flags.push(`${training.rejected} filas con fecha inválida u otros errores.`);
  if (training.futureDates)
    flags.push(
      `${training.futureDates} órdenes con FECHA futura excluidas; revisa el archivo antes de entrenar.`
    );
  if (training.duplicates)
    flags.push(
      `${training.duplicates} números de orden repetidos, eliminados ANTES de calcular los límites estadísticos.`
    );
  if (training.contradictoryStatus)
    flags.push(`${training.contradictoryStatus} filas con ESTADO/ENTREGA contradictorios excluidas.`);
  if (training.missingCode) flags.push(`${training.missingCode} filas sin código de orden excluidas.`);
  if (training.invalidWeight)
    flags.push(`${training.invalidWeight} registros sin peso válido (se omitió de la suma de kg).`);
  if (training.invalidQty)
    flags.push(`${training.invalidQty} registros sin cantidad válida (se omitió de la suma de bultos).`);
  if (training.extremeWeight)
    flags.push(
      `${training.extremeWeight} registros con pesos sospechosos en cuarentena (umbral ${money(trainingReviewLimitKg(training), 0)} kg; ${training.extremeStatistical || 0} por criterio estadístico IQR). No se corrigieron ni incorporaron al pronóstico.`
    );
  if (training.statisticalFence)
    flags.push(
      `Límite estadístico provisional: ${money(training.statisticalFence.kgPerParcel, 1)} kg/bulto, calculado con ${esc(training.statisticalFence.method)}. No sustituye la inspección humana.`
    );
  if (
    (training.invalidWeight || 0) / Math.max(1, training.valid) > 0.01 ||
    (training.invalidQty || 0) / Math.max(1, training.valid) > 0.01
  )
    flags.push(
      'Más del 1% de valores de peso o cantidad son inválidos; los pronósticos siguen siendo preliminares hasta corregir la fuente.'
    );
  if (full.length < 8)
    flags.push(
      'Historial limitado para medir calidad de predicción: se recomiendan al menos 8 semanas completas.'
    );
  if (rows.some(w => w.missing))
    flags.push(
      'Existen semanas sin datos dentro del rango; verificar si son faltantes o semanas sin actividad.'
    );
  return `<div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>Diagnóstico de calidad</h3><span class="pill blue">Automático</span></div><div class="detail-list">${[
    ['Filas leídas', training.records || 0],
    ['Órdenes incorporadas', training.valid || 0],
    ['Fechas inválidas / registros rechazados', training.rejected || 0],
    ['Duplicados excluidos', training.duplicates || 0],
    ['Órdenes contradictorias por conciliar', training.conflictingOrders || 0],
    ['Peso no válido / vacío', training.invalidWeight || 0],
    ['Pesos atípicos en cuarentena', training.extremeWeight || 0],
    ['Cantidad no válida / vacía', training.invalidQty || 0],
    ['Semanas completas', full.length]
  ]
    .map(([k, v]) => `<div class="detail-row"><span>${k}</span><strong>${money(v, 0)}</strong></div>`)
    .join(
      ''
    )}</div><p class="inline-note">Una fila con peso vacío no se convierte en 0 kg real. Las órdenes contradictorias se retienen para conciliación y no aportan kg al entrenamiento.</p>${
    training.conflictSamples?.length
      ? `<details style="margin-top:12px"><summary>Ver órdenes contradictorias (${training.conflictingOrders || 0})</summary><div class="table-scroll"><table><thead><tr><th>Orden</th><th>Filas</th><th>Pesos distintos (kg)</th></tr></thead><tbody>${training.conflictSamples
          .slice(0, 40)
          .map(
            c =>
              `<tr><td>${esc(c.orden)}</td><td>${c.filas}</td><td>${esc(c.variantes.map(v => v.pesoKg).join(' / '))}</td></tr>`
          )
          .join('')}</tbody></table></div></details>`
      : ''
  }</div><div class="card card-pad"><div class="card-header"><h3>Comprobaciones necesarias</h3></div>${flags.length ? flags.map(x => `<div class="train-check">${ic('info', 16)} <span>${esc(x)}</span></div>`).join('') : `<div class="train-ok">No se detectaron incidencias en los controles disponibles.</div>`}<div class="train-check">${ic('info', 16)} <span>Los días sin órdenes no se pueden asumir automáticamente como días sin operaciones.</span></div><div class="train-check">${ic('info', 16)} <span>La FECHA del Excel representa la emisión de la orden, no garantiza el día de descarga en este almacén.</span></div></div></div>`;
}
function trainingModelsTab() {
  const mismatch = trainingWeightConfigMismatch(),
    res = mismatch ? null : training.trained?.results?.[trainUI.metric],
    weeks = trainingFullWeeks(),
    valid = res?.validated;
  return `${mismatch ? '<div class="train-warning"><strong>Entrenamiento desactualizado:</strong> ha cambiado el umbral de revisión de pesos. Reimporta el histórico antes de calcular pronósticos.</div>' : ''}<div class="card card-pad"><div class="card-header"><h3>${ic('chart', 19)} Pronóstico de demanda semanal</h3><div class="flex-row"><button class="btn ${trainUI.metric === 'kg' ? 'primary' : 'soft'}" data-action="train-action" data-op="metric" data-metric="kg">Kilogramos</button><button class="btn ${trainUI.metric === 'qty' ? 'primary' : 'soft'}" data-action="train-action" data-op="metric" data-metric="qty">Bultos</button><button class="btn ${trainUI.metric === 'orders' ? 'primary' : 'soft'}" data-action="train-action" data-op="metric" data-metric="orders">${esc(trainingCountLabel())}</button></div></div><p class="sub">Comparación de seis modelos con partición temporal: entrenamiento → validación (elige el modelo) → prueba final independiente. Con 60 o más semanas: hasta 26 + 26; entre 24 y 59: 8 + 8; con menos de 24 solo hay validación. Las cifras representan fechas de órdenes, NO ingresos físicos.</p><div class="train-actions" style="margin:17px 0">${btn('train-action', ic('spark', 16) + ' Ejecutar entrenamiento', 'primary', 'data-op="run"')} ${btn('train-action', ic('download', 16) + ' Descargar resultados', 'secondary', 'data-op="export"')}</div>${trainingPeriodNotice()}${res?.historicalOnly ? `<div class="train-warning"><strong>Histórico desactualizado.</strong> La última semana observada es ${esc(res.lastCompleteWeek)}; no se genera pronóstico vigente hasta importar datos recientes. La evaluación mostrada es retrospectiva.</div>` : res?.stale ? `<div class="train-warning">Faltan semanas recientes. El resultado es una proyección preliminar, NO validada como pronóstico vigente.</div>` : ''}${res && res.startOffset > 1 ? `<div class="train-check">${ic('info', 16)} <span>El pronóstico comienza en la semana del ${esc(res.nextWeek)}. Se han dejado fuera semanas parciales o posteriores al último periodo completo disponible; conviene importar los registros más recientes.</span></div>` : ''}${trainingModelChart()}
 ${res ? `<div class="train-statgrid" style="margin-top:14px"><div class="train-stat"><span>Modelo utilizado</span><strong style="font-size:16px">${esc(TRAIN_MODELS.find(m => m.id === res.choice)?.short || res.choice)}</strong><small>${res.selectionWeeks ? 'Elegido en ' + res.selectionWeeks + ' semanas de validación' : 'Referencia, sin ranking válido'}</small></div><div class="train-stat"><span>${res.historicalOnly ? 'Pronóstico vigente no disponible' : 'Proyección experimental'}</span><strong>${res.historicalOnly ? '—' : money(res.forecast[0], 0) + ' ' + trainingMetricUnit()}</strong><small>${res.historicalOnly ? 'Importa un histórico reciente' : 'Semana del ' + trainingFormatDay(res.nextWeek) + ' · ' + (valid ? 'evaluado' : 'preliminar')}</small></div><div class="train-stat"><span>Semanas de prueba final</span><strong>${res.testWeeks || 0}</strong><small>WAPE final: ${res.holdout?.wape == null ? 'Sin prueba' : money(res.holdout.wape, 2) + '%'} · Selección: ${res.selectionWeeks || 0} semanas</small></div><div class="train-stat"><span>Estado</span><strong style="font-size:17px">${valid ? 'Evaluado' : 'Preliminar'}</strong><small>${res.folds >= 4 ? 'Comparación de errores' : 'Sin validación suficiente'}</small></div></div>${trainingForecastTable(res)}` : `<div class="train-emptystate">${ic('info', 24)} <div><strong>Aún no se ha ejecutado el modelo</strong><p>Pulsa «Ejecutar entrenamiento» para calcular las proyecciones. Con datos cortos, se marcarán como exploratorias.</p></div></div>`}</div>
 <div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Comparación de fórmulas y errores de selección</h3><span class="pill ${valid ? 'green' : 'orange'}">${valid ? 'Validación temporal' : 'Evaluación limitada'}</span></div><div class="table-scroll"><table><thead><tr><th>Modelo</th><th>MAE validación</th><th>RMSE</th><th>WAPE validación</th><th>WAPE historial</th><th>Ventanas</th></tr></thead><tbody>${TRAIN_MODELS.map(
   m => {
     let v = res?.ranked?.find(x => x.id === m.id);
     return `<tr><td><strong>${esc(m.short)}</strong>${res?.choice === m.id ? ` <span class="pill ${valid ? 'green' : 'orange'}">${valid ? 'Seleccionado' : 'Referencia'}</span>` : ''}</td><td>${v?.mae !== null && v?.mae !== undefined ? money(v.mae, 1) : 'Sin datos'}</td><td>${v?.rmse !== null && v?.rmse !== undefined ? money(v.rmse, 1) : '—'}</td><td>${v?.wape !== null && v?.wape !== undefined ? money(v.wape, 1) + '%' : '—'}</td><td>${v?.history?.wape != null ? money(v.history.wape, 1) + '%' : '—'}</td><td>${v?.folds ?? '—'}</td></tr>`;
   }
 ).join(
   ''
 )}</tbody></table></div><div class="train-formulas">${TRAIN_MODELS.map(m => `<details><summary>${esc(m.name)} · ${esc(m.short)}</summary><p>${esc(m.desc)}</p><code>${esc(m.formula)}</code></details>`).join('')}</div><p class="inline-note" style="margin-top:10px">MAE: error absoluto medio. RMSE: raíz del error cuadrático medio. WAPE: suma de errores absolutos / suma de valores reales. Un WAPE superior al 25% impide mostrar el pronóstico como validado, aunque los registros estén limpios. Este umbral es orientativo, no una garantía de precisión empresarial. Si faltan datos, no se inventan métricas.</p></div>`;
}
function trainingMilpTab() {
  let items = activeItems(),
    n = items.length,
    withDims = items.filter(p => Number(p.length) > 0 && Number(p.width) > 0).length,
    complete = n ? (withDims / n) * 100 : 0,
    unassigned = items.filter(p => !['A', 'B', 'C'].includes(p.zone)).length;
  let used = {},
    cap = {};
  for (let z of ['A', 'B', 'C']) {
    used[z] = round(
      items.filter(p => p.zone === z && p.length > 0 && p.width > 0).reduce((s, p) => s + footprint(p), 0),
      3
    );
    cap[z] = Number(db.config.capacity[z]) || 0;
  }
  return `<div class="train-warning">${ic('info', 17)} <div><strong>MILP no se entrena con ejemplos como una red neuronal.</strong> Se calibra con dimensiones verificadas, restricciones reales y distancias físicas; después, el optimizador resuelve asignaciones. Los valores del mapa son provisionales.</div></div><div class="train-statgrid" style="margin-top:16px"><div class="train-stat"><span>Encomiendas activas</span><strong>${money(n, 0)}</strong><small>Registro operativo</small></div><div class="train-stat"><span>Con dimensiones</span><strong>${money(withDims, 0)}</strong><small>${money(complete, 1)}% de cobertura</small></div><div class="train-stat"><span>Sin zona asignada</span><strong>${money(unassigned, 0)}</strong><small>Requieren revisión</small></div><div class="train-stat"><span>Capacidades ABC</span><strong style="font-size:16px">Sin validar</strong><small>Se necesitan mediciones reales</small></div></div><div class="grid-2" style="margin-top:18px"><div class="card card-pad"><div class="card-header"><h3>Calibración de cada zona</h3></div>${[
    'A',
    'B',
    'C'
  ]
    .map(z => {
      let percentage = cap[z] ? Math.min(100, (used[z] / cap[z]) * 100) : 0;
      return `<div class="train-zone"><div class="flex-row" style="justify-content:space-between"><strong>Zona ${z}</strong><span>${money(used[z])} / ${money(cap[z])} m² <span style="color:#988b99">(referencial)</span></span></div><div class="train-progress"><i style="width:${percentage}%;background:${capStyle(z)}"></i></div></div>`;
    })
    .join(
      ''
    )}<p class="inline-note">El cálculo mostrado es una suma simple de huellas registradas, sin descontar apilamiento, corredores ni accesos.</p></div><div class="card card-pad"><div class="card-header"><h3>Para mejorar el modelo</h3></div><div class="train-check">${ic('check', 16)} <span>Plano real con zonas A roja, B amarilla y C azul.</span></div><div class="train-check">${ic('info', 16)} <span>Medir superficies útiles de A, B y C, excluyendo pasillos y maniobras.</span></div><div class="train-check">${ic('info', 16)} <span>Registrar largo y ancho de cada encomienda, fragilidad y condiciones de apilamiento.</span></div><div class="train-check">${ic('info', 16)} <span>Comprobar si las distancias de acceso y rutas de montacargas son viables.</span></div>${btn('nav', ic('sliders', 16) + ' Ir a optimización ABC', 'primary', 'data-page="optimizar"')}</div></div>`;
}
function renderTraining() {
  let tabs = [
    ['datos', 'Datos y Excel'],
    ['validacion', 'Validación'],
    ['modelos', 'Pronósticos'],
    ['milp', 'Calibración MILP']
  ];
  let desc = 'Entrenamiento de pronósticos y calibración matemática con los registros del almacén.';
  return `${head('Centro de entrenamiento IA', desc, btn('train-action', ic('download', 17) + ' Exportar análisis', 'secondary', 'data-op="export"'))}
 <div class="train-banner"><div><div class="train-eyebrow">INTELIGENCIA OPERATIVA · MODELOS CUANTITATIVOS</div><h2>De los registros a decisiones respaldadas por datos.</h2><p>Importa tu histórico, revisa la calidad, compara pronósticos y prepara el optimizador ABC. Todo se ejecuta dentro del navegador.</p></div><div class="train-bannermark">${ic('spark', 48)}</div></div>
 ${trainingStats()}
 <div class="train-tabs">${tabs.map(([id, name], i) => `<button type="button" data-action="train-action" data-op="tab" data-tab="${id}" class="${trainUI.tab === id ? 'selected' : ''}"><span>${String(i + 1).padStart(2, '0')}</span> ${name}</button>`).join('')}</div>
 ${trainUI.tab === 'datos' ? trainingDataTab() : trainUI.tab === 'validacion' ? trainingValidationTab() : trainUI.tab === 'modelos' ? trainingModelsTab() : trainingMilpTab()}
 <div class="train-privacy">${ic('shield', 17)} Versión local de prueba. Los datos completos del Excel no se guardan en este módulo ni se envían a servidores. Solo se conserva la serie semanal y los indicadores agregados; no se dispone de autenticación o sincronización empresarial.</div>`;
}
function handleTrainingAction(btn) {
  let op = btn.dataset.op;
  if (op === 'tab') {
    trainUI.tab = btn.dataset.tab;
    render();
    return;
  }
  if (op === 'metric') {
    trainUI.metric = ['kg', 'qty', 'orders'].includes(btn.dataset.metric) ? btn.dataset.metric : 'kg';
    render();
    return;
  }
  if (op === 'run') {
    trainingRun();
    return;
  }
  if (op === 'export') {
    trainingExport();
    return;
  }
  if (op === 'restore') {
    training = structuredClone(tInitial);
    trainUI.tab = 'datos';
    if (!trainingSave()) {
      render();
      return;
    }
    render();
    notify('Histórico agregado de Ochoa restaurado.');
    return;
  }
  if (op === 'demo-120k') {
    training = structuredClone(TRAINED_SIMULATION_120K);
    trainUI.tab = 'modelos';
    if (!trainingSave()) {
      render();
      return;
    }
    render();
    notify(
      'Resultados experimentales de 120.000 órdenes sintéticas cargados. No están validados para operaciones reales.'
    );
    return;
  }
  if (op === 'demo') {
    training = trainingDemo();
    trainUI.tab = 'modelos';
    if (!trainingSave()) {
      render();
      return;
    }
    render();
    notify('Demostración sintética cargada; no son órdenes reales.');
    return;
  }
  if (op === 'use-db') {
    training = trainingFromStored();
    trainUI.tab = 'validacion';
    if (!trainingSave()) {
      render();
      return;
    }
    render();
    notify('Órdenes registradas convertidas en datos semanales.');
    return;
  }
}
