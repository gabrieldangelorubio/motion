"use client";

/* -----------------------------------------------------------------------------
   Deslizador — el range de la casa (kit §6: ningún control nativo fuera
   de ui/). Fino y sobrio: riel hueco, pulgar acento. `onSoltar` avisa
   cuando el gesto termina (para confirmar un preview en vivo).
----------------------------------------------------------------------------- */

export function Deslizador({
  valor,
  min,
  max,
  paso = 0.01,
  etiqueta,
  onCambio,
  onSoltar,
}: {
  valor: number;
  min: number;
  max: number;
  paso?: number;
  /** aria-label obligatorio: el deslizador no lleva texto visible */
  etiqueta: string;
  onCambio: (valor: number) => void;
  onSoltar?: () => void;
}) {
  return (
    <input
      type="range"
      value={valor}
      min={min}
      max={max}
      step={paso}
      aria-label={etiqueta}
      onChange={(e) => onCambio(Number(e.target.value))}
      onPointerUp={onSoltar}
      onKeyUp={(e) => {
        if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") onSoltar?.();
      }}
      className="h-1.5 w-full min-w-0 cursor-ew-resize appearance-none rounded-full bg-ink/15 accent-acento outline-none"
    />
  );
}
