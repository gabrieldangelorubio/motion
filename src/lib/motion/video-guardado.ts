/* -----------------------------------------------------------------------------
   Video de referencia — persistencia LOCAL (IndexedDB)

   El archivo del video de referencia se guarda ENTERO en el navegador (el
   mismo trato que el audio del proyecto y las fuentes): al reabrir el
   editor vuelve solo. Al JSON de la composición viaja únicamente el
   `videoId` — el video jamás se serializa ni se exporta. En otra máquina
   el editor pinta el placeholder y avisa que hay que resubirlo. Si
   IndexedDB falla, el video vive sólo la sesión — degradar, no romper.
----------------------------------------------------------------------------- */

export type VideoGuardado = {
  /** clave del almacén: el videoId de la capa */
  videoId: string;
  nombre: string;
  tipo: string;
  datos: ArrayBuffer;
};

const BASE = "motion-video";
const TABLA = "video";

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolver) => {
    try {
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(TABLA, { keyPath: "videoId" });
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
}

/** Guarda (o pisa) un video de referencia. Nunca lanza — un fallo queda en
    la consola: silencioso hacia el flujo, no invisible. */
export async function recordarVideo(registro: VideoGuardado): Promise<void> {
  const db = await abrir();
  if (!db) return;
  await new Promise<void>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readwrite");
      tx.objectStore(TABLA).put(registro);
      tx.oncomplete = () => resolver();
      tx.onerror = () => {
        console.warn("motion: no se pudo guardar el video de referencia", tx.error);
        resolver();
      };
      tx.onabort = () => {
        console.warn("motion: guardado del video de referencia abortado", tx.error);
        resolver();
      };
    } catch (e) {
      console.warn("motion: no se pudo guardar el video de referencia", e);
      resolver();
    }
  });
  db.close();
}

export async function cargarVideoGuardado(videoId: string): Promise<VideoGuardado | null> {
  const db = await abrir();
  if (!db) return null;
  const registro = await new Promise<VideoGuardado | null>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readonly");
      const pedido = tx.objectStore(TABLA).get(videoId);
      pedido.onsuccess = () => resolver((pedido.result as VideoGuardado) ?? null);
      pedido.onerror = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
  db.close();
  return registro;
}

export async function olvidarVideo(videoId: string): Promise<void> {
  const db = await abrir();
  if (!db) return;
  await new Promise<void>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readwrite");
      tx.objectStore(TABLA).delete(videoId);
      tx.oncomplete = () => resolver();
      tx.onerror = () => resolver();
      tx.onabort = () => resolver();
    } catch {
      resolver();
    }
  });
  db.close();
}
