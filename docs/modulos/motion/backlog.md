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

### [HECHO] Guion v2 de lemlist con el brief de Gabriel + sangrado en la auditoría de corte (2026-09-02)
- **Brief:** «SaaS súper premium, next level, escena por escena; textos
  palabra a palabra o por líneas, muy smooth; las barras without/with AI
  como barra de uso de izquierda a derecha». Guion v2 (131 pasos,
  `_andamiaje/director-externo/ejemplos/lemlist-guion-fable-v2.json`):
  hero a zoom 1.5 centrado (el logo entra entero) con push-in de 4 % en el
  hold, título con asentamiento de escala, claim y bajada PALABRA por
  palabra, barras con `cargar` (60 min ×1600 salidaQuart, 3 min ×450
  salidaExpo, etiquetas cuando el borde las alcanza), 17,5 s, cierre a
  y 2869 sin vacío. Auditoría limpia, 12 frames revisados.
- **Regla afinada:** ENCUADRE CORTA no cuenta un corte en el mismo borde
  por donde la pieza SANGRA fuera de su pantalla (haces de luz desde x = 0,
  rayos desde y = 0): la cámara la recorta donde la página también. Test.
- **Comparativa:** el mismo JSON (plugin v15, «Descargar JSON») importado
  en headless da los MISMOS ids que el export anterior, así que el guion se
  aplica tal cual con «Aplicar guion» sobre la importación de Gabriel.

### [HECHO] Preset «cargar»: la barra que crece de izquierda a derecha (2026-09-02)
- **Brief de Gabriel para lemlist:** «la barrita without AI / with AI tiene
  que animarse como una barra de uso, de izquierda a derecha». No había
  herramienta: `revelar` es máscara vertical y la escala agranda desde el
  centro. `cargar` (entrada, categoría máscaras, pareja `descargar`): dx de
  −1 → 0 en múltiplos del ANCHO de la unidad (`relativoX`, `anchoUnidad`),
  recortado a su propia caja: la pieza aparece creciendo desde su borde
  izquierdo. `distancia` 0.5 = arranca por la mitad. Motor GSAP y evaluador
  dan lo mismo (test). Entra solo al catálogo, a la biblioteca y al prompt.

### [HECHO] Comparativa Gemini vs Fable en el mismo editor: «Descargar JSON» en el plugin y «Aplicar guion» en el panel (2026-09-02)
- **Pedido de Gabriel:** que el plugin descargue el JSON (no sólo copiarlo),
  que Fable dirija con ese JSON y devuelva el guion, y que el módulo tenga
  un botón para importar ese guion y verlo renderizado, para comparar contra
  Gemini y aprender de la diferencia.
- **Plugin:** botón «Descargar JSON» junto a «Copiar JSON» (mismo
  `VERSION_PLUGIN`, es UI): baja `<frame>.json` puro, sin pasar por TextEdit
  (el primer archivo llegó como RTF y hubo que destilarlo).
- **Panel del director:** botón `{}` «Aplicar un guion (.json con pasos)»
  → `aplicarGuionExterno` (guionista-puro): parsea, valida, ejecuta con el
  mismo ejecutor, encuadre automático si no hay escenas marcadas, auditoría;
  sin modelo. El chat muestra «GUION IMPORTADO «archivo»: N pasos, E con
  error» con el guion, los ✗ y la auditoría; el log lleva el informe.
  Verificado en browser real (`pw/verificar-guion-externo.mjs`).
- **Bug viejo y serio que destapó el smoke:** `deserializar` reconstruía la
  cámara sólo con las pistas y TIRABA `base` y `temblor`. Cada ida y vuelta
  al server (autosave, director, snapshot del panel) perdía el encuadre base
  de la cámara, que caía al centro del render: parte del «descentrado» de
  las pruebas de Flash venía de acá, no del modelo. Corregido con test.
- **Flujo de comparativa:** Descargar JSON → subirlo al chat de desarrollo
  → Fable escribe el guion (`_andamiaje/director-externo`) → «Aplicar
  guion» en el mismo editor → render. Mismo pedido a Flash en modo guion →
  dos piezas sobre la misma pantalla, y los dos guiones como pares de datos.

### [HECHO] ESCENAS MARCADAS + ENCUADRE AUTOMÁTICO: la geometría de la cámara la pone el código (2026-09-02, G7)
- **Segunda corrida de Flash en modo guion (log de Gabriel):** guion de 57
  pasos, $0,09, decisiones correctas; la cámara otra vez a ojo (x = 960 en
  una pantalla de 1440, vacío arriba). La auditoría lo marcó con el número
  correcto y recién la revisión lo corrigió. Conclusión: la geometría no se
  le pide al modelo. Idea de Gabriel: «marcar escena 1, 2, 3 con la cámara
  y que esa información le llegue al agente».
- **Escenas marcadas** (`encuadres-puro.ts`, `Composicion.encuadres`): en
  el inspector de cámara, «Marcar escena N (la vista actual)» guarda el
  encuadre (centro + zoom) en orden, con lista y quitar. El estado las
  describe con lo que ve la cámara en cada una. Herramienta nueva
  `recorrer_encuadres`: el guionista decide {escena, desde, hasta} de cada
  una (+ viajeMs, easing, temblor) y el código arma la cámara: holds y
  viajes de viajeMs antes de cada escena. SISTEMA y MODO GUION: con
  encuadres marcados la cámara es SIEMPRE recorrer_encuadres.
- **Encuadre automático** (`encuadrarEnPantalla`): sin escenas marcadas,
  después de aplicar el guion el código corrige base y keyframes de x/y para
  que lo visible caiga dentro de la pantalla (o centrado si es más chica;
  centrado también si sobra menos del 10 % del cuadro). No toca el zoom ni
  las capas; el informe lo anota como «encuadre automático: N valores».
  Probado con la cámara exacta del log de Gabriel: x 960 → 720, y 300 → 400,
  y la auditoría de encuadre queda limpia.
- **Verificado en browser real** (`pw/verificar-escenas.mjs`): marcar,
  listar, snapshot con `esc-1` y la vista del teléfono, quitar. 396 tests.

### [HECHO] Primera corrida de Flash en modo guion → auditoría de ENCUADRE DESCENTRADO (2026-09-02)
- **Resultado medido (log de Gabriel):** Flash escribió el guion entero de
  lemlist en UNA llamada: 55 pasos, 1:29, 64k tokens, $0,10 (ayer: 8 pasos,
  1,4M tokens, $0,55), con lectura y notas casi calcadas de las de Fable
  (lista como lista, trazo que se dibuja, typewriter, botón que se
  presiona, barras que cargan, un solo elástico). «Lo hizo bastante mejor».
