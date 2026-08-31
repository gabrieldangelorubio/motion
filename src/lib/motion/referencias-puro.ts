/* -----------------------------------------------------------------------------
   Referencias visuales para el director — la parte PURA

   El usuario adjunta al CHAT un video (o una imagen) de referencia: «que se
   mueva como esto». El cliente extrae frames en orden (referencias.ts, DOM)
   y acá se decide QUÉ instantes muestrear y CÓMO contárselo al director —
   el texto que acompaña a las imágenes para que las lea como un director
   (dirección, easing percibido, ritmo del stagger, cámara) y TRADUZCA ese
   carácter a nuestras herramientas, sin copiar el contenido ajeno.

   Primer paso del módulo M8 del blueprint (la medición CV viene después):
   acá mira y traduce a criterio; medir curvas contra el video es backlog.
----------------------------------------------------------------------------- */

/** Cuántos frames viajan de un video de referencia: suficientes para leer
    el ARCO del movimiento (entrada, medio, reposo, salida) sin inflar el
    costo del pedido — cada frame son tokens de visión. */
export const MAX_FRAMES_REFERENCIA = 8;

/** Los instantes (ms) a muestrear de un video de referencia: uniformes,
    con el primero en 0 y el último ANTES del final exacto (el último frame
    de un video suele ser negro o repetido; ε = 2% del largo). Un video
    corto muestrea menos: nunca más de un frame cada 150ms. */
export function instantesDeMuestreo(duracionMs: number, maxFrames = MAX_FRAMES_REFERENCIA): number[] {
  if (!(duracionMs > 0)) return [0];
  const n = Math.max(2, Math.min(maxFrames, Math.floor(duracionMs / 150) + 1));
  const fin = duracionMs * 0.98;
  return Array.from({ length: n }, (_, i) => Math.round((fin * i) / (n - 1)));
}

export type MetaReferencia = {
  nombre: string;
  tipo: "video" | "imagen";
  /** solo video: duración del archivo e instantes muestreados (ms) */
  duracionMs?: number;
  instantes?: number[];
};

/** El bloque de texto que viaja en el primer turno junto a las imágenes:
    le dice al director QUÉ está mirando (los frames en orden, con sus
    tiempos) — la regla de CÓMO leerlo vive en el system prompt. */
export function contextoDeReferencias(refs: MetaReferencia[]): string {
  if (refs.length === 0) return "";
  const lineas = refs.map((ref) => {
    if (ref.tipo === "imagen") {
      return `REFERENCIA ADJUNTA «${ref.nombre}» (imagen quieta): leé la intención compositiva y proponé el movimiento acorde.`;
    }
    const seg = ((ref.duracionMs ?? 0) / 1000).toFixed(1);
    const tiempos = (ref.instantes ?? []).map((ms) => `${(ms / 1000).toFixed(2)}s`).join(", ");
    return `REFERENCIA ADJUNTA «${ref.nombre}» (video de ${seg}s): las imágenes son sus frames EN ORDEN cronológico, tomados en ${tiempos}. Estudiá el movimiento entre frames y traducí ese carácter a esta pieza.`;
  });
  return lineas.join("\n");
}
