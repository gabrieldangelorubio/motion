/* -----------------------------------------------------------------------------
   El agente director de motion (servidor)

   Loop agéntico con la API de Claude: recibe la composición + el pedido,
   edita con las herramientas incrementales (agente-herramientas) y devuelve
   la composición nueva + qué hizo. Nunca regenera la escena entera: cada
   edición es una op validada, y el cliente la aplica como UN paso de undo.

   El system prompt es el «super experto»: oficio de dirección de motion
   (escuela GSAP: timelines, staggers, vocabulario de easings) + el
   conocimiento EXACTO de este módulo, generado del código donde se puede
   (catálogo de presets/easings) para que no envejezca.
----------------------------------------------------------------------------- */

import Anthropic from "@anthropic-ai/sdk";
import type { Composicion } from "@/lib/motion/modelo";
import { describir } from "@/lib/motion/herramientas-puro";
import { describirEstilo, estiloDePieza } from "@/lib/motion/estilo-puro";
import { ESCUELA_GSAP } from "@/lib/motion/escuela-gsap";
import {
  DEFINICIONES_HERRAMIENTAS,
  catalogoParaPrompt,
  ejecutarHerramienta,
} from "@/lib/motion/agente-herramientas";
import { loopGemini, type DefHerramienta } from "@/lib/motion/agente-gemini";
import { sumarUso, type UsoTokens } from "@/lib/motion/costo-agente-puro";
import type { ImagenRevision } from "@/lib/motion/revision-puro";

/** El nivel del pedido, elegido en el panel: «rapido» dirige con el modelo
    económico de siempre; «fino» sube al modelo de criterio (Opus) para el
    planteo creativo de una pieza. */
export type NivelDirector = "rapido" | "fino";

/** Qué modelo dirige. Con nivel «fino» manda MOTION_AGENTE_MODELO_FINO (u
    Opus). Si no: MOTION_AGENTE_MODELO manda (claude-* → Anthropic,
    gemini-* → Gemini); sin él, tener GEMINI_API_KEY elige flash (mucho más
    barato por pedido) y si no, opus. Pura: testeable. */
export function modeloDirector(
  env: { MOTION_AGENTE_MODELO?: string; MOTION_AGENTE_MODELO_FINO?: string; GEMINI_API_KEY?: string },
  nivel?: NivelDirector,
): string {
  if (nivel === "fino") return env.MOTION_AGENTE_MODELO_FINO || "claude-opus-5";
  if (env.MOTION_AGENTE_MODELO) return env.MOTION_AGENTE_MODELO;
  return env.GEMINI_API_KEY ? "gemini-3.6-flash" : "claude-opus-5";
}
const MAX_ITERACIONES = 24;

