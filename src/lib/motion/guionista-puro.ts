/* -----------------------------------------------------------------------------
   DIRECTOR EN DOS FASES — la parte PURA del GUIONISTA

   Gabriel (2026-09-02), después de ver la pieza dirigida por Fable con un
   guion escrito ANTES de tocar una herramienta: «apliquemos los mismos pasos
   que hiciste vos para hacerlo con Gemini Flash».

   Lo que cambió el resultado no fue una regla más en el prompt: fue el
   método. (1) Leer el diseño y escribir el GUION ENTERO —escenas con
   tiempos, cámara, protagonista y carácter— y recién después los pasos.
   (2) Ejecutar los pasos con código, no con el modelo paso a paso. (3) Una
   sola pasada del modelo para corregir lo que dio error o lo que la
   auditoría marcó. Acá vive lo testeable de ese método: el bloque del
   prompt que pide el guion, el guion de referencia con la lógica adentro,
   el parser de la respuesta, la elección de modo y el mensaje de corrección.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";
import type { TurnoAgente } from "@/lib/motion/agente";
import { validarGuion, type PasoGuion } from "@/lib/motion/guion-puro";

export type ModoDirector = "guion" | "iterativo";

/** Una pieza SIN dirigir (ninguna capa animada, cámara quieta) y SIN
    conversación previa se dirige por GUION: plan entero primero. Una pieza
    ya dirigida —o una charla ya empezada, aunque la pieza haya quedado sin
    animar— se retoca con el loop iterativo: ahí el pedido suele ser puntual
    («cambiá el color del título») y reescribir la pieza entera sería
    desobedecerlo. */
export function elegirModo(comp: Composicion, historial: TurnoAgente[] = []): ModoDirector {
  if (historial.length > 0) return "iterativo";
  const animada = comp.capas.some((c) => c.entrada || c.salida || (c.pistas && Object.keys(c.pistas).length > 0));
  const camaraViaja = Object.values(comp.camara?.pistas ?? {}).some((k) => k && k.length >= 2);
  return animada || camaraViaja ? "iterativo" : "guion";
}

/** El guion de referencia: la landing de lemlist dirigida por Fable
    (2026-09-02), abreviado a lo que enseña. No son reglas: son DECISIONES
    con su porqué, para que el guionista razone igual sobre otra pantalla. */
