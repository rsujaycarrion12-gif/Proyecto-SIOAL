/**
 * Navegación entre pantallas por hash (#panel, #mapa, ...) y control de acceso por rol.
 */
'use strict';

function go(p) {
  if (!pages[p]) p = 'panel';
  if (
    ui.role === 'worker' &&
    ['entrenamiento', 'optimizar', 'importar', 'personal', 'reportes', 'configuracion'].includes(p)
  )
    p = 'panel';
  ui.page = p;
  location.hash = '#' + p;
  ui.mobile = false;
  document.querySelector('.side')?.classList.remove('open');
  document.querySelector('.mobile-scrim')?.classList.remove('visible');
  render();
  window.scrollTo({ top: 0, behavior: 'instant' });
}
window.addEventListener('hashchange', () => {
  let p = location.hash.slice(1) || 'panel';
  if (p !== ui.page) go(p);
});
