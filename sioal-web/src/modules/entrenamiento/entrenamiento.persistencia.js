/**
 * Entrenamiento IA: persistencia propia y control de versiones.
 */
'use strict';

function invalidateOutdatedStoredForecasts(data) {
  if (!data?.trained?.results || !Array.isArray(data.weeks)) return;
  const currentWeek = weekStart(isoDay()),
    last = data.weeks.length
      ? data.weeks
          .slice()
          .sort((a, b) => a.week.localeCompare(b.week))
          .at(-1).week
      : '';
  const candidate = trainingNextWeek(last);
  if (!candidate || candidate >= currentWeek) return;
  for (const r of Object.values(data.trained.results)) {
    if (!r || typeof r !== 'object') continue;
    r.validated = false;
    r.stale = true;
    const weeks = Math.max(0, Math.round(trainingDays(candidate, currentWeek) / 7));
    if (weeks > 8) {
      r.historicalOnly = true;
      r.forecast = [];
      r.nextWeek = '';
      r.startOffset = 0;
    }
  }
  data.trained.stale = true;
  data.trained.historicalOnly = trainingDays(candidate, currentWeek) > 8 * 7;
}

function showTrainingConflict() {
  staleTrainingStorage = true;
  if (!document.body || document.getElementById('sioal-training-conflict')) return;
  const el = document.createElement('div');
  el.id = 'sioal-training-conflict';
  el.setAttribute('role', 'alert');
  el.style.cssText =
    'position:fixed;z-index:1000000;bottom:14px;left:50%;transform:translateX(-50%);max-width:94vw;width:690px;box-sizing:border-box;background:#fff7e8;color:#653a00;border:2px solid #ca8a04;border-radius:12px;padding:14px 16px;box-shadow:0 10px 28px #0003;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font:600 13px/1.5 system-ui,sans-serif';
  const msg = document.createElement('span');
  msg.textContent =
    'El historial de entrenamiento cambió en otra pestaña. No se guardarán cambios de esta copia; recarga para ver el historial más reciente.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Recargar datos';
  btn.style.cssText =
    'border:0;border-radius:7px;background:#762a54;color:white;padding:9px 12px;font-weight:bold;cursor:pointer';
  btn.addEventListener('click', () => {
    if (confirm('Se descartarán los cambios sin guardar de esta pestaña. ¿Recargar?')) location.reload();
  });
  el.append(msg, btn);
  document.body.append(el);
}
window.addEventListener('storage', event => {
  if (event.key === TRAIN_KEY && event.newValue !== expectedTrainingRaw) showTrainingConflict();
});
function trainingSave() {
  // No persistir estados de certificación autodeclarados por un archivo o por localStorage.
  training.sourceVerified = false;
  if (training.trained?.results)
    for (const r of Object.values(training.trained.results))
      if (r && typeof r === 'object') r.validated = false;
  try {
    const current = localStorage.getItem(TRAIN_KEY);
    if (staleTrainingStorage || current !== expectedTrainingRaw) {
      try {
        training = JSON.parse(lastTrainingState);
      } catch (_) {
        training = structuredClone(tInitial);
      }
      showTrainingConflict();
      notify(
        'No se guardó el entrenamiento: otro historial más reciente existe. Recarga la pestaña.',
        'error'
      );
      return false;
    }
    const snapshot = JSON.stringify(training);
    localStorage.setItem(TRAIN_KEY, snapshot);
    expectedTrainingRaw = snapshot;
    lastTrainingState = snapshot;
    return true;
  } catch (e) {
    try {
      training = JSON.parse(lastTrainingState);
    } catch (_) {
      training = structuredClone(tInitial);
    }
    notify('No se guardó el entrenamiento. Se restauró el último historial confirmado.', 'error');
    return false;
  }
}
