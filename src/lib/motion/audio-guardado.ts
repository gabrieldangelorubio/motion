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

export type RecorteAudio = { desdeMs: number; hastaMs: number };

export type AudioGuardado = {
  /** clave: el proyecto (composicionId base) tiene UN audio */
  proyecto: string;
  nombre: string;
  tipo: string;
  datos: ArrayBuffer;
  /** el SEGMENTO del archivo que usa el proyecto; ausente = entero */
  recorte?: RecorteAudio;
  /** transcripción Whisper ya hecha (viaja con el archivo) */
  transcripcion?: Transcripcion;
};

export type AudioDecodificado = {
  nombre: string;
  /** duración del SEGMENTO en uso (el recorte, o el archivo entero) */
  duracionMs: number;
  /** picos 0–1 del SEGMENTO para la forma de onda del timeline */
  picos: number[];
  /** para el <audio> del preview (el archivo entero; el offset lo pone el reloj) */
  url: string;
  /** el archivo completo, para el panel de recorte */
  duracionTotalMs: number;
  picosTotales: number[];
  recorte?: RecorteAudio;
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

/** Cambia el SEGMENTO en uso del audio. La transcripción vieja se descarta:
    sus timestamps eran relativos al segmento anterior. */
export async function guardarRecorte(proyecto: string, recorte: RecorteAudio | undefined): Promise<void> {
  const registro = await cargarAudioGuardado(proyecto);
  if (!registro) return;
  const nuevo: AudioGuardado = { ...registro, recorte };
  delete nuevo.transcripcion;
  await recordarAudio(nuevo);
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
    const totalMs = Math.round(buffer.duration * 1000);
    const canal = buffer.getChannelData(0);
    // el SEGMENTO en uso: lo que el timeline ve como «el audio»
    const recorte = registro.recorte;
    const desdeMuestra = recorte ? Math.round((recorte.desdeMs / 1000) * buffer.sampleRate) : 0;
    const hastaMuestra = recorte ? Math.round((recorte.hastaMs / 1000) * buffer.sampleRate) : canal.length;
    const segmento = canal.subarray(
      Math.min(canal.length, Math.max(0, desdeMuestra)),
      Math.min(canal.length, Math.max(desdeMuestra + 1, hastaMuestra)),
    );
    return {
      nombre: registro.nombre,
      duracionMs: recorte ? recorte.hastaMs - recorte.desdeMs : totalMs,
      picos: picosDe(segmento, BALDES),
      url,
      duracionTotalMs: totalMs,
      picosTotales: picosDe(canal, BALDES),
      recorte,
      transcripcion: registro.transcripcion,
    };
  } catch {
    return null;
  }
}
