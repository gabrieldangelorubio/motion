/* -----------------------------------------------------------------------------
   Audio de proyecto — la voz en off / música que estructura las escenas

   El proyecto tiene UN audio (la locución bajada, la música): las escenas
   se recuestan sobre él. El tiempo GLOBAL del proyecto es la concatenación
   de las escenas (el mismo orden del export): la escena n cubre
   [inicio_n, inicio_n + duración_n). La franja de forma de onda muestra la
   estructura del audio (ritmo, pausas) con los CORTES de escena encima:
   arrastrar un corte ajusta la duración de la escena que termina ahí —
   separás la locución en segmentos y decís «esto es la escena 1, esto la
   2», y el preview reproduce el tramo que le toca a la escena activa.

   Todo lo de acá es PURO (números adentro, números afuera): los picos se
   calculan de las muestras decodificadas, los cortes de las duraciones del
   registro. Decodificar el archivo (WebAudio) y guardarlo (IndexedDB) viven
   en audio-guardado.ts.
----------------------------------------------------------------------------- */

/** Un tramo del proyecto: dónde arranca cada escena en el tiempo global. */
export type CorteEscena = {
  id: string;
  nombre: string;
  desdeMs: number;
  duracionMs: number;
};

/**
 * Cortes acumulados desde el registro de escenas. Las escenas cuyo registro
 * todavía no conoce la duración usan el fallback (se completa al visitarlas).
 */
export function cortesDeEscenas(
  escenas: { id: string; nombre: string; duracion?: number }[],
  fallbackMs = 5000,
): CorteEscena[] {
  const cortes: CorteEscena[] = [];
  let acumulado = 0;
  for (const esc of escenas) {
    const duracionMs = Math.max(1, Math.round(esc.duracion ?? fallbackMs));
    cortes.push({ id: esc.id, nombre: esc.nombre, desdeMs: acumulado, duracionMs });
    acumulado += duracionMs;
  }
  return cortes;
}

/** Duración total del proyecto (la suma de las escenas). */
export function duracionTotal(cortes: CorteEscena[]): number {
  const ultimo = cortes[cortes.length - 1];
  return ultimo ? ultimo.desdeMs + ultimo.duracionMs : 0;
}

/**
 * Qué escena cae en un punto global y a qué tiempo local corresponde.
 * El límite exacto entre dos escenas pertenece a la SIGUIENTE (el corte es
 * su primer frame); pasado el final, la última escena en su último ms.
 */
export function escenaEnPunto(
  cortes: CorteEscena[],
  globalMs: number,
): { id: string; localMs: number } | null {
  if (cortes.length === 0) return null;
  const t = Math.max(0, globalMs);
  for (const corte of cortes) {
    if (t < corte.desdeMs + corte.duracionMs) {
      return { id: corte.id, localMs: Math.max(0, t - corte.desdeMs) };
    }
  }
  const ultimo = cortes[cortes.length - 1];
  return { id: ultimo.id, localMs: ultimo.duracionMs };
}

/** Posición global de un tiempo local de una escena (null si no está). */
export function posicionGlobal(cortes: CorteEscena[], id: string, localMs: number): number | null {
  const corte = cortes.find((c) => c.id === id);
  return corte ? corte.desdeMs + Math.max(0, localMs) : null;
}

/**
 * Picos de la señal para la forma de onda: máximo absoluto por balde,
 * normalizado a 0–1 sobre el pico global (una locución baja igual se VE).
 * Señal muda o vacía → todos ceros.
 */
export function picosDe(muestras: ArrayLike<number>, baldes: number): number[] {
  const n = Math.max(1, Math.floor(baldes));
  const total = muestras.length;
  const picos = new Array<number>(n).fill(0);
  if (total === 0) return picos;
  const porBalde = total / n;
  for (let b = 0; b < n; b++) {
    const desde = Math.floor(b * porBalde);
    const hasta = Math.min(total, Math.max(desde + 1, Math.floor((b + 1) * porBalde)));
    let pico = 0;
    for (let i = desde; i < hasta; i++) {
      const v = Math.abs(muestras[i]);
      if (v > pico) pico = v;
    }
    picos[b] = pico;
  }
  const mayor = Math.max(...picos);
  return mayor > 0 ? picos.map((p) => p / mayor) : picos;
}
