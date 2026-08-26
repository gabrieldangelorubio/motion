"use client";

/* -----------------------------------------------------------------------------
   Inspector de la cámara — el render es lo que ella ve

   Muestra el encuadre RESUELTO en el tiempo actual (base + pistas). Editar
   un campo hace auto-key: si el canal ya tiene keyframes, el cambio crea o
   pisa el keyframe en el tiempo actual; si no, edita la base (mover la
   cámara sin keyframes no arranca una animación sola). «Keyframe acá»
   congela los tres canales en el playhead; «Tomar la vista» copia el
   encuadre actual del viewport del editor.
----------------------------------------------------------------------------- */

import type { CanalCamara, Composicion } from "@/lib/motion/modelo";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { CampoNumero } from "@/components/ui/CampoNumero";

export function InspectorCamara({
  composicion,
  tiempo,
  onFijar,
  onKeyframe,
  onTomarVista,
  onQuitar,
  onCheckpoint,
}: {
  composicion: Composicion;
  tiempo: number;
  onFijar: (canal: CanalCamara, v: number) => void;
  onKeyframe: () => void;
  onTomarVista: () => void;
  onQuitar: () => void;
  onCheckpoint: () => void;
}) {
  const vista = estadoEn(composicion, tiempo).camara;
  const pistas = composicion.camara?.pistas ?? {};
  const conKeyframes = (["x", "y", "zoom"] as const).filter((c) => pistas[c]?.length);
  const total = conKeyframes.reduce((n, c) => n + (pistas[c]?.length ?? 0), 0);

  return (
    <aside className="flex h-full flex-col overflow-y-auto border-l border-(--glass-border) bg-(--chrome-bg)">
      <div className="px-3 pt-3 pb-2">
        <Etiqueta>{t("Capa")}</Etiqueta>
        <div className="mt-0.5 text-[14px] font-medium text-foreground">{t("Cámara")}</div>
        <div className="mt-1 text-xs text-muted">
          {t("El render es lo que ve la cámara. Con la cámara seleccionada, arrastrá el encuadre en el lienzo.")}
        </div>
      </div>

      <section className="border-t border-(--glass-border) px-3 py-3">
        <Etiqueta className="mb-2">{t("Encuadre")}</Etiqueta>
        <div className="grid grid-cols-2 gap-2">
          <CampoNumero
            etiqueta="X"
            valor={Math.round(vista.x)}
            paso={20}
            sufijo="px"
            onInicio={onCheckpoint}
            onCambio={(x) => onFijar("x", x)}
          />
          <CampoNumero
            etiqueta="Y"
            valor={Math.round(vista.y)}
            paso={20}
            sufijo="px"
            onInicio={onCheckpoint}
            onCambio={(y) => onFijar("y", y)}
          />
          <CampoNumero
            etiqueta={t("Zoom")}
            valor={Math.round(vista.zoom * 100)}
            min={10}
            max={1000}
            paso={5}
            sufijo="%"
            onInicio={onCheckpoint}
            onCambio={(v) => onFijar("zoom", v / 100)}
          />
        </div>
        {conKeyframes.length > 0 && (
          <div className="mt-2 text-xs text-muted">
            {t("Los cambios crean keyframes en el tiempo actual ({canales} con keyframes)", {
              canales: conKeyframes.join(", "),
            })}
          </div>
        )}
      </section>

      <section className="border-t border-(--glass-border) px-3 py-3">
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeyframe}
            className="boton inline-flex h-9 items-center justify-center rounded-control px-3 text-[13px] shadow-control hover:bg-ink/[0.06]"
          >
            {t("Keyframe acá (los 3 canales)")}
          </button>
          <button
            type="button"
            onClick={onTomarVista}
            className="boton inline-flex h-9 items-center justify-center rounded-control px-3 text-[13px] shadow-control hover:bg-ink/[0.06]"
          >
            {t("Tomar la vista actual del lienzo")}
          </button>
          {composicion.camara && (
            <button
              type="button"
              onClick={onQuitar}
              className="boton inline-flex h-9 items-center justify-center rounded-control px-3 text-[13px] shadow-control hover:bg-peligro/10 hover:text-peligro"
            >
              {total > 0
                ? t.plural(total, "Quitar la cámara ({n} keyframe)", "Quitar la cámara ({n} keyframes)")
                : t("Quitar la cámara")}
            </button>
          )}
        </div>
      </section>
    </aside>
  );
}
