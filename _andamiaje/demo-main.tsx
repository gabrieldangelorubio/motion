// Entrada del bundle demo: monta el Editor real fuera de Next.
// El "server action" de guardado corre acá mismo (Map en memoria del
// browser): el autosave funciona dentro de la sesión de la página.
// La entrega del MP4 usa la capacidad `downloads` del host cuando existe
// (la página publicada no puede iniciar descargas directas); fuera del
// host, cae a la descarga normal del browser.
import { createRoot } from "react-dom/client";
import { Editor } from "@/components/motion/Editor";
import { COMPOSICION_DEMO } from "@/lib/motion/demo";
import { serializar } from "@/lib/motion/serializar-puro";
import { descargarBlob } from "@/lib/motion/exportar";

type ApiDescargas = { save: (r: { filename: string; data: Blob }) => Promise<unknown> };
type ClaudeHost = { use: (nombre: string) => Promise<unknown> };

async function entregarExport(blob: Blob, nombre: string): Promise<void> {
  const host = (window as unknown as { claude?: ClaudeHost }).claude;
  const api = host ? ((await host.use("downloads").catch(() => null)) as ApiDescargas | null) : null;
  if (api?.save) {
    try {
      await api.save({ filename: nombre, data: blob });
      return;
    } catch (e) {
      const codigo = (e as { code?: string })?.code;
      if (codigo === "declined") return; // el viewer dijo que no: no es un error
      throw new Error("No se pudo entregar el archivo en esta vista");
    }
  }
  descargarBlob(blob, nombre);
}

const raiz = document.getElementById("raiz");
if (raiz) {
  createRoot(raiz).render(
    <Editor
      snapshotInicial={serializar(COMPOSICION_DEMO)}
      composicionId="demo"
      entregarExport={entregarExport}
      conAgente={false} // la página publicada no tiene backend para el agente
    />,
  );
}
