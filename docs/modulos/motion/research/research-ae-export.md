# Research — Export a After Effects como capas y keyframes editables

Síntesis del research (agente Sonnet; inspeccionó el código fuente de AEUX
directamente, no solo docs).

## Hallazgo central sobre AEUX

AEUX (Google) **NO transfiere keyframes** — confirmado leyendo su
`host.jsx` completo: no hay `setValueAtTime` ni `KeyframeEase` en todo el
código. Solo reconstruye geometría/estilo estático (Figma no tenía timeline
que transferir). Además el repo fue **archivado en junio 2025**. Sirve como
referencia de patrón (precompose para jerarquía de grupos, panel CEP), no
como base a forkear. Licencia Apache 2.0 — podemos tomar ideas y código.

## Lo que sí se puede scriptear en AE (ExtendScript)

Todo lo que necesitamos existe y está documentado:
- Comps, layers de todo tipo (`addText/addShape/addSolid/addCamera`),
  importar footage, `precompose()` para nuestros groups.
- **Keyframes**: `setValueAtTime` / `setValuesAtTimes` por propiedad.
- **Easing**: `setTemporalEaseAtKey` con `KeyframeEase(speed, influence)`.
  Los `cubic-bezier` son convertibles a speed/influence (aproximación
  documentada por la comunidad). Curvas no-cúbicas (springs, sampled) →
  **bake a keyframes densos lineales** (exactitud a cambio de editabilidad).
- **Cámara**: `addCamera` + keyframes de Position/Point of Interest/Zoom —
  nuestra cámara 2.5D mapea 1:1, sin problema de conversión.

## Lottie como interchange (secundario, valioso)

El plugin LottieFiles para AE **importa** Lottie JSON como capas y keyframes
editables. Punto clave: **el easing de Lottie es literalmente cubic-bezier
normalizado** — match semántico exacto con nuestras curvas web, sin la
conversión lossy a speed/influence. Cubre precomps, texto, shapes, imágenes.
Límites: sin effects/expressions/blend modes/mattes; merge paths y gradientes
frágiles. Cavalry también converge en Lottie como interchange hacia AE.

Descartados: clipboard de keyframes de AE (formato sin easing, single-layer,
manual) y generación directa de `.aep` (binario RIFX sin spec; parsers
open-source inmaduros).

## CEP vs UXP (2026)

UXP todavía no existe para AE (Premiere lo recibió en dic 2025). CEP 12 es la
última versión mayor pero **todos** los paneles comerciales siguen en CEP.
Decisión: construir en CEP con el core (JSON → object model de AE) separado
del shell, portable a UXP cuando llegue.

## Pipeline recomendado (M7 del blueprint)

1. **Primario: JSON propio + panel CEP residente con importador ExtendScript
   genérico** — el patrón al que convergieron todas las herramientas vivas
   (Overlord, LottieFiles, Bodymovin). Schema diseñado alrededor del object
   model de AE: keyframes como `{t, value, easeIn/easeOut}` con conversor
   bezier→speed/influence y fallback de bake denso para springs.
2. **Secundario: export Lottie** — gratis de mantener (el plugin de
   LottieFiles hace el import) y con easing sin pérdida; útil desde el día 1
   mientras el panel CEP madura.
3. **MVP intermedio: `.jsx` generado por export** ("File > Scripts > Run") —
   cero infraestructura de panel; camino natural: empezar acá y crecer al
   panel, como hizo Bodymovin.
4. Clipboard y `.aep` directo: no viables.