- **Lo que falló y su causa:** el encuadre. (1) Flash centró la cámara en
  x = 960 (el render) sobre una pantalla de 1440 (centro 720): todo corrido.
  (2) ENCUADRE CORTA marcó los glows de fondo (2070×1548, más grandes que
  cualquier cuadro); Flash bajó el zoom a 1 «para que entren» y en la
  revisión llegó a mover y escalar esas capas.
- **Fixes, todos medidos:** ENCUADRE CORTA ignora fondos (caja > 90 % del
  cuadro en algún eje) y su mensaje prohíbe tocar la capa; regla nueva
  ENCUADRE DESCENTRADO (`encuadresDescentrados`): en t = 0 y en cada
  keyframe de cámara, la placa con más solapamiento es «la pantalla»; si es
  más grande que el cuadro, lo visible tiene que caer adentro (si no: «N px
  de vacío a la IZQUIERDA/DERECHA/ARRIBA/ABAJO»); si es más chica, centrada;
  el mensaje dice dónde tiene que estar el centro. Corre aunque no haya
  entradas. SISTEMA: un hallazgo de encuadre se corrige SOLO con
  definir_camara; MODO GUION: la fórmula del centro (720, no 960; zoom =
  1920/ancho de la región) y que los fondos no cuentan.

### [HECHO] Guardado de snapshots grandes por route handler (2026-09-02)
- **Causa exacta del «Maximum array nesting exceeded» con la landing de
  34 MB:** React Flight, al decodificar los argumentos de una server action,
  cuenta la LONGITUD de cada string contra un tope de 1.000.000
  (`arraySizeLimit`), sin importar el `bodySizeLimit` de 50 MB de Next. Todo
  snapshot mayor a ~1 MB fallaba y el editor perdía el guardado en silencio
  (con rasters de Figma a 2× eso es cualquier pantalla real).
- **Fix:** `persistencia-puro.ts` decide el camino por tamaño
  (`caminoDeGuardado`: > 800 000 chars → ruta); `POST /api/motion/composicion`
  recibe el body crudo con el mismo gate y `guardarComposicion` (CAS +
  fusión) que la action; el Editor usa `guardarSnapshot` en el autosave y en
  el flush al cambiar de escena. Verificado con el snapshot real de lemlist:
  `POST /api/motion/composicion 200 in 4.2s`. La carga (server → cliente) no
  tiene ese tope.
- **Revisión adversarial del director en dos fases, 5 hallazgos cerrados:**
  el guionista con Claude pedía 32 000 tokens sin streaming y el SDK lo
  rechazaba antes de llamar (ahora `messages.stream(...).finalMessage()`);
  `cajaAproximada` trataba trazos y vectores como un punto (los logos
  importados son vectores: ENCUADRE CORTA no los veía); los ✗ de la ronda 1
  se perdían del resumen si la corrección salía limpia; `elegirModo` con
  charla previa va a iterativo aunque la pieza esté sin animar (un «cambiá el
  color» no reescribe la pieza); la corrección va sin imágenes, documentado.

### [HECHO] DIRECTOR EN DOS FASES: guionista → ejecución por código → corrección (2026-09-02, G6)
- **Origen:** Gabriel comparó la landing de lemlist dirigida por Flash con la
  dirigida por Fable desde el chat (guion de 129 pasos escrito ANTES de
  tocar una herramienta, aplicado sin modelo): «está increíble… apliquemos
  los mismos pasos que hiciste vos para hacerlo con Gemini Flash». Lo que
  cambió el resultado fue el MÉTODO, no una regla más.
- **Cómo funciona (`guionista-puro.ts` + `dirigirPorGuion` en agente.ts):**
  una pieza SIN dirigir (`elegirModo` → «guion») va al GUIONISTA: una
  llamada sin herramientas (Gemini con `responseMimeType: application/json`
  y pensamiento alto; Claude fino con adaptive + xhigh) que devuelve
  `{guion: [LECTURA, GUION, CARÁCTER], pasos: [...]}`; el código lo aplica
  con `aplicarGuion` (mismo ejecutor y validaciones), corre la auditoría y,
  si hubo ✗ o hallazgos, un ÚNICO turno de corrección
  (`mensajeDeCorreccion`) que devuelve solo los pasos nuevos. Una pieza ya
  dirigida sigue por el loop iterativo (los retoques). `MOTION_DIRECTOR_MODO=
  iterativo` fuerza el camino viejo. El evento de paso lleva el guion
  (`texto`) y el informe ✓/✗ por paso (`ops`): en el log se lee todo.
- **El SISTEMA del guionista** = SISTEMA del director + `MODO_GUION`
  (formato, una cámara para toda la pieza con holds, división antes de
  revelar, verificación de encuadre con la fórmula visible = ancho/zoom ×
  alto/zoom) + `GUION_REFERENCIA`: la landing de lemlist abreviada a sus
  decisiones con el porqué (la lista entra como lista, el borde-trazo se
  dibuja, el placeholder se tipea, el botón se presiona, la barra carga, un
  solo elástico) y el error que no se repite (el logo cortado).
- **Auditoría nueva, ENCUADRE CORTA:** al terminar su entrada, cada capa
  tiene que estar ENTERA dentro de lo que ve la cámara en ese instante
  (`cajaVisibleEn` interpola los keyframes; `cajaAproximada` estima el texto
  por fuente y contenido, y ahora también la usa el rango de la cámara).
  Entera afuera no se marca (entra antes de que la cámara llegue, eso lo
  cubre el guion); a medias sí, con las dos cajas en el mensaje. Es el error
  que Gabriel vio en la pieza de Fable, convertido en medición.
- **Pendiente de medir:** el mismo pedido de lemlist con Flash en modo
  guion — cuántos ✗ da la primera ronda, si la corrección los cierra, y la
  comparación visual con el MP4 de Fable. Después: 2-3 guiones de referencia
  más (pantalla de app, logo, tarjeta de datos) y el volante de datos
  (guardar cada guion + correcciones para tuning).

### [HECHO] La cámara alcanza todo el lienzo + plugin v15 + rasters «contener» (2026-09-02)
- **Bug estructural visto al dirigir la landing de lemlist (3229 px):**
  `definir_camara` clampeaba x/y al doble del RENDER (y ≤ 2160): el director
  no podía encuadrar nada por debajo y sus viajes quedaban cortos en
  silencio — parte del «la cámara no sigue la acción». Ahora el rango es el
  del LIENZO (`rangoDelLienzo`: caja de todas las capas + un render de aire),
  nunca menor que el render. Test con una placa de 3229 px.
- **Plugin v15:** la caja de un raster sale del nodo que SE EXPORTA (el
  clon en la raíz no tiene los recortes de sus padres: sus píxeles podían ser
  más grandes que la caja del original y en «cubrir» la pieza se veía
  agrandada y recortada — las «Section» de diagram.com). Aviso cuando las
  cajas difieren. Los rasters importados pasan a `ajuste: "contener"`: con
  cajas exactas es idéntico y ante cualquier desajuste muestra la pieza
  entera en vez de agrandarla. Sello 15.
