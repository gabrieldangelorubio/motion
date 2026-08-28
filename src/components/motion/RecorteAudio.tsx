"use client";

/* -----------------------------------------------------------------------------
   Recorte del audio — elegir QUÉ SEGMENTO de la locución usa el proyecto

   Aparece al importar la música/voz (y desde «Recortar» en la franja): la
   forma de onda COMPLETA del archivo con dos manijas — arrastrás desde/hasta
   y te quedás con el pedazo que va. Tiene REPRODUCTOR con teclado PROPIO
   (mientras el modal está abierto, el editor de atrás no recibe teclas):
   ESPACIO reproduce SIEMPRE desde el in (preview del segmento, como en un
   editor de video), I / O fijan in/out en el cursor de escucha, Escape
   sale; click o arrastre fuera de las manijas = escuchar desde ahí. La
   reproducción frena sola al llegar al fin del segmento. «Usar todo» =
   sin recorte; la «×» sale sin tocar nada.
----------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioDecodificado } from "@/lib/motion/audio-guardado";
import { limitarRecorte } from "@/lib/motion/audio-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";

const ALTO = 96;
/** a menos de esto (px) de una manija, el drag agarra la manija; más lejos, es SCRUB */
const UMBRAL_MANIJA_PX = 8;

function Tiempo({ ms }: { ms: number }) {
  const s = ms / 1000;
  return <span className="font-mono text-[11px] tabular-nums text-foreground/70">{s.toFixed(2)}s</span>;
}

