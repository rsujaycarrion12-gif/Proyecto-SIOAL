# Arquitectura

## Visión general

SIOAL es una **SPA (Single Page Application) sin backend**. Todo corre en el navegador:

```
┌──────────────────────────── Navegador ────────────────────────────┐
│  index.html                                                       │
│     │                                                             │
│     ├── core/router.js  ── #hash ──►  layout/shell.js (render)    │
│     │                                       │                     │
│     │                                       ▼                     │
│     │                        modules/<pantalla>/*.view.js         │
│     │                                       │ data-action         │
│     ├── core/acciones.js ◄──────────────────┘ (clics/forms)       │
│     │        │                                                    │
│     │        ▼                                                    │
│     ├── domain/*  (reglas)    services/* (Excel, CSV, JSON)       │
│     │        │                                                    │
│     │        ▼                                                    │
│     └── core/persistencia.js ──►  localStorage                    │
│                                    • SIOAL20_FULL_PROTO_V1        │
│                                    • SIOAL20_TRAINING_V2          │
└───────────────────────────────────────────────────────────────────┘
```

- **Sin servidor, sin API, sin autenticación.** El selector "Administrador / Trabajador" de la cabecera
  solo simula vistas (oculta menús al trabajador).
- **Sin base de datos externa.** La "base de datos" es un objeto JSON (`db`) serializado en `localStorage`.
- **Sin dependencias.** El lector de Excel (ZIP + XML), el generador QR y los modelos de pronóstico están
  programados a mano.

## Capas

| Capa | Carpeta | Responsabilidad |
|------|---------|-----------------|
| Configuración | `src/config` | Claves de almacenamiento, geometría del almacén (15 m de largo, 8 m de entrada, 11 m de operaciones), capacidades por defecto, rutas y menús por rol |
| Compartido | `src/shared` | Utilidades puras (formato, fechas, texto) y componentes de UI (modal, botones, KPI, iconos) |
| Datos | `src/data` | Generador de datos demo y datos semilla agregados para el entrenamiento |
| Núcleo | `src/core` | Persistencia con control de concurrencia, router por hash, bitácora, estado global y controlador central de acciones |
| Dominio | `src/domain` | Reglas de negocio: ocupación por zona, alertas, validación de capacidad, ciclo de vida de la encomienda |
| Servicios | `src/services` | Lectura de XLSX/CSV, exportación CSV segura y respaldos JSON |
| Presentación | `src/layout`, `src/modules` | Shell de la app y una carpeta por pantalla |

## Patrón de interacción

1. Cada pantalla devuelve HTML como texto (`renderX()`).
2. Los botones llevan `data-action="..."` y `data-id="..."`.
3. `core/acciones.js` (`actionHandler`) recibe **todos** los clics y despacha a la función correspondiente.
4. Tras modificar `db`, se llama a `save()` y `render()`.

## Persistencia y concurrencia

`save()` compara lo que hay en `localStorage` con la última versión leída (bloqueo optimista). Si otra
pestaña modificó los datos, se bloquea el guardado y se muestra un aviso para recargar. El módulo de
entrenamiento usa su propia clave y el mismo mecanismo.

## Orden de carga de scripts

Los scripts son clásicos y comparten el ámbito global, por lo que el orden en `index.html` importa:

1. `config` y `shared` (constantes y utilidades sin dependencias)
2. `data`, `core/persistencia`, `core/router`, `domain`, `services`, `layout`, `modules` → **solo declaran funciones**
3. `core/acciones.js` → controlador
4. `core/estado.js` y `core/estado-entrenamiento.js` → **ejecutan** la carga desde `localStorage` y migraciones
   (necesitan que todas las funciones ya existan)
5. `main.js` → registra eventos y hace el primer `render()`

## Ruta de evolución sugerida (si se quisiera un sistema real)

- Backend (Node/Express, Laravel o similar) con API REST y base de datos (PostgreSQL/MySQL) para reemplazar
  `core/persistencia.js`.
- Autenticación real por roles.
- Migrar a ES Modules con un empaquetador (Vite) cuando ya no se requiera abrir por `file://`.
