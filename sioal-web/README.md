# SIOAL 2.6 — Sistema Inteligente de Organización de Almacén Logístico

Prototipo web para la gestión del almacén de **Transportes Ochoa** (Juliaca): registro de encomiendas,
ubicación por zonas A/B/C sobre el plano real, clasificación ABC por peso, optimización de ubicaciones,
pronósticos de carga, códigos QR, importación de Excel y reportes.

> **Tipo de sistema:** aplicación *frontend* estática (HTML + CSS + JavaScript puro, sin frameworks).
> **No tiene backend ni base de datos en servidor.** Todos los datos se guardan en el `localStorage` del navegador.

## Cómo ejecutarlo

1. Abrir `index.html` con doble clic en Chrome / Edge, **o**
2. Servirlo localmente (recomendado para usar la cámara QR):
   ```bash
   npx serve .        # o: python -m http.server 8080
   ```

No requiere instalación, compilación ni conexión a internet.

## Estructura del proyecto

```
sioal-web/
├── index.html                  # Punto de entrada: maqueta base + carga ordenada de CSS y JS
├── README.md
├── docs/                       # Documentación técnica
│   ├── ARQUITECTURA.md         #   capas, flujo de datos y orden de carga
│   ├── PANTALLAS.md            #   qué hace cada pantalla y para qué sirve
│   └── MODELO_DE_DATOS.md      #   almacenamiento, entidades y estados
├── assets/
│   ├── img/plano-almacen.webp  # Plano real del almacén (antes estaba incrustado en base64)
│   └── css/
│       ├── base/               # variables de tema y reset
│       ├── layout/             # estructura (sidebar, topbar) y responsive
│       ├── components/         # botones, tarjetas, modales, notificaciones, utilidades
│       └── pages/              # estilos propios de cada pantalla
└── src/
    ├── config/                 # constantes, valores iniciales y rutas/menús por rol
    ├── shared/
    │   ├── utils/              # formato de números/fechas, normalización de texto
    │   └── ui/                 # iconos y componentes reutilizables (modal, KPI, badges)
    ├── data/                   # datos demo y datos semilla de entrenamiento
    ├── core/                   # persistencia, router, auditoría, estado, controlador de acciones
    ├── domain/                 # reglas de negocio: inventario, capacidad, ciclo de la encomienda
    ├── services/               # lectores XLSX/CSV, exportación y respaldos
    ├── layout/                 # shell de la app (sidebar + render de la pantalla activa)
    ├── modules/                # una carpeta por pantalla/funcionalidad
    │   ├── panel/  mapa/  encomiendas/  operaciones/  tareas/
    │   ├── optimizacion/  abc/  entrenamiento/  buscador/  qr/
    │   └── importar/  reportes/  personal/  alertas/  configuracion/
    └── main.js                 # registro de eventos globales y arranque
```

## Convenciones

- `*.view.js` → funciones `render*()` que devuelven el HTML de una pantalla.
- `domain/` → reglas de negocio sin interfaz.
- `services/` → entrada/salida de archivos (Excel, CSV, JSON).
- Se usan **scripts clásicos** (no `type="module"`) para que funcione abriendo el archivo directamente
  (`file://`). El orden de los `<script>` en `index.html` es importante: ver `docs/ARQUITECTURA.md`.

## Versión original

El archivo monolítico original (`SIOAL_2_6_ABC_ubicaciones_validas.html`, ~640 KB en una sola página)
se conserva en `../_original/` como referencia. El código es el mismo: solo se reorganizó en archivos.
Se verificó automáticamente que las 15 pantallas, en los dos roles, generan exactamente el mismo HTML.

## Formato de código

El código está formateado con **Prettier** (configuración en `.prettierrc.json`, 2 espacios, comillas simples).
En VS Code instala la extensión recomendada *Prettier – Code formatter* (`esbenp.prettier-vscode`);
con `.vscode/settings.json` ya queda como formateador por defecto y se aplica al guardar.
Desde terminal: `npx prettier --write "src/**/*.js" "assets/css/**/*.css" index.html`
