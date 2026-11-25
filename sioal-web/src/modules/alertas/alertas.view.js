/**
 * Pantalla: Centro de alertas.
 */
'use strict';

function renderAlerts() {
  let a = alerts();
  return `${head('Centro de alertas', 'Situaciones que requieren revisión o completar información.', btn('nav', ic('sliders') + ' Optimizar zonas', 'primary', 'data-page="optimizar"'))}<div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>Alertas del sistema</h3><span class="pill ${a.length ? 'orange' : 'green'}">${a.length} alertas</span></div>${a.length ? a.map(x => `<div class="alert-item"><div class="alert-dot ${x.level === 'danger' ? 'danger' : x.level === 'info' ? 'info' : ''}">${ic('bell', 17)}</div><div style="flex:1"><button class="hotspot-tag" data-action="nav" data-page="${x.page}"><strong>${esc(x.title)}</strong></button><p>${esc(x.desc)}</p></div>${btn('nav', ic('chevron'), 'small', `data-page="${x.page}"`)}</div>`).join('') : '<div class="callout green">No hay alertas detectadas.</div>'}</div><div class="card card-pad"><div class="card-header"><h3>Reglas de detección</h3></div><div class="steps">${[
    ['Capacidad', 'Alerta cuando una zona alcanza el porcentaje configurado.'],
    ['Ubicación', 'Encomiendas sin zona registrada.'],
    ['Datos', 'Guías sin medidas físicas.'],
    ['Permanencia', 'Registros antiguos que requieren revisión manual.'],
    ['Incidencias', 'Mercancías marcadas como observadas.']
  ]
    .map(
      ([a, b], i) =>
        `<div class="step"><span class="step-no">${String(i + 1).padStart(2, '0')}</span><div><strong>${a}</strong><p class="sub">${b}</p></div></div>`
    )
    .join(
      ''
    )}</div>${btn('nav', ic('settings') + ' Configurar reglas', 'soft', 'data-page="configuracion"')}</div></div>`;
}
