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
    const res = await dirigirComposicion(composicion, cuerpo.mensaje, cuerpo.historial ?? []);
    if (!res.ok) {
      return Response.json({ error: res.error }, { status: 503 });
    }
    return Response.json({
      respuesta: res.respuesta,
      snapshot: serializar(res.composicion),
      ops: res.ops,
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "Error inesperado del agente";
    return Response.json({ error: mensaje }, { status: 500 });
  }
}
