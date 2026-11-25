/**
 * Utilidades de texto: normalización sin tildes y claves de columnas.
 */
'use strict';

function norm(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function stripKey(str) {
  return norm(str).replace(/[^a-z0-9]/g, '');
}
