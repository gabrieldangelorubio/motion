# Research — Diseño por prompt conectado con motion (Figma MCP, Claude Design)

Pedido de Gabriel (2026-09-01): «modificar el diseño de la escena por
prompt, armar escenas en base a escenas existentes, pantallas con el mismo
estilo… investigar Claude Design… la forma más óptima de armar el segmento
de diseño, completamente conectado con motion». Síntesis de la
investigación (agente Sonnet con búsqueda web; los dominios oficiales de
Figma/Anthropic estaban bloqueados para fetch directo: la evidencia viene de
snippets indexados de esas páginas oficiales — marcado abajo) + la lectura
de arquitectura de Fable sobre lo que el módulo ya tiene.

## 1. Qué hay afuera (septiembre 2026)

### Figma MCP — leer y ESCRIBIR el canvas
- Lectura (confirmado): `get_design_context`, `get_metadata`,
  `get_screenshot`, `get_variable_defs`, `get_code_connect_map`,
  `get_figjam`. Devuelven contexto para código, XML de nodos, capturas,
  variables — NO la geometría vectorial ni las métricas de texto que
  necesita nuestro motor.
- Escritura (confirmado, blog «the Figma canvas is now open to agents» +
  docs `write-to-canvas`): UNA tool, **`use_figma`**, que ejecuta código de
  la **Plugin API** dentro del archivo — crea/modifica frames, componentes,
  variables, auto layout, estilos, texto, imágenes: nodos nativos. Viene con
  una skill `/figma-use` que le enseña al agente a usarla (eso son las
  «Figma Skills»).
- Auth y planes (confirmado): el MCP remoto (`mcp.figma.com/mcp`) es **solo
  OAuth por usuario** — sin Personal Access Token (pedido abierto en el
  foro). Escribir requiere **asiento Full**; gratis en beta, «feature paga
  por uso» después (sin tarifa publicada). Lectura: 6 llamadas/mes en
  asientos chicos, rate limit tipo REST Tier 1 en Dev/Full.
- Desde un backend propio (inferido, fuentes terceras): posible como cliente
  MCP compliant con OAuth por usuario final (refresh tokens a cargo
  nuestro); no hay token de servicio.

### Figma REST API — ¿reemplaza el copy/paste del plugin?
- `GET /v1/files/:key/nodes?geometry=paths` da `fillGeometry`/`vectorPaths`
  (confirmado) pero con bugs conocidos (sin fill → sin geometría; vectores
  flatten con varios fills incompletos). `absoluteRenderBounds` sí (nullable).
  Texto por rango sí (`characterStyleOverrides` + `styleOverrideTable`).
- **GAP confirmado: no existe equivalente REST de `getRangeBounds`** — el
  dato con que nuestro plugin reconstruye los CORTES DE LÍNEA reales del
  wrap. Solo la Plugin API, corriendo adentro de Figma, calcula layout de
  texto renderizado. Conclusión: REST no reemplaza al plugin; a lo sumo lo
  complementa para fetch en lote.

### Claude Design (Anthropic Labs)
- Confirmado: lanzado 2026-04-17 como research preview (claude.ai/design,
  Claude Desktop, skill `/design` en Claude Code). Canvas 2D de artboards
  editables (click-to-select, edición por nodo, prompts acotados). Exporta
  **PPTX, PDF, HTML**, link compartible, handoff a Claude Code. Tiene su
  propio MCP (`api.anthropic.com/v1/design/mcp`) para crear/editar diseños
  desde terminal. Planes Pro/Max/Team/Enterprise.
- NO encontrado: export a `.fig`, animación/motion nativa, ni forma de
  EMBEBER el canvas en una app de terceros. Es un producto de creación con
  export final, no una fuente de datos de diseño estructurados.
- Distinto de «Claude for Figma» (plugin/conector que lee archivos Figma
  existentes para Claude Code).

### Arte previo
- **Jitter**: roundtrip por copy/paste Figma → Jitter, re-sync manual por
  atajo conservando animaciones. **Rive**: motor propio, import por SVG/
  plugin, sin ida y vuelta geométrica real.
- **Figma Motion** (Config 2026, 24-jun): Figma metió un motor de animación
  DENTRO del archivo de diseño — timeline, keyframes, spring/easing, export
  MP4/GIF/WEBM/SVG animado, inspección en Dev Mode, «MCP-compatible».
- Patrón de la industria: de «dos apps con sync manual» a «diseño y
  animación en el MISMO modelo de datos» — exactamente el principio de
  nuestro JSON (capas con estilo + entradas/salidas + cámara en un objeto).

## 2. Lectura de arquitectura

**El módulo ya tiene un modelo de diseño.** Las capas son el diseño de
Figma normalizado (texto con tipografía y métricas, formas, vectores con
paths, imágenes, grupos, pantallas). El director ya tiene tools de diseño
embrionarias: `agregar_capa_texto/forma`, `editar_capa` (x, y, escala,
rotación, opacidad, mezcla, nombre, texto), `transformar_texto`,
`quitar_capa`, `reordenar_capas`. «Diseño por prompt conectado con motion»
es completar ese vocabulario sobre el MISMO modelo — con una ventaja que
Figma no da: **una pantalla derivada «con el mismo estilo» hereda también
el movimiento** (entradas, salidas, escalonados, cámara).

