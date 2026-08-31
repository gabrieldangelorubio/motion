/* -----------------------------------------------------------------------------
   Referencias visuales — extracción de frames en el CLIENTE (DOM)

   Un video adjuntado al chat se muestrea acá mismo (elemento <video> +
   canvas, seek por instante y JPEG chico): al servidor viajan solo los
   frames — nunca el archivo entero. Una imagen se reescala igual. Los
   instantes y el texto que los acompaña son de referencias-puro.
----------------------------------------------------------------------------- */

import type { ImagenRevision } from "@/lib/motion/revision-puro";
import {
  LIMITE_BYTES_VIDEO,
  contextoDeReferencias,
  instantesDeMuestreo,
  necesitaSeek,
  tipoPorNombre,
  type MetaReferencia,
} from "@/lib/motion/referencias-puro";

export type ReferenciaAdjunta = {
  meta: MetaReferencia;
  imagenes: ImagenRevision[];
  /** el bloque de texto para el primer turno (contextoDeReferencias) */
  contexto: string;
  /** el VIDEO entero (base64) para el ANALISTA del server (Gemini lo ve
      frame a frame); ausente si pesa más del límite inline o es imagen —
      en ese caso el director trabaja solo con los frames */
  archivo?: { mime: string; datosBase64: string };
};

const ANCHO_MAX = 768;

/** El archivo como base64 pelado (sin el prefijo data:). */
function base64De(archivo: File): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => {
      const dataUrl = lector.result as string;
      resolver(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(archivo);
  });
}

function jpegDe(canvas: HTMLCanvasElement): ImagenRevision {
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  return { mime: "image/jpeg", datosBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

function canvasPara(ancho: number, alto: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null; w: number; h: number } {
  const escala = Math.min(1, ANCHO_MAX / Math.max(1, ancho));
  const canvas = document.createElement("canvas");
  const w = Math.max(1, Math.round(ancho * escala));
  const h = Math.max(1, Math.round(alto * escala));
  canvas.width = w;
  canvas.height = h;
  return { canvas, ctx: canvas.getContext("2d"), w, h };
}

/** Espera un evento del elemento con red de timeout (un archivo roto no
    puede colgar el chat). */
function esperar(el: HTMLVideoElement, evento: string, ms = 8000): Promise<boolean> {
  return new Promise((resolver) => {
    const timer = setTimeout(() => {
      el.removeEventListener(evento, listo);
      el.removeEventListener("error", fallo);
      resolver(false);
    }, ms);
    const limpiar = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener(evento, listo);
      el.removeEventListener("error", fallo);
      resolver(ok);
    };
    const listo = () => limpiar(true);
    const fallo = () => limpiar(false);
    el.addEventListener(evento, listo, { once: true });
    el.addEventListener("error", fallo, { once: true });
  });
}

/**
 * Convierte el archivo adjuntado (video o imagen) en la referencia que
 * viaja al director: frames JPEG ≤768px en orden + su contexto textual.
 * null = el archivo no se pudo leer (avisar y seguir, nunca romper).
 */
export async function referenciaDeArchivo(archivo: File): Promise<ReferenciaAdjunta | null> {
  const nombre = archivo.name.replace(/\.[a-z0-9]+$/i, "");
  // File.type puede venir VACÍO (.mov según SO): inferir por extensión
  const tipoArchivo = archivo.type || tipoPorNombre(archivo.name);

  if (tipoArchivo.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(archivo);
      const { canvas, ctx, w, h } = canvasPara(bitmap.width, bitmap.height);
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      const meta: MetaReferencia = { nombre, tipo: "imagen" };
      return { meta, imagenes: [jpegDe(canvas)], contexto: contextoDeReferencias([meta]) };
    } catch {
      return null;
    }
  }

  if (!tipoArchivo.startsWith("video/")) return null;
  const url = URL.createObjectURL(archivo);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    if (!(await esperar(video, "loadedmetadata"))) return null;
    const duracionMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0;
    if (duracionMs <= 0) return null;
    // el PRIMER frame decodificado antes de dibujar: con solo metadata
    // (readyState 1) el canvas saldría negro
    if (video.readyState < 2 && !(await esperar(video, "loadeddata"))) return null;
    const instantes = instantesDeMuestreo(duracionMs);
    const { canvas, ctx, w, h } = canvasPara(video.videoWidth || 640, video.videoHeight || 360);
    if (!ctx) return null;
    const imagenes: ImagenRevision[] = [];
    for (const ms of instantes) {
      // seek solo si hace falta: pedir el tiempo donde YA está (el 0
      // inicial) puede no disparar `seeked` (Safari) y colgaría al timeout
      if (necesitaSeek(video.currentTime * 1000, ms)) {
        video.currentTime = ms / 1000;
        if (!(await esperar(video, "seeked"))) return null;
      }
      ctx.drawImage(video, 0, 0, w, h);
      imagenes.push(jpegDe(canvas));
    }
    const meta: MetaReferencia = { nombre, tipo: "video", duracionMs, instantes };
    // el archivo ENTERO para el analista del server, solo si entra inline
    const archivoInline =
      archivo.size <= LIMITE_BYTES_VIDEO
        ? { mime: tipoArchivo, datosBase64: await base64De(archivo) }
        : undefined;
    return { meta, imagenes, contexto: contextoDeReferencias([meta]), archivo: archivoInline };
  } finally {
    video.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}
