/**
 * Persistencia en localStorage con control de concurrencia entre pestañas.
 */
'use strict';

// Muestra un aviso permanente si otra pestaña actualiza este inventario.
function showStorageConflict() {
  staleStorage = true;
  if (!document.body) return;
  let el = document.getElementById('sioal-storage-conflict');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sioal-storage-conflict';
    el.setAttribute('role', 'alert');
    el.style.cssText =
      'position:fixed;z-index:999999;top:12px;left:50%;transform:translateX(-50%);max-width:min(94vw,750px);width:max-content;box-sizing:border-box;background:#fff7e8;color:#663900;border:2px solid #ca8a04;border-radius:12px;padding:13px 16px;box-shadow:0 12px 35px #0003;font:600 13px/1.4 system-ui,sans-serif;display:flex;align-items:center;gap:14px;flex-wrap:wrap;';
    const message = document.createElement('span');
    message.textContent =
      'Otra pestaña modificó SIOAL. No podrás guardar esta copia antigua. Recarga para trabajar con los datos más recientes.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Recargar datos';
    button.style.cssText =
      'cursor:pointer;background:#7b214d;border:0;border-radius:8px;color:white;font-weight:700;padding:9px 13px';
    button.addEventListener('click', () => {
      if (
        confirm(
          'Se descartarán los cambios de formularios que aún no hayas guardado en esta pestaña. ¿Recargar la información?'
        )
      )
        location.reload();
    });
    el.append(message, button);
    document.body.append(el);
  }
}

// Las notificaciones 'storage' solo se emiten en las OTRAS pestañas del mismo origen.
window.addEventListener('storage', event => {
  if (event.key === KEY && event.newValue !== expectedStorageRaw) showStorageConflict();
});

function save() {
  let currentRaw;
  try {
    currentRaw = localStorage.getItem(KEY);
    // Bloquear TODOS los nuevos guardados de la pestaña desactualizada hasta recargar.
    // Evita que un segundo intento sobrescriba datos con formularios antiguos.
    if (staleStorage) {
      try {
        db = currentRaw ? JSON.parse(currentRaw) : makeDemo();
        lastSavedState = JSON.stringify(db);
      } catch (_) {
        try {
          db = JSON.parse(lastSavedState);
        } catch (__) {
          db = makeDemo();
        }
      }
      ui.proposal = null;
      abcPlacement = null;
      showStorageConflict();
      notify(
        'Esta pestaña está desactualizada. No se guardó nada; pulsa «Recargar datos» antes de continuar.',
        'error'
      );
      return false;
    }
    // Optimistic concurrency: nunca guardar si cambió desde la lectura anterior.
    // Protege frente a sesiones DESACTUALIZADAS; no sustituye una transacción de servidor.
    if (currentRaw !== expectedStorageRaw) {
      try {
        db = currentRaw ? JSON.parse(currentRaw) : makeDemo();
        lastSavedState = JSON.stringify(db);
        expectedStorageRaw = currentRaw;
      } catch (parseError) {
        try {
          db = JSON.parse(lastSavedState);
        } catch (_) {
          db = makeDemo();
        }
        showStorageConflict();
        notify('El inventario almacenado por otra pestaña no se puede leer. No se guardó nada.', 'error');
        return false;
      }
      ui.proposal = null;
      abcPlacement = null;
      showStorageConflict();
      notify(
        'No se guardó el cambio: otra pestaña tenía datos más recientes. Se recuperó esa versión; revisa y vuelve a intentarlo.',
        'error'
      );
      return false;
    }
    const snapshot = JSON.stringify(db);
    localStorage.setItem(KEY, snapshot);
    expectedStorageRaw = snapshot;
    lastSavedState = snapshot;
    return true;
  } catch (e) {
    try {
      db = JSON.parse(lastSavedState);
    } catch (_) {
      db = makeDemo();
    }
    ui.proposal = null;
    abcPlacement = null;
    notify(
      'No se guardó el cambio. Se restauró la última versión confirmada. Exporta una copia JSON.',
      'error'
    );
    return false;
  }
}
