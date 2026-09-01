/* -----------------------------------------------------------------------------
   Export a MP4 — WebCodecs + mp4-muxer, frame-exacto (kit §10.3, opción a)

   El render es literalmente «seek + pintar + encode»: cada frame sale de la
   MISMA pintar(estadoVivo(comp, t)) del preview (motor GSAP) — lo que ves es lo que sale.
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
import { sinCapasReferencia } from "@/lib/motion/evaluar-puro";
import { estadoVivo } from "@/lib/motion/motor-gsap";
import { pintar, type Contexto2D, type FuentesDeMedia } from "@/lib/motion/pintar";
import { problemaDeFormatos, rangoDeExport } from "@/lib/motion/escenas-puro";
import { recorteDeAudio } from "@/lib/motion/audio-puro";

/** Audio del proyecto listo para muxear: PCM por canal + desde dónde del
    audio global arranca el video que se está exportando. */
export type AudioExport = {
  canales: Float32Array[];
  sampleRate: number;
  desdeMs: number;
};

export type OpcionesExport = {
  /** sub-frames promediados por frame (1 = sin blur temporal) */
  muestrasBlur?: number;
  /** supersampling ESPACIAL: pinta a N× y baja con smoothing de alta calidad
      — antialiasing real en los bordes del texto (default 2, 1 = apagado) */
  supermuestreo?: number;
  /** rango a renderizar en ms (sólo con UNA composición); default: entera */
  desdeMs?: number;
  hastaMs?: number;
  bitrate?: number;
  onProgreso?: (frame: number, total: number) => void;
  /** la voz en off / música del proyecto: se muxea como pista AAC; si el
      browser no trae AudioEncoder, el MP4 sale mudo (degradar, no romper) */
  audio?: AudioExport;
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

/**
 * Exporta una composición — o VARIAS escenas concatenadas con corte duro —
 * a un solo MP4. Las escenas tienen que compartir formato (el encoder es
 * uno); con una sola composición, `desdeMs`/`hastaMs` renderizan un rango.
 */
export async function exportarMp4(
  entrada: Composicion | Composicion[],
  media: FuentesDeMedia = {},
  opciones: OpcionesExport = {},
): Promise<Blob> {
  if (!exportSoportado()) {
    throw new Error("Este navegador no soporta WebCodecs (probá Chrome o Edge)");
  }
  // el VIDEO DE REFERENCIA no sale en ningún export: solo guía del preview
  const escenas = (Array.isArray(entrada) ? entrada : [entrada]).map(sinCapasReferencia);
  const problema = problemaDeFormatos(escenas);
  if (problema) throw new Error(problema);
  const comp = escenas[0];

  const muestras = Math.max(1, Math.floor(opciones.muestrasBlur ?? 1));
  const bitrate = opciones.bitrate ?? 12_000_000;
  // el rango sólo aplica a un export de UNA composición; las escenas
  // concatenadas van enteras
  const tramos = escenas.map((esc) =>
    escenas.length === 1
      ? { comp: esc, ...rangoDeExport(esc.duracion, esc.fps, opciones.desdeMs, opciones.hastaMs) }
      : { comp: esc, ...rangoDeExport(esc.duracion, esc.fps) },
  );
  const totalFrames = tramos.reduce((n, tr) => n + tr.frames, 0);
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

  // ——— Pista de audio: la voz en off del proyecto, recortada al tramo del
  // video. AAC vía AudioEncoder; sin soporte (o config rechazada) el MP4
  // sale mudo con el video intacto — degradar, no romper.
  const durVideoMs = (totalFrames / comp.fps) * 1000;
  let audioListo:
    | { audio: AudioExport; canales: number; desde: number; muestras: number; codec: string; muxerCodec: "aac" | "opus" }
    | null = null;
  if (opciones.audio && typeof AudioEncoder !== "undefined") {
    const { desde, muestras } = recorteDeAudio(
      opciones.audio.canales[0]?.length ?? 0,
      opciones.audio.sampleRate,
      opciones.audio.desdeMs,
      durVideoMs,
    );
    if (muestras > 0) {
      const canales = Math.min(2, opciones.audio.canales.length);
      // AAC primero (compatibilidad universal, AE/Premiere incluidos);
      // Chromium sin codecs propietarios no trae encoder AAC pero sí Opus.
      const candidatos: { codec: string; muxerCodec: "aac" | "opus" }[] = [
        { codec: "mp4a.40.2", muxerCodec: "aac" },
        { codec: "opus", muxerCodec: "opus" },
      ];
      for (const candidato of candidatos) {
        const soporte = await AudioEncoder.isConfigSupported({
          codec: candidato.codec,
          sampleRate: opciones.audio.sampleRate,
          numberOfChannels: canales,
          bitrate: 128_000,
        }).catch(() => null);
        if (soporte?.supported) {
          audioListo = { audio: opciones.audio, canales, desde, muestras, ...candidato };
          break;
        }
      }
    }
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: codecElegido.muxer, width: ancho, height: alto, frameRate: comp.fps },
    audio: audioListo
      ? {
          codec: audioListo.muxerCodec,
          sampleRate: audioListo.audio.sampleRate,
          numberOfChannels: audioListo.canales,
        }
      : undefined,
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

  if (audioListo) {
    const { audio, canales, desde, muestras } = audioListo;
    let errorAudio: Error | null = null;
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        errorAudio = e instanceof Error ? e : new Error(String(e));
      },
    });
    audioEncoder.configure({
      codec: audioListo.codec,
      sampleRate: audio.sampleRate,
      numberOfChannels: canales,
      bitrate: 128_000,
    });
    // bloques f32-planar: los planos de cada canal, concatenados
    const BLOQUE = 4096;
    for (let offset = 0; offset < muestras && !errorAudio; offset += BLOQUE) {
      const n = Math.min(BLOQUE, muestras - offset);
      const datos = new Float32Array(n * canales);
      for (let c = 0; c < canales; c++) {
        datos.set(audio.canales[c].subarray(desde + offset, desde + offset + n), c * n);
      }
      const trozo = new AudioData({
        format: "f32-planar",
        sampleRate: audio.sampleRate,
        numberOfFrames: n,
        numberOfChannels: canales,
        timestamp: Math.round((offset / audio.sampleRate) * 1_000_000),
        data: datos,
      });
      audioEncoder.encode(trozo);
      trozo.close();
      if (audioEncoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 1));
    }
    await audioEncoder.flush().catch(() => undefined);
    audioEncoder.close();
    if (errorAudio) throw errorAudio;
  }

  const lienzo = new OffscreenCanvas(ancho, alto);
  const ctx = lienzo.getContext("2d");
  const acumulador = muestras > 1 ? new OffscreenCanvas(ancho, alto) : null;
  const ctxAcum = acumulador?.getContext("2d") ?? null;
  if (!ctx || (muestras > 1 && !ctxAcum)) throw new Error("No se pudo crear el canvas de render");

  // Supersampling ESPACIAL: cada frame se pinta a S× y se baja al tamaño
  // final con smoothing de alta calidad — el antialiasing que el canvas no
  // le da solo a los bordes diagonales de un display grande. pintar() recibe
  // la escala para compensar los ctx.filter (que van en px de dispositivo).
  const S = Math.max(1, Math.min(4, Math.round(opciones.supermuestreo ?? 2)));
  const superLienzo = S > 1 ? new OffscreenCanvas(ancho * S, alto * S) : null;
  const ctxSuper = superLienzo?.getContext("2d") ?? null;
  if (S > 1 && !ctxSuper) throw new Error("No se pudo crear el canvas de supersampling");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const pintarFrame = (escena: Composicion, t: number) => {
    if (ctxSuper && superLienzo) {
      ctxSuper.setTransform(S, 0, 0, S, 0, 0);
      pintar(estadoVivo(escena, t), ctxSuper as unknown as Contexto2D, media, S);
      ctx.drawImage(superLienzo, 0, 0, ancho, alto);
    } else {
      pintar(estadoVivo(escena, t), ctx as unknown as Contexto2D, media);
    }
  };

  let frameGlobal = 0;
  for (const tramo of tramos) {
    for (let frame = 0; frame < tramo.frames; frame++) {
      if (errorEncoder) throw errorEncoder;
      const t = tramo.desde + frame * duracionFrameMs;

      let origen: OffscreenCanvas = lienzo;
      if (muestras > 1 && ctxAcum && acumulador) {
        // obturación 180°: las muestras cubren la primera mitad del intervalo
        for (let i = 0; i < muestras; i++) {
          const tMuestra = Math.min(tramo.comp.duracion, t + (i / muestras) * (duracionFrameMs / 2));
          pintarFrame(tramo.comp, tMuestra);
          ctxAcum.globalAlpha = 1 / (i + 1); // media móvil exacta sobre frames opacos
          ctxAcum.drawImage(lienzo, 0, 0);
        }
        ctxAcum.globalAlpha = 1;
        origen = acumulador;
      } else {
        pintarFrame(tramo.comp, t);
      }

      const videoFrame = new VideoFrame(origen, {
        timestamp: Math.round(frameGlobal * (1_000_000 / comp.fps)),
        duration: Math.round(1_000_000 / comp.fps),
      });
      // keyframe al inicio de cada escena (el corte duro) y cada 2 segundos
      encoder.encode(videoFrame, { keyFrame: frame === 0 || frameGlobal % (comp.fps * 2) === 0 });
      videoFrame.close();

      // back-pressure: no dejar que la cola del encoder crezca sin límite
      while (encoder.encodeQueueSize > 4) {
        await new Promise((r) => setTimeout(r, 1));
      }
      frameGlobal++;
      opciones.onProgreso?.(frameGlobal, totalFrames);
      // un yield por frame para que la UI pinte el progreso
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  await encoder.flush();
  encoder.close();
  if (errorEncoder) throw errorEncoder;
  muxer.finalize();
  return new Blob([(muxer.target as ArrayBufferTarget).buffer], { type: "video/mp4" });
}

/**
 * Exporta una SECUENCIA PNG con canal alfa en un ZIP: las gráficas solas
 * sobre fondo transparente, para montarlas ENCIMA del video real en
 * AE/Premiere (el MP4 no lleva alfa; esta es la vía estándar de overlay).
 * Mismo motor determinista: cada frame es pintar(estadoVivo(comp, t)) con el
 * fondo apagado. Con varias escenas, la numeración de frames es global.
 */
export async function exportarPngSecuencia(
  entrada: Composicion | Composicion[],
  media: FuentesDeMedia = {},
  opciones: Pick<OpcionesExport, "supermuestreo" | "desdeMs" | "hastaMs" | "onProgreso"> = {},
): Promise<Blob> {
  if (typeof OffscreenCanvas === "undefined") {
    throw new Error("Este navegador no soporta OffscreenCanvas");
  }
  const { crearZip } = await import("@/lib/motion/zip-puro");
  // ídem MP4: el video de referencia queda afuera de la secuencia PNG
  const escenas = (Array.isArray(entrada) ? entrada : [entrada]).map(sinCapasReferencia);
  const problema = problemaDeFormatos(escenas);
  if (problema) throw new Error(problema);
  const comp = escenas[0];
  const tramos = escenas.map((esc) =>
    escenas.length === 1
      ? { comp: esc, ...rangoDeExport(esc.duracion, esc.fps, opciones.desdeMs, opciones.hastaMs) }
      : { comp: esc, ...rangoDeExport(esc.duracion, esc.fps) },
  );
  const totalFrames = tramos.reduce((n, tr) => n + tr.frames, 0);
  const duracionFrameMs = 1000 / comp.fps;

  const lienzo = new OffscreenCanvas(comp.ancho, comp.alto);
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo crear el canvas de render");
  const S = Math.max(1, Math.min(4, Math.round(opciones.supermuestreo ?? 2)));
  const superLienzo = S > 1 ? new OffscreenCanvas(comp.ancho * S, comp.alto * S) : null;
  const ctxSuper = superLienzo?.getContext("2d") ?? null;
  if (S > 1 && !ctxSuper) throw new Error("No se pudo crear el canvas de supersampling");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const entradas: { nombre: string; datos: Uint8Array }[] = [];
  let frameGlobal = 0;
  for (const tramo of tramos) {
    for (let frame = 0; frame < tramo.frames; frame++) {
      const t = tramo.desde + frame * duracionFrameMs;
      // fondo vacío → pintar deja el lienzo transparente
      const estado = { ...estadoVivo(tramo.comp, t), fondo: "" };
      ctx.clearRect(0, 0, comp.ancho, comp.alto);
      if (ctxSuper && superLienzo) {
        ctxSuper.setTransform(1, 0, 0, 1, 0, 0);
        ctxSuper.clearRect(0, 0, comp.ancho * S, comp.alto * S);
        ctxSuper.setTransform(S, 0, 0, S, 0, 0);
        pintar(estado, ctxSuper as unknown as Contexto2D, media, S);
        ctx.drawImage(superLienzo, 0, 0, comp.ancho, comp.alto);
      } else {
        pintar(estado, ctx as unknown as Contexto2D, media);
      }
      const png = await lienzo.convertToBlob({ type: "image/png" });
      entradas.push({
        nombre: `frame-${String(frameGlobal).padStart(5, "0")}.png`,
        datos: new Uint8Array(await png.arrayBuffer()),
      });
      frameGlobal++;
      opciones.onProgreso?.(frameGlobal, totalFrames);
      await new Promise((r) => requestAnimationFrame(r));
    }
  }
  return new Blob([crearZip(entradas) as BlobPart], { type: "application/zip" });
}

/** Entrega por defecto: descarga del browser. La demo web puede inyectar otra. */
/** Nombre de archivo a ASCII: un acento en `a.download` hace que Chromium
    descarte el nombre ENTERO y baje como «download» (visto en headless).
    NFD separa el diacrítico del glifo; lo que siga fuera de ASCII va a "-". */
export function nombreDeArchivo(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "-");
}

export function descargarBlob(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreDeArchivo(nombre);
  // el download= sólo se respeta con el <a> EN el documento
  document.body.appendChild(a);
  a.click();
  a.remove();
  // revocar DESPUÉS de que el download arrancó: hacerlo sincrónico le pisa
  // el nombre de archivo al browser (visto en Chromium headless)
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
