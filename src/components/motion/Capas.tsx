"use client";

/* -----------------------------------------------------------------------------
   Panel de capas — nombre, visibilidad y selección

   La visibilidad usa los íconos ojo/ojoTachado del registro; el ítem activo
   se marca con texto en foreground + barra azul (el canon del §3.1: el azul
   es señal, no texto). Lo que se ve sólo al hover se ve siempre con puntero
   grueso (coarse:).
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";
import { CAMARA_ID } from "@/lib/motion/herramientas-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";

const ETIQUETA_TIPO: Record<string, string> = {
  texto: "T",
  forma: "▢",
  media: "▣",
  trazo: "〜",
};

export function Capas({
  composicion,
  seleccionId,
  onSeleccionar,
  onAlternarVisibilidad,
}: {
  composicion: Composicion;
  seleccionId: string | null;
  onSeleccionar: (id: string) => void;
  onAlternarVisibilidad: (id: string) => void;
}) {
  return (
    <aside className="flex h-full flex-col border-r border-(--glass-border) bg-(--chrome-bg)">
      <div className="px-3 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.02em] text-foreground/50">
        {t.plural(composicion.capas.length, "{n} capa", "{n} capas")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {composicion.capas.map((capa) => {
          const activa = seleccionId === capa.id;
          return (
            <div
              key={capa.id}
              className={[
                "group/fila relative mb-0.5 flex h-8 items-center gap-2 rounded-control pl-2.5 pr-1",
                activa ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
              ].join(" ")}
            >
              <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", activa ? "bg-acento" : "bg-transparent"].join(" ")} />
              <span className="w-4 shrink-0 text-center font-mono text-[11px] text-foreground/40" aria-hidden>
                {ETIQUETA_TIPO[capa.tipo] ?? "?"}
              </span>
              <button
                type="button"
                onClick={() => onSeleccionar(capa.id)}
                className={[
                  "min-w-0 flex-1 truncate text-left text-[13px]",
                  activa ? "text-foreground" : "text-foreground/75",
                  capa.oculta ? "opacity-45" : "",
                ].join(" ")}
              >
                {capa.nombre}
              </button>
              {capa.bloqueada && <Icono nombre="candado" width={13} height={13} className="shrink-0 text-foreground/40" />}
              <span className={capa.oculta ? "" : "opacity-0 group-hover/fila:opacity-100 coarse:opacity-100"}>
                <BotonIcono
                  tam={26}
                  etiqueta={capa.oculta ? t("Mostrar «{nombre}»", { nombre: capa.nombre }) : t("Ocultar «{nombre}»", { nombre: capa.nombre })}
                  onClick={() => onAlternarVisibilidad(capa.id)}
                >
                  <Icono nombre={capa.oculta ? "ojoTachado" : "ojo"} width={13} height={13} />
                </BotonIcono>
              </span>
            </div>
          );
        })}
      </div>

      {/* la cámara vive abajo, como otra capa: el render es lo que ella ve */}
      {(() => {
        const activa = seleccionId === CAMARA_ID;
        const kfs = (["x", "y", "zoom"] as const).reduce(
          (n, canal) => n + (composicion.camara?.pistas[canal]?.length ?? 0),
          0,
        );
        return (
          <div className="shrink-0 border-t border-(--glass-border) px-2 py-2">
            <div
              className={[
                "relative flex h-8 items-center gap-2 rounded-control pl-2.5 pr-2",
                activa ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
              ].join(" ")}
            >
              <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", activa ? "bg-acento" : "bg-transparent"].join(" ")} />
              <span className="grid w-4 shrink-0 place-items-center text-foreground/40" aria-hidden>
                <Icono nombre="camara" width={13} height={13} />
              </span>
              <button
                type="button"
                onClick={() => onSeleccionar(CAMARA_ID)}
                className={[
                  "min-w-0 flex-1 truncate text-left text-[13px]",
                  activa ? "text-foreground" : "text-foreground/75",
                ].join(" ")}
              >
                {t("Cámara")}
              </button>
              {kfs > 0 && (
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground/40">
                  {t.plural(kfs, "{n} kf", "{n} kf")}
                </span>
              )}
            </div>
          </div>
        );
      })()}
    </aside>
  );
}
