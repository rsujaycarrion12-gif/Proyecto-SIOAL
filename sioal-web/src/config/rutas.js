/**
 * Definición de pantallas (rutas) y menús por rol (administrador / trabajador).
 */
'use strict';

const pages = {
  panel: {
    title: 'Panel de control',
    icon: 'grid',
    desc: 'Información general del almacén y decisiones operativas.'
  },
  encomiendas: {
    title: 'Encomiendas',
    icon: 'box',
    desc: 'Registrar, identificar, editar y entregar mercancías.'
  },
  mapa: {
    title: 'Mapa digital',
    icon: 'map',
    desc: 'Distribución física del almacén y ubicación por zonas.'
  },
  optimizar: {
    title: 'Optimización MILP',
    icon: 'sliders',
    desc: 'Propuesta de asignación matemática de encomiendas.'
  },
  abc: {
    title: 'Clasificación ABC por peso',
    icon: 'layers',
    desc: 'Distribución automática por peso y validación de ubicación.'
  },
  entrenamiento: {
    title: 'Entrenamiento IA',
    icon: 'spark',
    desc: 'Validar Excel, entrenar pronósticos y calibrar MILP.'
  },
  buscador: {
    title: 'Buscador inteligente',
    icon: 'search',
    desc: 'Localiza paquetes por código, destinatario o descripción.'
  },
  qr: { title: 'Códigos QR', icon: 'scan', desc: 'Consultar y crear etiquetas de identificación.' },
  importar: {
    title: 'Importar Excel',
    icon: 'upload',
    desc: 'Integración de registros y revisión previa de datos.'
  },
  operaciones: {
    title: 'Operaciones',
    icon: 'clipboard',
    desc: 'Seguimiento de recepción, despacho e incidencias.'
  },
  tareas: { title: 'Tareas', icon: 'layers', desc: 'Reorganización de tareas pendientes por prioridad.' },
  personal: {
    title: 'Personal y capacidad',
    icon: 'users',
    desc: 'Carga mensual y escenarios de personal sin registrar tiempos.'
  },
  reportes: {
    title: 'Reportes y pronósticos',
    icon: 'chart',
    desc: 'Indicadores por semana, mes, peso y cantidad.'
  },
  alertas: { title: 'Alertas', icon: 'bell', desc: 'Revisiones de capacidad, registro y permanencia.' },
  configuracion: {
    title: 'Configuración',
    icon: 'settings',
    desc: 'Capacidades provisionales, políticas y respaldo de datos.'
  }
};
const navAdmin = [
  ['GENERAL', 'panel', 'encomiendas', 'mapa'],
  ['INTELIGENCIA', 'abc', 'entrenamiento', 'optimizar', 'buscador', 'qr', 'importar'],
  ['GESTIÓN', 'operaciones', 'tareas', 'personal', 'reportes', 'alertas'],
  ['SISTEMA', 'configuracion']
];
const navWorker = [
  ['OPERACIÓN', 'panel', 'encomiendas', 'mapa', 'abc', 'buscador', 'qr', 'operaciones', 'tareas', 'alertas']
];
