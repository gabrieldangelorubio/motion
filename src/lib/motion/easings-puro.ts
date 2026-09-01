/* -----------------------------------------------------------------------------
   Easings del sistema, como funciones puras t∈[0,1] → progreso

   Son funciones (no strings CSS) porque el motor es canvas: evaluar-puro
   necesita el número, y el motion blur necesita la DERIVADA (velocidad).
   Los resortes se resuelven con la EDO del resorte amortiguado en forma
   cerrada — determinística, sin estado, apta para seek en cualquier orden.
----------------------------------------------------------------------------- */

import type { EasingSpec, NombreEasing } from "@/lib/motion/modelo";
import { easingGsap } from "@/lib/motion/easings-gsap";

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

/* Elastic y bounce son las fórmulas Penner clásicas (las mismas de GSAP:
   elastic.out(1, 0.3) y bounce): tienen rebotes de verdad, un bezier no las
   cuenta. `escalones` es steps(10) — stop-motion, 10 saltos secos. */

function salidaElastico(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
}

function salidaPique(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function escalones(t: number): number {
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  return Math.floor(t * 10) / 10;
}

export const EASINGS: Record<NombreEasing, (t: number) => number> = {
  lineal: (t) => t,
  suave: bezier(0.4, 0.0, 0.2, 1),
  seco: bezier(0.9, 0.05, 0.1, 1),
  // salidas — arrancan rápido y frenan (la dirección default para entradas de elementos)
  salidaSine: bezier(0.39, 0.575, 0.565, 1),
  salidaQuad: bezier(0.25, 0.46, 0.45, 0.94),
  salidaCubic: bezier(0.215, 0.61, 0.355, 1),
  salidaQuart: bezier(0.165, 0.84, 0.44, 1),
  salidaQuint: bezier(0.23, 1, 0.32, 1),
  salidaExpo: bezier(0.19, 1, 0.22, 1),
  salidaCirc: bezier(0.075, 0.82, 0.165, 1),
  salidaBack: bezier(0.175, 0.885, 0.32, 1.275),
  salidaElastico,
  salidaPique,
  // entradas — arrancan lento y aceleran (para salidas de elementos que "caen")
  entradaSine: bezier(0.47, 0, 0.745, 0.715),
  entradaQuad: bezier(0.55, 0.085, 0.68, 0.53),
  entradaCubic: bezier(0.55, 0.055, 0.675, 0.19),
  entradaQuart: bezier(0.895, 0.03, 0.685, 0.22),
  entradaQuint: bezier(0.755, 0.05, 0.855, 0.06),
  entradaExpo: bezier(0.95, 0.05, 0.795, 0.035),
  entradaCirc: bezier(0.6, 0.04, 0.98, 0.335),
  entradaBack: bezier(0.6, -0.28, 0.735, 0.045),
  entradaElastico: (t) => 1 - salidaElastico(1 - t),
  entradaPique: (t) => 1 - salidaPique(1 - t),
  // entrada-salida — aceleran y frenan (traslados y cámara)
  entradaSalidaSine: bezier(0.445, 0.05, 0.55, 0.95),
  entradaSalidaQuad: bezier(0.455, 0.03, 0.515, 0.955),
  entradaSalidaCubic: bezier(0.645, 0.045, 0.355, 1),
  entradaSalidaQuart: bezier(0.77, 0, 0.175, 1),
  entradaSalidaQuint: bezier(0.86, 0, 0.07, 1),
  entradaSalidaExpo: bezier(0.87, 0, 0.13, 1),
  entradaSalidaCirc: bezier(0.785, 0.135, 0.15, 0.86),
  entradaSalidaBack: bezier(0.68, -0.55, 0.265, 1.55),
  escalones,
  resorteSuave: resorte(120, 18),
  resorteTenso: resorte(260, 24),
  resorteRebote: resorte(220, 12),
};

/** Resuelve un easing: los nombres de la casa primero; cualquier otro
    string se intenta como spec de GSAP (fork GSAP: «back.out(3)»,
    «elastic.out(1.2,0.4)», «steps(8)», un path SVG). Un spec que no
    parsea degrada a `suave` — el preview nunca revienta por un typo. */
export function easing(nombre?: EasingSpec): (t: number) => number {
  if (!nombre) return EASINGS.suave;
  const propia = EASINGS[nombre as NombreEasing];
  if (propia) return propia;
  return easingGsap(nombre) ?? EASINGS.suave;
}

/** ¿El spec es un easing que el motor sabe resolver DE VERDAD (no el
    fallback)? La validación de las tools del director y del inspector. */
export function esEasingConocido(nombre: string): boolean {
  return nombre in EASINGS || easingGsap(nombre) !== null;
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
