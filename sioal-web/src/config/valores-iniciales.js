/**
 * Valores por defecto: fecha actual, capacidades por zona y personal inicial.
 */
'use strict';

const DATES = { current: isoDay() };
const defaultConfig = {
  capacity: { A: 18, B: 18, C: 18 },
  maxKg: { A: 0, B: 0, C: 0 },
  staffCount: 6,
  staffCapacity: 0,
  alertDays: 5,
  alertPercent: 85
};
const starterPeople = [
  ['Ana Quispe', 'Operaciones'],
  ['Carlos Mamani', 'Almacén'],
  ['Rosa Flores', 'Recepción'],
  ['Mario Huanca', 'Almacén'],
  ['Lucía Condori', 'Gerencia'],
  ['José Tito', 'Despacho']
].map((a, i) => ({ id: 'PER-' + (i + 1), name: a[0], role: a[1], active: true }));
