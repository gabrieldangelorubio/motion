# Research — empresas de motion graphics en browser y sus arquitecturas

Síntesis del análisis de productos existentes (agente Sonnet, ago 2026).
Qué hacen, cómo renderizan, y qué decisiones tomamos prestadas.

## Mapa rápido

| Producto | Render | Autoría | Export | Lección clave |
|---|---|---|---|---|
| **Jitter.video** | Canvas/WebGL (probable) bajo UI DOM | "Actions" (presets), no keyframes crudos | MP4/MOV/ProRes alpha/GIF/Lottie, cloud | Presets sobre keyframes = la simplificación UX dominante |
| **Rive** | Renderer GPU propio (WASM ~78KB) | Artboards + timelines + state machines; **Text Modifiers** = kinetic typography nativa per-glyph | El `.riv` ES el deliverable (runtime embebido) | Texto per-carácter como primitiva de primera clase |
| **Fable.app** | "Vector engine" propio | Timeline + toolkit | Cloud render: GIF/MP4/ProRes/Lottie | Colaboración como moat, no el engine |
| **Remotion** | **El browser es el renderer** (DOM/CSS) | Código React, `useCurrentFrame()` | Headless Chrome captura frame a frame + FFmpeg; chunking paralelo en Lambda | Frame = función pura del tiempo → export trivial y paralelizable |
| **Motion Canvas** | Canvas 2D | Generator functions (código) | Render loop determinístico → PNG seq → FFmpeg | Determinismo primero; export es "correr el loop N veces" |
| **Theatre.js** | Ninguno (middleware de datos) | Project→Sheet→SheetObject→Sequence | JSON serializado + Core runtime sin editor | **Separar editor de runtime**, unidos solo por datos |
| **Lottie/dotLottie** | ThorVG (WASM ~150KB) | AE export o Lottie Creator | JSON portable | Formato de intercambio compacto = ecosistema |
| **SVGator** | SVG nativo | Timeline keyframes | **Compila a SVG+CSS/JS plano sin runtime** | El export sin dependencias es un moat |
| **Framer Motion** | **WAAPI primero, rAF fallback** | Código/GUI | N/A (runtime web) | Usar el motor nativo del browser por defecto |
| **Canva / Typito / TypeFlow** | Híbrido/cloud | Presets puros, cero timeline | Server render | Techo deliberado de simplicidad para no-diseñadores |
| **Cavalry** | GPU nativo desktop | **Node graph procedural** | Render nativo | Rigs procedurales para generar cientos de variantes on-brand |
| **Haiku Animator** (†) | DOM/SVG | Timeline + expresiones | Lottie/componentes | Murió con engine diferenciado: el moat es workflow, no engine |

OSS para leer código: **Motionity** (AE+Canva en browser), **Premation**
(clon AE con per-glyph text animators), Lottie Open Studio.

## Respuestas a las 3 preguntas clave

**1. ¿Alguien usa CSS/DOM puro como render engine?**
Sí — los que quieren que el deliverable sea un artefacto web nativo:
Remotion (DOM como rasterizador universal), Framer Motion (WAAPI por
aceleración por hardware gratis), SVGator (compila a CSS plano). Los que van a
Canvas/WebGL lo hacen porque necesitan paridad de píxel cross-platform (Rive,
ThorVG) o shaders (Jitter, endless). **Para títulos/texto donde el output vive
en la web, DOM/CSS/WAAPI es una elección validada por la industria, no una
limitación.**

**2. ¿Cómo exportan a video?**
Cuatro patrones: (a) headless Chrome frame-a-frame + FFmpeg (Remotion; el que
nos toca a nosotros), (b) pipeline FFmpeg server-side (Kapwing), (c) canvas
directo → PNG seq (Motion Canvas), (d) WebCodecs nativo (emergente, híbrido con
FFmpeg). El prerequisito de todos: render determinístico por frame — que ya es
nuestra regla #1.

**3. ¿Cómo modelan la escena?**
Lottie: JSON plano de keyframes (compacto, poco editable). Rive: binario
compilado one-way. Theatre.js: árbol jerárquico de contenedores con el editor
separado del runtime — el modelo más sano y el que seguimos. Todos los
consumer-facing exponen **presets** encima de tracks de keyframes internos.

## Decisiones que tomamos prestadas

1. **WAAPI-first, JS solo donde WAAPI no llega** (Framer Motion) → nuestro
   engine: keyframes WAAPI + clock propio para scrub + blur por rAF.
2. **Frame determinístico** (Remotion/Motion Canvas) → regla #1; habilita el
   export futuro por seek+captura sin re-arquitectura.
3. **Editor descartable, escena JSON como contrato** (Theatre.js) → regla #2.
4. **Presets como vocabulario de usuario, tracks debajo** (Jitter/Canva) →
   nuestro registry de presets sobre segmentos in/out/emph.
5. **Per-glyph como primitiva** (Rive Text Modifiers) → split chars/words/lines
   con stagger integrado en el schema, no como hack de la UI.
6. **Automatización futura** (Cavalry): las escenas JSON parametrizables son
   nuestros "rigs" — generar N variantes on-brand = generar N JSON, cosa que un
   LLM hace nativamente. Ahí está el camino de automatización del scope largo.
7. **Aviso de Haiku Animator**: el valor no está solo en el engine — está en el
   workflow (librería de escenas propias, presets de marca, pipeline de export).
