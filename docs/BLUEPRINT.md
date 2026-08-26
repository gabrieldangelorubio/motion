# Blueprint — plataforma de motion para case studies

> Estado: v1 — research completo integrado (ver docs/research-*.md).

## Visión

Reemplazar el 100% del motion de un case study de adiós adiós con una sola
aplicación:

```
Figma (diseño) → Ingest → Scene Graph → Editor (preview + chat IA + manual)
                                              ↓
                              Export video  ·  Export After Effects
```

- **Entra**: un archivo de Figma con las capas del case study.
- **Se trabaja**: dirigiendo por chat ("que el título entre con más energía,
  la grilla se reordene y la cámara haga push-in al mockup"), y afinando a
  mano con timeline y panel de propiedades.
- **Sale**: video final renderizado, o las capas + keyframes a After Effects
  para el pulido manual definitivo.

Alcance de motion: títulos/kinetic type (gran parte), media enmarcada en
distintos formatos (mockups de dispositivos, paneles, grillas que se
reorganizan), movimientos de cámara 2.5D, texturas (grain, ruido), efectos de
luz/color, transiciones entre secciones, loops de fondo, contadores.

## Decisión de motor: GSAP sobre DOM/CSS

Cambio respecto a v1 (WAAPI puro): **GSAP pasa a ser el motor de timeline**.
Licencia confirmada (docs/research-ia-y-gsap.md): GSAP es 100% gratis desde
abril 2025, todos los plugins incluidos, uso comercial permitido. Única
cláusula a vigilar: no ofrecer a terceros una herramienta no-code de
animación visual que compita con Webflow — uso interno no la toca; si algún
día se comercializa la plataforma, re-evaluar.

Qué nos da GSAP que WAAPI no:
- Timeline maestro anidable con labels, `seek()`, `timeScale()`, `progress()`
  — misma determinismo-por-reloj-virtual que la regla #1 exige.
- SplitText (splitting profesional con re-split responsivo y a11y).
- Flip (reordenamientos de grillas/media con FLIP automático).
- MotionPath (trayectorias), MorphSVG (morphs de vectores/logos), DrawSVG.
- Easings arbitrarios (CustomEase) y `getVelocity` para el motion blur.

Qué conservamos de v1:
- La regla frame = f(escena, t): GSAP timeline pausado, un reloj escribe
  `progress` — el patrón no cambia, cambia el backend.
- El motor de motion blur por velocidad (se alimenta de GSAP en vez de la
  derivada del easing token).
- Los presets como datos y el contrato de identidad.
- El schema v1 se migra a v2 con un conversor (v1 queda congelado y soportado).

## Módulos

### M1 — Scene Graph v2 (el corazón)

Evolución del JSON v1 a un scene graph completo:

```jsonc
{
  "version": 2,
  "canvas": { "width": 1920, "height": 1080, "fps": 30, "bg": "..." },
  "assets": { "img_hero": { "type": "image", "src": "assets/hero.png" }, ... },
  "layers": [
    { "id": "cam", "type": "camera", "tracks": { "x": [...], "y": [...], "zoom": [...] } },
    { "id": "grp_intro", "type": "group", "children": [ ... ] },
    { "id": "title", "type": "text", "text": "...", "style": {...},
      "in": { "preset": "rise", ... },            // capa de presets (se mantiene)
      "tracks": { "opacity": [ {"t": 0, "v": 0, "ease": "out-expo"}, ... ] }  // tracks crudos debajo
    },
    { "id": "mock1", "type": "media", "asset": "img_hero",
      "frame": { "kind": "device-iphone", "fit": "cover" } },
    { "id": "grain", "type": "texture", "kind": "grain", "opacity": 0.12 }
  ],
  "sections": [ { "name": "intro", "at": 0 }, { "name": "problema", "at": 4200 } ]
}
```

Principios:
- **Presets encima, tracks debajo** (patrón Jitter): un preset compila a
  tracks; el usuario o la IA pueden bajar al track crudo cuando hace falta.
- Jerarquía real (groups = precomps futuras en AE).
- La cámara es un layer con tracks; el render la aplica como transform
  inverso del contenedor mundo (rig 2.5D con perspective).
- Todo id es estable: es el ancla para el chat IA, la UI y el export AE.

### M2 — Ingest de Figma  ✅ validado (docs/research-figma-ingest.md)

- **Plugin de Figma** (no REST: el plugin da vectorNetwork completo, fuentes
  enumeradas, selección como scope y cero rate limits). Patrón copy/paste al
  estilo Jitter/Fable, o POST local.
- Normalizador con **IR intermedio** (patrón FigmaToCode): Figma tree → IR →
  Scene Graph v2, con warnings de conversión visibles.
- Mapeo por nodo: texto → HTML real con spans por run de estilo (la mayor
  ganancia de fidelidad); vectores → SVG inline por nodo; rects simples →
  divs con CSS; imágenes → raster 2–4×; lo no expresable en CSS →
  **raster por-nodo con flag "flattened"** (nunca all-or-nothing).
- Fuentes: match Google Fonts; sin match → flag explícito + upload/sustituto
  elegido por el usuario. Nunca sustitución silenciosa.
- Transforms: siempre `relativeTransform` (nunca absoluteBoundingBox),
  rotación con origin top-left, matriz row→column-major. Checklist completo
  en el doc de research.
- A monitorear: **Figma Motion** (keyframes nativos de Figma, beta 2026) —
  cuando la API los exponga, importaremos también intención de animación.

### M3 — Motor de render (DOM/CSS + GSAP)

- Un `gsap.timeline({ paused: true })` maestro; secciones como labels.
- Renderer por tipo de layer: text (HTML), vector (SVG inline), media
  (img/video; video con `currentTime` esclavo del reloj maestro), device
  frames (SVG/CSS), texturas (feTurbulence/overlays con blend modes),
  cámara (transform inverso del mundo).
- Motion blur direccional por velocidad (heredado de v1, fuente GSAP).
- Efectos: máscaras/clip-path, gradientes animados vía @property,
  glows/duotone con filter y blend modes. Taxonomía completa de 12
  categorías (títulos, mockups, grillas Flip, cámara 2.5D, grain
  feTurbulence, transiciones, contadores, logos DrawSVG/MorphSVG, loops) con
  técnica y dificultad por elemento: docs/research-vocabulario-motion.md.
  Regla de escala: DOM/CSS aguanta ~1000 elementos animados; WebGL solo si
  hiciera falta 3D real o >10k partículas (hasta ahora, nada lo exige).

### M4 — Asistente IA (chatbox)  ✅ validado (docs/research-ia-y-gsap.md)

Validado contra el SOTA (LottieFiles Motion Copilot, motion.so, Framer
Agents, papers SceneCraft/MapStory/AI Prototyper):
- Claude API con **tool calling sobre operaciones del scene graph**, nunca
  regeneración total: `applyPreset`, `setTrack`, `retime`, `addLayer`,
  `groupLayers`, `setCamera`, `reorderSection`… Ops incrementales
  validadas contra el schema antes de tocar estado.
- **Retrieval en dos pasos** en escenas grandes: elegir nodos/presets
  relevantes primero, instanciar parámetros después (evita referencias a
  layers inexistentes).
- **Validación semántica** además de schema: loop render + verificación
  (captura de frame) al estilo SceneCraft — nuestro render determinístico lo
  hace barato.
- **Mismo undo stack** que las ediciones manuales; **mostrar el diff** de
  cada edición mientras ocurre; **no resolver ambigüedad en silencio**;
  **clampear números del LLM** a rangos sanos y tokens de diseño (la falla
  típica es alucinación numérica, no estructural).
- Dos niveles de dirección: "moods" acotados (editorial/enérgico/sobrio…) →
  familias de presets/easings (patrón Jitter); y bajo nivel ("el logo entra
  a los 2.3s con spring suave").
- Tokenomics: ops mecánicas → modelo económico; dirección creativa → modelo
  grande.

### M5 — Controles manuales

- Timeline UI: layers como filas, keyframes/spans como chips (convención AE),
  drag para retimear, doble click para editar easing.
- Panel de propiedades por layer + los overrides globales de v1 (velocidad,
  stagger, blur, easing global).
- Todo lo que la IA hace es visible y editable acá (misma fuente de verdad).

### M6 — Export video

(Plan ya investigado, docs/research-tecnicas-css.md §7): headless Chrome +
CDP `HeadlessExperimental.beginFrame` + `--deterministic-mode` + WebCodecs;
supersampling temporal para motion blur AE-grade. GSAP hace esto más simple
aún: `timeline.progress(frame / totalFrames)` por frame.

### M7 — Export After Effects  ✅ validado (docs/research-ae-export.md)

Dato clave del research: AEUX **no transfiere keyframes** (solo capas
estáticas) y está archivado — sirve de referencia de patrón, no de base.
Pipeline en tres etapas de madurez:
1. **MVP: `.jsx` generado por export** ("File > Scripts > Run Script") —
   comps, layers, precomps para groups, keyframes vía `setValueAtTime`,
   easing vía `KeyframeEase(speed, influence)` (conversión desde
   cubic-bezier) y **bake denso** para springs/curvas sampleadas. Cámara
   2.5D → AE camera con keyframes de Position/Zoom, mapeo 1:1.
2. **Export Lottie en paralelo** (gratis de mantener): el plugin de
   LottieFiles importa Lottie a AE como capas editables, y el easing de
   Lottie es cubic-bezier normalizado — match exacto con nuestras curvas.
3. **Panel CEP residente** con importador JSON genérico (el patrón de
   Overlord/Bodymovin) cuando el volumen lo justifique. Core separado del
   shell CEP para portar a UXP cuando Adobe lo lance para AE.

### M8 — Referencias (imitar una animación de referencia)  ✅ validado (docs/research-referencias.md)

Requisito: poder cargar una referencia (video/GIF/URL de una animación que
nos gusta), que el sistema **lea** esa animación y la **replique como escena
editable de nuestro sistema** — presets + tracks + tokens — para retocarla
con los controles manuales. Nunca un clon opaco.

Hallazgo del research: **nadie en el mercado combina medición CV con lectura
semántica** — AnimSpec y similares son VLM-only (el modelo estima timing y
easing "a ojo", poco confiable). Nuestro diseño de dos etapas supera al
estado del arte comercial usando piezas maduras:

1. **Extracción mecánica** (medición, sin LLM): ffmpeg (frames densos) →
   SAM2 en modo video para segmentar capas (seed por click; UI de bordes
   duros es su caso fácil) → CoTracker3 para trayectorias por capa (x, y,
   escala, rotación, opacidad) → **fit de easing** por nonlinear least
   squares (cubic-bezier y resorte en paralelo, gana el de menor residuo,
   snap a token si el residuo es bajo) → **staggers medidos** por clustering
   de onsets (Δt real). El fit de easing no existe como librería publicada:
   lo construimos nosotros (scipy curve_fit) — es el gap del espacio.
2. **Lectura semántica** (visión de Claude): la VLM **nunca extrae números**
   (límite documentado de los VLM: frames como snapshots, sin identidad de
   objetos, timing degradado). Recibe las curvas medidas como contexto y
   hace solo lo cualitativo: nombrar capas, clasificar contra nuestro
   vocabulario de presets, marcar mis-tracks para revisión, describir la
   intención compositiva. Técnicas: grillas de frames etiquetadas +
   onion-skin/diff.
3. **Auto-verificación**: predicados espacio-temporales estilo MoVer
   (SIGGRAPH 2025) — "B empieza Δt después de A" — chequeados contra el
   render replicado antes de mostrar el resultado.

Límite conocido: timing per-carácter de kinetic typography no es extraíble
hoy (gap del campo entero) → híbrido: timing global medido + preset
clasificado por VLM + stagger paramétrico nuestro que el usuario ajusta.

Doble output:
- **Escena editable** en Scene Graph v2 con nuestro contenido (el texto/media
  del case propio, no el de la referencia) animado como la referencia.
- **Style profile reutilizable**: JSON de decisiones (familia de easings,
  rangos de duración, staggers, dirección, moods) aplicable a cualquier otra
  escena — "animá este case como la referencia X". Es el puente directo a la
  automatización (F9): una librería de perfiles de estilo propia.

Principios:
- Todo lo extraído se **snapea a tokens** — mejor "cerca y editable" que
  "exacto y opaco".
- **Confianza por elemento**: lo que el tracking no resolvió queda marcado
  para ajuste manual, nunca inventado en silencio.
- **Verificación lado a lado**: render sincronizado referencia vs réplica
  para iterar (el render determinístico lo hace barato).
- Uso como referencia de estudio/estilo interno; no reproducir assets ni
  marca ajenos en piezas finales.

## Fases

| Fase | Entregable | Depende de |
|---|---|---|
| F0 ✅ | Motor de títulos v1 (WAAPI) | — |
| F1 | Scene Graph v2 + GSAP como backend + migrador v1→v2 | — |
| F2 | Timeline UI + panel de propiedades | F1 |
| F3 | Ingest Figma (plugin + normalizador) | F1 |
| F4 | Media, cámara 2.5D, texturas, device frames | F1 |
| F5 | Chat IA con edit ops | F1 (mejor con F2) |
| F6 | Export video | F1 |
| F7 | Export After Effects | F1, F3 |
| F8 | Referencias: video → escena editable + style profile | F1, F5 |
| F9 | Automatización (case study completo semi-automático) | todo; F8 la potencia |

Orden sugerido de construcción: F1 → F2 → F4 → F3 → F5 → F6 → F7 → F8 → F9.
(F4 antes que F3 para que el ingest tenga tipos de layer donde aterrizar.)

## Riesgos principales

1. **Fidelidad Figma → DOM**: blend modes, efectos y auto-layout con
   esquinas raras. Mitigación: rasterizar lo infiel como imagen por nodo
   (siempre hay fallback visual correcto).
2. **Fidelidad easings → AE**: curvas custom/springs no mapean 1:1 a
   keyframes con influencia. Mitigación: bake a keyframes densos (2–4 por
   frame de curva compleja) — editable igual en AE.
3. **Video en DOM sincronizado al reloj virtual**: seeks de `<video>` no son
   instantáneos. Mitigación: en preview tolerar drift; en export, seek
   bloqueante por frame (determinístico por definición).
4. **Scope**: la tentación de hacer un After Effects entero. El corte es:
   lo que el chat + presets + timeline simple no resuelvan fino, se termina
   en AE (para eso existe M7).
