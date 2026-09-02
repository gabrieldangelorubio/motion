/* -----------------------------------------------------------------------------
   ENCUADRES — escenas marcadas por el usuario y encuadre automático

   Gabriel (2026-09-02), viendo que Flash escribe la cámara «a ojo» (x = 960
   sobre una pantalla de 1440): «cuando importás, vas marcando con la cámara
   escena uno, dos, tres… esa información le llega al agente y él anima».
   Dos piezas, las dos deterministas:
   1. ENCUADRES MARCADOS: el usuario guarda encuadres (centro + zoom) en
      orden; `recorrer_encuadres` construye la cámara con código a partir de
      los TIEMPOS que decide el guionista. La geometría nunca la escribe el
      modelo.
   2. ENCUADRE AUTOMÁTICO: cuando no hay escenas marcadas, después de
      aplicar el guion se corrige cada keyframe de cámara para que lo visible
      caiga dentro de la pantalla (o quede centrado si la pantalla es más
      chica). El x = 960 se vuelve 720 sin gastar una ronda del modelo.
----------------------------------------------------------------------------- */

import type { Camara, CapaForma, Composicion, EasingSpec, Encuadre, Keyframe, TemblorCamara } from "@/lib/motion/modelo";
import { esPlaca } from "@/lib/motion/estilo-puro";
import { cajaVisibleEn } from "@/lib/motion/auditoria-puro";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Guarda la vista actual como la escena siguiente («Escena N»). */
export function marcarEncuadre(comp: Composicion, vista: { x: number; y: number; zoom: number }, nombre?: string): Composicion {
  const lista = comp.encuadres ?? [];
  const n = lista.length + 1;
  let id = `esc-${n}`;
  while (lista.some((e) => e.id === id)) id = `${id}b`;
  return { ...comp, encuadres: [...lista, { id, nombre: nombre?.trim() || `Escena ${n}`, x: r2(vista.x), y: r2(vista.y), zoom: r2(vista.zoom) }] };
}

export function quitarEncuadre(comp: Composicion, id: string): Composicion {
  const lista = (comp.encuadres ?? []).filter((e) => e.id !== id);
  return { ...comp, encuadres: lista.length ? lista : undefined };
}

/** Lo que el director lee del estado: escenas en orden con su encuadre y
    lo que ve la cámara ahí. Vacío si no hay escenas marcadas. */
export function describirEncuadres(comp: Composicion): string[] {
  const lista = comp.encuadres ?? [];
  if (lista.length === 0) return [];
  return [
    `  ENCUADRES MARCADOS por el usuario (${lista.length} escenas, EN ORDEN — la cámara los recorre con recorrer_encuadres; no inventes otros encuadres):`,
    ...lista.map(
      (e, i) =>
        `    ${i + 1}. «${e.nombre}» (id ${e.id}): centro (${Math.round(e.x)}, ${Math.round(e.y)}) zoom ${e.zoom} → ve ${Math.round(comp.ancho / e.zoom)}×${Math.round(comp.alto / e.zoom)} px del lienzo, x ${Math.round(e.x - comp.ancho / e.zoom / 2)}–${Math.round(e.x + comp.ancho / e.zoom / 2)}, y ${Math.round(e.y - comp.alto / e.zoom / 2)}–${Math.round(e.y + comp.alto / e.zoom / 2)}`,
    ),
  ];
}

export type TramoDeEscena = { escena: number | string; desde: number; hasta: number };

/**
 * La cámara a partir de las escenas marcadas y los tiempos del guion: en
 * cada tramo la cámara se queda quieta en su encuadre (hold = dos keyframes
 * iguales) y viaja al siguiente durante `viajeMs` antes de que empiece (o
 * en el hueco entre tramos, si lo hay), con el easing dado. Devuelve la
 * cámara nueva o el motivo por el que no se pudo armar.
 */
export function camaraDeEncuadres(
  comp: Composicion,
  tramos: TramoDeEscena[],
  opciones: { viajeMs?: number; easing?: EasingSpec; temblor?: TemblorCamara } = {},
): { ok: true; camara: Camara } | { ok: false; error: string } {
  const lista = comp.encuadres ?? [];
  if (lista.length === 0) return { ok: false, error: "no hay encuadres marcados: el usuario marca las escenas en el inspector de cámara" };
  if (tramos.length === 0) return { ok: false, error: "tramos vacíos: hace falta al menos {escena, desde, hasta}" };
  const viaje = Math.max(200, opciones.viajeMs ?? 1100);
  const easing = opciones.easing ?? "entradaSalidaCubic";
  const resueltos: { e: Encuadre; desde: number; hasta: number }[] = [];
  for (const t of tramos) {
    const e = typeof t.escena === "number" ? lista[t.escena - 1] : lista.find((x) => x.id === t.escena);
    if (!e) return { ok: false, error: `escena «${t.escena}» no existe (hay ${lista.length}: ${lista.map((x, i) => `${i + 1}=${x.id}`).join(", ")})` };
    const desde = Math.max(0, Math.min(comp.duracion, t.desde));
    const hasta = Math.max(desde, Math.min(comp.duracion, t.hasta));
    resueltos.push({ e, desde, hasta });
  }
  resueltos.sort((a, b) => a.desde - b.desde);
  const x: Keyframe[] = [];
  const y: Keyframe[] = [];
  const z: Keyframe[] = [];
  resueltos.forEach((tr, i) => {
    const sig = resueltos[i + 1];
    // el hold termina donde arranca el viaje: viajeMs antes del tramo
    // siguiente, pero nunca antes de empezar el propio hold
    const finHold = sig ? Math.max(tr.desde, Math.min(tr.hasta, sig.desde - viaje)) : tr.hasta;
    x.push({ t: tr.desde, v: tr.e.x, hold: true });
    y.push({ t: tr.desde, v: tr.e.y, hold: true });
    z.push({ t: tr.desde, v: tr.e.zoom, hold: true });
    if (finHold > tr.desde || sig) {
      x.push({ t: finHold, v: tr.e.x, easing: sig ? easing : undefined });
      y.push({ t: finHold, v: tr.e.y, easing: sig ? easing : undefined });
      z.push({ t: finHold, v: tr.e.zoom, easing: sig ? easing : undefined });
    }
  });
  const primero = resueltos[0].e;
  return {
    ok: true,
    camara: {
      base: { x: primero.x, y: primero.y, zoom: primero.zoom },
      pistas: { x: dedupe(x), y: dedupe(y), zoom: dedupe(z) },
      temblor: opciones.temblor,
    },
  };
}

