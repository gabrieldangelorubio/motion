/* -----------------------------------------------------------------------------
   Snapping de arrastre — el algoritmo canónico de los lienzos (kit §8.3)

   Por cada otra caja, 3 líneas imán por eje (borde-inicio · centro ·
   borde-fin) contra las 3 de la caja movida. UN solo ganador por eje: la
   distancia mínima dentro del umbral — comparar contra varias a la vez hace
   jitter. Devuelve el ajuste {dx, dy} en MUNDO y las guías para dibujar a
   1px constante de pantalla, en el azul de marca.
----------------------------------------------------------------------------- */

import type { CajaMundo } from "@/lib/motion/cajas-puro";

export type Guia = { eje: "x" | "y"; pos: number };

const lineas = (inicio: number, medida: number) => [inicio, inicio + medida / 2, inicio + medida];

export function snapArrastre(
  movida: CajaMundo,
  otras: CajaMundo[],
  umbral: number,
): { dx: number; dy: number; guias: Guia[] } {
  let mejorX: { d: number; ajuste: number; pos: number } | null = null;
  let mejorY: { d: number; ajuste: number; pos: number } | null = null;

  const misX = lineas(movida.x, movida.w);
  const misY = lineas(movida.y, movida.h);

  for (const otra of otras) {
    for (const objetivo of lineas(otra.x, otra.w)) {
      for (const mia of misX) {
        const d = Math.abs(objetivo - mia);
        if (d <= umbral && (!mejorX || d < mejorX.d)) {
          mejorX = { d, ajuste: objetivo - mia, pos: objetivo };
        }
      }
    }
    for (const objetivo of lineas(otra.y, otra.h)) {
      for (const mia of misY) {
        const d = Math.abs(objetivo - mia);
        if (d <= umbral && (!mejorY || d < mejorY.d)) {
          mejorY = { d, ajuste: objetivo - mia, pos: objetivo };
        }
      }
    }
  }

  const guias: Guia[] = [];
  if (mejorX) guias.push({ eje: "x", pos: mejorX.pos });
  if (mejorY) guias.push({ eje: "y", pos: mejorY.pos });
  return { dx: mejorX?.ajuste ?? 0, dy: mejorY?.ajuste ?? 0, guias };
}
