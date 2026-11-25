/**
 * Pantalla: Mapa digital del almacén (plano real + zonas A/B/C).
 */
'use strict';

function mapSvg(highlight = '') {
  // Visual fiel a la imagen que facilitó el usuario. Las zonas A/B/C
  // están lado a lado (izquierda, centro y derecha), NO en profundidad.
  const c = counts();
  const shapes = {
    A: { x: 201, y: 682, w: 198, h: 426, stroke: '#e33435', name: 'IZQUIERDA' },
    B: { x: 460, y: 677, w: 236, h: 432, stroke: '#e2a900', name: 'CENTRO' },
    C: { x: 743, y: 680, w: 217, h: 430, stroke: '#1e64d8', name: 'DERECHA' }
  };
  const overlays = Object.entries(shapes)
    .map(([z, r]) => {
      const chosen = highlight === z;
      return `<g class="zone-hot map-zone-select ${chosen ? 'map-zone-selected' : ''}" data-action="select-zone" data-zone="${z}" role="button" tabindex="0" aria-label="Seleccionar zona ${z}, ${r.name.toLowerCase()}, ${c.occ[z].count} guías">
  <title>Zona ${z} · ${r.name} · ${c.occ[z].count} encomiendas. Haz clic para consultar.</title>
  <rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="15" fill="${r.stroke}" fill-opacity="${chosen ? '.08' : '.015'}" stroke="${r.stroke}" stroke-width="${chosen ? '6' : '2'}" stroke-opacity="${chosen ? '.98' : '.06'}" stroke-dasharray="${chosen ? '' : '12 12'}"/>
  ${chosen ? `<g transform="translate(${r.x + r.w - 48} ${r.y + 15})"><rect x="0" y="0" width="38" height="28" rx="14" fill="${r.stroke}"/><text x="19" y="19" font-size="15" font-weight="900" fill="white" text-anchor="middle">✓</text></g>` : ''}
</g>`;
    })
    .join('');
  return `<svg class="warehouse-svg warehouse-abc" viewBox="0 0 1122 1402" xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Plano de Transportes Ochoa compartido por el usuario. Puerta del camión arriba; recepción, servicios y pasadizo a la derecha; Zona A a la izquierda en rojo, B al centro en amarillo y C a la derecha en azul. Selecciona una zona para ver sus encomiendas.">
<image x="0" y="0" width="1122" height="1402" href="${PLAN_REAL_IMAGE}" preserveAspectRatio="xMidYMid meet" />
${overlays}
  </svg>`;
}

