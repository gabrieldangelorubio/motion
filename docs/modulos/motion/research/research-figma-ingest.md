# Research — Ingest de Figma como capas editables (2025–2026)

Síntesis del research (agente Sonnet). Decisión recomendada al final.

## REST API vs Plugin API

| | REST API | Plugin API |
|---|---|---|
| Árbol de nodos, fills, effects, texto rico | ✔ (con `characterStyleOverrides` por runs) | ✔ |
| Geometría vectorial | Solo paths aplanados (`?geometry=paths`) | **`vectorNetwork` completo** + `exportAsync('SVG_STRING')` por nodo |
| Fuentes | ✖ | Enumeración exacta con `loadFontAsync` (nunca el binario) |
| Rate limits | Sí (429s en export masivo de imágenes) | **Cero** (corre dentro de Figma) |
| Scope | Archivo entero | **Selección actual** (lo natural para "animá este frame") |

**Conclusión: se construye un plugin de Figma**, no un importador REST-only.
REST queda como camino de automatización futura (webhooks para re-sync).

## Cómo lo hacen los demás

- **Jitter/Fable/Framer**: plugin → copy → paste en la app web (clipboard con
  MIME custom). Cero fricción.
- **AEUX** (Google): plugin serializa a `AEUX.json` + PNGs por nodo → panel
  ExtendScript en AE reconstruye capas nativas. **DEmotion** (sucesor) invierte
  el flujo: un plugin *dentro de AE* que tira de la API de Figma — patrón
  "pull desde la herramienta destino" a imitar para nuestro M7.
- **FigmaToCode** (bernaferrari): la mejor referencia arquitectónica —
  árbol Figma → **IR normalizado** desacoplado del schema de Figma → backends
  intercambiables (HTML/Tailwind/React/…) + warnings de conversión. Nuestro
  normalizador copia este patrón: Figma tree → IR → Scene Graph v2.
- **Figma Motion** (nativo, Config 2026, beta): Figma ya tiene keyframes
  propios en el archivo. Monitorear: cuando la API los exponga, podremos
  importar también *intención de animación*, no solo capas.

## Mapeo por tipo de nodo → DOM

| Nodo Figma | DOM | Nota |
|---|---|---|
| FRAME/GROUP/COMPONENT | `<div>` posicionado (flex si tiene auto-layout) | Nunca colapsar grupos: son los targets de animación |
| TEXT | **HTML real** con `<span>` por run de estilo | La mayor ganancia de fidelidad: texto editable, nítido, animable |
| VECTOR/BOOLEAN/etc. | **SVG inline por nodo** (desde el plugin, no el render REST) | Fills/strokes quedan animables (draw-on, tweens de color) |
| RECTANGLE simple | `<div>` con background/border-radius/box-shadow | Más barato que SVG |
| Fills de imagen | `<img>`/background a 2–4× | Raster correcto acá |
| Efectos no expresables (background blur entre siblings, LINEAR_BURN/DODGE, booleans complejos) | **Raster por nodo con flag "flattened"** | Degradación por-nodo, nunca all-or-nothing — la decisión de diseño más importante |

Jerarquía: un elemento DOM por nodo, depth-first; `node.id → data-figma-id`,
`node.name → data-figma-name` + selector sanitizado (los nombres de capa son
las etiquetas del timeline). Z-order = orden del documento = orden DOM.

## Fuentes

1. Enumerar `fontName` únicos desde el plugin.
2. Match exacto contra Google Fonts (hit rate alto).
3. Sin match → **flag explícito** + upload del archivo o sustituto elegido por
   el usuario (patrón html.to.design). Nunca sustituir en silencio: rompe
   animaciones dependientes de reflow.
4. Cachear el mapeo por archivo/equipo.

## Trampas de transforms (checklist del normalizador)

- Posiciones SIEMPRE desde cadenas de `relativeTransform`, nunca
  `absoluteBoundingBox` (global, incluye bounding de rotación, no compone).
- Rotación Figma = alrededor del **top-left**; CSS default = centro.
  `transform-origin: 0 0` o convertir la matriz.
- `relativeTransform` es 2×3 row-major `[a b tx; c d ty]` → CSS
  `matrix(a, c, b, d, tx, ty)` (¡orden column-major, bug clásico!).
- Y hacia abajo en ambos: sin flip. Ojo al componer transforms locales de SVG.
- Blend modes: casi todos mapean a `mix-blend-mode`; `PASS_THROUGH` = sin
  blend + `isolation: auto`; `NORMAL` explícito en grupo = `isolation:
  isolate`; `LINEAR_BURN/DODGE` sin equivalente CSS → aproximar o rasterizar
  con flag.
- Constraints ignorables (canvas fijo, modelo Jitter); auto-layout → flex si
  algún día queremos import adaptativo.

## Pipeline recomendado (M2 del blueprint)

```
Plugin Figma (selección → JSON normalizado + manifest de assets)
   → clipboard (copy/paste, patrón Jitter) o POST local
   → Normalizador: JSON Figma → IR → Scene Graph v2
   → warnings de conversión visibles (qué se aplanó y por qué)
```
