"use client";

/* -----------------------------------------------------------------------------
   ANDAMIAJE — doble local del <Segmentado> de diosa (kit §7)

   Mismo contrato de uso (opciones, valor, onCambio); la pieza real desliza
   un thumb medido — este doble marca el activo por fondo. Al integrar, swap.
----------------------------------------------------------------------------- */

export function Segmentado({
  opciones,
  valor,
  onCambio,
  etiquetaAria,
}: {
  opciones: { valor: string; nombre: string }[];
  valor: string;
  onCambio: (v: string) => void;
  etiquetaAria: string;
}) {
  return (
    <div role="group" aria-label={etiquetaAria} className="flex rounded-control p-0.5 shadow-hueco">
      {opciones.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={o.valor === valor}
          onClick={() => onCambio(o.valor)}
          className={[
            "boton h-7 rounded-[8px] px-2.5 font-mono text-[11px] tabular-nums transition-colors",
            o.valor === valor ? "bg-ink/[0.10] text-foreground" : "text-foreground/55 hover:text-foreground/80",
          ].join(" ")}
        >
          {o.nombre}
        </button>
      ))}
    </div>
  );
}
