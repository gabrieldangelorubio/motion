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

import {
  aMono,
  framesDeEncoder,
  remuestrear,
  limpiarPalabras,
  oracionesDeTrozos,
  oracionesDePalabras,
  palabrasDeTrozos,
  type Transcripcion,
} from "@/lib/motion/stt-puro";

export type { Transcripcion, Oracion, Palabra } from "@/lib/motion/stt-puro";

// small le gana LEJOS a base con voz sobre música (el caso real: la locución
// de un case study); si su descarga falla, base sigue siendo el paracaídas.
const MODELO_DEFAULT = "Xenova/whisper-small";
const MODELO_RESPALDO = "Xenova/whisper-base";
const HZ_WHISPER = 16000;

type TrozoCrudo = { text: string; timestamp: [number, number | null] };
type SalidaAsr = { text: string; chunks?: TrozoCrudo[] };
type OpcionesAsr = {
  language?: string;
  task?: string;
  /** true = timestamps por trozo/oración; "word" = POR PALABRA */
  return_timestamps?: boolean | "word";
  chunk_length_s?: number;
  stride_length_s?: number;
};
type Asr = (pcm: Float32Array, opciones: OpcionesAsr) => Promise<SalidaAsr>;

let motorPromesa: Promise<Asr> | null = null;

/** Carga (una vez) el pipeline de Whisper. onProgreso: 0–1 de la descarga.
    Los timestamps POR PALABRA necesitan el export del modelo que trae las
    cross-attentions (revision "output_attentions"); si ese export no está,
    cae al modelo estándar — la transcripción sale igual, por oración. */
function motor(onProgreso?: (fraccion: number) => void, modelo = MODELO_DEFAULT): Promise<Asr> {
  if (!motorPromesa) {
    motorPromesa = (async () => {
      // el bundle PREBUILDEADO para browser: el src/ del paquete importa
      // onnxruntime-node y sharp, y el bundler de Next (Turbopack) rompe la
      // selección de backend al empaquetarlo («Cannot convert undefined or
      // null to object»); el dist ya viene aplanado con onnxruntime-web
      const mod = await import("@xenova/transformers/dist/transformers.min.js");
      const { pipeline, env } = mod;
      env.allowLocalModels = false;
      // ——— PARCHE del alineador de palabras (bug de transformers.js 2.17):
      // al extraer los timestamps por palabra le pasa `num_frames` en frames
      // del MEL, pero la máscara del DTW vive en frames del ENCODER (la
      // mitad) — ver framesDeEncoder. Sin esto las palabras derivan hacia el
      // final (hasta 2× la duración real) en todo audio < 30s. Se parchea el
      // prototipo UNA vez, envolviendo el método original.
      const Whisper = (mod as {
        WhisperForConditionalGeneration?: { prototype: Record<string, unknown> };
      }).WhisperForConditionalGeneration;
      const proto = Whisper?.prototype as
        | { _extract_token_timestamps?: (...args: unknown[]) => unknown; __parcheFramesDiosa?: boolean }
        | undefined;
      if (proto?._extract_token_timestamps && !proto.__parcheFramesDiosa) {
        const original = proto._extract_token_timestamps;
        proto._extract_token_timestamps = function (
          salidas: unknown,
          cabezas: unknown,
          numFrames?: unknown,
          precision?: unknown,
        ) {
          return original.call(
            this,
            salidas,
            cabezas,
            framesDeEncoder(typeof numFrames === "number" ? numFrames : null),
            precision ?? 0.02,
          );
        };
        proto.__parcheFramesDiosa = true;
      }
      const progreso = (info: { status?: string; progress?: number }) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          onProgreso?.(Math.min(1, info.progress / 100));
        }
      };
      // en orden de preferencia: el modelo pedido con cross-attentions
      // (timestamps por palabra), sin ellas, y el respaldo chico igual
      const candidatos: { m: string; revision?: string }[] = [
        { m: modelo, revision: "output_attentions" },
        { m: modelo },
        { m: MODELO_RESPALDO, revision: "output_attentions" },
        { m: MODELO_RESPALDO },
      ];
      let ultimoError: unknown = null;
      for (const c of candidatos) {
        try {
          const asr = await pipeline("automatic-speech-recognition", c.m, {
            quantized: true,
            progress_callback: progreso,
            ...(c.revision ? { revision: c.revision } : {}),
          });
          return asr as unknown as Asr;
        } catch (e) {
          ultimoError = e;
        }
      }
      throw ultimoError instanceof Error ? ultimoError : new Error(String(ultimoError));
    })();
    // un fallo de descarga no envenena el próximo intento
    motorPromesa.catch(() => {
      motorPromesa = null;
    });
  }
  return motorPromesa;
}

