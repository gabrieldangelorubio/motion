# Research — técnicas de plataforma para motion de texto premium (2024–2026)

Síntesis técnica (agente Sonnet). Qué es posible en CSS/web puro, con qué
calidad, y qué decidimos usar.

## 1. Motion blur

No existe motion blur nativo per-pixel en CSS (la propuesta
`motion-rendering: blur` del CSSWG sigue sin implementarse). Opciones reales:

- **SVG `feGaussianBlur` con `stdDeviation="x y"`** — blur direccional por eje,
  barato. **← lo que usa nuestro engine**, con la stdDeviation calculada por
  frame desde la velocidad real del easing.
- `feConvolveMatrix` — smear direccional en cualquier ángulo, más fiel pero
  CPU-bound. Candidato para blur diagonal si hiciera falta.
- Copias fantasma apiladas (10–20 clones con delay incremental) — reactivo a la
  velocidad real pero N× DOM. Solo para un título hero.
- **Supersampling temporal en export** — renderizar 8 sub-frames por frame y
  promediarlos. Calidad After Effects, gratis porque el export no es realtime.
  **← el plan para el pipeline de export.**

## 2. Easing

- `cubic-bezier()` no puede sobrepasar 1 ni oscilar → sin springs.
- **`linear()`** (Baseline dic-2023, ~88%+ soporte) codifica polilíneas
  arbitrarias: springs y rebotes reales en CSS puro. Se genera muestreando la
  EDO del resorte (40–75 puntos). **← nuestros tokens `spring-*` hacen esto**,
  con representación dual CSS + función JS para que el blur conozca la
  velocidad.
- Límite: springs "horneados", no interrumpibles con inercia. Para timelines
  scripteados (nuestro caso) es exactamente lo que hace falta.

## 3. `@property`

Soporte universal desde mediados de 2024. Permite animar gradientes (color y
ángulo), ejes de variable fonts y valores numéricos arbitrarios en CSS puro,
GPU-friendly. **Roadmap**: efectos foil/chrome sobre `background-clip: text` y
kinetic weight con variable fonts.

## 4. WAAPI vs CSS keyframes

WAAPI es la base correcta para un engine programático:
`currentTime` (seek exacto), `playbackRate`, construcción desde datos
(`KeyframeEffect`), `composite: add/accumulate` (capas de efectos),
`commitStyles()`. El patrón recomendado —**todas las animaciones pausadas,
un reloj virtual maestro escribiendo `currentTime`**— es literalmente lo que
implementa `engine.js`, y es lo que hace el export frame-perfect viable.

## 5. Splitting de texto

No hay primitiva CSS para "el carácter N": splitting = spans vía JS.
Accesibilidad obligatoria: `aria-label` en el contenedor + `aria-hidden` en los
spans + respetar `prefers-reduced-motion` (**pendiente**: fallback a fade
simple). Nuestro `split.js` implementa el patrón; Splitting.js/SplitType quedan
como referencia (el enfoque de variables CSS `--char-index` de Splitting.js es
interesante para presets CSS-only).

## 6. Variable fonts

`font-variation-settings` + `@property` = morphs de peso/ancho sin layout
shift. Caro en el main thread → solo texto hero, no párrafos. **Roadmap**:
preset `weight-morph`.

## 7. Export a video frame-perfect

Escalera de calidad:
1. `captureStream`+MediaRecorder — no determinístico, descartado.
2. WebCodecs solo — resuelve el encode, no el origen de frames.
3. Seek WAAPI + rasterización DOM→canvas (`foreignObject`) — determinístico
   pero con fidelidad imperfecta (filtros, fuentes).
4. **Headless Chrome + CDP `HeadlessExperimental.beginFrame` +
   `--deterministic-mode` (Linux) + WebCodecs para encode** — captura el paint
   real GPU-composited, byte-idéntico entre corridas. **← plan de export.**

Lección de Remotion: prohíben CSS transitions porque saltan el DOM al estado
final por frame. Nosotros no tenemos ese problema: todo pasa por WAAPI seekeable
(nuestro reloj ya es virtual). Si algún día aceptamos CSS `@keyframes` crudos de
terceros, hará falta el shim de tiempo (patch de `performance.now`/rAF).

## 8. Reveals y performance GPU

- `clip-path` = borde duro; `mask` + gradiente = borde suave. El "wipe" clásico
  anima `background-position`/`mask-position` (compositor-cheap), nunca el
  gradiente en sí.
- Reglas de oro que adopta el engine: animar solo `transform`/`opacity`/
  `filter`; blur animado < ~20px; `will-change` scoped; `backdrop-filter`
  animado prohibido en presets base.
