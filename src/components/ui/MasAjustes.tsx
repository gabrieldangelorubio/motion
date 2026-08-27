"use client";

/* -----------------------------------------------------------------------------
   «Más ajustes» — divulgación progresiva del inspector

   Cada sección muestra sólo lo esencial; lo avanzado vive atrás de este
   acordeón chiquito (cerrado por defecto). El patrón NN/g: pocas opciones
   importantes primero, el resto a un click, nunca borrado.
----------------------------------------------------------------------------- */

import { useState, type ReactNode } from "react";
import { Icono } from "@/components/icons";
import { t } from "@/lib/i18n/stub";

export function MasAjustes({ children }: { children: ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setAbierto((a) => !a)}
        aria-expanded={abierto}
        className="flex w-full items-center gap-1 rounded-control px-1 py-1 text-[10px] font-medium uppercase tracking-[0.02em] text-foreground/40 transition-colors hover:text-foreground/70"
      >
        <Icono
          nombre="chevronAbajo"
          width={11}
          height={11}
          className={`shrink-0 transition-transform duration-200 ${abierto ? "" : "-rotate-90"}`}
        />
        {t("Más ajustes")}
      </button>
      {abierto && <div className="mt-2 flex flex-col gap-2">{children}</div>}
    </div>
  );
}
