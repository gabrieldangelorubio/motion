/* -----------------------------------------------------------------------------
   Route handler del agente — POST /api/motion/agente

   Route handler (no server action) porque un turno del agente puede tardar
   más que lo cómodo para una action (§2.1 del kit). El snapshot viaja como
   string (§2.4) y el gate de permisos es el único camino (§2.3): acá el
   actor es andamiaje, diosa lo cablea a la sesión real.
----------------------------------------------------------------------------- */

import { catalogoDeModelos, esModeloDelCatalogo } from "@/lib/motion/modelos-director-puro";
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

// el catálogo lee el entorno en cada pedido: sin esto Next lo evaluaría
// una vez al build y una clave nueva no aparecería hasta rebuildear
export const dynamic = "force-dynamic";

/** El catálogo de modelos que este servidor puede correr (según las
    claves cargadas): el panel arma su desplegable con esto. */
export async function GET(): Promise<Response> {
  return Response.json(catalogoDeModelos(envDirector()));
}

/** Solo las variables que el catálogo mira (process.env entero no tipa). */
function envDirector() {
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    MOTION_AGENTE_MODELO: process.env.MOTION_AGENTE_MODELO,
    MOTION_AGENTE_MODELO_FINO: process.env.MOTION_AGENTE_MODELO_FINO,
  };
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
      /** lectura de pantalla: el bloque que explica las imágenes del diseño
          que van PRIMERAS en `imagenes` (opcional) */
      contextoLectura?: string;
      /** el VIDEO de referencia entero, para que el ANALISTA (Gemini) lo
          vea frame a frame antes de dirigir (opcional) */
      videoReferencia?: { mime?: string; datosBase64?: string; nombre?: string; duracionMs?: number };
      /** nivel del panel: «fino» = Opus para el planteo, «rapido» = el
          modelo económico del entorno (default) */
      nivel?: string;
      /** slider de pensamiento del panel: bajo | medio | alto */
      pensamiento?: string;
      /** el modelo elegido en el desplegable del panel (un id del
          catálogo de GET; si no viene, el default del entorno) */
      modelo?: string;
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
    // conocidos — 14 banca la lectura de pantalla (6) + una referencia de 8
    const imagenes = (cuerpo.imagenes ?? [])
      .filter(
        (im): im is { mime: string; datosBase64: string } =>
          (im.mime === "image/jpeg" || im.mime === "image/png" || im.mime === "image/webp") &&
          typeof im.datosBase64 === "string" &&
          im.datosBase64.length > 0 &&
          im.datosBase64.length < 3_000_000,
      )
      .slice(0, 14);
    const contextoReferencias =
      typeof cuerpo.contextoReferencias === "string" && cuerpo.contextoReferencias
        ? cuerpo.contextoReferencias.slice(0, 4000)
        : undefined;
    const contextoLectura =
      typeof cuerpo.contextoLectura === "string" && cuerpo.contextoLectura ? cuerpo.contextoLectura.slice(0, 4000) : undefined;
    // el VIDEO para el analista, saneado: mime que Gemini declare y tamaño
    // inline (el base64 infla ×4/3: 19M chars ≈ 14MB de archivo). OJO: el
    // bodySizeLimit de next.config es de SERVER ACTIONS y no protege este
    // route handler — el límite real del body lo pone la plataforma
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
    const pensamiento =
      cuerpo.pensamiento === "bajo" || cuerpo.pensamiento === "medio" || cuerpo.pensamiento === "alto" ? cuerpo.pensamiento : undefined;
    // solo ids del catálogo: nadie manda un modelo arbitrario por el body
    const catalogo = catalogoDeModelos(envDirector());
    const modeloElegido = esModeloDelCatalogo(catalogo, cuerpo.modelo) ? cuerpo.modelo : undefined;
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
                modelo: process.env.MOTION_REFERENCIA_MODELO || "gemini-3.8-flash",
                mime: videoReferencia.mime,
                datosBase64: videoReferencia.datosBase64,
                prompt: promptAnalisisReferencia(videoReferencia.nombre, videoReferencia.duracionMs),
              });
              if (analisis.ok) {
                // el análisis con tope, como todo contexto del route (un
                // video largo puede producir una lectura interminable)
                contextoFinal = contextoConAnalisis(contextoReferencias ?? "", analisis.texto.slice(0, 8000), analisis.modelo);
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
            contextoLectura,
            pensamiento,
            modeloElegido,
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
