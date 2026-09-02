/* -----------------------------------------------------------------------------
   Route handler de guardado — POST /api/motion/composicion

   Para snapshots GRANDES (rasters de Figma): la server action no puede
   recibir strings de más de 1e6 caracteres (tope de React Flight al
   decodificar argumentos), así que el editor manda estos por acá, con el
   body crudo. Mismo gate, misma función de guardado (CAS + fusión) y misma
   respuesta que la action: el editor no distingue el camino salvo por el
   tamaño (persistencia-puro). El actor es andamiaje; diosa lo cablea.
----------------------------------------------------------------------------- */

import type { Actor } from "@/lib/motion/modelo";
import { exigirEdicion, guardarComposicion } from "@/lib/motion/consultas";

// ANDAMIAJE: en diosa, el actor sale de la sesión.
async function actorDeSesion(): Promise<Actor> {
  return { id: "dev-local", rol: "admin", email: "dev@local" };
}

export async function POST(pedido: Request): Promise<Response> {
  let cuerpo: { composicionId?: string; snapshot?: string; baseRev?: number };
  try {
    cuerpo = (await pedido.json()) as typeof cuerpo;
  } catch {
    return Response.json({ ok: false, error: "El body no es JSON" }, { status: 400 });
  }
  if (typeof cuerpo.composicionId !== "string" || typeof cuerpo.snapshot !== "string") {
    return Response.json({ ok: false, error: "Faltan composicionId o snapshot" }, { status: 400 });
  }
  const actor = await actorDeSesion();
  const gate = await exigirEdicion(actor, cuerpo.composicionId);
  if (!gate.ok) return Response.json({ ok: false, error: gate.error }, { status: 403 });
  const res = await guardarComposicion(actor, cuerpo.composicionId, cuerpo.snapshot, Number(cuerpo.baseRev ?? 0));
  return Response.json(res, { status: res.ok ? 200 : 409 });
}
