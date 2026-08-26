"use client";

/* -----------------------------------------------------------------------------
   Línea de tiempo — transport, scrub y filas de capas

   El scrub NO usa <input type="range"> (kit §7: los controles nativos viven
   sólo dentro de ui/): es una barra propia con pointer events, que es lo que
   un editor necesita igual (playhead, spans, keyframes). El playhead es una
   línea en el azul de marca (§3.1); los tiempos van en font-mono
   tabular-nums (§3.3). El escalado horizontal es px = t / duracion × ancho.
----------------------------------------------------------------------------- */

import { useRef } from "react";
import type { Composicion } from "@/lib/motion/modelo";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { ConPista } from "@/components/ui/ConPista";

function Timecode({ ms, fps }: { ms: number; fps: number }) {
  const s = Math.floor(ms / 1000);
  const frame = Math.floor(((ms % 1000) / 1000) * fps);
  const texto = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
  return <span className="font-mono text-xs tabular-nums text-muted">{texto}</span>;
}

export function LineaDeTiempo({
  composicion,
  tiempo,
  reproduciendo,
  seleccionId,
  onScrub,
  onTogglePlay,
  onSaltarFrame,
  onSeleccionar,
}: {
  composicion: Composicion;
  tiempo: number;
  reproduciendo: boolean;
  seleccionId: string | null;
  onScrub: (t: number) => void;
  onTogglePlay: () => void;
  onSaltarFrame: (dir: 1 | -1) => void;
  onSeleccionar: (id: string) => void;
}) {
  const pistaRef = useRef<HTMLDivElement>(null);
  const escrubeando = useRef(false);

  const tiempoDeEvento = (clientX: number) => {
    const rect = pistaRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return f * composicion.duracion;
  };

  const pct = (ms: number) => `${(ms / composicion.duracion) * 100}%`;

  return (
    <div className="border-t border-(--glass-border) bg-(--chrome-bg)">
      <div className="flex items-center gap-2 px-3 py-2">
        <ConPista pista={t("Un cuadro atrás")}>
          <BotonIcono tam={28} etiqueta={t("Un cuadro atrás")} onClick={() => onSaltarFrame(-1)}>
            <Icono nombre="cuadroAtras" width={14} height={14} />
          </BotonIcono>
        </ConPista>
        <ConPista pista={reproduciendo ? t("Pausar") : t("Reproducir")}>
          <BotonIcono tam={28} etiqueta={reproduciendo ? t("Pausar") : t("Reproducir")} onClick={onTogglePlay}>
            <Icono nombre={reproduciendo ? "pausa" : "play"} width={14} height={14} />
          </BotonIcono>
        </ConPista>
        <ConPista pista={t("Un cuadro adelante")}>
          <BotonIcono tam={28} etiqueta={t("Un cuadro adelante")} onClick={() => onSaltarFrame(1)}>
            <Icono nombre="cuadroAdelante" width={14} height={14} />
          </BotonIcono>
        </ConPista>
        <div className="ml-2">
          <Timecode ms={tiempo} fps={composicion.fps} />
          <span className="font-mono text-xs tabular-nums text-foreground/30"> / </span>
          <Timecode ms={composicion.duracion} fps={composicion.fps} />
        </div>
      </div>

      <div
        ref={pistaRef}
        className="relative mx-3 mb-2 h-6 cursor-ew-resize rounded-control shadow-hueco"
        role="slider"
        aria-label={t("Posición en la composición")}
        aria-valuemin={0}
        aria-valuemax={composicion.duracion}
        aria-valuenow={Math.round(tiempo)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onSaltarFrame(-1);
          if (e.key === "ArrowRight") onSaltarFrame(1);
        }}
        onPointerDown={(e) => {
          escrubeando.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          onScrub(tiempoDeEvento(e.clientX));
        }}
        onPointerMove={(e) => {
          if (escrubeando.current) onScrub(tiempoDeEvento(e.clientX));
        }}
        onPointerUp={() => (escrubeando.current = false)}
      >
        {Array.from({ length: Math.floor(composicion.duracion / 1000) + 1 }, (_, s) => (
          <div
            key={s}
            className="absolute top-0 h-2 w-px bg-foreground/20"
            style={{ left: pct(s * 1000) }}
          />
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-acento" style={{ left: pct(tiempo) }} />
      </div>

      <div className="max-h-40 overflow-y-auto px-3 pb-3">
        {composicion.capas.map((capa) => (
          <button
            key={capa.id}
            type="button"
            onClick={() => onSeleccionar(capa.id)}
            className={[
              "relative mb-1 block h-7 w-full rounded-control text-left",
              seleccionId === capa.id ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
            ].join(" ")}
          >
            <span
              className={[
                "absolute inset-y-0 left-0 w-0.5 rounded-full",
                seleccionId === capa.id ? "bg-acento" : "bg-transparent",
              ].join(" ")}
            />
            <span className="absolute left-2 top-1/2 z-10 max-w-32 -translate-y-1/2 truncate text-[11px] text-foreground/70">
              {capa.nombre}
            </span>
            {capa.entrada && (
              <span
                className="absolute top-1 bottom-1 rounded-full bg-ink/[0.10]"
                style={{ left: pct(capa.entrada.en), width: pct(capa.entrada.duracion) }}
              />
            )}
            {capa.salida && (
              <span
                className="absolute top-1 bottom-1 rounded-full bg-ink/[0.10]"
                style={{ left: pct(capa.salida.en), width: pct(capa.salida.duracion) }}
              />
            )}
            {Object.values(capa.pistas ?? {}).flatMap((pista) =>
              (pista ?? []).map((kf, i) => (
                <span
                  key={`${kf.t}-${i}`}
                  className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-foreground/50"
                  style={{ left: pct(kf.t) }}
                />
              )),
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
