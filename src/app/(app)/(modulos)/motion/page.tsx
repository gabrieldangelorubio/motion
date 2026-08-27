/* -----------------------------------------------------------------------------
   Page del módulo motion (Server Component)

   En diosa lleva el gate en una línea —
   `if (!(await puedeVerModulo("motion"))) notFound();` — y carga la
   composición desde la base. Hasta ese cable, abre la demo. La vista es un
   editor: ancho `completo` (§3.4), sin padding lateral propio.
----------------------------------------------------------------------------- */

import { Editor } from "@/components/motion/Editor";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { serializar } from "@/lib/motion/serializar-puro";

export default function PaginaMotion() {
  // el proyecto arranca VACÍO: lienzo limpio con el formato de la casa
  // (la composición demo queda en lib/motion/demo para tests y harness)
  return <Editor snapshotInicial={serializar(crearComposicion({ nombre: "Proyecto" }))} composicionId="demo" />;
}