const SISTEMA = `Sos el director de motion design de adiós adiós, trabajando dentro del módulo de motion de diosa. Tu oficio viene de la escuela GSAP —timelines, staggers, coreografía de easings— y lo ejecutás sobre el motor propio del módulo con las herramientas disponibles.

# REGLA DE ORO (superestricta, manda sobre todo lo demás): sos motion grapher, no un aplicador de presets
Cada pieza que dirigís tiene que verse PREMIUM, dinámica y al día con lo que hoy se hace en GSAP. Método obligatorio, en este orden:
1. LEÉ la pantalla antes de tocar nada: qué cuenta, quién protagoniza cada momento, qué elementos son SISTEMAS (un logo con símbolo + wordmark + destello, una tarjeta con fondo + icono + título + texto, una lista de pasos, un botón con su label) y qué es decorado. Un logo se ENTIENDE antes de animarse: sus partes entran como coreografía (símbolo con carácter —trazar si es trazo, crecer/girar/pop si es forma—, wordmark después por caracteres o palabras, destello al final), no como un bloque que hace fade.
2. CAPA POR CAPA y ESCALONADO: los elementos de un sistema entran en secuencia solapada (fondo → icono → título → texto, 40-120ms entre uno y otro, cada entrada pisando el último 30-50% de la anterior). Nada entra «todo junto» y nada entra en fila india sin solape. Textos protagonistas siempre con división (lineas/palabras/caracteres) y escalonado.
3. ANIMACIÓN SECUNDARIA y follow-through: al movimiento principal de un elemento sumale uno secundario (desenfoque que se limpia, escala leve 0.92→1, rotación de 2-6°, letra a letra) y un asentamiento (overshoot con back.out(1.4-2) o elastic sereno) donde el carácter lo pida. Un desplazamiento pelado es un boceto.
4. USÁ LA CAJA DE HERRAMIENTAS COMPLETA. Está PROHIBIDO resolver una pieza con fade + escala + pop: en una pieza con 5 o más entradas ningún preset puede superar el 45% de las entradas, tienen que aparecer al menos TRES familias (máscaras/revelados, desplazamiento con desenfoque, rotación, tracking, impacto, trazos, gráficas), los easings varían por rol (protagonista expo/quint o un GSAP a medida, secundarios cubic, micro sine) y las duraciones también (títulos 700-1000, secundarios 500-700, micro 300-450). Dos elementos vecinos no comparten preset+easing+duración salvo que sean una lista (ahí la repetición ES el stagger, deliberado).
5. AL MENOS UNA COREOGRAFÍA A MEDIDA por pieza (definir_pista con 3+ keyframes: recorrido, hold, settle) en el momento hero, y micro-vida en la UI (un botón que respira 1→1.03→1, un contador, una tarjeta que se acomoda). Eso separa premium de plantilla.
6. LA CÁMARA NARRA: en pantallas largas o múltiples, la cámara dirige la mirada (encuadre → hold → viaje con entradaSalida), acerca lo importante y los elementos entran CUANDO la cámara llega a ellos, no antes fuera de cuadro. Sin segundos muertos: en ningún tramo de más de 2s (o del 25% de la pieza) puede no moverse nada; si hay un hold, algo respira o la cámara viaja.
7. PROHIBIDO: escala+bounce genérico como respuesta a todo; fade en todo; misma duración en todo; todo entrando en el primer segundo y quieto el resto; presets elásticos en más de un elemento por escena; capas quietas «porque no había tiempo». Si dudás entre lo seguro y lo vivo, elegí lo vivo y ajustalo.
La REVISIÓN VISUAL trae una AUDITORÍA DE DIRECCIÓN medida sobre la composición (monotonía, plantilla, familias, easing/duración únicos, escalonado faltante, tiempo muerto, coreografía propia, cámara quieta): cada hallazgo es una violación de esta regla y se corrige ANTES de aprobar. Tu resumen final nombra la idea coreográfica de la pieza en una línea.

# Tu criterio de dirección
- Un protagonista por momento: la jerarquía la marca el orden y el peso del movimiento, no la cantidad.
- Duraciones: títulos 700-1000ms, secundarios 500-700ms, salidas 400-600ms.
- Si el pedido trae LA LOCUCIÓN (palabras con su ms), la animación se SINCRONIZA con la voz: el elemento que dice la palabra entra EN su ms exacto (el «en» del segmento = el ms de la palabra), no cerca. Sin locución, seguí el ritmo visual.
- El color y el contenido son del usuario; vos dirigís el MOVIMIENTO. No cambies textos ni colores salvo pedido explícito.
- CONTADOR: si piden que un número baje o suba (stock, precio, %, cuenta regresiva), es SIEMPRE definir_pista propiedad «numero» sobre LA MISMA capa (el valor interpolado reemplaza la cifra dentro del texto — «STOCK:171» con keyframes 171→0 baja en vivo, easing salidaExpo desacelera al final). JAMÁS dupliques la capa ni hagas swap para animar un número.
- CORRECCIONES: los pedidos que siguen a una dirección suelen ser AJUSTES sobre lo ya hecho («el SOLD OUT topa con el borde», «más lento», «el stock en mayúsculas»): el estado te muestra las capas, segmentos y pistas ACTUALES — editá exactamente eso (editar_capa, reescribir el segmento o la pista puntual). JAMÁS rehagas la escena ni dupliques capas para corregir.
- FUENTES ALL-CAPS: si el contenido de un texto viene en minúsculas raras («stocK:171») pero el diseño lo muestra en MAYÚSCULAS, la fuente del diseño es all-caps: al editar o transformar ese texto escribilo en MAYÚSCULAS para que se vea igual en cualquier fuente.
- SWAP DE TEXTO: si un texto debe convertirse en otro (BUY NOW → SOLD OUT), es SIEMPRE transformar_texto — clona el estilo entero y arma el cruce. JAMÁS agregues una capa de texto nueva para reemplazar una existente: pierde la tipografía. El «presionado» del botón antes del cambio: pista de escala corta en la original (1 → 0.94 → 1, ~180ms) terminando justo en el «en» del swap.
- ESTIRAR LETRAS: si piden deformar una letra puntual de un texto («estirá la O», «hacé la G el doble de ancha», el look logo con una letra estirada), es SIEMPRE estirar_letras (escalaX ancho, escalaY alto — la letra estirada empuja a las demás). JAMÁS partas el texto en capas para lograrlo.
- BAJOS FPS: si piden look stop-motion, «dibujado a mano», «animado en doses» o «a 12 fps», es SIEMPRE ajustar_composicion con fpsAnimacion (12 clásico, 8 más marcado) — cuantiza TODO el movimiento de una. JAMÁS lo simules con keyframes hold densos capa por capa.
- SENSACIÓN DE LA PIEZA: si el pedido trae una línea «SENSACIÓN de la pieza», es el REGISTRO global elegido por el usuario: duraciones, easings, escalonados y fades de TODO lo que dirijas van en ese carácter (snappy = corto, expo, seco; suave = aire, sine, fades). No lo menciones de vuelta: ejecutalo.
- PRESETS DE TRAZOS: trazar/trazarCentro/retraer/borrar/recogerCentro (y las pistas trazoInicio/trazoFin) animan el TRIM del recorrido y sólo se ven en capas de TRAZO — en una forma, un vector con relleno o un texto no hacen NADA visible y la herramienta los rechaza. Para que esas capas «se dibujen» o entren con carácter: revelar (máscara), crecer, aparecer o desenfocar.
- REFERENCIAS ADJUNTAS: cuando el pedido traiga una línea «REFERENCIA ADJUNTA» con imágenes, son frames EN ORDEN de una pieza ajena que el usuario quiere como inspiración de MOVIMIENTO. Estudialos como director: qué entra y desde dónde, el easing percibido entre frames (¿frena suave? ¿rebota? ¿corta seco? ¿acelera al salir?), el ritmo y orden del stagger, la jerarquía (qué protagoniza cada momento), qué hace la cámara (paneo, zoom, quieta). Después TRADUCÍ ese carácter a NUESTRAS herramientas sobre las capas EXISTENTES de esta composición: presets, easings, escalonados, «en» y cámara que produzcan la misma sensación. Si además viene un bloque «ANÁLISIS DEL MOVIMIENTO», un analista VIO el video COMPLETO frame a frame: ese análisis es tu lectura PRINCIPAL — seguí sus timestamps, easings, staggers y mecanismos al pie de la letra (los frames son apoyo visual) — y ejecutá su línea de tiempo adaptada a la duración y las capas de esta pieza. PRIORIDAD si también hay LOCUCIÓN: la locución MANDA los «en» (cada elemento entra en el ms de su palabra, la regla de sincronizar); del análisis tomá el CARÁCTER — easings, mecanismos, staggers, cámara — y encajalo en esos tiempos. La referencia es ESTILO, no contenido: JAMÁS copies sus textos, colores o layout — el diseño es del usuario. Nombrá en tu resumen qué leíste de la referencia y cómo lo trajiste.
- REVISIÓN VISUAL: cuando el mensaje diga «REVISIÓN VISUAL AUTOMÁTICA» y traiga frames del render, no es un pedido nuevo: es tu control de calidad. Mirá los frames de verdad (desbordes, encimados, capas quietas que deberían moverse, texto ilegible) contra lo que dirigiste, y si trae un bloque «AUDITORÍA DE DIRECCIÓN», cada hallazgo se corrige (son mediciones, no opiniones). Todo bien y sin hallazgos → respondé EXACTAMENTE «APROBADO». Hay problemas → corregilos con las herramientas (ajustes puntuales) y terminá con «Corregí:» y una línea por arreglo.

${ESCUELA_GSAP}

# Traducción de nombres GSAP → este módulo (cuando te hablen en jerga GSAP)
none → lineal · sine/power1/power2/power3/power4/expo/circ .out → salidaSine/salidaQuad/salidaCubic/salidaQuart/salidaQuint/salidaExpo/salidaCirc (los .in → entrada*, los .inOut → entradaSalida*) · back.out/.in/.inOut → salidaBack/entradaBack/entradaSalidaBack · elastic.out/.in → salidaElastico/entradaElastico · bounce.out/.in → salidaPique/entradaPique · steps(n) → escalones · stagger.each (seg) → escalonado (ms) · stagger.amount → escalonado = total÷(n−1) · from: start/center/end/edges/random → ordenEscalonado inicio/centro/fin/bordes/azar · position "-=0.2"/"<"/">" del timeline → aritmética sobre el «en» (ver escuela §3) · keyframes → definir_pista · SplitText chars/words/lines → division caracteres/palabras/lineas · SplitText con mask → presets revelar/ocultar (máscara automática) · DrawSVG / trim paths → capas de trazo con trazar/retraer/borrar o pistas trazoInicio/trazoFin · wiggle → temblor de cámara (preset procedural) o pista multi-keyframe (escuela §4).

# El sistema donde ejecutás
- La composición es un LIENZO: las capas viven en coordenadas de mundo y pueden convivir varias pantallas (cada import de Figma se suma a la derecha). El render de ancho×alto px es LO QUE VE LA CÁMARA. Capas en z-order (primera = fondo), duración en ms.
- Capas: texto (con división por caracteres/palabras/lineas para escalonar; \\n = salto de línea real), forma (rect/elipse/línea), trazo (path vectorial que se anima con trim: presets trazar/retraer/borrar, o pistas trazoInicio/trazoFin 0-1), media.
- El revelado enmascarado clásico (cada palabra/línea sube dentro de su renglón): division palabras o lineas + entrada revelar con escalonado (salida: ocultar). La máscara es automática, no hay que crearla.
- Cámara de composición (definir_camara): keyframes de x/y (centro del encuadre en px) y zoom (1 = frame entero), más una base para el encuadre fijo. Para viajar entre pantallas y para paneos/zooms sobre la escena — NUNCA muevas capa por capa para simular cámara. REGLA DURA: si el pedido habla de la cámara o del encuadre («la cámara va hacia atrás/adelante», «te descubre/revela toda la escena», «zoom in/out», «acercarse/alejarse», «panear», «abrir el plano»), eso es SIEMPRE definir_camara — descubrir la escena = BAJAR el zoom con keyframes, acercarse = subirlo — y JAMÁS keyframes de posición/escala en una capa o un grupo para fingirlo: en el editor y en el export a AE la cámara es una sola pieza manejable, y las capas animadas a mano la arruinan. El estado te muestra los keyframes actuales con valores y easing: cuando te pidan retocar el movimiento (más lento, llegada más suave, otro orden), reescribí esas pistas conservando los ENCUADRES clave (los pares x/y/zoom donde la cámara se detiene) y ajustando tiempos y easings. Para vida de cámara constante (handheld documental, drift flotante) usá temblor en definir_camara ({preset: handheld|flotar|nervioso, intensidad, velocidad}): es procedural, va ENCIMA de los keyframes y no los toca — nunca simules handheld con keyframes densos. ENCUADRE: el render es ancho×alto y la cámara ve ancho/zoom × alto/zoom px del LIENZO; las pantallas viven en el lienzo con su propia caja (el estado la da para cada PLACA). Para encuadrar una pantalla o una sección: centro = centro de ESA caja/región, zoom = ancho_render / ancho_región (una landing de 1440 en un render de 1920 pide zoom ≥ 1.33 para no mostrar vacío a los costados; una sección de 700px, zoom ≈ 2.7). JAMÁS uses el centro del render (ancho/2, alto/2) como centro por defecto: la pantalla casi nunca está ahí. Al recorrer una página larga, bajá en y por secciones dejando cada encuadre un momento quieto (hold) y viajando con entradaSalida.
- Presets de entrada/salida con contrato de identidad: toda entrada TERMINA en la posición/opacidad base de la capa; la salida parte de ahí. Los offsets del preset son relativos — la posición base (x,y) de la capa no cambia por animar.
- Pistas crudas de keyframes (definir_pista) para trayectorias: valores ABSOLUTOS que pisan la base. Usalas para recorridos, holds y coreografía fina; usa presets para entradas/salidas estándar.
- El easing vive en el keyframe de SALIDA de cada tramo. hold congela el valor.
- MOTOR GSAP: además de los nombres de la casa, el campo easing acepta CUALQUIER spec de GSAP como string. Usalo cuando el carácter lo pida en vez de conformarte con el catálogo: overshoot a medida con back.out(N) (1.2 sutil, 4 exagerado cartoon), rebote elástico afinado con elastic.out(amplitud,periodo) (elastic.out(1,0.75) sereno, elastic.out(1.2,0.4) nervioso), bounce.out para caídas físicas, steps(N) para stop-motion del paso exacto, o una curva propia como path SVG («M0,0 C0.2,0 0.1,1 1,1»). Es tu herramienta para el VUELO fino: una referencia con un rebote particular se replica ajustando estos parámetros, no eligiendo el preset más parecido.
- El usuario después corrige a mano en el editor: preferí pocas ediciones bien elegidas a muchas microscópicas, y nombres de capa claros.
- DISEÑO (también es tu oficio): podés modificar el diseño de la pieza —color, tipografía (familia/peso/tamaño/interlineado/interletrado), alineación, tamaños de formas, posición— con editar_capa, y ARMAR PANTALLAS NUEVAS con derivar_pantalla: clona una pantalla existente (placa + capas) al lado de la última del lienzo conservando estructura, estilo Y ANIMACIÓN, y reemplaza los textos que le pases (un texto más largo achica el cuerpo para encajar). Respetá el bloque «ESTILO DE LA PIEZA» del primer mensaje: paleta, jerarquía tipográfica, márgenes y ritmo — una pantalla nueva tiene que parecer de la misma familia. Como la derivada hereda las entradas/salidas de la original, después solo ajustá tiempos (desdeMs para que suceda después, o retocá segmentos) y cámara si hace falta. Usá los ids nuevos que devuelve la herramienta para seguir editando lo derivado.
- FORMATO DEL RENDER: ancho/alto en ajustar_composicion SOLO cuando el usuario pide explícitamente cambiar el formato de la pieza («hacela vertical», «versión 9:16», «cuadrada para el feed»). «Más ancho», «más grande» o «que ocupe más» hablan de UNA capa (editar_capa) o de la cámara (definir_camara), nunca del formato. El estado te dice el formato actual (ancho×alto).

${catalogoParaPrompt()}

# Cómo trabajás
1. Mirá el estado: la composición COMPLETA ya viene en el primer mensaje, con el id de cada capa — las herramientas piden ese id EXACTO (jamás lo adivines desde el nombre). NO gastes un paso en ver_composicion de entrada: solo si perdiste el hilo tras muchas ediciones.
2. Ejecutá las herramientas necesarias — ops incrementales, nunca rehacer todo. Si una herramienta devuelve ERROR o AVISOS, corregite en el paso siguiente.
3. Si el pedido es ambiguo en alcance grande (borrar varias capas, rehacer todo), preguntá antes de ejecutar. Para dirección creativa normal, decidí vos: sos el director.
4. Terminá SIEMPRE con un resumen corto en castellano de qué hiciste y por qué (2-4 líneas, sin listar cada op). Si no ejecutaste nada, explicá qué falta.`;

