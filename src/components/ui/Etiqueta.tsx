/* -----------------------------------------------------------------------------
   ANDAMIAJE — doble local del <Etiqueta> de diosa (kit §3.3)

   El rótulo chiquito en mayúsculas, UNA sola escala. Se importa el
   componente, no se copia el string de clases. Al integrar, swap por el real.
----------------------------------------------------------------------------- */

import type { ReactNode } from "react";

export const CLASE_ETIQUETA = "text-[11px] font-medium uppercase tracking-[0.02em] text-foreground/50";

export function Etiqueta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${CLASE_ETIQUETA} ${className}`}>{children}</div>;
}
