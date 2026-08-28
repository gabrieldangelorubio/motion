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

import { useEffect, useMemo, useRef, useState } from "react";
import type { CanalCamara, Capa, Composicion, NombrePropiedad, Segmento } from "@/lib/motion/modelo";
import { CAMARA_ID, filasDeCapas, rangoAnimacionCapas } from "@/lib/motion/herramientas-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { ConPista } from "@/components/ui/ConPista";
import { CampoNumero } from "@/components/ui/CampoNumero";

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
  /** mover = deslizar el span entero; izq/der = estirar desde ese borde */
  modo: "mover" | "izq" | "der";
  enOriginal: number;
  duracionOriginal: number;
  x0: number;
  activo: boolean;
};
/** arrastre con varias capas seleccionadas: corre EN BLOQUE toda la
    animación de esas capas (spans + keyframes) — deltas incrementales */
type GestoSpanMulti = {
  tipo: "spanMulti";
  x0: number;
  aplicado: number;
  activo: boolean;
};
/** estirado GRUPAL: el borde del recuadro de la selección escala toda la
    coreografía de esas capas alrededor del borde opuesto (time-stretch) */
type GestoEstirar = {
  tipo: "estirar";
  borde: "izq" | "der";
  desde0: number;
  hasta0: number;
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
  /** Alt/Option al agarrar: el original queda y se arrastra una COPIA */
  duplicar?: boolean;
};
type GestoPoseCamara = {
  tipo: "poseCamara";
  tOriginal: number;
  tActual: number;
  x0: number;
  activo: boolean;
  /** Alt/Option al agarrar: la pose original queda y se arrastra una COPIA */
  duplicar?: boolean;
};

/** Un keyframe seleccionado en la timeline: de una pista de capa, o una POSE
    de cámara (los keyframes de x/y/zoom que caen en el mismo instante). */
export type SeleccionKeyframe =
  | { tipo: "capa"; capaId: string; propiedad: NombrePropiedad; t: number }
  | { tipo: "camara"; t: number };

