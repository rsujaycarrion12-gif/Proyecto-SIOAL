# Pantallas del sistema

El menú cambia según el rol simulado en la cabecera.

| Grupo | Pantalla | Admin | Trabajador | Archivo principal |
|-------|----------|:-----:|:----------:|-------------------|
| General | Panel de control | ✔ | ✔ | `modules/panel/panel.view.js` |
| General | Encomiendas | ✔ | ✔ | `modules/encomiendas/encomiendas.view.js` |
| General | Mapa digital | ✔ | ✔ | `modules/mapa/mapa.view.js` |
| Inteligencia | Clasificación ABC por peso | ✔ | ✔ | `modules/abc/` |
| Inteligencia | Entrenamiento IA | ✔ | — | `modules/entrenamiento/` |
| Inteligencia | Optimización MILP | ✔ | — | `modules/optimizacion/optimizacion-milp.js` |
| Inteligencia | Buscador inteligente | ✔ | ✔ | `modules/buscador/buscador.js` |
| Inteligencia | Códigos QR | ✔ | ✔ | `modules/qr/` |
| Inteligencia | Importar Excel | ✔ | — | `modules/importar/` |
| Gestión | Operaciones | ✔ | ✔ | `modules/operaciones/operaciones.view.js` |
| Gestión | Tareas | ✔ | ✔ | `modules/tareas/tareas.js` |
| Gestión | Personal y capacidad | ✔ | — | `modules/personal/personal.js` |
| Gestión | Reportes y pronósticos | ✔ | — | `modules/reportes/reportes.js` |
| Gestión | Alertas | ✔ | ✔ | `modules/alertas/alertas.view.js` |
| Sistema | Configuración | ✔ | — | `modules/configuracion/configuracion.js` |

---

### 1. Panel de control
Resumen del almacén: KPIs (encomiendas en almacén, kg, bultos, sin zona, incidencias), barras de ocupación
por zona A/B/C contra su capacidad, últimas alertas, actividad reciente y el estado del plan ABC automático.
**Sirve para** ver de un vistazo si el almacén está saturado y qué requiere atención.

### 2. Encomiendas
Listado con filtros (en almacén, entregadas, todas) y búsqueda. Permite **registrar/editar** una encomienda
(código, remitente, destinatario, tipo, cantidad, peso, medidas, prioridad, fragilidad, zona), ver su
detalle, **confirmar recepción**, **entregar**, registrar **incidencias** e imprimir su etiqueta QR.
Valida la cronología de fechas y que la zona tenga espacio físico.

### 3. Mapa digital
Plano real del almacén (`assets/img/plano-almacen.webp`) con las zonas A (izquierda), B (centro) y
C (derecha) superpuestas en SVG. Al seleccionar una zona muestra su ocupación y las encomiendas que contiene.

### 4. Clasificación ABC por peso
Ordena las encomiendas por kilogramos: el 20 % más pesado → **A**, el siguiente 30 % → **B**, el resto → **C**
(porcentajes configurables). Detecta pesos sospechosos (atípicos por IQR) y los manda a revisión.
Genera un **plan de traslados** entre zonas que respeta la capacidad final; cada movimiento lo confirma
un humano. Incluye **clasificación masiva** desde CSV (hasta 150 000 filas) y exportación.

### 5. Entrenamiento IA
Carga un histórico (Excel o CSV de hasta 350 000 filas, leído por lotes), limpia duplicados y atípicos y lo
agrega por semana. Acepta tanto **órdenes** (`NÚMERO O.S.`, `T. CANTIDAD`) como **manifiestos de carga de
TITANICSOFT** (`NÚMERO`, `T. BULTOS`): si la mediana por fila supera 3 000 kg, trata el archivo como
manifiestos y usa un umbral de revisión de peso de 60 000 kg en lugar de 10 000 kg.

- **Variables pronosticadas:** kg, bultos y viajes (u órdenes) por semana.
- **6 modelos:** último valor, media móvil (3), media ponderada, suavización exponencial (α = 0,35),
  suavización exponencial con **α óptimo** y tendencia lineal.
- **Partición temporal:** entrenamiento → validación (elige el modelo) → prueba final independiente.
  Con 60 o más semanas: hasta 26 + 26; **entre 24 y 59: 8 + 8**; con menos de 24 solo hay validación.
- **Selección robusta:** menor MAE en validación; si otros modelos están a menos de 2 %, gana el de menor
  error en todo el historial previo a la prueba.
- **Pronóstico de 4 semanas con rangos de 80 % y 95 %**, calculados con los errores reales del modelo.

Pestañas: Datos, Validación, Pronósticos y MILP. La réplica en Python y el informe de evaluación están en
`../modelo/`.

### 6. Optimización MILP
Propone en qué zona ubicar cada encomienda minimizando *prioridad × distancia* (A = 1, B = 1,5, C = 2)
sin exceder el área (m²) ni el peso máximo de cada zona. Combina varias heurísticas voraces y, en
conjuntos pequeños, búsqueda por ramificación y poda. Se muestra la propuesta y el administrador la aprueba.

### 7. Buscador inteligente
Búsqueda con puntuación por campo (código pesa más que destinatario, remitente, destino, etc.) e
insensible a tildes.

### 8. Códigos QR
Genera etiquetas QR (implementación propia, versión 3-L) descargables en SVG o imprimibles, y permite
escanear con la cámara (API `BarcodeDetector`, disponible en Chrome/Edge).

### 9. Importar Excel
Lee `.xlsx` o `.csv`, reconoce automáticamente columnas (NÚMERO O.S., FECHA, REMITENTE, DESTINATARIO,
T. PESO, ENTREGA, …), muestra vista previa, detecta duplicados y conflictos con registros existentes y
permite descargar una plantilla. Lo importado queda "pendiente de recepción".

### 10. Operaciones
Trazabilidad de movimientos: pendientes de recepción, incidencias abiertas (con opción de resolver) y despachos.

### 11. Tareas
Lista de tareas operativas por prioridad y estado; incluye replanificación automática según el estado del almacén.

### 12. Personal y capacidad
Compara la carga mensual (kg) con la capacidad por trabajador para estimar cuántas personas se necesitan.
Permite registrar trabajadores.

### 13. Reportes y pronósticos
Gráficos por semana (kg, bultos, órdenes, entregas), totales del mes, pronóstico simple y conclusiones
automáticas comparando solo semanas completas. Exporta CSV.

### 14. Alertas
Centro de avisos: encomiendas sin zona, zonas sobre el % de ocupación configurado, mercancía con muchos
días de permanencia, datos incompletos, pesos para revisar, etc.

### 15. Configuración
Capacidades por zona (m² y kg, con tope de 165 m² brutos), parámetros de alertas y personal, y
**respaldos**: exportar/importar JSON (validado) y exportar CSV.