/**
 * Transcribe PCM (canales crudos con su sample rate) a texto con PALABRAS
 * y oraciones con timestamps. Sin `idioma` se AUTODETECTA (la voz en off
 * puede venir en inglés o castellano: forzar un idioma la destroza — visto
 * con "spanish" hardcodeado sobre locución en inglés); el DICTADO del chat
 * en cambio SÍ fuerza "spanish" — con un clip corto la autodetección a
 * veces dice inglés y whisper devuelve el pedido TRADUCIDO. `onProgreso`
 * cubre la descarga del modelo la primera vez. Si el modelo no da
 * timestamps por palabra, degrada a oraciones por trozo — nunca a nada.
 */
export async function transcribir(
  canales: Float32Array[],
  sampleRate: number,
  onProgreso?: (fraccion: number) => void,
  modelo?: string,
  idioma?: string,
): Promise<Transcripcion> {
  const asr = await motor(onProgreso, modelo).catch((e: unknown) => {
    // la causa REAL viaja en el mensaje: sin ella no se puede diagnosticar
    // si falló la descarga, el bundler o el runtime WASM
    const causa = e instanceof Error ? e.message : String(e);
    throw new Error(`No se pudo cargar el modelo de voz: ${causa}`);
  });
  const pcm = remuestrear(aMono(canales), sampleRate, HZ_WHISPER);
  const duracionMs = Math.round((pcm.length / HZ_WHISPER) * 1000);
  // sin `language`: Whisper detecta solo; task transcribe = jamás traducir
  const base: OpcionesAsr = {
    task: "transcribe",
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(idioma ? { language: idioma } : {}),
  };
  try {
    const salida = await asr(pcm, { ...base, return_timestamps: "word" });
    // los LOOPS de whisper (la misma palabra repetida decenas de veces) se
    // podan acá: mejor perder una repetición real que entregar el trabón
    const palabras = limpiarPalabras(palabrasDeTrozos(salida.chunks ?? [], duracionMs));
    if (palabras.length === 0) throw new Error("el modelo no dio palabras");
    return {
      texto: salida.text.trim(),
      oraciones: oracionesDePalabras(palabras),
      palabras,
    };
  } catch {
    // sin cross-attentions (modelo estándar): timestamps por trozo
    const salida = await asr(pcm, { ...base, return_timestamps: true });
    return {
      texto: salida.text.trim(),
      oraciones: oracionesDeTrozos(salida.chunks ?? [], duracionMs),
    };
  }
}

/* ——— La versión que NO congela la página ————————————————————————
   El WASM de whisper mastica segundos enteros: en el hilo principal eso es
   «Page Unresponsive». Acá el trabajo va a un WEB WORKER (uno solo, vivo
   entre transcripciones: el pipeline queda calentito) y el hilo de la UI
   sigue respirando. Si el worker no arranca o revienta, DEGRADA al hilo
   principal — más lento y congelado, pero nunca roto. */

type MensajeWorker =
  | { id: number; tipo: "progreso"; fraccion: number }
  | { id: number; tipo: "listo"; transcripcion: Transcripcion }
  | { id: number; tipo: "error"; mensaje: string };

let workerStt: Worker | null = null;
let idPedido = 0;

export function transcribirConWorker(
  canales: Float32Array[],
  sampleRate: number,
  onProgreso?: (fraccion: number) => void,
  modelo?: string,
  idioma?: string,
): Promise<Transcripcion> {
  const directo = () => transcribir(canales, sampleRate, onProgreso, modelo, idioma);
  if (typeof Worker === "undefined") return directo();
  return new Promise((resolver, rechazar) => {
    try {
      // el worker viaja PRECOMPILADO en public/ (npm run build:worker →
      // esbuild empaqueta stt-worker.ts con el dist de transformers): el
      // patrón new Worker(new URL(...)) colgaba el build de Turbopack al
      // intentar armar el grafo del worker. Si stt.ts o stt-puro.ts
      // cambian, re-correr build:worker (queda commiteado).
      workerStt ??= new Worker("/stt-worker.js");
    } catch {
      directo().then(resolver, rechazar);
      return;
    }
    const worker = workerStt;
    const id = ++idPedido;
    let terminado = false;
    const alMensaje = (e: MessageEvent<MensajeWorker>) => {
      const m = e.data;
      if (!m || m.id !== id) return;
      if (m.tipo === "progreso") {
        onProgreso?.(m.fraccion);
        return;
      }
      terminado = true;
      worker.removeEventListener("message", alMensaje);
      worker.removeEventListener("error", alError);
      if (m.tipo === "listo") resolver(m.transcripcion);
      else rechazar(new Error(m.mensaje));
    };
    const alError = () => {
      if (terminado) return;
      terminado = true;
      worker.removeEventListener("message", alMensaje);
      worker.removeEventListener("error", alError);
      // el worker murió (bundle, WASM, memoria): un solo intento degradado
      // en el hilo principal — los canales NO se transfirieron, siguen vivos
      workerStt?.terminate();
      workerStt = null;
      directo().then(resolver, rechazar);
    };
    worker.addEventListener("message", alMensaje);
    worker.addEventListener("error", alError);
    // clonar (sin transferir): si el worker falla, el fallback necesita el PCM
    worker.postMessage({ id, canales, sampleRate, modelo, idioma });
  });
}