export type TurnoAgente = { rol: "usuario" | "agente"; texto: string };

/** Evento de PROGRESO del loop: uno por iteración (llamada al modelo +
    herramientas ejecutadas) — el route lo streamea y el panel lo muestra
    en vivo con su log de tiempos. */
export type EventoAgente = {
  tipo: "paso";
  iteracion: number;
  /** ms que tardó la llamada al modelo de esta iteración */
  msModelo: number;
  /** resúmenes de las herramientas ejecutadas en esta iteración */
  ops: string[];
  /** tokens de ESTA llamada al modelo (para el log y el costo) */
  uso?: UsoTokens;
};

/** El PRIMER turno de usuario: estado + locución + estilo + referencias +
    pedido. Pura y exportada: qué ve el director es testeable. */
export function armarPrimerUsuario(
  comp: Composicion,
  mensaje: string,
  contextoAudio?: string,
  contextoEstilo?: string,
  contextoReferencias?: string,
): string {
  const estilo = describirEstilo(estiloDePieza(comp));
  return `Estado actual de la composición:\n${describir(comp)}\n${estilo ? `\n${estilo}\n` : ""}${
    contextoAudio
      ? `\nLA LOCUCIÓN de esta escena (cada palabra con el ms donde CAE — sincronizá: la entrada de cada elemento arranca en la palabra que le corresponde, los «en» de segmentos y keyframes caen EN estos tiempos, no aproximados):\n${contextoAudio}\n`
      : ""
  }${contextoEstilo ? `\n${contextoEstilo}\n` : ""}${
    contextoReferencias ? `\n${contextoReferencias}\n` : ""
  }\nPedido: ${mensaje}`;
}

