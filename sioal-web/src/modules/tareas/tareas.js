/**
 * Pantalla: Tareas operativas y replanificación automática.
 */
'use strict';

function renderTasks() {
  let sorted = [...db.tasks].sort(
    (a, b) =>
      a.done - b.done ||
      { alta: 0, media: 1, baja: 2 }[a.priority] - { alta: 0, media: 1, baja: 2 }[b.priority]
  );
  return `${head('Planificación de tareas', 'Tareas organizadas por prioridad y estado, sin medir ni programar tiempos.', btn('task-new', ic('plus') + ' Nueva tarea', 'primary') + btn('task-replan', ic('refresh') + ' Replanificar prioridades', 'soft'))}<div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>Trabajo pendiente</h3><span class="pill wine">${db.tasks.filter(t => !t.done).length} tareas</span></div><div class="steps">${sorted.map(t => `<div class="step" style="opacity:${t.done ? '.58' : '1'}"><div class="step-no">${ic(t.done ? 'check' : 'clipboard', 15)}</div><div style="flex:1"><strong style="${t.done ? 'text-decoration:line-through' : ''}">${esc(t.title)}</strong><p class="sub" style="margin:6px 0 0">${esc(t.owner || 'Sin responsable')}</p></div><span class="pill ${t.priority === 'alta' ? 'red' : t.priority === 'media' ? 'orange' : 'blue'}">${t.priority}</span><button data-action="task-toggle" data-id="${esc(t.id)}" class="btn small ${t.done ? '' : 'green'}">${t.done ? 'Reabrir' : 'Completar'}</button></div>`).join('') || '<div class="empty">Aún no hay tareas.</div>'}</div></div><div><div class="card card-pad"><div class="card-header"><h3>Replanificación automática</h3><span class="pill wine">Por reglas</span></div><div class="steps"><div class="step"><span class="step-no">01</span><div><strong>Identificar pendientes</strong><p class="sub">Detecta encomiendas sin zona e incidencias.</p></div></div><div class="step"><span class="step-no">02</span><div><strong>Ordenar por importancia</strong><p class="sub">Prioriza seguridad, acceso y atención a incidencias.</p></div></div><div class="step"><span class="step-no">03</span><div><strong>Validar y continuar</strong><p class="sub">Permite completar tareas sin asignar horarios.</p></div></div></div><div class="callout blue" style="margin-top:18px">Este módulo ordena tareas mediante reglas. Un CP-SAT para dimensionar personal requiere capacidad operativa validada; no se declara implementado aquí.</div></div><div class="card card-pad" style="margin-top:18px"><h3>Generación asistida</h3><p class="sub">Replanificar mantiene una sola tarea automática por categoría, actualiza su cantidad y cierra tareas obsoletas al resolverse las incidencias.</p>${btn('task-replan', ic('spark') + ' Revisar y generar tareas', 'primary')}</div></div></div>`;
}
function openTask() {
  openModal(
    'Nueva tarea',
    'Registro de actividades operativas sin horarios.',
    `<form id="taskForm"><div class="field"><label>Actividad *</label><input name="title" required maxlength="120" placeholder="Ej. Revisar guías del sector A"></div><div class="form-row"><div class="field"><label>Responsable</label><select name="owner"><option value="">Sin asignar</option>${db.staff
      .filter(x => x.active)
      .map(p => `<option>${esc(p.name)}</option>`)
      .join(
        ''
      )}</select></div><div class="field"><label>Prioridad</label><select name="priority"><option value="alta">Alta</option><option value="media" selected>Media</option><option value="baja">Baja</option></select></div></div><div class="modal-actions" style="padding:0"><button type="submit" class="btn primary">${ic('plus')} Crear tarea</button></div></form>`
  );
}
function replanTasks() {
  const specs = [
    {
      key: 'sin-zona',
      count: activeItems().filter(p => p.zone === 'SIN' && !isUnlocated(p)).length,
      title: n => `Asignar ubicación a ${n} encomienda(s) sin zona`,
      priority: 'alta',
      legacy: /^Asignar ubicación a \d+ encomienda\(s\) sin zona$/
    },
    {
      key: 'incidencias',
      count: activeItems().filter(p => p.status === 'incidencia').length,
      title: n => `Revisar ${n} incidencia(s) de encomiendas`,
      priority: 'alta',
      legacy: /^Revisar \d+ incidencia\(s\) de encomiendas$/
    }
  ];
  let changes = 0,
    created = 0,
    closed = 0;
  for (const spec of specs) {
    // Migración de tareas automáticas de versiones anteriores por su patrón de título.
    const previous = db.tasks.filter(
      t => t.autoKey === spec.key || (!t.autoKey && spec.legacy.test(t.title || ''))
    );
    const main = previous.find(t => !t.done) || previous[0];
    if (spec.count > 0) {
      if (main) {
        const title = spec.title(spec.count);
        if (
          main.title !== title ||
          main.done ||
          main.autoKey !== spec.key ||
          main.priority !== spec.priority
        ) {
          main.title = title;
          main.done = false;
          main.autoKey = spec.key;
          main.priority = spec.priority;
          changes++;
        }
      } else {
        db.tasks.unshift({
          id: 'AUTO-' + spec.key,
          title: spec.title(spec.count),
          owner: '',
          priority: spec.priority,
          done: false,
          autoKey: spec.key
        });
        changes++;
        created++;
      }
    } else if (main && !main.done) {
      main.done = true;
      changes++;
      closed++;
    }
    for (const t of previous) {
      if (t !== main && !t.done) {
        t.done = true;
        changes++;
        closed++;
      }
    }
  }
  if (changes) {
    audit(
      'replanificacion',
      `Tareas sincronizadas con el inventario: ${created} creadas, ${closed} cerradas y ${changes - created - closed} actualizadas.`
    );
    render();
    notify('Replanificación actualizada: las tareas automáticas reflejan los pendientes reales.');
  } else {
    render();
    notify('Las tareas automáticas ya están al día; no se han generado duplicados.');
  }
}
