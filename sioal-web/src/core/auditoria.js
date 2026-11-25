/**
 * Registro de actividad (bitácora de auditoría).
 */
'use strict';

function audit(type, desc) {
  db.activity.unshift({
    at: new Date().toISOString(),
    type,
    desc,
    actor: ui.role === 'admin' ? 'Administrador (demo)' : 'Trabajador (demo)'
  });
  db.activity = db.activity.slice(0, 180);
  if (!save()) throw Error('No se pudo guardar la operación; se revirtieron los cambios.');
}
