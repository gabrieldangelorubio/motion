"use client";

/* -----------------------------------------------------------------------------
   Editor — el shell del módulo: lienzo + línea de tiempo + capas

   El reloj es propio (rAF, no setInterval) y el tiempo vive en un REF: un
   frame de reproducción no re-renderiza React (§9); el estado de React se
   entera a ~8 Hz para el timecode y al pausar. Undo por snapshots
   (structuredClone, tope 120): registrar() ANTES de cada mutación; un gesto
   es UN paso. Autosave con debounce + CAS: si el server devuelve una
   composición fusionada (otra pestaña editó), se rebasa el estado local.
   Con la pestaña oculta, el reloj pausa (§10.3).
----------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Capa, Composicion, NombrePropiedad } from "@/lib/motion/modelo";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";
import { editarCapa, moverKeyframe } from "@/lib/motion/herramientas-puro";
import { guardarComposicionAction } from "@/app/(app)/(modulos)/motion/acciones";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { ConPista } from "@/components/ui/ConPista";
import { Lienzo, type ControlLienzo } from "@/components/motion/Lienzo";
import { LineaDeTiempo } from "@/components/motion/LineaDeTiempo";
import { Capas } from "@/components/motion/Capas";
import { Inspector } from "@/components/motion/Inspector";
import { ExportarVideo } from "@/components/motion/ExportarVideo";
import { PanelImportar } from "@/components/motion/PanelImportar";
import { PanelAgente } from "@/components/motion/PanelAgente";
import { PanelFuentes } from "@/components/motion/PanelFuentes";
import { Segmentado } from "@/components/ui/Segmentado";
import { familiasDeComposicion, familiaDisponible } from "@/lib/motion/fuentes-puro";
import { suavizarGrabacion, type MuestraCamara } from "@/lib/motion/suavizar-puro";
import type { ResultadoImport } from "@/lib/motion/figma-puro";
import type { FuentesDeMedia } from "@/lib/motion/pintar";

const TOPE_UNDO = 120;
const DEBOUNCE_GUARDADO = 1500;
const MAX_FALLOS = 5;

function enInput(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
}

export function Editor({
  snapshotInicial,
  composicionId,
  entregarExport,
  conAgente = true,
}: {
  snapshotInicial: string;
  composicionId: string;
  /** canal de entrega del MP4 exportado; default: descarga del browser */
  entregarExport?: (blob: Blob, nombre: string) => void | Promise<void>;
  /** la demo estática no tiene backend: apaga el panel del agente */
  conAgente?: boolean;
}) {
  const [composicion, setComposicion] = useState<Composicion>(() => deserializar(snapshotInicial));
  const [reproduciendo, setReproduciendo] = useState(true);
  const [tiempoUI, setTiempoUI] = useState(0);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  const [altoTimeline, setAltoTimeline] = useState(240);
  const [importarAbierto, setImportarAbierto] = useState(false);
  const [fuentesAbierto, setFuentesAbierto] = useState(false);
  // calidad del preview (Half/Quarter de AE): borrador para armar rápido,
  // nítido para revisar. El export SIEMPRE sale a resolución completa.
  const [calidad, setCalidad] = useState<"baja" | "media" | "alta">("media");
  const calidadRef = useRef(1);
  useEffect(() => {
    calidadRef.current = calidad === "baja" ? 0.5 : calidad === "media" ? 1 : window.devicePixelRatio || 2;
  }, [calidad]);

  const compRef = useRef(composicion);
  const seleccionRef = useRef(seleccionId);
  useEffect(() => {
    compRef.current = composicion;
  }, [composicion]);
  useEffect(() => {
    seleccionRef.current = seleccionId;
  }, [seleccionId]);
  const tiempoRef = useRef(0);
  const lienzoRef = useRef<ControlLienzo>(null);
  // ——— Modo cámara: grabar el gesto del viewport y suavizarlo a keyframes ———
  const [grabandoCamara, setGrabandoCamara] = useState(false);
  const grabandoRef = useRef(false);
  const muestrasRef = useRef<MuestraCamara[]>([]);
  const pasadoRef = useRef<Composicion[]>([]);
  const futuroRef = useRef<Composicion[]>([]);
  const revRef = useRef(composicion.rev ?? 0);
  const fallosRef = useRef(0);
  const timerGuardadoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al terminar la toma (botón o fin de la composición): la grabación cruda
  // pasa por suavizarGrabacion y queda como pistas de cámara editables. El
  // checkpoint de undo se puso al ARRANCAR la toma: grabar es UN paso.
  const detenerGrabacion = useCallback(() => {
    if (!grabandoRef.current) return;
    grabandoRef.current = false;
    setGrabandoCamara(false);
    const camara = suavizarGrabacion(muestrasRef.current) ?? undefined;
    muestrasRef.current = [];
    setComposicion({ ...compRef.current, camara });
    // rebobinar y encuadrar: la toma se revisa de una, desde afuera
    tiempoRef.current = 0;
    setTiempoUI(0);
    setReproduciendo(true);
    requestAnimationFrame(() => lienzoRef.current?.encuadrar());
  }, []);

  // ——— Reloj: un solo rAF que avanza, pinta y avisa a React a baja frecuencia ———
  useEffect(() => {
    let vivo = true;
    let anterior = performance.now();
    let ultimoAvisoUI = 0;
    const paso = (ahora: number) => {
      if (!vivo) return;
      const dt = ahora - anterior;
      anterior = ahora;
      if (reproduciendo && !document.hidden) {
        const previo = tiempoRef.current;
        tiempoRef.current = (tiempoRef.current + dt) % compRef.current.duracion;
        if (grabandoRef.current) {
          if (tiempoRef.current < previo) {
            detenerGrabacion(); // la composición dio la vuelta: la toma terminó
          } else {
            const vista = lienzoRef.current?.vistaActual();
            if (vista) muestrasRef.current.push({ t: tiempoRef.current, ...vista });
          }
        }
      }
      lienzoRef.current?.pintarAhora(tiempoRef.current);
      if (ahora - ultimoAvisoUI > 125) {
        ultimoAvisoUI = ahora;
        setTiempoUI(tiempoRef.current);
      }
      requestAnimationFrame(paso);
    };
    const id = requestAnimationFrame(paso);
    return () => {
      vivo = false;
      cancelAnimationFrame(id);
    };
  }, [reproduciendo, detenerGrabacion]);

  // ——— Undo por snapshots ———
  const registrar = useCallback(() => {
    pasadoRef.current.push(structuredClone(compRef.current));
    if (pasadoRef.current.length > TOPE_UNDO) pasadoRef.current.shift();
    futuroRef.current = [];
  }, []);

  const deshacer = useCallback(() => {
    const previa = pasadoRef.current.pop();
    if (!previa) return;
    futuroRef.current.push(structuredClone(compRef.current));
    setComposicion(previa);
  }, []);

  const rehacer = useCallback(() => {
    const siguiente = futuroRef.current.pop();
    if (!siguiente) return;
    pasadoRef.current.push(structuredClone(compRef.current));
    setComposicion(siguiente);
  }, []);

  // ——— Autosave: debounce + CAS + rebase ante fusión ———
  useEffect(() => {
    if (serializar(composicion) === snapshotInicial) return;
    if (timerGuardadoRef.current) clearTimeout(timerGuardadoRef.current);
    if (fallosRef.current >= MAX_FALLOS) return;
    timerGuardadoRef.current = setTimeout(async () => {
      const res = await guardarComposicionAction(composicionId, serializar(composicion), revRef.current);
      if (!res.ok) {
        fallosRef.current += 1;
        setAvisoGuardado(
          fallosRef.current >= MAX_FALLOS
            ? t("El guardado automático se apagó tras varios fallos: {error}", { error: res.error })
            : res.error,
        );
        return;
      }
      fallosRef.current = 0;
      revRef.current = res.rev;
      if (res.fusionada) {
        setComposicion(deserializar(res.fusionada));
        setAvisoGuardado(t("Otra pestaña editó esta composición: se fusionaron los cambios"));
      } else {
        setAvisoGuardado(null);
      }
    }, DEBOUNCE_GUARDADO);
    return () => {
      if (timerGuardadoRef.current) clearTimeout(timerGuardadoRef.current);
    };
  }, [composicion, composicionId, snapshotInicial]);

  // ——— Mutaciones ———
  // El checkpoint lo pone el CALLER al arrancar el gesto (drag que cruza el
  // umbral, foco de un campo): así un gesto entero es UN paso de undo y las
  // ediciones en vivo no inflan el historial.
  const editarEnVivo = useCallback((capaId: string, cambios: Partial<Capa>) => {
    const res = editarCapa(compRef.current, capaId, cambios);
    if (res.ok) setComposicion(res.valor);
  }, []);

  const retimarSegmento = useCallback((capaId: string, clave: "entrada" | "salida", nuevoEn: number) => {
    const capa = compRef.current.capas.find((c) => c.id === capaId);
    const seg = capa?.[clave];
    if (!seg) return;
    editarEnVivo(capaId, { [clave]: { ...seg, en: nuevoEn } });
  }, [editarEnVivo]);

  const moverKeyframeEnVivo = useCallback(
    (capaId: string, propiedad: NombrePropiedad, tActual: number, nuevoT: number) => {
      const res = moverKeyframe(compRef.current, capaId, propiedad, tActual, nuevoT);
      if (res.ok) setComposicion(res.valor);
    },
    [],
  );

  const alternarVisibilidad = useCallback((capaId: string) => {
    registrar();
    const capa = compRef.current.capas.find((c) => c.id === capaId);
    editarEnVivo(capaId, { oculta: !capa?.oculta });
  }, [registrar, editarEnVivo]);

  const alternarGrabacion = useCallback(() => {
    if (grabandoRef.current) {
      detenerGrabacion();
      return;
    }
    registrar();
    // la cámara previa se saca ANTES de grabar: si no, el usuario encuadraría
    // sobre un lienzo que ya se mueve solo y la toma saldría doble
    setComposicion({ ...compRef.current, camara: undefined });
    muestrasRef.current = [];
    grabandoRef.current = true;
    setGrabandoCamara(true);
    tiempoRef.current = 0;
    setTiempoUI(0);
    setReproduciendo(true);
  }, [registrar, detenerGrabacion]);

  const quitarCamara = useCallback(() => {
    registrar();
    setComposicion({ ...compRef.current, camara: undefined });
  }, [registrar]);

  // ——— Media: resolución de imágenes (data URIs del import de Figma) ———
  // El motor no sabe de red: recibe un resolver. Las imágenes se cargan
  // perezosas la primera vez que pintar() las pide; el loop del preview
  // las pinta apenas terminan de cargar.
  const imagenesRef = useRef(new Map<string, HTMLImageElement | "cargando">());
  const obtenerMedia = useCallback((): FuentesDeMedia => ({
    imagenDe: (mediaId: string) => {
      const conocida = imagenesRef.current.get(mediaId);
      if (conocida === "cargando") return null;
      if (conocida) return conocida;
      if (!mediaId.startsWith("data:")) return null; // ids de catálogo: los resuelve diosa
      imagenesRef.current.set(mediaId, "cargando");
      const imagen = new Image();
      imagen.onload = () => imagenesRef.current.set(mediaId, imagen);
      imagen.src = mediaId;
      return null;
    },
  }), []);

  // El largo real de un path sólo lo sabe el DOM de SVG (getTotalLength):
  // se mide UNA vez al importar y queda guardado en la capa — el motor puro
  // y el export nunca tocan el DOM. Si algo falla, largo 0 = trazo completo.
  const medirTrazos = useCallback((comp: Composicion): Composicion => {
    if (!comp.capas.some((c) => c.tipo === "trazo" && c.largo === 0)) return comp;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";
    document.body.appendChild(svg);
    try {
      const capas = comp.capas.map((c) => {
        if (c.tipo !== "trazo" || c.largo > 0) return c;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", c.path);
        svg.appendChild(path);
        return { ...c, largo: Math.round(path.getTotalLength() * 100) / 100 };
      });
      return { ...comp, capas };
    } catch {
      return comp;
    } finally {
      svg.remove();
    }
  }, []);

  const importarDeFigma = useCallback((resultado: ResultadoImport) => {
    registrar();
    setComposicion(medirTrazos(resultado.composicion));
    setSeleccionId(null);
    tiempoRef.current = 0;
    setTiempoUI(0);
    setAvisoGuardado(
      resultado.avisos.length
        ? t.plural(resultado.avisos.length, "Importado con {n} aviso de conversión", "Importado con {n} avisos de conversión")
        : null,
    );
    requestAnimationFrame(() => lienzoRef.current?.encuadrar());
    // si la pantalla usa tipografías que este browser no tiene, abrir el
    // panel de fuentes de una — nunca sustituir en silencio
    const faltantes = familiasDeComposicion(resultado.composicion).some(({ familia, pesos }) =>
      pesos.some((peso) => !familiaDisponible(familia, peso)),
    );
    if (faltantes) setFuentesAbierto(true);
  }, [registrar, medirTrazos]);

  const familiasFaltantes = familiasDeComposicion(composicion).filter(({ familia, pesos }) =>
    pesos.some((peso) => !familiaDisponible(familia, peso)),
  ).length;

  // ——— Transport ———
  const saltarFrame = useCallback((dir: 1 | -1) => {
    setReproduciendo(false);
    const paso = 1000 / compRef.current.fps;
    tiempoRef.current = Math.min(compRef.current.duracion, Math.max(0, tiempoRef.current + dir * paso));
    setTiempoUI(tiempoRef.current);
  }, []);

  const escrub = useCallback((ms: number) => {
    setReproduciendo(false);
    tiempoRef.current = ms;
    setTiempoUI(ms);
  }, []);

  // ——— Atajos (§8.1): un solo keydown, con el guard de inputs ———
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (enInput()) return;
        e.preventDefault();
        setReproduciendo((r) => !r);
        return;
      }
      if (enInput()) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) rehacer();
        else deshacer();
      } else if (meta && e.key === "0") {
        e.preventDefault();
        lienzoRef.current?.escalaUno();
      } else if (e.shiftKey && e.key === "!") {
        e.preventDefault();
        lienzoRef.current?.encuadrar();
      } else if (e.key === "ArrowLeft") {
        saltarFrame(-1);
      } else if (e.key === "ArrowRight") {
        saltarFrame(1);
      } else if (e.key === "Escape") {
        setSeleccionId(null);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [deshacer, rehacer, saltarFrame]);

  const capaSeleccionada = composicion.capas.find((c) => c.id === seleccionId) ?? null;

  return (
    <div className="grid h-dvh grid-cols-[240px_1fr_300px] overflow-hidden">
      <div className="min-h-0">
        <Capas
          composicion={composicion}
          seleccionId={seleccionId}
          onSeleccionar={setSeleccionId}
          onAlternarVisibilidad={alternarVisibilidad}
        />
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          <Lienzo
            ref={lienzoRef}
            obtenerComposicion={() => compRef.current}
            obtenerSeleccionId={() => seleccionRef.current}
            obtenerMedia={obtenerMedia}
            obtenerCalidad={() => calidadRef.current}
            onSeleccionar={setSeleccionId}
            onCheckpoint={registrar}
            onMoverCapa={(id, x, y) => editarEnVivo(id, { x, y })}
          />
          <div className="absolute left-3 top-3">
            <ConPista pista={t("Calidad del preview — el export siempre sale a resolución completa")}>
              <Segmentado
                etiquetaAria={t("Calidad del preview")}
                valor={calidad}
                onCambio={(v) => setCalidad(v as "baja" | "media" | "alta")}
                opciones={[
                  { valor: "baja", nombre: "½" },
                  { valor: "media", nombre: "1×" },
                  { valor: "alta", nombre: t("Máx") },
                ]}
              />
            </ConPista>
          </div>
          <div className="absolute right-3 top-3 flex items-start gap-2">
            <ConPista pista={t("Importar pantalla de Figma")}>
              <BotonIcono tam={32} etiqueta={t("Importar pantalla de Figma")} onClick={() => setImportarAbierto(true)}>
                <Icono nombre="subir" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <div className="relative">
              <ConPista pista={familiasFaltantes > 0 ? t.plural(familiasFaltantes, "Tipografías ({n} faltante)", "Tipografías ({n} faltantes)") : t("Tipografías")}>
                <BotonIcono tam={32} etiqueta={t("Tipografías")} onClick={() => setFuentesAbierto(true)}>
                  <Icono nombre="tipografia" width={15} height={15} />
                </BotonIcono>
              </ConPista>
              {familiasFaltantes > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-peligro font-mono text-[10px] font-semibold text-white">
                  {familiasFaltantes}
                </span>
              )}
            </div>
            <div className="relative">
              <ConPista
                pista={
                  grabandoCamara
                    ? t("Grabando la cámara: mové y hacé zoom en el lienzo; click para terminar")
                    : t("Grabar movimiento de cámara — reproducí y encuadrá a mano; después se suaviza solo")
                }
              >
                <BotonIcono tam={32} activo={grabandoCamara} etiqueta={t("Grabar movimiento de cámara")} onClick={alternarGrabacion}>
                  <Icono nombre="camara" width={15} height={15} />
                </BotonIcono>
              </ConPista>
              {grabandoCamara && (
                <span className="pointer-events-none absolute -right-1 -top-1 size-2.5 animate-pulse rounded-full bg-peligro" />
              )}
            </div>
            {composicion.camara && !grabandoCamara && (
              <ConPista pista={t("Quitar el movimiento de cámara grabado")}>
                <BotonIcono tam={32} tono="peligro" etiqueta={t("Quitar cámara")} onClick={quitarCamara}>
                  <Icono nombre="ojoTachado" width={15} height={15} />
                </BotonIcono>
              </ConPista>
            )}
            <ConPista pista={t("Encuadrar todo (⇧1)")}>
              <BotonIcono tam={32} etiqueta={t("Encuadrar todo")} onClick={() => lienzoRef.current?.encuadrar()}>
                <Icono nombre="encuadrar" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <ExportarVideo
              obtenerComposicion={() => compRef.current}
              obtenerMedia={obtenerMedia}
              onPausar={() => setReproduciendo(false)}
              entregar={entregarExport}
            />
          </div>
          <PanelImportar
            abierto={importarAbierto}
            onCerrar={() => setImportarAbierto(false)}
            onImportar={importarDeFigma}
          />
          <PanelFuentes
            abierto={fuentesAbierto}
            onCerrar={() => setFuentesAbierto(false)}
            composicion={composicion}
          />
          {conAgente && (
            <PanelAgente
              obtenerSnapshot={() => serializar(compRef.current)}
              composicionId={composicionId}
              onAplicar={(snapshot) => {
                registrar();
                setComposicion(deserializar(snapshot));
              }}
            />
          )}
          {avisoGuardado && (
            <div
              role="status"
              className="absolute left-1/2 top-3 -translate-x-1/2 rounded-control border border-peligro/30 bg-(--menu-solido-bg) px-3 py-1.5 text-xs text-foreground shadow-(--menu-shadow)"
            >
              {avisoGuardado}
            </div>
          )}
        </div>
        <LineaDeTiempo
          composicion={composicion}
          tiempo={tiempoUI}
          reproduciendo={reproduciendo}
          seleccionId={seleccionId}
          alto={altoTimeline}
          onAlto={setAltoTimeline}
          onScrub={escrub}
          onTogglePlay={() => setReproduciendo((r) => !r)}
          onSaltarFrame={saltarFrame}
          onSeleccionar={setSeleccionId}
          onCheckpoint={registrar}
          onRetimarSegmento={retimarSegmento}
          onMoverKeyframe={moverKeyframeEnVivo}
        />
      </div>
      <div className="min-h-0">
        <Inspector
          capa={capaSeleccionada}
          duracionComposicion={composicion.duracion}
          onEditar={editarEnVivo}
          onCheckpoint={registrar}
        />
      </div>
    </div>
  );
}
