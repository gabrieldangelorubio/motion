"use client";

/* -----------------------------------------------------------------------------
   Franja de audio del proyecto — la voz en off estructurando las escenas

   Vive arriba de la línea de tiempo, a lo ancho: la forma de onda del audio
   del proyecto (ritmo y pausas a la vista) con los CORTES de escena encima.
   El eje X es el tiempo GLOBAL del proyecto (las escenas concatenadas, el
   mismo orden del export).

   - Click en la franja → salta a ese punto (cambia de escena si hace falta).
   - Arrastrar un corte → ajusta la duración de la escena que termina ahí:
     así separás la locución en segmentos («esto es la escena 1, esto la 2»).
   - El cursor muestra dónde va sonando el playhead de la escena activa.
----------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioDecodificado } from "@/lib/motion/audio-guardado";
import { duracionTotal, type CorteEscena } from "@/lib/motion/audio-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";

const ALTO = 44;
const UMBRAL_CORTE_PX = 6;

export function AudioDeProyecto({
  audio,
  cortes,
  escenaActiva,
  tiempoMs,
  onSaltar,
  onCortar,
  onQuitar,
  onRecortarAudio,
  onTranscribir,
  transcribiendo = null,
}: {
  audio: AudioDecodificado;
  cortes: CorteEscena[];
  escenaActiva: string;
  /** tiempo local del playhead en la escena activa */
  tiempoMs: number;
  onSaltar: (globalMs: number) => void;
  /** la escena `id` pasa a durar `duracionMs` (soltar el corte) */
  onCortar: (id: string, duracionMs: number) => void;
  onQuitar: () => void;
  /** reabre el panel de recorte (elegir otro segmento del archivo) */
  onRecortarAudio?: () => void;
  /** corre Whisper local sobre el audio del proyecto */
  onTranscribir?: () => void;
  /** estado del STT en curso (null = quieto) */
  transcribiendo?: string | null;
}) {
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  // corte en drag: índice del corte (la escena que TERMINA ahí) + posición viva
  const [arrastre, setArrastre] = useState<{ indice: number; globalMs: number } | null>(null);
  const arrastreRef = useRef<typeof arrastre>(null);
  useEffect(() => {
    arrastreRef.current = arrastre;
  }, [arrastre]);

  const totalEscenas = duracionTotal(cortes);
  const total = Math.max(totalEscenas, audio.duracionMs, 1);

  const activa = cortes.find((c) => c.id === escenaActiva);
  const globalPlayhead = (activa?.desdeMs ?? 0) + tiempoMs;

  // ——— pintar la franja: onda + cortes + playhead ———
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

    // la onda ocupa el tramo del audio dentro del total global
    const anchoOnda = (audio.duracionMs / total) * ancho;
    const picos = audio.picos;
    const centro = ALTO / 2;
    ctx.fillStyle = tinta;
    ctx.globalAlpha = 0.55;
    const pasos = Math.max(1, Math.floor(anchoOnda));
    for (let x = 0; x < pasos; x++) {
      const pico = picos[Math.min(picos.length - 1, Math.floor((x / anchoOnda) * picos.length))] ?? 0;
      // piso de 1px: el silencio se ve como línea — las PAUSAS de la locución
      const alto = Math.max(1, pico * (ALTO - 10));
      ctx.fillRect(x, centro - alto / 2, 1, alto);
    }
    ctx.globalAlpha = 1;

    // cortes de escena (el arrastrado se pinta en su posición viva)
    const vivo = arrastre;
    for (let i = 0; i < cortes.length; i++) {
      const fin = cortes[i].desdeMs + cortes[i].duracionMs;
      const globalCorte = vivo && vivo.indice === i ? vivo.globalMs : fin;
      const x = (globalCorte / total) * ancho;
      const esUltimo = i === cortes.length - 1;
      ctx.strokeStyle = acento;
      ctx.globalAlpha = esUltimo ? 0.45 : 0.9;
      ctx.lineWidth = vivo && vivo.indice === i ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ALTO);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // nombre de cada escena al inicio de su tramo
    ctx.fillStyle = tinta;
    ctx.globalAlpha = 0.6;
    ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
    for (const corte of cortes) {
      const x = (corte.desdeMs / total) * ancho;
      ctx.fillText(corte.nombre, x + 4, 10);
    }
    ctx.globalAlpha = 1;

    // la transcripción: cada oración escrita SOBRE su tramo del audio (donde
    // cae en el tiempo), recortada a su ancho — la locución se LEE en la onda
    const oraciones = audio.transcripcion?.oraciones ?? [];
    if (oraciones.length > 0) {
      ctx.font = "8px ui-sans-serif, system-ui, sans-serif";
      for (const oracion of oraciones) {
        const x0 = (oracion.desdeMs / total) * ancho;
        const x1 = (oracion.hastaMs / total) * ancho;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, ALTO - 12, Math.max(8, x1 - x0) - 2, 12);
        ctx.clip();
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = tinta;
        ctx.fillText(oracion.texto, x0 + 2, ALTO - 3);
        ctx.restore();
        // tick del arranque de la oración
        ctx.globalAlpha = 0.4;
        ctx.fillRect(x0, ALTO - 12, 1, 12);
        ctx.globalAlpha = 1;
      }
    }

    // playhead global
    const xPlay = (Math.min(globalPlayhead, total) / total) * ancho;
    ctx.strokeStyle = acento;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xPlay, 0);
    ctx.lineTo(xPlay, ALTO);
    ctx.stroke();
  }, [audio, cortes, total, globalPlayhead, arrastre]);

  const globalDeEvento = useCallback(
    (e: { clientX: number }) => {
      const marco = marcoRef.current;
      if (!marco) return 0;
      const caja = marco.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
      return f * total;
    },
    [total],
  );

  const alBajar = useCallback(
    (e: React.PointerEvent) => {
      const marco = marcoRef.current;
      if (!marco) return;
      const caja = marco.getBoundingClientRect();
      // ¿agarró un corte? (el del final del proyecto no se arrastra si es el
      // último Y el audio no llega más lejos — igual se permite: alarga)
      const porPx = caja.width / total;
      let indice = -1;
      for (let i = 0; i < cortes.length; i++) {
        const x = (cortes[i].desdeMs + cortes[i].duracionMs) * porPx;
        if (Math.abs(e.clientX - caja.left - x) <= UMBRAL_CORTE_PX) {
          indice = i;
          break;
        }
      }
      if (indice >= 0) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setArrastre({ indice, globalMs: cortes[indice].desdeMs + cortes[indice].duracionMs });
        return;
      }
      onSaltar(globalDeEvento(e));
    },
    [cortes, total, globalDeEvento, onSaltar],
  );

  const alMover = useCallback(
    (e: React.PointerEvent) => {
      const vivo = arrastreRef.current;
      if (!vivo) return;
      const corte = cortes[vivo.indice];
      // el corte no puede cruzar el inicio de su escena (mínimo 500ms)
      const minimo = corte.desdeMs + 500;
      setArrastre({ indice: vivo.indice, globalMs: Math.max(minimo, globalDeEvento(e)) });
    },
    [cortes, globalDeEvento],
  );

  const alSoltar = useCallback(() => {
    const vivo = arrastreRef.current;
    if (!vivo) return;
    const corte = cortes[vivo.indice];
    setArrastre(null);
    onCortar(corte.id, Math.round(vivo.globalMs - corte.desdeMs));
  }, [cortes, onCortar]);

  return (
    <div className="flex items-center gap-2 border-b border-(--panel-border) bg-(--panel-bg) px-3 py-1">
      <div
        ref={marcoRef}
        role="slider"
        aria-label={t("Audio del proyecto: {nombre}", { nombre: audio.nombre })}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.round(globalPlayhead)}
        className="relative min-w-0 flex-1 cursor-crosshair select-none touch-none"
        style={{ height: ALTO }}
        onPointerDown={alBajar}
        onPointerMove={alMover}
        onPointerUp={alSoltar}
        onPointerCancel={() => setArrastre(null)}
      >
        <canvas ref={lienzoRef} className="absolute inset-0 h-full w-full" />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="max-w-40 truncate text-[10px] text-foreground/60" title={audio.nombre}>
          ♪ {audio.nombre}
        </span>
        {onRecortarAudio && (
          <button
            type="button"
            onClick={onRecortarAudio}
            title={t("Elegir otro segmento del archivo (el proyecto usa solo ese pedazo)")}
            className="flex h-5 items-center rounded-control px-1.5 text-[10px] text-foreground/50 hover:bg-ink/[0.06] hover:text-foreground"
          >
            {t("Recortar")}
          </button>
        )}
        {onTranscribir && !audio.transcripcion && (
          <button
            type="button"
            onClick={onTranscribir}
            disabled={transcribiendo !== null}
            title={t("Whisper local: las oraciones con sus tiempos quedan sobre la onda — nada sale de tu máquina")}
            className="flex h-5 items-center rounded-control px-1.5 text-[10px] text-acento hover:bg-acento/10 disabled:opacity-60"
          >
            {transcribiendo ?? t("Transcribir")}
          </button>
        )}
        <button
          type="button"
          onClick={onQuitar}
          className="flex h-5 items-center gap-1 rounded-control px-1.5 text-[10px] text-foreground/50 hover:bg-ink/[0.06] hover:text-peligro"
          aria-label={t("Quitar el audio del proyecto")}
        >
          <Icono nombre="cerrar" width={9} height={9} />
          {t("Quitar")}
        </button>
      </div>
    </div>
  );
}
