"use client";

/* -----------------------------------------------------------------------------
   Recorte del audio — elegir QUÉ SEGMENTO de la locución usa el proyecto

   Aparece al importar la música/voz (y desde «Recortar» en la franja): la
   forma de onda COMPLETA del archivo con dos manijas — arrastrás desde/hasta
   y te quedás con el pedazo que va. Afuera del segmento la onda se atenúa.
   «Usar todo» = sin recorte. El proyecto (timeline, export, transcripción)
   ve únicamente el segmento elegido.
----------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioDecodificado } from "@/lib/motion/audio-guardado";
import { limitarRecorte } from "@/lib/motion/audio-puro";
import { t } from "@/lib/i18n/stub";

const ALTO = 96;

function Tiempo({ ms }: { ms: number }) {
  const s = ms / 1000;
  return <span className="font-mono text-[11px] tabular-nums text-foreground/70">{s.toFixed(2)}s</span>;
}

export function RecorteAudio({
  audio,
  onConfirmar,
  onUsarTodo,
}: {
  audio: AudioDecodificado;
  /** el segmento elegido, en ms del ARCHIVO */
  onConfirmar: (desdeMs: number, hastaMs: number) => void;
  onUsarTodo: () => void;
}) {
  const total = Math.max(1, audio.duracionTotalMs);
  const [desde, setDesde] = useState(audio.recorte?.desdeMs ?? 0);
  const [hasta, setHasta] = useState(audio.recorte?.hastaMs ?? total);
  const marcoRef = useRef<HTMLDivElement>(null);
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const arrastreRef = useRef<"desde" | "hasta" | null>(null);

  useEffect(() => {
    const lienzo = lienzoRef.current;
    const marco = marcoRef.current;
    if (!lienzo || !marco) return;
    const ancho = marco.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(ALTO * dpr);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, ALTO);
    const estilos = getComputedStyle(marco);
    const tinta = estilos.color;
    const acento = estilos.getPropertyValue("--acento").trim() || "#5b8cff";
    const picos = audio.picosTotales;
    const centro = ALTO / 2;
    const x0 = (desde / total) * ancho;
    const x1 = (hasta / total) * ancho;
    for (let x = 0; x < ancho; x++) {
      const pico = picos[Math.min(picos.length - 1, Math.floor((x / ancho) * picos.length))] ?? 0;
      const alto = Math.max(1, pico * (ALTO - 12));
      ctx.fillStyle = tinta;
      ctx.globalAlpha = x >= x0 && x <= x1 ? 0.75 : 0.18; // afuera, atenuado
      ctx.fillRect(x, centro - alto / 2, 1, alto);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = acento;
    ctx.lineWidth = 2;
    for (const x of [x0, x1]) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ALTO);
      ctx.stroke();
    }
  }, [audio, desde, hasta, total]);

  const msDeEvento = useCallback(
    (clientX: number) => {
      const caja = marcoRef.current?.getBoundingClientRect();
      if (!caja) return 0;
      return Math.min(1, Math.max(0, (clientX - caja.left) / caja.width)) * total;
    },
    [total],
  );

  const alBajar = (e: React.PointerEvent) => {
    const ms = msDeEvento(e.clientX);
    // agarra la manija más cercana al click
    arrastreRef.current = Math.abs(ms - desde) <= Math.abs(ms - hasta) ? "desde" : "hasta";
    e.currentTarget.setPointerCapture(e.pointerId);
    alMover(e);
  };
  const alMover = (e: React.PointerEvent) => {
    const cual = arrastreRef.current;
    if (!cual) return;
    const ms = msDeEvento(e.clientX);
    if (cual === "desde") setDesde(Math.min(ms, hasta - 500));
    else setHasta(Math.max(ms, desde + 500));
  };
  const alSoltar = () => (arrastreRef.current = null);

  const limpio = limitarRecorte(desde, hasta, total);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
      <div className="w-full max-w-2xl rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-4 shadow-(--menu-shadow)">
        <div className="text-[15px] font-semibold text-foreground">{t("Recortá la locución")}</div>
        <p className="mt-1 text-[12px] leading-snug text-muted">
          {t("Arrastrá las manijas y quedate con el pedazo que va al proyecto — «{nombre}» dura {s}s entero.", {
            nombre: audio.nombre,
            s: (total / 1000).toFixed(1),
          })}
        </p>
        <div
          ref={marcoRef}
          role="slider"
          aria-label={t("Segmento del audio a usar")}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.round(limpio.desdeMs)}
          className="relative mt-3 cursor-ew-resize touch-none select-none"
          style={{ height: ALTO }}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
        >
          <canvas ref={lienzoRef} className="absolute inset-0 h-full w-full" />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span>
            <Tiempo ms={limpio.desdeMs} /> <span className="text-[11px] text-muted">→</span> <Tiempo ms={limpio.hastaMs} />
            <span className="ml-2 text-[11px] text-muted">
              ({((limpio.hastaMs - limpio.desdeMs) / 1000).toFixed(2)}s)
            </span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onUsarTodo}
              className="flex h-8 items-center rounded-control px-3 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
            >
              {t("Usar todo")}
            </button>
            <button
              type="button"
              onClick={() => onConfirmar(limpio.desdeMs, limpio.hastaMs)}
              className="boton flex h-8 items-center rounded-control bg-acento px-3 text-[12px] font-semibold text-white hover:bg-acento/85"
            >
              {t("Usar este pedazo")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