- **LOGO SHINY, cerrado con datos:** las cuatro líneas llegan como raster
  de 1 px con el degradado en los píxeles (alfa 158 → 0 a lo largo del
  75 %), y la imagen de lectura del frame es fiel a Figma (destello, glow
  azul, logo). La «línea azul saturada» de la captura era el encuadre de la
  cámara.
- **Gancho de desarrollo:** `window.__motion.frames(tiempos)` devuelve
  frames del render (la revisión visual del director externo).
- **Pendiente:** el guardado por server action falla con un snapshot de
  34 MB («Maximum array nesting exceeded», POST /motion 500): la landing con
  rasters no se persiste. Hay que pasar el snapshot por un campo string o
  comprimirlo antes del action.

### [HECHO] Director externo: guion sin modelo + gancho de desarrollo (2026-09-02)
- **Para probar la hipótesis 1 de Gabriel («ve pero no alcanza») con un
  director más fuerte:** Fable escribe el GUION desde el chat de desarrollo
  como JSON de pasos con las MISMAS herramientas del director, y se aplica
  sin modelo con el mismo ejecutor (`guion-puro.ts`: `validarGuion`,
  `aplicarGuion` → informe ✓/✗ por paso + errores sin cortar). CLI:
  `_andamiaje/director-externo/aplicar-guion.ts` (lee el estado como lo ve el
  director, aplica el guion, imprime la auditoría, escribe el snapshot
  dirigido). El editor en desarrollo expone `window.__motion`
  (`snapshot()`, `cargar(snapshot)`, `lectura()`) para el driver headless y
  los smokes; nunca en producción.
- **Flujo cuando Gabriel suba el JSON del plugin al repo:** importar en
  Chromium headless → snapshot + imágenes de lectura → guion escrito mirando
  la pantalla → aplicar → cargar → exportar MP4 (VP9 en este Chromium) →
  mandar el archivo. README en `_andamiaje/director-externo/`.

### [HECHO] LECTURA DE PANTALLA: el director VE el diseño antes de animar (2026-09-02)
- **Diagnóstico confirmado a Gabriel:** el director NO veía la pantalla al
  planear. Recibía la descripción textual de las capas (`describir`) y
  sólo veía imágenes en la revisión visual, DESPUÉS de animar, y eran 4
  frames del render (lo que ve la cámara). Por eso animaba «los layers»
  escalonados sin saber qué eran, encuadraba mal y no distinguía un botón
  de un título.
- **`lectura-puro.ts`:** `sinAnimacion(comp)` (el diseño en reposo),
  `planDeLectura(comp)` (una imagen por placa CON su fondo, escalada a 1024
  de ancho, las páginas largas en tramos verticales de 2048 px de imagen,
  tope 6 imágenes: primero las pantallas, dentro de cada una el arranque) y
  `contextoDeLectura` (el bloque «PANTALLAS ADJUNTAS» que conecta cada
  imagen con su pantallaId y su caja en el lienzo, y separa las imágenes de
  REFERENCIA que puedan seguir). El editor las pinta con el mismo pintor
  (`renderizarLectura`) y viajan con el pedido; la ruta las acepta (tope 14
  imágenes: 6 de lectura + 8 de referencia) y `armarPrimerUsuario` las pone
  después del estado, antes del pedido.
- **Regla LECTURA DE PANTALLA en el SISTEMA:** mirar las imágenes ANTES de
  la primera herramienta y escribir el GUION (qué es la pieza, secciones y
  protagonistas, qué elementos son sistemas y qué son —un botón se anima
  como botón, una lista como lista, una cita como cita—, qué palabra va sola
  por color/peso, orden de lectura, dónde termina cada escena y su encuadre).
  El texto que el modelo escribe junto a las herramientas ahora viaja en el
  evento del paso (`texto`) y el log lo muestra como «guion: …» — se ve qué
  leyó.
- **Verificado en browser real** (`pw/verificar-lectura.mjs`): al mandar un
  pedido con la pantalla del fixture, el POST lleva 1 imagen JPEG de 390×844
  y el bloque con `pantallaId` y caja. 5 tests puros.
- **Pendiente de medir con Gabriel:** el mismo pedido de lemlist — leer el
  «guion:» en el log y ver si el orden, los encuadres y el carácter de cada
  elemento salen de la imagen. Si Flash con la imagen sigue sin criterio, la
  hipótesis 1 de Gabriel (ve pero no alcanza) pasa a ser la vigente y el
  camino es el guion externo (Fable) o el nivel «fino».

### [HECHO] G5: secuencia PNG POR PANTALLA para ensamblar en AE (2026-09-02)
- **El pipeline del fork:** las animaciones se dirigen acá con GSAP de
  motor; AE sólo ensambla las pantallas y hace los movimientos de cámara
  entre ellas. Para eso cada pantalla tiene que salir como su propia
  secuencia PNG con alfa, en su formato y SIN la cámara del proyecto.
- **`exportar-pantallas-puro.ts`:** `escenasPorPantalla(comp, {conPlaca})`
  arma una composición por placa (formato = caja de la placa redondeada a
  par, cámara fija centrada en ella con zoom 1, sólo las capas con ese
  `grupo`, fondo transparente; la placa misma queda afuera salvo
  `conPlaca`); `manifiestoPantallas` escribe `pantallas.json` (carpeta, id,
  caja en el lienzo, tamaño del PNG, rango de frames y la CÁMARA MAESTRA con
  base + keyframes x/y/zoom + temblor) para rehacer los viajes en AE.
- **`exportarPngPorPantalla` (exportar.ts):** el render frame a frame se
  extrajo a `pintarSecuenciaPng`, compartido con la secuencia clásica; el
  zip lleva `01-hero/frame-00000.png`, `02-pricing/…` con la MISMA
  numeración (mismo rango de tiempo: en AE se alinean solas). Botón «PNG
  por pantalla (N, alfa)» en el panel de export (aparece si hay placas) con
  el toggle «Con el fondo de cada placa (sin alfa)».
- **Verificado en browser real** (`pw/verificar-pantallas.mjs`): importar el
  fixture 390×844 → exportar 0–0,5 s → zip con `01-pantalla-home/` (sin el
  «(fondo)» del nombre de la placa), 15 PNG RGBA de 390×844 con contenido,
  `pantallas.json` con la cámara maestra. 7 tests puros.
- **Bug visto por Gabriel, arreglado de paso:** el título rasterizado
  entrando con `subirDesenfocado` salía con el blur CORTADO en una caja. En
  «cubrir», `pintarMedia` recortaba a la caja ante medio píxel de redondeo
  entre la caja (0,01 px) y el PNG a 2× (entero), y el clip pisaba el halo
  del filtro. Ahora sólo recorta si sobra más de 0,5 px y el clip lleva un
  margen de 3× el desenfoque.

