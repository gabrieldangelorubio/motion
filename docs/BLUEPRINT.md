# Blueprint — plataforma de motion para case studies

> Estado: DRAFT v0 — secciones marcadas ⏳ se completan con el research en curso.

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
Uso interno, sin redistribución ni comercialización → sin conflicto de
licencia (⏳ confirmar términos exactos post-Webflow).

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

### M2 — Ingest de Figma  ⏳ research en curso

Plan base (a validar):
- **Plugin de Figma** que exporta selección/página como JSON de scene graph
  parcial + assets (texto como texto real con estilos; vectores como SVG por
  nodo; imágenes rasterizadas; jerarquía, nombres y z-order intactos).
- Alternativa REST API para automatización sin abrir Figma.
- Normalizador: Figma tree → Scene Graph v2 (coordenadas, rotaciones,
  blend modes, fuentes → Google Fonts match o fuentes locales).

### M3 — Motor de render (DOM/CSS + GSAP)

- Un `gsap.timeline({ paused: true })` maestro; secciones como labels.
- Renderer por tipo de layer: text (HTML), vector (SVG inline), media
  (img/video; video con `currentTime` esclavo del reloj maestro), device
  frames (SVG/CSS), texturas (feTurbulence/overlays con blend modes),
  cámara (transform inverso del mundo).
- Motion blur direccional por velocidad (heredado de v1, fuente GSAP).
- Efectos: máscaras/clip-path, gradientes animados vía @property,
  glows/duotone con filter y blend modes.  ⏳ taxonomía completa en research.

### M4 — Asistente IA (chatbox)

Arquitectura (a validar con SOTA ⏳):
- Claude API con **tool calling sobre operaciones del scene graph**, nunca
  regeneración total: `applyPreset`, `setTrack`, `retime`, `addLayer`,
  `groupLayers`, `setCamera`, `reorderSection`… Ops incrementales
  validadas contra el schema + undo stack.
- Contexto del asistente: scene graph resumido + frame actual capturado +
  librería de presets disponible.
- Dos niveles de dirección: alto nivel ("más energía", "estilo editorial
  sobrio") → política de estilo que mapea a elecciones de presets/easings;
  bajo nivel ("el logo entra a los 2.3s con spring suave").
- Tokenomics: el chat usa el modelo que corresponda a la tarea (ops
  mecánicas → modelo económico; dirección creativa → modelo grande).

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

### M7 — Export After Effects  ⏳ research en curso

Plan base (a validar): scene graph → JSON estilo AEUX + script/panel
ExtendScript que reconstruye comps, layers y keyframes en AE (easings
muestreados a keyframes con influencia, o baked a N keyframes). Assets del
ingest viajan como footage. Camera → AE camera layer.

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
| F8 | Automatización (case study completo semi-automático) | todo |

Orden sugerido de construcción: F1 → F2 → F4 → F3 → F5 → F6 → F7 → F8.
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
