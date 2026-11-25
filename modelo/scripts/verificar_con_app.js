// Pasa los manifiestos reales por el motor de entrenamiento de la app SIOAL (versión mejorada)
// sin abrir el navegador, para comparar sus resultados con los de Python.
//
// Uso:   npm i jsdom
//        node scripts/verificar_con_app.js ../sioal-web datos/reales
// Lee:   datos/reales/manifiestos_limpios.csv   (generado por preparar_datos_reales.py)
// Crea:  datos/reales/resultado_app.json
//
// Se usan los mismos nombres de columna que exporta TITANICSOFT (NÚMERO, T. BULTOS, "… KG")
// y la configuración por defecto de la app: no hace falta renombrar ni cambiar umbrales.

const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs');
const path = require('path');

const appDir = path.resolve(process.argv[2] || '../sioal-web');
const datosDir = path.resolve(process.argv[3] || 'datos/reales');

class Loader extends ResourceLoader {
  fetch(url) {
    return Promise.resolve(fs.readFileSync(path.join(appDir, decodeURIComponent(new URL(url).pathname))));
  }
}

const csv = fs.readFileSync(path.join(datosDir, 'manifiestos_limpios.csv'), 'utf8').trim().split(/\r?\n/);
const head = csv[0].split(',');
const idx = k => head.indexOf(k);
const filas = [['FECHA', 'NÚMERO', 'T. PESO', 'T. BULTOS']];
for (const line of csv.slice(1)) {
  const c = line.split(',');
  const [y, m, d] = c[idx('fecha')].slice(0, 10).split('-');
  filas.push([`${d}/${m}/${y}`, c[idx('numero')], `${Number(c[idx('kg')])} KG`, String(Number(c[idx('bultos')]))]);
}

const vc = new VirtualConsole();
const dom = new JSDOM(fs.readFileSync(path.join(appDir, 'index.html'), 'utf8'), {
  url: 'http://localhost/index.html',
  runScripts: 'dangerously',
  resources: new Loader(),
  virtualConsole: vc,
  beforeParse(w) {
    w.structuredClone = structuredClone;
    w.TextEncoder = TextEncoder;
  }
});

dom.window.addEventListener('load', () => {
  const w = dom.window;
  w.__filas = filas;
  const out = w.eval(`(() => {
    try {
      const d = trainingRowsToDataset(__filas, 'TITANICSOFT');
      training = d;
      trainingRun();
      const t = training.trained;
      const { weeks, trained, extremeSamples, ...meta } = d;
      return JSON.stringify({
        version: 'v2', meta, tipo: t.kind, particion: t.split, semanasCompletas: t.completeWeeks,
        resultados: Object.fromEntries(Object.entries(t.results).map(([k, v]) => [k, {
          elegido: v.choice,
          prueba: v.holdout,
          ranking: v.ranked.map(x => ({ modelo: x.id, folds: x.folds, mae: x.mae, rmse: x.rmse, wape: x.wape,
            historial_mae: x.history.mae, historial_wape: x.history.wape })),
          pronostico: v.forecast, intervalos: v.intervals, inicioPronostico: v.nextWeek
        }]))
      });
    } catch (e) { return JSON.stringify({ version: 'v2', error: e.message }); }
  })()`);
  w.close();
  const r = JSON.parse(out);
  fs.writeFileSync(path.join(datosDir, 'resultado_app.json'), JSON.stringify(r, null, 1));
  if (r.error) return console.log('ERROR:', r.error);
  console.log(`válidos ${r.meta.valid}/${r.meta.records} (${r.meta.recordUnit}, umbral ${r.meta.reviewThresholdKg} kg), ` +
    `partición ${r.particion.kind} ${r.particion.validationStart}/${r.particion.validationWeeks}/${r.particion.testWeeks}`);
  for (const [k, v] of Object.entries(r.resultados))
    console.log(`  ${k}: elige ${v.elegido}, WAPE prueba ${v.prueba.wape?.toFixed(2)} %, próxima semana ${v.pronostico[0]}`);
});