### [HECHO] REGLA DE ORO del motion grapher: prompt + auditoría medida + pensamiento a fondo (2026-09-02, G2c)
- **Pedido de Gabriel (con el log de la landing de lemlist: 41 ops, casi todo
  revelar/pop/deslizar, cámara descentrada, «pensó 41 tokens» en los pasos):**
  «el orquestador tiene que pensar más… tiene que ser un motion grapher: ver
  un logo, entenderlo y animarlo con animaciones secundarias, capa por capa,
  escalonado… que use la gran mayoría de las herramientas, que no sea vago
  (escala + bounce o fade), dinámico, profesional, premium. Regla
  superestricta de todo lo que hagamos de ahora en adelante».
- **Prompt:** el SISTEMA abre con `# REGLA DE ORO (superestricta)`: leer la
  pantalla como sistemas (logo = símbolo + wordmark + destello), capa por
  capa y escalonado con solape 30-50 %, animación secundaria + follow-through,
  caja de herramientas completa con cuotas duras (≥5 entradas → ningún preset
  >45 %, ≥3 familias, easings y duraciones por rol), una coreografía a medida
  por pieza, cámara narradora sin tramos muertos >2 s, prohibiciones
  explícitas, resumen que nombra la idea coreográfica.
- **Auditoría medida (`auditoria-puro.ts`, TOKENOMICS: el script verifica
  antes que el modelo):** `auditarDireccion(comp)` mide monotonía (>45 %),
  plantilla (aparecer/escalar/pop ≥60 %), pocas familias (<3 con ≥6),
  easing único, duración única, división sin escalonado, tiempo muerto
  (hueco > máx(2 s, 25 %) sin entrada/salida/pista/viaje de cámara — los
  holds y el temblor NO cuentan), sin coreografía propia (ninguna pista de
  3+ kf ni cámara), cámara quieta con ≥2 placas, y «nada se mueve». Los
  hallazgos viajan en `mensajeDeRevision(tiempos, auditoria)` como bloque
  «AUDITORÍA DE DIRECCIÓN» (hechos con números, no opiniones) y con ellos
  el director no puede responder APROBADO; el log del panel los lista.
  Fondos a pantalla completa y placas quedan fuera del conteo.
- **Pensamiento:** Gemini 3.x va con `thinkingLevel: "high"` (con el
  presupuesto dinámico Flash elegía pensar 30-40 tokens en los pasos de
  ejecución); escalera alto → dinámico → apagado ante cada 400 que nombre
  thinking, en el director y en el analista. El nivel «fino» (Claude) va con
  `thinking: adaptive` + `effort: xhigh`. El log ya muestra «pensó N tokens»
  por paso: ahí se verifica.
- **Revisión adversarial (Sonnet) del commit, 4 hallazgos corregidos:**
  TIEMPO MUERTO pide ≥3 entradas (un título + claim que quedan quietos no
  se reprueba); POCAS FAMILIAS rige desde 5 como promete el SISTEMA (decía
  6); el `xhigh` de Claude va SOLO en nivel «fino» (la revisión visual usa
  el default del modelo); la escalera de Gemini 2.5 salta alto → apagado
  (alto y dinámico eran el mismo request).
- **Pendiente de medir con Gabriel:** el mismo pedido de la landing con la
  regla puesta — cuántos hallazgos da la auditoría en la primera pasada y si
  la revisión los cierra en ≤2 rondas. Si la auditoría queda demasiado
  estricta para piezas chicas, los umbrales están en constantes al tope del
  archivo.

### [HECHO] El formato es SOLO la cámara: sin caja de fondo en el mundo, encuadre visible, director que centra en la pantalla (2026-09-01, F1b)
- **Ronda de Gabriel («el 16:9 me crea una caja nueva que no tiene nada
  que ver», «la cámara deseleccionada casi no se ve», «la animación quedó
  descentrada y la cámara no sigue la acción»):** (1) la vista Mundo
  pintaba el FONDO de la composición sobre el rectángulo ancho×alto del
  origen — con el formato desacoplado de la pantalla quedaba como una
  placa oscura ajena; ahora el mundo se pinta sin fondo (el rectángulo del
  render es solo el tamaño de la cámara) y el fondo sigue en vista cámara,
  PiP y export. (2) El encuadre se dibuja siempre en acento (1.5px, 70%)
  con marcas de esquina; pleno y más grueso seleccionado. (3) El director
  centraba la cámara en el centro del RENDER (960,540) y la pantalla de
  1440 está en otro lado: describir ahora abre con la regla del render
  (la cámara ve ancho/zoom × alto/zoom, zoom = ancho_render/ancho_región,
  centro = el de la región) y da la CAJA de cada placa (tamaño, esquinas,
  centro); regla ENCUADRE en el system prompt (jamás el centro del render
  por defecto; recorrer páginas por secciones con holds). 353 tests.

### [HECHO] Plugin v12: los grupos con blur o mezcla propia se importan ENTEROS (2026-09-01)
- **Ronda de Gabriel (el destello del logo de lemlist llegaba como rayitas
  crudas):** las LINE del grupo LOGO SHINY se rasterizaban bien (PNG fiel:
  blanco con alfa decayendo — verificado leyendo píxeles), pero el GLOW
  vive en el grupo (blur / modo de fusión) y el plugin, al abrir el grupo
  por piezas, lo tiraba con el aviso «los efectos del grupo no viajan».
  v12: un contenedor con efectos de LOOK (blur, ruido, textura, glass) o
  con blendMode propio se rasteriza ENTERO como se ve
  (`rasterizarComoSeVe`, con la mezcla en la capa) y avisa que para animar
  sus partes hay que desagrupar en Figma; las SOMBRAS siguen importándose
  por piezas (decorativas, las partes quedan animables). OJO: re-copiar
  code.js en Figma y re-exportar.
- **v13 (misma ronda, seguía crudo):** el grupo de las líneas ya no entra
  por piezas pero el look sigue a pleno donde Figma lo muestra tenue →
  (a) la OPACIDAD de grupo < 100% también es look propio (raster entero,
  opacidad en la capa); (b) el aviso del grupo rasterizado ahora dice
  EXACTAMENTE qué tiene (tipos de efecto con radio, blendMode, opacidad)
  para diagnosticar sin adivinar; (c) el clon que se exporta va con
  opacidad 100% y mezcla NORMAL: el PNG trae píxeles puros y la capa
  lleva opacidad/mezcla — antes podían aplicarse dos veces (export +
  motor). Pendiente de confirmar con el JSON de LOGO SHINY exportado con
  v13: si el aviso no muestra ningún look propio en ningún nivel, el glow
  viene de otra parte (capas de brillo aparte, o el `Mid`).
