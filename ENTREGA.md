# ENTREGA — módulo motion (estado al 2026-08-26)

> Contrato: `docs/kit-diosa-2026-08-26.md` (copia del kit recibido, sello `main=9a8e79ce`).

## Qué hace (hoy)

Motor puro de motion graphics (`lib/motion`): composición JSON versionada →
`estadoEn(comp, t)` → `pintar(estado, ctx)` determinista sobre canvas 2D.
Presets de entrada/salida con escalonado por caracteres/palabras, easings con
nombre (incl. resortes), pistas crudas de keyframes con hold, motion blur
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
escalonado — cada campo con checkpoint por sesión de foco), **selección MÚLTIPLE y
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
vive bajo el de capas ocupando la mitad inferior de esa columna, con chip
in/out por carta; panel con todos los presets: cada carta corre el MOTOR REAL sobre una
plantilla en un mini canvas — hover lo anima en bucle, quieto muestra el
reposo; nunca un video grabado que envejece —; tocarla aplica el efecto a
la capa seleccionada reemplazando su entrada o salida según la clase y
CONSERVANDO el timing existente; los efectos de trazo avisan si la capa no
es un trazo; el panel vive SIEMPRE abierto — sin botón de toggle ni de
cerrar — y los controles de calidad y vista viven abajo a la izquierda
del lienzo), **texto multilínea con revelado enmascarado** (`\n` real con interlineado
propio, división por caracteres/palabras/**líneas**, presets
`revelar`/`ocultar`: cada unidad sube dentro de su renglón recortada a su
caja de reposo — el clásico reveal de SplitText con máscara, sin crear
máscaras a mano; el recorte se apaga en reposo para no cortar descendentes;
y dividir SIEMPRE se ve: activar una división en el inspector, por el agente
o al aplicar un efecto de la biblioteca pone un escalonado sano por división
—35/90/140 ms para caracteres/palabras/líneas— en los segmentos que no
traían uno, porque división con escalonado 0 anima el texto como un bloque
entero; un escalonado puesto a mano, incluso 0 explícito, siempre manda),
**capas de trazo con trim estilo AE** (vectores de Figma con stroke y sin
fill llegan como path animable; presets `trazar`/`retraer`/`borrar` y
propiedades `trazoInicio`/`trazoFin` 0–1 keyframeables — implementado con
`setLineDash`/`lineDashOffset` sobre el largo real medido al importar, y un
trazo sin medir degrada a entero), **el paradigma canvas + cámara** (el lienzo es
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
posición); la cámara además tiene TEMBLOR procedural — presets handheld /
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
director de motion** (ruta `/api/motion/agente`: loop agéntico
con la API de Claude sobre 13 herramientas incrementales validadas y
clampeadas — incluye `definir_camara`/`quitar_camara` y los trims — panel
de chat que aplica cada respuesta como UN paso de undo y
muestra las ops), y **export a MP4 frame-exacto** (WebCodecs + `mp4-muxer`, decisión aprobada por Fran
2026-08-26): la misma `pintar()` del preview frame a frame, H.264 con
fallback a VP9-en-MP4 (Chromium sin codecs propietarios), **supersampling
temporal 4×** para motion blur real (media móvil exacta sobre frames
opacos), **supersampling ESPACIAL 2×** para antialiasing real (cada frame
se pinta a doble resolución y baja con smoothing de alta calidad — los
bordes diagonales de un display grande dejan de escalonar; los radios de
`ctx.filter` se compensan porque van en px de dispositivo, verificado por
MSE contra un ground truth 4×), back-pressure del encoder y progreso en
vivo. El editor arranca PARADO en 0 (sin autoplay) y con la línea de
tiempo alta (340px). El chat del agente vive FIJO en la barra derecha,
siempre abierto y abajo, con AGARRADERA propia (arranca compacto en 340px,
lo estirás como al timeline); el inspector (la config de la capa) ocupa
todo el resto con scroll — nada flota sobre el lienzo. El texto de Figma con ESTILOS MIXTOS (dos fuentes en
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
- **Vectores de Figma con fill** siguen rasterizando: sólo stroke-sin-fill
  se vuelve trazo animable (es el caso «línea decorativa»; un shape relleno
  animado con trim no tiene equivalente fiel en canvas barato).
- **Audio**: no hay pista de audio en esta versión.
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
- `MOTION_AGENTE_MODELO` (opcional) — modelo del agente; default
  `claude-opus-5`.

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

- `npm test` → `node --import tsx --test tests/motion/*.test.ts` — **102
  tests, 0 fallos**, sin base ni secretos. Fixture completo en
  `tests/motion/fixtures/composicion-ejemplo.json`; los de
  trazos/revelado/cámara en `tests/motion/trazo-revelar-camara.test.ts`.
- **Sabotajes vistos en rojo** (§2.5): (1) `interpolar` ignorando el easing
  del tramo → falló exactamente «el easing del tramo lo declara el keyframe
  de SALIDA»; (2) gate del motion blur apagado en `evaluar-puro` → falló
  exactamente «el motion blur sintetizado es >0 durante el movimiento…» (que
  además lleva su control positivo); (3) regla de un-solo-ganador del
  snapping invertida → falló exactamente «UN solo ganador por eje — gana la
  distancia mínima». (4) clamp del agente sin efecto → fallaron los tests de clampeo. (5) ventana del recorte del revelado siempre activa →
  fallaron exactamente los tres tests de la ventana (reposo sin recorte,
  salida recortando, clip en pintar). Restaurados, 102/102 verdes.

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
