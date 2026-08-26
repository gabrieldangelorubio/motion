# Reglas del sistema — con estas convivimos

Restricciones y convenciones no negociables del módulo de motion graphics CSS.
Si una regla molesta, se discute acá antes de romperla.

## 1. El frame es una función pura del tiempo

Todo lo que se ve en pantalla en `t` milisegundos debe ser derivable **solo** de
`(escena JSON, t)`. Nada de estado acumulado, nada de `Date.now()`, nada de
aleatoriedad no-seedeada (el stagger `random` usa seed determinístico).

Por qué: es lo que hace posible scrub exacto, replays idénticos y —a futuro—
export a video frame-perfect (seek → captura → siguiente frame). Es el patrón
que usan Remotion y Motion Canvas, y la única forma de que la automatización
por LLM sea verificable.

## 2. La escena JSON es el contrato, el editor es descartable

- El formato de escena (`scenes/*.json`) es la interfaz entre humanos, Claude y
  el runtime. El studio (UI) puede reescribirse entero sin tocar escenas.
- Cambios al schema de escena son **solo aditivos**. Nunca renombrar ni cambiar
  semántica de una key existente; los JSON viejos deben seguir reproduciéndose
  igual.
- Los nombres de presets y easings son parte del contrato (mismo régimen).

## 3. CSS/DOM primero, nada de canvas/WebGL en el runtime

- Los presets se expresan como keyframes WAAPI/CSS (transform, opacity, filter,
  clip). Si un efecto no se puede expresar así, no entra al set base — se anota
  en `docs/` como candidato a capa futura, no se cuela un canvas "por esta vez".
- Solo `transform`, `opacity` y `filter` se animan (compositor-friendly). Nunca
  animar `top/left/width/height/margin` (layout thrash). Excepción documentada:
  `letter-spacing` en `tracking-in`, que anima sobre una sola capa entera.

## 4. Identidad y segmentos

- Entradas terminan en **identidad** (sin transform, opacity 1, sin filter).
- Salidas parten de identidad. Énfasis (`emph`) loopea a través de identidad y
  se compone con `composite: add`.
- Así cualquier entrada combina con cualquier salida sin estados imposibles.

## 5. Motion blur: sintetizado, no manual

El blur direccional lo calcula el engine desde la velocidad real del easing
(derivada numérica × distancia). El usuario solo controla **intensidad**
(0–2×). Nunca se keyframea blur a mano en un preset de movimiento; los presets
que animan `filter` propio (`blur-in`, etc.) declaran `ownsFilter` y el engine
no les superpone blur.

## 6. Tipografía premium

- Escalas de canvas fijas (1920×1080 por defecto); el fit al viewport es un
  scale del frame, nunca reflow.
- Splitting accesible: el texto original queda en `aria-label`; los spans son
  presentacionales.
- Easings con nombre (tokens). Prohibido `cubic-bezier` inline en escenas: si
  hace falta una curva nueva, se agrega al token set con nombre y dual
  (CSS + función JS) para que el blur la entienda.

## 7. Licencias

- **GSAP habilitado** (actualización: gratis al 100% desde abr-2025, todos
  los plugins, uso comercial incluido — ver docs/research-ia-y-gsap.md).
  Condición de uso: esta plataforma es interna. ⚠️ Si algún día se ofrece a
  terceros como producto no-code de animación visual, re-evaluar la cláusula
  "Prohibited Uses" de Webflow antes de lanzar.
- Presets/código externo que se incorpore al repo: MIT/Apache/permisiva.
  Animate.css es Hippocratic (aceptable para uso propio; revisar si algún
  día se redistribuye el módulo).
- Toda importación de un preset externo se adapta al contrato (identidad,
  tokens de easing) y se anota su origen en el comentario del preset.

## 8. Organización del trabajo (Claude + agentes)

Ver `docs/TOKENOMICS.md`. Regla corta: Fable dirige, decide arquitectura y
sintetiza; investigación, scraping de presets, conversiones mecánicas y
verificaciones van a agentes Haiku/Sonnet. Nunca gastar contexto del modelo
principal en leer dumps largos que un agente puede resumir.

## 9. Verificación antes de push

Todo cambio al engine/presets se verifica con el smoke test de Playwright
(captura + consola limpia) antes de commitear. Un preset nuevo entra con una
escena demo que lo muestre.
