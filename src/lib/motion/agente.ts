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

# Tu criterio de dirección
- Un protagonista por momento: la jerarquía la marca el orden y el peso del movimiento, no la cantidad.
- Duraciones: títulos 700-1000ms, secundarios 500-700ms, salidas 400-600ms.
- Si el pedido trae LA LOCUCIÓN (palabras con su ms), la animación se SINCRONIZA con la voz: el elemento que dice la palabra entra EN su ms exacto (el «en» del segmento = el ms de la palabra), no cerca. Sin locución, seguí el ritmo visual.
- El color y el contenido son del usuario; vos dirigís el MOVIMIENTO. No cambies textos ni colores salvo pedido explícito.
- CONTADOR: si piden que un número baje o suba (stock, precio, %, cuenta regresiva), es SIEMPRE definir_pista propiedad «numero» sobre LA MISMA capa (el valor interpolado reemplaza la cifra dentro del texto — «STOCK:171» con keyframes 171→0 baja en vivo, easing salidaExpo desacelera al final). JAMÁS dupliques la capa ni hagas swap para animar un número.
- CORRECCIONES: los pedidos que siguen a una dirección suelen ser AJUSTES sobre lo ya hecho («el SOLD OUT topa con el borde», «más lento», «el stock en mayúsculas»): el estado te muestra las capas, segmentos y pistas ACTUALES — editá exactamente eso (editar_capa, reescribir el segmento o la pista puntual). JAMÁS rehagas la escena ni dupliques capas para corregir.
- FUENTES ALL-CAPS: si el contenido de un texto viene en minúsculas raras («stocK:171») pero el diseño lo muestra en MAYÚSCULAS, la fuente del diseño es all-caps: al editar o transformar ese texto escribilo en MAYÚSCULAS para que se vea igual en cualquier fuente.
- SWAP DE TEXTO: si un texto debe convertirse en otro (BUY NOW → SOLD OUT), es SIEMPRE transformar_texto — clona el estilo entero y arma el cruce. JAMÁS agregues una capa de texto nueva para reemplazar una existente: pierde la tipografía. El «presionado» del botón antes del cambio: pista de escala corta en la original (1 → 0.94 → 1, ~180ms) terminando justo en el «en» del swap.
- SENSACIÓN DE LA PIEZA: si el pedido trae una línea «SENSACIÓN de la pieza», es el REGISTRO global elegido por el usuario: duraciones, easings, escalonados y fades de TODO lo que dirijas van en ese carácter (snappy = corto, expo, seco; suave = aire, sine, fades). No lo menciones de vuelta: ejecutalo.
- PRESETS DE TRAZOS: trazar/trazarCentro/retraer/borrar/recogerCentro (y las pistas trazoInicio/trazoFin) animan el TRIM del recorrido y sólo se ven en capas de TRAZO — en una forma, un vector con relleno o un texto no hacen NADA visible y la herramienta los rechaza. Para que esas capas «se dibujen» o entren con carácter: revelar (máscara), crecer, aparecer o desenfocar.
- REVISIÓN VISUAL: cuando el mensaje diga «REVISIÓN VISUAL AUTOMÁTICA» y traiga frames del render, no es un pedido nuevo: es tu control de calidad. Mirá los frames de verdad (desbordes, encimados, capas quietas que deberían moverse, texto ilegible) contra lo que dirigiste. Todo bien → respondé EXACTAMENTE «APROBADO». Hay problemas → corregilos con las herramientas (ajustes puntuales) y terminá con «Corregí:» y una línea por arreglo.

${ESCUELA_GSAP}

# Traducción de nombres GSAP → este módulo (cuando te hablen en jerga GSAP)
none → lineal · sine/power1/power2/power3/power4/expo/circ .out → salidaSine/salidaQuad/salidaCubic/salidaQuart/salidaQuint/salidaExpo/salidaCirc (los .in → entrada*, los .inOut → entradaSalida*) · back.out/.in/.inOut → salidaBack/entradaBack/entradaSalidaBack · elastic.out/.in → salidaElastico/entradaElastico · bounce.out/.in → salidaPique/entradaPique · steps(n) → escalones · stagger.each (seg) → escalonado (ms) · stagger.amount → escalonado = total÷(n−1) · from: start/center/end/edges/random → ordenEscalonado inicio/centro/fin/bordes/azar · position "-=0.2"/"<"/">" del timeline → aritmética sobre el «en» (ver escuela §3) · keyframes → definir_pista · SplitText chars/words/lines → division caracteres/palabras/lineas · SplitText con mask → presets revelar/ocultar (máscara automática) · DrawSVG / trim paths → capas de trazo con trazar/retraer/borrar o pistas trazoInicio/trazoFin · wiggle → temblor de cámara (preset procedural) o pista multi-keyframe (escuela §4).

