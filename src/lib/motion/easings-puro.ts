/* -----------------------------------------------------------------------------
   Easings del sistema, como funciones puras t∈[0,1] → progreso

   Son funciones (no strings CSS) porque el motor es canvas: evaluar-puro
   necesita el número, y el motion blur necesita la DERIVADA (velocidad).
   Los resortes se resuelven con la EDO del resorte amortiguado en forma
   cerrada — determinística, sin estado, apta para seek en cualquier orden.
----------------------------------------------------------------------------- */

import type { NombreEasing } from "@/lib/motion/modelo";

function bezier(x1: number, y1: number, x2: number, y2: number) {
  // Resolución estándar de una timing function CSS: Newton-Raphson sobre x.
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const muestraX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const muestraY = (t: number) => ((ay * t + by) * t + cy) * t;
  const derivadaX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number): number => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = muestraX(t) - x;
      if (Math.abs(err) < 1e-6) break;
      const d = derivadaX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return muestraY(Math.min(1, Math.max(0, t)));
  };
}

function resorte(rigidez: number, amortiguacion: number) {
  // Sub-amortiguado en forma cerrada; el ×6 escala el dominio [0,1] a un
  // tiempo en que el resorte se asienta visualmente.
  const w0 = Math.sqrt(rigidez);
  const zeta = amortiguacion / (2 * Math.sqrt(rigidez));
  if (zeta >= 1) {
    return (t: number) => (t >= 1 ? 1 : 1 - Math.exp(-w0 * t * 6) * (1 + w0 * t * 6));
  }
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  return (t: number) => {
    if (t >= 1) return 1;
    const T = t * 6;
    return 1 - Math.exp(-zeta * w0 * T) * (Math.cos(wd * T) + ((zeta * w0) / wd) * Math.sin(wd * T));
  };
}

export const EASINGS: Record<NombreEasing, (t: number) => number> = {
  lineal: (t) => t,
  suave: bezier(0.4, 0.0, 0.2, 1),
  seco: bezier(0.9, 0.05, 0.1, 1),
  salidaQuad: bezier(0.25, 0.46, 0.45, 0.94),
  salidaCubic: bezier(0.215, 0.61, 0.355, 1),
  salidaQuart: bezier(0.165, 0.84, 0.44, 1),
  salidaExpo: bezier(0.19, 1, 0.22, 1),
  salidaBack: bezier(0.175, 0.885, 0.32, 1.275),
  entradaQuad: bezier(0.55, 0.085, 0.68, 0.53),
  entradaCubic: bezier(0.55, 0.055, 0.675, 0.19),
  entradaExpo: bezier(0.95, 0.05, 0.795, 0.035),
  entradaBack: bezier(0.6, -0.28, 0.735, 0.045),
  entradaSalidaCubic: bezier(0.645, 0.045, 0.355, 1),
  entradaSalidaExpo: bezier(0.87, 0, 0.13, 1),
  resorteSuave: resorte(120, 18),
  resorteTenso: resorte(260, 24),
  resorteRebote: resorte(220, 12),
};

export function easing(nombre?: NombreEasing): (t: number) => number {
  return (nombre && EASINGS[nombre]) || EASINGS.suave;
}

/**
 * Velocidad numérica del easing en t (progreso por unidad de tiempo
 * normalizado). Alimenta el motion blur sintetizado.
 */
export function velocidadEn(fn: (t: number) => number, t: number, dt = 1 / 240): number {
  const a = fn(Math.max(0, t - dt));
  const b = fn(Math.min(1, t + dt));
  return (b - a) / (2 * dt);
}
