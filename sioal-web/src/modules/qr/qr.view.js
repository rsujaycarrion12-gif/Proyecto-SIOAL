/**
 * Pantalla: Códigos QR y escáner por cámara (BarcodeDetector).
 */
'use strict';

function renderQR() {
  return `${head('Identificación por código QR', 'Genera etiquetas por encomienda y consulta códigos escaneados.', btn('qr-scan', ic('scan') + ' Abrir cámara QR', 'primary'))}<div class="grid-2"><div class="card card-pad"><div class="card-header"><h3>Consulta rápida de código</h3><span class="pill blue">Escaneo + entrada manual</span></div><div class="field"><label>Código de encomienda o contenido del QR</label><input id="qrCodeInput" placeholder="Ej. ENC-000006" value="${esc(ui.qrText)}"></div><div class="flex-row" style="margin-top:12px">${btn('qr-find', ic('search') + ' Buscar código', 'primary')}${btn('qr-scan', ic('scan') + ' Escanear con cámara', 'soft')}</div><div class="callout blue" style="margin-top:22px">La cámara funciona cuando el navegador permite acceso y admite detección de QR. Si no está disponible, escribe el código manualmente. El escáner lee el código, no genera datos de una guía.</div><div id="scan-area" style="margin-top:15px"></div></div><div class="card card-pad"><div class="card-header"><h3>Etiquetas recientes</h3></div><p class="sub">Pulsa una encomienda para visualizar o imprimir su etiqueta QR auténtica.</p>${db.items
    .slice(0, 7)
    .map(
      p =>
        `<div class="alert-item"><div class="alert-dot info">${ic('scan', 18)}</div><div style="flex:1"><strong class="mono">${esc(p.code)}</strong><p>${esc(p.recipient)} · ${esc(p.zone)}</p></div>${btn('label', 'Ver QR', 'small', `data-id="${esc(p.id)}"`)}</div>`
    )
    .join('')}</div></div>`;
}
let cameraStream = null,
  cameraTimer = null;
function stopCamera() {
  if (cameraTimer) {
    clearTimeout(cameraTimer);
    cameraTimer = null;
  }
  if (cameraStream) {
    for (const t of cameraStream.getTracks()) t.stop();
    cameraStream = null;
  }
}
async function startScan() {
  let area = document.getElementById('scan-area');
  if (!area) return;
  if (!navigator.mediaDevices?.getUserMedia || typeof BarcodeDetector === 'undefined') {
    area.innerHTML =
      '<div class="callout">Este navegador no admite detección QR con cámara en este contexto. Utiliza la búsqueda manual.</div>';
    return;
  }
  let formats = await BarcodeDetector.getSupportedFormats().catch(() => []);
  if (!formats.includes('qr_code')) {
    area.innerHTML =
      '<div class="callout">No hay compatibilidad con el formato QR. Introduce el código en el campo superior.</div>';
    return;
  }
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    area.innerHTML = `<video id="qr-video" autoplay playsinline style="width:100%;max-height:300px;border-radius:12px;background:#111"></video><div style="margin-top:10px">${btn('qr-stop', 'Detener cámara', 'danger')}</div>`;
    let video = document.getElementById('qr-video');
    video.srcObject = cameraStream;
    await video.play();
    let detector = new BarcodeDetector({ formats: ['qr_code'] });
    async function frame() {
      if (!cameraStream) return;
      try {
        let codes = await detector.detect(video);
        if (codes.length) {
          let code = codes[0].rawValue;
          stopCamera();
          ui.qrText = code;
          render();
          let p = db.items.find(x => norm(x.code) === norm(code));
          if (p) openDetail(p.id);
          else notify(`Se leyó el código ${code}, pero no figura en el registro`, 'error');
          return;
        }
      } catch (e) {}
      cameraTimer = setTimeout(frame, 350);
    }
    frame();
  } catch (e) {
    stopCamera();
    area.innerHTML =
      '<div class="callout">No se pudo acceder a la cámara. Revisa permisos o introduce el código manualmente.</div>';
  }
}
