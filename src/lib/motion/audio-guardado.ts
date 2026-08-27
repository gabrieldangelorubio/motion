/* -----------------------------------------------------------------------------
   Audio de proyecto — persistencia LOCAL (IndexedDB) y decodificación

   El archivo de la voz en off / música se guarda ENTERO en el navegador
   (como las fuentes recordadas): al reabrir el editor vuelve solo. Cuando
   el módulo se integre a diosa migra al catálogo de media (backlog) y la
   interfaz de acá queda igual. Si IndexedDB falla, el audio vive sólo la
   sesión — degradar, no romper.
----------------------------------------------------------------------------- */

import { picosDe } from "@/lib/motion/audio-puro";
import type { Transcripcion } from "@/lib/motion/stt-puro";

export type AudioGuardado = {
  /** clave: el proyecto (composicionId base) tiene UN audio */
  proyecto: string;
  nombre: string;
  tipo: string;
  datos: ArrayBuffer;
  /** transcripción Whisper ya hecha (viaja con el archivo) */
  transcripcion?: Transcripcion;
};

export type AudioDecodificado = {
  nombre: string;
  duracionMs: number;
  /** picos 0–1 para la forma de onda */
  picos: number[];
  /** para el <audio> del preview */
  url: string;
  transcripcion?: Transcripcion;
};

const BASE = "motion-audio";
const TABLA = "audio";
const BALDES = 800;

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolver) => {
    try {
      const pedido = indexedDB.open(BASE, 1);
      pedido.onupgradeneeded = () => pedido.result.createObjectStore(TABLA, { keyPath: "proyecto" });
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
}

/** Guarda (o pisa) el audio del proyecto. Nunca lanza — pero un fallo
    queda en la consola: silencioso hacia el flujo, no invisible. */
export async function recordarAudio(registro: AudioGuardado): Promise<void> {
  const db = await abrir();
  if (!db) return;
  await new Promise<void>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readwrite");
      tx.objectStore(TABLA).put(registro);
      tx.oncomplete = () => resolver();
      tx.onerror = () => {
        console.warn("motion: no se pudo guardar el audio", tx.error);
        resolver();
      };
      tx.onabort = () => {
        console.warn("motion: guardado del audio abortado", tx.error);
        resolver();
      };
    } catch (e) {
      console.warn("motion: no se pudo guardar el audio", e);
      resolver();
    }
  });
  db.close();
}

export async function cargarAudioGuardado(proyecto: string): Promise<AudioGuardado | null> {
  const db = await abrir();
  if (!db) return null;
  const registro = await new Promise<AudioGuardado | null>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readonly");
      const pedido = tx.objectStore(TABLA).get(proyecto);
      pedido.onsuccess = () => resolver((pedido.result as AudioGuardado) ?? null);
      pedido.onerror = () => resolver(null);
    } catch {
      resolver(null);
    }
  });
  db.close();
  return registro;
}

/** Le suma (o pisa) la transcripción al audio ya guardado del proyecto. */
export async function guardarTranscripcion(proyecto: string, transcripcion: Transcripcion): Promise<void> {
  const registro = await cargarAudioGuardado(proyecto);
  if (!registro) return;
  await recordarAudio({ ...registro, transcripcion });
}

export async function olvidarAudio(proyecto: string): Promise<void> {
  const db = await abrir();
  if (!db) return;
  await new Promise<void>((resolver) => {
    try {
      const tx = db.transaction(TABLA, "readwrite");
      tx.objectStore(TABLA).delete(proyecto);
      tx.oncomplete = () => resolver();
      tx.onerror = () => resolver();
      tx.onabort = () => resolver();
    } catch {
      resolver();
    }
  });
  db.close();
}

/**
 * Decodifica el registro a lo que la UI necesita: picos para la forma de
 * onda, duración y una URL reproducible. Devuelve null si el archivo no es
 * un audio decodificable.
 */
export async function decodificarAudio(registro: AudioGuardado): Promise<AudioDecodificado | null> {
  try {
    const Ctx =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    // decodeAudioData CONSUME el buffer en algunos browsers: copia defensiva
    const buffer = await ctx.decodeAudioData(registro.datos.slice(0));
    void ctx.close().catch(() => undefined);
    const url = URL.createObjectURL(new Blob([registro.datos], { type: registro.tipo || "audio/mpeg" }));
    return {
      nombre: registro.nombre,
      duracionMs: Math.round(buffer.duration * 1000),
      picos: picosDe(buffer.getChannelData(0), BALDES),
      url,
      transcripcion: registro.transcripcion,
    };
  } catch {
    return null;
  }
}