export const GUION_REFERENCIA = `# GUION DE REFERENCIA (una landing SaaS de 1440×3229, render 16:9, dirigida así y aprobada por el usuario)
LECTURA: «una promesa (3x reply rates), la prueba (el editor de campañas: columna de pasos + panel + botón), la confianza (logos), el manifiesto (dos frases grandes), el beneficio medido (barra 60 min vs 3 min) y el testimonio».
GUION: «16 s, 5 escenas, la cámara narra bajando la página: (1) 0–3 s HERO cerrado en el logo con destello y el título; (2) 3–7.5 s el EDITOR se arma como una UI viva: pasos en stagger, panel derecho, el botón se traza y se presiona; (3) 7.5–10.5 s MANIFESTO: dos frases con peso, logos al pasar; (4) 10.5–14 s BENEFICIO: título y las barras CARGAN (60 min larga y roja, 3 min corta y azul con golpe); (5) 14–16 s TESTIMONIO: avatar + cita línea a línea, la cámara se asienta».
CARÁCTER: «premium y sereno: expo/quint para protagonistas, cubic para secundarios, sine para micro. Un solo elástico en toda la pieza (el 3min). Cámara con flotar suave».
Pasos representativos (de 129), con la decisión detrás de cada uno:
- ajustar_composicion {duracion: 16000} — 5 escenas necesitan 16 s; la duración es del guion, no un default.
- definir_camara {base:{x:720,y:330,zoom:1.7}, y:[{t:0,v:330},{t:2600,v:330,easing:"entradaSalidaQuart"},{t:3700,v:830},{t:6900,v:830,easing:"entradaSalidaCubic"},{t:8000,v:1720},…], zoom:[{t:0,v:1.7},{t:2600,v:1.7,easing:"entradaSalidaQuart"},{t:3700,v:1.45},…], temblor:{preset:"flotar",intensidad:0.35,velocidad:0.8}} — UNA cámara para toda la pieza: encuadre → hold → viaje. Cada hold es un par de keyframes con el mismo valor; el viaje lleva entradaSalida.
- entrada «BLUE HUE» aparecer @0 ×1400 salidaSine — el glow de fondo respira antes que nada: la escena arranca con luz, no con un objeto.
- entrada «lemlistlogo» acercarDesenfocado @150 ×900 back.out(1.4) + pista rotacion [−6° @150 → 0 @1050 salidaExpo] — el protagonista del primer segundo llega desde el fondo, asienta con overshoot y ENDEREZA al llegar (animación secundaria).
- entradas «Line 1/2/5/8» deslizar/subir @550–700 ×900 salidaExpo distancia 120 — el destello se DESPLIEGA desde el logo, cada rayo desde su lado, 50 ms entre uno y otro.
- entrada «3x your reply rates with AI» subirDesenfocado @500 ×1000 salidaExpo — el título es raster: no se divide; entra con desenfoque y peso.
- editar_capa {division:"lineas"} + entrada «Generate highly-personalized…» revelar @1150 ×700 salidaQuint escalonado 140 — el claim es texto real: se revela línea a línea, 650 ms después del título.
- 7 × entrada «Step (fondo)» subir @3300, 3410, 3520… ×550 salidaCubic distancia 40 — una LISTA entra como lista: mismo preset, 110 ms entre pasos; ahí la repetición ES el stagger.
- por cada paso: icono pop @+120 salidaBack, título revelar @+180 salidaQuint, subtítulo aparecer @+260 salidaSine — dentro de cada tarjeta, fondo → icono → título → texto.
- pista escala del paso ACTIVO [1 → 1.03 → 1] @4600–5100 entradaSalidaSine — micro-vida: el paso que cuenta respira cuando el panel termina de armarse.
- entrada «Rectangle 2292» (trazo, el borde del botón) trazar @4500 ×1100 salidaQuart; «Add a step» revelar @5000 — un borde que es trazo SE DIBUJA; el label aparece cuando el borde va por la mitad.
- editar_capa {division:"caracteres"} + entrada placeholder aparecer @4900 ×80 lineal escalonado 14 — un placeholder de input se TIPEA (typewriter).
- entrada «Button (fondo)» pop @5300 ×600 back.out(1.6); label revelar @5450; pista escala [1 @6200 entradaCubic → 0.94 @6300 salidaBack → 1 @6550] en fondo Y label — un botón aparece y después se PRESIONA; el label acompaña la presión.
- entrada «LOGOS» desenfocarEntrada @6900 ×900 — aparecen mientras la cámara pasa por ellos, no antes.
- entradas del manifiesto subirDesenfocado @7900 y @8500 ×1000 salidaExpo distancia 60 + pista escala [1 → 1.015 → 1] en el hold — dos frases con peso y una respiración imperceptible mientras la cámara descansa.
- entrada «Frame 35419» (barra 60 min) revelar @12300 ×1300 salidaQuart; «60min» subir @13400 — una barra CARGA: larga y pesada. «Frame 35418» (barra 3 min) revelar @13300 ×500 salidaExpo; «3min» golpe @13700 ×700 elastic.out(1,0.6) — la corta carga en un suspiro y el número remata con el ÚNICO elástico de la pieza.
- entrada «image 65» (avatar) pop @14400 back.out(1.5); editar_capa {division:"lineas"} + cita revelar @14550 ×700 escalonado 110 — el testimonio cierra línea a línea mientras la cámara se asienta a zoom 1.5.
Lo que salió MAL y no se repite: el encuadre del hero (zoom 1.7 centrado en x 720 ve de x 155 a 1285) cortaba el logo, cuya caja empieza en x 110. Antes de fijar un encuadre, verificá que TODO lo que entra en esa escena cae dentro de lo que la cámara ve: visible = [cx − ancho/(2·zoom), cx + ancho/(2·zoom)] × [cy − alto/(2·zoom), cy + alto/(2·zoom)].`;

/** El bloque que convierte al director en GUIONISTA: sin herramientas,
    devuelve el guion entero como JSON que el código ejecuta. */
