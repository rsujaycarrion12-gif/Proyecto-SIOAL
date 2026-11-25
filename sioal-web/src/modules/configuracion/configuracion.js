/**
 * Pantalla: Configuración (capacidades, políticas y respaldos).
 */
'use strict';

function renderSettings() {
  return `${head('Configuración y respaldos', 'Parámetros referenciales, conservación local y opciones de exportación.', btn('export-backup', ic('download') + ' Descargar respaldo', 'primary'))}<div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>Parámetros del almacén</h3><span class="pill wine">Configuración local</span></div><div class="callout blue" style="margin-bottom:18px">Plano real actualizado: 15 m de largo; 8 m en la entrada; 11 m en la zona operativa. Recepción 2 × 1 m, baño + lavabo 2 × 1 m, pasadizo y salida a otra casa. Las áreas útiles y límites de las zonas A, B y C aún deben medirse. En la simulación, A+B+C debe ser ≤ 165 m² brutos; la capacidad real será menor.</div><form id="settingsForm"><div class="form-row"><div class="field"><label>Capacidad simulada de A (m²)</label><input name="A" type="number" min="0.1" max="165" step="0.1" value="${db.config.capacity.A}"></div><div class="field"><label>Capacidad simulada de B (m²)</label><input name="B" type="number" min="0.1" max="165" step="0.1" value="${db.config.capacity.B}"></div></div><div class="form-row"><div class="field"><label>Capacidad simulada de C (m²)</label><input name="C" type="number" min="0.1" max="165" step="0.1" value="${db.config.capacity.C}"></div><div class="field"><label>Umbral de alerta de ocupación (%)</label><input name="alertPercent" type="number" min="1" max="100" value="${db.config.alertPercent}"></div></div><div class="field"><label>Días para revisar permanencia de registros</label><input name="alertDays" type="number" min="1" max="365" value="${db.config.alertDays}"></div><button class="btn primary" type="submit">${ic('check')} Guardar configuración</button></form></div><div class="card card-pad"><div class="card-header"><h3>Datos, exportación y seguridad</h3></div><div class="steps"><div class="step"><span class="step-no">${ic('download', 16)}</span><div style="flex:1"><strong>Exportar encomiendas</strong><p class="sub">Archivo CSV para análisis en Excel.</p></div>${btn('export-csv', 'Exportar', 'small')}</div><div class="step"><span class="step-no">${ic('shield', 16)}</span><div style="flex:1"><strong>Respaldo completo</strong><p class="sub">Archivo JSON con registros y configuración.</p></div>${btn('export-backup', 'Descargar', 'small')}</div><div class="step"><span class="step-no">${ic('upload', 16)}</span><div style="flex:1"><strong>Restaurar respaldo</strong><p class="sub">Cargar JSON guardado previamente.</p><input type="file" id="backupFile" accept="application/json,.json" style="margin-top:8px;max-width:210px"></div></div><div class="step"><span class="step-no">${ic('refresh', 16)}</span><div style="flex:1"><strong>Reiniciar demostración</strong><p class="sub">Recargar datos ficticios; sustituye el trabajo local.</p></div>${btn('reset-demo', 'Reiniciar', 'small')}</div></div><div class="callout" style="margin-top:18px">Este HTML no incluye autenticación real, PostgreSQL, sincronización entre usuarios ni copias automáticas. No introduzcas información confidencial de clientes para uso productivo. La versión final necesitará un servidor y permisos seguros.</div></div></div><div class="card card-pad" style="margin-top:18px"><div class="card-header"><h3>Arquitectura prevista para la versión final</h3></div><div class="grid-3"><div class="soft-box"><strong>Interfaz web</strong><p class="sub" style="margin:8px 0 0">Administrador desde PC y trabajador desde móvil, con sesiones y permisos.</p></div><div class="soft-box"><strong>API y base de datos</strong><p class="sub" style="margin:8px 0 0">Servidor modular, registro de cambios, importación, validaciones y almacenamiento centralizado.</p></div><div class="soft-box"><strong>Motor cuantitativo</strong><p class="sub" style="margin:8px 0 0">MILP por ubicaciones, CP-SAT para escenarios de dotación, pronóstico y flujo de inventario.</p></div></div></div>`;
}
const MAX_GROSS_WAREHOUSE_M2 = 165; // 15 × 11: cota máxima, NO superficie útil medida.
function validZoneCapacities(caps) {
  const values = ['A', 'B', 'C'].map(z => Number(caps[z]));
  return (
    values.every(v => Number.isFinite(v) && v > 0 && v <= MAX_GROSS_WAREHOUSE_M2) &&
    values.reduce((a, b) => a + b, 0) <= MAX_GROSS_WAREHOUSE_M2 + 1e-9
  );
}
function saveConfig(form, type) {
  const fd = new FormData(form),
    next = structuredClone(db.config);
  if (type === 'capacity' || type === 'settings') {
    const cap = {},
      lim = {};
    for (const z of ['A', 'B', 'C']) {
      const raw = fd.get(type === 'capacity' ? 'c' + z : z);
      cap[z] = raw === null || String(raw).trim() === '' ? NaN : Number(raw);
      if (type === 'capacity') {
        const w = fd.get('w' + z);
        lim[z] = w === null || String(w).trim() === '' ? 0 : Number(w);
        if (!Number.isFinite(lim[z]) || lim[z] < 0)
          return notify('Los límites de peso deben ser cero o positivos.', 'error');
      }
    }
    if (!validZoneCapacities(cap))
      return notify(
        'Capacidades no guardadas: A+B+C no debe superar 165 m² brutos y cada zona debe tener valor positivo. Descuenta pasillos y zonas restringidas cuando se midan.',
        'error'
      );
    next.capacity = cap;
    if (type === 'capacity') next.maxKg = lim;
    const occupied = validatedAssignment({}, true, null, db.items, next);
    if (!occupied.ok)
      return notify(
        'No se guardaron las capacidades: ' +
          occupied.problems.slice(0, 2).join(' · ') +
          '. Reubica mercancías antes de reducir el límite.',
        'error'
      );
    if (type === 'settings') {
      const days = Number(fd.get('alertDays')),
        pct = Number(fd.get('alertPercent'));
      if (!Number.isFinite(days) || !Number.isFinite(pct) || days < 1 || days > 365 || pct < 1 || pct > 100)
        return notify('Revisa los valores de alerta: días 1–365 y porcentaje 1–100.', 'error');
      next.alertDays = Math.round(days);
      next.alertPercent = Math.round(pct);
    }
  } else if (type === 'staff') {
    const raw = fd.get('staffCapacity');
    const v = raw === null || String(raw).trim() === '' ? 0 : Number(raw);
    if (!Number.isFinite(v) || v < 0)
      return notify('La capacidad del personal debe ser cero o positiva.', 'error');
    next.staffCapacity = v;
  } else return notify('Configuración desconocida.', 'error');
  db.config = next;
  ui.proposal = null;
  abcPlacement = null;
  audit('parametros', 'Se actualizaron los parámetros del sistema.');
  render();
  notify('Parámetros guardados correctamente');
}
