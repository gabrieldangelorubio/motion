# Research — re-estilar una serie de pantallas y armar pantallas nuevas con el mismo estilo

Fecha: 2026-09-03. Pedido de Gabriel: «yo te pongo una pantalla y en base a
ese diseño, recrear otro tipo de pantallas con el mismo estilo» y «poder
cambiar todo el estilo de una serie de pantallas». Continúa la nota
`research-diseno-conectado.md` (D1 estilo y D2 derivar hechas; D3/D4
Figma vía MCP pendientes). Esta nota propone D5 (re-estilar) y D6
(pantalla nueva).

## 0. La idea que ordena todo

Todos los productos que hacen esto bien no adivinan el estilo desde una
captura: lo guardan como un REGISTRO ESTRUCTURADO (Figma Variables, brand
kit de Uizard/Canva/Adobe, el `tailwind.config` de v0) y generan layout
contra una lista cerrada de componentes o un JSON con esquema, nunca código
libre. Nosotros estamos mejor parados que todos ellos: el import de Figma
nos da los valores EXACTOS (familia, peso, tamaño, hex, radio, sombra,
geometría) capa por capa. No hay que extraer estilo de píxeles, hay que
ORDENARLO en tokens con roles y operar sobre esos tokens.

## 1. Dónde estamos (auditoría del módulo)

- `estiloDePieza` (`estilo-puro.ts:91-168`): paleta por frecuencia de uso,
  fondos, tipografías agrupadas por (familia, peso) con rol inferido por
  tamaño relativo, márgenes mínimos al borde, ritmo de animación. Va al
  system prompt como «ESTILO DE LA PIEZA». NO lee radios ni sombras (ya
  están en el modelo), no detecta unidad de espaciado, no asigna ROLES a
  los colores ni registra pares de contraste. En logbook el color «más
  usado» es `rgba(34,34,34,0.18)` ×16: el borde translúcido de las barras,
  ruido contado como paleta.
- `derivarPantalla` (`derivar-puro.ts`): clon de pantalla entera + reemplazo
  de textos por capa (achica, nunca agranda). Conserva animación, recorte,
  sombra. No cambia layout, ni color, ni agrega/quita capas.
- `editar_capa`: UNA capa por llamada. No hay swap de paleta, ni «aplicar a
  todos los títulos», ni selección por rol. Un cambio de fuente en 40 capas
  son 40 llamadas del modelo.
- Modelo: valores literales por capa, sin indirección a tokens. Rasters
  (`media`) intocables por diseño: lo que Figma no pudo llevar editable
  (gradientes, efectos raros, fotos) no se re-estila.
- Ya pensado y nunca hecho: `variar_escena` («misma estructura, otro
  contenido, opcionalmente otra paleta»), nota del 2026-09-01.

## 2. Qué hace el mercado (2024–2026)

| Producto | Cómo captura el estilo | Cómo genera layout | Salida |
|---|---|---|---|
| Figma Make / First Draft | Guidelines.md + Variables + referencias adjuntas | LLM sobre el canvas; ~70–80 % de match estructural | capas editables |
| Figma Variables / Tokens | colecciones primitivo → semántico (`text-secondary → gray-300`) | — (es la capa de consistencia) | tokens |
| Framer Wireframer / Workshop | librería propia | plantilla + LLM | componentes |
| Relume | librería de componentes | el LLM mapea sitemap → componentes | wireframes |
| Uizard Autodesigner 2 | brand kit explícito (colores, fuentes, logo) | chat | capas propias |
| v0 / Lovable / Bolt | archivo de config con tokens + system prompt | código React/Tailwind | código |
| Recraft | embedding aprendido de 1–10 imágenes de referencia | difusión | imágenes |
| Canva / Adobe Express | brand kit | plantillas | plantillas |

Lectura: fidelidad alta = registro estructurado + generación restringida.
Los de prompt → píxel/código libre (Stitch, Bolt) son los más flojos en
mantener un estilo.

## 3. Investigación que importa

- LayoutGPT / LayoutPrompter (2023): el LLM emite layout numérico como
  «código» con ejemplares en contexto; los ejemplares ESTRUCTURADOS de la
  pantalla de referencia rinden más que describirla en prosa.
- Design2Code / DesignBench / UI-Bench (2024–25): captura → código sigue
  fallando en páginas reales; los modelos abiertos, lejos.
- VST — Interactive Flexible Style Transfer for Vector Graphics (UIST
  2023): el análogo más cercano: transferir estilo entre gráficos
  VECTORIALES respetando la intención del diseñador, no automático total.
- Crítico visual (render + VLM + diff estructurado, 2026): mejora
  consistentemente, cuesta cómputo; usarlo como última pasada.
- DSL con esquema para LLMs (Fowler; A2UI, Crayon): JSON validado contra
  una lista cerrada, reparación contra errores de esquema, nunca CSS libre.
- Color: OKLCH como espacio de trabajo (pasos iguales se ven iguales),
  Material 3 HCT como algoritmo de referencia «semilla → paleta completa
  por roles», Radix 12 pasos por hue con contraste garantizado, APCA para
  contraste (con WCAG 2.1 al lado por auditoría), Leonardo de Adobe como
  motor «dado un contraste objetivo, resolvé el color».
- Tipografía: emparejar por rol (display / cuerpo), mapear PESOS por rol
  óptico y no por número, compensar tamaño por x-height (`font-size-adjust`
  o multiplicar el tamaño en generación), medir el ancho real de los
  strings antes de cambiar la familia: ≤1.05 nada, 1.05–1.15 achicar hasta
  5–8 %, >1.15 agrandar la caja o marcar para revisión.
- Forma: radios como ESCALA con nombre (none/xs/sm/md/lg/pill) y remapeo por
  rango, no proporcional; sombras como niveles de elevación (key + ambient);
  bordes como rol de paleta.