export const MODO_GUION = `# MODO GUION (esta llamada)
En esta llamada NO ejecutás herramientas: escribís el GUION COMPLETO de la pieza y el código lo ejecuta paso a paso con las mismas herramientas y validaciones. Respondé ÚNICAMENTE con un JSON (sin texto antes ni después, sin markdown) con esta forma:
{
  "guion": ["LECTURA. …", "GUION. …", "CARÁCTER. …"],
  "pasos": [ { "herramienta": "definir_entrada", "input": { "capaId": "…", "preset": "…", "en": 0, "duracion": 700, "easing": "…" }, "nota": "por qué" }, … ]
}
- «guion»: tres a seis líneas. LECTURA (qué es la pieza, secciones, qué es cada elemento), GUION (escenas con sus tiempos en segundos, qué pasa en cada una, la cámara), CARÁCTER (easings por rol, qué se permite una sola vez).
- «pasos»: TODOS los pasos, en orden: ajustar_composicion si la duración cambia, UNA definir_camara para toda la pieza (holds = par de keyframes iguales; viajes con entradaSalida*), editar_capa {division} antes de revelar textos, definir_entrada por cada capa que entra, definir_pista para coreografías y micro-vida, definir_salida si algo sale. Los capaId son los ids EXACTOS del estado. Los inputs son los de las herramientas (mismos nombres que en el loop). Cada paso importante lleva «nota» con la decisión.
- Antes de fijar cada encuadre, calculá qué ve la cámara (visible = ancho/zoom × alto/zoom centrado en x,y) y comprobá que todo lo que entra en esa escena cae adentro, con las cajas del estado.
- Los elementos entran CUANDO la cámara llega a ellos; nada se anima fuera de cuadro.
- Aplicá la REGLA DE ORO y la escuela: variedad de familias por rol, easings por rol, escalonados, animación secundaria, al menos una coreografía a medida, sin tramos muertos, un elástico por pieza como máximo.
Si te piden CORREGIR un guion ya aplicado, respondé con el mismo JSON pero solo con los «pasos» nuevos o corregidos (pueden repetir un capaId: la última definición pisa a la anterior).`;

/** El SISTEMA del guionista: el del director (regla de oro, escuela,
    catálogo, sistema) + el modo guion + el guion de referencia. */
export function sistemaGuionista(sistemaDirector: string): string {
  return `${sistemaDirector}\n\n${MODO_GUION}\n\n${GUION_REFERENCIA}`;
}

export type GuionParseado = { guion: string[]; pasos: PasoGuion[] };

/** Saca el JSON de la respuesta del modelo (tolera fences y texto alrededor)
    y lo valida con el mismo validador del guion externo. */
export function parsearGuion(texto: string): GuionParseado | { error: string } {
  const limpio = texto.replace(/```(?:json)?/gi, "").trim();
  const inicio = limpio.search(/[{[]/);
  if (inicio < 0) return { error: "la respuesta no trae JSON" };
  const fin = Math.max(limpio.lastIndexOf("}"), limpio.lastIndexOf("]"));
  let crudo: unknown;
  try {
    crudo = JSON.parse(limpio.slice(inicio, fin + 1));
  } catch (e) {
    return { error: `JSON inválido: ${e instanceof Error ? e.message.slice(0, 120) : "?"}` };
  }
  const pasos = validarGuion(crudo);
  if (typeof pasos === "string") return { error: pasos };
  const guion =
    crudo && typeof crudo === "object" && Array.isArray((crudo as { guion?: unknown }).guion)
      ? ((crudo as { guion: unknown[] }).guion.filter((l) => typeof l === "string") as string[])
      : [];
  return { guion, pasos };
}

/** El segundo turno: qué dio error y qué marcó la auditoría, para que el
    guionista devuelva solo los pasos que arreglan eso. */
export function mensajeDeCorreccion(informe: string[], auditoria: string[]): string {
  const errores = informe.filter((l) => l.startsWith("✗"));
  const partes: string[] = ["CORRECCIÓN DEL GUION (misma pieza, ya aplicado lo que dio ✓)."];
  if (errores.length) partes.push(`Pasos que dieron ERROR (no se aplicaron):\n${errores.join("\n")}`);
  if (auditoria.length) partes.push(`AUDITORÍA DE DIRECCIÓN sobre lo aplicado (hechos medidos, se corrigen):\n- ${auditoria.join("\n- ")}`);
  partes.push("Respondé SOLO con el JSON {\"pasos\": [...]} con los pasos nuevos o corregidos. Nada más.");
  return partes.join("\n\n");
}

/** ¿Hace falta el turno de corrección? */
export function necesitaCorreccion(errores: number, auditoria: string[]): boolean {
  return errores > 0 || auditoria.length > 0;
}

/** El resumen que ve el usuario: el guion y qué pasó al ejecutarlo. */
export function resumenDeGuion(guion: string[], informe: string[], errores: number, rondas: number): string {
  const lineas = guion.length ? guion : ["(el guionista no escribió la lectura)"];
  const ok = informe.filter((l) => l.startsWith("✓")).length;
  return `${lineas.join("\n")}\n\nEjecuté ${ok} pasos del guion${errores ? ` (${errores} no se pudieron aplicar)` : ""}${rondas > 1 ? ` en ${rondas} rondas` : ""}.`;
}
