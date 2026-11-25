/**
 * Controlador central de acciones (data-action) de toda la interfaz.
 */
'use strict';

function actionHandler(e) {
  let b = e.target.closest('[data-action]');
  if (!b) return;
  let action = b.dataset.action,
    id = b.dataset.id;
  try {
    switch (action) {
      case 'nav':
        go(b.dataset.page);
        break;
      case 'new':
        newParcel();
        break;
      case 'edit':
        newParcel(getParcel(id));
        break;
      case 'detail':
        openDetail(id);
        break;
      case 'deliver':
        confirmDeliver(id);
        break;
      case 'deliver-confirm':
        deliver(id);
        break;
      case 'receive':
        confirmReceive(id);
        break;
      case 'receive-confirm':
        receiveParcel(id);
        break;
      case 'modal-close':
        closeModal();
        break;
      case 'filter':
        ui.filter = b.dataset.filter;
        render();
        break;
      case 'map-view':
        ui.mapView = b.dataset.view === 'original' ? 'original' : 'digital';
        render();
        break;
      case 'select-zone':
        ui.selectedZone = b.dataset.zone;
        if (ui.page !== 'mapa') go('mapa');
        else render();
        break;
      case 'auto-zone-confirm':
        confirmAutoZone(id);
        break;
      case 'auto-zone-stage':
        confirmAutoStage(id);
        break;
      case 'auto-zone-stage-commit':
        commitAutoStage(id, b.dataset.zone);
        break;
      case 'auto-zone-commit':
        commitAutoZone(id, b.dataset.zone);
        break;
      case 'abc-preview':
        previewABCPlacement();
        break;
      case 'abc-apply':
        applyABCPlacement();
        break;
      case 'abc-export':
        exportABCCurrent();
        break;
      case 'abc-bulk-export':
        exportABCBulk();
        break;
      case 'abc-bulk-reset':
        abcBulk = null;
        abcPlacement = null;
        render();
        break;
      case 'optimize-run':
        previewOptimize();
        break;
      case 'optimize-approve':
        approveOptimize();
        break;
      case 'qr-go':
        go('qr');
        break;
      case 'qr-find': {
        let s = document.getElementById('qrCodeInput')?.value.trim() || ui.qrText;
        ui.qrText = s;
        let p = db.items.find(x => norm(x.code) === norm(s));
        if (p) openDetail(p.id);
        else notify(`No existe una guía con el código ${s || '(vacío)'}.`, 'error');
        break;
      }
      case 'qr-scan':
        startScan();
        break;
      case 'qr-stop':
        stopCamera();
        let a = document.getElementById('scan-area');
        if (a) a.innerHTML = '';
        break;
      case 'label':
        qrLabel(id);
        break;
      case 'label-print':
        window.print();
        break;
      case 'label-download':
        downloadQr(id);
        break;
      case 'search-chip':
        ui.query = b.dataset.term;
        render();
        document.getElementById('smartSearch')?.focus();
        break;
      case 'import-confirm':
        confirmImport();
        break;
      case 'train-action':
        handleTrainingAction(b);
        break;
      case 'export-template':
        templateCsv();
        break;
      case 'export-csv':
        exportCsv();
        break;
      case 'export-backup':
        exportBackup();
        break;
      case 'task-new':
        openTask();
        break;
      case 'task-replan':
        replanTasks();
        break;
      case 'task-toggle': {
        let t = db.tasks.find(t => t.id === id);
        if (t) {
          t.done = !t.done;
          audit('tarea', `${t.done ? 'Se completó' : 'Se reabrió'} la tarea: ${t.title}`);
          render();
          notify('Tarea actualizada');
        }
        break;
      }
      case 'staff-new':
        openStaff();
        break;
      case 'staff-toggle': {
        let s = db.staff.find(t => t.id === id);
        if (s) {
          s.active = !s.active;
          audit('personal', `Se cambió la disponibilidad de ${s.name}`);
          render();
        }
        break;
      }
      case 'incident':
        openIncident(id);
        break;
      case 'resolve':
        resolveIncident(id);
        break;
      case 'resolve-confirm': {
        let p = getParcel(id);
        if (p) {
          if (p.status !== 'incidencia')
            return notify('La guía no tiene una incidencia activa que pueda resolverse.', 'error');
          if (p.source === 'importado' && !p.receivedAt)
            return notify('Confirma primero la recepción física de esta orden importada.', 'error');
          const wasUnlocated = isUnlocated(p);
          p.status = 'almacen';
          if (wasUnlocated) p.zone = 'SIN';
          p.locationUnknown = false;
          p.note = (p.note ? p.note + ' · ' : '') + 'Incidencia resuelta: ' + (p.incident || '');
          p.incident = '';
          updateAutomaticABC();
          audit('incidencia', `Se resolvió la incidencia de ${p.code}`);
          closeModal();
          render();
          notify('Incidencia resuelta');
        }
        break;
      }
      case 'reset-demo': {
        if (confirm('¿Deseas reiniciar? Se reemplazarán los datos locales actuales por datos de ejemplo.')) {
          stopCamera();
          db = makeDemo();
          updateAutomaticABC();
          ui.proposal = null;
          ui.importRows = [];
          if (!save()) throw Error('No se pudo reiniciar la demostración');
          go('panel');
          notify('Datos de demostración restaurados');
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(err);
    render();
    notify('No se pudo completar la acción: ' + (err.message || err), 'error');
  }
}
