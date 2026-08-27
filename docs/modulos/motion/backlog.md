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

### [P1] Export a After Effects (script .jsx) — tandas 2 y 3
- **Estado:** tanda 1 HECHA (2026-08-27) — `exportar-ae-puro.ts` genera un
  ExtendScript determinista que reconstruye las escenas con objetos NATIVOS
  de AE (comp por escena + master, texto real con fuente/leading/tracking,
  shapes, trim paths, keyframes con temporal ease desde nuestros beziers,
  cámara como precomp, temblor como expresión); botón en el panel de export.
- **Assets (2026-08-27):** HECHO — el export baja un ZIP con el .jsx +
  assets/ y el script los importa solo (fallback a placeholder avisado).
- **Horneado (2026-08-27):** HECHO — los presets viajan como keyframes
  densos (estadoEn por frame); familia CSS limpia; tracking entero; eases
  con BEZIER explícito y alert de avisos técnicos.
- **Ronda 3 del AE real (2026-08-27):** HECHA — (1) el abort de la línea 54
  era el catch concatenando el Error nativo con «+» (ExtendScript lo
  rechaza): ahora `__avisar(texto, e)` lee `.message` vía `__detalle`;
  (2) fuentes con ESCALERA DE PESOS en orden CSS + aceptación de familia
  aproximada («tipografia aproximada: pedida …, AE puso …») — el peso 400
  de una familia sin Regular ya no cae a Thin; (3) keyframes RALOS: los
  presets simples van con un in y un out por segmento y el easing como
  temporal ease (editables); densos solo pop/rebotar/resortes o pistas
  crudas sumadas al preset.
- **Ronda 4 del AE real (2026-08-27):** HECHA — (1) media con ENCAJE FIEL:
  escala uniforme + máscara centrada para «cubrir» (antes estiraba por eje
  sin recorte: los vectores de Figma se desarmaban en AE) y la escala
  animada se compone sobre el encaje (`__reescalar`, chau aviso «no se
  horneo»); (2) TRAMOS de rich text por characterRange (AE 24.3+): fuente/
  tamaño/color por rango con candidatos propios, degradado avisado en AE
  viejo; (3) avisos deduplicados + diagnóstico de fuentes (qué resolvió AE
  cuando nada pega); (4) regla DURA de cámara en el prompt del agente
  (descubrir la escena = bajar zoom de la cámara, nunca animar capas).
- **Tanda 2 (reducida, falta):** división letra por letra → text animators con range
  selector + offset (división por caracteres/palabras/líneas y escalonado),
  máscaras de revelado por línea, path SVG real del trazo. Hoy eso queda
  ANOTADO en el comentario de capa.
- **Tanda 3 (falta):** lo que muestre degradado la prueba en AE real de
  Gabriel (paso suyo: correr el .jsx, chequear editabilidad, renderizar y
  comparar frames contra nuestro MP4); resortes horneados por frame si la
  aproximación bezier no alcanza; zoom log con keyframe intermedio.
- **Dónde:** `lib/motion/exportar-ae-puro.ts`, `ExportarVideo.tsx`

### [P2] Subgrupos: segundo nivel en el panel de Capas
- **Estado:** HECHO (2026-08-27) — cabecera plegable con chevron y contador
  dentro de su pantalla; click selecciona el grupo entero. Pendiente menor:
  arrastrar la cabecera para reordenar el subgrupo en bloque.

### [P3] Export Lottie (formato, no runtime)
- **Estado:** abierto — ya NO es el camino a AE (eso es el .jsx de arriba):
  queda para interchange hacia runtime web/apps.
- **Qué:** serializar composiciones a Lottie JSON (el easing de Lottie es
  cubic-bezier: match directo).
- **Dónde:** `lib/motion/exportar-lottie.ts` (nuevo)

### [P1] Audio de proyecto — tandas 2 y 3
- **Estado:** tanda 1 HECHA (2026-08-27) — audio ÚNICO por proyecto (voz en
  off / música), IndexedDB, franja de forma de onda arriba del timeline con
  cortes de escena arrastrables sobre el eje global, click-para-saltar entre
  escenas, `<audio>` esclavo del reloj del preview (tramo de la escena
  activa), registro de escenas con duración.
- **Tanda 2:** HECHA (2026-08-27) — el MP4 lleva la pista (AAC, fallback
  Opus, mudo si no hay AudioEncoder); de paso: secuencia PNG con alfa en
  ZIP propio, y subir/reemplazar imágenes con ajuste real.
- **Tanda 3:** HECHA (2026-08-27) — Whisper LOCAL (transformers.js,
  whisper-base cacheado por el browser): «Transcribir» en la franja deja
  las oraciones con timestamps pintadas sobre la onda y guardadas con el
  audio; mic en el chat de diosa (hablar el pedido → texto al input).
  Falta: sugerir cortes de escena en las pausas de la locución, y linkear
  oración ↔ capa animada (auto-timing).
- **Video de referencia (nuevo, decidido):** los videos que entren al
  lienzo son SOLO referencia de fondo — no salen en el export (que va por
  PNG alfa o por el .jsx de AE); implementar capa video con flag
  `referencia` excluida del render final.
- **Dónde:** `audio-puro.ts`, `audio-guardado.ts`, `AudioDeProyecto.tsx`,
  `exportar.ts`

### [P2] Capas de textura y cámara 2.5D del blueprint
- **Estado:** parcial (2026-08-27) — nuevo: TEMBLOR procedural de cámara
  (handheld/flotar/nervioso, determinista, encima de los keyframes).
- **Estado previo:** parcial (2026-08-26) — la cámara 2D YA es el corazón del
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
