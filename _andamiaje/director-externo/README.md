# Director externo (guion sin modelo)

Dirigir una composición desde afuera del panel: alguien (Fable en el chat de
desarrollo, un humano) escribe el GUION como JSON de pasos con las mismas
herramientas del director, y se aplica sin modelo, con el mismo ejecutor y
las mismas validaciones. Sirve para probar la hipótesis «¿el director ve y no
alcanza, o no ve?»: un guion escrito mirando la pantalla, corrido tal cual.

## Formato del guion

```json
[
  { "herramienta": "definir_entrada", "input": { "capaId": "h1", "preset": "revelar", "en": 200, "duracion": 900, "easing": "salidaQuint", "escalonado": 60 }, "nota": "el título abre la pieza" },
  { "herramienta": "definir_camara", "input": { "base": { "x": 720, "y": 450, "zoom": 1.33 } } }
]
```

Las herramientas y sus inputs son los de `agente-herramientas.ts`
(`DEFINICIONES_HERRAMIENTAS`). Los ids de capa son los del estado.

## Flujo

1. **Snapshot + lectura.** El editor en desarrollo expone `window.__motion`
   (`snapshot()`, `cargar(snapshot)`, `lectura()`): con Playwright se importa
   el JSON del plugin por la UI, se guarda el snapshot y se sacan las
   imágenes de lectura (las mismas que ve el director). Driver de referencia:
   `scratchpad/pw/dirigir.mjs` de la sesión de desarrollo.
2. **Leer el estado**: `node --import tsx _andamiaje/director-externo/aplicar-guion.ts comp.json`
   imprime `describir` (ids, cajas, placas), el estilo y la auditoría.
3. **Escribir el guion** mirando las imágenes y el estado.
4. **Aplicar**: `node --import tsx _andamiaje/director-externo/aplicar-guion.ts comp.json guion.json comp.dirigido.json`
   → informe por paso (✓/✗) + auditoría de dirección.
5. **Ver / exportar**: `window.__motion.cargar(snapshotDirigido)` en el
   editor y exportar MP4 o PNG por pantalla desde el panel (o con el driver).

`_andamiaje/` no viaja a diosa.