export function LineaDeTiempo({
  composicion,
  tiempo,
  reproduciendo,
  seleccionId,
  seleccionIds = [],
  onSeleccionarVarias,
  onAlternarSeleccion,
  onDesplazarSeleccion,
  onInicioEstirar,
  onEstirarSeleccion,
  alto,
  onAlto,
  onScrub,
  onDuracion,
  onTogglePlay,
  loop = false,
  onLoop,
  onSaltarFrame,
  onSeleccionar,
  onCheckpoint,
  onRetimarSegmento,
  onMoverKeyframe,
  onDuplicarKeyframe,
  onMoverPoseCamara,
  onDuplicarPoseCamara,
  seleccionKf,
  onSeleccionarKf,
  tiemposDeSnap,
}: {
  composicion: Composicion;
  tiempo: number;
  reproduciendo: boolean;
  seleccionId: string | null;
  /** selección múltiple (la primaria incluida) para resaltar filas */
  seleccionIds?: string[];
  /** marquee sobre las filas: el rectángulo eligió estas capas */
  onSeleccionarVarias?: (ids: string[]) => void;
  /** shift+click en una fila: entra o sale de la selección múltiple */
  onAlternarSeleccion?: (id: string) => void;
  /** corre EN BLOQUE la animación de las capas seleccionadas (delta en ms) */
  onDesplazarSeleccion?: (dt: number) => void;
  /** arranca un time-stretch grupal (el caller congela la base) */
  onInicioEstirar?: () => void;
  /** estira la animación de la selección alrededor de `pivote` por `factor`
      — SIEMPRE contra la base congelada en onInicioEstirar */
  onEstirarSeleccion?: (pivote: number, factor: number) => void;
  alto: number;
  onAlto: (px: number) => void;
  onScrub: (t: number) => void;
  /** cambia la duración TOTAL de la escena (ms) — el campo Dur con scrub */
  onDuracion?: (ms: number) => void;
  onTogglePlay: () => void;
  /** loop del preview (apagado = la escena se para al final) */
  loop?: boolean;
  onLoop?: () => void;
  onSaltarFrame: (dir: 1 | -1) => void;
  onSeleccionar: (id: string) => void;
  onCheckpoint: () => void;
  onRetimarSegmento: (capaId: string, clave: "entrada" | "salida", nuevoEn: number, nuevaDuracion?: number) => void;
  onMoverKeyframe: (capaId: string, propiedad: NombrePropiedad, tActual: number, nuevoT: number) => void;
  /** Alt-drag: nace una copia del keyframe `tFuente` en `nuevoT` (el gesto
      la sigue arrastrando a ella; el original no se toca) */
  onDuplicarKeyframe?: (capaId: string, propiedad: NombrePropiedad, tFuente: number, nuevoT: number) => void;
  onMoverPoseCamara: (tActual: number, nuevoT: number) => void;
  /** Alt-drag sobre una pose de cámara: nace una copia en `nuevoT` */
  onDuplicarPoseCamara?: (tFuente: number, nuevoT: number) => void;
  seleccionKf: SeleccionKeyframe | null;
  onSeleccionarKf: (sel: SeleccionKeyframe | null) => void;
  /** tiempos LOCALES (ms) con imán al arrastrar spans/keyframes — los
      inicios de palabra de la transcripción: la animación cae en la voz */
  tiemposDeSnap?: number[];
}) {
  const pistaRef = useRef<HTMLDivElement>(null);
  const filasRef = useRef<HTMLDivElement>(null);
  const escrubeando = useRef(false);
  const gestoRef = useRef<GestoSpan | GestoSpanMulti | GestoEstirar | GestoKeyframe | GestoPoseCamara | null>(null);
  const redimenRef = useRef<{ y0: number; alto0: number } | null>(null);

  // El drag corre con listeners en window (pointerdown en el elemento,
  // move/up en window — §8.3): un keyframe que se remonta al cambiar su t
  // no corta el gesto. La composición vigente se lee de un ref para que el
  // closure del listener no quede viejo.
  const compRef = useRef(composicion);
  useEffect(() => {
    compRef.current = composicion;
  }, [composicion]);

  // SHIFT durante el scrub = imán a los KEYFRAMES: el playhead se pega al
  // keyframe más cercano (pistas de capas + poses de cámara) — pararse
  // exacto donde está la animación, sin puntería
  const tiemposDeKeyframes = useMemo(() => {
    const ts = new Set<number>();
    for (const capa of composicion.capas) {
      for (const pista of Object.values(capa.pistas ?? {})) {
        for (const k of pista ?? []) ts.add(k.t);
      }
    }
    for (const pista of Object.values(composicion.camara?.pistas ?? {})) {
      for (const k of pista ?? []) ts.add(k.t);
    }
    return [...ts];
  }, [composicion]);
  const imanKfRef = useRef(tiemposDeKeyframes);
  useEffect(() => {
    imanKfRef.current = tiemposDeKeyframes;
  }, [tiemposDeKeyframes]);
  const imanAKeyframe = (ms: number) => {
    const rect = pistaRef.current?.getBoundingClientRect();
    // shift es un pedido EXPLÍCITO de imán: alcance generoso (~25px)
    const iman = (rect ? compRef.current.duracion / rect.width : 1) * 25;
    let mejor = ms;
    let dist = iman;
    for (const t0 of imanKfRef.current) {
      const d = Math.abs(ms - t0);
      if (d < dist) {
        dist = d;
        mejor = t0;
      }
    }
    return mejor;
  };

  // S mantenida = el playhead SIGUE al mouse (scrub sin agarrar la barra):
  // el clientX se mapea por la barra de scrub, desde cualquier lado.
  const sostenidaRef = useRef(false);
  useEffect(() => {
    const enInput = () => {
      const el = document.activeElement;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key !== "s" && e.key !== "S") return;
      if (e.metaKey || e.ctrlKey || e.altKey || enInput()) return;
      sostenidaRef.current = e.type === "keydown";
    };
    const alMover = (e: MouseEvent) => {
      if (!sostenidaRef.current) return;
      const rect = pistaRef.current?.getBoundingClientRect();
      if (!rect) return;
      const f = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const ms = f * compRef.current.duracion;
      onScrub(e.shiftKey ? imanAKeyframe(ms) : ms);
    };
    window.addEventListener("keydown", alTecla);
    window.addEventListener("keyup", alTecla);
    window.addEventListener("mousemove", alMover);
    return () => {
      window.removeEventListener("keydown", alTecla);
      window.removeEventListener("keyup", alTecla);
      window.removeEventListener("mousemove", alMover);
    };
  }, [onScrub]);

  const cuadro = 1000 / composicion.fps;
  const alFrame = (ms: number) => Math.round(ms / cuadro) * cuadro;
  const pct = (ms: number) => `${(ms / composicion.duracion) * 100}%`;

  // snap al frame + IMÁN a los inicios de palabra de la locución (si hay
  // transcripción): dentro de ~8px de una palabra, gana la palabra — así
  // los keyframes caen EXACTO donde la voz dice lo suyo
  const snapear = (ms: number) => {
    const objetivo = alFrame(ms);
    if (!tiemposDeSnap || tiemposDeSnap.length === 0) return objetivo;
    const iman = 8 * msPorPx();
    let mejor = objetivo;
    let dist = iman;
    for (const t of tiemposDeSnap) {
      const d = Math.abs(ms - t);
      if (d < dist) {
        dist = d;
        mejor = t;
      }
    }
    return mejor;
  };

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
      // el estirado escala SIEMPRE contra la base del arranque del gesto
      // (aplicar factores incrementales acumularía redondeos)
      if (gesto.tipo === "estirar") onInicioEstirar?.();
    }
    const dt = dx * msPorPx();
    if (gesto.tipo === "estirar") {
      if (!onEstirarSeleccion) return;
      const { desde0, hasta0 } = gesto;
      if (gesto.borde === "der") {
        // el borde derecho estira con el IZQUIERDO clavado
        const nuevoHasta = Math.min(comp.duracion, Math.max(desde0 + cuadro, snapear(hasta0 + dt)));
        onEstirarSeleccion(desde0, (nuevoHasta - desde0) / (hasta0 - desde0));
      } else {
        // el borde izquierdo estira con el DERECHO clavado
        const nuevoDesde = Math.min(hasta0 - cuadro, Math.max(0, snapear(desde0 + dt)));
        onEstirarSeleccion(hasta0, (hasta0 - nuevoDesde) / (hasta0 - desde0));
      }
      return;
    }
    if (gesto.tipo === "spanMulti") {
      const nuevo = alFrame(dt);
      const delta = nuevo - gesto.aplicado;
      if (delta !== 0 && onDesplazarSeleccion) {
        onDesplazarSeleccion(delta);
        gesto.aplicado = nuevo;
      }
      return;
    }
    if (gesto.tipo === "span") {
      const fin = gesto.enOriginal + gesto.duracionOriginal;
      if (gesto.modo === "izq") {
        // estira desde el borde izquierdo: el FIN queda clavado
        const nuevoEn = Math.min(fin - cuadro, Math.max(0, snapear(gesto.enOriginal + dt)));
        onRetimarSegmento(gesto.capaId, gesto.clave, nuevoEn, fin - nuevoEn);
      } else if (gesto.modo === "der") {
        // estira desde el borde derecho: el INICIO queda clavado
        const nuevoFin = Math.min(comp.duracion, Math.max(gesto.enOriginal + cuadro, snapear(fin + dt)));
        onRetimarSegmento(gesto.capaId, gesto.clave, gesto.enOriginal, nuevoFin - gesto.enOriginal);
      } else {
        const nuevoEn = Math.min(comp.duracion, Math.max(0, snapear(gesto.enOriginal + dt)));
        onRetimarSegmento(gesto.capaId, gesto.clave, nuevoEn);
      }
    } else if (gesto.tipo === "poseCamara") {
      const pistasCam = comp.camara?.pistas;
      const nuevoT = Math.min(comp.duracion, Math.max(0, snapear(gesto.tOriginal + dt)));
      if (nuevoT === gesto.tActual || !pistasCam) return;
      // no pisar otra pose
      if ((["x", "y", "zoom"] as CanalCamara[]).some((c) => pistasCam[c]?.some((k) => k.t === nuevoT))) return;
      if (gesto.duplicar) {
        // Alt-drag: nace una copia de la pose y el gesto la arrastra a ella
        gesto.duplicar = false;
        gesto.tActual = nuevoT;
        onDuplicarPoseCamara?.(gesto.tOriginal, nuevoT);
        return;
      }
      onMoverPoseCamara(gesto.tActual, nuevoT);
      gesto.tActual = nuevoT;
    } else {
      const capa = comp.capas.find((c) => c.id === gesto.capaId);
      const pista = capa?.pistas?.[gesto.propiedad];
      const nuevoT = Math.min(comp.duracion, Math.max(0, snapear(gesto.tOriginal + dt)));
      if (nuevoT === gesto.tActual || !pista) return;
      if (pista.some((k) => k.t === nuevoT)) return; // no pisar otro keyframe
      if (gesto.duplicar) {
        // Alt-drag: la COPIA nace recién acá (el original no se movió ni un
        // frame) y el resto del gesto la arrastra a ella
        gesto.duplicar = false;
        gesto.tActual = nuevoT;
        onDuplicarKeyframe?.(gesto.capaId, gesto.propiedad, gesto.tOriginal, nuevoT);
        return;
      }
      onMoverKeyframe(gesto.capaId, gesto.propiedad, gesto.tActual, nuevoT);
      gesto.tActual = nuevoT;
    }
  };

  const iniciarGesto = (gesto: GestoSpan | GestoSpanMulti | GestoEstirar | GestoKeyframe | GestoPoseCamara) => {
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

  // ——— MARQUEE sobre las filas (como en AE): arrastrás por el fondo del
  // timeline y el rectángulo elige todas las capas que toca. Los spans,
  // keyframes y poses frenan la propagación, así que acá llega sólo el
  // fondo. Un click seco selecciona la fila (shift acumula).
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  // subgrupos (grupos de Figma) plegados por defecto: una fila cada uno
  const [gruposAbiertos, setGruposAbiertos] = useState<string[]>([]);
  const alBajarFilas = (e: React.PointerEvent) => {
    const cont = filasRef.current;
    if (!cont || e.button !== 0) return;
    e.preventDefault(); // que el marquee no arranque una selección de texto
    const rect = cont.getBoundingClientRect();
    const filaEl = (e.target as HTMLElement).closest?.("[data-fila-tl]") as HTMLElement | null;
    const capaId = filaEl?.dataset.filaTl ?? null;
    const origen = { x: e.clientX, y: e.clientY, movio: false };
    const shift = e.shiftKey;
    const alMover = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - origen.x) + Math.abs(ev.clientY - origen.y) > 3) origen.movio = true;
      if (!origen.movio) return;
      setMarquee({ x0: origen.x - rect.left, y0: origen.y - rect.top, x1: ev.clientX - rect.left, y1: ev.clientY - rect.top });
    };
    const alSoltar = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
      setMarquee(null);
      if (!origen.movio) {
        if (!capaId) return; // el fondo (o la fila de cámara, que se maneja sola)
        if (shift && onAlternarSeleccion) onAlternarSeleccion(capaId);
        else onSeleccionar(capaId);
        return;
      }
      // filas que cruza el rectángulo (alcanza el rango vertical: una fila
      // ocupa todo el ancho, el eje X del marquee no discrimina capas)
      const y0 = Math.min(origen.y, ev.clientY);
      const y1 = Math.max(origen.y, ev.clientY);
      const ids = [...cont.querySelectorAll<HTMLElement>("[data-fila-tl], [data-fila-tl-grupo]")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.top < y1 && r.bottom > y0;
        })
        .flatMap((el) => (el.dataset.filaTl ? [el.dataset.filaTl] : (el.dataset.filaTlGrupo?.split(",") ?? [])));
      if (ids.length && onSeleccionarVarias) onSeleccionarVarias(ids);
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
  };

  // Una fila de capa del timeline (suelta, o adentro de un subgrupo
  // expandido — ahí con un tinte para leer la pertenencia).
  const filaDeCapa = (capa: Capa, enGrupo: boolean) => {
          const activa = seleccionId === capa.id || seleccionIds.includes(capa.id);
          const spans: { clave: "entrada" | "salida"; seg: Segmento }[] = [];
          if (capa.entrada) spans.push({ clave: "entrada", seg: capa.entrada });
          if (capa.salida) spans.push({ clave: "salida", seg: capa.salida });
          return (
            <div
              key={capa.id}
              data-fila-tl={capa.id}
              className={[
                "relative mb-1 h-9 rounded-control",
                enGrupo ? "bg-ink/[0.02]" : "",
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
                    // varias capas seleccionadas y esta es una de ellas: el
                    // drag corre EN BLOQUE toda la animación de la selección
                    if (seleccionIds.length > 1 && seleccionIds.includes(capa.id) && onDesplazarSeleccion) {
                      iniciarGesto({ tipo: "spanMulti", x0: e.clientX, aplicado: 0, activo: false });
                      return;
                    }
                    onSeleccionar(capa.id);
                    iniciarGesto({ tipo: "span", capaId: capa.id, clave, modo: "mover", enOriginal: seg.en, duracionOriginal: seg.duracion, x0: e.clientX, activo: false });
                  }}
                  className={[
                    "group/span absolute top-1.5 bottom-1.5 cursor-grab rounded-full active:cursor-grabbing",
                    activa ? "bg-ink/[0.16] hover:bg-ink/[0.22]" : "bg-ink/[0.10] hover:bg-ink/[0.16]",
                  ].join(" ")}
                  style={{ left: pct(seg.en), width: pct(seg.duracion) }}
                >
                  {/* manijas de estirado: agarrás un borde y cambia la
                      DURACIÓN (el otro extremo queda clavado) */}
                  {(["izq", "der"] as const).map((modo) => (
                    <div
                      key={modo}
                      aria-hidden
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSeleccionar(capa.id);
                        iniciarGesto({ tipo: "span", capaId: capa.id, clave, modo, enOriginal: seg.en, duracionOriginal: seg.duracion, x0: e.clientX, activo: false });
                      }}
                      className={[
                        "absolute inset-y-0 w-2.5 cursor-ew-resize",
                        modo === "izq" ? "left-0 rounded-l-full" : "right-0 rounded-r-full",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-foreground/35 opacity-0 transition-opacity group-hover/span:opacity-100",
                          modo === "izq" ? "left-1" : "right-1",
                        ].join(" ")}
                      />
                    </div>
                  ))}
                </div>
              ))}
              {(Object.entries(capa.pistas ?? {}) as [NombrePropiedad, { t: number }[] | undefined][]).flatMap(
                ([propiedad, pista]) =>
                  (pista ?? []).map((kf) => {
                    const elegido =
                      seleccionKf?.tipo === "capa" &&
                      seleccionKf.capaId === capa.id &&
                      seleccionKf.propiedad === propiedad &&
                      seleccionKf.t === kf.t;
                    return (
                      <span
                        key={`${propiedad}-${kf.t}`}
                        role="button"
                        tabIndex={0}
                        aria-label={t("Keyframe de {propiedad} de «{nombre}»", { propiedad, nombre: capa.nombre })}
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
                          onSeleccionarKf({ tipo: "capa", capaId: capa.id, propiedad, t: kf.t });
                          iniciarGesto({ tipo: "keyframe", capaId: capa.id, propiedad, tOriginal: kf.t, tActual: kf.t, x0: e.clientX, activo: false, duplicar: e.altKey });
                        }}
                        className={[
                          "absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] active:cursor-grabbing",
                          elegido
                            ? "scale-140 bg-acento shadow-[0_0_0_2px_var(--chrome-bg),0_0_0_3.5px_var(--acento)]"
                            : activa
                              ? "bg-acento"
                              : "bg-foreground/50 hover:bg-foreground/80",
                        ].join(" ")}
                        style={{ left: pct(kf.t) }}
                      />
                    );
                  }),
              )}
            </div>
          );
  };


  return (
    <div className="flex select-none flex-col border-t border-(--glass-border) bg-(--chrome-bg)" style={{ height: alto }}>
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
        {onLoop && (
          <ConPista pista={loop ? t("Loop puesto: al terminar vuelve a empezar (con sonido)") : t("Sin loop: la escena se para en el último frame")}>
            <BotonIcono tam={28} etiqueta={t("Loop del preview")} activo={loop} onClick={onLoop}>
              <span aria-hidden className="text-[13px] leading-none">⟳</span>
            </BotonIcono>
          </ConPista>
        )}
        <div className="ml-2">
          <Timecode ms={tiempo} fps={composicion.fps} />
          <span className="font-mono text-xs tabular-nums text-foreground/30"> / </span>
          <Timecode ms={composicion.duracion} fps={composicion.fps} />
        </div>
        {onDuracion && (
          <div className="ml-2 w-28">
            <CampoNumero
              etiqueta={t("Dur")}
              valor={Math.round((composicion.duracion / 1000) * 100) / 100}
              min={0.5}
              max={120}
              paso={0.5}
              sufijo="s"
              onInicio={onCheckpoint}
              onCambio={(s) => onDuracion(Math.round(s * 1000))}
            />
          </div>
        )}
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
          const ms = tiempoDeEvento(e.clientX);
          onScrub(e.shiftKey ? imanAKeyframe(ms) : ms);
        }}
        onPointerMove={(e) => {
          if (!escrubeando.current) return;
          const ms = tiempoDeEvento(e.clientX);
          onScrub(e.shiftKey ? imanAKeyframe(ms) : ms);
        }}
        onPointerUp={() => (escrubeando.current = false)}
      >
        {Array.from({ length: Math.floor(composicion.duracion / 1000) + 1 }, (_, s) => (
          <div key={s} className="absolute top-0 h-2 w-px bg-foreground/20" style={{ left: pct(s * 1000) }} />
        ))}
        {/* los inicios de PALABRA de la locución: los imanes del snap, a la vista */}
        {(tiemposDeSnap ?? []).map((t0, i) => (
          <div
            key={`palabra-${i}`}
            className="pointer-events-none absolute bottom-0 h-1.5 w-px bg-acento/50"
            style={{ left: pct(t0) }}
          />
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-acento" style={{ left: pct(tiempo) }} />
        </div>
      </div>

      {/* nombres en un gutter propio: un span nunca puede pisar el nombre */}
      <div className="mx-3 mb-3 flex min-h-0 flex-1 overflow-y-auto">
        <div className="w-36 shrink-0 pr-2">
          {composicion.capas.map((capa) => {
            const activa = seleccionId === capa.id || seleccionIds.includes(capa.id);
            return (
              <button
                key={capa.id}
                type="button"
                onClick={(e) =>
                  e.shiftKey && onAlternarSeleccion ? onAlternarSeleccion(capa.id) : onSeleccionar(capa.id)
                }
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
        {/* min-h-full: el playhead cruza TODO el panel aunque haya pocas filas */}
        <div ref={filasRef} onPointerDown={alBajarFilas} className="relative min-h-full min-w-0 flex-1">
        <div className="pointer-events-none absolute inset-y-0 z-10 w-px bg-acento/60" style={{ left: pct(tiempo) }} />
        {marquee && (
          <div
            className="pointer-events-none absolute z-20 rounded-[3px] border border-acento bg-acento/10"
            style={{
              left: Math.min(marquee.x0, marquee.x1),
              top: Math.min(marquee.y0, marquee.y1),
              width: Math.abs(marquee.x1 - marquee.x0),
              height: Math.abs(marquee.y1 - marquee.y0),
            }}
          />
        )}
        {filasDeCapas(composicion.capas).flatMap((fila) => {
          // ——— fila de SUBGRUPO (grupo de Figma): una sola fila plegable —
          // el logo con 30 letras no come 30 filas; expandís cuando lo
          // querés animar por partes. La barra mueve el bloque entero.
          if (fila.tipo === "grupo") {
            const ids = fila.capas.map((c) => c.id);
            const abierto = gruposAbiertos.includes(fila.id);
            const algunaActiva = ids.some((id) => id === seleccionId || seleccionIds.includes(id));
            const rango = rangoAnimacionCapas(composicion, ids);
            const filaGrupo = (
              <div
                key={fila.id}
                data-fila-tl-grupo={ids.join(",")}
                className={[
                  "relative mb-1 h-9 rounded-control",
                  algunaActiva ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]",
                ].join(" ")}
              >
                <button
                  type="button"
                  aria-expanded={abierto}
                  aria-label={t("Desplegar el grupo «{nombre}»", { nombre: fila.nombre })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    setGruposAbiertos((previos) =>
                      abierto ? previos.filter((g) => g !== fila.id) : [...previos, fila.id],
                    )
                  }
                  className="absolute left-1 top-1/2 z-10 grid size-6 -translate-y-1/2 place-items-center rounded-control text-[11px] text-foreground/50 hover:bg-ink/[0.08] hover:text-foreground"
                >
                  <span aria-hidden className={abierto ? "" : "-rotate-90"}>▾</span>
                </button>
                <span className="pointer-events-none absolute left-8 top-1/2 z-10 -translate-y-1/2 truncate text-[10px] text-foreground/45">
                  {fila.nombre} · {fila.capas.length}
                </span>
                {rango && (
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={t("Animación del grupo «{nombre}»", { nombre: fila.nombre })}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSeleccionarVarias?.(ids);
                      iniciarGesto({ tipo: "spanMulti", x0: e.clientX, aplicado: 0, activo: false });
                    }}
                    className={[
                      "absolute top-1.5 bottom-1.5 cursor-grab rounded-full border border-dashed border-foreground/25 active:cursor-grabbing",
                      algunaActiva ? "bg-ink/[0.16] hover:bg-ink/[0.22]" : "bg-ink/[0.10] hover:bg-ink/[0.16]",
                    ].join(" ")}
                    style={{ left: pct(rango.desde), width: pct(rango.hasta - rango.desde) }}
                  />
                )}
              </div>
            );
            return [filaGrupo, ...(abierto ? fila.capas.map((c) => filaDeCapa(c, true)) : [])];
          }
          return [filaDeCapa(fila.capa, false)];
        })}
        {/* ——— RECUADRO de la selección múltiple: abraza todos los spans de
            las capas elegidas. El cuerpo mueve EN BLOQUE (lo de siempre);
            los bordes hacen TIME-STRETCH: estirás el recuadro y toda la
            coreografía del grupo se extiende o comprime junta. */}
        {(() => {
          if (seleccionIds.length < 2 || !onEstirarSeleccion) return null;
          const rango = rangoAnimacionCapas(composicion, seleccionIds);
          if (!rango) return null;
          // filas VISIBLES (los subgrupos plegados colapsan el conteo):
          // cada entrada lista los ids que esa fila representa
          const visibles: string[][] = filasDeCapas(composicion.capas).flatMap((fila) => {
            if (fila.tipo === "capa") return [[fila.capa.id]];
            const ids = fila.capas.map((c) => c.id);
            return gruposAbiertos.includes(fila.id)
              ? [ids, ...fila.capas.map((c) => [c.id])]
              : [ids];
          });
          const indices = visibles
            .map((ids, i) => (ids.some((id) => seleccionIds.includes(id)) ? i : -1))
            .filter((i) => i >= 0);
          if (!indices.length) return null;
          // filas: h-9 (36px) + mb-1 (4px) de paso
          const top = Math.min(...indices) * 40;
          const altoCaja = (Math.max(...indices) - Math.min(...indices)) * 40 + 36;
          return (
            <div
              role="group"
              aria-label={t("Animación del grupo seleccionado")}
              className="absolute z-20 cursor-grab rounded-[6px] border-[1.5px] border-acento/80 bg-acento/[0.04] active:cursor-grabbing"
              style={{ left: pct(rango.desde), width: pct(rango.hasta - rango.desde), top, height: altoCaja }}
              onPointerDown={(e) => {
                e.stopPropagation();
                iniciarGesto({ tipo: "spanMulti", x0: e.clientX, aplicado: 0, activo: false });
              }}
            >
              {(["izq", "der"] as const).map((borde) => (
                <div
                  key={borde}
                  aria-hidden
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    iniciarGesto({ tipo: "estirar", borde, desde0: rango.desde, hasta0: rango.hasta, x0: e.clientX, activo: false });
                  }}
                  className={[
                    "absolute inset-y-0 w-2.5 cursor-ew-resize",
                    borde === "izq" ? "-left-1" : "-right-1",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "absolute top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-acento",
                      borde === "izq" ? "left-0.5" : "right-0.5",
                    ].join(" ")}
                  />
                </div>
              ))}
            </div>
          );
        })()}
        {(() => {
          const activa = seleccionId === CAMARA_ID;
          const pistasCam = composicion.camara?.pistas ?? {};
          // una POSE por instante: los keyframes de x/y/zoom que caen juntos
          // se muestran (y se agarran) como UN rombo
          const poses = [...new Set(
            (Object.values(pistasCam) as { t: number }[][]).flatMap((pista) => (pista ?? []).map((k) => k.t)),
          )].sort((a, b) => a - b);
          return (
            <div
              onPointerDown={() => onSeleccionar(CAMARA_ID)}
              className={[
                "relative mb-1 h-9 rounded-control",
                activa ? "bg-ink/[0.06]" : "hover:bg-ink/[0.03]",
              ].join(" ")}
            >
              {poses.map((tPose) => {
                const elegido = seleccionKf?.tipo === "camara" && seleccionKf.t === tPose;
                return (
                  <span
                    key={tPose}
                    role="button"
                    tabIndex={0}
                    aria-label={t("Pose de cámara en {t}ms", { t: Math.round(tPose) })}
                    onKeyDown={(e) => {
                      const dir = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
                      if (!dir) return;
                      e.preventDefault();
                      onCheckpoint();
                      onMoverPoseCamara(tPose, alFrame(Math.min(composicion.duracion, Math.max(0, tPose + dir * cuadro))));
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSeleccionar(CAMARA_ID);
                      onSeleccionarKf({ tipo: "camara", t: tPose });
                      iniciarGesto({ tipo: "poseCamara", tOriginal: tPose, tActual: tPose, x0: e.clientX, activo: false, duplicar: e.altKey });
                    }}
                    className={[
                      "absolute top-1/2 z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-grab rounded-[2px] active:cursor-grabbing",
                      elegido
                        ? "scale-140 bg-acento shadow-[0_0_0_2px_var(--chrome-bg),0_0_0_3.5px_var(--acento)]"
                        : activa
                          ? "bg-acento"
                          : "bg-foreground/50 hover:bg-foreground/80",
                    ].join(" ")}
                    style={{ left: pct(tPose) }}
                  />
                );
              })}
            </div>
          );
        })()}
        </div>
      </div>
    </div>
  );
}