function renderMap() {
  let c = counts(),
    z = ui.selectedZone,
    d = c.occ[z],
    items = activeItems().filter(x => x.zone === z),
    plan = autoZonePlan();
  return `${head('Mapa del almacén · Zonas ABC', 'Plano actualizado según la nueva imagen · A izquierda · B centro · C derecha.', btn('nav', ic('sliders') + ' Optimizar ubicaciones', 'primary', 'data-page="optimizar"'))}
 <div class="card card-pad" style="margin-bottom:18px;border-left:4px solid #2c8f7b"><div class="flex-row" style="justify-content:space-between;align-items:center"><div><strong>Distribución actualizada</strong><p class="sub" style="margin:6px 0 0">Nuevo mapa aprobado para el prototipo: camión y puerta arriba, recepción y servicios a la derecha, zonas A (izquierda), B (centro) y C (derecha) con circulación libre.</p></div><div class="flex-row"><span class="pill green">Imagen proporcionada</span><span class="pill wine">Sectores ABC definidos en el mapa</span></div></div></div>
 ${autoZoneDashboard(plan)}${abcSummaryMini()}<div class="map-grid"><div class="card card-pad"><div class="card-header"><h3>${ic('map', 17)} Plano físico del almacén</h3><span class="pill wine">Referencia: mapa ABC enviado</span></div>
 <div class="flex-row" style="margin-bottom:13px"><button data-action="map-view" data-view="digital" class="btn ${ui.mapView === 'digital' ? 'primary' : 'soft'}">${ic('map', 16)} Plano interactivo</button><button data-action="map-view" data-view="original" class="btn ${ui.mapView === 'original' ? 'primary' : 'soft'}">${ic('eye', 16)} Imagen sin marcas</button></div>
 ${ui.mapView === 'digital' ? `<div class="map-shell">${mapSvg(ui.selectedZone)}</div>` : `<div class="map-shell"><img src="${PLAN_REAL_IMAGE}" alt="Mapa ABC facilitado por el usuario, con zonas A roja a la izquierda, B amarilla al centro y C azul a la derecha." style="display:block;width:100%;max-height:850px;object-fit:contain;border-radius:12px"/></div>`}
 <div class="map-legend"><span><span class="legend-dot" style="background:#e83d3d"></span>A · Izquierda · rojo</span><span><span class="legend-dot" style="background:#e9b513"></span>B · Centro · amarillo</span><span><span class="legend-dot" style="background:#2467db"></span>C · Derecha · azul</span></div>
 <p class="warehouse-note">El mapa interactivo <strong>utiliza la imagen ABC que compartiste</strong>. Pulsa cualquiera de las tres zonas para consultar sus encomiendas; «Imagen original» la muestra sin selección. Es una referencia visual, no un levantamiento a escala. La recepción, el baño, la otra casa, el pasadizo, la puerta y los pasillos de maniobra no se consideran superficie de almacenamiento. La capacidad útil y el índice de prioridad siguen siendo datos provisionales.</p></div>
 <div><div class="card card-pad"><div class="card-header"><h3>Medidas tomadas del plano</h3><span class="pill green">Actualizadas</span></div><div class="detail-list"><div class="detail-row"><span>Largo total</span><strong>15.00 m</strong></div><div class="detail-row"><span>Ancho de entrada</span><strong>8.00 m</strong></div><div class="detail-row"><span>Ancho zona operativa</span><strong>11.00 m</strong></div><div class="detail-row"><span>Recepción</span><strong>2.00 × 1.00 m</strong></div><div class="detail-row"><span>Baño + lavabo</span><strong>2.00 × 1.00 m</strong></div><div class="detail-row"><span>Separación indicada</span><strong>1.50–2.00 m</strong></div></div><div class="callout blue" style="margin-top:14px">No se puede obtener un área útil fiable multiplicando 15 × 11: el ancho cambia y existen recintos excluidos. Faltan las longitudes parciales y los pasillos internos.</div></div>
 <div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Propuesta de zonas A, B y C</h3><span class="pill orange">Capacidad por validar</span></div>${['A', 'B', 'C'].map(k => `<div class="zone-box ${k === ui.selectedZone ? 'selected' : ''}" data-action="select-zone" data-zone="${k}"><div class="zone-color" style="background:${capStyle(k)}"></div><div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><strong>Zona ${k}</strong><strong>${money(c.occ[k].percent)}%</strong></div><p class="sub" style="margin:6px 0 11px">${k === 'A' ? 'Izquierda · clasificación por peso (propuesta)' : k === 'B' ? 'Centro · clasificación por peso (propuesta)' : 'Derecha · clasificación por peso (propuesta)'} · límites provisionales</p><div class="progress"><span style="width:${Math.min(100, c.occ[k].percent)}%;background:${capStyle(k)}"></span></div><div class="zone-foot"><span>${c.occ[k].count} registros</span><span>${money(c.occ[k].area)} / ${money(c.occ[k].cap)} m² supuestos</span></div></div></div>`).join('')}<p class="inline-note">La ocupación de cada zona se calcula con dimensiones registradas y capacidades configuradas para pruebas. No representa la capacidad real hasta que se midan los espacios.</p></div>
 <div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Encomiendas · Zona ${z}</h3><span class="pill" style="background:${capStyle(z)}22;color:${capStyle(z)}">${items.length} registros</span></div><div class="scroll-y">${
   items.length
     ? items
         .slice(0, 25)
         .map(
           p =>
             `<div class="alert-item"><div class="alert-dot info">${ic('box', 16)}</div><div style="flex:1"><button class="hotspot-tag" data-action="detail" data-id="${esc(p.id)}"><strong>${esc(p.code)} · ${esc(p.recipient)}</strong></button><p>${esc(p.type)} · ${money(p.kg)} kg · ${money(footprint(p))} m² de huella</p></div></div>`
         )
         .join('')
     : '<div class="empty">No hay encomiendas en esta zona.</div>'
 }</div></div>
 <div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Ubicaciones recomendadas · Zona ${z}</h3><span class="pill green">Automáticas</span></div><div class="scroll-y">${
   plan.planned[z].length
     ? plan.planned[z]
         .slice(0, 25)
         .map(
           p =>
             `<div class="alert-item"><div class="alert-dot info">${ic('box', 16)}</div><div style="flex:1"><strong>${esc(p.code)}</strong><p>${money(p.kg)} kg · ${money(footprint(p))} m² · ${p.zone === 'SIN' ? 'Sin ubicación física' : 'Ubicación actual: ' + p.zone + ' · traslado sugerido'}</p>${autoZoneCell(p, plan)}</div></div>`
         )
         .join('')
     : '<div class="empty">No hay propuestas nuevas para esta zona.</div>'
 }</div><p class="inline-note">Las propuestas no cambian el inventario físico hasta confirmar cada colocación o traslado.</p></div>
 </div></div>`;
}
