/**
 * Configuración global de la aplicación.
 * Claves de almacenamiento local, ruta del plano y geometría física del almacén.
 */
'use strict';

/* SIOAL 2.0 — Auditoría 13. Controles críticos: deduplicar ANTES de estimar IQR y recepción obligatoria para importados. */

const KEY = 'SIOAL20_FULL_PROTO_V1';

const PLAN_REAL_IMAGE = 'assets/img/plano-almacen.webp';

const GEOMETRY = {
  length: 15,
  entranceWidth: 8,
  operationsWidth: 11,
  reception: '2 × 1 m',
  bath: '2 × 1 m',
  gap: '1.5–2 m',
  zoneAreasValidated: false
};
