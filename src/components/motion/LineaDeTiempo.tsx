"use client";

/* -----------------------------------------------------------------------------
   Línea de tiempo — transport, scrub, y edición por drag

   Redimensionable: una agarradera superior (drag vertical) cambia el alto
   del panel, para trabajar con la timeline grande. Los spans de
   entrada/salida y los keyframes se ARRASTRAN para retimear: el gesto
   registra UN checkpoint de undo al cruzar el umbral de 3px (kit §8.3) y
   snapea al frame (1000/fps). El scrub no usa <input type="range"> (§7):
   es una barra propia con pointer events. Playhead y selección en el azul
   de marca; tiempos en font-mono tabular-nums.
----------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";
import type { CanalCamara, Composicion, NombrePropiedad, Segmento } from "@/lib/motion/modelo";
import { CAMARA_ID } from "@/lib/motion/herramientas-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { ConPista } from "@/components/ui/ConPista";

const UMBRAL_DRAG = 3;

function Timecode({ ms, fps }: { ms: number; fps: number }) {
  const s = Math.floor(ms / 1000);
  const frame = Math.floor(((ms % 1000) / 1000) * fps);
  const texto = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(frame).padStart(2, "0")}`;
  return <span className="font-mono text-xs tabular-nums text-muted">{texto}</span>;
}

type GestoSpan = {
  tipo: "span";
  capaId: string;
  clave: "entrada" | "salida";
  enOriginal: number;
  x0: number;
  activo: boolean;
};
type GestoKeyframe = {
  tipo: "keyframe";
  capaId: string;
  propiedad: NombrePropiedad;
  /** t donde arrancó el gesto — el delta SIEMPRE se mide contra éste */
  tOriginal: number;
  /** t donde está el keyframe ahora (la identidad del keyframe en la pista) */
  tActual: number;
  x0: number;
  activo: boolean;
};
type GestoKeyframeCamara = {
  tipo: "kfCamara";
  canal: CanalCamara;
  tOriginal: number;
  tActual: number;
  x0: number;
  activo: boolean;
};

