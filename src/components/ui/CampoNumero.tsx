"use client";

/* -----------------------------------------------------------------------------
   ANDAMIAJE — campo numérico del inspector (en el espíritu de Campo/kit §2.8)

   Un <input type="number"> sin flechas nativas (el kit lo dice explícito: se
   edita tipeando), a 16px para no disparar el zoom de iOS, con el valor en
   mono. `onInicio` es el checkpoint de undo: se dispara UNA vez por sesión
   de foco, así toda la edición tipeada es un solo paso de deshacer.
----------------------------------------------------------------------------- */

import { useRef } from "react";
import { Etiqueta } from "@/components/ui/Etiqueta";

export function CampoNumero({
  etiqueta,
  valor,
  onCambio,
  onInicio,
  paso = 1,
  min,
  max,
  sufijo,
}: {
  etiqueta: string;
  valor: number;
  onCambio: (v: number) => void;
  onInicio?: () => void;
  paso?: number;
  min?: number;
  max?: number;
  sufijo?: string;
}) {
  const marcado = useRef(false);
  return (
    <label className="block">
      <Etiqueta className="mb-1">{etiqueta}</Etiqueta>
      <div className="flex items-center gap-1 rounded-control shadow-hueco px-2">
        <input
          type="number"
          value={Number.isFinite(valor) ? Math.round(valor * 100) / 100 : 0}
          step={paso}
          min={min}
          max={max}
          onFocus={() => {
            marcado.current = false;
          }}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!Number.isFinite(v)) return;
            if (!marcado.current) {
              marcado.current = true;
              onInicio?.();
            }
            onCambio(min !== undefined || max !== undefined ? Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v)) : v);
          }}
          className="w-full bg-transparent py-1.5 font-mono text-base tabular-nums text-foreground outline-none"
        />
        {sufijo && <span className="shrink-0 font-mono text-[11px] text-foreground/40">{sufijo}</span>}
      </div>
    </label>
  );
}
