/**
 * Shell de la aplicación: barra lateral y renderizado de la pantalla activa.
 */
'use strict';

function sidebar() {
  let groups = ui.role === 'worker' ? navWorker : navAdmin;
  return `<div class="brand"><div class="brand-icon">${ic('truck', 25)}</div><div><strong>SIOAL <span style="color:#f3bfd5">2.0</span></strong><small>TRANSPORTES OCHOA</small></div></div>${groups
    .map(
      g =>
        `<div class="side-cap">${g[0]}</div><div class="snav">${g
          .slice(1)
          .map(
            p =>
              `<button class="nav-btn ${ui.page === p ? 'active' : ''}" data-action="nav" data-page="${p}">${ic(pages[p].icon)}<span>${pages[p].title}</span>${p === 'alertas' && alerts().length ? `<span class="count">${alerts().length}</span>` : ''}</button>`
          )
          .join('')}</div>`
    )
    .join(
      ''
    )}<div class="side-bottom"><div class="side-help"><strong>${ic('shield', 15)} Modo demostración</strong>Los cambios se guardan solo en este navegador. No hay servidor ni usuarios autenticados.</div><div class="side-foot">SIOAL 2.3 · ABC automático por zonas</div></div>`;
}
function render() {
  if (!pages[ui.page]) ui.page = 'panel';
  document.querySelector('.side').innerHTML = sidebar();
  const pg = pages[ui.page];
  document.querySelector('.top-title').textContent = pg.title;
  document.getElementById('role').value = ui.role;
  document.querySelector('.top-chip').innerHTML =
    ic('shield', 14) + ' ' + (db.demo ? 'DATOS DEMO' : 'DATOS LOCALES');
  let functions = {
    panel: renderDashboard,
    encomiendas: renderPackages,
    mapa: renderMap,
    optimizar: renderOptimize,
    abc: renderABC,
    entrenamiento: renderTraining,
    buscador: renderSearch,
    qr: renderQR,
    importar: renderImport,
    operaciones: renderOperations,
    tareas: renderTasks,
    personal: renderStaff,
    reportes: renderReports,
    alertas: renderAlerts,
    configuracion: renderSettings
  };
  document.getElementById('content').innerHTML = functions[ui.page]();
}
