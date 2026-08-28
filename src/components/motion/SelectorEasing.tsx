"use client";

/* -----------------------------------------------------------------------------
   Selector de easing CON LA CURVA A LA VISTA

   El nombre solo («salidaElastico»?) no le dice nada al ojo: acá cada easing
   se muestra como su CURVA real — dibujada sampleando la función verdadera
   de easings-puro, nunca un dibujito aproximado. El botón muestra la curva
   elegida; el popover, la grilla completa para comparar de un vistazo (los
   overshoots del back/elástico se ven salir del carril). Elegir es click.
----------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import { EASINGS } from "@/lib/motion/easings-puro";
import type { NombreEasing } from "@/lib/motion/modelo";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";

function Curva({ nombre, ancho, alto }: { nombre: NombreEasing; ancho: number; alto: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(ancho * dpr);
    canvas.height = Math.round(alto * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, alto);
    const fn = EASINGS[nombre] ?? EASINGS.suave;
    // margen vertical del 22%: el overshoot del back/elástico se ve salir
    const m = alto * 0.22;
    const y = (v: number) => alto - m - v * (alto - 2 * m);
    // el carril 0→1 de referencia, finito
    ctx.strokeStyle = "currentColor";
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y(0));
    ctx.lineTo(ancho, y(0));
    ctx.moveTo(0, y(1));
    ctx.lineTo(ancho, y(1));
    ctx.stroke();
    // la curva real
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 56; i++) {
      const p = i / 56;
      const px = p * ancho;
      const py = y(fn(p));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [nombre, ancho, alto]);
  return <canvas ref={ref} style={{ width: ancho, height: alto }} className="block" aria-hidden />;
}

export function SelectorEasing({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string;
  valor: NombreEasing;
  onCambio: (easing: NombreEasing) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const nombres = Object.keys(EASINGS) as NombreEasing[];

  return (
    <div className="relative">
      <Etiqueta className="mb-1">{etiqueta}</Etiqueta>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        className="flex h-9 w-full items-center gap-2 rounded-control px-2 text-left shadow-control hover:bg-ink/[0.06]"
      >
        <span className="text-foreground/70">
          <Curva nombre={valor} ancho={44} alto={26} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] text-foreground/85">{valor}</span>
        <span aria-hidden className="text-[10px] text-foreground/45">▾</span>
      </button>
      {abierto && (
        <>
          {/* clickear afuera cierra */}
          <div className="fixed inset-0 z-20" onClick={() => setAbierto(false)} aria-hidden />
          <div
            role="listbox"
            aria-label={t("Curvas de easing")}
            className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-1.5 shadow-(--menu-shadow)"
          >
            <div className="grid grid-cols-3 gap-1">
              {nombres.map((nombre) => (
                <button
                  key={nombre}
                  type="button"
                  role="option"
                  aria-selected={nombre === valor}
                  onClick={() => {
                    onCambio(nombre);
                    setAbierto(false);
                  }}
                  title={nombre}
                  className={[
                    "flex flex-col items-center gap-0.5 rounded-control p-1 pb-0.5",
                    nombre === valor ? "bg-acento/15 text-acento" : "text-foreground/65 hover:bg-ink/[0.06] hover:text-foreground",
                  ].join(" ")}
                >
                  <Curva nombre={nombre} ancho={56} alto={30} />
                  <span className="w-full truncate text-center text-[9px] leading-3">{nombre}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
