/* -----------------------------------------------------------------------------
   Page del módulo motion (Server Component)

   En diosa lleva el gate en una línea —
   `if (!(await puedeVerModulo("motion"))) notFound();` — y carga la
   composición desde la base. Hasta ese cable, abre la demo. La vista es un
   editor: ancho `completo` (§3.4), sin padding lateral propio.
----------------------------------------------------------------------------- */

import { Editor } from "@/components/motion/Editor";
import { COMPOSICION_DEMO } from "@/lib/motion/demo";
import { serializar } from "@/lib/motion/serializar-puro";

export default function PaginaMotion() {
  return <Editor snapshotInicial={serializar(COMPOSICION_DEMO)} composicionId="demo" />;
}