export function RecorteAudio({
  audio,
  onConfirmar,
  onUsarTodo,
  onCerrar,
}: {
  audio: AudioDecodificado;
  /** el segmento elegido, en ms del ARCHIVO */
  onConfirmar: (desdeMs: number, hastaMs: number) => void;
  onUsarTodo: () => void;
  /** salir sin cambiar nada */
  onCerrar: () => void;
}) {
  const total = Math.max(1, audio.duracionTotalMs);
  const [desde, setDesde] = useState(audio.recorte?.desdeMs ?? 0);
  const [hasta, setHasta] = useState(audio.recorte?.hastaMs ?? total);
  const [cursor, setCursor] = useState(audio.recorte?.desdeMs ?? 0);
  const [sonando, setSonando] = useState(false);
  const marcoRef = useRef<HTMLDivElement>(null);
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const arrastreRef = useRef<"desde" | "hasta" | "scrub" | null>(null);
  const reproductorRef = useRef<HTMLAudioElement | null>(null);
  const hastaRef = useRef(hasta);
  useEffect(() => {
    hastaRef.current = hasta;
  }, [hasta]);

  // el reproductor del panel: un <audio> propio, esclavo del cursor
  useEffect(() => {
    const el = new Audio(audio.url);
    el.preload = "auto";
    el.ontimeupdate = () => {
      const ms = el.currentTime * 1000;
      setCursor(ms);
      // frena solo al llegar al fin del segmento elegido
      if (ms >= hastaRef.current) {
        el.pause();
        setSonando(false);
      }
    };
    el.onended = () => setSonando(false);
    reproductorRef.current = el;
    return () => {
      el.pause();
      reproductorRef.current = null;
    };
  }, [audio.url]);

  const alternarPlay = useCallback(() => {
    const el = reproductorRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      setSonando(false);
      return;
    }
    // play = SIEMPRE desde el in (preview del segmento, como en un editor de
    // video); escuchar desde otro punto es el click/arrastre sobre la onda
    el.currentTime = desde / 1000;
    setCursor(desde);
    void el.play().catch(() => undefined);
    setSonando(true);
  }, [desde]);

  // ——— teclado del panel: mientras el modal está abierto, EL MODAL manda —
  // espacio acá NO puede darle play al timeline de abajo (capture + stop).
  // Espacio = escuchar desde el in · I/O = fijar in/out en el cursor ———
  const cursorRef = useRef(cursor);
  const desdeRef = useRef(desde);
  const onCerrarRef = useRef(onCerrar);
  useEffect(() => {
    cursorRef.current = cursor;
    desdeRef.current = desde;
    onCerrarRef.current = onCerrar;
  }, [cursor, desde, onCerrar]);
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tecla = e.key.toLowerCase();
      if (![" ", "i", "o", "escape"].includes(tecla)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === " ") alternarPlay();
      else if (tecla === "i") setDesde(Math.min(cursorRef.current, hastaRef.current - 500));
      else if (tecla === "o") {
        setHasta(Math.max(cursorRef.current, desdeRef.current + 500));
        // el out en el cursor suele cerrar la escucha: si venía sonando, frena
        const el = reproductorRef.current;
        if (el && !el.paused && cursorRef.current <= el.currentTime * 1000) {
          el.pause();
          setSonando(false);
        }
      } else {
        reproductorRef.current?.pause();
        onCerrarRef.current();
      }
    };
    window.addEventListener("keydown", alTecla, { capture: true });
    return () => window.removeEventListener("keydown", alTecla, { capture: true });
  }, [alternarPlay]);

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
    // cursor de ESCUCHA (finito, blanco-tinta, encima de todo)
    const xc = (Math.min(cursor, total) / total) * ancho;
    ctx.strokeStyle = tinta;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xc, 0);
    ctx.lineTo(xc, ALTO);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [audio, desde, hasta, cursor, total]);

  const msDeEvento = useCallback(
    (clientX: number) => {
      const caja = marcoRef.current?.getBoundingClientRect();
      if (!caja) return 0;
      return Math.min(1, Math.max(0, (clientX - caja.left) / caja.width)) * total;
    },
    [total],
  );

  const escrub = useCallback((ms: number) => {
    setCursor(ms);
    const el = reproductorRef.current;
    if (el) el.currentTime = ms / 1000;
  }, []);

  const alBajar = (e: React.PointerEvent) => {
    const caja = marcoRef.current?.getBoundingClientRect();
    if (!caja) return;
    const ms = msDeEvento(e.clientX);
    const pxPorMs = caja.width / total;
    const dDesde = Math.abs(ms - desde) * pxPorMs;
    const dHasta = Math.abs(ms - hasta) * pxPorMs;
    // cerca de una manija: la manija; lejos: SCRUB del cursor de escucha
    arrastreRef.current =
      Math.min(dDesde, dHasta) <= UMBRAL_MANIJA_PX ? (dDesde <= dHasta ? "desde" : "hasta") : "scrub";
    e.currentTarget.setPointerCapture(e.pointerId);
    alMover(e);
  };
  const alMover = (e: React.PointerEvent) => {
    const cual = arrastreRef.current;
    if (!cual) return;
    const ms = msDeEvento(e.clientX);
    if (cual === "desde") setDesde(Math.min(ms, hasta - 500));
    else if (cual === "hasta") setHasta(Math.max(ms, desde + 500));
    else escrub(ms);
  };
  const alSoltar = () => (arrastreRef.current = null);

  const limpio = limitarRecorte(desde, hasta, total);
  const cerrar = () => {
    reproductorRef.current?.pause();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
      <div className="relative w-full max-w-2xl rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-4 shadow-(--menu-shadow)">
        <div className="absolute right-2 top-2">
          <BotonIcono tam={28} etiqueta={t("Salir sin recortar")} onClick={cerrar}>
            <Icono nombre="cerrar" width={13} height={13} />
          </BotonIcono>
        </div>
        <div className="text-[15px] font-semibold text-foreground">{t("Recortá la locución")}</div>
        <p className="mt-1 pr-8 text-[12px] leading-snug text-muted">
          {t("Manijas = el segmento que va. Espacio = escuchar desde el in · I / O = fijar in/out en el cursor · click en la onda = escuchar desde ahí. «{nombre}» dura {s}s entero.", {
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
          <span className="flex items-center gap-2">
            <BotonIcono
              tam={30}
              etiqueta={sonando ? t("Pausar la escucha (espacio)") : t("Escuchar desde el in (espacio)")}
              onClick={alternarPlay}
            >
              <Icono nombre={sonando ? "pausa" : "play"} width={13} height={13} />
            </BotonIcono>
            <span>
              <Tiempo ms={limpio.desdeMs} /> <span className="text-[11px] text-muted">→</span> <Tiempo ms={limpio.hastaMs} />
              <span className="ml-2 text-[11px] text-muted">
                ({((limpio.hastaMs - limpio.desdeMs) / 1000).toFixed(2)}s)
              </span>
            </span>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                reproductorRef.current?.pause();
                onUsarTodo();
              }}
              className="flex h-8 items-center rounded-control px-3 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
            >
              {t("Usar todo")}
            </button>
            <button
              type="button"
              onClick={() => {
                reproductorRef.current?.pause();
                onConfirmar(limpio.desdeMs, limpio.hastaMs);
              }}
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
