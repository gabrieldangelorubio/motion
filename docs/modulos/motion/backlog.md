# Backlog — módulo motion

> **Cierre 2026-08-27 (para retomar):** rama `claude/css-motion-graphics-v2x3jq`
> en `388c535`, 199 tests verdes, demo republicada. Las rondas 3 y 4 del AE
> real quedaron HECHAS (abort de línea 54, escalera de pesos, keyframes
> ralos, encaje con máscara, tramos rich text por rango, diagnóstico de
> fuentes, regla dura de cámara del agente). **Lo primero de mañana:** la
> ronda 5 de Gabriel en su AE — esperamos capturas de (a) vectores ya
> recortados, (b) título mixto con sus dos fuentes (necesita AE 24.3+),
> (c) el alert de avisos, que ahora deduplica y trae el diagnóstico de qué
> fuente resolvió AE (con eso se afina la escalera si el Yamantaka sigue
> cayendo mal). Después, por prioridad: tanda 2 del export (text animators
> letra por letra, máscara del revelado por línea, path SVG real del
> trazo) y lo de abajo.

### [HECHO] Costo por dirección a la vista (2026-08-28, tanda 17)
- **Hecho:** cada respuesta del director cierra con su META: «20 pasos ·
  1:26 · 184k tokens · ~$0.031 · gemini-3.6-flash» — tokens acumulados de
  las dos APIs (entrada/salida/cache por separado, que se cobran distinto)
  × la tabla de precios de `costo-agente-puro.ts` (USD por millón, con
  fecha de verificación; un modelo sin precio muestra los tokens y avisa,
  jamás inventa). El log por paso también trae los tokens. Precios
  cargados: opus-5/4-8 (5/25), sonnet-5 (2/10), haiku-4.5 (1/5),
  gemini-3.6-flash (0.75/3.75 INTRO hasta 31/12/2026 — el 1/1/2027 pasa a
  1.50/7.50: actualizar la tabla), gemini-2.5-flash. También quedó el fix
  del 404 de modelo retirado de Gemini (default 3.6-flash + reintento con
  el modelo que sugiere el error).

### [HECHO] Director multi-proveedor: Gemini Flash por costo (2026-08-28, tanda 16)
- **Hecho:** el director habla con CUALQUIER modelo con function calling —
  el «entrenamiento» es el prompt-escuela + las herramientas, y viajan tal
  cual. `agente-gemini.ts` habla la REST de generateContent (sin SDK
  nuevo): mismo loop, mismos eventos de progreso, mismas herramientas
  (convertidas a functionDeclarations, testeado). Selección por modelo:
  `MOTION_AGENTE_MODELO` manda (`claude-*`/`gemini-*`); sin él, tener
  `GEMINI_API_KEY` en .env.local elige `gemini-2.5-flash` solo (el pedido
  de costo). Las keys SIEMPRE en .env.local, jamás al repo.

### [HECHO] Efectos de agencia: contador, swap con estilo, log del director (2026-08-28, tanda 15)
- **Hecho:** (1) CONTADOR de números: pista animable «numero» — en una capa
  de texto, el valor interpolado y redondeado reemplaza la PRIMERA cifra
  del contenido («STOCK:171» con keyframes 171→0 baja en vivo, easing
  incluido). No hay que separar nada en Figma ni duplicar capas. A AE
  exporta como Slider Control + expression en el Source Text (editable
  allá). El director lo sabe usar (regla dura + definir_pista numero con
  guard: solo textos con cifra). (2) SWAP de texto: herramienta
  transformar_texto — clona la capa original con TODO su estilo, texto
  nuevo, salida ocultarSubir + entrada revelar sincronizadas, el clon
  justo encima en el z-order; regla dura: JAMÁS capa nueva para reemplazar
  un texto. (3) el chat del director pasa a STREAM NDJSON: progreso EN
  VIVO (paso N · mm:ss · última op), log con tiempos por paso («paso 3 ·
  modelo 8.1s · ops…») copiable con el botón «copiar log», y console.log
  espejo en la terminal del server. Los errores tempranos siguen JSON.
  (4) plugin v9: rasterizar usa absoluteRenderBounds — una LINE tiene
  boundingBox de alto CERO y la capa salía invisible (las rayitas y el «+»
  del carrito que faltaban); el render bounds además trae sombras/blur
  completos. Verificado: unit (contador motor+AE, transformar_texto,
  guard) + Playwright del stream (verificar43).

