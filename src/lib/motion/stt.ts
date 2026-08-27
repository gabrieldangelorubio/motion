"use client";

/* -----------------------------------------------------------------------------
   STT — Whisper LOCAL en el browser (transformers.js)

   El modelo corre acá mismo: nada de la voz sale de la máquina. La primera
   vez se baja el modelo (decenas de MB, queda cacheado por el browser);
   las siguientes arranca al toque. Dos usos:
   - transcribir el AUDIO DEL PROYECTO con timestamps (qué oración cae en
     qué segundo → los cortes de escena se recuestan sobre la locución);
   - hablarle al chat de diosa: apretás el mic, hablás el pedido, y el
     texto aparece en el input.

   La carga es perezosa y el import dinámico: transformers.js no entra al
   bundle hasta que alguien lo usa. Si el modelo no baja (sin red, CSP),
   la promesa rechaza con un mensaje legible — degradar, no romper.
----------------------------------------------------------------------------- */

import { aMono, remuestrear, oracionesDeTrozos, type Transcripcion } from "@/lib/motion/stt-puro";

export type { Transcripcion, Oracion } from "@/lib/motion/stt-puro";

const MODELO_DEFAULT = "Xenova/whisper-base";
const HZ_WHISPER = 16000;

type TrozoCrudo = { text: string; timestamp: [number, number | null] };
type SalidaAsr = { text: string; chunks?: TrozoCrudo[] };
type OpcionesAsr = {
  language?: string;
  task?: string;
  return_timestamps?: boolean;
  chunk_length_s?: number;
  stride_length_s?: number;
};
type Asr = (pcm: Float32Array, opciones: OpcionesAsr) => Promise<SalidaAsr>;

let motorPromesa: Promise<Asr> | null = null;

/** Carga (una vez) el pipeline de Whisper. onProgreso: 0–1 de la descarga. */
function motor(onProgreso?: (fraccion: number) => void, modelo = MODELO_DEFAULT): Promise<Asr> {
  if (!motorPromesa) {
    motorPromesa = (async () => {
      // el bundle PREBUILDEADO para browser: el src/ del paquete importa
      // onnxruntime-node y sharp, y el bundler de Next (Turbopack) rompe la
      // selección de backend al empaquetarlo («Cannot convert undefined or
      // null to object»); el dist ya viene aplanado con onnxruntime-web
      const { pipeline, env } = await import("@xenova/transformers/dist/transformers.min.js");
      env.allowLocalModels = false;
      const progreso = (info: { status?: string; progress?: number }) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          onProgreso?.(Math.min(1, info.progress / 100));
        }
      };
      const asr = await pipeline("automatic-speech-recognition", modelo, {
        quantized: true,
        progress_callback: progreso,
      });
      return asr as unknown as Asr;
    })();
    // un fallo de descarga no envenena el próximo intento
    motorPromesa.catch(() => {
      motorPromesa = null;
    });
  }
  return motorPromesa;
}

/**
 * Transcribe PCM (canales crudos con su sample rate) a texto con oraciones
 * y timestamps. `onProgreso` cubre la descarga del modelo la primera vez.
 * `modelo` deja elegir otro Whisper (p. ej. tiny para pruebas rápidas).
 */
export async function transcribir(
  canales: Float32Array[],
  sampleRate: number,
  onProgreso?: (fraccion: number) => void,
  modelo?: string,
): Promise<Transcripcion> {
  const asr = await motor(onProgreso, modelo).catch((e: unknown) => {
    // la causa REAL viaja en el mensaje: sin ella no se puede diagnosticar
    // si falló la descarga, el bundler o el runtime WASM
    const causa = e instanceof Error ? e.message : String(e);
    throw new Error(`No se pudo cargar el modelo de voz: ${causa}`);
  });
  const pcm = remuestrear(aMono(canales), sampleRate, HZ_WHISPER);
  const duracionMs = Math.round((pcm.length / HZ_WHISPER) * 1000);
  const salida = await asr(pcm, {
    language: "spanish",
    task: "transcribe",
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });
  return {
    texto: salida.text.trim(),
    oraciones: oracionesDeTrozos(salida.chunks ?? [], duracionMs),
  };
}
