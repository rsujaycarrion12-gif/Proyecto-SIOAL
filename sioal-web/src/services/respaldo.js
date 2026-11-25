/**
 * Validación y restauración de respaldos JSON.
 */
'use strict';

function validatedBackup(v) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    !Array.isArray(v.items) ||
    !Array.isArray(v.staff) ||
    !Array.isArray(v.tasks) ||
    !Array.isArray(v.activity) ||
    !v.config ||
    typeof v.config !== 'object' ||
    Array.isArray(v.config)
  )
    throw Error('Estructura del respaldo incompleta.');
  if (v.items.length > 15000 || v.staff.length > 500 || v.tasks.length > 25000 || v.activity.length > 10000)
    throw Error('Respaldo demasiado grande para el navegador.');
  const ids = new Set(),
    codes = new Set();
  for (const p of v.items) {
    if (
      !p ||
      typeof p !== 'object' ||
      Array.isArray(p) ||
      typeof p.id !== 'string' ||
      !p.id.trim() ||
      typeof p.code !== 'string' ||
      !p.code.trim() ||
      typeof p.recipient !== 'string' ||
      !['almacen', 'incidencia', 'entregado', 'transito', 'pendiente_recepcion'].includes(p.status)
    )
      throw Error('Hay encomiendas incompletas o incorrectas.');
    if (ids.has(p.id) || codes.has(norm(p.code)))
      throw Error('El respaldo contiene códigos o identificadores duplicados.');
    ids.add(p.id);
    codes.add(norm(p.code));
    if (
      !Number.isFinite(p.kg) ||
      p.kg <= 0 ||
      !Number.isSafeInteger(p.qty) ||
      p.qty < 1 ||
      !Number.isFinite(p.width) ||
      p.width < 0 ||
      !Number.isFinite(p.length) ||
      p.length < 0 ||
      !['A', 'B', 'C', 'SIN'].includes(p.zone)
    )
      throw Error('Peso, cantidad, dimensiones o zonas inválidos en el respaldo.');
    if (['transito', 'pendiente_recepcion'].includes(p.status) && p.zone !== 'SIN')
      throw Error('Una guía no recibida no puede estar asignada a una zona física: ' + p.code);
    if (isUnlocated(p) && p.zone !== 'SIN')
      throw Error('La encomienda no localizada no puede conservar una zona física en el respaldo: ' + p.code);
    // No basta con que el respaldo declare status='almacen' o zone='A'.
    // Una guía importada solo puede contar como inventario físico con recepción documentada.
    if (p.source === 'importado' && ['almacen', 'incidencia'].includes(p.status) && !p.receivedAt)
      throw Error(
        'Recepción física no confirmada en la orden importada ' +
          p.code +
          '. Restáurala como pendiente de recepción, sin zona, o registra su recepción real.'
      );
    if (
      p.receivedAt !== undefined &&
      p.receivedAt !== '' &&
      (typeof p.receivedAt !== 'string' || !trainingDay(p.receivedAt) || p.receivedAt > isoDay())
    )
      throw Error('Fecha de recepción inválida: ' + p.code);
    if (typeof p.date !== 'string' || !trainingDay(p.date) || p.date > isoDay())
      throw Error(`Fecha de registro inválida o futura en el respaldo: ${p.code}`);
    if (
      p.deliveredAt !== undefined &&
      p.deliveredAt !== null &&
      p.deliveredAt !== '' &&
      (typeof p.deliveredAt !== 'string' ||
        !trainingDay(p.deliveredAt) ||
        p.deliveredAt > isoDay() ||
        p.deliveredAt < p.date)
    )
      throw Error(`Fecha de entrega inválida en el respaldo: ${p.code}`);
    const chronologyIssue = parcelChronologyIssue(p);
    if (chronologyIssue)
      throw Error('Secuencia cronológica inválida en ' + p.code + ': ' + chronologyIssue + '.');
  }
  const validText = (s, max = 500) => typeof s === 'string' && s.length <= max;
  const staffIds = new Set(),
    taskIds = new Set();
  for (const x of v.staff) {
    if (
      !x ||
      typeof x !== 'object' ||
      Array.isArray(x) ||
      !validText(x.id, 160) ||
      !x.id.trim() ||
      !validText(x.name, 150) ||
      !validText(x.role, 150) ||
      typeof x.active !== 'boolean'
    )
      throw Error('Hay registros de personal incompletos o con tipos incorrectos.');
    const key = x.id.trim().toLowerCase();
    if (staffIds.has(key))
      throw Error('El respaldo contiene trabajadores con el mismo identificador: ' + x.id);
    staffIds.add(key);
  }
  for (const t of v.tasks) {
    if (
      !t ||
      typeof t !== 'object' ||
      Array.isArray(t) ||
      !validText(t.id, 160) ||
      !t.id.trim() ||
      !validText(t.title, 250) ||
      !validText(t.owner, 150) ||
      !['alta', 'media', 'baja'].includes(t.priority) ||
      typeof t.done !== 'boolean'
    )
      throw Error('Hay tareas dañadas en el respaldo.');
    const key = t.id.trim().toLowerCase();
    if (taskIds.has(key)) throw Error('El respaldo contiene tareas con el mismo identificador: ' + t.id);
    taskIds.add(key);
  }
  for (const a of v.activity) {
    if (
      !a ||
      typeof a !== 'object' ||
      Array.isArray(a) ||
      !validText(a.at, 50) ||
      !/^\d{4}-\d{2}-\d{2}T/.test(a.at) ||
      !Number.isFinite(Date.parse(a.at)) ||
      !validText(a.type, 120) ||
      !validText(a.desc, 1200) ||
      !validText(a.actor, 200)
    )
      throw Error('La bitácora contiene fechas o campos de tipo incorrecto.');
  }
  if (!validZoneCapacities(v.config.capacity || {}))
    throw Error('Las capacidades del respaldo no son válidas para el plano actual.');
  const maxKg = {};
  for (const z of ['A', 'B', 'C']) {
    const k = Number(v.config.maxKg?.[z] ?? 0);
    if (!Number.isFinite(k) || k < 0) throw Error('Límite de peso incorrecto.');
    maxKg[z] = k;
  }
  const cleaned = structuredClone(v);
  cleaned.config = Object.assign({}, structuredClone(defaultConfig), v.config, {
    capacity: Object.fromEntries(['A', 'B', 'C'].map(z => [z, Number(v.config.capacity[z])])),
    maxKg
  });
  normalizeLegacyArrival(cleaned);
  const occupancy = validatedAssignment({}, true, null, cleaned.items, cleaned.config);
  if (!occupancy.ok)
    throw Error('Respaldo con ubicaciones no válidas: ' + occupancy.problems.slice(0, 3).join(' · '));
  return cleaned;
}
function validatedTrainingBackup(payload) {
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !Array.isArray(payload.weeks) ||
    payload.weeks.length > 550 ||
    typeof payload.source !== 'string'
  )
    throw Error('Historial de entrenamiento incompleto o incorrecto.');
  if (
    !Number.isSafeInteger(Number(payload.records)) ||
    Number(payload.records) < 0 ||
    Number(payload.records) > 350000
  )
    throw Error('Cantidad de registros de entrenamiento inválida.');
  if (payload.from && !trainingDay(payload.from)) throw Error('Inicio del histórico inválido.');
  if (payload.to && (!trainingDay(payload.to) || payload.to > isoDay()))
    throw Error('Fin del histórico inválido o futuro.');
  if (payload.from && payload.to && payload.from > payload.to)
    throw Error('Rango de fechas del entrenamiento incorrecto.');
  const seen = new Set();
  for (const w of payload.weeks) {
    if (
      !w ||
      typeof w !== 'object' ||
      !trainingDay(w.week) ||
      w.week > weekStart(isoDay()) ||
      weekStart(w.week) !== w.week ||
      seen.has(w.week)
    )
      throw Error('Semanas duplicadas, futuras o incorrectas en el entrenamiento.');
    seen.add(w.week);
    for (const field of ['kg', 'qty', 'orders'])
      if (!Number.isFinite(w[field]) || w[field] < 0)
        throw Error('Totales semanales incorrectos en ' + w.week + '.');
  }
  const copy = structuredClone(payload);
  copy.sourceVerified = false; // no hay verificación independiente en un archivo local
  // Los resultados entrenados se deben recalcular después de restaurar, por trazabilidad.
  copy.trained = null;
  return copy;
}
async function importBackup(file) {
  if (!file) return;
  try {
    if (file.size > 20000000) throw Error('El respaldo supera 20 MB.');
    const payload = JSON.parse(await file.text());
    const full = payload?.format === 'SIOAL_FULL_BACKUP_V2';
    if (payload?.format && !full) throw Error('Formato de respaldo no reconocido.');
    const loaded = validatedBackup(full ? payload.inventory : payload);
    const loadedTraining = full ? validatedTrainingBackup(payload.training) : null;
    if (staleStorage || (full && staleTrainingStorage))
      throw Error('Esta pestaña está desactualizada. Recarga antes de restaurar.');
    // Comprobar conflictos antes de editar cualquier dato del navegador.
    const previousInventory = localStorage.getItem(KEY),
      previousTraining = localStorage.getItem(TRAIN_KEY);
    if (previousInventory !== expectedStorageRaw || (full && previousTraining !== expectedTrainingRaw))
      throw Error('Otra pestaña actualizó los registros. Recarga para restaurar.');
    if (
      !confirm(
        full
          ? '¿Restaurar inventario y entrenamiento IA? Se reemplazarán los registros actuales.'
          : 'Respaldo antiguo: solo reemplazará el inventario. El entrenamiento existente no se cambiará. ¿Continuar?'
      )
    )
      return;
    const oldDb = db,
      oldTraining = training;
    db = loaded;
    updateAutomaticABC();
    const nextInventory = JSON.stringify(db),
      nextTraining = full ? JSON.stringify(loadedTraining) : null;
    try {
      localStorage.setItem(KEY, nextInventory);
      if (full) localStorage.setItem(TRAIN_KEY, nextTraining);
    } catch (writeError) {
      // Dos claves no son una transacción real: intentar restaurar ambas ante un error.
      let undone = true;
      try {
        if (previousInventory === null) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, previousInventory);
      } catch (e) {
        undone = false;
      }
      if (full)
        try {
          if (previousTraining === null) localStorage.removeItem(TRAIN_KEY);
          else localStorage.setItem(TRAIN_KEY, previousTraining);
        } catch (e) {
          undone = false;
        }
      db = oldDb;
      training = oldTraining;
      if (!undone)
        throw Error(
          'Fallo crítico de restauración: no se pudo revertir todo el almacenamiento. Exporta los datos disponibles y recarga la página.'
        );
      throw Error(
        'No se restauró el respaldo porque falló el guardado. Se intentó mantener intacta la información anterior.'
      );
    }
    expectedStorageRaw = nextInventory;
    lastSavedState = nextInventory;
    if (full) {
      training = loadedTraining;
      expectedTrainingRaw = nextTraining;
      lastTrainingState = nextTraining;
      trainUI.tab = 'datos';
    }
    ui.proposal = null;
    ui.importRows = [];
    ui.importStats = null;
    abcPlacement = null;
    abcBulk = null;
    render();
    notify(
      full
        ? 'Respaldo completo restaurado. Reentrena los modelos para validar los resultados.'
        : 'Respaldo antiguo restaurado: el entrenamiento IA no se modificó.'
    );
  } catch (e) {
    render();
    notify('No se pudo restaurar: ' + e.message, 'error');
  }
}
