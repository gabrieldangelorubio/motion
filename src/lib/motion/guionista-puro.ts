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
import { aplicarGuion, validarGuion, type PasoGuion } from "@/lib/motion/guion-puro";
import { encuadrarEnPantalla } from "@/lib/motion/encuadres-puro";
import { auditarDireccion } from "@/lib/motion/auditoria-puro";

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
- entrada «Frame 35419» (barra 60 min) cargar @12300 ×1300 salidaQuart; «60min» subir @13400 — una barra de uso CARGA de izquierda a derecha (preset cargar: crece desde su borde izquierdo): larga y pesada. «Frame 35418» (barra 3 min) cargar @13300 ×500 salidaExpo; «3min» golpe @13700 ×700 elastic.out(1,0.6) — la corta carga en un suspiro y el número remata con el ÚNICO elástico de la pieza.
- entrada «image 65» (avatar) pop @14400 back.out(1.5); editar_capa {division:"lineas"} + cita revelar @14550 ×700 escalonado 110 — el testimonio cierra línea a línea mientras la cámara se asienta a zoom 1.5.
Lo que salió MAL y no se repite: el encuadre del hero (zoom 1.7 centrado en x 720 ve de x 155 a 1285) cortaba el logo, cuya caja empieza en x 110. Antes de fijar un encuadre, verificá que TODO lo que entra en esa escena cae dentro de lo que la cámara ve: visible = [cx − ancho/(2·zoom), cx + ancho/(2·zoom)] × [cy − alto/(2·zoom), cy + alto/(2·zoom)].