- **v14 (revisión adversarial de Sonnet sobre v12/v13, hallazgo alto
  confirmado):** el chequeo de look propio estaba DESPUÉS de los caminos
  «rotado», así que un grupo rotado con blur/mezcla/opacidad propia nunca
  pasaba por `rasterizarComoSeVe`: con un hijo exportaba el ORIGINAL
  (opacidad horneada en el PNG + otra vez en la capa = doble fade), con
  varios rasterizaba las piezas sueltas y el look del grupo se perdía.
  Movido antes de los dos `if (rotado)`. Mismo defecto en las HOJAS
  (texto rotado, fill con gradiente, «tipo X»): `rasterizar(nodo)`
  exportaba el original; ahora `rasterizar` deriva al clon con píxeles
  puros cuando la hoja tiene opacidad o mezcla propia. Sello a 14.

### [HECHO] FORMATO del render: decisión del proyecto, no de la pantalla importada (2026-09-01, F1)
- **Pedido de Gabriel (importó una landing de 9000px de alto y el render
  quedó «gigante, alargadísimo»):** la primera pantalla importada pisaba
  ancho/alto de la composición. Ahora el formato es del PROYECTO:
  `formato-puro.ts` (presets 16:9/9:16/1:1/4:5 + a medida, acotado
  64-8192; `formatoDe`, `conFormato`), selector en la tarjeta de arranque
  y sección «Formato del render» en el inspector de cámara (presets,
  ancho/alto, botón «Encuadrar la pantalla»); importar NUNCA cambia el
  formato — la pantalla entra al lienzo y la cámara la encuadra
  automáticamente (`encuadreDePantalla`: una PÁGINA —alto > 3× ancho— se
  ve a lo ancho desde arriba para bajar después; lo demás entero y
  centrado); `ajustar_composicion` acepta ancho/alto (el director puede
  fijar el formato). Verificado: 4 tests + sabotaje 46 (página tratada
  como contain → rojo exacto) + Playwright 6/6 (tarjeta, import 390×844
  deja 16:9 con zoom 128% centrado, cambio a 9:16 y re-encuadre). 351
  tests.
- La review adversarial (Sonnet, TOKENOMICS) trajo 3 reales + 3 menores,
  aplicados: `cambiarFormato` registraba undo en cada pointermove del
  arrastre de Ancho/Alto (y doble con el preset) → sin checkpoint propio,
  lo pone el caller una vez por gesto; la base de cámara del import se
  perdía si quedaban keyframes de un lienzo vaciado (camaraEn ignora la
  base en canales con pistas) → cámara NUEVA al importar en lienzo vacío
  (`camaraParaLienzoNuevo`) y el botón «Encuadrar» usa auto-key
  (`encuadrarCamara`: keyframe en el playhead si hay pistas); el viewport
  no se re-encuadraba al cambiar el formato → rAF encuadrar(); el frame
  vuelve a prestar NOMBRE y FONDO a la composición en el primer import
  (antes se perdían); guardrail en el prompt: ancho/alto solo con pedido
  explícito de formato. Edge anotado: el clamp de zoom 0.05-20 rompe el
  fit exacto solo con formatos extremos (64 o 8192) — irrelevante en uso.
  352 tests.
- **Sigue abierto:** export de secuencia PNG POR PANTALLA (cada placa su
  frame, sin cámara) para el pipeline con AE.

### [HECHO] DISEÑO D1+D2: el estilo de la pieza y derivar pantallas (2026-09-01)
- **Hecho (Gabriel: «dale, démosle forma»):** D1 — `estilo-puro.ts`:
  `estiloDePieza(comp)` lee el sistema implícito de la composición
  (paleta con usos y fondos aparte, tipografías por familia/peso con ROL
  por tamaño relativo —título/subtítulo/cuerpo/detalle—, márgenes mínimos
  de las piezas a los bordes de SU pantalla, ritmo: duraciones medianas,
  presets y easings frecuentes, escalonado) y `describirEstilo` lo vuelve
  el bloque «ESTILO DE LA PIEZA» que viaja en el primer mensaje del
  director y en ver_composicion; `editar_capa` gana familia/interlineado/
  interletrado/alineación (texto), ancho/alto/radio (formas), ancho/alto
  (media); describir marca las PLACAS y la pertenencia a pantalla; regla
  de DISEÑO en el system prompt. D2 — `derivar-puro.ts`:
  `derivarPantalla(comp, placaId, {nombre, reemplazos, desdeMs})` clona la
  pantalla entera a la derecha de la ÚLTIMA del lienzo con ids únicos,
  grupo y subgrupo remapeados, pistas x/y DESPLAZADAS (son absolutas),
  animación heredada, textos reemplazados con el encaje de
  transformar_texto (mayúsculas, cuerpo achicado por la línea más larga),
  corrimiento temporal opcional; tool `derivar_pantalla` que devuelve los
  ids nuevos. Verificado: 5 tests + sabotaje 45 (pistas sin desplazar →
  rojo exacto). 345 tests.
- La review adversarial (Sonnet, TOKENOMICS) trajo 2 reales + 1 menor,
  aplicados: `textoEncajado` sin piso podía dejar un texto en 0.4-3.5px
  (original vacío o chico + reemplazo largo) con éxito silencioso → piso
  de 8px (el clamp de editar_capa) y original vacío no achica; los
  márgenes eran todo-o-nada (una sola pieza sangrada por un eje anulaba
  los cuatro) → ahora por eje, un eje sin dato se omite; describir marcaba
  PLACA con `grupo === id` sin exigir forma → usa la misma `esPlaca`. De
  paso: derivar lo derivado ya no apila «Home B B» (Home B, Home B 2…).
  347 tests.
- **Pendiente D3/D4:** import vía `use_figma` y write-back (ver research).

### [P1] DISEÑO D3/D4: Figma MCP (anotado 2026-09-01)
- **Estado:** investigado, tandas D1-D4 diseñadas — ver
  `research/research-diseno-conectado.md`. Pedido de Gabriel: modificar el
  diseño por prompt, derivar pantallas/escenas con el mismo estilo,
  evaluar Claude Design y Figma MCP.
- **Decisión propuesta:** híbrida — el modelo del módulo YA es un modelo de
  diseño y el director ya tiene tools embrionarias; se completa el
  vocabulario (D1 estilo + tools, D2 `derivar_pantalla` que hereda también
  el movimiento) y Figma se conecta por MCP: `use_figma` ejecuta Plugin
  API → puede correr NUESTRO exportador sin copy/paste (D3), write-back
  opcional (D4). Claude Design = ideación (storyboards), no motor. Señal
  de mercado: Figma Motion (Config 2026) anima dentro del archivo — el
  diferencial nuestro es el motor GSAP determinista, el PNG-alfa a AE y el
  director por criterio.

