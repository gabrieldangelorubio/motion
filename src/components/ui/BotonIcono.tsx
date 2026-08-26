"use client";

/* -----------------------------------------------------------------------------
   ANDAMIAJE — doble local del <BotonIcono> de diosa (kit §5), misma firma

   En la integración se borra y el import apunta a la pieza real. Mantiene
   el contrato: botón-ícono enmarcado, `activo` = toggle con aria-pressed,
   piso táctil cuando mide menos de 44.
----------------------------------------------------------------------------- */

import type { ReactNode } from "react";

export function BotonIcono({
  tam = 36,
  tono = "neutro",
  activo,
  etiqueta,
  onClick,
  deshabilitado,
  children,
}: {
  tam?: number;
  tono?: "neutro" | "peligro";
  activo?: boolean;
  /** aria-label: nombrá la COSA (kit §5) */
  etiqueta: string;
  onClick?: () => void;
  deshabilitado?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={etiqueta}
      aria-pressed={activo}
      disabled={deshabilitado}
      onClick={onClick}
      className={[
        "boton-icono relative grid shrink-0 place-items-center rounded-control border border-(--glass-border) shadow-control",
        tono === "peligro" ? "hover:bg-peligro/10 hover:text-peligro" : "hover:bg-ink/[0.06]",
        activo ? "bg-ink/[0.08] text-foreground" : "text-foreground/80",
        "after:absolute after:left-1/2 after:top-1/2 after:size-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
      ].join(" ")}
      style={{ width: tam, height: tam }}
    >
      {children}
    </button>
  );
}
