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
      /** frames de la revisión visual (JPEG/PNG/WebP base64, opcional) */
      imagenes?: { mime?: string; datosBase64?: string }[];
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
    // frames de revisión saneados: pocos, chicos y de tipos conocidos
    const imagenes = (cuerpo.imagenes ?? [])
      .filter(
        (im): im is { mime: string; datosBase64: string } =>
          (im.mime === "image/jpeg" || im.mime === "image/png" || im.mime === "image/webp") &&
          typeof im.datosBase64 === "string" &&
          im.datosBase64.length > 0 &&
          im.datosBase64.length < 3_000_000,
      )
      .slice(0, 6);

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