export type RespuestaAgente =
  | {
      ok: true;
      respuesta: string;
      composicion: Composicion;
      ops: string[];
      /** tokens totales del pedido + el modelo que dirigió: el costo se
          calcula con costo-agente-puro */
      uso?: UsoTokens;
      modelo?: string;
    }
  | { ok: false; error: string };

export async function dirigirComposicion(
  composicion: Composicion,
  mensaje: string,
  historial: TurnoAgente[] = [],
  contextoAudio?: string,
  onEvento?: (evento: EventoAgente) => void,
  /** frames de la revisión visual: el director MIRA el render (multimodal) */
  imagenes?: ImagenRevision[],
  /** nivel elegido en el panel: «fino» = modelo de criterio (Opus) */
  nivel?: NivelDirector,
  /** el registro de la pieza (perilla de sensación del editor) */
  contextoEstilo?: string,
  /** referencias adjuntadas al chat: el texto que explica los frames que
      viajan en `imagenes` (contextoDeReferencias) */
  contextoReferencias?: string,
): Promise<RespuestaAgente> {
  let comp = composicion;
  const ops: string[] = [];

  const primerUsuario = armarPrimerUsuario(comp, mensaje, contextoAudio, contextoEstilo, contextoReferencias);

  const modelo = modeloDirector(
    {
      MOTION_AGENTE_MODELO: process.env.MOTION_AGENTE_MODELO,
      MOTION_AGENTE_MODELO_FINO: process.env.MOTION_AGENTE_MODELO_FINO,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    },
    nivel,
  );

  // ——— proveedor GEMINI (mismo prompt, mismas herramientas, otro loop) ———
  if (modelo.startsWith("gemini")) {
    if (!process.env.GEMINI_API_KEY) {
      return { ok: false, error: "Falta GEMINI_API_KEY en el entorno: el modelo elegido es Gemini (ver ENTREGA.md)" };
    }
    const res = await loopGemini({
      apiKey: process.env.GEMINI_API_KEY,
      modelo,
      sistema: SISTEMA,
      historial,
      primerUsuario,
      imagenes,
      herramientas: DEFINICIONES_HERRAMIENTAS as unknown as DefHerramienta[],
      maxIteraciones: MAX_ITERACIONES,
      ejecutar: (nombre, input) => {
        const r = ejecutarHerramienta(comp, nombre, input);
        comp = r.comp;
        if (r.resumen) ops.push(r.resumen);
        return { resultado: r.resultado, esError: r.esError, resumen: r.resumen };
      },
      onEvento,
    });
    return res.ok ? { ok: true, respuesta: res.respuesta, composicion: comp, ops, uso: res.uso, modelo } : res;
  }

  // ——— proveedor ANTHROPIC (el camino de siempre) ———
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "Falta ANTHROPIC_API_KEY en el entorno: el agente necesita la clave de la API de Claude (ver ENTREGA.md)",
    };
  }
  const cliente = new Anthropic();

  let usoTotal: UsoTokens = { entrada: 0, salida: 0 };
  const mensajes: Anthropic.MessageParam[] = [
    ...historial.slice(-12).map<Anthropic.MessageParam>((turno) => ({
      role: turno.rol === "usuario" ? "user" : "assistant",
      content: turno.texto,
    })),
    {
      role: "user",
      // con frames (revisión o referencia) el turno es multimodal: imágenes
      // + texto, con BREAKPOINT DE CACHÉ al final — 8 frames son ~4k tokens
      // de visión que el loop re-manda en CADA iteración: sin esto se pagan
      // a precio pleno por vuelta; con esto, cache-hit desde la segunda
      content: imagenes?.length
        ? [
            ...imagenes.map<Anthropic.ImageBlockParam>((im) => ({
              type: "image",
              source: { type: "base64", media_type: im.mime as "image/jpeg", data: im.datosBase64 },
            })),
            { type: "text", text: primerUsuario, cache_control: { type: "ephemeral" } },
          ]
        : primerUsuario,
    },
  ];

  for (let iteracion = 0; iteracion < MAX_ITERACIONES; iteracion++) {
    const t0 = Date.now();
    const respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: 16000,
      // el director «fino» piensa A FONDO: pensamiento adaptativo + esfuerzo
      // xhigh (el nivel de los trabajos agénticos largos). Los bloques de
      // pensamiento vuelven enteros en respuesta.content y se reenvían tal
      // cual en el turno siguiente (abajo), como pide la API. La revisión
      // visual y el nivel «rapido» sin Gemini van con el default del modelo:
      // mirar frames y retocar no paga el esfuerzo máximo.
      ...(nivel === "fino" ? { thinking: { type: "adaptive" as const }, output_config: { effort: "xhigh" as const } } : {}),
      system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
      tools: DEFINICIONES_HERRAMIENTAS as unknown as Anthropic.Tool[],
      messages: mensajes,
    });

    const msModelo = Date.now() - t0;
    const usoPaso: UsoTokens = {
      entrada: respuesta.usage.input_tokens,
      salida: respuesta.usage.output_tokens,
      cacheLectura: respuesta.usage.cache_read_input_tokens ?? 0,
      cacheEscritura: respuesta.usage.cache_creation_input_tokens ?? 0,
    };
    usoTotal = sumarUso(usoTotal, usoPaso);

    if (respuesta.stop_reason === "refusal") {
      return { ok: false, error: "El modelo declinó el pedido" };
    }

    const usosDeTools = respuesta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (respuesta.stop_reason !== "tool_use" || usosDeTools.length === 0) {
      onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: [], uso: usoPaso });
      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { ok: true, respuesta: texto || "Listo.", composicion: comp, ops, uso: usoTotal, modelo };
    }

    mensajes.push({ role: "assistant", content: respuesta.content });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    const opsIteracion: string[] = [];
    for (const uso of usosDeTools) {
      const res = ejecutarHerramienta(comp, uso.name, uso.input);
      comp = res.comp;
      if (res.resumen) ops.push(res.resumen);
      // el motivo del error viaja al log (antes «→ ERROR» a secas no decía nada)
      opsIteracion.push(
        res.esError
          ? `${uso.name} → ERROR: ${res.resultado.replace(/^ERROR: /, "").split("\n")[0].slice(0, 110)}`
          : (res.resumen ?? uso.name),
      );
      resultados.push({
        type: "tool_result",
        tool_use_id: uso.id,
        content: res.resultado,
        is_error: res.esError || undefined,
      });
    }
    mensajes.push({ role: "user", content: resultados });
    onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: opsIteracion, uso: usoPaso });
  }

  return {
    ok: true,
    respuesta: "Corté acá para no seguir en bucle — revisá lo aplicado y pedime el siguiente paso.",
    composicion: comp,
    ops,
    uso: usoTotal,
    modelo,
  };
}
