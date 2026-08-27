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
- **Estado:** casi hecho (2026-08-26) — marquee en el vacío, shift+click en
  lienzo y panel, drag en bloque con orígenes guardados, Supr borra la
  selección entera. Falta: Alt = duplicar y arrastrar la copia.

### [P1] Texto multilínea, métricas reales y carga de fuentes
- **Estado:** HECHO (2026-08-26) — `\n` real con `interlineado`, división
  por líneas, presets `revelar`/`ocultar` con máscara por renglón. Las
  fuentes ya cargaban; licencias/persistencia siguen en su P2.

### [P1] Cachear el pintado con blur por capa
- **Estado:** abierto
- **Qué:** pintar la unidad nítida a un canvas intermedio y desenfocar una
  vez por capa (o pre-renderizar niveles de blur), en vez de `ctx.filter`
  por unidad por frame.
- **Por qué:** medido: p95 100 ms en headless sin GPU con blur activo.
- **Dónde:** `lib/motion/pintar.ts`

### [P2] Más presets y capa de énfasis (loops)
- **Estado:** parcial (2026-08-26) — el catálogo creció a ~37 presets en 8
  categorías (máscaras, texto, desenfoque, rotación, tracking, impacto,
  logos/gráficas, trazos), con dos capacidades de motor nuevas: dRotacion
  por unidad y tracking (dx por índice desde el centro). Falta lo que
  necesita loops compuestos: pulse/float/shimmer (capa de énfasis).
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
- **Estado:** parcial (2026-08-26) — la cámara 2D YA es el corazón del
  paradigma canvas: capa propia con base + pistas x/y/zoom, auto-key,
  drag del encuadre, modo grabación con suavizado, y el render es lo que
  ella ve. Falta: rotación de cámara, parallax 2.5D por capa (factor de
  profundidad), grain determinista y duotono.
- **Dónde:** `modelo.ts` (aditivo), `evaluar-puro.ts`, `pintar.ts`

### [P1] Afinar el lienzo multi-pantalla
- **Estado:** HECHO (2026-08-26) — grupo liviano `CapaBase.grupo` (la placa
  de fondo es la manija): arrastrar la placa mueve la pantalla entera con
  snap, «Borrar la pantalla completa» en el inspector (con lápidas), y
  toggle Mundo/Cámara en el lienzo (la vista Cámara es el preview exacto
  del render, recortado al frame, solo lectura). Pendiente menor: renombrar
  pantallas.

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

### [P2] Persistir fuentes subidas en el catálogo de media
- **Estado:** parcial (2026-08-27) — persistencia LOCAL hecha: lo cargado
  (archivo entero o elección de Google Fonts) queda en IndexedDB y se
  recarga solo al abrir el editor, re-anclando textos; el panel post-import
  prueba las recordadas antes de abrirse. Falta la parte diosa: subir al
  catálogo con licencia declarada para que viaje entre máquinas.
- **Dónde:** `lib/motion/fuentes-guardadas.ts`, `consultas.ts`
