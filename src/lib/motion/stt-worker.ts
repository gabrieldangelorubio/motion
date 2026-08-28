/* -----------------------------------------------------------------------------
   STT en un WEB WORKER — whisper fuera del hilo de la UI

   Transcribir con el modelo en el hilo principal congelaba la página
   («Page Unresponsive» mientras el WASM mastica). Este worker corre el
   MISMO transcribir() de stt.ts (cascada de modelos, parche del alineador,
   poda de loops incluidos) y le va soplando el progreso al caller.
   Protocolo: entra {id, canales, sampleRate, modelo?, idioma?}; salen
   {id, tipo: "progreso", fraccion} · {id, tipo: "listo", transcripcion} ·
   {id, tipo: "error", mensaje}.
----------------------------------------------------------------------------- */

import { transcribir } from "@/lib/motion/stt";

type Pedido = {
  id: number;
  canales: Float32Array[];
  sampleRate: number;
  modelo?: string;
  idioma?: string;
};

const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<Pedido>) => void) | null };

ctx.onmessage = (e: MessageEvent<Pedido>) => {
  const { id, canales, sampleRate, modelo, idioma } = e.data;
  void (async () => {
    try {
      const transcripcion = await transcribir(
        canales,
        sampleRate,
        (fraccion) => ctx.postMessage({ id, tipo: "progreso", fraccion }),
        modelo,
        idioma,
      );
      ctx.postMessage({ id, tipo: "listo", transcripcion });
    } catch (err) {
      ctx.postMessage({ id, tipo: "error", mensaje: err instanceof Error ? err.message : String(err) });
    }
  })();
};