/** Dos keyframes en el mismo t (hold que termina donde empieza el
    siguiente) se quedan con el último. */
function dedupe(kfs: Keyframe[]): Keyframe[] {
  const porT = new Map<number, Keyframe>();
  for (const k of kfs) porT.set(k.t, { ...porT.get(k.t), ...k });
  return [...porT.values()].sort((a, b) => a.t - b.t);
}

/** La placa con más solapamiento con una caja visible (o null). */
function pantallaDe(comp: Composicion, ve: { x1: number; y1: number; x2: number; y2: number }): CapaForma | null {
  let mejor: { p: CapaForma; area: number } | null = null;
  for (const c of comp.capas) {
    if (!esPlaca(c) || c.tipo !== "forma" || c.oculta) continue;
    const px1 = c.x - c.ancho / 2, px2 = c.x + c.ancho / 2, py1 = c.y - c.alto / 2, py2 = c.y + c.alto / 2;
    const area = Math.max(0, Math.min(ve.x2, px2) - Math.max(ve.x1, px1)) * Math.max(0, Math.min(ve.y2, py2) - Math.max(ve.y1, py1));
    if (area > 0 && (!mejor || area > mejor.area)) mejor = { p: c, area };
  }
  return mejor?.p ?? null;
}

/** El centro corregido para un instante: dentro de la pantalla si ella es
    más grande que lo visible, centrado si es más chica. */
function centroCorregido(comp: Composicion, t: number): { x: number; y: number } | null {
  const ve = cajaVisibleEn(comp, t);
  const p = pantallaDe(comp, ve);
  if (!p) return null;
  const vw = ve.x2 - ve.x1;
  const vh = ve.y2 - ve.y1;
  const px1 = p.x - p.ancho / 2, px2 = p.x + p.ancho / 2, py1 = p.y - p.alto / 2, py2 = p.y + p.alto / 2;
  // pantalla más grande que el cuadro: adentro, por el borde más cercano;
  // si sobra menos del 10 % del cuadro, directamente centrada (9 px de
  // descentrado se notan igual). Más chica: centrada.
  const cx = p.ancho - vw > vw * 0.1 ? Math.min(px2 - vw / 2, Math.max(px1 + vw / 2, (ve.x1 + ve.x2) / 2)) : p.x;
  const cy = p.alto - vh > vh * 0.1 ? Math.min(py2 - vh / 2, Math.max(py1 + vh / 2, (ve.y1 + ve.y2) / 2)) : p.y;
  return { x: r2(cx), y: r2(cy) };
}

/**
 * Encuadre automático: corrige base y keyframes de x/y de la cámara para
 * que en cada instante donde la cámara se detiene lo visible caiga dentro
 * de su pantalla (o centrado). No toca el zoom ni las capas. Devuelve la
 * composición y cuántos valores cambió.
 */
export function encuadrarEnPantalla(comp: Composicion): { comp: Composicion; ajustes: number } {
  if (!comp.camara) return { comp, ajustes: 0 };
  let ajustes = 0;
  const cam: Camara = { ...comp.camara, base: { ...comp.camara.base }, pistas: { ...comp.camara.pistas } };
  const vivo = (): Composicion => ({ ...comp, camara: cam });
  const aplicar = (canal: "x" | "y") => {
    const kfs = cam.pistas[canal];
    if (kfs && kfs.length > 0) {
      cam.pistas[canal] = kfs.map((k) => {
        const c = centroCorregido(vivo(), k.t);
        if (!c) return k;
        const v = c[canal];
        if (Math.abs(v - k.v) > 0.5) ajustes++;
        return Math.abs(v - k.v) > 0.5 ? { ...k, v } : k;
      });
    } else {
      const c = centroCorregido(vivo(), 0);
      const actual = cam.base?.[canal] ?? (canal === "x" ? comp.ancho / 2 : comp.alto / 2);
      if (c && Math.abs(c[canal] - actual) > 0.5) {
        cam.base = { ...cam.base, [canal]: c[canal] };
        ajustes++;
      }
    }
  };
  aplicar("x");
  aplicar("y");
  return { comp: ajustes ? vivo() : comp, ajustes };
}
