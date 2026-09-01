/* -----------------------------------------------------------------------------
   Puente GSAP — cualquier ease de GSAP como función pura t∈[0,1] → progreso

   FORK GSAP: acá GSAP no anima nada — PRESTA sus curvas. `parseEase` devuelve
   funciones puras (mismo t → mismo p, aptas para seek en cualquier orden y
   para la derivada del motion blur), así que todo el catálogo entra al motor
   canvas determinista sin tocar evaluar-puro: «back.out(3)» con el overshoot
   A MEDIDA, «elastic.out(1.2,0.4)» con amplitud y período propios,
   «steps(8)», y curvas dibujadas como path SVG vía CustomEase.

   Determinismo: los eases de GSAP son cerrados (nada de Math.random) — el
   preview, el MP4 y la secuencia PNG ven exactamente la misma curva. Por eso
   RoughEase queda AFUERA (genera sus puntos con random al crearse: dos
   sesiones darían dos curvas distintas).
----------------------------------------------------------------------------- */

import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";

gsap.registerPlugin(CustomEase);

// parseEase/CustomEase.create no son gratis: cada spec se resuelve UNA vez
// (null también se recuerda: un spec roto no se re-parsea por frame)
const cache = new Map<string, ((t: number) => number) | null>();

/** La función del ease GSAP para un spec, o null si no parsea. Un path SVG
    («M0,0 C0.2,0 0.1,1 1,1») se compila como curva custom. */
export function easingGsap(spec: string): ((t: number) => number) | null {
  const visto = cache.get(spec);
  if (visto !== undefined) return visto;
  let fn: ((t: number) => number) | null = null;
  try {
    if (/^\s*M\s*[\d.-]/.test(spec)) {
      fn = CustomEase.create(`curva-${cache.size}`, spec) as (t: number) => number;
    } else {
      const parseada: unknown = gsap.parseEase(spec);
      fn = typeof parseada === "function" ? (parseada as (t: number) => number) : null;
    }
  } catch {
    fn = null;
  }
  cache.set(spec, fn);
  return fn;
}

/** Curados para el selector y el director: lo que el catálogo de la casa NO
    tiene — back y elastic PARAMÉTRICOS (el overshoot/amplitud/período es un
    dial, no un preset), steps a medida, bounce de entrada. El resto del
    universo GSAP igual entra tipeando el spec. */
export const EASINGS_GSAP_DESTACADOS: string[] = [
  "back.out(1.2)",
  "back.out(2.5)",
  "back.out(4)",
  "back.inOut(2.5)",
  "elastic.out(1,0.75)",
  "elastic.out(1,0.5)",
  "elastic.out(1.2,0.4)",
  "bounce.out",
  "bounce.in",
  "expo.inOut",
  "steps(4)",
  "steps(8)",
  "steps(16)",
];