Tres arquitecturas:
1. **Figma-céntrica** — el agente escribe en Figma (`use_figma`) y de ahí
   importamos. Fidelidad Figma y el equipo en su herramienta; pero cada
   iteración es un roundtrip (escribir → exportar → importar → re-animar),
   OAuth por usuario, asiento Full, y costo por uso a futuro.
2. **Módulo-céntrica** — Figma es el origen del diseño maestro; adentro del
   módulo un agente diseñador hace variaciones, derivaciones, textos,
   colores, composición. Cero roundtrip, mismo undo, mismo timeline. Sin
   autolayout ni edición vectorial fina (para eso está Figma).
3. **Híbrida (recomendada)** — la 2 como núcleo + Figma conectado por MCP:
   - **Import sin copy/paste, CON la fidelidad del plugin**: `use_figma`
     ejecuta Plugin API — es decir, puede ejecutar NUESTRO exportador
     (`figma-plugin/code.js`) en el archivo y devolver el JSON al agente.
     Se elimina el copy/paste manteniendo `getRangeBounds` y toda la
     geometría que REST no da. (Inferido: hay que verificar que `use_figma`
     devuelva payloads grandes; si no, en trozos por pantalla.)
   - **Write-back** de pantallas derivadas a Figma, si el equipo quiere que
     Figma siga siendo el archivo maestro.

**Claude Design, sentido real para nosotros**: ideación — storyboards,
moodboards y layouts de una pieza ANTES de animar (y diseñar la UI del
propio módulo). No es motor embebible ni fuente de datos; no reemplaza ni a
Figma ni a nuestro modelo. Su MCP podría, a futuro, generar storyboards
desde el chat del módulo — valor marginal, no prioritario.

**Figma Motion es la señal de mercado que hay que mirar de frente**: Figma
ahora anima adentro del archivo. Nuestro diferencial no es «animar en un
timeline» sino: el motor GSAP con eases paramétricos y determinismo
frame a frame, la secuencia PNG con alfa hacia AE, el director que dirige
por criterio (referencias analizadas frame a frame, locución que manda los
tiempos, sensación de la pieza), y las pantallas derivadas que heredan el
movimiento. Eso es lo que la parte de diseño tiene que potenciar.

## 3. Tandas propuestas

- **D1 — El estilo de la pieza como contexto + tools de estilo.** Extraer
  de una escena su «sistema»: paleta (colores y frecuencia), tipografías y
  jerarquía (familia/peso/tamaño por rol), márgenes y grilla implícita,
  ritmo de la animación (duraciones, easings, escalonados típicos). Va al
  system prompt como bloque «ESTILO DE LA PIEZA». Tools nuevas de
  `editar_capa`: color, fuente (familia/peso/tamaño/interlineado/
  interletrado), alineación, ancho/alto de formas, radio. Sabotajes +
  paridad de describir.
- **D2 — Derivar pantallas.** `derivar_pantalla(desde, contenido)`: clona
  la pantalla (estructura, estilo, ENTRADAS/SALIDAS/cámara), reemplaza
  textos e imágenes por rol, re-envuelve y re-ancla textos (la maquinaria
  del import ya lo hace), ubica la pantalla nueva en el lienzo
  multi-pantalla y en la secuencia de escenas. Es «armar pantallas en base
  a una escena con el mismo estilo». También `variar_escena` (misma
  estructura, otro contenido, opcionalmente otra paleta).
- **D3 — Import desde Figma sin copy/paste (vía `use_figma`).** El módulo
  como cliente MCP con OAuth del usuario; el agente ejecuta nuestro
  exportador dentro del archivo y trae el JSON. Requiere asiento Full y
  verificar tamaños de respuesta. Mantiene la fidelidad total del plugin.
- **D4 — Write-back a Figma** de pantallas derivadas (`use_figma` creando
  frames/textos/vectores desde nuestro modelo), si el equipo lo necesita
  como archivo maestro. Opcional; decidir después de D2.
- **Producto:** un solo chat, el director con los dos vocabularios (diseño
  y movimiento) — vos hablás de la pieza, no del departamento. Los tools se
  agrupan por «modo» en el prompt; el modelo decide cuál usar.

## Fuentes principales
developers.figma.com/docs/figma-mcp-server/{tools-and-prompts,write-to-canvas};
figma.com/blog/{the-figma-canvas-is-now-open-to-agents,introducing-figma-motion};
help.figma.com/hc/en-us/articles/{39216419318551,39252411778583,35281385065751};
developers.figma.com/docs/rest-api/{rate-limits,changelog}; forum.figma.com
(hilos: PAT para MCP, vectorNetwork ausente, characterStyleOverrides);
support.claude.com/en/articles/14604416; anthropic.com/news/claude-design-anthropic-labs;
claude.com/product/design; claude.com/plugins/figma; jitter.video/changelog;
rivemasterclass.com/blog/figma-motion-vs-rive.
