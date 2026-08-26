# Backlog — módulo motion

### [P1] Inspector de propiedades y edición de keyframes en la UI
- **Estado:** abierto
- **Qué:** panel derecho para editar la capa seleccionada (posición, escala,
  presets, easing, escalonado) y arrastrar keyframes/spans en la línea de
  tiempo, con checkpoint de undo por gesto.
- **Por qué:** el motor ya soporta todas las ops (`herramientas-puro`); sin
  UI, editar es tocar JSON.
- **Dónde:** `components/motion/Inspector.tsx`, `LineaDeTiempo.tsx`

### [P1] Render a video (WebCodecs + mp4-muxer) al catálogo de media
- **Estado:** abierto — decidir con el equipo antes de construir (kit §10.3)
- **Qué:** `OffscreenCanvas` + `VideoEncoder` frame a frame con la misma
  `pintar()`, muxeado con `mp4-muxer` (ya en deps de diosa), subida al
  catálogo y `renderId` en la fila. Supersampling temporal (N sub-frames
  promediados) para motion blur direccional real.
- **Por qué:** es el camino sin infraestructura nueva y frame-exacto
  (MediaRecorder no lo es).
- **Dónde:** `lib/motion/exportar.ts` (nuevo), worker

### [P1] Selección y drag de capas en el lienzo + snapping azul
- **Estado:** abierto
- **Qué:** click/shift-click/marquee, drag con umbral de 4px y checkpoint de
  undo al cruzarlo, `snapArrastre` con guías a 1px constante en pantalla.
- **Por qué:** «el editor se siente como los otros dos lienzos» (kit §10.6).
- **Dónde:** `components/motion/Lienzo.tsx`, `lib/motion/camara-puro.ts`

### [P1] Texto multilínea, métricas reales y carga de fuentes
- **Estado:** abierto
- **Qué:** líneas múltiples con interlineado, división por líneas, y
  `FontFace` + `document.fonts.load` con licencias declaradas.
- **Por qué:** los títulos de case study no son una línea con la fuente del
  sistema.
- **Dónde:** `lib/motion/pintar.ts`, `modelo.ts` (aditivo)

### [P1] Cachear el pintado con blur por capa
- **Estado:** abierto
- **Qué:** pintar la unidad nítida a un canvas intermedio y desenfocar una
  vez por capa (o pre-renderizar niveles de blur), en vez de `ctx.filter`
  por unidad por frame.
- **Por qué:** medido: p95 100 ms en headless sin GPU con blur activo.
- **Dónde:** `lib/motion/pintar.ts`

### [P2] Más presets y capa de énfasis (loops)
- **Estado:** abierto
- **Qué:** portar el set completo del prototipo v0 (`_andamiaje/studio-v0`):
  reveal enmascarado, tracking, flip, pop, pulse/float/shimmer con
  `composite` aditivo.
- **Dónde:** `lib/motion/presets-puro.ts`, `evaluar-puro.ts`

### [P2] Export Lottie (formato, no runtime)
- **Estado:** abierto
- **Qué:** serializar composiciones a Lottie JSON (el easing de Lottie es
  cubic-bezier: match directo) para importar en AE con el plugin de
  LottieFiles.
- **Por qué:** interchange hacia AE gratis de mantener, camino a M7 del
  blueprint.
- **Dónde:** `lib/motion/exportar-lottie.ts` (nuevo)

### [P2] Pista de audio sincronizada
- **Estado:** abierto
- **Qué:** `<audio>` esclavo del reloj en preview, muxeo en el render.
- **Dónde:** `modelo.ts` (aditivo), `Editor.tsx`

### [P2] Capas de textura y cámara 2.5D del blueprint
- **Estado:** abierto
- **Qué:** grain determinista, duotono, y capa cámara con tracks aplicada
  como transform inverso del mundo.
- **Dónde:** `modelo.ts` (aditivo), `evaluar-puro.ts`, `pintar.ts`