### [HECHO] FORK GSAP, tanda G2: GSAP ES el motor (2026-09-01)
- **Pedido de Gabriel («encontremos la manera de usar GSAP de motor») —
  y sin perder nada:** un gsap.timeline PAUSADO es seekeable determinista
  (tl.time: mismo t → mismo estado, en cualquier orden — verificado en
  Node), así que GSAP puede ser dueño del tiempo Y los frames PNG siguen
  exactos. `motor-gsap.ts`: la composición se compila a UN timeline sobre
  PROXIES de valores (un {v} por pista → tweens fromTo con extremos
  explícitos e immediateRender:false, sets para holds; un {p} por
  segmento×unidad con el ease crudo de easings-puro — mismos números bit
  a bit), timeline HUÉRFANO (fuera del globalTimeline, nadie lo tickea),
  cache WeakMap por identidad de la comp (cada edición = comp nueva = 
  rebuild, 0.5ms). `estadoVivo(comp,t)` seekea y arma el estado con el
  MISMO ensamblador de evaluar-puro vía `LectorCapa` inyectable (un solo
  cuerpo: offsets, máscaras, blur, cámara — nada puede divergir).
  Preview (Lienzo), minis de biblioteca, export MP4 y secuencia PNG
  corren sobre estadoVivo; el clásico queda de referencia de paridad y
  para el .jsx legado. Segmento con en<0 cae al cálculo clásico
  (paridad igual). Perf: 0.05ms/frame el seek.
- Verificado: 7 tests (PARIDAD en comp intensa que pisa todos los
  caminos —escalonado azar, holds, eases GSAP, resortes, contador, trim,
  fpsAnimacion— más los instantes EXACTOS de cada keyframe, y en la
  fixture; tolerancia 1e-4 px = el redondeo a 6 decimales de GSAP,
  medido; seek desordenado bit a bit; t negativo; en negativo; firma;
  rebuild por identidad) + sabotaje 44 (seek sin ms→s → rojo exacto) +
  los dos e2e de Playwright re-corridos en verde sobre el build nuevo.
  340 tests.
- La review adversarial (Sonnet, TOKENOMICS) validó con scripts todos
  los bordes (holds en frontera exacta, keyframes duplicados, timeline
  vacío, concurrencia editor/minis, fugas — 100k builds con heap
  estable) y trajo 2 reales + 1 menor, aplicados: (1) t NEGATIVO
  disparaba un borde de gsap (el módulo interno da -0 y Timeline.time
  cae a la DURACIÓN: renderizaba el FINAL) — el seek quedó clampeado a
  ≥0, paridad intacta; (2) el rebuild NO era 0.5ms a escala real (5-22ms
  con 20 capas de texto escalonado, y cada pointermove de un drag crea
  una comp nueva) — rediseño: UN TIMELINE POR CAPA + cache de FIRMAS
  por referencia (pistas/entrada/salida/n): mover en x/y no recompila
  NADA (0 rebuilds en el benchmark de drag, 1.2ms/frame), retimar
  recompila solo la capa tocada (~1ms); (3) el fallback de en<0 dejaba
  tweens huérfanos — ahora valida la clase entera antes de crear.

### [HECHO] FORK GSAP, tanda G1: el puente de easings (2026-09-01)
- **Decisión de Gabriel:** fork. La versión con export AE por keyframes
  quedó congelada en la rama `ae-estable` (16a368d); esta rama prioriza
  calidad/vuelo con el motor de GSAP y AE queda SOLO para ensamblar
  pantallas + cámara entre ellas, recibiendo secuencias PNG con alfa (ya
  existía `exportarPngSecuencia`). Manifiesto y roadmap G2-G5 en
  `FORK-GSAP.md`.
- **Hecho (G1):** `easings-gsap.ts` — parseEase + CustomEase como funciones
  puras cacheadas; `easing()` resuelve casa primero y CUALQUIER spec GSAP
  después (typo degrada a suave); `EasingSpec` en el modelo (keyframes y
  segmentos); selector con sección «GSAP paramétricos» + campo libre
  validado en vivo; tools del director validan specs GSAP y el system
  prompt le enseña los paramétricos; el .jsx legado hornea denso los specs
  GSAP (no miente). RoughEase prohibido (random al crearse). Verificado:
  6 tests unit + sabotaje 43 (puente apagado → rojo exacto) + Playwright
  6/6 (sección, curvas, campo libre valida/aplica). 330 tests.
- La review adversarial (Sonnet, TOKENOMICS) encontró 1 crítico + 1 real,
  ambos aplicados: los nombres heredados de Object.prototype («toString»,
  «hasOwnProperty», «__proto__»…) pasaban la validación por el `in` y el
  acceso directo — tipearlos en el campo libre TIRABA ABAJO el árbol de
  React (sin error boundary) y rompían render y export legado; ahora todo
  lookup de EASINGS/BEZIER_AE usa Object.hasOwn. Y los parámetros
  degenerados que parsean pero dan curvas rotas («steps(0)» → NaN,
  «steps(-3)» → nunca llega a 1) se cazan con un SONDEO en el puente:
  la función se prueba (medios finitos, extremos 0→1) antes de
  certificarla, si no degrada a suave. 333 tests.