# SEGUNDA REFERENCIA (una página-cuento de 1440×6752 en 7 cuadros: hero con título raster y avatares, Gantt, notificaciones, segundo Gantt, pila de caos, barras caídas, nubes — 28 s; el usuario la prefirió a la versión de otro modelo, que resultó «estática, una cosa detrás de otra»)
Lo que la hizo NAVEGAR en vez de saltar:
- LA CÁMARA NUNCA ESTÁ MUERTA. En cada escena, hold con PUSH-IN lento (zoom +3 a +6 % durante el hold, easing entradaSalidaSine), viaje de 1 s a la siguiente con entradaSalidaCubic, y en el hero un TILT (el centro y baja 160 px en 0,9 s) hacia el elemento que invita a seguir. Un hold con zoom constante se siente congelado.
- EL ZOOM SE CALCULA POR ESCENA CON LA CAJA DEL CONTENIDO Y LOS MÁRGENES SEGUROS, no es un valor fijo: caja = desde el tope del título hasta el borde inferior del elemento más bajo (chips, avatares, tarjetas laterales incluidos); zoom = min(ancho_render × 0.8 / ancho_contenido, alto_render × 0.8 / alto_contenido); centro = el de esa caja. Con contenido de 840 px en un render de 1080 el zoom baja a ~1.03 aunque la página pida 1.33 (la página es del color del fondo: abrir no muestra vacío); si el contenido no entra ni así porque algo sangra por el borde de la página, la cámara TILTEA del título a lo de abajo mientras entra. Sin esto, los chips de abajo o el título de arriba quedan cortados o al ras (la auditoría lo marcó tres veces en la otra versión y cuatro en la primera de esta).
- LOS ELEMENTOS ENTRAN MIENTRAS LA CÁMARA LLEGA: el título arranca 200–400 ms antes de que el viaje termine, y lo demás encadena con solapes de 150–400 ms. Esperar a que la cámara se asiente para empezar es lo que se lee como «una cosa detrás de otra».
- DURACIONES POR ROL: protagonistas 900–1100 ms con salidaExpo o salidaQuint (título raster acercarDesenfocado, tarjetas subirDesenfocado distancia 60); secundarios 500–700 ms cubic (chips, avatares con pop back.out(1.5)); micro 250–450 ms sine (bordes, fondos). Un pop de 450 ms para una tarjeta grande la hace liviana; una tarjeta SUBE y asienta.
- CADA ENTRADA TIENE DIRECCIÓN Y CUENTA ALGO: las notificaciones entran ALTERNANDO de lado (deslizarIzquierda / deslizarDerecha, distancia 140, salidaExpo) con un asentamiento de escala 0.96 → 1; las tarjetas laterales llegan desde SU lado con una rotación de ±4° que se corrige; las barras del Gantt CARGAN en cascada (cargar, 130–160 ms entre barras) y su borde aparece 600 ms después; la pila de caos entra en remolino y sigue meciéndose (pista rotacion 0 → 2 → 0 en el hold); las barras caídas CAEN una tras otra (caer, distancia 140, salidaCubic).
- NINGUNA CAPA DEL DISEÑO SE QUEDA SIN ENTRADA. La otra versión olvidó las dos tarjetas laterales del plan: quedaron clavadas mientras todo lo demás se armaba. Recorré el estado capa por capa antes de cerrar el guion.
- RESPIRACIÓN EN LOS HOLDS: avatares con pista escala 1 → 1.03 → 1 (sine, 1,7 s), el garabato con pista y ±14 px. Micro-vida, nunca protagonista.
- VIDA AMBIENTE DESPUÉS DE ENTRAR (pedido del usuario al ver la pieza): los cursores, avatares y tarjetas laterales siguen moviéndose apenas durante el hold (pista y ±6 px en ciclos de 2 s con entradaSalidaSine, tarjetas con rotación ±1°, notificaciones con fases alternadas). Nada entra y se congela.
Lo que salió MAL y no se repite: escribí «elevarDesenfocado» cuatro veces y no existe como entrada — el nombre correcto es subirDesenfocado; tres encuadres salieron cortos (logo y garabato del hero, chips del plan, título de la caída) hasta que apliqué la fórmula de zoom por contenido; y aun así, en el render, los chips del plan y las barras caídas quedaron PEGADOS al borde del cuadro (el usuario: «nunca se puede poner algo fuera de los safe margins, se va a cortar»): el ×1.05 no alcanza, el contenido tiene que ocupar como mucho el 80 % del cuadro.`;

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
- Antes de fijar cada encuadre, calculá qué ve la cámara (visible = ancho/zoom × alto/zoom centrado en x,y) y comprobá que todo lo que entra en esa escena cae adentro, con las cajas del estado. El centro x de una pantalla es el centro de SU caja (una pantalla de 1440 px que empieza en 0 tiene centro 720), NUNCA el del render (960): la cámara no muestra vacío fuera de la pantalla ni la deja descentrada. Para ver una pantalla de 1440 a lo ancho en un render de 1920, zoom = 1920/1440 = 1.33 con x = 720; para acercarse a una sección, zoom = 1920 / ancho_de_la_sección y el centro es el de ESA sección. Los fondos (glows, haces de luz, texturas más grandes que el cuadro) no cuentan para el encuadre.
- Los elementos entran CUANDO la cámara llega a ellos; nada se anima fuera de cuadro. El título de cada escena arranca 200–400 ms ANTES de que el viaje termine y lo demás encadena con solapes: esperar a que la cámara se asiente se lee como «una cosa detrás de otra».
- El zoom de cada escena sale de la CAJA DEL CONTENIDO (tope del título → borde inferior del elemento más bajo, chips y tarjetas laterales incluidos) y de los MÁRGENES SEGUROS: el contenido ocupa como mucho el 80 % del cuadro (10 % libre por lado, zona de título), así el push-in del hold (+3 a +6 %) sigue dentro del 5 % que la auditoría exige (zona de acción). zoom = min(ancho_render × 0.8 / ancho_contenido, alto_render × 0.8 / alto_contenido), centro = el de esa caja. Si la pantalla es del color del fondo de la pieza, abrí el zoom sin miedo (abrir más allá de la página no muestra vacío); si no, no bajes de ancho_render/ancho_pantalla y encuadrá por secciones. Nada del contenido a menos del 5 % del cuadro de cada borde: se corta en pantalla. LOS FONDOS NO SON CONTENIDO: la placa, los «FONDO de sección» del estado, glows y texturas no entran en la caja del contenido ni en los márgenes; un fondo tiene que LLENAR el cuadro, nunca quedar dentro de los márgenes (bajar el zoom «para que el BG entre» muestra el fondo de la pieza como bandas). Para abrir la cámara más que la pantalla, primero ajustar_composicion {fondo} del color de la sección. Ningún hold es estático: push-in de +3 a +6 % con entradaSalidaSine durante el hold.
- Antes de cerrar el guion, recorré el estado capa por capa: ninguna capa del diseño se queda sin entrada (las tarjetas laterales, los chips, los bordes).
- Si el estado trae «ENCUADRES MARCADOS por el usuario», la cámara es UN paso recorrer_encuadres con los tramos {escena, desde, hasta} de cada escena en orden (y opcional viajeMs, easing, temblor): no escribas definir_camara. Sin encuadres marcados, escribí definir_camara con la fórmula de arriba; el código corrige el centro si queda fuera de la pantalla.
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

/** Un guion EXTERNO (el archivo que escribió Fable, o uno a mano) aplicado
    sobre la composición tal como lo haría el director en dos fases:
    parsear, validar, ejecutar, encuadre automático si no hay escenas
    marcadas, y la auditoría. Sin modelo. Lo usa el botón «Aplicar guion»
    del panel: la comparativa Gemini vs Fable se hace con esto. */
export function aplicarGuionExterno(
  comp: Composicion,
  texto: string,
): { ok: true; comp: Composicion; guion: string[]; informe: string[]; errores: number; auditoria: string[] } | { ok: false; error: string } {
  const parseado = parsearGuion(texto);
  if ("error" in parseado) return { ok: false, error: parseado.error };
  const aplicado = aplicarGuion(comp, parseado.pasos);
  let viva = aplicado.comp;
  const informe = [...aplicado.informe];
  if (!(viva.encuadres?.length)) {
    const enc = encuadrarEnPantalla(viva);
    if (enc.ajustes > 0) {
      viva = enc.comp;
      informe.push(`✓ ·· encuadre automático: ${enc.ajustes} valor(es) de cámara corregidos para que lo visible caiga dentro de la pantalla`);
    }
  }
  return { ok: true, comp: viva, guion: parseado.guion, informe, errores: aplicado.errores, auditoria: auditarDireccion(viva) };
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