### [HECHO] Biblioteca afinada: compacta, división al aplicar y curvas (2026-08-28, tanda 14)
- **Hecho:** (1) tarjetas COMPACTAS (el preview recorta centrado en
  vertical: misma demo, la mitad del alto). (2) en «Textos» un segmentado
  elige la DIVISIÓN al aplicar — letras / palabras / líneas / como está —
  y aplicar el efecto también divide la capa (con su escalonado sano).
  (3) el easing del Inspector dejó de ser una lista de nombres: es un
  SELECTOR DE CURVAS — cada easing dibujado sampleando su función real
  (los overshoots del back/elástico se VEN salir del carril), popover con
  las 35 curvas en grilla, click elige. Verificado (verificar42, 8/8).
- **Anotado (pedido):** editor de curva bezier CUSTOM (arrastrar los
  puntos de control — extiende Segmento.easing a un bezier libre, toca
  motor + export AE); contador de números y swap de texto con estilo
  clonado (propuesta charlada aparte).

### [HECHO] Import fiel: logo espejado, placa negra y rotados (2026-08-28, tanda 13)
- **Hecho (plugin v8):** (1) las piezas de un grupo rotado se exportan VIA
  CLON con la transform ABSOLUTA compuesta (`rasterizarComoSeVe`):
  exportAsync del original solo aplica la transform propia y una pieza que
  el grupo espejaba salía AL REVÉS (el logo «welcado libre»). (2) un grupo
  con un hijo isMask se rasteriza ENTERO: la máscara no se puede abrir por
  piezas — antes salía como capa opaca (la placa negra). (3) los nodos
  ROTADOS (vector/estrella/polígono/rect/elipse) con estilo sólido ya NO
  se rasterizan: llegan como capa vector con `rotacion` (el path viaja sin
  rotar, la capa rota en el centro — el motor y AE ya lo hacían); con FLIP
  siguen al raster (no hay equivalente). Verificado con píxeles por
  geometría (verificar41: bbox cuadrado + esquinas vacías = rombo real) y
  el .jsx con Rotate Z. OJO: re-importar el manifest en Figma (v8).

### [HECHO] Biblioteca por FAMILIAS con pares in/out (2026-08-28, tanda 12)
- **Hecho:** (1) la biblioteca de efectos se reorganiza en PESTAÑAS por
  familia — Textos, Gráficos, Trazos — y cada demo corre sobre la capa que
  le toca (el título dividido, una ESTRELLA vectorial entera, la línea
  zigzag): seleccionar una capa salta solo a su familia, y el tracking ya
  no se ofrece para gráficas (en una capa entera no hace nada — con aviso
  si igual se intenta por el agente). (2) cada tarjeta es un PAR in/out:
  toda entrada declara su `salidaPareja` (test lo exige) y la tarjeta trae
  TRES botones iconográficos — →| entrada · →|→ ambas · |→ salida — que
  aplican al toque (ambas = un solo undo); el preview del par muestra
  entrada, reposo y salida en el mismo bucle. Presets nuevos para
  completar parejas: deslizarFueraDerecha, reducir, remolinoSalida,
  trackingApretar. (3) la MÁSCARA (recorte) ahora funciona en capas NO
  texto: forma/vector/media/trazo recortan al bbox de reposo de la capa
  (con margen por el grosor del borde) — el revelado de una gráfica
  vectorial por fin «entra bien» (era el reclamo: el clip solo existía en
  texto). Verificado píxel a píxel (verificar40, 12/12).

### [HECHO] Feedback de la prueba en vivo (2026-08-28, tanda 11)
- **Hecho:** (1) whisper corre en un WEB WORKER (`stt-worker.ts` +
  `transcribirConWorker`; el worker va PRECOMPILADO en public/stt-worker.js
  — `npm run build:worker`, esbuild devDep — porque `new Worker(new URL())`
  COLGABA el build de Turbopack; un worker vivo entre transcripciones y si
  no arranca degrada al hilo principal):
  se acabó el «Page Unresponsive» durante la transcripción — la UI late a
  60fps mientras el WASM mastica. El segmento viaja COPIADO con slice (un
  subarray clonaba el buffer entero del archivo por canal). (2) el GUTTER
  del timeline pliega los subgrupos IGUAL que las pistas: antes el gutter
  listaba las capas planas y con un grupo plegado («Group 59 · 9») los
  nombres quedaban corridos de sus barras — ahora misma fila plegada
  («▽ nombre · N», click selecciona el grupo) y al desplegar se abren los
  dos lados juntos. (3) el toggle de loop del preview usa un ícono SVG del
  registro (antes un glifo ⟳ chiquito y descentrado).

