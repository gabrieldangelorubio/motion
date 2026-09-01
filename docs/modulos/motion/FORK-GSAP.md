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

## La arquitectura (por qué NO tiramos el motor canvas)

GSAP acá **no anima el DOM: presta su motor**. El lienzo canvas determinista
—`estadoEn(comp, t)` → `pintar(estado, ctx)`, mismo frame siempre— es
exactamente lo que una secuencia PNG con alfa necesita: seek exacto por
frame, pixel-perfect, sin depender de captura de DOM. Lo que cambia es de
dónde salen las **curvas y el tiempo**:

- `easings-gsap.ts` — el puente: `gsap.parseEase` + CustomEase entregan
  funciones puras t∈[0,1]→p, cacheadas. Entran al motor por `easing()` sin
  tocar `evaluar-puro`. El motion blur sintetizado (derivada) las come igual.
- Determinismo intacto: los eases de GSAP son cerrados. **RoughEase queda
  prohibido** (genera sus puntos con random al crearse: preview y export de
  sesiones distintas verían curvas distintas).

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

- **G2 — presets con vuelo**: presets nuevos imposibles en AE-keyframes
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
