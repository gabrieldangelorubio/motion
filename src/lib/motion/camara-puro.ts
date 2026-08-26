/* -----------------------------------------------------------------------------
   Matemática de cámara del lienzo — misma firma y constantes que los dos
   lienzos de diosa (kit §8.3)

   Al integrar, este archivo se reemplaza por lib/canvas del repo y no se
   nota: por eso las funciones y constantes copian los nombres y valores
   literales del kit. El zoom es AL CURSOR (el punto bajo el mouse no se
   mueve) y el pan se compone sobre la cámara OBJETIVO, nunca la eased.
----------------------------------------------------------------------------- */

export type Camara = { x: number; y: number; escala: number };
export type Rectangulo = { left: number; top: number; width: number; height: number };

export const PAN_MAX = 400;
export const PASO_RUEDA = 1.377;
export const K_PINCH = 0.009;
export const DELTA_MAX = 12;
export const UMBRAL_RUEDA = 40;
export const MIN_ESCALA = 0.3;
export const MAX_ESCALA = 6;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Normaliza un WheelEvent: deltaMode línea = 16px, página = 400px; acota el pan. */
export function interpretarWheel(e: { deltaX: number; deltaY: number; deltaMode: number }): {
  dx: number;
  dy: number;
} {
  const factor = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  return {
    dx: clamp(e.deltaX * factor, -PAN_MAX, PAN_MAX),
    dy: clamp(e.deltaY * factor, -PAN_MAX, PAN_MAX),
  };
}

/** ¿Rueda discreta o trackpad? Se distingue por MAGNITUD, no por delta entero. */
export function esRuedaDiscreta(deltaY: number): boolean {
  return Math.abs(deltaY) >= UMBRAL_RUEDA;
}

/** Zoom al cursor: el punto de pantalla (px, py) queda fijo en el mundo. */
export function camaraConZoom(cam: Camara, factor: number, px: number, py: number): Camara {
  const escala = clamp(cam.escala * factor, MIN_ESCALA, MAX_ESCALA);
  const k = escala / cam.escala;
  return {
    escala,
    x: px - (px - cam.x) * k,
    y: py - (py - cam.y) * k,
  };
}

export function factorDeRueda(pasos: number): number {
  return Math.pow(PASO_RUEDA, pasos);
}

export function factorDePinch(delta: number): number {
  return Math.exp(-clamp(delta, -DELTA_MAX, DELTA_MAX) * K_PINCH);
}

export function pantallaAMundo(sx: number, sy: number, rect: Rectangulo, cam: Camara): { x: number; y: number } {
  return {
    x: (sx - rect.left - cam.x) / cam.escala,
    y: (sy - rect.top - cam.y) / cam.escala,
  };
}

/** La cámara que encuadra un bbox de mundo en el viewport, con margen. */
export function camaraQueEncuadra(
  bbox: { x: number; y: number; w: number; h: number },
  rect: Rectangulo,
  opts: { min?: number; max?: number; margen?: number } = {},
): Camara {
  const margen = opts.margen ?? 100;
  const disponibleW = Math.max(1, rect.width - margen * 2);
  const disponibleH = Math.max(1, rect.height - margen * 2);
  const escala = clamp(
    Math.min(disponibleW / Math.max(1, bbox.w), disponibleH / Math.max(1, bbox.h)),
    opts.min ?? 0.04,
    opts.max ?? MAX_ESCALA,
  );
  return {
    escala,
    x: (rect.width - bbox.w * escala) / 2 - bbox.x * escala,
    y: (rect.height - bbox.h * escala) / 2 - bbox.y * escala,
  };
}
