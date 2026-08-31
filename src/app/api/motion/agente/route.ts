/* -----------------------------------------------------------------------------
   Route handler del agente — POST /api/motion/agente

   Route handler (no server action) porque un turno del agente puede tardar
   más que lo cómodo para una action (§2.1 del kit). El snapshot viaja como
   string (§2.4) y el gate de permisos es el único camino (§2.3): acá el
   actor es andamiaje, diosa lo cablea a la sesión real.
----------------------------------------------------------------------------- */

import type { Actor } from "@/lib/motion/modelo";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";
import { exigirEdicion } from "@/lib/motion/consultas";
import { dirigirComposicion, type TurnoAgente } from "@/lib/motion/agente";
import { analizarVideoGemini } from "@/lib/motion/agente-gemini";
import { contextoConAnalisis, mimeParaGemini, promptAnalisisReferencia } from "@/lib/motion/referencias-puro";

export const maxDuration = 300;

// ANDAMIAJE: en diosa, el actor sale de la sesión.
async function actorDeSesion(): Promise<Actor> {
  return { id: "dev-local", rol: "admin", email: "dev@local" };
}

export async function POST(pedido: Request): Promise<Response> {
  try {
    const cuerpo = (await pedido.json()) as {
      composicionId?: string;
      snapshot?: string;
      mensaje?: string;
      historial?: TurnoAgente[];
      /** la locución de la escena: «palabra @ms» por línea (opcional) */
      contextoAudio?: string;
      /** frames de la revisión visual O de una referencia adjuntada al
          chat (JPEG/PNG/WebP base64, opcional) */
      imagenes?: { mime?: string; datosBase64?: string }[];
      /** el texto que explica los frames de referencia (opcional) */
      contextoReferencias?: string;
      /** el VIDEO de referencia entero, para que el ANALISTA (Gemini) lo
          vea frame a frame antes de dirigir (opcional) */
      videoReferencia?: { mime?: string; datosBase64?: string; nombre?: string; duracionMs?: number };
      /** nivel del panel: «fino» = Opus para el planteo, «rapido» = el
          modelo económico del entorno (default) */
      nivel?: string;
      /** el registro de la pieza (perilla de sensación), opcional */
      contextoEstilo?: string;
    };
    if (!cuerpo.snapshot || !cuerpo.mensaje) {
      return Response.json({ error: "Faltan snapshot o mensaje" }, { status: 400 });
    }

    const actor = await actorDeSesion();
    const gate = await exigirEdicion(actor, cuerpo.composicionId ?? "demo");
    if (!gate.ok) {
      return Response.json({ error: gate.error }, { status: 403 });
    }

    const composicion = deserializar(cuerpo.snapshot);
    const contextoAudio =
      typeof cuerpo.contextoAudio === "string" && cuerpo.contextoAudio ? cuerpo.contextoAudio.slice(0, 8000) : undefined;
    // frames saneados (revisión o referencia): pocos, chicos y de tipos
    // conocidos — 12 banca una referencia de 8 frames + margen
    const imagenes = (cuerpo.imagenes ?? [])
      .filter(
        (im): im is { mime: string; datosBase64: string } =>
          (im.mime === "image/jpeg" || im.mime === "image/png" || im.mime === "image/webp") &&
          typeof im.datosBase64 === "string" &&
          im.datosBase64.length > 0 &&
          im.datosBase64.length < 3_000_000,
      )
      .slice(0, 12);
    const contextoReferencias =
      typeof cuerpo.contextoReferencias === "string" && cuerpo.contextoReferencias
        ? cuerpo.contextoReferencias.slice(0, 4000)
        : undefined;
    // el VIDEO para el analista, saneado: mime que Gemini declare y tamaño
    // inline (el base64 infla ×1.37; 19M chars ≈ 14MB de archivo)
    const videoCrudo = cuerpo.videoReferencia;
    const mimeVideo = typeof videoCrudo?.mime === "string" ? mimeParaGemini(videoCrudo.mime) : "";
    const videoReferencia =
      videoCrudo && mimeVideo && typeof videoCrudo.datosBase64 === "string" &&
      videoCrudo.datosBase64.length > 0 && videoCrudo.datosBase64.length < 19_000_000
        ? {
            mime: mimeVideo,
            datosBase64: videoCrudo.datosBase64,
            nombre: typeof videoCrudo.nombre === "string" ? videoCrudo.nombre.slice(0, 120) : "referencia",
            duracionMs: typeof videoCrudo.duracionMs === "number" ? videoCrudo.duracionMs : undefined,
          }
        : undefined;
    const nivel = cuerpo.nivel === "fino" || cuerpo.nivel === "rapido" ? cuerpo.nivel : undefined;
    const contextoEstilo =
      typeof cuerpo.contextoEstilo === "string" && cuerpo.contextoEstilo ? cuerpo.contextoEstilo.slice(0, 600) : undefined;

    // STREAM NDJSON: un evento {tipo:"paso"} por iteración del loop (el panel
    // muestra el progreso EN VIVO y arma el log con tiempos — un pedido
    // grande tarda minutos y esperar a ciegas parecía un cuelgue) y al final
    // {tipo:"fin"} con la respuesta completa de siempre.
    const codificador = new TextEncoder();
    const mensaje = cuerpo.mensaje;
    const historial = cuerpo.historial ?? [];
    const stream = new ReadableStream({
      async start(controlador) {
        const emitir = (e: unknown) => controlador.enqueue(codificador.encode(JSON.stringify(e) + "\n"));
        try {
          // ——— EL ANALISTA primero: Gemini (barato) VE el video de la
          // referencia completo y destila la coreografía; el director
          // dirige con ese análisis como lectura principal. Sin key o con
          // fallo, degrada a los frames de siempre — avisado, nunca roto.
          let contextoFinal = contextoReferencias;
          if (videoReferencia) {
            if (!process.env.GEMINI_API_KEY) {
              emitir({ tipo: "analisis", error: "sin GEMINI_API_KEY: la referencia va solo por frames (el analista de video necesita Gemini)" });
            } else {
              const t0 = Date.now();
              const analisis = await analizarVideoGemini({
                apiKey: process.env.GEMINI_API_KEY,
                modelo: process.env.MOTION_REFERENCIA_MODELO || "gemini-3.6-flash",
                mime: videoReferencia.mime,
                datosBase64: videoReferencia.datosBase64,
                prompt: promptAnalisisReferencia(videoReferencia.nombre, videoReferencia.duracionMs),
              });
              if (analisis.ok) {
                contextoFinal = contextoConAnalisis(contextoReferencias ?? "", analisis.texto, analisis.modelo);
                console.log(`[agente] analista de referencia: ${analisis.modelo} · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
                emitir({ tipo: "analisis", modelo: analisis.modelo, uso: analisis.uso, ms: Date.now() - t0, resumen: analisis.texto.slice(0, 240) });
              } else {
                console.log(`[agente] analista de referencia FALLÓ: ${analisis.error}`);
                emitir({ tipo: "analisis", error: analisis.error });
              }
            }
          }
          const res = await dirigirComposicion(
            composicion,
            mensaje,
            historial,
            contextoAudio,
            (evento) => {
              console.log(`[agente] paso ${evento.iteracion} · modelo ${(evento.msModelo / 1000).toFixed(1)}s · ${evento.ops.join(" | ") || "respuesta final"}`);
              emitir(evento);
            },
            imagenes.length ? imagenes : undefined,
            nivel,
            contextoEstilo,
            contextoFinal,
          );
          if (!res.ok) emitir({ tipo: "fin", error: res.error });
          else emitir({ tipo: "fin", respuesta: res.respuesta, snapshot: serializar(res.composicion), ops: res.ops, uso: res.uso, modelo: res.modelo });
        } catch (e) {
          emitir({ tipo: "fin", error: e instanceof Error ? e.message : "Error inesperado del agente" });
        }
        controlador.close();
      },
    });
    return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8" } });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error inesperado del agente";
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
