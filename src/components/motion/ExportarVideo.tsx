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
import { exportarMp4, exportarPngSecuencia, exportarPngPorPantalla, descargarBlob, exportSoportado, type AudioExport } from "@/lib/motion/exportar";
import { esPlaca } from "@/lib/motion/estilo-puro";
import {
  generarProyectoAE,
  extensionDeFuente,
  archivoDeFamilia,
  leemeDeFuentes,
} from "@/lib/motion/exportar-ae-puro";
import { crearZip, type EntradaZip } from "@/lib/motion/zip-puro";
import { familiasDeComposicion } from "@/lib/motion/fuentes-puro";
import { registrosDeFuentes } from "@/lib/motion/fuentes-guardadas";

function bytesDeBase64(base64: string): Uint8Array {
  const crudo = atob(base64);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}
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
  obtenerAudioExport,
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
  /** la voz en off del proyecto para muxear: recibe si el export es de
      todas las escenas y desde qué ms local arranca (rango de una escena) */
  obtenerAudioExport?: (todas: boolean, desdeMs: number) => Promise<AudioExport | null>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [desdeS, setDesdeS] = useState(0);
  const [hastaS, setHastaS] = useState(0);
  const [todas, setTodas] = useState(false);
  // AE en modo «solo diseño»: capas en su estado base, sin keyframes/cámara
  const [soloDiseno, setSoloDiseno] = useState(false);
  // export por pantalla: ¿el PNG lleva el fondo de la placa o sale con alfa?
  const [conPlaca, setConPlaca] = useState(false);
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
  const pantallas = obtenerComposicion().capas.filter(esPlaca).length;

  const abrir = () => {
    if (progreso !== null) return;
    setError(null);
    setDesdeS(0);
    setHastaS(Math.round((obtenerComposicion().duracion / 1000) * 100) / 100);
    setTodas(false);
    setSoloDiseno(false);
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
      const audio =
        (await obtenerAudioExport?.(escenas.length > 1, escenas.length > 1 ? 0 : desdeS * 1000)) ??
        undefined;
      const blob = await exportarMp4(escenas.length > 1 ? escenas : escenas[0], media, {
        muestrasBlur: MUESTRAS_BLUR,
        desdeMs: escenas.length > 1 ? undefined : desdeS * 1000,
        hastaMs: escenas.length > 1 ? undefined : hastaS * 1000,
        audio,
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

  // Secuencia PNG con ALFA en un zip: las gráficas solas sobre fondo
  // transparente, para montar encima del video real en AE/Premiere. Respeta
  // Desde/Hasta y el toggle «todas».
  const exportarPngs = async () => {
    if (progreso !== null) return;
    setError(null);
    onPausar();
    setProgreso(0);
    try {
      const media = obtenerMedia?.() ?? {};
      const activa = obtenerComposicion();
      const escenas = todas && obtenerEscenas ? await obtenerEscenas() : [activa];
      await esperarMedia(escenas, media);
      const blob = await exportarPngSecuencia(escenas.length > 1 ? escenas : escenas[0], media, {
        desdeMs: escenas.length > 1 ? undefined : desdeS * 1000,
        hastaMs: escenas.length > 1 ? undefined : hastaS * 1000,
        onProgreso: (frame, total) => setProgreso(Math.round((frame / total) * 100)),
      });
      await entregar(blob, `${activa.nombre.replace(/\s+/g, "-")}-png.zip`);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("El export falló"));
    } finally {
      setProgreso(null);
    }
  };

  // Secuencia PNG POR PANTALLA (fork GSAP, tanda G5): cada placa en su
  // carpeta, en su formato, sin cámara y con alfa — para ensamblar en AE.
  // Respeta Desde/Hasta; es de la escena activa (las pantallas viven en su
  // lienzo).
  const exportarPngsPorPantalla = async () => {
    if (progreso !== null) return;
    setError(null);
    onPausar();
    setProgreso(0);
    try {
      const media = obtenerMedia?.() ?? {};
      const activa = obtenerComposicion();
      await esperarMedia([activa], media);
      const blob = await exportarPngPorPantalla(activa, media, {
        desdeMs: desdeS * 1000,
        hastaMs: hastaS * 1000,
        conPlaca,
        onProgreso: (frame, total) => setProgreso(Math.round((frame / total) * 100)),
      });
      await entregar(blob, `${activa.nombre.replace(/\s+/g, "-")}-pantallas.zip`);
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("El export falló"));
    } finally {
      setProgreso(null);
    }
  };

  // Export a After Effects: script .jsx + los ASSETS que importa, en un
  // solo zip (descomprimís y corrés el .jsx: AE trae todo solo). Sin capas
  // media baja el .jsx pelado. Respeta el toggle «todas».
  const exportarAE = async () => {
    setError(null);
    try {
      const activa = obtenerComposicion();
      const escenas = todas && obtenerEscenas ? await obtenerEscenas() : [activa];
      const base = activa.nombre.replace(/\s+/g, "-");
      const { jsx, assets } = generarProyectoAE(escenas, activa.nombre, { sinAnimacion: soloDiseno });

      // ——— fuentes/: las TIPOGRAFÍAS del proyecto viajan también — las
      // subidas como archivo van con sus bytes (instalar con doble click);
      // las de Google y las del sistema quedan listadas en el LEEME.
      const familias = [
        ...new Set(escenas.flatMap((esc) => familiasDeComposicion(esc).map((f) => f.familia))),
      ];
      const fuentes: EntradaZip[] = [];
      if (familias.length) {
        const registros = await registrosDeFuentes();
        const incluidas: { familia: string; archivo: string }[] = [];
        const deGoogle: string[] = [];
        const restantes: string[] = [];
        for (const familia of familias) {
          const registro = registros.find((r) => r.familia === familia);
          if (registro?.origen === "archivo") {
            const bytes = new Uint8Array(registro.datos);
            const ruta = archivoDeFamilia(familia, extensionDeFuente(bytes));
            incluidas.push({ familia, archivo: ruta });
            fuentes.push({ nombre: ruta, datos: bytes });
          } else if (registro?.origen === "google") {
            deGoogle.push(familia);
          } else {
            restantes.push(familia);
          }
        }
        fuentes.push({
          nombre: "fuentes/LEEME.txt",
          datos: new TextEncoder().encode(leemeDeFuentes(incluidas, deGoogle, restantes)),
        });
      }

      if (assets.length === 0 && fuentes.length === 0) {
        await entregar(new Blob([jsx], { type: "text/javascript" }), `${base}.jsx`);
      } else {
        const entradas: EntradaZip[] = [
          { nombre: `${base}.jsx`, datos: new TextEncoder().encode(jsx) },
          ...assets.map((a) => ({ nombre: a.ruta, datos: bytesDeBase64(a.base64) })),
          ...fuentes,
        ];
        await entregar(new Blob([crearZip(entradas) as BlobPart], { type: "application/zip" }), `${base}-ae.zip`);
      }
      setAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("El export a AE falló"));
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
          <button
            type="button"
            onClick={() => void exportarPngs()}
            title={t("Las gráficas solas sobre fondo transparente, frame a frame en un zip — para montar encima del video")}
            className="mt-1.5 flex h-8 w-full items-center justify-center rounded-control px-2 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
          >
            {t("Secuencia PNG (alfa)")}
          </button>
          {pantallas > 0 && (
            <>
              <button
                type="button"
                onClick={() => void exportarPngsPorPantalla()}
                title={t("Una secuencia PNG por pantalla, cada una en su formato y sin la cámara — para ensamblar las pantallas en AE (pantallas.json trae la cámara maestra)")}
                className="mt-1.5 flex h-8 w-full items-center justify-center rounded-control px-2 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
              >
                {t("PNG por pantalla ({n}, alfa)", { n: pantallas })}
              </button>
              <label className="mt-1 flex cursor-pointer items-center gap-2 px-1 text-[11px] text-foreground/70">
                <input
                  type="checkbox"
                  checked={conPlaca}
                  onChange={(e) => setConPlaca(e.target.checked)}
                  className="size-3.5 accent-(--acento)"
                />
                {t("Con el fondo de cada placa (sin alfa)")}
              </label>
            </>
          )}
          {/* opción del export a AE: checkbox EXPLÍCITO (no baja nada solo —
              elige qué lleva el .jsx del botón de abajo) */}
          <label className="mt-2 flex cursor-pointer items-center gap-2 px-1 text-[11px] text-foreground/70">
            <input
              type="checkbox"
              checked={soloDiseno}
              onChange={(e) => setSoloDiseno(e.target.checked)}
              className="size-3.5 accent-(--acento)"
            />
            {t("Solo el diseño, sin animación (para animar de cero en AE)")}
          </label>
          <button
            type="button"
            onClick={() => void exportarAE()}
            title={t("Genera un script que reconstruye la comp en After Effects con capas editables")}
            className="mt-1 flex h-8 w-full items-center justify-center rounded-control px-2 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
          >
            {t("After Effects (.jsx)")}
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
