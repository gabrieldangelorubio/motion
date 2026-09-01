# FORK GSAP — el motor al servicio del vuelo

> Decisión de Gabriel, 2026-09-01. La versión anterior quedó congelada en la
> rama **`ae-estable`** (`16a368d`, 324 tests): ahí vive el módulo con export
> completo a After Effects por keyframes (.jsx). Esta rama es el fork.

## La decisión

Hasta acá el módulo cargaba una restricción invisible: **todo lo que se
animaba tenía que poder representarse en keyframes de AE**. Eso definía qué
easings existían, cómo se horneaban los resortes, qué presets valían la pena.
El fork la elimina:

- **Prioridad: calidad, creatividad, vuelo y dinamismo de la animación** — no
  la representabilidad en AE.
- **Toda la animación se corrige en la plataforma**, con el motor de GSAP.
  Ningún keyframe se retoca en AE.
- **AE queda solo para ensamblar**: unir las pantallas, los movimientos de
  cámara ENTRE ellas, el conform final. Recibe **secuencias PNG con canal
  alfa** (ya existentes: `exportarPngSecuencia`, zip de frames con lienzo
  transparente), nunca keyframes.
- El export `.jsx` de AE queda como **legado**: funciona, no se desarrolla
  más. Un easing GSAP que le llegue se hornea denso (muestrea la curva real),
  así ni el legado miente.

## La arquitectura: GSAP ES el motor

**La línea de tiempo de una composición ES un `gsap.timeline` de verdad**
(tanda G2, `motor-gsap.ts`): cada pista de keyframes se compila a tweens
`fromTo` con sus eases, cada segmento de entrada/salida a un tween de
progreso por unidad (escalonado incluido), todo sobre PROXIES de valores —
GSAP nunca toca el DOM. `estadoVivo(comp, t)` seekea el timeline pausado
(`tl.time` es determinista: mismo t → mismo estado, en cualquier orden —
verificado en Node y con tests de seek desordenado) y arma el estado con el
MISMO ensamblador de `evaluar-puro` (offsets de presets, máscaras, motion
blur, cámara): un solo cuerpo de código, nada puede divergir. El canvas
pinta lo que GSAP resolvió — preview, MP4 y secuencia PNG ven exactamente
el mismo frame, y los PNG pixel-perfect salen de regalo, no de restricción.

Preview, export MP4 y secuencia PNG corren sobre `estadoVivo`. El evaluador
clásico queda como REFERENCIA DE PARIDAD (los tests comparan ambos motores
sobre una composición que pisa todos los caminos; tolerancia = el redondeo
a 6 decimales de GSAP ≈ 1e-4 px, invisible) y como camino del `.jsx`
legado. Por qué proxies y no GSAP-sobre-DOM: el entregable son frames con
alfa pixel-perfect, y capturar DOM por frame es lento y aproximado; con
proxies GSAP es dueño del tiempo, los tweens, los eases y el scheduling —
lo que crece en G3 (solapamiento, labels, timeScale, timelines anidados) —
y el render sigue siendo nuestro pintor determinista.

- `easings-gsap.ts` — el puente de curvas: `gsap.parseEase` + CustomEase
  como funciones puras t∈[0,1]→p, cacheadas y SONDEADAS (specs degenerados
  degradan a suave). El motion blur sintetizado (derivada) las come igual.
- Determinismo intacto: los eases de GSAP son cerrados. **RoughEase queda
  prohibido** (genera sus puntos con random al crearse: preview y export de
  sesiones distintas verían curvas distintas). El timeline vive HUÉRFANO
  (paused + fuera del globalTimeline): nadie lo tickea, y el cache por
  identidad de la composición (WeakMap) se limpia solo con cada edición.

## Qué ya entrega el fork (tanda G1, 2026-09-01)

- **Cualquier ease de GSAP, en todo el sistema** — segmentos de entrada/
  salida, keyframes crudos, cámara: `back.out(N)` con el overshoot a medida,
  `elastic.out(amplitud,periodo)`, `bounce.out/in`, `steps(N)`, y curvas
  propias dibujadas como path SVG (`M0,0 C0.2,0 0.1,1 1,1`) vía CustomEase.
- **Selector de easing** con sección «GSAP paramétricos» (curvas a la vista)
  y campo libre con validación en vivo para tipear cualquier spec.
- **El director** los conoce: sus tools validan cualquier spec GSAP real y
  el system prompt le enseña a usar los paramétricos para replicar el
  carácter fino de una referencia (el rebote exacto, no «el preset parecido»).
- Modelo: `EasingSpec = NombreEasing | string` — el JSON guarda el spec tal
  cual; un spec roto degrada a `suave` sin romper el preview.
- GSAP es gratuito también para uso comercial (desde que Webflow lo liberó
  en 2025, plugins incluidos) — sin tema de licencias.

## Roadmap del fork

- **G2 — GSAP es el motor**: HECHO (2026-09-01) — ver arriba.
- **G2b — presets con vuelo**: presets nuevos imposibles en AE-keyframes
  (overshoot paramétrico por preset, wiggle determinista por capa, física de
  caída/impulso), y parámetros de preset expuestos como diales.
- **G3 — timeline pro**: más de un segmento por capa (énfasis en el medio,
  no solo entrada/salida), solapamiento entre segmentos, labels y bloques
  con timeScale — la línea de tiempo como la de GSAP.
- **G4 — motion paths**: mover capas por curvas bezier dibujadas EN el
  lienzo (MotionPath sobre las pistas x/y).
- **G5 — pipeline PNG→AE fino**: naming de secuencias por pantalla, guías
  para los movimientos de cámara entre pantallas, marcadores de tiempo.
- **Editor visual de curvas** (CustomEase dibujable en el selector) cuando
  el campo libre quede corto.

## Reglas que NO cambian

- Cada frame sigue siendo función pura de `(composición, t)`.
- El modelo JSON solo agrega, nunca rompe (un doc de `ae-estable` abre acá).
- TOKENOMICS: Fable diseña y escribe el código crítico, Sonnet revisa
  adversarialmente, los scripts verifican antes que los modelos.
