"use client";

/* -----------------------------------------------------------------------------
   Campo numérico del inspector — con SCRUB estilo Figma/Blender (kit §2.8)

   Arrastrás horizontal sobre el campo y el valor corre con el mouse, suave
   (Pointer Lock cuando el browser lo da: el cursor no choca contra el borde
   de la pantalla). Shift acelera ×10, Alt afina ×0.1. Un click seco enfoca
   el input y tipeás como siempre. `onInicio` es el checkpoint de undo: UNA
   vez por gesto de arrastre o por sesión de tipeo — cada gesto entero es un
   paso de deshacer. Con min y max finitos el campo muestra un RELLENO de
   slider (la proporción del rango) que acompaña el valor.

   La etiqueta vive ADENTRO del campo (chica, apagada) y el número a la
   derecha en mono: una sola fila sólida por propiedad. En punteros gruesos
   el número sube a 16px para no disparar el zoom de iOS (kit §2.8).
----------------------------------------------------------------------------- */

import { useRef, useState } from "react";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const marcado = useRef(false);
  const [arrastrando, setArrastrando] = useState(false);

  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const redondear = (v: number) => Math.round(v * 100) / 100;

  const alBajar = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // ya está en modo tipeo: dejá seleccionar texto y mover el caret
    if (document.activeElement === inputRef.current) return;
    e.preventDefault();
    const objetivo = e.currentTarget as HTMLElement;
    const gesto = { v: valor, acumulado: 0, activo: false };
    const alMover = (ev: PointerEvent) => {
      gesto.acumulado += ev.movementX;
      if (!gesto.activo) {
        if (Math.abs(gesto.acumulado) < 3) return; // umbral: el click seco enfoca
        gesto.activo = true;
        setArrastrando(true);
        if (!marcado.current) {
          marcado.current = true;
          onInicio?.();
        }
        // sin el lock igual anda (movementX existe siempre); con lock el
        // cursor puede arrastrar de acá a la China sin chocar con el borde
        try {
          objetivo.requestPointerLock?.();
        } catch {
          /* headless o browser sin lock: degrada sin drama */
        }
      }
      const fino = ev.altKey ? 0.1 : ev.shiftKey ? 10 : 1;
      // 4px de mouse por paso: suave y controlable
      gesto.v = clamp(gesto.v + (ev.movementX / 4) * paso * fino);
      onCambio(redondear(gesto.v));
    };
    const alSoltar = () => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      setArrastrando(false);
      marcado.current = false; // el próximo gesto es OTRO paso de undo
      try {
        document.exitPointerLock?.();
      } catch {
        /* sin lock */
      }
      if (!gesto.activo) {
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
  };

  const acotado = min !== undefined && max !== undefined && Number.isFinite(valor);
  const pct = acotado ? Math.min(100, Math.max(0, ((valor - min!) / (max! - min!)) * 100)) : 0;

  return (
    <label className="block select-none">
      <div
        onPointerDown={alBajar}
        className={[
          "relative flex h-8 items-center gap-1.5 overflow-hidden rounded-control px-2 shadow-hueco",
          "cursor-ew-resize",
          arrastrando ? "ring-1 ring-acento/40" : "",
        ].join(" ")}
        style={{ touchAction: "none" }}
      >
        {acotado && (
          <div
            className="pointer-events-none absolute inset-y-0 left-0 bg-acento/12 transition-[width] duration-75 ease-out"
            style={{ width: `${pct}%` }}
          />
        )}
        <span className="relative shrink-0 text-[10px] font-medium uppercase tracking-[0.02em] text-foreground/45">
          {etiqueta}
        </span>
        <input
          ref={inputRef}
          type="number"
          value={Number.isFinite(valor) ? redondear(valor) : 0}
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
            onCambio(clamp(v));
          }}
          className="relative w-full min-w-0 bg-transparent text-right font-mono text-[13px] tabular-nums text-foreground outline-none coarse:text-[16px]"
        />
        {sufijo && <span className="relative shrink-0 font-mono text-[10px] text-foreground/40">{sufijo}</span>}
      </div>
    </label>
  );
}