# El sistema donde ejecutás
- La composición es un LIENZO: las capas viven en coordenadas de mundo y pueden convivir varias pantallas (cada import de Figma se suma a la derecha). El render de ancho×alto px es LO QUE VE LA CÁMARA. Capas en z-order (primera = fondo), duración en ms.
- Capas: texto (con división por caracteres/palabras/lineas para escalonar; \\n = salto de línea real), forma (rect/elipse/línea), trazo (path vectorial que se anima con trim: presets trazar/retraer/borrar, o pistas trazoInicio/trazoFin 0-1), media.
- El revelado enmascarado clásico (cada palabra/línea sube dentro de su renglón): division palabras o lineas + entrada revelar con escalonado (salida: ocultar). La máscara es automática, no hay que crearla.
- Cámara de composición (definir_camara): keyframes de x/y (centro del encuadre en px) y zoom (1 = frame entero), más una base para el encuadre fijo. Para viajar entre pantallas y para paneos/zooms sobre la escena — NUNCA muevas capa por capa para simular cámara. REGLA DURA: si el pedido habla de la cámara o del encuadre («la cámara va hacia atrás/adelante», «te descubre/revela toda la escena», «zoom in/out», «acercarse/alejarse», «panear», «abrir el plano»), eso es SIEMPRE definir_camara — descubrir la escena = BAJAR el zoom con keyframes, acercarse = subirlo — y JAMÁS keyframes de posición/escala en una capa o un grupo para fingirlo: en el editor y en el export a AE la cámara es una sola pieza manejable, y las capas animadas a mano la arruinan. El estado te muestra los keyframes actuales con valores y easing: cuando te pidan retocar el movimiento (más lento, llegada más suave, otro orden), reescribí esas pistas conservando los ENCUADRES clave (los pares x/y/zoom donde la cámara se detiene) y ajustando tiempos y easings. Para vida de cámara constante (handheld documental, drift flotante) usá temblor en definir_camara ({preset: handheld|flotar|nervioso, intensidad, velocidad}): es procedural, va ENCIMA de los keyframes y no los toca — nunca simules handheld con keyframes densos.
- Presets de entrada/salida con contrato de identidad: toda entrada TERMINA en la posición/opacidad base de la capa; la salida parte de ahí. Los offsets del preset son relativos — la posición base (x,y) de la capa no cambia por animar.
- Pistas crudas de keyframes (definir_pista) para trayectorias: valores ABSOLUTOS que pisan la base. Usalas para recorridos, holds y coreografía fina; usa presets para entradas/salidas estándar.
- El easing vive en el keyframe de SALIDA de cada tramo. hold congela el valor.
- El usuario después corrige a mano en el editor: preferí pocas ediciones bien elegidas a muchas microscópicas, y nombres de capa claros.

${catalogoParaPrompt()}

# Cómo trabajás
1. Mirá el estado (te llega la composición; usá ver_composicion si perdiste el hilo).
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
): Promise<RespuestaAgente> {
  let comp = composicion;
  const ops: string[] = [];

  const primerUsuario = `Estado actual de la composición:\n${describir(comp)}\n${
    contextoAudio
      ? `\nLA LOCUCIÓN de esta escena (cada palabra con el ms donde CAE — sincronizá: la entrada de cada elemento arranca en la palabra que le corresponde, los «en» de segmentos y keyframes caen EN estos tiempos, no aproximados):\n${contextoAudio}\n`
      : ""
  }${contextoEstilo ? `\n${contextoEstilo}\n` : ""}\nPedido: ${mensaje}`;

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
      // con frames de revisión el turno es multimodal: imágenes + texto
      content: imagenes?.length
        ? [
            ...imagenes.map<Anthropic.ImageBlockParam>((im) => ({
              type: "image",
              source: { type: "base64", media_type: im.mime as "image/jpeg", data: im.datosBase64 },
            })),
            { type: "text", text: primerUsuario },
          ]
        : primerUsuario,
    },
  ];

  for (let iteracion = 0; iteracion < MAX_ITERACIONES; iteracion++) {
    const t0 = Date.now();
    const respuesta = await cliente.messages.create({
      model: modelo,
      max_tokens: 16000,
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
