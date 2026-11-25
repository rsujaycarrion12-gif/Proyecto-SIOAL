/**
 * Exportación CSV segura (anti fórmula) y descargas.
 */
'use strict';

function safeCsvCell(v) {
  let s = String(v ?? '');
  if (/^[\s\uFEFF\u200B-\u200F\u202A-\u202E]*[=+\-@]/.test(s)) s = "'" + s;
  return s;
}
function csvEscape(v) {
  let str = safeCsvCell(v);
  return /[;"\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}
function csvText(rows) {
  return '\ufeff' + rows.map(r => r.map(csvEscape).join(';')).join('\r\n');
}
function downloadBlob(blob, name) {
  let u = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 1500);
}
function safeFilename(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 70);
}
function templateCsv() {
  let rows = [
    [
      'NÚMERO O.S.',
      'FECHA',
      'REMITENTE',
      'DESTINATARIO',
      'DESTINO',
      'DETALLE',
      'T. CANTIDAD',
      'T. PESO',
      'ENTREGA'
    ],
    [
      'ENC-EJEMPLO-001',
      isoDay(),
      'Remitente de ejemplo',
      'Cliente de ejemplo',
      'Juliaca',
      'Caja',
      1,
      '12 KG',
      'NO ENTREGADO'
    ]
  ];
  downloadBlob(
    new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }),
    'SIOAL_plantilla_importacion.csv'
  );
}
function exportCsv() {
  // Los primeros encabezados son compatibles con el importador operativo y el motor ABC.
  // La recepción, el estado interno y la zona histórica se exportan como datos informativos:
  // volver a importar un CSV no puede confirmar por sí solo una recepción física.
  const headers = [
    'NÚMERO O.S.',
    'FECHA',
    'REMITENTE',
    'DESTINATARIO',
    'DESTINO',
    'DETALLE',
    'T. CANTIDAD',
    'T. PESO',
    'ENTREGA',
    'ESTADO',
    'LARGO M',
    'ANCHO M',
    'PRIORIDAD',
    'ZONA REGISTRADA',
    'RECEPCIÓN FÍSICA',
    'FECHA ENTREGA',
    'INCIDENCIA'
  ];
  const rows = db.items.map(p => [
    p.code,
    p.date,
    p.sender,
    p.recipient,
    p.dest,
    p.type,
    p.qty,
    `${p.kg} KG`,
    p.status === 'entregado' ? 'ENTREGADO' : 'NO ENTREGADO',
    p.status === 'entregado'
      ? 'ENTREGADO'
      : p.status === 'transito'
        ? 'EN TRÁNSITO'
        : p.status === 'pendiente_recepcion'
          ? 'PENDIENTE'
          : 'EN ALMACÉN',
    p.length,
    p.width,
    p.priority,
    p.zone,
    p.receivedAt || '',
    p.deliveredAt || '',
    p.incident || ''
  ]);
  downloadBlob(
    new Blob([csvText([headers, ...rows])], { type: 'text/csv;charset=utf-8' }),
    'SIOAL_encomiendas_' + isoDay() + '.csv'
  );
  notify(
    'CSV compatible con la importación generado. Las zonas históricas no equivalen a recepción confirmada.'
  );
}
function exportBackup() {
  const bundle = {
    format: 'SIOAL_FULL_BACKUP_V2',
    exportedAt: new Date().toISOString(),
    inventory: db,
    training
  };
  downloadBlob(
    new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json;charset=utf-8' }),
    'SIOAL_respaldo_completo_' + isoDay() + '.json'
  );
  notify('Copia completa descargada: inventario y entrenamiento IA.');
}
