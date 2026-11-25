/**
 * Reconocimiento de columnas del Excel y conciliación de estados.
 */
'use strict';

const aliases = {
  code: [
    'numeroos',
    'numeros',
    'nroguia',
    'numeroguia',
    'guia',
    'guiatransp',
    'codigo',
    'codigoguia',
    'numero',
    'numeromanifiesto',
    'manifiesto',
    'id'
  ],
  date: ['fecha', 'fecharegistro', 'fechaingreso', 'llegada'],
  sender: ['remitente', 'clienteorigen', 'emisor'],
  recipient: ['destinatario', 'receptor', 'cliente', 'nombre'],
  dest: ['destino', 'ciudaddestino'],
  type: ['detalle', 'tipo', 'tipomercancia', 'descripcion'],
  qty: ['tcantidad', 'cantidad', 'tbultos', 'bultos', 'nrobultos'],
  kg: ['tpeso', 'peso', 'pesototal'],
  status: ['entrega', 'estado', 'estatus'],
  origin: ['origen'],
  note: ['direccionentrega', 'docreferencia']
};
/* SIOAL revisión 2.2: columnas prioritarias y estados contrastados. */
function columnLookup(headers) {
  const h = headers.map(stripKey),
    col = {};
  for (const [field, opts] of Object.entries(aliases))
    col[field] = opts.map(key => h.indexOf(key)).find(n => n >= 0) ?? -1;
  col.order = h.indexOf('numeroos');
  col.delivery = h.indexOf('entrega');
  col.orderStatus = h.indexOf('estado');
  if (col.order >= 0) col.code = col.order; // Nunca preferir ID interno sobre NÚMERO O.S.
  return col;
}
function statusFromTwo(rawDelivery, rawState) {
  const d = norm(rawDelivery),
    s = norm(rawState);
  const evalState = x =>
    x === 'entregado' || x === 'entregada'
      ? true
      : [
            'no entregado',
            'no entregada',
            'sin entregar',
            'pendiente',
            'en transito',
            'en ruta',
            'en transporte',
            'preparando',
            'listo para entrega',
            'en almacen',
            'en almacén'
          ].includes(x)
        ? false
        : null;
  // Anulada/cancelada nunca significa encomienda físicamente pendiente.
  const cancelled = /\b(anulad[oa]s?|cancelad[oa]s?|rechazad[oa]s?|invalidad[oa]s?)\b/;
  if (cancelled.test(d) || cancelled.test(s))
    return {
      valid: false,
      delivered: false,
      reason: 'Orden anulada/cancelada: no incorporar al inventario activo'
    };
  const a = evalState(d),
    b = evalState(s);
  const contradiction = a !== null && b !== null && a !== b;
  if (contradiction) return { valid: false, delivered: false, reason: 'ESTADO y ENTREGA contradictorios' };
  if (d && a === null) return { valid: false, delivered: false, reason: 'Valor de ENTREGA desconocido' };
  if (s && b === null)
    return {
      valid: false,
      delivered: false,
      reason: 'ESTADO desconocido: revisar antes de incorporar al inventario'
    };
  if (!d && !s)
    return {
      valid: false,
      delivered: false,
      reason: 'ESTADO y ENTREGA vacíos: verificar antes de incorporar al inventario'
    };
  // ENTREGA y ESTADO pueden referirse a la entrega al cliente o a la ubicación física.
  // Si ambos especifican ubicaciones opuestas, la orden exige revisión: no escoger uno arbitrariamente.
  const physical = x =>
    ['en transito', 'en ruta', 'en transporte'].includes(x)
      ? 'transito'
      : ['en almacen', 'en almacén'].includes(x)
        ? 'almacen'
        : null;
  const physicalDelivery = physical(d),
    physicalState = physical(s);
  if (physicalDelivery && physicalState && physicalDelivery !== physicalState)
    return {
      valid: false,
      delivered: false,
      inTransit: false,
      reason: 'Contradicción física: EN ALMACÉN y EN TRÁNSITO; confirmar recepción'
    };
  const delivered = a !== null ? a : b === true;
  const inTransit = !delivered && (physicalDelivery === 'transito' || physicalState === 'transito');
  return {
    valid: true,
    delivered,
    inTransit,
    inWarehouse: !delivered && (physicalDelivery === 'almacen' || physicalState === 'almacen'),
    reason: ''
  };
}
