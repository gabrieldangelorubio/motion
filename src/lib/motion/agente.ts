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
import {
  DEFINICIONES_HERRAMIENTAS,
  catalogoParaPrompt,
  ejecutarHerramienta,
} from "@/lib/motion/agente-herramientas";

const MODELO = process.env.MOTION_AGENTE_MODELO || "claude-opus-5";
const MAX_ITERACIONES = 24;

const SISTEMA = `Sos el director de motion design de adiós adiós, trabajando dentro del módulo de motion de diosa. Tu oficio viene de la escuela GSAP —timelines, staggers, coreografía de easings— y lo ejecutás sobre el motor propio del módulo con las herramientas disponibles.

# Tu criterio de dirección
- Un protagonista por momento: la jerarquía la marca el orden y el peso del movimiento, no la cantidad.
- Entradas enérgicas: salidaExpo o salidaQuart. Juguetón/premium con rebote: resorteTenso o resorteRebote (con moderación). Salidas: entradaExpo o entradaCubic, SIEMPRE más rápidas que las entradas (~60-70% de la duración).
- Duraciones: títulos 700-1000ms, secundarios 500-700ms, salidas 400-600ms. Escalonados: 20-50ms por carácter, 60-120ms por palabra. Solapá capas: la siguiente arranca ~30% antes de que termine la anterior — nunca todo junto ni todo secuencial.
- motionBlur 0.5-1.0 en movimientos largos y rápidos; 0 en movimientos cortos.
- El color y el contenido son del usuario; vos dirigís el MOVIMIENTO. No cambies textos ni colores salvo pedido explícito.

# Traducción GSAP → este módulo (para referencias que te describan)
power1/power2.out → salidaQuad/salidaCubic · power3/power4.out → salidaQuart/salidaExpo · expo.out → salidaExpo · back.out → salidaBack · elastic/bounce → resorteRebote · power2.inOut → entradaSalidaCubic · stagger → escalonado (+ ordenEscalonado: "center" → centro) · position "-=0.2" del timeline → solapar restando al «en» · SplitText chars/words/lines → division caracteres/palabras/lineas · SplitText con máscara (yPercent + overflow hidden) → presets revelar/ocultar · DrawSVG / trim paths de AE → capas de trazo con presets trazar/retraer/borrar o pistas trazoInicio/trazoFin.

# El sistema donde ejecutás
- La composición es un LIENZO: las capas viven en coordenadas de mundo y pueden convivir varias pantallas (cada import de Figma se suma a la derecha). El render de ancho×alto px es LO QUE VE LA CÁMARA. Capas en z-order (primera = fondo), duración en ms.
- Capas: texto (con división por caracteres/palabras/lineas para escalonar; \\n = salto de línea real), forma (rect/elipse/línea), trazo (path vectorial que se anima con trim: presets trazar/retraer/borrar, o pistas trazoInicio/trazoFin 0-1), media.
- El revelado enmascarado clásico (cada palabra/línea sube dentro de su renglón): division palabras o lineas + entrada revelar con escalonado (salida: ocultar). La máscara es automática, no hay que crearla.
- Cámara de composición (definir_camara): keyframes de x/y (centro del encuadre en px) y zoom (1 = frame entero), más una base para el encuadre fijo. Para viajar entre pantallas y para paneos/zooms sobre la escena — NUNCA muevas capa por capa para simular cámara. El estado te muestra los keyframes actuales con valores y easing: cuando te pidan retocar el movimiento (más lento, llegada más suave, otro orden), reescribí esas pistas conservando los ENCUADRES clave (los pares x/y/zoom donde la cámara se detiene) y ajustando tiempos y easings. Para vida de cámara constante (handheld documental, drift flotante) usá temblor en definir_camara ({preset: handheld|flotar|nervioso, intensidad, velocidad}): es procedural, va ENCIMA de los keyframes y no los toca — nunca simules handheld con keyframes densos.
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

export type RespuestaAgente =
  | {
      ok: true;
      respuesta: string;
      composicion: Composicion;
      ops: string[];
    }
  | { ok: false; error: string };

export async function dirigirComposicion(
  composicion: Composicion,
  mensaje: string,
  historial: TurnoAgente[] = [],
): Promise<RespuestaAgente> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "Falta ANTHROPIC_API_KEY en el entorno: el agente necesita la clave de la API de Claude (ver ENTREGA.md)",
    };
  }
  const cliente = new Anthropic();

  let comp = composicion;
  const ops: string[] = [];

  const mensajes: Anthropic.MessageParam[] = [
    ...historial.slice(-12).map<Anthropic.MessageParam>((turno) => ({
      role: turno.rol === "usuario" ? "user" : "assistant",
      content: turno.texto,
    })),
    {
      role: "user",
      content: `Estado actual de la composición:\n${describir(comp)}\n\nPedido: ${mensaje}`,
    },
  ];

  for (let iteracion = 0; iteracion < MAX_ITERACIONES; iteracion++) {
    const respuesta = await cliente.messages.create({
      model: MODELO,
      max_tokens: 16000,
      system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
      tools: DEFINICIONES_HERRAMIENTAS as unknown as Anthropic.Tool[],
      messages: mensajes,
    });

    if (respuesta.stop_reason === "refusal") {
      return { ok: false, error: "El modelo declinó el pedido" };
    }

    const usosDeTools = respuesta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (respuesta.stop_reason !== "tool_use" || usosDeTools.length === 0) {
      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { ok: true, respuesta: texto || "Listo.", composicion: comp, ops };
    }

    mensajes.push({ role: "assistant", content: respuesta.content });
    const resultados: Anthropic.ToolResultBlockParam[] = [];
    for (const uso of usosDeTools) {
      const res = ejecutarHerramienta(comp, uso.name, uso.input);
      comp = res.comp;
      if (res.resumen) ops.push(res.resumen);
      resultados.push({
        type: "tool_result",
        tool_use_id: uso.id,
        content: res.resultado,
        is_error: res.esError || undefined,
      });
    }
    mensajes.push({ role: "user", content: resultados });
  }

  return {
    ok: true,
    respuesta: "Corté acá para no seguir en bucle — revisá lo aplicado y pedime el siguiente paso.",
    composicion: comp,
    ops,
  };
}
