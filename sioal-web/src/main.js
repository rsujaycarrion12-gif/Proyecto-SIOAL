/**
 * Punto de entrada: registra eventos globales y arranca la aplicación.
 */
'use strict';

document.addEventListener('click', actionHandler);
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target?.matches?.('[data-action="select-zone"]')) {
    e.preventDefault();
    e.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
});
document.addEventListener('submit', e => {
  let f = e.target;
  if (!f.id) return;
  e.preventDefault();
  try {
    if (f.id === 'parcelForm') saveParcel(f);
    else if (f.id === 'abcConfigForm') saveABCConfig(f);
    else if (f.id === 'capacityForm') saveConfig(f, 'capacity');
    else if (f.id === 'settingsForm') saveConfig(f, 'settings');
    else if (f.id === 'staffForm') saveConfig(f, 'staff');
    else if (f.id === 'newStaffForm') {
      let fd = new FormData(f),
        name = String(fd.get('name')).trim();
      if (!name) return notify('Indica el nombre del trabajador', 'error');
      db.staff.push({ id: 'PER-' + Date.now(), name, role: String(fd.get('role')), active: true });
      audit('personal', `Se incorporó a ${name}`);
      closeModal();
      render();
      notify('Trabajador añadido');
    } else if (f.id === 'taskForm') {
      let fd = new FormData(f),
        title = String(fd.get('title')).trim();
      if (!title) return;
      db.tasks.unshift({
        id: 'T-' + Date.now(),
        title,
        owner: String(fd.get('owner')),
        priority: String(fd.get('priority')),
        done: false
      });
      audit('tarea', `Se creó la tarea: ${title}`);
      closeModal();
      render();
      notify('Tarea registrada');
    } else if (f.id === 'incidentForm') {
      let fd = new FormData(f),
        p = getParcel(ui.incidentId);
      if (!p) return;
      if (!['almacen', 'incidencia'].includes(p.status))
        return notify('Solo se puede registrar una incidencia física de una mercancía recibida.', 'error');
      const reason = String(fd.get('reason') || ''),
        detail = String(fd.get('description') || '').trim();
      if (!detail) return notify('Describe la incidencia antes de continuar.', 'error');
      if (reason === 'Mercancía no localizada') {
        const previous = p.zone;
        p.zone = 'SIN';
        p.locationUnknown = true;
        p.zoneOrigin = 'Ubicación retirada por incidencia de localización';
        p.note =
          (p.note ? p.note + ' · ' : '') +
          (previous !== 'SIN' ? 'Ubicación anterior Zona ' + previous + '; no confirmada: ' : '') +
          'Mercancía no localizada ' +
          isoDay();
      }
      p.status = 'incidencia';
      p.incident = reason + ': ' + detail;
      updateAutomaticABC();
      audit(
        'incidencia',
        `Se registró incidencia de ${p.code}${reason === 'Mercancía no localizada' ? '; retirado del inventario físico localizado' : ''}`
      );
      closeModal();
      render();
      notify(
        'Incidencia registrada' +
          (reason === 'Mercancía no localizada'
            ? '. La encomienda se ha retirado de las ubicaciones físicas hasta encontrarla.'
            : '')
      );
    }
  } catch (err) {
    console.error(err);
    render();
    notify('Error en el formulario: ' + err.message, 'error');
  }
});
function reRenderInput(input) {
  let id = input.id;
  let pos = input.selectionStart ?? input.value.length;
  render();
  let newer = document.getElementById(id);
  if (newer) {
    newer.focus();
    newer.setSelectionRange(Math.min(pos, newer.value.length), Math.min(pos, newer.value.length));
  }
}
document.addEventListener('input', e => {
  if (e.target.id === 'packageSearch' || e.target.id === 'smartSearch') {
    ui.query = e.target.value;
    reRenderInput(e.target);
  } else if (e.target.id === 'qrCodeInput') {
    ui.qrText = e.target.value;
  }
});
document.addEventListener('change', async e => {
  if (e.target.id === 'abcBulkFile') {
    await loadABCBulk(e.target.files[0]);
  } else if (e.target.id === 'abcBulkFilter') {
    abcBulkFilter = e.target.value;
    recalcABCBulk();
    render();
  } else if (e.target.id === 'importFile') {
    await loadImport(e.target.files[0]);
  } else if (e.target.id === 'trainingFile') {
    await trainingImportFile(e.target.files.length > 1 ? [...e.target.files] : e.target.files[0]);
  } else if (e.target.id === 'backupFile') {
    await importBackup(e.target.files[0]);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    stopCamera();
    closeModal();
  }
});
document.getElementById('role').addEventListener('change', e => {
  ui.role = e.target.value;
  stopCamera();
  go('panel');
  notify('Vista ' + (ui.role === 'admin' ? 'administrador' : 'trabajador') + ' activada (demostración)');
});
document.getElementById('mobile-menu').addEventListener('click', () => {
  document.querySelector('.side').classList.toggle('open');
  document.querySelector('.mobile-scrim').classList.toggle('visible');
});
document.querySelector('.mobile-scrim').addEventListener('click', () => {
  document.querySelector('.side').classList.remove('open');
  document.querySelector('.mobile-scrim').classList.remove('visible');
});
if (ui.page === 'configuracion' || !pages[ui.page]) ui.page = 'panel';
updateAutomaticABC();
save();
render();
