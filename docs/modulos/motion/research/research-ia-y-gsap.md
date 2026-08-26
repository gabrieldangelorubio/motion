# Research — Asistentes IA de motion (SOTA) y licencia GSAP

Síntesis del research (agente Sonnet, ago 2026).

## GSAP: veredicto de licencia

**Gratis al 100% desde el 30/04/2025** (adquisición por Webflow): todos los
plugins ex-Club GreenSock incluidos (SplitText, MorphSVG, DrawSVG,
ScrollTrigger, Inertia, CustomEase…), uso comercial sin cargo. Nuestro caso —
herramienta interna de estudio para producir motion de clientes, no vendida ni
redistribuida — es un "Permitted Use" sin ambigüedad.

**La única cláusula a vigilar** ("Prohibited Uses"): usar GSAP dentro de una
herramienta *no-code de construcción visual de animaciones* que compita con
Webflow **y se ofrezca a terceros**. Mientras esto sea interno, no aplica.
⚠️ Si algún día se comercializa la plataforma como producto para otros
estudios, hay que re-evaluar esta cláusula (o pedir consentimiento escrito a
Webflow). Queda registrado como regla en REGLAS.md.

## Panorama de asistentes IA de motion (2025–2026)

| Producto | Patrón | Nota |
|---|---|---|
| **LottieFiles Motion Copilot 2.0** | Edits incrementales leyendo la escena; streaming del razonamiento como UX de confianza | El más cercano en espíritu; todo output queda editable en timeline |
| **Jitter AI Brainstorm** | Regeneración de borradores completos, acotada por "moods" (playful/bold/elegant…) | Vocabulario restringido por presets = imposible romper nada |
| **Figma AI** | Edits con scope (un componente seleccionado); Make usa Claude | Patrón de edición dirigida a nodo |
| **Framer Agents** | Co-edición del documento vivo (humano + agente sobre la misma fuente de verdad) | |
| **Motion (motion.so)** | "Cursor para motion": agente vía MCP/API que **actualiza la escena en vez de regenerar** | El análogo directo a lo nuestro; lo venden como su diferenciador |
| **Remotion + Claude** | Código libre (React) — validación solo por "¿compila/renderiza?" | El extremo sin guardrails |
| **JSON2Video / Creatomate** | Video como JSON declarativo; el schema ES la API del LLM | El precedente arquitectónico más directo |
| Canva Magic Animate | Clasificación a una librería fija de presets | Techo bajo, cero fallas |
| Rive | Sin copiloto todavía (solo feature request) | |

Papers relevantes: **SceneCraft** (loop generar → renderizar → crítica visual
→ patch), **MapStory** (agente de breakdown + agente researcher; falla en
alucinación numérica), **AI Prototyper** (retrieval en dos pasos + validación
de schema en backend antes de renderizar).

## Arquitectura del chat IA (M4) — decisiones confirmadas y nuevas

Confirmado (ya estaba en el blueprint):
1. **Tool calling sobre un set enumerable de operaciones** del scene graph
   (`applyPreset`, `setTrack`, `retime`, `addLayer`…), validadas contra el
   schema antes de tocar estado. Nunca regeneración total.
2. Ops incrementales para que "ahora más rápido" funcione sin pisar ediciones
   manuales.

Nuevo (adoptamos del research):
3. **Retrieval en dos pasos** cuando la escena/librería es grande: primero el
   modelo elige qué nodos/presets son relevantes, después instancia parámetros
   solo de esos (evita referencias alucinadas a layers inexistentes).
4. **Validación semántica además de estructural**: el schema garantiza "no
   rompe", no "es correcto". Loop barato de render + verificación (captura del
   frame / diff de bounding boxes) al estilo SceneCraft — encaja perfecto con
   nuestro render determinístico.
5. **Toda edición del agente entra al mismo undo stack que las manuales** —
   ningún producto tiene un "AI undo" paralelo; misma pipeline de comandos.
6. **Mostrar el diff** (qué nodos, qué propiedades) mientras ocurre —
   streaming de razonamiento como en LottieFiles.
7. **No resolver ambigüedad en silencio**: "asumí que te referías al grupo
   principal, ¿confirmás?" para ediciones de scope grande.
8. **Clampear/snapear los números del LLM** a rangos sanos y tokens de diseño
   — la falla recurrente en toda la literatura es alucinación numérica, nunca
   malformación estructural.
9. Nivel "mood" encima de las ops (patrón Jitter): direcciones de estilo
   acotadas (editorial/enérgico/sobrio…) que mapean a familias de
   presets/easings — barato, seguro y útil para dirección de alto nivel.
