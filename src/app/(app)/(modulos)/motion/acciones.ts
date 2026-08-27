"use server";

/* -----------------------------------------------------------------------------
   Server actions del módulo motion

   El actor acá es ANDAMIAJE (diosa lo saca de la sesión real al integrar);
   todo lo demás es el flujo definitivo: gate único → validar → escribir.
   El snapshot entra como string (§2.4 del kit).
----------------------------------------------------------------------------- */

import type { Actor } from "@/lib/motion/modelo";
import { cargarComposicion, guardarComposicion } from "@/lib/motion/consultas";

// ANDAMIAJE: en diosa, `actorDeSesion()` viene del sistema de auth.
async function actorDeSesion(): Promise<Actor> {
  return { id: "dev-local", rol: "admin", email: "dev@local" };
}

export async function cargarComposicionAction(
  composicionId: string,
): Promise<{ snapshot: string } | null> {
  const actor = await actorDeSesion();
  const comp = await cargarComposicion(actor, composicionId);
  if (!comp) return null;
  const { serializar } = await import("@/lib/motion/serializar-puro");
  return { snapshot: serializar(comp) };
}

export async function guardarComposicionAction(
  composicionId: string,
  snapshot: string,
  baseRev: number,
): Promise<
  | { ok: true; rev: number; fusionada?: string }
  | { ok: false; error: string }
> {
  const actor = await actorDeSesion();
  return guardarComposicion(actor, composicionId, snapshot, baseRev);
}
