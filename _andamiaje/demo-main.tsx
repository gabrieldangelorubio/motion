// Entrada del bundle demo: monta el Editor real fuera de Next.
// El "server action" de guardado corre acá mismo (Map en memoria del
// browser): el autosave funciona dentro de la sesión de la página.
import { createRoot } from "react-dom/client";
import { Editor } from "@/components/motion/Editor";
import { COMPOSICION_DEMO } from "@/lib/motion/demo";
import { serializar } from "@/lib/motion/serializar-puro";

const raiz = document.getElementById("raiz");
if (raiz) {
  createRoot(raiz).render(
    <Editor snapshotInicial={serializar(COMPOSICION_DEMO)} composicionId="demo" />,
  );
}
