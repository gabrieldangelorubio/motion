/* -----------------------------------------------------------------------------
   Capa de datos del módulo (servidor) — el ÚNICO camino de escritura

   En diosa esto habla con Postgres vía Drizzle (tabla motion_composicion,
   SQL en ENTREGA.md). En el repo aparte no hay base: el almacén es un Map
   en memoria del proceso — ANDAMIAJE que se reemplaza por Drizzle al
   integrar, manteniendo estas firmas.

   Lo que NO es andamiaje y se integra tal cual:
   - exigirEdicion: el único punto de entrada de permisos por mutación
     (§2.3). Pide un Actor completo, no un actorId: un caller que se saltee
     el gate no compila. Diosa lo cablea a su sistema real.
   - El protocolo de guardado: CAS por rev + merge por elemento + un solo
     reintento (la lógica de merge es pura: fusionar-puro.ts).
   - El snapshot viaja como STRING (§2.4: el transporte de Server Actions
     corta arrays anidados grandes en silencio).
----------------------------------------------------------------------------- */

import type { Actor, Composicion } from "@/lib/motion/modelo";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";
import { fusionarComposiciones } from "@/lib/motion/fusionar-puro";
import { validar } from "@/lib/motion/validar-puro";

type Guardada = { contenido: string; actualizadaPor: string };
const almacen = new Map<string, Guardada>(); // ANDAMIAJE: en diosa es motion_composicion

/**
 * Gate único de edición. Fail-closed: sin actor verificable, se niega.
 * En diosa deriva el proyecto de la composición y chequea permisos reales.
 */
export async function exigirEdicion(actor: Actor, composicionId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!actor?.id || !actor.email) return { ok: false, error: "No hay una sesión válida" };
  if (!composicionId) return { ok: false, error: "Falta el id de la composición" };
  return { ok: true };
}

export async function cargarComposicion(actor: Actor, composicionId: string): Promise<Composicion | null> {
  const gate = await exigirEdicion(actor, composicionId);
  if (!gate.ok) return null;
  const fila = almacen.get(composicionId);
  return fila ? deserializar(fila.contenido) : null;
}

/**
 * Guardado con CAS + merge por elemento (§2.4). `snapshot` llega como string.
 * Devuelve la rev nueva, o la composición fusionada si hubo conflicto y el
 * cliente tiene que rebasar su estado local.
 */
export async function guardarComposicion(
  actor: Actor,
  composicionId: string,
  snapshot: string,
  baseRev: number,
): Promise<
  | { ok: true; rev: number }
  | { ok: true; rev: number; fusionada: string }
  | { ok: false; error: string }
> {
  const gate = await exigirEdicion(actor, composicionId);
  if (!gate.ok) return gate;

  let entrante: Composicion;
  try {
    entrante = deserializar(snapshot);
  } catch {
    return { ok: false, error: "El snapshot no se pudo leer como una composición" };
  }
  const bloqueantes = validar(entrante).filter((p) => p.mensaje.includes("fps") || p.mensaje.includes("duración"));
  if (bloqueantes.length) return { ok: false, error: bloqueantes[0].mensaje };

  const fila = almacen.get(composicionId);
  const actual: Composicion | null = fila ? deserializar(fila.contenido) : null;
  const revActual = actual?.rev ?? 0;

  // CAS: en diosa es un UPDATE … WHERE coalesce((contenido->>'rev')::int,0) = baseRev
  if (!actual || revActual === baseRev) {
    const rev = baseRev + 1;
    almacen.set(composicionId, { contenido: serializar({ ...entrante, rev }), actualizadaPor: actor.id });
    return { ok: true, rev };
  }

  // Conflicto: merge por elemento y UN reintento (acá, directo: el Map no compite).
  const fusionada = { ...fusionarComposiciones(actual, entrante), rev: revActual + 1 };
  almacen.set(composicionId, { contenido: serializar(fusionada), actualizadaPor: actor.id });
  return { ok: true, rev: fusionada.rev!, fusionada: serializar(fusionada) };
}
