/* -----------------------------------------------------------------------------
   Serialización con versión de esquema y migración

   La composición guardada hoy tiene que abrirse en seis meses (§10.2 del
   kit). Por eso el JSON lleva `version` desde el día uno y TODO cambio de
   esquema suma un paso en `migrar` — nunca se edita un paso viejo. El
   snapshot viaja al server como STRING (el transporte de Server Actions
   corta arrays anidados grandes en silencio — §2.4).
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";
import { ordenarKeyframes } from "@/lib/motion/keyframes-puro";

export const VERSION_ACTUAL = 1;

export function serializar(comp: Composicion): string {
  return JSON.stringify(comp);
}

/**
 * Migra un JSON de cualquier versión anterior al esquema actual.
 * Cada paso migra n → n+1; se encadenan.
 */
export function migrar(datos: unknown): Composicion {
  if (typeof datos !== "object" || datos === null) {
    throw new Error("La composición guardada no es un objeto");
  }
  const obj = datos as Record<string, unknown>;
  const version = typeof obj.version === "number" ? obj.version : 0;

  let actual = obj;
  if (version === 0) {
    // v0 → v1: los prototipos previos al esquema no llevaban versión ni fps.
    actual = { fps: 30, ...actual, version: 1 };
  }
  if ((actual.version as number) !== VERSION_ACTUAL) {
    throw new Error(`Versión de composición desconocida: ${String(actual.version)}`);
  }
  return normalizar(actual as unknown as Composicion);
}

export function deserializar(json: string): Composicion {
  return migrar(JSON.parse(json));
}

/** Defensas baratas sobre datos que vienen de afuera: ordena keyframes, completa defaults. */
function normalizar(comp: Composicion): Composicion {
  return {
    ...comp,
    capas: (comp.capas ?? []).map((capa) => ({
      ...capa,
      pistas: capa.pistas
        ? Object.fromEntries(
            Object.entries(capa.pistas).map(([k, v]) => [k, v ? ordenarKeyframes(v) : v]),
          )
        : undefined,
    })),
    camara: comp.camara
      ? {
          pistas: Object.fromEntries(
            Object.entries(comp.camara.pistas ?? {}).map(([k, v]) => [k, v ? ordenarKeyframes(v) : v]),
          ),
        }
      : undefined,
  };
}
