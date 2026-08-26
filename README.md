# motion — motion graphics de títulos, 100% CSS/web

Módulo para reemplazar el motion graphics de títulos de adiós adiós:
entradas, salidas y efectos de texto, finos y premium, renderizados por el
propio browser (DOM + CSS + WAAPI, sin canvas ni WebGL).

**Modelo de trabajo**: Claude dirige escribiendo escenas JSON; el studio da
controles manuales para afinar (velocidad, stagger, motion blur, easing
global). Largo plazo: automatizar la generación de escenas.

## Correr el studio

```bash
python3 -m http.server 8765
# → http://localhost:8765/studio/index.html
```

Sin build, sin dependencias. Vanilla ES modules.

## Estructura

```
studio/          la app (editor descartable — ver docs/REGLAS.md §2)
  js/engine.js   motor: escena JSON → WAAPI bajo un reloj virtual maestro
  js/presets.js  registry de entradas/salidas/énfasis (keyframes como datos)
  js/easings.js  tokens de easing duales (CSS + función JS) incl. springs linear()
  js/split.js    splitting chars/words/lines accesible + órdenes de stagger
  js/ui.js       transport, scrub, panel de ajustes, editor de escena
scenes/          escenas JSON — el contrato del sistema
docs/            reglas, tokenomics y los tres deep-research
```

## La escena JSON (contrato)

```jsonc
{
  "canvas": { "width": 1920, "height": 1080, "bg": "#0b0b0e" },
  "duration": 5200,
  "layers": [{
    "id": "title",
    "text": "MOTION",
    "style": { "fontSize": "220px", "fontWeight": "900", "color": "#fff" },
    "position": { "x": "50%", "y": "50%", "anchor": "center" },
    "split": "chars",                        // none | chars | words | lines
    "in":  { "preset": "rise", "at": 600, "duration": 950,
             "ease": "out-expo", "stagger": 45, "staggerOrder": "center",
             "params": { "distance": 140 } },
    "out": { "preset": "lift-blur", "at": 4000, "duration": 700,
             "ease": "in-expo", "stagger": 25 },
    "emph": { "preset": "float", "at": 1600, "duration": 2000 },  // opcional, loopea
    "fx":  { "motionBlur": 0.8 }             // intensidad 0–2, sintetizado por velocidad
  }]
}
```

Presets disponibles: `fade, rise, drop, slide-left, slide-right, scale-in,
blur-in, rise-blur, reveal-up, tracking-in, flip-up, pop` (entradas) ·
`fade-out, sink, lift-out, blur-out, lift-blur, conceal-down, scale-out`
(salidas) · `pulse, shimmer, float` (énfasis).

Easings: `smooth, snap, out-quad/cubic/quart/expo/back, in-*, in-out-*,
spring-soft, spring-tight, spring-bouncy` (springs vía CSS `linear()`).

## Decisiones de arquitectura (resumen)

1. **Frame = función pura de (escena, t)** — todas las animaciones WAAPI viven
   pausadas; un reloj virtual escribe `currentTime`. Scrub exacto hoy, export
   frame-perfect mañana sin re-arquitectura.
2. **Motion blur sintetizado**: el engine deriva la velocidad del easing y
   anima `feGaussianBlur` direccional por SVG. Nadie keyframea blur a mano.
3. **Editor descartable, JSON eterno** — cambios de schema solo aditivos.
4. Ver `docs/REGLAS.md` (reglas completas), `docs/TOKENOMICS.md` (política de
   agentes/modelos) y los tres research en `docs/research-*.md`.

## Roadmap

- [ ] Ampliar librería de presets porteando de fuentes MIT
      (@vysmo/text, Animista, Moving Letters — ver research de fuentes)
- [ ] `prefers-reduced-motion` → fallback a fades
- [ ] Efectos `@property`: gradientes animados (foil/chrome), variable fonts
- [ ] Export a video: CDP `HeadlessExperimental.beginFrame` +
      `--deterministic-mode` + WebCodecs, con supersampling temporal para
      motion blur AE-grade (plan completo en docs/research-tecnicas-css.md §7)
- [ ] Generación automática de escenas (Claude → JSON) con verificación por
      captura
