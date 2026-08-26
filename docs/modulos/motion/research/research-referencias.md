# Research — Extracción de motion desde video de referencia

Síntesis del research (agente Sonnet, ago 2026).

## El panorama: dos niveles, nadie combina ambos

- **Productos comerciales (VLM-only)**: AnimSpec es el más completo — video →
  specs para 16 formatos (CSS/GSAP/Framer Motion/Lottie…). Pipeline: ffmpeg.wasm
  → grilla de ~24 frames → Gemini 3 estima timing/easing **a ojo**. Sin
  tracking, sin medición de píxeles: los números son estimación visual del
  modelo, y su propia FAQ admite que clips largos degradan la calidad.
  Otros (screenshot-to-code, OpenMotion, Keyframer de Apple) son variantes
  del mismo patrón "el LLM propone".
- **Técnicas CV (medición real)**: maduras pero **no empaquetadas para este
  uso** — nadie las combina con la capa semántica.

**Conclusión: nuestro diseño de dos etapas (medir + interpretar) no existe
como producto. Construirlo nos da mejor fidelidad que cualquier
herramienta disponible.**

## Stack concreto para la etapa mecánica (medición, sin LLM)

1. `ffmpeg` → dump denso de frames (esta etapa necesita densidad; la VLM no).
2. **SAM2** (modo video) → segmentar y propagar máscaras por capa (seed por
   click del usuario o diff automático del primer frame). Nota: UI/motion
   graphics con bordes duros y colores planos es el caso *fácil* de SAM2.
3. **CoTracker3** (Meta, 2025) → trackear puntos por capa (esquinas +
   centroide) → trayectorias (x, y, escala vía spread de esquinas, rotación),
   más muestreo de alpha/color para curva de opacidad.
4. **Fit de easing** — el gap de ingeniería más grande del espacio, nadie lo
   publicó como herramienta: nonlinear least squares (scipy `curve_fit`)
   ajustando en paralelo cubic-bezier (4 params) y resorte amortiguado (ODE);
   gana el de menor residuo; **snap al token con nombre** si el residuo baja
   de un umbral, si no, emitir la curva custom.
5. **Staggers medidos**: clustering de tiempos de inicio por capa → Δt entre
   onsets (número real, no "parece escalonado").

## Reglas para la etapa semántica (VLM)

Límites documentados de los VLM: tratan frames como snapshots discretos
(justo donde vive el easing), pierden identidad de objetos entre frames, y
la localización temporal se degrada con clips densos. Por lo tanto:

- La VLM **nunca extrae números** — recibe las curvas medidas como contexto
  JSON y solo hace trabajo cualitativo: nombrar capas, clasificar cada
  movimiento contra nuestro vocabulario de presets, detectar mis-tracks
  (oclusión, merges) para revisión humana, y describir la intención
  compositiva ("cascada de lista", "jerarquía título→soporte").
- Técnicas útiles: grillas de frames etiquetadas (IG-VLM), onion-skin/diff
  entre frames para que "vea" qué se movió.

## Verificación: MoVer

**MoVer** (SIGGRAPH 2025, open source): DSL de predicados espacio-temporales
para verificar animaciones de motion graphics ("B empieza después de A por
Δt", "X se mueve hacia la derecha"). Encaja como capa de auto-verificación
del pipeline: la extracción emite predicados MoVer y el render replicado se
chequea contra ellos antes de mostrar el resultado.

## Qué es realista hoy vs qué no

| Realista ya | Frágil / research-grade |
|---|---|
| Trayectorias de elementos con bordes duros (cards, paneles, bloques de texto) vía CoTracker3 + fit | Extracción numérica VLM-only (lo que hace todo el mercado) |
| Clasificación semántica y ORDEN de staggers vía VLM | Segmentación 100% automática en composiciones con movimientos superpuestos (se resuelve con seed de un click) |
| Easings medidos y snapeados a tokens | Motion 3D/perspectiva real, partículas, fluidos (el fit paramétrico no aplica) |
| Staggers con Δt medido | Timing per-carácter de kinetic typography (gap total del campo; requeriría tracking de regiones de texto propio) |

Implicación para M8: la referencia de kinetic typography fina se resuelve
híbrido — timing global medido + clasificación del preset de entrada por VLM
+ nuestros staggers paramétricos (el usuario ajusta el Δt medido a nivel
palabra/carácter con los controles manuales).
