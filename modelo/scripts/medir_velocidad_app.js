// Mide la alimentación de datos y la velocidad del motor de SIOAL (sin navegador, con jsdom).
// Uso:  npm i jsdom@24
//       node scripts/medir_velocidad_app.js ../sioal-web '{"real_4":["../Datos/TITANICSOFT(12).xlsx", ...]}'
// Ejecuta exactamente las funciones de la app: trainingImportFile (lectura + limpieza + agregación)
// y trainingRun (evaluación de modelos + pronóstico). Imprime tiempos y resultados en JSON.
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');
const fs = require('fs'), path = require('path');
const { Blob, File } = require('node:buffer');
const appDir = path.resolve(process.argv[2]);
const grupos = JSON.parse(process.argv[3]);   // {"nombre":[rutas...]}
class Loader extends ResourceLoader {
  fetch(url) { return Promise.resolve(fs.readFileSync(path.join(appDir, decodeURIComponent(new URL(url).pathname)))); }
}
(async () => {
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/scrollTo|Not implemented/.test(e.message)) console.error('jsdom', e.message); });
  const t0 = Date.now();
  const dom = new JSDOM(fs.readFileSync(path.join(appDir, 'index.html'), 'utf8'), {
    url: 'http://localhost/index.html', runScripts: 'dangerously', resources: new Loader(), virtualConsole: vc, pretendToBeVisual: true,
    beforeParse(w) { w.TextDecoder = TextDecoder; w.structuredClone = structuredClone; w.TextEncoder = TextEncoder; w.DecompressionStream = DecompressionStream; w.Blob = Blob; w.scrollTo = () => {}; w.performance = performance; }
  });
  await new Promise(r => dom.window.addEventListener('load', r));
  const w = dom.window;
  const tCarga = Date.now() - t0;
  const out = { carga_app_ms: tCarga, grupos: [] };
  for (const [nombre, rutas] of Object.entries(grupos)) {
    const files = rutas.map(p => new File([fs.readFileSync(p)], path.basename(p)));
    const bytes = files.reduce((s, f) => s + f.size, 0);
    let a = performance.now();
    await w.eval('trainingImportFile')(files.length > 1 ? files : files[0]);
    const tImp = performance.now() - a;
    const tr = w.eval('training');
    a = performance.now();
    w.eval('trainingRun()');
    const tRun = performance.now() - a;
    const t2 = w.eval('training');
    const res = t2.trained?.results || {};
    const resumen = {};
    for (const [k, v] of Object.entries(res)) resumen[k] = JSON.parse(JSON.stringify(v, (kk, vv) => (Array.isArray(vv) && vv.length > 8 ? `[${vv.length} elementos]` : vv)));
    out.grupos.push({ nombre, archivos: files.length, bytes, filas: tr.records, validas: tr.valid, repetidas: tr.duplicates, rechazadas: tr.rejected,
      cuarentena: tr.extremeWeight, unidad: tr.recordUnit, semanas: tr.weeks.length, desde: tr.from, hasta: tr.to,
      importar_ms: Math.round(tImp), entrenar_ms: Math.round(tRun), total_ms: Math.round(tImp + tRun), resultados: resumen, split: t2.trained?.split, quality: t2.trained?.quality, warning: t2.trained?.warning });
  }
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
