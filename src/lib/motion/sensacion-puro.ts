/* -----------------------------------------------------------------------------
   Sensación de la pieza — la perilla macro snappy ↔ suave

   Una TRANSFORMACIÓN pura sobre la composición, no una curva mágica en el
   render: escala duraciones y escalonados, y corre los easings DENTRO de
   su familia (un cubic se vuelve expo en snappy y sine en suave; el
   elástico sigue siendo elástico — el carácter se respeta, cambia el
   timing). Los «en» no se tocan: la sincronización con la locución es
   sagrada. Por ser una op de verdad sobre segmentos, el preview la pinta
   igual que el export y AE la hereda fiel.
----------------------------------------------------------------------------- */

import type { Composicion, EasingSpec, NombreEasing, Segmento } from "@/lib/motion/modelo";

/** −1 = snappy · 0 = neutro · +1 = suave */
export type Sensacion = number;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Cuánto escalan duraciones y escalonados: −1 → 0.7×, 0 → 1×, +1 → 1.4× */
export function factorDuracion(s: Sensacion): number {
  const x = clamp(s, -1, 1);
  return x < 0 ? 1 + 0.3 * x : 1 + 0.4 * x;
}

/** La escalera de intensidad de la casa (escuela GSAP §1): snappy sube
    hacia expo, suave baja hacia sine. */
const ESCALERA = ["Sine", "Quad", "Cubic", "Quart", "Quint", "Expo"] as const;

/** Corre un easing dentro de su familia según la sensación. Los de
    carácter (back, elástico, pique, circ, lineal, escalones) no se pisan:
    perderían lo que los hace ellos. */
export function easingConSensacion(nombre: EasingSpec, s: Sensacion): EasingSpec {
  const m = /^(entradaSalida|entrada|salida)(Sine|Quad|Cubic|Quart|Quint|Expo)$/.exec(nombre);
  if (!m) return nombre;
  const salto = Math.round(-2 * clamp(s, -1, 1));
  const i = clamp(ESCALERA.indexOf(m[2] as (typeof ESCALERA)[number]) + salto, 0, ESCALERA.length - 1);
  return `${m[1]}${ESCALERA[i]}` as NombreEasing;
}

/** Aplica la sensación a TODA la pieza: entradas y salidas de cada capa
    (duración, escalonado, easing). Las pistas crudas de keyframes no se
    tocan — son coreografía fina puesta a mano. `marca` sella las capas
    cambiadas para el merge (§2.4); sin marca no bumpea v (preview). */
export function aplicarSensacion(comp: Composicion, s: Sensacion, marca?: number): Composicion {
  const f = factorDuracion(s);
  if (Math.abs(f - 1) < 0.005 && Math.round(-2 * clamp(s, -1, 1)) === 0) return comp;
  const seg = (g: Segmento | undefined): Segmento | undefined =>
    g && {
      ...g,
      duracion: clamp(Math.round(g.duracion * f), 50, comp.duracion),
      escalonado: g.escalonado === undefined ? undefined : Math.round(g.escalonado * f),
      easing: g.easing ? easingConSensacion(g.easing, s) : g.easing,
    };
  return {
    ...comp,
    capas: comp.capas.map((capa) => {
      if (!capa.entrada && !capa.salida) return capa;
      return {
        ...capa,
        entrada: seg(capa.entrada),
        salida: seg(capa.salida),
        ...(marca === undefined ? {} : { v: marca }),
      };
    }),
  };
}

/** El registro de la pieza para el director: viaja en cada pedido para
    que las direcciones nuevas nazcan con esta sensación. null = neutro,
    no hace falta decir nada. */
export function descripcionSensacion(s: Sensacion): string | null {
  const x = clamp(s, -1, 1);
  if (Math.abs(x) < 0.05) return null;
  const pct = Math.round(factorDuracion(x) * 100);
  return x < 0
    ? `SENSACIÓN de la pieza: SNAPPY (${x.toFixed(2)}) — cortes rápidos, duraciones ~${pct}% de lo normal, easings hacia expo, escalonados apretados, impactos secos. Dirigí TODO en ese registro.`
    : `SENSACIÓN de la pieza: SUAVE (${x.toFixed(2)}) — más aire, duraciones ~${pct}% de lo normal, easings hacia sine, escalonados generosos, fades amplios. Dirigí TODO en ese registro.`;
}
