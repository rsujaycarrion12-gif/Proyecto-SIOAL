# modelo/ — Modelos de pronóstico en Python

Réplica independiente de los modelos de la pantalla **Entrenamiento IA** de la app (`../sioal-web`).
Sirve para dos cosas:

1. **Verificar** que la app calcula bien: Python y la app eligen el mismo método y dan el mismo pronóstico.
2. **Evaluar** el error de cada método con los datos reales de TITANICSOFT.

## Instalación

```bash
cd modelo
python -m venv .venv
# Windows: .venv\Scripts\activate   |   Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
```

**Datos.** Los scripts usan los Excel de TITANICSOFT si están en `../Datos/`; si no, usan
`datos_publicos/semanal.csv` y `datos_publicos/diario.csv`: los mismos totales reales, sin conductores,
placas, clientes ni importes. Los resultados son idénticos en ambos casos.

## Scripts

| Script | Qué hace | Salida |
|---|---|---|
| `entrenar_modelo.py` | Hace lo mismo que el botón **Ejecutar entrenamiento** de la app: partición temporal, 6 métodos, elección del mejor y pronóstico de 4 semanas. | `resultados/entrenamiento/` |
| `caso_real_corto.py` | Pronostica cada una de las 15 semanas reales usando solo las anteriores (desde la 5.ª) y mide el WAPE de cada método y de la combinación. | `resultados/caso_real/wape_caso_real.csv` |
| `proyeccion_intrasemana.py` | Corrige el total de la semana con lo ya despachado hasta cada día: `T(d) = A(d) + F·(1 − p(d))`. | `resultados/caso_real/proyeccion_intrasemana.csv` |
| `figuras.py` | Dibuja los 3 gráficos del proyecto. | `resultados/graficos/` |
| `exportar_datos_publicos.py` | *(con los Excel)* Regenera los totales anonimizados. | `datos_publicos/` |
| `preparar_datos_reales.py` | *(con los Excel)* Revisión fila por fila con observaciones de calidad. | `datos/reales/` *(local, no se sube)* |
| `scripts/verificar_con_app.js` | Ejecuta el código real de la app sin navegador (Node + jsdom) con los mismos datos. | `datos/reales/resultado_app.json` |
| `scripts/medir_velocidad_app.js` | Mide cuánto tarda la app en leer los Excel y entrenar. | `resultados/velocidad/velocidad_app.json` |

Orden recomendado:

```bash
python entrenar_modelo.py --hoy 2026-11-25
python caso_real_corto.py
python proyeccion_intrasemana.py
python figuras.py
```

Verificación con la app (opcional, requiere los Excel y Node.js 18+):

```bash
npm install jsdom@24        # la versión 24; las más nuevas no traen ResourceLoader
python preparar_datos_reales.py
node scripts/verificar_con_app.js ../sioal-web datos/reales
python entrenar_modelo.py   # al final debe decir: "La app y Python entrenan exactamente lo mismo."
```

## Código en `src/`

| Archivo | Contenido |
|---|---|
| `datos_reales.py` | Lectura de los Excel, limpieza y banderas de calidad (misma regla que la app: vacíos y > 500 kg/bulto en cuarentena; umbral de 60 000 kg por manifiesto). |
| `modelos.py` | Los 6 métodos de la app: último valor, media móvil (3), media ponderada (0,2/0,3/0,5), suavización exponencial α = 0,35, suavización con α óptimo (0,05–0,95) y tendencia lineal. |
| `evaluacion.py` | Partición temporal (≥ 60 semanas: 26 + 26; 24–59: 8 + 8; < 24: solo validación), selección con tolerancia de 2 % y origen móvil. |
| `metricas.py` | MAE, RMSE, WAPE, MAPE, sesgo, MASE y prueba de Diebold–Mariano. |
| `fuente.py` | Elige la fuente de datos: Excel si existen, si no `datos_publicos/`. |
| `vectorial.py` | Versión vectorizada (NumPy) de los pronósticos a 1 paso, usada por `caso_real_corto.py`. |

## Resultados con los datos reales (15 semanas completas, 3 ago.–15 nov. 2026)

- 221 manifiestos leídos, 218 válidos (1 vacío y 2 pesos atípicos en cuarentena).
- Método elegido por la app para el peso: suavización exponencial con α óptimo; pronóstico de la semana
  siguiente: **304 874 kg** (igual en la app y en Python).
- WAPE del peso semanal (11 pronósticos): **combinación 6,59 %** frente a **último valor 13,98 %**.
- Con la corrección del miércoles el error del total semanal baja a **3,91 %**.

Con menos de 24 semanas la app marca el pronóstico como **preliminar**: los resultados mejoran su respaldo
a medida que se cargan más exportaciones.