### [HECHO] Timeline con jerarquía de AE: z-order, ⌘A y marquee que scrollea (2026-08-31, tanda 23)
- **Hecho (pedido de Gabriel: «el orden de las capas es muy importante…
  qué es lo que tapa qué… como After Effects»):** (a) **convención visual
  volteada** en el panel de capas Y el timeline: la fila de ARRIBA tapa a
  la de abajo, como AE/Figma — el modelo no cambia (`capas[0]` = fondo,
  describir/export/agente intactos), los paneles pintan el array al revés
  y el drag del panel niega `despues`; gutter, pistas y recuadro de
  selección salen de UNA misma lista invertida (`filasTL`) para que nada
  se desalinee. (b) **⌘] / ⌘[**: `desplazarEnZ` pura — la selección se
  compacta en bloque (orden interno intacto) y salta UNA vecina por
  pulsación, clamp en tope/fondo, el video de referencia es piso y nunca
  entra al bloque, sin cambio real no hay undo. (c) **⌘A** selecciona
  todas las capas (video excluido). (d) **marquee con AUTO-SCROLL**:
  arrastrar más allá del borde scrollea solo (rAF, velocidad proporcional
  al exceso, zona de 24px) y la selección se calcula en coordenadas de
  contenido — scrollear a mitad de gesto no la corre. Verificado: unit
  (desplazarEnZ: sube/baja/clamp/compacta/piso/no-op) + sabotaje 42 +
  Playwright end-to-end (verificar-zorden, 13/13), que además cazó un bug
  real: el rectángulo del marquee agrandaba el área scrolleable y el
  auto-scroll se retroalimentaba infinito — quedó clampeado al contenido.
- La review adversarial (Sonnet, TOKENOMICS) encontró 3 reales + 1 menor,
  todos aplicados: el piso de video solo protegía la primera racha (ahora
  es «después del ÚLTIMO video», y el clamp jamás mueve contra el gesto);
  el marquee sin pointer capture dejaba el rAF del auto-scroll corriendo
  para siempre si soltabas fuera de la ventana (capture + pointercancel +
  limpieza unificada); la fila del video en el panel de Capas se podía
  arrastrar y romper el invariante de fondo (ahora ni arrastra ni es
  blanco de drop, solo click-selecciona); y ⌘A sin capas operables pisaba
  la selección que hubiera (early return). De paso: un subgrupo partido
  en rachas (posible con ⌘]/⌘[ sobre una sola de sus capas) generaba
  filas con id duplicado (keys de React) — filasDeCapas ahora da id único
  por racha («logo», «logo·2»).
- **Anotado:** drag para reordenar directo en el gutter del timeline
  (hoy el reorden por drag vive en el panel de capas; en el timeline es
  ⌘]/⌘[) — si Gabriel lo pide, es la próxima muesca de esta tanda.
  Mover capas en z ENTRE pantallas es libre (como AE): puede dejar los
  miembros de una pantalla no contiguos en el array — los paneles lo
  toleran (elementosDe filtra por grupo, filasDeCapas id por racha); si
  algún consumidor futuro asume contigüidad, mirar acá.

### [HECHO] Todo lo solo-borde es TRAZO dibujable (2026-08-31, tanda 22, plugin v11)
- **Hecho (ronda de Gabriel: «las líneas deberían dibujarse como path»):**
  sus recuadros contorno (RECT sin fill), elipses y LINEs verticales no
  traceaban — los rect/elipse solo-borde caían a capa VECTOR (donde
  «trazar» no existe y el director degradaba a revelar con máscara) y las
  LINE rotadas (una línea vertical ES una LINE a 90°) caían a raster
  porque la branch de trazo excluía rotados. Plugin v11: TODO nodo
  solo-borde con un stroke sólido (VECTOR/LINE/RECT/ELLIPSE/STAR/POLYGON/
  BOOLEAN) viaja como capa TRAZO — path del contorno computado
  (fillGeometry: esquinas y booleans resueltas) o vectorPaths, rotados
  incluidos con la rotación aparte (la misma cuenta que los vectores
  rotados de la v8); con flip sigue el camino de siempre. El normalizador
  copia la rotación al trazo (sabotaje 41 en rojo exacto). OJO: re-copiar
  code.js en Figma y re-exportar la pantalla.

### [HECHO] El ANALISTA de referencias: Flash ve el video entero (2026-08-31, tanda 21)
- **Hecho (pedido de Gabriel tras la primera prueba real):** 8 frames
  uniformes no alcanzan para leer motion (el movimiento vive ENTRE los
  frames — el propio research lo anticipaba). Ahora el pipeline es
  TOKENOMICS puro: el CLIENTE manda además el VIDEO entero (≤13MB inline;
  base64, nunca a disco), la ruta se lo da a un ANALISTA barato
  (`MOTION_REFERENCIA_MODELO`, default gemini-3.6-flash) que lo VE nativo
  con muestreo denso (fps 10 por videoMetadata, con degradación si el
  modelo lo rechaza) y un prompt de analista de motion: carácter global,
  línea de tiempo con timestamps, easings en el vocabulario de la casa,
  staggers con Δt, cámara, mecanismos de kinetic type — sin contenido
  ajeno. Ese análisis viaja al DIRECTOR como lectura PRINCIPAL (regla
  nueva en el system prompt; los frames quedan de apoyo) y su costo entra
  al taxímetro con línea propia en el log. Sin GEMINI_API_KEY o con fallo
  del analista degrada a frames-solos, avisado. También de esa prueba:
  describir ahora muestra el ID de cada capa (el director lo adivinaba
  por nombre y quemaba pasos en errores) y el prompt prohíbe el
  ver_composicion de entrada. Verificado: unit (mime quicktime→mov,
  prompt, partes con fps, contexto) + sabotajes 39-40 + Playwright
  (el video viaja en el POST, el evento del analista entra al log y al
  taxímetro). NOTA de honestidad (la review lo marcó): los verificadores
  Playwright son ANDAMIAJE y viven fuera del repo, como los verificarNN
  de todas las tandas — la cobertura reproducible del repo son los tests
  de node:test.
- La review adversarial (Sonnet, TOKENOMICS) encontró 8; corregidos: el
  fetch del analista sin try/catch ROMPÍA el turno entero ante un fallo
  de red (ahora degrada a frames, siempre); le faltaba el retry de
  thinkingConfig que loopGemini sí tiene; timeout propio de 45s (el
  analista no se come el maxDuration del director); 4 intentos y el
  último error real en el mensaje de agotados; PRIORIDAD explícita en el
  prompt cuando hay locución Y análisis (la locución manda los «en», el
  análisis aporta el carácter); tope de 8000 chars al texto del análisis;
  aritmética del base64 corregida a ×4/3; y anotado que bodySizeLimit no
  protege route handlers (el límite real lo pone la plataforma).
- **Pendiente natural:** el File API de Gemini para videos >13MB; y la
  medición CV real (M8) cuando el criterio del analista no alcance.

### [HECHO] Chip de versión + el video en la tarjeta de arranque (2026-08-31, tanda 19b)
- **Hecho (pedido de Gabriel probando en su máquina):** (1) CHIP DE
  VERSIÓN abajo a la izquierda del lienzo — el SHA corto del commit del
  build (next.config lo saca de git al levantar; reiniciar el dev server
  tras un checkout): se acabó el «¿estoy en la versión correcta?». (2) la
  tarjeta de arranque del proyecto vacío ofreció también «Subir el video
  de referencia» — REVERTIDO a pedido de Gabriel el mismo día: la tarjeta
  vuelve a sus dos arranques y el video de FONDO queda solo en la
  claqueta de la toolbar, porque la palabra «referencia» en la tarjeta se
  confundía con las referencias del CHAT del director (otra cosa: los
  frames que el director MIRA). Verificado en Chromium real.

### [HECHO] VIDEO DE REFERENCIA: el fondo que no se exporta (2026-08-31, tanda 19)
- **Hecho (la decisión «los videos acá son solo referencia»):** capa
  `video` con `referencia: true` — botón en la toolbar, cae de FONDO
  cubriendo el frame; se ve en el preview (el `<video>` mudo es esclavo
  del reloj: play/scrub/loop/cambio de escena lo siguen, con offset
  «Desde» en el inspector) y NUNCA sale en un export: MP4, secuencia PNG,
  .jsx de AE y frames de revisión del director filtran con
  `sinCapasReferencia` (el alert de AE recuerda montar sobre el video
  real). Archivo entero en IndexedDB (`video-guardado.ts`, patrón del
  audio); al JSON solo el `videoId`; en otra máquina placeholder avisado.
  Chip REF en el panel de capas. El director la CONOCE (describir la
  nombra con la regla de no tocarla) y cualquier herramienta que la
  apunte se rechaza con guía. Borrar la capa no borra el archivo (el undo
  la revive). Verificado: unit (filtro, pintado, AE, guard, serializar) +
  sabotajes 35-36 + Playwright end-to-end en Chromium real (webm generado
  en la página, subido, pixel del frame verificado, IndexedDB persiste).
  La review adversarial (Sonnet, TOKENOMICS) encontró 3 reales,
  corregidos: `reordenar_capas` esquivaba el guard (la lista de ids no
  pasa por capaId) y el director podía subir el video al frente — ahora
  queda CLAVADO al fondo, con o sin su id en el orden; el test del guard
  probaba un nombre de tool inexistente («borrar_capa» → «quitar_capa»);
  y los objectURL de los `<video>` no se revocaban (ahora: en el path de
  error de subir y al desmontar el editor).
  Pendiente natural (P2): el archivo al catálogo de diosa para viajar
  entre máquinas; sugerir el TEMPO de la escena desde la duración del
  video (como hace el audio).

### [HECHO] La MÁSCARA del revelado viaja a AE (2026-08-31, tanda 18)
- **Hecho (cierra la tanda 2 del export):** revelar/ocultar y familia
  llegan a AE como MASK real con la ventana del motor (hold keys: recorta
  solo mientras esconde; en reposo se agranda y no corta descendentes).
  Regla de oro: el viaje nunca va en la Position de la capa (la mask
  viajaría con él) — en TEXTO lo lleva el animator y la mask se mide en
  AE con sourceRectAtTime (fuente real fijada, instante de reposo); un
  texto MULTILÍNEA se parte en UNA CAPA POR RENGLÓN (el idioma del
  motionero: las masks unidas en una capa dejan ver un renglón a través
  de la caja del vecino), cada renglón con su ancla, su timing corrido
  (por líneas el delay EXACTO — orden centro/bordes/azar incluidos —,
  por caracteres/palabras el `en` corre por unidades previas), tramos
  re-indexados y el contador en el renglón de la cifra; en FORMA/VECTOR/
  TRAZO el viaje va en la Position del GRUPO de shapes y la caja suma el
  margen del borde. De paso, bug de paridad cazado: el animator escalaba
  los dy por interlineado donde el motor usa altoUnidad (con interlineado
  apretado el texto asomaba bajo la máscara). MEDIA con revelado sigue
  anotada (su encaje «cubrir» ya ocupa la mask del footage). Todo en
  `revelado-ae-puro.ts` + tests (301 verdes, sabotajes 32-34 en rojo
  exacto). La review adversarial (Sonnet, según TOKENOMICS) encontró 4
  reales y se corrigieron: todos-los-renglones-vacíos desaparecía del
  export, azar por caracteres multilínea degradaba sin aviso, la mask con
  contador se medía una sola vez (ahora unión con el arranque de la
  salida), y el alert contaba capas del modelo, no las emitidas.

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
- **Tanda 2: HECHA.** Text animators nativos (2026-08-29): división por
  caracteres/palabras/líneas → Range Selector barriendo con el escalonado
  como ventana; estirados por letra como Scale animator clavado. Path SVG
  real del trazo: hecho en la tanda 10. Máscaras de revelado (2026-08-31,
  tanda 18): mask real con ventana de hold keys, multilínea partida por
  renglón, shapes por la Position del grupo — ver la entrada de arriba.
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
- **Video de referencia:** HECHO (2026-08-31, tanda 19 — ver su entrada
  arriba): capa `video` con `referencia: true`, excluida de todo export.
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

### [P2] Plugin: migrar a documentAccess dynamic-page (anotado 2026-08-31)
- **Qué:** el manifest no declara `documentAccess: "dynamic-page"`, así
  que Figma carga el DOCUMENTO ENTERO en la memoria del sandbox al correr
  el plugin — en un deck de 30+ slides con fotos es pesado, y es el modo
  que Figma está deprecando. La migración es chica: el plugin solo usa
  `figma.currentPage.selection` y clones locales (auditado; nada de
  `getNodeById`/`root` sincrónicos). Contexto: un «error loading the
  plugin environment» en la máquina de Gabriel resultó ser el runtime de
  Figma trabado (reiniciar la app lo curó), pero el diagnóstico dejó esta
  mejora a la vista.
- **Dónde:** `figma-plugin/manifest.json`, sello v11 en `code.js` +
  `figma-puro.ts`.

### [P1] Probar el plugin de Figma en Figma real y ajustar
- **Estado:** abierto
- **Qué:** correr `figma-plugin/` sobre pantallas reales de adiós adiós,
  ajustar los casos que degraden mal (auto-layout raro, estilos de texto
  mixtos frecuentes) y decidir qué más merece fidelidad nativa.
- **Dónde:** `figma-plugin/code.js`, `lib/motion/figma-puro.ts`

### [HECHO] Referencias visuales para el agente (2026-08-31, tanda 20)
- **Hecho:** el CLIP del chat adjunta un video o imagen; el cliente
  extrae hasta 8 frames en orden (`referencias.ts`: seek + canvas, JPEG
  ≤768px; `referencias-puro.ts`: instantes de muestreo y el contexto
  textual) y viajan al director por el MISMO canal multimodal de la
  revisión visual, con la regla nueva del system prompt: estudiar
  dirección/easing/stagger/jerarquía/cámara de los frames y TRADUCIR ese
  carácter a las herramientas propias — estilo, no contenido. Chip con
  nombre y frames, consumida por pedido, marca en el historial, ambos
  proveedores. Verificado: unit (muestreo, contexto, primer turno,
  partes Gemini) + sabotajes 37-38 + Playwright interceptando el POST
  (8 frames JPEG reales + contexto + pedido limpio + chip consumido).
- La review adversarial (Sonnet, TOKENOMICS) encontró 6 y se corrigieron
  los 5 reales + robustez: el seek al instante 0 podía colgar hasta el
  timeout en motores que no disparan `seeked` sin seek real (Chromium sí
  lo dispara — verificado end-to-end —, Safari no siempre; ahora
  `necesitaSeek` lo saltea y además se espera el primer frame decodificado
  antes de dibujar), Enviar durante la extracción mandaba el pedido SIN
  la referencia (guard + botón), los ~4k tokens de visión se re-mandaban
  a precio pleno en cada iteración del loop (breakpoint de caché en el
  primer turno: cache-hit desde la segunda), un .mov con File.type vacío
  se rechazaba en silencio (inferencia por extensión), y el historial de
  la revisión no llevaba la marca de referencia (consistencia).
- **Pendiente natural (M8 del blueprint):** medición CV de curvas contra
  el video (hoy el director lee a criterio); varias referencias por
  pedido; recordar la referencia de la sesión para correcciones.

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
