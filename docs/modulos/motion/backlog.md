# Backlog — módulo motion

### [P1] Render en worker + subida al catálogo de media
- **Estado:** abierto
- **Qué:** lo que falta encima del export ya hecho: mover el loop de render
  a un Web Worker (hoy corre en el main thread con yield por frame), y en
  diosa subir el resultado al catálogo con `renderId` en la fila en vez de
  descargar.
- **Por qué:** un export largo no debería congelar la pestaña; el catálogo
  es el destino real (§10.2).
- **Dónde:** `lib/motion/exportar.ts`, worker nuevo, `consultas.ts`

### [P1] Selección múltiple en el lienzo: shift-click, marquee, Alt-duplica
- **Estado:** abierto
- **Qué:** lo que falta encima de la selección simple ya hecha: shift-click
  acumula, marquee desde el fondo, Alt = duplicar y arrastrar la copia,
  mover la selección múltiple por delta con orígenes guardados.
- **Por qué:** «el editor se siente como los otros dos lienzos» (kit §10.6).
- **Dónde:** `components/motion/Lienzo.tsx`

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

### [P1] Probar el plugin de Figma en Figma real y ajustar
- **Estado:** abierto
- **Qué:** correr `figma-plugin/` sobre pantallas reales de adiós adiós,
  ajustar los casos que degraden mal (auto-layout raro, estilos de texto
  mixtos frecuentes) y decidir qué más merece fidelidad nativa.
- **Dónde:** `figma-plugin/code.js`, `lib/motion/figma-puro.ts`

### [P2] Referencias visuales para el agente
- **Estado:** abierto
- **Qué:** adjuntar al chat un video/frames de referencia; el agente los ve
  (visión) y los traduce a coreografía — primer paso del módulo M8 del
  blueprint (la medición CV viene después).
- **Dónde:** `lib/motion/agente.ts`, `PanelAgente.tsx`

### [P2] Migrar el agente al asistente real (Diosa)
- **Estado:** abierto
- **Qué:** registrar las 11 herramientas + system prompt como tools del
  área motion de Diosa y decidir el destino del panel local.
- **Dónde:** de nuestro lado, con el catálogo tipado de diosa
