# ENTREGA — módulo motion (estado al 2026-08-31)

> Contrato: `docs/kit-diosa-2026-08-26.md` (copia del kit recibido, sello `main=9a8e79ce`).

## Qué hace (hoy)

Motor puro de motion graphics (`lib/motion`): composición JSON versionada →
`estadoEn(comp, t)` → `pintar(estado, ctx)` determinista sobre canvas 2D.
Presets de entrada/salida con escalonado por caracteres/palabras (orden
inicio/fin/centro/bordes/azar — el from de GSAP completo; azar es un
barajado determinista), **35 easings con nombre**: el catálogo GSAP entero
— sine/quad/cubic/quart/quint/expo/circ en las tres direcciones, back
completo, elastic real («salidaElastico», fórmula Penner), bounce real
(«salidaPique»), steps(10) («escalones») — más los resortes con física
propia, pistas crudas de keyframes con hold, motion blur
sintetizado desde la velocidad del easing, merge por elemento con lápidas
para guardado concurrente, y operaciones puras listas para tools de Diosa.
Encima, el editor: page `/motion` con lienzo (cámara pan/zoom al cursor con
las constantes de la casa), línea de tiempo **redimensionable** (agarradera
superior) con scrub, transport, y **edición por drag** de spans de
entrada/salida y keyframes (snap al frame, un checkpoint de undo por gesto;
los spans además se ESTIRAN desde cualquiera de los dos bordes — manijas con
cursor propio: el borde derecho alarga la duración con el inicio clavado, el
izquierdo corre el inicio con el fin clavado, y el cuerpo sigue moviendo el
span entero),
**inspector de propiedades** (transformación, texto, presets con easing y
escalonado — cada campo con checkpoint por sesión de foco o por gesto;
los campos numéricos tienen SCRUB estilo Figma/Blender: arrastrás
horizontal sobre el campo y el valor corre suave con el mouse —Pointer
Lock cuando el browser lo da, Shift ×10, Alt ×0.1, click seco para
tipear—, los valores acotados muestran un relleno de slider, DOBLE CLICK
vuelve al predeterminado del campo (escala/opacidad 100, rotación/blur/
escalonado 0, interlineado auto, zoom 100, temblor 100 — con el tooltip
diciéndolo y un paso de undo), y cada
sección aplica divulgación progresiva: lo esencial a la vista y el resto
atrás de un «Más ajustes» plegado — rotación/motion blur/mezcla, peso/
interlineado, escalonado/orden), **selección MÚLTIPLE y
drag de capas EN el lienzo** (marquee arrastrando en el vacío — el pan
del viewport queda en la rueda — y también sobre la placa de una pantalla
NO seleccionada: seleccionás adentro del frame sin moverlo — la pantalla
se mueve arrastrando la placa ya elegida — y la placa sólo entra al
marquee si el rectángulo la encierra entera; en el TIMELINE también hay
marquee estilo AE: arrastrás por el fondo de las filas y el rectángulo
elige esas capas, con shift+click en filas y gutter; shift+click acumula en lienzo y panel,
drag de una seleccionada mueve todas juntas, Supr borra la selección
entera; y la S sostenida hace que el playhead SIGA al mouse) (hit-test con rotación y escala, umbral 4px,
Shift = eje dominante, ⌘ = sin snapping, capas bloqueadas seleccionables
pero no movibles) con **snapping azul** (algoritmo canónico de 3 imanes por
eje, un ganador por eje, el frame como imán, guías a 1px constante), panel
de capas **agrupado por pantalla** (cabecera colapsable por frame de Figma
con contador, como en Figma; reorden del z-order arrastrando filas — capa
dentro de su pantalla, pantallas enteras entre sí, sueltas entre sueltas —
en vivo con un checkpoint por gesto; borrar por fila o con Supr, la placa
borra su pantalla completa), undo por snapshots, autosave con CAS, **import de una pantalla de
Figma** (plugin propio en `figma-plugin/` → JSON por copy/paste →
normalizador puro con degradación por-nodo y avisos visibles; texto real,
formas nativas, lo demás rasterizado a data-uri que el editor resuelve; el
`textCase` de Figma —UPPER/LOWER/TITLE— se aplica al contenido, y el wrap
automático de la caja se reconstruye con CORTES REALES: getRangeBounds da
la caja de cada carácter y un salto del tope vertical marca la línea nueva
— el contenido viaja con los \n exactos de Figma y el editor no re-envuelve
nada; sin esa API degrada a la estimación por geometría (contando líneas
también por el alto de la TINTA, que no miente cuando el texto desborda su
caja) y el editor re-envuelve midiendo — el conteo de Figma manda sobre el
ancho, y al cargar la tipografía real el wrap se recalcula; el anclaje vertical usa la TINTA renderizada de Figma
(absoluteRenderBounds): baseline exacta = tope de tinta + ascenso de tinta
del mismo texto medido acá, geometría contra geometría — con fallback al
centrado en caja de línea si no hay tinta — y se re-ancla al cargar la
tipografía real),
**modos de mezcla** (multiply, screen, overlay… — viajan desde Figma, se pintan con globalCompositeOperation, editables en inspector y agente; LINEAR_BURN/DODGE se aproximan con aviso), **calidad de preview** (½ / 1× / Máx al estilo Half/Quarter de AE — menos píxeles de render mientras armás; el export SIEMPRE sale a resolución completa), **gestión de tipografías** (detección real de familias faltantes por medición — `document.fonts.check` miente —, panel que se abre solo tras un import con fuentes ajenas, carga desde Google Fonts con fallo detectable o subiendo el archivo .otf/.ttf/.woff2; sin sustitución silenciosa; lo cargado queda RECORDADO en el navegador —IndexedDB: el archivo entero o la elección de Google— y se recarga solo al abrir, re-anclando los textos; el panel post-import primero prueba las recordadas y se abre sólo si sigue faltando algo), **biblioteca de efectos**
(~37 presets en 8 categorías — máscaras y revelados, texto, desenfoque,
rotación, tracking, impacto y rebote, logos y gráficas, trazos — sobre
dos capacidades de motor nuevas: rotación POR UNIDAD (dRotacion) y
tracking (dx por índice desde el centro, la del medio quieta); el panel
vive bajo el de capas ocupando la mitad inferior de esa columna,
organizado en FAMILIAS con pestañas — Textos, Gráficos y Trazos — y cada
demo corre sobre la clase de capa que le toca (título, estrella vectorial,
línea); seleccionar una capa en el editor salta solo a su familia; cada
tarjeta es un PAR entrada/salida con TRES botones iconográficos al pie
(→| entrada, →|→ ambas, |→ salida) que aplican la mitad que corresponde
CONSERVANDO el timing existente; en Textos, bajo las pestañas va la fila
de DIVISIÓN a lo ancho del panel — ícono + palabra: Letras / Palabras /
Líneas (siempre una elegida, por defecto letras: aplicar un efecto de
texto fija esa división en la capa; fueron iconitos de 13px sueltos y no
se entendían); cada tarjeta corre el MOTOR REAL sobre una
plantilla en un mini canvas compacto (240×84, recorte vertical centrado) —
hover lo anima en bucle, quieto muestra el reposo; nunca un video grabado
que envejece —; los controles de calidad y vista viven abajo a la
izquierda del lienzo, junto al CHIP DE VERSIÓN — el SHA corto del commit
del build (lo inyecta next.config): «¿estoy en la versión correcta?» se
responde mirando la esquina, no adivinando; sin git no se muestra), **texto multilínea con revelado enmascarado** (`\n` real con interlineado
propio, división por caracteres/palabras/**líneas**, presets
`revelar`/`ocultar`: cada unidad sube dentro de su renglón recortada a su
caja de reposo — el clásico reveal de SplitText con máscara, sin crear
máscaras a mano; el recorte se apaga en reposo para no cortar descendentes,
y con interlineado APRETADO (display al 80%) la máscara y el viaje cubren
el GLIFO COMPLETO (nunca menos que 1.2× el cuerpo): una máscara de un
interlineado de alto cortaba la base de las letras en su posición final y
la franja aparecía de golpe al apagarse la ventana;
y dividir SIEMPRE se ve: activar una división en el inspector, por el agente
o al aplicar un efecto de la biblioteca pone un escalonado sano por división
—35/90/140 ms para caracteres/palabras/líneas— en los segmentos que no
traían uno, porque división con escalonado 0 anima el texto como un bloque
entero; un escalonado puesto a mano, incluso 0 explícito, siempre manda),
**capas de trazo con trim estilo AE** (vectores de Figma con stroke y sin
fill llegan como path animable; presets `trazar`/`retraer`/`borrar` y
propiedades `trazoInicio`/`trazoFin` 0–1 keyframeables — implementado con
`setLineDash`/`lineDashOffset` sobre el largo real medido al importar, y un
trazo sin medir degrada a entero), **capas VECTOR de verdad** (tanda 2026-08-28,
recetario AEUX reescrito: estrellas, polígonos, paths dibujados y BOOLEANS
con estilo sólido llegan del plugin v7 como path SVG — la geometría
computada de Figma, esquinas y booleans resueltas — el motor las pinta con
Path2D respetando la regla even-odd y el borde, y el export a AE las arma
como SHAPE EDITABLE: `ruta-puro.ts` convierte el `d` completo —M/L/H/V/C/
S/Q/T/Z, relativos, cuadráticas elevadas a cúbicas— a vértices + tangentes
relativas de AE, un Shape-Group por subruta con fill rule; el TRAZO también
exporta ya su path real con su Trim Paths encima), **ESCENAS** (la jerarquía de arriba: proyecto → escenas → pantallas →
capas — cada escena es una composición COMPLETA con su lienzo, sus
pantallas y su cámara, y el corte entre escenas es duro como en un edit;
la barra de chips arriba del lienzo cambia de escena —flusheando el
autosave, nada se pierde—, «+» crea una nueva heredando el FORMATO del
proyecto (unificación de diseño: ancho/alto/fps/fondo, lienzo vacío) y
«⧉» duplica la activa como documento nuevo, y cada chip lleva su «×»
de BORRAR con confirmación inline —el chip pregunta «¿Borrar?» y se
arrepiente solo a los 4s; la última escena del proyecto no se borra, y
al borrar la activa se salta a la anterior sin guardar lo que se va—; cada escena se guarda por su
propio id con el mismo protocolo CAS y el registro del proyecto vive en
localStorage hasta el catálogo de diosa; el agente dirige la escena
activa), **duración editable** (campo Dur con scrub en el transport:
cuánto dura TODO lo que se renderiza de la escena, 0.5–120s), **SUBGRUPOS de Figma** (un grupo del
diseño — el logo con cada letra en su vector — llega AGRUPADO: el plugin
marca cada nodo con su contenedor más externo debajo del frame, el
normalizador lo hace único por pantalla, y tanto en el PANEL DE CAPAS (cabecera con chevron y
contador adentro de su pantalla; click = seleccionar el grupo entero)
como en el TIMELINE el subgrupo es
UNA fila plegable — plegada por defecto, con chevron, nombre y contador;
su barra punteada muestra el rango de animación del grupo y arrastrarla
mueve el bloque entero; expandís cuando querés animar letra por letra;
las capas siguen SUELTAS en el modelo: todo lo demás —lienzo, inspector,
agente— las ve igual; y al exportar a AE cada subgrupo sale como
PRECOMP: una comp propia con sus capas adentro y una sola capa en la
escena, en su lugar del z-order — el timeline de AE queda tan limpio
como el nuestro; OJO: pide re-copiar el plugin actualizado en Figma),
**recuadro de grupo con TIME-STRETCH**
(con varias capas seleccionadas, un recuadro abraza todos sus spans en el
timeline: el cuerpo mueve la animación en bloque, y las manijas de los
bordes ESTIRAN — agarrás el borde derecho y toda la coreografía del grupo
se extiende o comprime proporcionalmente alrededor del borde opuesto,
inicios, duraciones, keyframes y también el escalonado, como el
time-stretch de AE; snap al frame, un checkpoint por gesto, y el factor
se aplica siempre contra la base congelada al arrancar — sin acumulación
de redondeos), **mover la
animación en bloque** (con varias capas seleccionadas, arrastrar un span
corre TODA la animación de esas capas — entradas, salidas y keyframes —
más adelante o más atrás, clampeado para que nada quede antes de 0), y
**export por rango o de escenas concatenadas** (el botón de export abre
un panel: Desde/Hasta con scrub para renderizar un pedazo, o «todas las
escenas» concatenadas con corte duro en UN MP4 — mismo encoder, keyframe
de video al inicio de cada corte, con la media de las escenas frías
precalentada antes de codificar), **export a After Effects**
(`exportar-ae-puro.ts`: en el panel de export, «After Effects (.jsx)»
genera un script ExtendScript que corrido en AE —Archivo → Scripts →
Ejecutar archivo de script— RECONSTRUYE las escenas con objetos nativos,
100% editables: comp por escena + master concatenado con corte duro,
capas de texto reales (fuente por nombre PostScript adivinado de
familia+peso, leading, tracking, justificación, ancla corregida a la
baseline de la primera línea), formas/trazos como shape layers (el trazo
con Trim Paths REAL; su path SVG por ahora es un rectángulo anotado),
media importada con ENCAJE FIEL al editor — escala UNIFORME y, para
«cubrir», una MÁSCARA rectangular centrada que recorta como el clip del
canvas (antes se estiraba por eje y sin recorte: así se desarmaban los
vectores de Figma en AE, ronda 4) — y la escala ANIMADA de una imagen se
COMPONE multiplicando sobre ese encaje (`__reescalar`: ya no se pierde
avisada), keyframes de
x/y/escala/rotación/opacidad/desenfoque con el easing convertido a
temporal ease de AE (velocidad+influencia desde nuestros cubic-bezier;
resortes aproximados con overshoot), los TRAMOS de rich text (dos
tipografías en un título, un color por palabra) aplicados POR RANGO de
caracteres con la API characterRange de AE 24.3+ — índices no-blancos
del modelo convertidos a índices reales del string, la fuente base
primero y los tramos encima, cada tramo con su propia escalera de
candidatos; un AE más viejo degrada avisado —, la cámara como precomp
—anchor point keyframeado desde `camaraEn` limpio, zoom = escala— y el
TEMBLOR como expresión con la misma suma de senos del motor; los presets
de entrada/salida y la división por unidades TODAVÍA no se traducen
(tanda 2: text animators) y quedan anotados en el comentario de cada capa
para que nada se pierda en silencio; el .jsx sale ASCII puro —encoding a
prueba de AE— y el generador es determinista y testeado byte a byte; la
opción «Solo el diseño, sin animación» (checkbox explícito) exporta las
capas en su estado BASE — sin keyframes, sin cámara, sin temblor — para
armar la animación de cero en AE; y los ASSETS VIAJAN: con capas media el
botón baja un ZIP con el .jsx + assets/ ordenados (media-01.png…) — se
descomprime, se corre el script y AE IMPORTA los archivos solo, cada uno
en su capa con su caja y su escala; falta un archivo → sólido placeholder
con la instrucción en el comentario, nunca un proyecto roto; las
TIPOGRAFÍAS también viajan: fuentes/ lleva los bytes de las subidas como
archivo (instalar con doble click — AE no puede instalarlas por script) y
un LEEME que lista las de Google con su link y las que hay que tener; y
en AE la fuente se fija probando CANDIDATOS de nombre PostScript y
RELEYENDO cuál agarró — AE sustituye en silencio —: los candidatos ahora
recorren la ESCALERA DE PESOS entera en orden CSS de fallback (400
prefiere 500 antes de bajar; sufijos Book/Roman/Demi/Heavy incluidos),
así una familia sin el estilo pedido cae al MÁS PARECIDO — no a Thin,
como le pasó al RIVALS de Gabriel (ronda 3); si ningún candidato pega
EXACTO pero AE resolvió otra cara de la MISMA familia, el script se queda
con esa y la capa anota «tipografia aproximada: pedida …, AE puso …»; si
ni eso, guarda «tipografia original: …» y un alert final lista las
faltantes; el tracking va ENTERO (un float aborta el script —
cazado en el AE real de Gabriel; la familia CSS del import va LIMPIA a
AE — antes viajaba el stack entero y AE no encontraba la fuente
instalada—; los eases se aplican con interpolación BEZIER explícita y los
errores técnicos del script se juntan en un alert final — que ya NO
concatena el Error nativo con «+» (el operador de ExtendScript los
rechaza con «Object of type Error found where a Number, Array, or
Property is needed» y abortaba en la línea 54, cazado en la ronda 3): el
detalle se lee por `.message` vía el helper `__detalle`, con red — y los
avisos DEDUPLICAN (ocho capas con el mismo problema son un renglón) e
incluyen el DIAGNÓSTICO de fuentes: cuando ningún candidato pega, el
alert dice qué resolvió AE de verdad para poder afinar la escalera; y los
PRESETS de entrada/salida viajan como KEYFRAMES: los simples (cada canal
un tramo 0→1: subir, revelar, desvanecer, deslizar…) van RALOS — un
keyframe de in y uno de out por segmento con el easing convertido a
temporal ease, editables como los haría un motionero (lo que pidió
Gabriel en la ronda 3: nada de muro de keyframes por frame) — y los que
no se pueden contar con un solo tramo (pop/rebotar con overshoot en la
pista, resortes que rebotan de verdad, o pistas crudas SUMADAS encima
del preset) se HORNEAN densos: el mismo estadoEn del preview muestreado
a un keyframe por frame en las ventanas animadas —posición/escala/
rotación/opacidad/desenfoque/trim, solo los canales que se mueven—, así
la coreografía llega exacta igual; el comentario de la capa dice cuál de
los dos viajó; un texto con división viaja como TEXT ANIMATOR nativo y el
revelado con su MASCARA real — ver más abajo),
**el panel de Efectos como TAB plegable** (la cabecera «Efectos» pliega
la biblioteca a una fila compacta, como la fila «Cámara»; el estado
persiste en localStorage y plegado el panel de capas gana el alto),
**audio de proyecto** (la voz en off / música que
estructura las escenas: UN audio por proyecto —botón ♪ en la barra de
escenas, acepta audio y el sonido de un mp4/webm—, guardado ENTERO en el
navegador (IndexedDB, como las fuentes: al reabrir vuelve solo) y
con panel de RECORTE al importar
—la onda completa con dos manijas: te quedás con el segmento que va
(mínimo 0.5s) o «Usar todo»; la escena vacía toma el largo DEL SEGMENTO
(+10%); preview, export y transcripción usan solo ese pedazo, y cambiar
el recorte descarta la transcripción vieja; el panel tiene REPRODUCTOR
con TECLADO PROPIO (mientras el modal está abierto el editor de atrás no
recibe teclas — antes espacio le daba play al timeline de abajo): ESPACIO
reproduce desde el CURSOR de escucha (fuera del segmento cae al in —
probado con Gabriel: seguir el playhead le ganó al «siempre desde el
in»), I / O fijan in/out en el cursor, Escape sale; click o
arrastre fuera de las manijas = escuchar desde ahí, frena solo al fin del
segmento; la «×» sale sin tocar nada; «Recortar» en la franja lo
reabre— y decodificado a una franja de FORMA DE ONDA arriba del timeline
en DOS CARRILES (rediseño 2026-08-28): la onda con lo YA REPRODUCIDO en
acento (el progreso se lee de un vistazo) y los CORTES de escena encima
sobre el eje global del proyecto (las escenas concatenadas, el orden del
export), y un CARRIL DE TRANSCRIPCIÓN separado abajo: cada PALABRA
posicionada donde cae en el tiempo, clickeable (click = saltar ahí, la
que suena se resalta); la transcripción Whisper ahora AUTODETECTA el
idioma (antes forzaba "spanish" y destrozaba locución en inglés), usa
whisper-SMALL (le gana lejos a base con voz sobre música; cascada de
respaldo: small→base, con y sin cross-attentions) y pide
timestamps POR PALABRA (export del modelo con cross-attentions, revision
output_attentions; sin él degrada a oraciones por trozo), corre en un WEB
WORKER precompilado (public/stt-worker.js via `npm run build:worker`; el
hilo de la UI late a 60fps mientras el WASM mastica — antes «Page
Unresponsive» — y si el worker no arranca degrada al hilo principal) y
lleva el ALINEADOR
PARCHEADO (bug de transformers.js 2.17: pasa `num_frames` en frames del
mel donde la máscara del DTW vive en frames del encoder — la mitad;
whisper oficial hace `num_frames // 2` y el port JS lo perdió, así que en
audio < 30s las palabras derivaban hasta 2× la duración real; medido con
jfk.wav y corregido envolviendo `_extract_token_timestamps` con
`framesDeEncoder`); el DICTADO
del chat (hablarle al director por el mic) FUERZA castellano — con un
clip corto la autodetección a veces decía inglés y whisper devolvía el
pedido traducido —; los LOOPS de
decodificación de whisper (la misma palabra repetida decenas de veces,
el «trabón») se PODAN en el post-proceso puro (limpiarPalabras: colapsa
repeticiones consecutivas sin avance real y rachas de 4+, un «no, no,
no» legítimo sobrevive), las oraciones
se agrupan por puntuación y pausas (oracionesDePalabras), y los INICIOS
de palabra se vuelven IMANES del timeline: al arrastrar spans y
keyframes, dentro de ~8px de una palabra gana la palabra (los imanes se
ven como marquitas en la regla) — la animación se recuesta sobre la voz;
además SHIFT durante el scrub imanta el playhead a los KEYFRAMES
(pistas de capas y poses de cámara, alcance ~25px) para pararse exacto
donde está la animación, y ALT/OPTION arrastrando un keyframe o una pose
de cámara DUPLICA (nace una copia con el mismo valor/easing/hold y el
gesto la arrastra; el original no se toca; un paso de undo);
«Re-transcribir» rehace una transcripción vieja (sin palabras o con el
idioma forzado); las palabras se CORRIGEN en el MODAL «Palabras» (estilo
recorte, con la onda del segmento y ticks de cada «in»): cada palabra es
un HITO de entrada (el «in» de la frase, un tick sin caja de duración) y
en el modal los chips grandes en dos filas se ARRASTRAN para corregir
dónde caen (la lista se REORDENA por tiempo: cruzar una palabra sobre
otra ya no la deja inagarrable), doble click RENOMBRA, × o Supr BORRA,
doble click en la onda (o «+ Palabra en el cursor») AGREGA la que
whisper se olvidó, y Ctrl/Cmd+Z DESHACE dentro del modal — nada se
pierde para siempre ni persiste hasta «Guardar», que reordena, recalcula
las oraciones desde las palabras y guarda todo junto al audio (Cancelar
o Escape no tocan nada; espacio escucha desde el cursor con teclado de
captura, sin darle play al editor de atrás); el carril de la franja
queda SOLO lectura (click = saltar a la palabra) y comparte columna y
ancho con la onda, así cada palabra cae
exactamente debajo de su lugar (antes el carril era más ancho que la
onda y todo quedaba corrido); click en la franja salta a ese punto —cambiando de
escena si hace falta—, arrastrar un corte ajusta la duración de la
escena que termina ahí (la activa con undo; una no activa se edita en su
documento y el registro aprende la duración), y el preview reproduce el
TRAMO que le toca a la escena activa, esclavo del reloj —play
resincroniza, pausa frena, el loop de la escena vuelve a su inicio—; el
registro de escenas ahora guarda la duración de cada una para ubicar los
cortes sin cargarlas; y el EXPORT MP4 lleva la voz en off ADENTRO: el
tramo global que corresponde al video exportado (rango de la activa o las
escenas concatenadas) se muxea como pista AAC —Opus si el browser no trae
encoder AAC; sin AudioEncoder el MP4 sale mudo, nunca roto—; y la línea de VOZ quedó
andando con WHISPER LOCAL (transformers.js: el modelo corre en el
browser, nada de la voz sale de la máquina; la primera vez baja ~70MB y
queda cacheado): «Transcribir» en la franja de audio pasa la locución a
ORACIONES CON TIMESTAMPS que se guardan junto al archivo y se pintan
sobre la forma de onda —cada oración escrita sobre su tramo: se LEE qué
se dice en cada pedazo al cortar escenas—, y el chat de diosa tiene MIC:
apretás ⏺, hablás el pedido, Whisper lo pasa a texto en el input y lo
revisás antes de enviar; sin red o sin modelo, aviso legible y todo lo
demás sigue — la demo publicada lleva un stub (su CSP no deja bajar el
modelo); NOTA de import: se usa el bundle dist/ prebuildeado del paquete
— el src/ importa onnxruntime-node y el bundler de Next lo rompe
(«Cannot convert undefined or null to object»); verificado el ciclo
COMPLETO en browser real: modelo bajado, tono transcripto, oraciones
pintadas y persistidas),
**media a mano: subir y reemplazar** (botón de subir imagen en la
toolbar: la foto cae como capa nueva centrada donde mira la cámara, a lo
sumo al 70% del frame y nunca agrandada; y en el inspector de una capa
media, «Reemplazar el archivo…» cambia la imagen CONSERVANDO posición,
tamaño y animación — actualizar la foto de un diseño sin rearmar nada;
de paso el `ajuste` cubrir/contener ahora se PINTA de verdad —cubrir
recorta centrado con clip, contener encaja entera— cuando antes estiraba),
**VIDEO DE REFERENCIA** (tanda 19, 2026-08-31 — la decisión «los videos
acá son solo referencia» implementada: botón de la toolbar → el video cae
como capa de FONDO cubriendo el frame, se ve en el preview para componer
las gráficas encima, y NUNCA sale en ningún export — el MP4, la secuencia
PNG, el .jsx de AE y los frames de la revisión del director filtran con
`sinCapasReferencia` antes de renderizar, y el alert de AE recuerda que
el montaje sobre el video real se hace allá; el archivo vive ENTERO en el
navegador (IndexedDB, como el audio y las fuentes: al reabrir vuelve
solo; al JSON viaja únicamente el `videoId`, y en otra máquina pinta
placeholder con aviso), el `<video>` mudo es ESCLAVO del reloj del
preview (corrección por deriva en cada frame: play, scrub, cambio de
escena y loop lo siguen; clavado en su último frame si la escena es más
larga; el inspector tiene el offset «Desde» para alinear el archivo), la
fila del panel de capas lleva el chip REF, y el DIRECTOR la conoce pero
no la opera: `describir` la nombra como referencia con la regla de no
tocarla y cualquier herramienta que la apunte se rechaza con guía;
borrar la capa NO borra el archivo local — el undo la puede traer de
vuelta, como las fuentes recordadas),
**secuencia PNG con alfa** (tercer camino de export, pensado para el
flujo «los videos acá son solo referencia»: las gráficas solas sobre
fondo TRANSPARENTE, frame a frame, en un ZIP —zip STORE propio,
determinista, sin dependencias— que se monta ENCIMA del video real en
AE/Premiere; respeta Desde/Hasta y «todas las escenas» con numeración
global de frames; mismo motor determinista con supersampling 2×), **el proyecto arranca VACÍO con su punto de partida**
(lienzo limpio con el formato de la casa y una tarjeta al centro con los
tres arranques: subir la voz en off — que además le pone el TEMPO a la
escena: la duración toma el largo del audio + 10% de aire —, importar la
pantalla de Figma, o subir una imagen; con capas la tarjeta desaparece;
la composición demo quedó en `lib/motion/demo.ts` para tests y harness),
**el paradigma canvas + cámara** (el lienzo es
infinito: cada import de Figma se SUMA a la derecha de lo existente con su
fondo como placa — ids únicos, anclas remapeadas — y el plugin exporta
VARIOS frames seleccionados en un solo JSON: entran todos al lienzo
conservando la disposición que tienen en el canvas de Figma, con el primer
frame seleccionado definiendo el tamaño del render, y el render es LO QUE VE
LA CÁMARA; el editor muestra el mundo con el rectángulo de encuadre
dibujado encima — la transformación de cámara la aplica el export, no el
preview —; la cámara es otra capa, abajo: fila propia en capas y timeline
con keyframes arrastrables, inspector con x/y/zoom resueltos al tiempo
actual y auto-key por canal —si el canal tiene keyframes, editar crea uno
en el playhead; si no, edita la base—, «keyframe acá», «tomar la vista»,
y el modo cámara es estilo AE con teclas SOSTENIDAS: mantenés X y el mouse
mueve la cámara (sin apretar ningún botón — la cámara sigue al mouse),
mantenés Z y mover el mouse en vertical la hace entrar (arriba) y salir
(abajo); soltás la tecla y el gesto termina, y TODO movimiento deja
keyframe en el playhead — te movés por la timeline, sostenés, y la
animación queda sola (arrastrar el encuadre sin tecla sigue moviendo la
posición); las POSES viajan sincronizadas — cuando x/y/zoom comparten los
límites del tramo (una pose de la timeline), los tres canales corren con
UN progreso y UN easing compartidos (el primero definido entre x → y →
zoom): sin esto cada canal desacelera a su ritmo y la cámara llega en dos
tiempos, el paneo frena primero y el zoom sigue solo; canales con tiempos
propios siguen sueltos —; el ZOOM de cámara interpola en espacio LOG (el zoom es
multiplicativo: mezclado lineal, un zoom-out se siente acelerando al final
y la llegada queda trabada, peleada con el ease del paneo — en log la
velocidad perceptual es pareja y paneo + zoom cierran juntos; los
keyframes no cambian, sólo el camino entre medio); la cámara además tiene TEMBLOR procedural — presets handheld /
flotar / nervioso con intensidad y velocidad en su inspector: movimiento
constante ENCIMA de los keyframes que nunca los toca ni los crea (el
wiggle de AE), determinista (mismo t, mismo encuadre: el export sigue
siendo reproducible), y los gestos e inspector leen el encuadre LIMPIO
(camaraEn) para no hornear el jitter en los keyframes — el agente lo
maneja con temblor en definir_camara; los keyframes de x/y/zoom que caen en el mismo
instante son UNA «pose» en la timeline: se selecciona, arrastra, copia
(⌘C), pega en el playhead (⌘V) y borra (Supr) como unidad — y los
keyframes de pistas de capas se seleccionan/copian/pegan/borran igual;
el botón de cámara de la toolbar entra al modo en PAUSA — no reproduce ni
graba: activa los controles y vas dejando keyframes moviéndote por la
timeline (la toma en vivo quedó como opción secundaria en el inspector de
cámara); botones de centrar horizontal/vertical: una capa se centra por su
caja en su pantalla (o el frame), la placa centra su pantalla entera, la
cámara centra el encuadre; 2D: posición + zoom; cada pantalla es un grupo liviano cuya
placa de fondo es la manija — arrastrarla mueve la pantalla ENTERA con
snap y el inspector la borra completa con lápidas — y el lienzo conmuta
Mundo/Cámara: la vista Cámara es el preview exacto del render, recortado
al frame, solo lectura), un **modo grabación** (botón de cámara →
reproducís y encuadrás a mano con pan/zoom del lienzo; al terminar,
`suavizarGrabacion` convierte la toma cruda en pocos keyframes editables:
media móvil de 350 ms contra el temblor + reducción RDP por canal, extremos
crudos para que el encuadre inicial y final queden exactos), **el agente
director de motion** (ruta `/api/motion/agente`: loop agéntico —
que además recibe LA LOCUCIÓN de la escena («palabra @ ms» en tiempo
local, armada desde la transcripción) y tiene la regla de SINCRONIZAR:
el elemento que dice la palabra entra EN su ms exacto —
con la API de Claude sobre 13 herramientas incrementales validadas y
clampeadas — incluye `definir_camara`/`quitar_camara` y los trims — panel
de chat que aplica cada respuesta como UN paso de undo y
muestra las ops; su system prompt lleva la **ESCUELA GSAP completa**
(`escuela-gsap.ts`, destilada de la documentación oficial de GSAP v3:
easing con las tres direcciones y la escalera de intensidad, staggers
each/amount con sus from, el position parameter traducido a aritmética
de «en», keyframes multi-paso, SplitText, un recetario de la casa con
~12 recetas ejecutables y los errores del principiante — un test
verifica que cada easing nombrado en la escuela EXISTE en el motor;
los presets de TRAZOS aplicados a capas que no son trazo se RECHAZAN
con guía — antes «funcionaban» sin efecto visible y el director creía
haber animado —, y los errores de herramienta viajan al log con su
motivo), con **REVISIÓN VISUAL AUTOMÁTICA** (al terminar una dirección
con ops, el cliente renderiza 3–4 frames clave del RENDER REAL —mismo
`estadoEn`+`pintar`, cámara y media incluidas, 768px JPEG— y se los
manda al director en un turno multimodal extra: los mira como control
de calidad —desbordes, encimados, capas quietas—, se corrige con las
herramientas si hace falta (máx. 2 rondas, cada corrección es un paso
de undo) y responde APROBADO cuando quedó; el ojo del header del panel
la prende/apaga —prendida por defecto—, `revision-puro.ts` decide QUÉ
instantes mirar —final de cada entrada, arranque de cada salida, medio
y casi-final, deduplicados— y el log copiable registra cada ronda con
frames, veredicto y costo), **REFERENCIAS al chat del director** (tanda
20, 2026-08-31 — «que se mueva como esto»: el clip del chat adjunta un
video o imagen de referencia; el CLIENTE extrae hasta 8 frames en orden
(≤768px JPEG, muestreo uniforme evitando el frame final — el archivo
entero jamás viaja al server) y van al director como imágenes con su
contexto («REFERENCIA ADJUNTA "nombre", video de Ns, frames tomados en
…»); la regla del system prompt le enseña a LEERLA como director —
dirección, easing percibido entre frames, ritmo del stagger, jerarquía,
cámara — y a TRADUCIR ese carácter a las herramientas propias sobre las
capas existentes: la referencia es ESTILO, no contenido (jamás copia
textos/colores/layout ajenos); el chip muestra qué viaja y se consume
con el pedido (si falla queda puesta para reintentar), el turno guarda
la marca en el historial, y funciona igual en Anthropic y Gemini (el
mismo canal multimodal de la revisión visual); primer paso del módulo
M8 del blueprint — la medición CV de curvas queda para después),
**perilla de SENSACIÓN de la pieza**
(arriba del chat del director: snappy ↔ suave — arrastrar PREVISUALIZA
en vivo sobre el lienzo y soltar revierte; «Aplicar» esculpe de verdad
como UN paso de undo: `sensacion-puro.ts` escala duraciones y
escalonados (0.7×–1.4×) y corre los easings DENTRO de su familia por la
escalera sine→expo —los de carácter (back/elástico/pique) no se pisan—,
sin tocar jamás los «en» (la sincronización con la locución es sagrada)
ni las pistas crudas; el registro elegido viaja además al director en
cada pedido como «SENSACIÓN de la pieza» para que las direcciones
nuevas nazcan en ese carácter), **bajos fps / look stop-motion**
(`fpsAnimacion` en la composición: el motor cuantiza TODO el tiempo de
animación a esa grilla —12 = animar «en doses», 8 = más marcado— así que
preview, export MP4 y frames de revisión escalonan igual; el director lo
setea con ajustar_composicion ante «stop-motion / dibujado a mano / a 12
fps» y la comp de AE se crea a esos fps, el idioma clásico para anidar),
y **export a MP4 frame-exacto** (WebCodecs + `mp4-muxer`, decisión aprobada por Fran
2026-08-26): la misma `pintar()` del preview frame a frame, H.264 con
fallback a VP9-en-MP4 (Chromium sin codecs propietarios), **supersampling
temporal 4×** para motion blur real (media móvil exacta sobre frames
opacos), **supersampling ESPACIAL 2×** para antialiasing real (cada frame
se pinta a doble resolución y baja con smoothing de alta calidad — los
bordes diagonales de un display grande dejan de escalonar; los radios de
`ctx.filter` se compensan porque van en px de dispositivo, verificado por
MSE contra un ground truth 4×), back-pressure del encoder y progreso en
vivo. El editor arranca PARADO en 0 (sin autoplay) y con la línea de
tiempo alta (340px). El preview SE PARA en el último frame al terminar
(como un editor de video; play desde el final rebobina y arranca) — el
toggle ⟳ del transport activa el LOOP, y al dar la vuelta el audio se
resincroniza y SE REANUDA (antes loopeaba siempre y la vuelta quedaba
muda). El chat del agente vive FIJO en la barra derecha,
siempre abierto y abajo, con AGARRADERA propia (arranca compacto en 340px,
lo estirás como al timeline); el inspector (la config de la capa) ocupa
todo el resto con scroll — nada flota sobre el lienzo. La FUENTE en el
export a AE se fija primero por la API moderna de AE 24+ (`app.fonts`
busca la cara por FAMILIA visible + nombre de ESTILO y se asigna por
`fontObject`, probando primero el estilo EXACTO que el plugin v10 trae de
Figma —«Condensed Heavy»—) y solo si eso no está cae a la adivinanza
PostScript de siempre; los eases de keyframes usan las dimensiones REALES
de cada propiedad (Escala puede ser [x,y,z]: un array corto tiraba «Value
array does not have 3 elements» en AE 2026 y esos keyframes quedaban SIN
ease — de ahí «los blurs/movimientos no se sienten igual»). Un texto con
DIVISIÓN ahora viaja a AE como **TEXT ANIMATOR NATIVO** (ya no como
bloque): propiedades del estado corrido (Position/Opacity/Scale/Rotation/
Tracking/Blur desde el preset compilado) + Range Selector con Based On
según la división y el borde animado barriendo 0→100% (Start en entradas
—la selección se achica y cada unidad queda en reposo—, End en salidas),
con el escalonado como ventana total y el easing del segmento en el
selector; MUY editable (ajustás el stagger tocando el selector). Y la
**MÁSCARA del revelado VIAJA de verdad** (tanda 2 del export cerrada,
2026-08-31): revelar/ocultar y familia llegan a AE con una MASK real —
la caja de reposo del motor — con la regla de oro de que el viaje nunca
va en la Position de la capa (la mask viajaría con él): en texto lo
lleva el animator y la mask se mide en AE con sourceRectAtTime (fuente
real ya fijada, en un instante de reposo); un texto MULTILÍNEA se parte
en UNA CAPA POR RENGLÓN — el idioma clásico del motionero, porque las
masks de varios renglones en una capa se unen y un renglón se vería a
través de la caja del vecino — cada renglón con su ancla, su timing
corrido (división «líneas»: el delay EXACTO de su renglón, orden
centro/bordes/azar incluidos; caracteres/palabras: el `en` corre por las
unidades previas y el escalonado sigue vivo en su animator), sus tramos
de rich text re-indexados y el contador en el renglón de la cifra; en
forma/vector/trazo el viaje va en la Position del GRUPO de shapes (la
capa y su mask quietas) y la caja suma el margen del borde; y la mask
lleva la VENTANA del motor con hold keys — recorta solo mientras esconde
(la entrada hasta que su última unidad terminó, la salida desde que
arranca) y en reposo se agranda para no cortar descendentes; media con
revelado queda anotada (su encaje «cubrir» ya ocupa la mask del
footage). De paso, paridad exacta del viaje: el animator escalaba los dy
por interlineado donde el motor usa altoUnidad (nunca menos que 1.2× el
cuerpo) — con interlineado apretado el texto asomaba bajo la máscara.
Lo que sigue degradando CON AVISO: los overshoots internos del preset
(pop) barren directo, orden centro/bordes por caracteres/palabras queda
desde el inicio, y azar por caracteres/palabras multilínea se baraja POR
RENGLÓN (por líneas van todos exactos). La review adversarial (Sonnet,
según TOKENOMICS) cazó y se corrigió: el texto con TODOS los renglones
en blanco desaparecía del export (ahora cae al camino de siempre), el
azar por renglón degradaba sin aviso, con CONTADOR la mask se medía una
sola vez y podía quedar angosta en la salida (ahora se mide también al
arrancar la salida y el script toma la unión), y el alert final contaba
capas del modelo en vez de las realmente emitidas. Y los **estirados por
letra**
(`estirar_letras` del director: «estirá la O» — escala no uniforme por
rango de caracteres, la letra ancha EMPUJA a las demás, pintada desde la
baseline) viajan como Scale animator con el selector clavado en la letra.
El texto de Figma con ESTILOS MIXTOS (dos fuentes en
un título, un color por palabra) ya no se rasteriza NI pierde estilos: es
RICH TEXT real — el plugin exporta el estilo dominante como base más
«tramos» (corridas de fuente/peso/tamaño/color indexadas por carácter NO
BLANCO, así el re-wrap del import no las corre), y el motor pinta corrida
por corrida sobre la misma baseline, midiendo cada una con su propia
fuente — compatible con la división por caracteres/palabras/líneas y sus
escalonados. Editar el CONTENIDO del texto descarta los tramos (quedarían
indexados a otros caracteres): degradar, no romper.

## Qué NO hace (con motivo)

- **El plugin de Figma no corrió en Figma real todavía** (acá no hay
  Figma): el normalizador está testeado contra el IR (9 tests) y el flujo
  pegar→importar verificado en browser; el plugin es chico y defensivo,
  pero su primera corrida es de ustedes — cualquier nodo raro degrada a
  raster con aviso, nunca rompe.
- **El loop vivo del agente no corrió acá** (el sandbox no tiene
  `ANTHROPIC_API_KEY`): la capa de herramientas está 100% testeada (10
  tests + sabotaje del clamp) y la ruta responde bien sin key (503 legible)
  y con payload inválido (400). Primera corrida real: poner la key en
  `.env.local`.
- **El agente es el prototipo del área motion de Diosa**: cuando se
  integre, las 11 herramientas y el system prompt migran a tools del
  asistente real (§10.5) y este panel puede quedar o irse — las firmas ya
  son las que Diosa espera (ops puras sobre la composición).
- **Fuentes**: YA se cargan (Google Fonts o archivo); las licencias de las
  subidas las declara el usuario y la persistencia va al catálogo (P2).
- **La cámara es 2D** (paneo + zoom): sin rotación ni parallax 2.5D por
  capa (P2 del backlog). El modo grabación captura lo que hagas con el
  viewport; el zoom grabado es relativo al ancho de la composición.
- **Un shape CON relleno no se anima con trim** (no tiene equivalente fiel
  en canvas barato). Pero TODO lo solo-borde SÍ es trazo dibujable desde el
  plugin v11 (2026-08-31): vectores, LINEs, rects/elipses contorno,
  estrellas y booleans, rotados incluidos — antes solo VECTOR/LINE derechos
  calificaban y los contornos caían a capa vector, donde «trazar» no existe
  (visto en la ronda de Gabriel: sus recuadros no se dibujaban). OJO:
  re-copiar code.js y re-exportar la pantalla para que aplique.
- **Audio**: no hay pista de audio en esta versión.
- **El video de referencia vive solo en el navegador** (IndexedDB): no
  viaja entre máquinas hasta el catálogo de diosa (P2, como las fuentes).
  Su audio no suena (va mudo: la locución es el audio de proyecto).
- **Selección múltiple en el lienzo** (shift-click, marquee, Alt-duplica):
  la selección y el drag simples ya están; lo múltiple es P1.
- **Permisos reales**: `exigirEdicion(actor, composicionId)` es el único
  punto de entrada de mutación, listo para cablear (§2.3).

## Dependencias nuevas

- **`mp4-muxer` `^5.2.2`** — muxeo MP4 del export WebCodecs. Es exactamente
  la versión que diosa ya tiene (anexo E del kit): en la integración no es
  una dep nueva, es la misma. ~9 KB comprimido, cargada sólo por la page
  del módulo.
- **`@anthropic-ai/sdk`** — el loop del agente director (servidor
  solamente: la importa la ruta API, nunca entra al bundle del cliente).
  Si diosa ya la tiene para su asistente, es la misma dep.

Nada más: cero librerías de animación, canvas o UI.

## Variables de entorno

- **`ANTHROPIC_API_KEY`** (SECRETA) — la clave de la API de Claude para el
  agente director. Sin ella el módulo funciona entero salvo el chat, que
  avisa con un error legible (503).
- **`GEMINI_API_KEY`** (SECRETA, opcional) — la clave de Gemini: el
  director es multi-proveedor (mismo prompt-escuela y mismas herramientas
  por function calling). Con esta clave puesta y sin `MOTION_AGENTE_MODELO`
  el default pasa a `gemini-3.6-flash` (mucho más barato por pedido). A los
  Gemini que lo soportan (2.5+, 3.x) se les manda PENSAMIENTO DINÁMICO
  (`thinkingBudget: -1` — razona lo que el paso pida en vez del default
  conservador de Flash); si un modelo rechaza el thinkingConfig se apaga y
  se reintenta sin él.
- `MOTION_AGENTE_MODELO` (opcional) — modelo del agente y a la vez el
  selector de proveedor: `claude-*` → Anthropic, `gemini-*` → Gemini.
  Default: `gemini-3.6-flash` si hay GEMINI_API_KEY, si no
  `claude-opus-5`.
- `MOTION_REFERENCIA_MODELO` (opcional) — el ANALISTA de referencias
  (default `gemini-3.6-flash`): cuando adjuntás un VIDEO al chat del
  director, este modelo lo ve ENTERO por la API de Gemini (video nativo,
  muestreo denso a 10fps con degradación si el modelo no lo soporta) y
  destila la coreografía —línea de tiempo con timestamps, easings en
  nuestro vocabulario, staggers con Δt, cámara, mecanismos de kinetic
  type— que el director toma como lectura PRINCIPAL (los 8 frames quedan
  de apoyo visual). Necesita `GEMINI_API_KEY`; sin ella la referencia va
  solo por frames, avisado en el log. El archivo viaja inline si pesa
  ≤13MB (más pesado: solo frames); su costo entra al taxímetro como una
  línea propia del log («analista de referencia»).
- `MOTION_AGENTE_MODELO_FINO` (opcional) — el modelo del nivel «fino» del
  panel (default `claude-opus-5`). El panel del director tiene un selector
  rápido/fino: «rápido» usa el modelo económico de arriba, «fino» sube a
  este para el planteo creativo; la revisión visual y los retoques siguen
  yendo al barato aunque el planteo sea fino. Los tokens de RAZONAMIENTO
  de Gemini se muestran aparte en el log y la meta («pensó 12k tokens») —
  ya están incluidos en salida para el costo.

## Migración (SQL aditivo) + fragmento de schema

⚠️ No aplicada a ninguna base. Los nombres de las tablas referenciadas
(`user`, proyecto) se ajustan a los reales al integrar.

```sql
CREATE TABLE IF NOT EXISTS "motion_composicion" (
  "id"           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "ownerId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "proyectoId"   text REFERENCES "proyecto"("id") ON DELETE SET NULL,
  "nombre"       text NOT NULL,
  "contenido"    jsonb NOT NULL,          -- la composición serializada; rev ADENTRO (contenido->>'rev')
  "thumbnailUrl" text,
  "renderId"     text,                    -- id en el catálogo de media del último render
  "createdAt"    timestamp NOT NULL DEFAULT now(),
  "updatedAt"    timestamp NOT NULL DEFAULT now(),
  "createdBy"    text REFERENCES "user"("id") ON DELETE SET NULL,
  "updatedBy"    text REFERENCES "user"("id") ON DELETE SET NULL
);
```

```ts
export const motionComposicion = pgTable("motion_composicion", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: text("ownerId").notNull().references(() => user.id, { onDelete: "cascade" }),
  proyectoId: text("proyectoId").references(() => proyecto.id, { onDelete: "set null" }),
  nombre: text("nombre").notNull(),
  contenido: jsonb("contenido").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  renderId: text("renderId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().$onUpdate(() => new Date()),
  createdBy: text("createdBy").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updatedBy").references(() => user.id, { onDelete: "set null" }),
});
```

El `UPDATE` del guardado es condicional por rev, como los otros dos lienzos:
`WHERE id = :id AND coalesce((contenido->>'rev')::int, 0) = :baseRev`; ante
0 filas, fusionar con `fusionarComposiciones` (pura) y reintentar una vez.

## Tests y sabotajes

- `npm test` → `node --import tsx --test tests/motion/*.test.ts` — **322
  tests, 0 fallos**, sin base ni secretos. Fixture completo en
  `tests/motion/fixtures/composicion-ejemplo.json`; los de
  trazos/revelado/cámara en `tests/motion/trazo-revelar-camara.test.ts`;
  los del script de After Effects (conversión de easings, ancla de texto
  multilínea, cámara, temblor, master multi-escena, escapado ASCII,
  determinismo byte a byte) en `tests/motion/exportar-ae.test.ts`; los de
  la máscara del revelado en AE (ventanas, partición por renglón,
  re-indexado de tramos, grupo de shapes) en
  `tests/motion/revelado-ae.test.ts`.
- **Sabotajes vistos en rojo** (§2.5): (1) `interpolar` ignorando el easing
  del tramo → falló exactamente «el easing del tramo lo declara el keyframe
  de SALIDA»; (2) gate del motion blur apagado en `evaluar-puro` → falló
  exactamente «el motion blur sintetizado es >0 durante el movimiento…» (que
  además lleva su control positivo); (3) regla de un-solo-ganador del
  snapping invertida → falló exactamente «UN solo ganador por eje — gana la
  distancia mínima». (4) clamp del agente sin efecto → fallaron los tests de clampeo. (5) ventana del recorte del revelado siempre activa →
  fallaron exactamente los tres tests de la ventana (reposo sin recorte,
  salida recortando, clip en pintar). (6) conversión de opacidad del script
  de AE sin el ×100 → falló exactamente «opacidad va 0-1 → 0-100».
  (7) gate de «solo diseño» de la cámara apagado → falló exactamente «sin
  precomp de camara». (8) límite de escenaEnPunto invertido (<=) → falló
  exactamente «el límite exacto pertenece a la escena SIGUIENTE». (9) xor
  final del crc32 corrido en un bit → falló exactamente «crc32 da el valor
  canónico de referencia». (10) fin nulo de oracionesDeTrozos dejando 0 en
  vez del fin del audio → falló exactamente «fin nulo hereda el fin del
  audio». (11) destino de quitarEscena siempre la primera → primero NO cayó
  (los casos coincidían con la regla rota: se agregó el caso «borrar la
  última») y con el caso nuevo falló exacto. (12) escalonado sin escalar en el
  time-stretch grupal → falló exactamente «escala inicios, duraciones,
  keyframes y escalonado». (13) OTTO detectado como ttf en
  extensionDeFuente → falló exacto; (14) tracking sin redondear → falló
  exactamente «el tracking de AE sale ENTERO». (15) filasDeCapas ignorando subgrupo →
  fallaron exactamente los dos tests de plegado y precomp. (16) canal de
  posición ausente del horneado → falló exacto. (17) mínimo de medio
  segundo del recorte quitado → falló exacto. (18) gate de resortes de
  `esSegmentoRalo` quitado (resortes saliendo como keyframes ralos) →
  falló exactamente «presets con overshoot en la pista (pop) y resortes
  van HORNEADOS densos». (19) el catch de ease volviendo a concatenar el
  Error nativo con «+» → falló exactamente «los avisos técnicos no
  concatenan el Error nativo». (20) rangoRealDeTramo contando también los
  blancos → fallaron exactamente los dos tests de tramos. (21) flag
  cubrir/contener invertido en la emisión del encaje → primero NO cayó
  (el test usaba la misma caja para ambos ajustes y no distinguía cuál
  era cuál: test débil); endurecido con cajas distintas, cayó exacto.
  (22) barajado de «azar» apagado en delaysEscalonado → falló exactamente
  «barajado DETERMINISTA que cubre todos los rangos». (23) elastico/pique/
  escalones quitados de EASINGS_NO_RALOS (saliendo como keyframes ralos a
  AE) → falló exacto el test de horneado denso. (24) corte por pausa de
  oracionesDePalabras quitado y (25) puntuación de cierre sin comillas →
  cayó exacto el test del agrupador en ambos. (26) poda de limpiarPalabras
  apagada → falló exactamente «poda los LOOPS de whisper». (27) chequeo
  del sello del plugin sin efecto → falló exacto (y el mismo test ata el
  VERSION_PLUGIN de code.js al PLUGIN_ESPERADO del import: no divergen en
  silencio). (28) reorden de moverPalabraLista quitado (el fix del chip
  inagarrable) → falló exactamente «el array queda en orden temporal».
  (29) el ÷2 de framesDeEncoder quitado (el parche del alineador) → falló
  exacto el test del bug medido. (30) tangentes de ruta-puro dejadas
  ABSOLUTAS (sin restar el vértice) → cayeron exactos los tests del parser
  Y el end-to-end del export del trazo. (31) filtro de familia de
  paresPorCategoria apagado (tracking ofrecido para gráficas) → falló
  exacto el test del filtrado. (32) ventana de la mask sin el escalonado
  de la entrada → falló exactamente «la entrada recorta hasta que su
  ULTIMA unidad terminó». (33) corrimiento del `en` por unidades previas
  quitado de capasPorLinea → falló exactamente «el en corre por las
  unidades previas». (34) escalaDy del animator de vuelta a interlineado
  (el bug de paridad con altoUnidad) → fallaron exactos los dos tests del
  viaje 1.1× altoUnidad. (35) sinCapasReferencia sin filtrar → cayeron
  exactos el test del filtro y el del .jsx sin video. (36) guard del
  director sobre el video de referencia apagado → falló exacto «se
  rechaza con guía». (37) el muestreo de referencia llegando al final
  exacto del video → falló exactamente «termina ANTES del final». (38)
  armarPrimerUsuario ignorando el contexto de referencias → falló exacto
  el test del primer turno. (39) mimeParaGemini dejando pasar quicktime
  sin traducir → falló exacto. (40) el fps del muestreo denso quitado de
  partesDeVideo → falló exacto. Restaurados, todos verdes. El video de referencia
  además se verificó END-TO-END en Chromium real (Playwright: webm
  generado en la página → subido por el botón → capa al fondo con chip
  REF → el canvas pinta el FRAME del video, pixel verificado → el archivo
  persiste en IndexedDB tras recargar). La tanda de UX del timeline (teclado del modal de recorte,
  imán shift, Alt-dup, drag de palabra, Efectos plegable) se verificó por
  Playwright end-to-end (verificar32/33) — sus checks mostraron rojo
  GENUINO durante el desarrollo (el imán con alcance corto, el carril
  desalineado de la onda) antes de quedar verdes: discriminan; el modal
  «Palabras» cerró con verificar36 (16/16: mover con reorden y re-mover,
  renombrar, agregar, Supr+Ctrl-Z, Guardar persiste tras recarga, Escape
  no persiste).

## Qué necesita cablearse de su lado

1. `exigirEdicion` + `actorDeSesion` → permisos/sesión reales (§2.3).
2. `consultas.ts`: reemplazar el Map en memoria por `motion_composicion`
   (las firmas y el protocolo CAS+merge quedan).
3. La page: gate `puedeVerModulo("motion")` + carga desde la base (hoy abre
   la demo).
4. Registro del módulo en `src/modules.ts` e ítem de navegación.
5. `t()`: swap del stub por el real + zona `motion.ts` del diccionario.
6. Íconos: fusionar los conceptos usados (todos ya existen en el registro);
   `src/components/icons.tsx` local es andamiaje y se borra.
7. Dobles de `ui/` (`BotonIcono`, `ConPista`) → piezas reales, mismo uso.
8. Capas media: resolver `mediaId` contra el catálogo (el motor recibe un
   `imagenDe(mediaId)` inyectado; hoy pinta placeholder).
9. Video de referencia: subir el archivo al catálogo para que viaje entre
   máquinas (hoy IndexedDB local; `video-guardado.ts` es la interfaz que
   queda, `olvidarVideo` incluido para la limpieza).

## Qué probé a ojo

- Chrome (Chromium 140, Linux) en **claro y oscuro**: chrome de UI cambia
  con los tokens, el lienzo repinta el fondo al cambiar la clase de `<html>`
  (MutationObserver §3.5). El contenido de la composición no cambia con el
  tema (es contenido).
- **Teléfono** (390×844 emulado): la vista no desborda horizontalmente; el
  lienzo se ve y panea; el editor completo es de escritorio (precedente
  AdiosJam: en teléfono, visor) — captura en la entrega.
- Scrub frame a frame, espacio para play/pausa, ⌘0 / ⇧1, flechas, undo con
  ⌘Z (visibilidad, drags de spans y keyframes verificados con capturas
  antes/después: dos gestos, dos pasos de undo).
- Timeline redimensionable con la agarradera; drag de span de entrada y de
  un keyframe con snap al frame, verificados en Chromium.
- No probado: Safari/Firefox, iOS real, `prefers-reduced-motion` a ojo (la
  UI usa las clases del kit que ya lo respetan; el preview reproduce igual
  por regla §4.1).

## Números medidos

- **Preview** (demo: 3 capas, texto dividido en 6+5 unidades, blur activo),
  build de producción, Chromium headless **sin GPU** (swiftshader):
  p50 **16,7 ms** (60 fps), p95 100 ms, jank 18,9 %. El p95 alto es el
  `ctx.filter: blur(…)` por unidad en CPU: en headless sin GPU el blur no
  compositea. Backlog P1: cachear el pintado desenfocado por capa. Falta
  medir con GPU real (el kit reporta la misma divergencia en sus curvas).
- **Export MP4** (demo 5s @30fps, 1920×1080, supersampling 4×), Chromium
  headless **sin GPU ni H.264** (cayó a VP9 software): 150 frames en 104 s.
  El archivo decodifica exacto: 5.000 s, 1920×1080, contenido verificado
  muestreando un frame. Con Chrome real (GPU + H.264 por hardware) el
  tiempo baja fuerte; falta medirlo.
- **Peso de la page `/motion`**: build estático limpio; First Load JS de la
  ruta según `next build`: ~121 kB compartidos + el chunk propio (ver
  `next build`). Nada del motor entra al shell compartido (imports sólo
  desde la page/componentes del módulo).

## Checklist §2.10

- [x] `npx tsc --noEmit` → 0 errores (strict)
- [x] `npx eslint src tests` → 0 errores
- [x] tests en verde con dos sabotajes vistos en rojo
- [x] sin controles nativos fuera de `ui/` · sin SVG inline en
      `components/motion` · sin hex en el JSX del módulo (los colores del
      canvas leen tokens; los de capas son contenido)
- [x] todo texto de UI en castellano y envuelto en `t()`
- [x] sin `localStorage` de estado (sólo la clase de tema, patrón de la casa)
- [x] ningún `"use client"` importa valores de `consultas.ts`
      (la frontera es el server action)
- [x] sin `title=` nativo · sin `z-index` ≥ 9000
- [x] probado en claro y oscuro, escritorio y teléfono emulado
- [x] README del módulo arranca con «## Norte (goles)»
