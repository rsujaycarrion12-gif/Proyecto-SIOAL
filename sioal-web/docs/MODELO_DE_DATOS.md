# Modelo de datos

No hay base de datos en servidor. Se usan dos claves de `localStorage` (navegador):

| Clave | Contenido |
|-------|-----------|
| `SIOAL20_FULL_PROTO_V1` | Inventario operativo (`db`) |
| `SIOAL20_TRAINING_V2` | Histórico semanal agregado y resultados de entrenamiento (`training`) |

Si la clave no existe, se generan **datos demo** (`src/data/demo.js`): 30 encomiendas, personal y tareas.

## `db` (inventario)

```js
{
  version, demo,
  items:    [Encomienda],
  staff:    [{ name, area, active, ... }],
  tasks:    [{ id, title, owner, priority: 'alta'|'media'|'baja', done }],
  activity: [{ at, type, desc, actor }],          // bitácora de auditoría
  config: {
    capacity: { A, B, C },     // m² útiles por zona (por defecto 18 c/u)
    maxKg:    { A, B, C },     // límite de peso por zona (0 = sin límite)
    staffCount, staffCapacity, alertDays, alertPercent,
    abc: { pctA, pctB, maxKgCheck, priorityTie },
    geometryVersion, capacityUnverified
  }
}
```

### Encomienda

| Campo | Descripción |
|-------|-------------|
| `id`, `code` | Identificador interno y código/guía (ej. `ENC-000001`) |
| `date` | Fecha de registro |
| `sender`, `recipient`, `dest` | Remitente, destinatario y destino |
| `type`, `qty`, `kg` | Tipo (Caja, Fardo, Saco, Documento, Paquete), cantidad de bultos y peso |
| `width`, `length` | Medidas en metros → huella = ancho × largo × cantidad (m²) |
| `priority`, `fragile` | Prioridad (alta/media/baja) y fragilidad |
| `zone` | `A`, `B`, `C` o `SIN` (sin asignar) |
| `status` | Ver estados |
| `receivedAt`, `deliveredAt` | Fechas de recepción física y entrega |
| `incident`, `note`, `source` | Incidencia, notas, origen (`demo`, `manual`, `importado`) |

### Estados

```
transito / pendiente_recepcion ──recibir──► almacen ──entregar──► entregado
                                              │  ▲
                                   incidencia ▼  │ resolver
                                           incidencia
```

Las encomiendas importadas de Excel **no cuentan como inventario físico** hasta confirmar su recepción.

## `training` (entrenamiento)

Resumen semanal sin datos personales: `weeks: [{ week, orders, qty, kg, ... }]`, contadores de registros
válidos/rechazados/duplicados y `trained.results` con el mejor modelo y su error (WAPE) para `kg` y `qty`.
Incluye por defecto una simulación de 120 000 órdenes **sintéticas** marcadas como demostración.
