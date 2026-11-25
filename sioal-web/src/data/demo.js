/**
 * Generador de datos de demostración (encomiendas, personal y tareas).
 */
'use strict';

function makeDemo() {
  let names = [
      'María Quispe',
      'Jorge Mamani',
      'Rosa Huamán',
      'Carlos Choque',
      'Elena Condori',
      'Luis Ticona',
      'Andrea Flores',
      'Óscar Pari',
      'Lucía Paredes',
      'Alicia Yana',
      'Javier Apaza',
      'Patricia Nina'
    ],
    types = ['Caja', 'Fardo', 'Saco', 'Documento', 'Paquete'];
  let ps = [];
  for (let i = 0; i < 30; i++) {
    let st = i % 9 === 0 ? 'entregado' : i % 13 === 0 ? 'incidencia' : 'almacen';
    let zone = st === 'entregado' ? ['A', 'B', 'C'][i % 3] : i % 7 === 0 ? 'SIN' : ['A', 'B', 'C'][i % 3];
    let t = types[i % 5],
      q = i % 7 === 0 ? 2 : 1,
      kg = round((9 + ((i * 17) % 87)) * q, 1);
    let width = i % 3 === 0 ? 0.6 : 0.4,
      length = i % 4 === 0 ? 0.8 : 0.6;
    ps.push({
      id: 'P-' + (i + 1),
      code: 'ENC-' + String(i + 1).padStart(6, '0'),
      date: shiftDay(-i * 2),
      sender: ['Lima Express', 'Sucursal Puno', 'Cliente particular'][i % 3],
      recipient: names[i % 12],
      dest: ['Juliaca', 'Puno', 'Ilave'][i % 3],
      type: t,
      qty: q,
      kg,
      width,
      length,
      priority: i % 6 === 0 ? 'alta' : i % 5 === 0 ? 'baja' : 'media',
      fragile: i % 11 === 0,
      zone,
      status: st,
      deliveredAt: st === 'entregado' ? shiftDay(-i * 2 + (i === 0 ? 0 : 1)) : '',
      incident: st === 'incidencia' ? 'Embalaje por revisar' : '',
      note: '',
      source: 'demo'
    });
  }
  return {
    version: 1,
    demo: true,
    items: ps,
    staff: starterPeople,
    tasks: [
      {
        id: 'T-01',
        title: 'Verificar mercancías sin zona',
        owner: 'Carlos Mamani',
        priority: 'alta',
        done: false
      },
      {
        id: 'T-02',
        title: 'Revisar encomiendas frágiles',
        owner: 'Rosa Flores',
        priority: 'media',
        done: false
      },
      {
        id: 'T-03',
        title: 'Comprobar accesos y pasillos',
        owner: 'Mario Huanca',
        priority: 'alta',
        done: false
      },
      {
        id: 'T-04',
        title: 'Conciliar entregas registradas',
        owner: 'José Tito',
        priority: 'baja',
        done: true
      }
    ],
    activity: [
      {
        at: new Date().toISOString(),
        type: 'inicio',
        desc: 'Se ha cargado un escenario demostrativo.',
        actor: 'Sistema'
      }
    ],
    config: structuredClone(defaultConfig)
  };
}
