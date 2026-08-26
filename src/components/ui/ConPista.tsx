"use client";

/* -----------------------------------------------------------------------------
   ANDAMIAJE — doble local del <ConPista> de diosa (tooltip del sistema)

   Mismo uso: envuelve el control y muestra la pista al hover con puntero
   fino. La pieza real portalea y resuelve solapes; este doble alcanza para
   probar el módulo aparte. Nunca `title=` nativo (lista negra §11).
----------------------------------------------------------------------------- */

import type { ReactNode } from "react";

export function ConPista({ pista, children }: { pista: string; children: ReactNode }) {
  return (
    <span className="group/pista relative inline-grid">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-control border border-(--menu-border) bg-(--tooltip-bg) px-2.5 py-1 text-[11px] text-foreground shadow-(--menu-shadow) [@media(hover:hover)_and_(pointer:fine)]:group-hover/pista:block"
      >
        {pista}
      </span>
    </span>
  );
}
