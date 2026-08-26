"use client";

/* -----------------------------------------------------------------------------
   ANDAMIAJE — doble local del <Desplegable> de diosa (kit §7)

   Mismo contrato de uso (etiqueta, valor, opciones, onCambio) sin <select>
   nativo. La pieza real crece desde el botón, portalea y hace FLIP; este
   doble alcanza para el repo aparte: lista absoluta, Esc/click afuera
   cierra, superficie sólida (vive sobre el chrome del editor).
----------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { Icono } from "@/components/icons";

export function Desplegable({
  etiqueta,
  valor,
  opciones,
  onCambio,
}: {
  etiqueta: string;
  valor: string;
  opciones: { valor: string; nombre: string }[];
  onCambio: (v: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const alClickear = (e: MouseEvent) => {
      if (!raizRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAbierto(false);
      }
    };
    window.addEventListener("mousedown", alClickear);
    window.addEventListener("keydown", alTeclear, { capture: true });
    return () => {
      window.removeEventListener("mousedown", alClickear);
      window.removeEventListener("keydown", alTeclear, { capture: true });
    };
  }, [abierto]);

  const actual = opciones.find((o) => o.valor === valor);

  return (
    <div ref={raizRef} className="relative">
      <Etiqueta className="mb-1">{etiqueta}</Etiqueta>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((a) => !a)}
        className="boton flex h-9 w-full items-center justify-between gap-2 rounded-control px-3 text-[13px] shadow-control hover:bg-ink/[0.06]"
      >
        <span className="truncate">{actual?.nombre ?? valor}</span>
        <Icono nombre="chevronAbajo" width={14} height={14} className={`shrink-0 text-foreground/50 transition-transform duration-200 ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-56 overflow-y-auto rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-1 shadow-(--menu-shadow)"
        >
          {opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="option"
              aria-selected={o.valor === valor}
              onClick={() => {
                onCambio(o.valor);
                setAbierto(false);
              }}
              className={[
                "relative block w-full rounded-control px-2.5 py-1.5 text-left text-[13px] hover:bg-ink/[0.06]",
                o.valor === valor ? "text-foreground" : "text-foreground/75",
              ].join(" ")}
            >
              {o.valor === valor && <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-acento" />}
              <span className="pl-1.5">{o.nombre}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
