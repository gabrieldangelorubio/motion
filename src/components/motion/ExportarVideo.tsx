"use client";

/* -----------------------------------------------------------------------------
   Export a MP4 — botón + panel de rango y escenas

   El click abre un panel chico: elegís QUÉ PEDAZO de la escena renderizar
   (Desde/Hasta en segundos, con scrub) o, si el proyecto tiene varias
   escenas, exportarlas TODAS concatenadas con corte duro en un solo MP4.
   El render corre en la misma pestaña (pintar determinista frame a frame);
   mientras exporta, el porcentaje en mono. `entregar` es inyectable: la app
   usa la descarga del browser; la demo publicada inyecta su propio canal.
----------------------------------------------------------------------------- */

import { useEffect, useState } from "react";
import type { Composicion } from "@/lib/motion/modelo";
import type { FuentesDeMedia } from "@/lib/motion/pintar";
import { exportarMp4, descargarBlob, exportSoportado } from "@/lib/motion/exportar";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { ConPista } from "@/components/ui/ConPista";
import { CampoNumero } from "@/components/ui/CampoNumero";

const MUESTRAS_BLUR = 4; // supersampling temporal por defecto (blur real de export)

/** Espera a que la media (data-uris) de las escenas esté decodificada: las
    escenas NO activas llegan frías y sin esto el export pintaría el
    placeholder hasta que cada imagen cargue. */
async function esperarMedia(escenas: Composicion[], media: FuentesDeMedia): Promise<void> {
  const ids = new Set<string>();
  for (const esc of escenas) {
    for (const capa of esc.capas) {
      if (capa.tipo === "media" && capa.mediaId.startsWith("data:")) ids.add(capa.mediaId);
    }
  }
  const limite = Date.now() + 8000;
  for (const id of ids) {
    while (Date.now() < limite && !media.imagenDe?.(id)) {
      await new Promise((r) => setTimeout(r, 60));
    }
  }
}

export function ExportarVideo({
  obtenerComposicion,
  obtenerMedia,
  onPausar,
  entregar = descargarBlob,
  contarEscenas,
  obtenerEscenas,
}: {
  obtenerComposicion: () => Composicion;
  obtenerMedia?: () => FuentesDeMedia;
  /** el export necesita el reloj del preview quieto */
  onPausar: () => void;
  entregar?: (blob: Blob, nombre: string) => void | Promise<void>;
  /** cuántas escenas tiene el proyecto (para ofrecer el export concatenado) */
  contarEscenas?: () => number;
  /** todas las escenas del proyecto, en orden (la activa incluida, fresca) */
  obtenerEscenas?: () => Promise<Composicion[]>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [desdeS, setDesdeS] = useState(0);
  const [hastaS, setHastaS] = useState(0);
  const [todas, setTodas] = useState(false);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // La capacidad se chequea en el cliente (en SSR no hay VideoEncoder y el
  // botón nacería deshabilitado con hidratación desparejada). El setState
  // va en un microtask para no disparar un render en cascada del effect.
  const [soportado, setSoportado] = useState(true);
  useEffect(() => {
    let vivo = true;
    queueMicrotask(() => {
      if (vivo) setSoportado(exportSoportado());
    });
    return () => {
      vivo = false;
    };
  }, []);

  const escenasTotales = contarEscenas?.() ?? 1;
  const duracionS = obtenerComposicion().duracion / 1000;

  const abrir = () => {
    if (progreso !== null) return;
    setError(null);
    setDesdeS(0);
    setHastaS(Math.round((obtenerComposicion().duracion / 1000) * 100) / 100);
    setTodas(false);
    setAbierto((a) => !a);
  };

  const exportar = async () => {
    if (progreso !== null) return;
    setError(null);
    onPausar();
    setProgreso(0);
    try {
      const media = obtenerMedia?.() ?? {};
      const activa = obtenerComposicion();
      const escenas = todas && obtenerEscenas ? await obtenerEscenas() : [activa];
      await esperarMedia(escenas, media);
      const blob = await exportarMp4(escenas.length > 1 ? escenas : escenas[0], media, {
        muestrasBlur: MUESTRAS_BLUR,
        desdeMs: escenas.length > 1 ? undefined : desdeS * 1000,
        hastaMs: escenas.length > 1 ? undefined : hastaS * 1000,
        onProgreso: (frame, total) => setProgreso(Math.round((frame / total) * 100)),
      });
      await entregar(blob, `${activa.nombre.replace(/\s+/g, "-")}.mp4`);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("El export falló"));
    } finally {
      setProgreso(null);
    }
  };

  return (
    <div className="relative flex flex-col items-end gap-1.5">
      <ConPista pista={progreso === null ? t("Exportar MP4") : t("Exportando…")}>
        <BotonIcono
          tam={32}
          etiqueta={t("Exportar MP4")}
          activo={abierto}
          onClick={abrir}
          deshabilitado={progreso !== null || !soportado}
        >
          <Icono nombre="descargar" width={15} height={15} />
        </BotonIcono>
      </ConPista>

      {abierto && progreso === null && (
        <div className="absolute right-0 top-10 z-30 w-64 rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-3 shadow-(--menu-shadow)">
          <div className="mb-2 text-[13px] font-semibold text-foreground">{t("Exportar MP4")}</div>
          {!todas && (
            <div className="grid grid-cols-2 gap-2">
              <CampoNumero
                etiqueta={t("Desde")}
                valor={desdeS}
                min={0}
                max={duracionS}
                paso={0.1}
                sufijo="s"
                onCambio={(v) => setDesdeS(Math.min(v, hastaS - 0.1))}
              />
              <CampoNumero
                etiqueta={t("Hasta")}
                valor={hastaS}
                min={0}
                max={duracionS}
                paso={0.1}
                sufijo="s"
                onCambio={(v) => setHastaS(Math.max(v, desdeS + 0.1))}
              />
            </div>
          )}
          {escenasTotales > 1 && (
            <button
              type="button"
              onClick={() => setTodas((v) => !v)}
              aria-pressed={todas}
              className={[
                "mt-2 flex h-8 w-full items-center justify-center rounded-control px-2 text-[12px] shadow-control",
                todas ? "bg-acento/15 text-acento" : "hover:bg-ink/[0.06] text-foreground/80",
              ].join(" ")}
            >
              {t.plural(escenasTotales, "Todas las escenas ({n}) concatenadas", "Todas las escenas ({n}) concatenadas")}
            </button>
          )}
          <button
            type="button"
            onClick={() => void exportar()}
            className="boton mt-2 h-9 w-full rounded-control bg-acento px-3 text-sm font-semibold text-white hover:bg-acento/85"
          >
            {t("Exportar")}
          </button>
        </div>
      )}

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
