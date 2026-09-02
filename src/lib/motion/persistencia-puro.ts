/* -----------------------------------------------------------------------------
   Persistencia — la parte PURA: qué camino toma un snapshot

   El autosave manda el snapshot como string por SERVER ACTION (§2.4 del
   kit). React Flight, al decodificar los argumentos de una action, cuenta
   la LONGITUD de cada string contra un tope de 1.000.000 («Maximum array
   nesting exceeded»), sin importar el bodySizeLimit de Next: una landing con
   rasters de Figma (34 MB) no se guardaba y el editor lo perdía en silencio.
   Los snapshots grandes van por route handler con el body crudo; los
   normales siguen por la action. El umbral queda debajo del tope con aire.
----------------------------------------------------------------------------- */

/** Tope de Flight para strings en argumentos de una action (1e6 chars). */
export const TOPE_STRING_ACTION = 1_000_000;

/** Por encima de esto el snapshot viaja por el route handler. */
export const UMBRAL_SNAPSHOT_RUTA = 800_000;

export type CaminoDeGuardado = "action" | "ruta";

export function caminoDeGuardado(snapshot: string): CaminoDeGuardado {
  return snapshot.length > UMBRAL_SNAPSHOT_RUTA ? "ruta" : "action";
}
