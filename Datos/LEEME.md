# Datos/

Aquí van las exportaciones en Excel de **TITANICSOFT** (manifiestos de carga), por ejemplo:

```
Datos/
├── TITANICSOFT(12).xlsx   (agosto 2026)
├── TITANICSOFT(13).xlsx   (septiembre 2026)
├── TITANICSOFT(14).xlsx   (octubre 2026)
└── TITANICSOFT(15).xlsx   (noviembre 2026)
```

**No se suben a GitHub** (`.gitignore` los excluye) porque contienen nombres de conductores, placas e
importes. Pídelos a la empresa y cópialos en esta carpeta.

Columnas que usan la app y los scripts: `FECHA`, `NÚMERO`, `TIPO` (propio / tercero), `T. PESO` y `T. BULTOS`.
Los scripts de `modelo/` leen todos los `.xlsx` de esta carpeta (no las subcarpetas).
