/**
 * Reglas de negocio del inventario: huella, mercancía activa/no localizada,
 * contadores de ocupación y generación de alertas.
 */
'use strict';

function footprint(p) {
  return p.width > 0 && p.length > 0 ? round(p.width * p.length * Math.max(1, Number(p.qty) || 1), 3) : 0;
}
function activeItems() {
  return db.items.filter(x => x.status === 'almacen' || x.status === 'incidencia');
}
// Un paquete no localizado sigue en la lista de incidencias, pero no constituye
// existencia física confirmada ni puede recibir una zona de almacenamiento.
function isUnlocated(p) {
  return (
    !!p &&
    p.status === 'incidencia' &&
    (/mercanc[ií]a no localizada/i.test(String(p.incident || '')) || p.locationUnknown === true)
  );
}

function counts() {
  let items = activeItems().filter(p => !isUnlocated(p)),
    unlocated = activeItems().filter(isUnlocated).length,
    kg = items.reduce((s, p) => s + nval(p.kg), 0),
    qty = items.reduce((s, p) => s + nval(p.qty), 0),
    unassigned = items.filter(p => p.zone === 'SIN').length;
  let occ = {};
  for (let z of ['A', 'B', 'C']) {
    let zone = items.filter(x => x.zone === z);
    occ[z] = {
      count: zone.length,
      qty: zone.reduce((a, p) => a + p.qty, 0),
      kg: zone.reduce((a, p) => a + p.kg, 0),
      area: round(
        zone.reduce((a, p) => a + footprint(p), 0),
        2
      ),
      cap: nval(db.config.capacity[z])
    };
    occ[z].percent = occ[z].cap ? round((occ[z].area / occ[z].cap) * 100, 1) : 0;
  }
  return {
    active: items.length,
    unlocated,
    qty,
    kg,
    unassigned,
    occ,
    total: db.items.length,
    delivered: db.items.filter(p => p.status === 'entregado').length,
    awaiting: db.items.filter(p => p.status === 'transito' || p.status === 'pendiente_recepcion').length
  };
}
function alerts() {
  let c = counts(),
    a = [];
  if (c.unassigned)
    a.push({
      level: 'warn',
      title: `${c.unassigned} encomiendas sin zona asignada`,
      desc: 'Ejecuta la optimización o asigna una ubicación desde el registro.',
      page: 'optimizar'
    });
  let missing = activeItems().filter(x => !x.width || !x.length);
  if (missing.length)
    a.push({
      level: 'warn',
      title: `${missing.length} encomiendas sin dimensiones`,
      desc: 'Se necesitan largo y ancho para calcular su huella en el suelo.',
      page: 'encomiendas'
    });
  const chronoProblems = db.items.filter(p => parcelChronologyIssue(p));
  if (chronoProblems.length)
    a.push({
      level: 'warn',
      title: `${chronoProblems.length} órdenes con fechas inconsistentes`,
      desc: 'Revisar fecha de orden, recepción y entrega. No se modificaron datos históricos automáticamente.',
      page: 'encomiendas'
    });
  let weightProblems = sharedWeightReview(activeItems()).reasons;
  if (weightProblems.size)
    a.push({
      level: 'warn',
      title: `${weightProblems.size} encomiendas con peso por revisar`,
      desc: 'Mismo control de peso extremo e IQR que Entrenamiento IA. Revisa el peso antes de confirmar una ubicación ABC.',
      page: 'abc'
    });
  const abcRanks = abcCurrent();
  const occupiedUnclassified = activeItems().filter(
    p => ['A', 'B', 'C'].includes(p.zone) && !abcRanks.map.has(p.id)
  );
  if (occupiedUnclassified.length)
    a.push({
      level: 'danger',
      title: `${occupiedUnclassified.length} encomiendas con zona física pero sin clasificación ABC vigente`,
      desc: 'La ubicación es histórica o está pendiente de revisión; comprobar estado y peso. No se atribuye una nueva posición automáticamente.',
      page: 'mapa'
    });
  let huge = activeItems().filter(x => x.width > 0 && x.length > 0 && physicalEnvelopeProblem(x));
  if (huge.length)
    a.push({
      level: 'danger',
      title: `${huge.length} encomiendas con dimensiones incompatibles`,
      desc: 'La mercancía supera el contorno máximo; no se puede asignar una zona. Verificar medidas.',
      page: 'encomiendas'
    });
  for (let z of ['A', 'B', 'C']) {
    if (c.occ[z].cap > 0 && c.occ[z].percent >= db.config.alertPercent)
      a.push({
        level: c.occ[z].percent > 100 ? 'danger' : 'warn',
        title: `Zona ${z}: ${c.occ[z].percent}% de ocupación referencial`,
        desc: 'Revisar disponibilidad y condiciones de circulación.',
        page: 'mapa'
      });
  }
  let days = activeItems().filter(x => daySpan(x.date) > db.config.alertDays);
  if (days.length)
    a.push({
      level: 'info',
      title: `${days.length} registros con más de ${db.config.alertDays} días`,
      desc: 'Se sugiere revisar su situación; la fecha de orden puede ser distinta de la llegada.',
      page: 'encomiendas'
    });
  if (c.unlocated)
    a.push({
      level: 'danger',
      title: `${c.unlocated} mercancías no localizadas`,
      desc: 'No figuran como ubicadas físicamente; resolver incidencia y confirmar nueva posición antes de volver a contarlas.',
      page: 'operaciones'
    });
  let incidents = activeItems().filter(x => x.status === 'incidencia');
  if (incidents.length)
    a.push({
      level: 'danger',
      title: `${incidents.length} encomiendas con incidencia`,
      desc: 'Verificar observaciones antes de realizar la entrega.',
      page: 'operaciones'
    });
  return a;
}
