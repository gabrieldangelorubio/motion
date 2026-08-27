/* -----------------------------------------------------------------------------
   Escenas — la jerarquía de arriba: proyecto → ESCENAS → pantallas → capas

   Cada escena es una Composicion COMPLETA (su lienzo infinito, sus
   pantallas, su cámara, su duración): el corte entre escenas es duro, como
   en un edit. La unificación de diseño viene de la herencia: una escena
   nueva nace con el FORMATO de la referencia (ancho/alto/fps/fondo). El
   registro de qué escenas componen el proyecto vive en el cliente
   (localStorage) hasta que el catálogo de diosa lo persista de verdad;
   cada escena se guarda por su propio id con el MISMO protocolo CAS.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";

/** `duracion` (ms) viaja en el registro para poder ubicar los cortes de
    escena sobre el audio del proyecto sin cargar cada escena; se completa
    y actualiza al visitar/editar cada una. */
export type EscenaInfo = { id: string; nombre: string; duracion?: number };

/** Id determinista de la escena n del proyecto (la 1 es el id base). */
export function idDeEscena(base: string, n: number): string {
  return n <= 1 ? base : `${base}@e${n}`;
}

/** Escena nueva: hereda el FORMATO de la referencia (la unificación de
    diseño del proyecto) y arranca con el lienzo vacío. */
export function escenaNueva(referencia: Composicion, nombre: string): Composicion {
  return {
    version: 1,
    nombre,
    ancho: referencia.ancho,
    alto: referencia.alto,
    fps: referencia.fps,
    duracion: referencia.duracion,
    fondo: referencia.fondo,
    capas: [],
  };
}

/** Duplicado: mismo diseño y coreografía, DOCUMENTO nuevo (rev desde cero:
    el CAS de la escena original no se hereda). */
export function escenaDuplicada(referencia: Composicion, nombre: string): Composicion {
  const copia = structuredClone(referencia);
  delete copia.rev;
  return { ...copia, nombre };
}

/** Las escenas de un export concatenado tienen que compartir formato: el
    encoder es UNO solo. Devuelve el problema legible, o null si están bien. */
export function problemaDeFormatos(escenas: Composicion[]): string | null {
  if (escenas.length === 0) return "no hay escenas para exportar";
  const ref = escenas[0];
  for (const esc of escenas) {
    if (esc.ancho !== ref.ancho || esc.alto !== ref.alto || esc.fps !== ref.fps) {
      return `«${esc.nombre}» tiene otro formato (${esc.ancho}×${esc.alto} @${esc.fps}) que «${ref.nombre}» (${ref.ancho}×${ref.alto} @${ref.fps})`;
    }
  }
  return null;
}

/** Rango de export en frames: clampea desde/hasta a la duración y garantiza
    al menos un frame. Puro para poder testearlo sin WebCodecs. */
export function rangoDeExport(
  duracion: number,
  fps: number,
  desdeMs?: number,
  hastaMs?: number,
): { desde: number; frames: number } {
  const desde = Math.min(Math.max(0, desdeMs ?? 0), Math.max(0, duracion - 1));
  const hasta = Math.min(Math.max(desde + 1, hastaMs ?? duracion), duracion);
  return { desde, frames: Math.max(1, Math.round(((hasta - desde) / 1000) * fps)) };
}