### [HECHO] VECTORES DE VERDAD: Figma → motor → AE sin rasterizar (2026-08-28, tanda 10)
- **Hecho (recetario AEUX, Apache 2.0, reescrito de cero):** capa nueva
  `vector` (path SVG + relleno + regla even-odd + borde). El plugin (v7) ya
  NO rasteriza VECTOR/STAR/POLYGON con estilo sólido: manda la geometría
  computada (fillGeometry: esquinas redondeadas y booleans resueltas); las
  BOOLEANS con estilo sólido llegan como UN vector nítido y animable (chau
  rasterizado; ⌘⇧G sigue siendo el camino para animar por pieza); los
  rect/elipse con borde o esquinas mixtas también van por vector. El motor
  los pinta con Path2D (fill con regla + stroke). El export AE los arma
  como SHAPE EDITABLE: `ruta-puro.ts` parsea el `d` completo (M/L/H/V/C/S/
  Q/T/Z, relativos, S/T reflejados, cuadráticas ELEVADAS a cúbicas — cosas
  que al parser de AEUX le faltaban) → vértices + tangentes relativas de
  AE, un Shape - Group por subruta, fill rule even-odd (los agujeros),
  borde encima del fill como Figma. Y el TRAZO exporta su PATH REAL con
  Trim Paths (se cumplió el pendiente «acá va un rectángulo»). OJO: re-
  importar figma-plugin/manifest.json en Figma para el v7.
- **Pendiente de la veta AEUX (anotado):** merge paths EDITABLE por pieza
  (boolean como CompoundShape), máscaras de Figma → track matte ALPHA (la
  base del revelado), gradientes lineales/radiales (en AE via preset .ffx),
  grupos rotados por parenting en vez de rasterizar, prefijo `*` =
  rasterizar a propósito, imagen de referencia del frame al 50%.

### [HECHO] Palabras BIEN puestas sobre la onda: bug del alineador (2026-08-28, tanda 9)
- **Hecho:** encontrado y parcheado el bug de FONDO de «transcribe bien
  pero no las coloca bien»: transformers.js 2.17 le pasa al alineador de
  palabras (DTW sobre cross-attentions) `num_frames` en frames del MEL,
  pero la máscara vive en frames del ENCODER (la mitad — whisper oficial
  hace `num_frames // 2` y el port JS lo perdió). Sin el ÷2, en todo audio
  < 30s el alineador ve EL DOBLE del audio (relleno de silencio incluido)
  y las palabras derivan hacia el final. Medido con verdad conocida
  (jfk.wav, 11s): sin parche la última palabra caía en 21980ms ≈ 2× la
  duración (412 de 442 fuera del audio); con parche, 0 fuera. El parche
  envuelve `_extract_token_timestamps` al cargar el motor
  (`framesDeEncoder` puro, testeado + sabotaje). HAY QUE RE-TRANSCRIBIR
  para que los tiempos nuevos apliquen. También: el drag rápido de una
  palabra VOLVIÓ al carril de la franja (con el reorden bueno — cruzarla
  sobre otra ya no la deja inagarrable); el modal «Palabras» queda para
  borrar/renombrar/agregar/undo.

### [HECHO] Modal «Palabras»: corregir la transcripción sin miedo (2026-08-28, tanda 8)
- **Hecho:** la edición de palabras se muda del carril chico a un MODAL
  propio («Palabras» en la franja, estilo recorte): onda del segmento con
  ticks de cada «in», chips grandes en dos filas — arrastrar corrige dónde
  cae (la lista se REORDENA por tiempo: se acabaron las palabras
  inagarrables al cruzarlas), doble click renombra, × o Supr borra, doble
  click en la onda (o «+ Palabra en el cursor») agrega la que whisper se
  olvidó, y Ctrl/Cmd+Z DESHACE todo dentro del modal — nada se pierde para
  siempre ni persiste hasta «Guardar» (que además recalcula las oraciones
  desde las palabras). Teclado con captura: espacio escucha desde el cursor
  sin tocar el editor de atrás. El carril de la franja queda SOLO lectura
  (click = saltar). Helpers puros `moverPalabraLista` / `agregarPalabraLista`
  / `renombrarPalabraLista` con tests + sabotaje (verificar36: 16/16).

