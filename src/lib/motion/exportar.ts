/* -----------------------------------------------------------------------------
   Export a MP4 — WebCodecs + mp4-muxer, frame-exacto (kit §10.3, opción a)

   El render es literalmente «seek + pintar + encode»: cada frame sale de la
   MISMA pintar(estadoEn(comp, t)) del preview — lo que ves es lo que sale.
   MediaRecorder queda descartado a propósito (no es frame-exacto).

   Motion blur real por SUPERSAMPLING TEMPORAL: con muestras > 1 se pintan N
   sub-frames dentro del intervalo de obturación (180°: medio frame) y se
   promedian. El promedio es exacto con el truco de la media móvil: el
   sub-frame i se dibuja con globalAlpha = 1/(i+1) sobre el acumulado —
   válido porque cada frame pintado es opaco (el fondo se pinta siempre).

   Corre en el main thread con un yield por frame (rAF) para que el progreso
   pinte; mover a un worker con OffscreenCanvas es una mejora declarada en el
   backlog, no un prerequisito.
----------------------------------------------------------------------------- */

import { Muxer, ArrayBufferTarget } from "mp4-muxer";
import type { Composicion } from "@/lib/motion/modelo";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { pintar, type Contexto2D, type FuentesDeMedia } from "@/lib/motion/pintar";

export type OpcionesExport = {
  /** sub-frames promediados por frame (1 = sin blur temporal) */
  muestrasBlur?: number;
  bitrate?: number;
  onProgreso?: (frame: number, total: number) => void;
};

/**
 * Codecs en orden de preferencia: H.264 (compatibilidad universal) y después
 * VP9-en-MP4 — Chromium sin codecs propietarios (builds de testing, algunos
 * Linux) no trae encoder H.264 pero sí VP9.
 */
const CODECS: { codec: string; muxer: "avc" | "vp9" }[] = [
  { codec: "avc1.640028", muxer: "avc" },
  { codec: "avc1.4d0028", muxer: "avc" },
  { codec: "avc1.42002a", muxer: "avc" },
  { codec: "vp09.00.40.08", muxer: "vp9" },
];

export function exportSoportado(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

export async function exportarMp4(
  comp: Composicion,
  media: FuentesDeMedia = {},
  opciones: OpcionesExport = {},
): Promise<Blob> {
  if (!exportSoportado()) {
    throw new Error("Este navegador no soporta WebCodecs (probá Chrome o Edge)");
  }
  const muestras = Math.max(1, Math.floor(opciones.muestrasBlur ?? 1));
  const bitrate = opciones.bitrate ?? 12_000_000;
  const totalFrames = Math.max(1, Math.round((comp.duracion / 1000) * comp.fps));
  const duracionFrameMs = 1000 / comp.fps;

  // WebCodecs exige dimensiones pares para H.264.
  const ancho = comp.ancho % 2 ? comp.ancho + 1 : comp.ancho;
  const alto = comp.alto % 2 ? comp.alto + 1 : comp.alto;

  let codecElegido: (typeof CODECS)[number] | null = null;
  for (const candidato of CODECS) {
    const { supported } = await VideoEncoder.isConfigSupported({
      codec: candidato.codec,
      width: ancho,
      height: alto,
      bitrate,
      framerate: comp.fps,
    });
    if (supported) {
      codecElegido = candidato;
      break;
    }
  }
  if (!codecElegido) throw new Error("Ningún codec de video disponible para estas dimensiones");

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codecElegido.muxer, width: ancho, height: alto, frameRate: comp.fps },
    fastStart: "in-memory",
  });

  let errorEncoder: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      errorEncoder = e instanceof Error ? e : new Error(String(e));
    },
  });
  encoder.configure({ codec: codecElegido.codec, width: ancho, height: alto, bitrate, framerate: comp.fps });

  const lienzo = new OffscreenCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  const acumulador = muestras > 1 ? new OffscreenCanvas(ancho, alto) : null;
  const ctxAcum = acumulador?.getContext("2d") ?? null;
  if (!ctx || (muestras > 1 && !ctxAcum)) throw new Error("No se pudo crear el canvas de render");

  for (let frame = 0; frame < totalFrames; frame++) {
    if (errorEncoder) throw errorEncoder;
    const t = frame * duracionFrameMs;

    let origen: OffscreenCanvas = lienzo;
    if (muestras > 1 && ctxAcum && acumulador) {
      // obturación 180°: las muestras cubren la primera mitad del intervalo
      for (let i = 0; i < muestras; i++) {
        const tMuestra = Math.min(comp.duracion, t + (i / muestras) * (duracionFrameMs / 2));
        pintar(estadoEn(comp, tMuestra), ctx as unknown as Contexto2D, media);
        ctxAcum.globalAlpha = 1 / (i + 1); // media móvil exacta sobre frames opacos
        ctxAcum.drawImage(lienzo, 0, 0);
      }
      ctxAcum.globalAlpha = 1;
      origen = acumulador;
    } else {
      pintar(estadoEn(comp, t), ctx as unknown as Contexto2D, media);
    }

    const videoFrame = new VideoFrame(origen, {
      timestamp: Math.round(frame * (1_000_000 / comp.fps)),
      duration: Math.round(1_000_000 / comp.fps),
    });
    encoder.encode(videoFrame, { keyFrame: frame % (comp.fps * 2) === 0 });
    videoFrame.close();

    // back-pressure: no dejar que la cola del encoder crezca sin límite
    while (encoder.encodeQueueSize > 4) {
      await new Promise((r) => setTimeout(r, 1));
    }
    opciones.onProgreso?.(frame + 1, totalFrames);
    // un yield por frame para que la UI pinte el progreso
    await new Promise((r) => requestAnimationFrame(r));
  }

  await encoder.flush();
  encoder.close();
  if (errorEncoder) throw errorEncoder;
  muxer.finalize();
  return new Blob([(muxer.target as ArrayBufferTarget).buffer], { type: "video/mp4" });
}

/** Entrega por defecto: descarga del browser. La demo web puede inyectar otra. */
export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  // el download= sólo se respeta con el <a> EN el documento
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
