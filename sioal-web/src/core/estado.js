/**
 * Estado de la aplicación: carga/migración del inventario desde localStorage
 * y estado de interfaz (ui). Se ejecuta tras cargar todos los módulos.
 */
'use strict';

// Auditoría 6 · corrección 1: conservar la instantánea exacta que abrió esta pestaña.
// No se marca como guardada una versión que aún no existe en localStorage.
let initialStorageRaw = null;
let db;
try {
  initialStorageRaw = localStorage.getItem(KEY);
  db = initialStorageRaw ? JSON.parse(initialStorageRaw) : makeDemo();
} catch (e) {
  db = makeDemo();
}
if (!db.config) db.config = structuredClone(defaultConfig);
if (!db.config.geometryVersion) {
  const oldCap = db.config.capacity || {};
  if (['A', 'B', 'C'].every(z => Number(oldCap[z]) === 36)) db.config.capacity = { A: 18, B: 18, C: 18 };
  db.config.geometryVersion = 'REAL_15m_8m_11m';
  db.config.capacityUnverified = true;
}
for (let k of ['capacity', 'maxKg']) db.config[k] = Object.assign({}, defaultConfig[k], db.config[k] || {});
db.items = Array.isArray(db.items) ? db.items : [];
db.staff = Array.isArray(db.staff) ? db.staff : [];
db.tasks = Array.isArray(db.tasks) ? db.tasks : [];
db.activity = Array.isArray(db.activity) ? db.activity : [];

function normalizeLegacyArrival(dataset) {
  if (!dataset || !Array.isArray(dataset.items)) return 0;
  let n = 0;
  for (const p of dataset.items) {
    // Registros importados de versiones anteriores, sin recepción física confirmada.
    if (p && p.source === 'importado' && ['almacen', 'incidencia'].includes(p.status) && !p.receivedAt) {
      const oldZone = p.zone;
      p.status = 'pendiente_recepcion';
      p.zone = 'SIN';
      if (['A', 'B', 'C'].includes(oldZone))
        p.note =
          (p.note ? p.note + ' · ' : '') +
          'Zona antigua ' +
          oldZone +
          ' retirada por falta de recepción física (revisar)';
      n++;
    }
  }
  return n;
}

normalizeLegacyArrival(db);
// Depurar ubicaciones antiguas incompatibles, dejando constancia en la guía.
for (const legacy of db.items) {
  if (isUnlocated(legacy) && legacy.zone !== 'SIN') {
    const previous = legacy.zone;
    legacy.zone = 'SIN';
    legacy.locationUnknown = true;
    legacy.zoneOrigin = 'Ubicación anterior no confirmada por incidencia de localización';
    legacy.note =
      (legacy.note ? legacy.note + ' · ' : '') +
      'Zona ' +
      previous +
      ' retirada de inventario físico tras incidencia de localización (revisar)';
  }
}
const ui = {
  page: (location.hash || '#panel').replace('#', ''),
  role: 'admin',
  mobile: false,
  filter: 'almacen',
  query: '',
  selectedZone: 'A',
  proposal: null,
  qrText: '',
  importRows: [],
  importFile: '',
  importStats: null,
  staffFilter: 'todos',
  mapView: 'digital',
  importTab: 'xlsx',
  taskSort: 'prioridad'
};

let lastSavedState = JSON.stringify(db);
let expectedStorageRaw = initialStorageRaw;
let staleStorage = false;