## 4. Propuesta

### 4.1 Tarjeta de estilo (base de D5 y D6)

Extender `estiloDePieza` a una TARJETA DE ESTILO estructurada, calculada
de las capas (determinista, testeable):

- Colores en OKLCH agrupados por ΔE, ponderados por ÁREA y por TIPO de capa,
  con ROL: fondo, superficie, primario, secundario, acento, texto,
  texto-atenuado, borde, semánticos (éxito/peligro). Pares de contraste:
  qué texto se apoya sobre qué fondo (por z-order y contención).
- Tipografías por rol (display / título / cuerpo / detalle) con familia,
  peso, tamaños, interlineado; escala detectada.
- Radios: valores distintos → escala con rango. Sombras: niveles.
  Espaciado: unidad base por histograma de huecos (4/8 px).
- Exclusiones: logos y marcas (subgrupo repetido, nombre, posición), rasters.

Ejemplo (logbook, valores reales del import): fondo `#1e1c1a` → superficie
`#fdfcfc` → primario `#8d87ff` → acentos `#3ad4ca` `#fc8378` `#ffa76d` →
texto `#fae9e5`; display Nunito 800 50/25 px, cuerpo Gochi Hand 22;
radios 33 / 60 / 90 / 100 (pill); sombra 0/6/14 rgba(0,0,0,.22).

### 4.2 D5 — Re-estilar N pantallas: `retematizar`

Entrada: pantallas + tema `{semilla(s) o paleta, par tipográfico, escala de
radios, escala de sombras, modo claro/oscuro, densidad}`. Pasos:

1. Extraer roles (tarjeta de estilo) de la serie entera.
2. Construir el MAPA: rol → color nuevo conservando tono relativo, rango de
   croma y contraste objetivo (HCT/Leonardo); rol tipográfico → familia
   nueva con peso mapeado y tamaño compensado por x-height; rango de radio
   → valor nuevo; nivel de sombra → par nuevo; unidad → unidad × densidad.
3. Aplicar por tipo de capa (texto, forma, vector con relleno sólido).
   Rasters intactos; opcional duotono para rasters «de estilo», nunca
   logos ni fotos.
4. Verificar: APCA/WCAG en cada par registrado, desborde de texto (medir
   con la fuente nueva; achicar o agrandar caja o marcar), consistencia
   (mismo rol = mismo valor en las N pantallas), logos byte-idénticos.
5. Informe: qué cambió, qué falló, qué quedó fuera y por qué.

Dónde entra el modelo: nombrar clusters ambiguos, elegir entre pares
tipográficos válidos, traducir «más premium» a semilla + escalas, explicar
fallas. Todo lo que tiene criterio de correctitud es código.

### 4.3 D6 — Pantalla nueva con el mismo estilo: `componer_pantalla`

El guionista de diseño (mismo modelo del director) recibe la tarjeta de
estilo + la pantalla de referencia como EJEMPLAR ESTRUCTURADO (sus capas,
no una captura) + el pedido («una tarjeta de precios con tres planes»), y
emite JSON contra un esquema cerrado: instancias de nuestros tipos de capa
que referencian TOKENS por nombre (`color: "primario"`, `fuente: "titulo"`,
`radio: "lg"`), en una grilla de la unidad de espaciado. El código resuelve
tokens, valida (esquema, contraste, desbordes, márgenes) y crea la pantalla
con `derivarPantalla` como base cuando la estructura es parecida. Última
pasada opcional: render + revisión visual del propio director (ya existe la
maquinaria de lectura de pantalla y auditoría). Empezar por un catálogo
chico de componentes: hero, tarjeta, lista de pasos, tabla de precios, CTA.

### 4.4 Herramientas del director

- `leer_estilo` (tarjeta de estilo legible + JSON).
- `retematizar` (D5) con `alcance`: pieza, pantallas, o roles.
- `componer_pantalla` (D6).
- `editar_capa` con selección por ROL o lista de ids (hoy una por llamada).

## 5. Tandas y estimaciones

| Tanda | Contenido | Estimación |
|---|---|---|
| D5a | Tarjeta de estilo: roles OKLCH, pares de contraste, radios, sombras, unidad; tests con lemlist/logbook/diagram | 2 días |
| D5b | `retematizar` color + forma (sin tipografía) + verificación + informe | 2 días |
| D5c | Tipografía: pares, mapeo de peso, compensación x-height, desbordes | 2 días |
| D6a | Esquema JSON de composición + resolución de tokens + validador | 2 días |
| D6b | `componer_pantalla` con catálogo inicial (5 componentes) + revisión visual | 3 días |
| Medición | Contraste, desbordes, consistencia (automático) + preferencia de Gabriel A/B | continuo |

Riesgos: rasters con color horneado (aviso claro, no silencio); gradientes
en vectores (remapear por stop o dejar); colisión semántica (marca roja vs
peligro); fuentes que no cargan (fallback métrico). Dependencia: ninguna
librería nueva imprescindible (OKLCH y APCA son fórmulas cortas); culori o
material-color-utilities son opcionales.

## Fuentes

Figma First Draft / Variables · Framer AI · Relume · Uizard · v0/Lovable/
Bolt · Recraft · LayoutGPT (arXiv 2305.15393) · Design2Code (2403.03163) ·
DesignBench · UI-Bench (2508.20410) · Vision-guided refinement
(2604.05839) · Screen2Vec (2101.11103) · VST (2309.11628) · Fowler, DSLs
and LLMs · material-color-utilities (HCT) · Radix Colors scale · Adobe
Leonardo · APCA (Myndex) · DTCG color module 2025.10 · MDN
font-size-adjust · Material shadows · Shoelace/Atlassian radius tokens.
