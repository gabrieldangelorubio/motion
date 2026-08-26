"use client";

/* -----------------------------------------------------------------------------
   Botón de export a MP4 con progreso

   El render corre en la misma pestaña (pintar determinista frame a frame);
   mientras exporta, el botón muestra el porcentaje en mono. `entregar` es
   inyectable: la app usa la descarga del browser; la demo web publicada
   inyecta su propio canal (su sandbox bloquea descargas directas).
----------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import type { Composicion } from "@/lib/motion/modelo";
import { exportarMp4, descargarBlob, exportSoportado } from "@/lib/motion/exportar";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { ConPista } from "@/components/ui/ConPista";

const MUESTRAS_BLUR = 4; // supersampling temporal por defecto (blur real de export)

export function ExportarVideo({
  obtenerComposicion,
  onPausar,
  entregar = descargarBlob,
}: {
  obtenerComposicion: () => Composicion;
  /** el export necesita el reloj del preview quieto */
  onPausar: () => void;
  entregar?: (blob: Blob, nombre: string) => void | Promise<void>;
}) {
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // La capacidad se chequea en el cliente (en SSR no hay VideoEncoder y el
  // botón nacería deshabilitado con hidratación desparejada).
  const [soportado, setSoportado] = useState(true);
  useEffect(() => {
    setSoportado(exportSoportado());
  }, []);

  const exportar = async () => {
    if (progreso !== null) return;
    setError(null);
    onPausar();
    setProgreso(0);
    try {
      const comp = obtenerComposicion();
      const blob = await exportarMp4(comp, {}, {
        muestrasBlur: MUESTRAS_BLUR,
        onProgreso: (frame, total) => setProgreso(Math.round((frame / total) * 100)),
      });
      await entregar(blob, `${comp.nombre.replace(/\s+/g, "-")}.mp4`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("El export falló"));
    } finally {
      setProgreso(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <ConPista pista={progreso === null ? t("Exportar MP4") : t("Exportando…")}>
        <BotonIcono
          tam={32}
          etiqueta={t("Exportar MP4")}
          onClick={exportar}
          deshabilitado={progreso !== null || !soportado}
        >
          <Icono nombre="descargar" width={15} height={15} />
        </BotonIcono>
      </ConPista>
      {progreso !== null && (
        <span
          role="status"
          className="rounded-control bg-(--menu-solido-bg) px-2 py-0.5 font-mono text-[11px] tabular-nums text-foreground shadow-(--menu-shadow)"
        >
          {progreso}%
        </span>
      )}
      {error && (
        <span role="alert" className="max-w-56 rounded-control border border-peligro/30 bg-(--menu-solido-bg) px-2 py-1 text-right text-[11px] text-foreground shadow-(--menu-shadow)">
          {error}
        </span>
      )}
    </div>
  );
}
