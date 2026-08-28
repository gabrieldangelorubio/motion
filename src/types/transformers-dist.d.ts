/** El bundle browser prebuildeado de transformers.js (ver stt.ts: el src/
    del paquete no sobrevive al bundler de Next). Tipos mínimos que usamos. */
declare module "@xenova/transformers/dist/transformers.min.js" {
  export const env: { allowLocalModels: boolean };
  export function pipeline(
    tarea: string,
    modelo?: string,
    opciones?: {
      quantized?: boolean;
      progress_callback?: (info: { status?: string; progress?: number }) => void;
      /** export alternativo del modelo (p. ej. "output_attentions" para
          timestamps por palabra de Whisper) */
      revision?: string;
    },
  ): Promise<unknown>;
}