### [HECHO] Diagnóstico del import a la vista (2026-08-28, tanda 7)
- **Hecho:** el toast «Importado con N avisos» ahora DESPLIEGA la lista
  completa (qué capa se rasterizó y por qué, con × para cerrar): el
  diagnóstico deja de ser un número mudo. El aviso de una operación
  BOOLEANA es accionable («convertila en GRUPO en Figma (⌘⇧G) y
  re-exportá» — partirla en el plugin cambiaría el render: el estilo vive
  en la boolean, no en sus hijos). Sello del plugin → v5.
- **Caso Group 11 (las 3 estrellas), RESUELTO (v6):** el toast desplegado
  lo nombró — «grupo rotado: se rasterizó entero». Doble fix: (1) el
  umbral de rotación sube de 0.01° a 0.5° (las micro-rotaciones
  accidentales de edición, invisibles, mandaban grupos y textos enteros
  al rasterizado); (2) un grupo rotado DE VERDAD ya no es un solo bitmap:
  cada pieza se rasteriza POR SEPARADO en su lugar (fiel al render,
  animable por partes, subgrupo marcado). Sello → v6.

### [HECHO] Sello de versión del plugin (2026-08-28, tanda 6)
- **Hecho:** el JSON del plugin lleva `plugin: 4` y el import AVISA con
  instrucciones cuando el JSON salió de un code.js viejo (la causa clásica
  de «el fix del plugin no anda» — las estrellas seguían llegando
  aplanadas). Un test ata `VERSION_PLUGIN` del code.js con
  `PLUGIN_ESPERADO` del import: no pueden divergir en silencio.

### [HECHO] El director VE la locución (pedido 2026-08-28, tanda 5)
- **Hecho:** el chat del agente manda `contextoAudio` («palabra @ ms» en
  tiempo local de la escena activa) junto al snapshot, y el prompt tiene
  la regla de sincronizar: el «en» del segmento = el ms de la palabra.
  Antes el director coreografiaba a ciegas respecto de la voz. Verificado
  interceptando el POST (verificar35). También: el plugin anota el aviso
  «los efectos del grupo no viajan» al abrir un grupo con efectos.

### [HECHO] Whisper que no se traba (pedido 2026-08-28, tanda 4)
- **Hecho:** (1) los LOOPS de decodificación (la misma palabra mil veces)
  se podan en post-proceso puro (`limpiarPalabras`, testeada). (2) el
  modelo default sube a whisper-SMALL (mucho mejor con voz sobre música,
  ~250MB la primera vez) con cascada de respaldo small→base. Re-transcribir
  para aprovecharlo.

### [HECHO] UX del preview y del carril (pedidos 2026-08-28, tanda 3)
- **Hecho:** (1) el preview PARA al final por defecto (play desde el final
  rebobina); toggle ⟳ de loop en el transport, y al loopear el audio se
  resincroniza y REANUDA (antes la vuelta quedaba muda). (2) las palabras
  del carril son HITOS de entrada (tick del «in», sin caja de duración) y
  se BORRAN con la × del hover (whisper inventa palabras); todo persiste.

### [HECHO] UX del timeline y del recorte (pedidos 2026-08-28, tanda 2)
- **Hecho:** (1) el modal de recorte tiene TECLADO propio con captura —
  espacio ya no le da play al timeline de atrás: reproduce SIEMPRE desde
  el in; I/O fijan in/out en el cursor; Escape sale. (2) SHIFT en el
  scrub imanta el playhead a los keyframes (capas + poses de cámara).
  (3) ALT/OPTION arrastrando un keyframe o pose de cámara lo DUPLICA.
  (4) el panel de Efectos es un tab plegable persistente (como «Cámara»).
  (5) las PALABRAS de la transcripción se corrigen a mano (drag en el
  carril, persiste) y el carril quedó alineado 1:1 con la onda (bug de
  ancho). (6) plugin de Figma: un grupo CON EFECTOS ya no se rasteriza
  entero — se abre en sus hijos (tres estrellas = tres capas animables,
  subgrupo marcado) con el aviso de que el efecto del grupo no viaja;
  solo la rotación sigue rasterizando entero. OJO: re-copiar code.js en
  el plugin de Figma para que aplique.

