/* -----------------------------------------------------------------------------
   Interpolación de keyframes

   El easing vive en el TRAMO (lo declara el keyframe de salida), y un `hold`
   congela el valor hasta el próximo keyframe — las dos semánticas que After
   Effects y Lottie comparten, para que el export a AE mapee sin sorpresas.
   Fuera de rango se clampea al primero/último valor (fill both): un preset
   de salida tiene que sostener su estado final aunque la composición siga.
----------------------------------------------------------------------------- */

import type { Keyframe } from "@/lib/motion/modelo";
import { easing } from "@/lib/motion/easings-puro";

/** Valor de una pista en el instante t (ms). Los keyframes deben venir ordenados por t. */
export function interpolar(keyframes: Keyframe[], t: number): number {
  if (keyframes.length === 0) return 0;
  const primero = keyframes[0];
  if (t <= primero.t) return primero.v;
  const ultimo = keyframes[keyframes.length - 1];
  if (t >= ultimo.t) return ultimo.v;

  let i = 0;
  while (i < keyframes.length - 1 && keyframes[i + 1].t <= t) i++;
  const a = keyframes[i];
  const b = keyframes[i + 1];
  if (a.hold) return a.v;
  if (b.t === a.t) return b.v;
  const progreso = easing(a.easing)((t - a.t) / (b.t - a.t));
  return a.v + (b.v - a.v) * progreso;
}

/** Ordena por t sin mutar. Serializar guarda ordenado; esto defiende al evaluador. */
export function ordenarKeyframes(keyframes: Keyframe[]): Keyframe[] {
  return [...keyframes].sort((a, b) => a.t - b.t);
}

/** Delays de escalonado para n unidades: índice de rango × paso, según el orden. */
export function delaysEscalonado(
  n: number,
  paso: number,
  orden: "inicio" | "fin" | "centro" | "bordes" = "inicio",
): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  const rangos = indices.map((i) => {
    switch (orden) {
      case "fin": return n - 1 - i;
      case "centro": return Math.abs(i - (n - 1) / 2);
      case "bordes": return (n - 1) / 2 - Math.abs(i - (n - 1) / 2);
      default: return i;
    }
  });
  return rangos.map((r) => r * paso);
}
