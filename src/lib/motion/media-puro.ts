/* -----------------------------------------------------------------------------
   Media subida a mano — puro: cómo entra una imagen al lienzo

   Una foto subida directo (sin pasar por Figma) tiene que caer con un
   tamaño sano: entera a la vista, sin pixelarse de más. La lectura del
   archivo y el alta de la capa viven en el Editor; acá solo la geometría.
----------------------------------------------------------------------------- */

/**
 * Tamaño con el que una imagen subida entra al lienzo: a lo sumo el 70% del
 * frame (para que se vea entera con aire), sin agrandarla nunca más allá de
 * su tamaño natural (no inventar píxeles). Proporción intacta.
 */
export function encajarMedia(
  anchoNatural: number,
  altoNatural: number,
  anchoComp: number,
  altoComp: number,
): { ancho: number; alto: number } {
  const natW = Math.max(1, anchoNatural);
  const natH = Math.max(1, altoNatural);
  const factor = Math.min(1, (anchoComp * 0.7) / natW, (altoComp * 0.7) / natH);
  return { ancho: Math.round(natW * factor), alto: Math.round(natH * factor) };
}