### [HECHO] Rediseño de la franja de audio + transcripción por PALABRA (2026-08-28)
- **Hecho:** dos carriles (onda con progreso en acento + carril de
  transcripción separado abajo con cada palabra en su tiempo, clickeable y
  resaltada al sonar); Whisper AUTODETECTA idioma (adiós al "spanish"
  hardcodeado que rompía el inglés) y pide timestamps POR PALABRA
  (revision output_attentions, degrada a oraciones si no está); los
  inicios de palabra son IMANES del drag de spans/keyframes en el timeline
  (marquitas en la regla). «Re-transcribir» rehace transcripciones viejas.
- **Pendiente menor:** stagger-ease de GSAP (distribuir los inicios del
  escalonado con una curva) y snap de palabra también en el scrub.

### [ANTES] El pedido original (2026-08-28)
- **Qué:** la franja del waveform está fuera de la estética del resto y se
  lee poco (captura de Gabriel: onda gris chata, transcripción encimada en
  la misma franja). Rediseñarla con el lenguaje visual de la casa y con la
  TRANSCRIPCIÓN bien separada abajo, en su propio carril.
- **Timestamps por PALABRA (superimportante):** hoy la transcripción son
  oraciones con rangos; la gente necesita ver DÓNDE CAE CADA PALABRA sobre
  el waveform para ubicar keyframes ahí. Viable: el pipeline ASR de
  transformers.js acepta `return_timestamps: "word"` — pedir granularidad
  palabra, guardarla en la transcripción persistida y pintarla en el
  carril (palabra clickeable → saltar/snap del playhead; los keyframes y
  los «en» de segmentos deberían poder SNAPEAR a esos tiempos).
- **BUG idioma:** `stt.ts` fuerza `language: "spanish"` HARDCODEADO — la
  voz en off casi siempre va a estar en INGLÉS y whisper la está
  transcribiendo mal por eso. Fix: autodetección (no pasar language) o
  selector es/en al transcribir.
- **Dónde:** `AudioDeProyecto.tsx` (rediseño), `stt.ts` (idioma +
  word timestamps), `stt-puro.ts` (palabras), `audio-guardado.ts`
  (persistir palabras), timeline (snap a palabra).

### [P2] Animaciones con toggle, guardadas como tab tipo «Cámara» (pedido 2026-08-28)
- **Qué (refinar con Gabriel):** poder PRENDER/APAGAR las animaciones
  aplicadas (toggle por capa o global, sin perderlas — como el ojo de una
  capa pero para su animación) y que queden agrupadas/guardadas en un tab
  propio del panel izquierdo, al estilo del tab «Cámara» (captura: la fila
  Cámara arriba del panel de Efectos). Preguntas abiertas: ¿toggle por
  capa, por escena o global? ¿el tab lista todas las animaciones activas
  de la escena como filas apagables?
- **Dónde:** panel izquierdo (`Capas.tsx` / nuevo tab), modelo (flag
  `animacionApagada`?), `evaluar-puro` (ignorar segmentos apagados),
  export (¿viajan apagadas o no viajan?).

### [HECHO] Escuela GSAP: catálogo completo + agente super especialista (2026-08-28)
- **Qué:** decisión con Gabriel — NO se incluye el código de GSAP (motor
  propio determinista, ver research-ia-y-gsap.md); se ABSORBE su escuela:
  (1) los 35 easings del catálogo GSAP v3 en el motor (sine/quad/cubic/
  quart/quint/expo/circ ×3 direcciones, back completo, elastic Penner
  «salidaElastico», bounce Penner «salidaPique», steps(10) «escalones»),
  con su tabla BEZIER_AE y los no-representables horneados densos;
  (2) ordenEscalonado «azar» (from: "random", barajado determinista);
  (3) `escuela-gsap.ts`: la memoria del agente director — easing/staggers/
  position parameter/keyframes/SplitText/recetario destilados de la doc
  oficial y traducidos a nuestras herramientas, con test de coherencia
  escuela↔motor. Pendiente natural: presets nuevos que luzcan el catálogo
  (loops pulse/float/shimmer siguen abajo).

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
