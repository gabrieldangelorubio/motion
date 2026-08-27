/* -----------------------------------------------------------------------------
   Fuentes recordadas — persistencia LOCAL (IndexedDB) hasta el catálogo

   Guarda lo que el usuario ya resolvió una vez: el archivo subido (los bytes
   completos) o la elección de Google Fonts (sólo el nombre y los pesos — se
   vuelve a pedir al abrir). Al montar el editor se recargan solas, así una
   fuente no se pide dos veces. Si IndexedDB falla o el registro no carga,
   la familia simplemente vuelve a figurar como faltante — degradar, no
   romper. Cuando el módulo se integre a diosa, esto migra al catálogo de
   media (backlog): la interfaz de acá queda igual.
----------------------------------------------------------------------------- */

import { cargarDeArchivo, cargarDeGoogleFonts, familiaDisponible } from "@/lib/motion/fuentes-puro";

export type FuenteRecordada =
  | { familia: string; origen: "archivo"; datos: ArrayBuffer }
  | { familia: string; origen: "google"; pesos: number[] };

const BASE = "motion-fuentes";
const TABLA = "fuentes";

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolver) => {
    try {
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(TABLA, { keyPath: "familia" });
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
}

/** Guarda (o pisa) el registro de una familia ya resuelta. Nunca lanza. */
export async function recordarFuente(registro: FuenteRecordada): Promise<void> {
  const db = await abrir();
  if (!db) return;
  await new Promise<void>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readwrite");
      tx.objectStore(TABLA).put(registro);
      tx.oncomplete = () => resolver();
      tx.onerror = () => resolver();
      tx.onabort = () => resolver();
    } catch {
      resolver();
    }
  });
  db.close();
}

/** Todos los registros recordados, tal cual (para el export a AE, que se
    lleva los BYTES de las subidas y lista las de Google en el LEEME). */
export async function registrosDeFuentes(): Promise<FuenteRecordada[]> {
  const db = await abrir();
  if (!db) return [];
  const registros = await new Promise<FuenteRecordada[]>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readonly");
      const pedido = tx.objectStore(TABLA).getAll();
      pedido.onsuccess = () => resolver((pedido.result as FuenteRecordada[]) ?? []);
      pedido.onerror = () => resolver([]);
    } catch {
      resolver([]);
    }
  });
  db.close();
  return registros;
}

/**
 * Recarga todas las fuentes recordadas en document.fonts.
 * Devuelve las familias que efectivamente levantó (para re-anclar textos).
 */
export async function cargarFuentesRecordadas(): Promise<string[]> {
  const registros = await registrosDeFuentes();
  const cargadas: string[] = [];
  for (const registro of registros) {
    if (familiaDisponible(registro.familia)) continue; // ya está (del sistema o cargada)
    const res = registro.origen === "archivo"
      ? await cargarDeArchivo(registro.familia, registro.datos)
      : await cargarDeGoogleFonts(registro.familia, registro.pesos);
    if (res.ok) cargadas.push(registro.familia);
  }
  return cargadas;
}