export function LineaDeTiempo({
  composicion,
  tiempo,
  reproduciendo,
  seleccionId,
  alto,
  onAlto,
  onScrub,
  onTogglePlay,
  onSaltarFrame,
  onSeleccionar,
  onCheckpoint,
  onRetimarSegmento,
  onMoverKeyframe,
  onMoverKeyframeCamara,
}: {
  composicion: Composicion;
  tiempo: number;
  reproduciendo: boolean;
  seleccionId: string | null;
  alto: number;
  onAlto: (px: number) => void;
  onScrub: (t: number) => void;
  onTogglePlay: () => void;
  onSaltarFrame: (dir: 1 | -1) => void;
  onSeleccionar: (id: string) => void;
  onCheckpoint: () => void;
  onRetimarSegmento: (capaId: string, clave: "entrada" | "salida", nuevoEn: number) => void;
  onMoverKeyframe: (capaId: string, propiedad: NombrePropiedad, tActual: number, nuevoT: number) => void;
  onMoverKeyframeCamara: (canal: CanalCamara, tActual: number, nuevoT: number) => void;
}) {
  const pistaRef = useRef<HTMLDivElement>(null);
  const filasRef = useRef<HTMLDivElement>(null);
  const escrubeando = useRef(false);
  const gestoRef = useRef<GestoSpan | GestoKeyframe | GestoKeyframeCamara | null>(null);
  const redimenRef = useRef<{ y0: number; alto0: number } | null>(null);

  // El drag corre con listeners en window (pointerdown en el elemento,
  // move/up en window — §8.3): un keyframe que se remonta al cambiar su t
  // no corta el gesto. La composición vigente se lee de un ref para que el
  // closure del listener no quede viejo.
  const compRef = useRef(composicion);
  useEffect(() => {
    compRef.current = composicion;
  }, [composicion]);

  const cuadro = 1000 / composicion.fps;
  const alFrame = (ms: number) => Math.round(ms / cuadro) * cuadro;
  const pct = (ms: number) => `${(ms / composicion.duracion) * 100}%`;

  const tiempoDeEvento = (clientX: number) => {
    const rect = pistaRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return f * composicion.duracion;
  };

  const msPorPx = () => {
    const rect = filasRef.current?.getBoundingClientRect();
    return rect ? composicion.duracion / rect.width : 1;
  };

  const moverGesto = (clientX: number) => {
    const gesto = gestoRef.current;
    if (!gesto) return;
    const comp = compRef.current;
    const dx = clientX - gesto.x0;
    if (!gesto.activo) {
      if (Math.abs(dx) < UMBRAL_DRAG) return;
      gesto.activo = true;
      onCheckpoint(); // un gesto entero = UN paso de undo
    }
    const dt = dx * msPorPx();
    if (gesto.tipo === "span") {
      const nuevoEn = alFrame(Math.min(comp.duracion, Math.max(0, gesto.enOriginal + dt)));
      onRetimarSegmento(gesto.capaId, gesto.clave, nuevoEn);
    } else if (gesto.tipo === "kfCamara") {
      const pista = comp.camara?.pistas[gesto.canal];
      const nuevoT = alFrame(Math.min(comp.duracion, Math.max(0, gesto.tOriginal + dt)));
      if (nuevoT === gesto.tActual || !pista) return;
      if (pista.some((k) => k.t === nuevoT)) return; // no pisar otro keyframe
      onMoverKeyframeCamara(gesto.canal, gesto.tActual, nuevoT);
      gesto.tActual = nuevoT;
    } else {
      const capa = comp.capas.find((c) => c.id === gesto.capaId);
      const pista = capa?.pistas?.[gesto.propiedad];
      const nuevoT = alFrame(Math.min(comp.duracion, Math.max(0, gesto.tOriginal + dt)));
      if (nuevoT === gesto.tActual || !pista) return;
      if (pista.some((k) => k.t === nuevoT)) return; // no pisar otro keyframe
      onMoverKeyframe(gesto.capaId, gesto.propiedad, gesto.tActual, nuevoT);
      gesto.tActual = nuevoT;
    }
  };

  const iniciarGesto = (gesto: GestoSpan | GestoKeyframe | GestoKeyframeCamara) => {
    gestoRef.current = gesto;
    const alMover = (e: PointerEvent) => moverGesto(e.clientX);
    const alSoltar = () => {
      gestoRef.current = null;
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
  };

  return (
    <div className="flex flex-col border-t border-(--glass-border) bg-(--chrome-bg)" style={{ height: alto }}>
      <div
        role="separator"
        aria-label={t("Cambiar el alto de la línea de tiempo")}
        aria-orientation="horizontal"
        className="group relative h-1.5 shrink-0 cursor-ns-resize"
        onPointerDown={(e) => {
          redimenRef.current = { y0: e.clientY, alto0: alto };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const r = redimenRef.current;
          if (r) onAlto(Math.min(600, Math.max(160, r.alto0 - (e.clientY - r.y0))));
        }}
        onPointerUp={() => (redimenRef.current = null)}
      >
        <div className="absolute inset-x-0 top-0.5 mx-auto h-0.5 w-10 rounded-full bg-foreground/15 transition-colors duration-200 group-hover:bg-acento" />
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
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

      <div className="mx-3 mb-2 flex shrink-0 items-center">
        <div className="w-36 shrink-0" />
        <div
        ref={pistaRef}
        className="relative h-6 min-w-0 flex-1 cursor-ew-resize rounded-control shadow-hueco"
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
          <div key={s} className="absolute top-0 h-2 w-px bg-foreground/20" style={{ left: pct(s * 1000) }} />
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-acento" style={{ left: pct(tiempo) }} />
        </div>
      </div>

      {/* nombres en un gutter propio: un span nunca puede pisar el nombre */}
      <div className="mx-3 mb-3 flex min-h-0 flex-1 overflow-y-auto">
        <div className="w-36 shrink-0 pr-2">
          {composicion.capas.map((capa) => {
            const activa = seleccionId === capa.id;
            return (
              <button
                key={capa.id}
                type="button"
                onClick={() => onSeleccionar(capa.id)}
                className={[
                  "relative mb-1 flex h-9 w-full items-center rounded-control pl-2.5 text-left",
                  activa ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
                ].join(" ")}
              >
                <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", activa ? "bg-acento" : "bg-transparent"].join(" ")} />
                <span className="min-w-0 truncate text-xs text-foreground/70">{capa.nombre}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onSeleccionar(CAMARA_ID)}
            className={[
              "relative mb-1 flex h-9 w-full items-center gap-1.5 rounded-control pl-2.5 text-left",
              seleccionId === CAMARA_ID ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
            ].join(" ")}
          >
            <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", seleccionId === CAMARA_ID ? "bg-acento" : "bg-transparent"].join(" ")} />
            <Icono nombre="camara" width={12} height={12} className="shrink-0 text-foreground/45" />
            <span className="min-w-0 truncate text-xs text-foreground/70">{t("Cámara")}</span>
          </button>
        </div>
        <div ref={filasRef} className="relative min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-acento/60" style={{ left: pct(tiempo) }} />
        {composicion.capas.map((capa) => {
          const activa = seleccionId === capa.id;
          const spans: { clave: "entrada" | "salida"; seg: Segmento }[] = [];
          if (capa.entrada) spans.push({ clave: "entrada", seg: capa.entrada });
          if (capa.salida) spans.push({ clave: "salida", seg: capa.salida });
          return (
            <div
              key={capa.id}
              onPointerDown={() => onSeleccionar(capa.id)}
              className={[
                "relative mb-1 h-9 rounded-control",
                activa ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]",
              ].join(" ")}
            >
              {spans.map(({ clave, seg }) => (
                <div
                  key={clave}
                  role="button"
                  tabIndex={0}
                  aria-label={t("Mover {clave} de «{nombre}»", { clave: clave === "entrada" ? t("la entrada") : t("la salida"), nombre: capa.nombre })}
                  onKeyDown={(e) => {
                    const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
                    if (!dir) return;
                    e.preventDefault();
                    onCheckpoint();
                    onRetimarSegmento(capa.id, clave, alFrame(Math.min(composicion.duracion, Math.max(0, seg.en + dir * cuadro))));
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    onSeleccionar(capa.id);
                    iniciarGesto({ tipo: "span", capaId: capa.id, clave, enOriginal: seg.en, x0: e.clientX, activo: false });
                  }}
                  className={[
                    "absolute top-1.5 bottom-1.5 cursor-grab rounded-full active:cursor-grabbing",
                    activa ? "bg-ink/[0.16] hover:bg-ink/[0.22]" : "bg-ink/[0.10] hover:bg-ink/[0.16]",
                  ].join(" ")}
                  style={{ left: pct(seg.en), width: pct(seg.duracion) }}
                />
              ))}
              {(Object.entries(capa.pistas ?? {}) as [NombrePropiedad, { t: number }[] | undefined][]).flatMap(
                ([propiedad, pista]) =>
                  (pista ?? []).map((kf) => (
                    <span
                      key={`${propiedad}-${kf.t}`}
                      role="button"
                      tabIndex={0}
                      aria-label={t("Mover el keyframe de {propiedad} de «{nombre}»", { propiedad, nombre: capa.nombre })}
                      onKeyDown={(e) => {
                        const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
                        if (!dir) return;
                        e.preventDefault();
                        onCheckpoint();
                        onMoverKeyframe(capa.id, propiedad, kf.t, alFrame(Math.min(composicion.duracion, Math.max(0, kf.t + dir * cuadro))));
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSeleccionar(capa.id);
                        iniciarGesto({ tipo: "keyframe", capaId: capa.id, propiedad, tOriginal: kf.t, tActual: kf.t, x0: e.clientX, activo: false });
                      }}
                      className={[
                        "absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] active:cursor-grabbing",
                        activa ? "bg-acento" : "bg-foreground/50 hover:bg-foreground/80",
                      ].join(" ")}
                      style={{ left: pct(kf.t) }}
                    />
                  )),
              )}
            </div>
          );
        })}
        {(() => {
          const activa = seleccionId === CAMARA_ID;
          const pistasCam = composicion.camara?.pistas ?? {};
          return (
            <div
              onPointerDown={() => onSeleccionar(CAMARA_ID)}
              className={[
                "relative mb-1 h-9 rounded-control",
                activa ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]",
              ].join(" ")}
            >
              {(Object.entries(pistasCam) as [CanalCamara, { t: number }[] | undefined][]).flatMap(
                ([canal, pista]) =>
                  (pista ?? []).map((kf) => (
                    <span
                      key={`${canal}-${kf.t}`}
                      role="button"
                      tabIndex={0}
                      aria-label={t("Mover el keyframe de cámara ({canal})", { canal })}
                      onKeyDown={(e) => {
                        const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
                        if (!dir) return;
                        e.preventDefault();
                        onCheckpoint();
                        onMoverKeyframeCamara(canal, kf.t, alFrame(Math.min(composicion.duracion, Math.max(0, kf.t + dir * cuadro))));
                      }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSeleccionar(CAMARA_ID);
                        iniciarGesto({ tipo: "kfCamara", canal, tOriginal: kf.t, tActual: kf.t, x0: e.clientX, activo: false });
                      }}
                      className={[
                        "absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] active:cursor-grabbing",
                        activa ? "bg-acento" : "bg-foreground/50 hover:bg-foreground/80",
                      ].join(" ")}
                      style={{ left: pct(kf.t) }}
                    />
                  )),
              )}
            </div>
          );
        })()}
        </div>
      </div>
    </div>
  );
}
