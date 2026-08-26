"use client";

/* -----------------------------------------------------------------------------
   Panel de tipografías — cargar las familias que la composición necesita

   Regla del research: nunca sustituir en silencio. Cada familia usada se
   lista con su estado real (document.fonts.check); las faltantes ofrecen
   dos caminos: probar Google Fonts (fetch del CSS → FontFace, fallo
   detectable) o subir el archivo (input file escondido detrás de un botón,
   el patrón SelectorComprobante de diosa). Al cargar, el loop del preview
   repinta solo con la fuente real. Los archivos viven en la sesión: la
   persistencia va al catálogo de media en la integración (backlog).
----------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import type { Composicion } from "@/lib/motion/modelo";
import {
  familiasDeComposicion,
  familiaDisponible,
  cargarDeGoogleFonts,
  cargarDeArchivo,
} from "@/lib/motion/fuentes-puro";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";

type EstadoFamilia = "disponible" | "faltante" | "cargando";

export function PanelFuentes({
  abierto,
  onCerrar,
  composicion,
}: {
  abierto: boolean;
  onCerrar: () => void;
  composicion: Composicion;
}) {
  const [estados, setEstados] = useState<Record<string, EstadoFamilia>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const archivoRef = useRef<HTMLInputElement>(null);
  const familiaSubiendoRef = useRef<string | null>(null);

  const familias = familiasDeComposicion(composicion);

  useEffect(() => {
    if (!abierto) return;
    // en microtask: setState sincrónico dentro del effect encadena renders
    let vivo = true;
    queueMicrotask(() => {
      if (!vivo) return;
      const nuevos: Record<string, EstadoFamilia> = {};
      for (const { familia, pesos } of familiasDeComposicion(composicion)) {
        nuevos[familia] = pesos.every((peso) => familiaDisponible(familia, peso)) ? "disponible" : "faltante";
      }
      setEstados(nuevos);
    });
    return () => {
      vivo = false;
    };
  }, [abierto, composicion]);

  if (!abierto) return null;

  const marcar = (familia: string, estado: EstadoFamilia, error?: string) => {
    setEstados((e) => ({ ...e, [familia]: estado }));
    setErrores((e) => ({ ...e, [familia]: error ?? "" }));
  };

  const probarGoogle = async (familia: string, pesos: number[]) => {
    marcar(familia, "cargando");
    const res = await cargarDeGoogleFonts(familia, pesos);
    if (res.ok) marcar(familia, "disponible");
    else marcar(familia, "faltante", res.error);
  };

  const elegirArchivo = (familia: string) => {
    familiaSubiendoRef.current = familia;
    archivoRef.current?.click();
  };

  const alSubirArchivo = async (lista: FileList | null) => {
    const familia = familiaSubiendoRef.current;
    const archivo = lista?.[0];
    if (!familia || !archivo) return;
    marcar(familia, "cargando");
    const res = await cargarDeArchivo(familia, await archivo.arrayBuffer());
    if (res.ok) marcar(familia, "disponible");
    else marcar(familia, "faltante", res.error);
    if (archivoRef.current) archivoRef.current.value = "";
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-(--telon-bg) p-6"
      onKeyDown={(e) => e.key === "Escape" && onCerrar()}
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div className="w-full max-w-lg rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-5 shadow-(--menu-shadow)">
        <div className="mb-1 text-[15px] font-semibold text-foreground">{t("Tipografías de la composición")}</div>
        <p className="mb-3 text-xs text-muted">
          {t("Las faltantes se ven con la fuente del sistema hasta que las cargues. El archivo cargado vive en esta sesión.")}
        </p>

        {familias.length === 0 && <p className="py-2 text-[13px] text-muted">{t("Esta composición no usa tipografías propias")}</p>}

        {familias.map(({ familia, pesos }) => {
          const estado = estados[familia] ?? "faltante";
          return (
            <div key={familia} className="mb-2 rounded-control border border-(--glass-border) px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-foreground">{familia}</div>
                  <Etiqueta>{t("pesos {lista}", { lista: pesos.join(" · ") })}</Etiqueta>
                </div>
                {estado === "disponible" && (
                  <span className="shrink-0 rounded-full bg-acento px-2 py-0.5 text-[11px] font-semibold text-white">
                    {t("cargada")}
                  </span>
                )}
                {estado === "cargando" && (
                  <span className="shrink-0 font-mono text-[11px] text-muted">{t("cargando…")}</span>
                )}
                {estado === "faltante" && (
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() => void probarGoogle(familia, pesos)}
                      className="boton h-8 rounded-control px-2.5 text-xs shadow-control hover:bg-ink/[0.06]"
                    >
                      {t("Google Fonts")}
                    </button>
                    <button
                      type="button"
                      onClick={() => elegirArchivo(familia)}
                      className="boton h-8 rounded-control px-2.5 text-xs shadow-control hover:bg-ink/[0.06]"
                    >
                      {t("Subir archivo")}
                    </button>
                  </div>
                )}
              </div>
              {errores[familia] && <div className="mt-1.5 text-xs text-peligro">{errores[familia]}</div>}
            </div>
          );
        })}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onCerrar}
            className="boton inline-flex h-9 items-center rounded-control px-4 text-[13px] shadow-control hover:bg-ink/[0.06]"
          >
            {t("Listo")}
          </button>
        </div>
      </div>
      {/* input nativo escondido detrás del botón — patrón SelectorComprobante (kit §7) */}
      <input
        ref={archivoRef}
        type="file"
        accept=".otf,.ttf,.woff,.woff2"
        className="hidden"
        onChange={(e) => void alSubirArchivo(e.target.files)}
      />
    </div>
  );
}
