/* -----------------------------------------------------------------------------
   FORMATO del render — una decisión del proyecto, no de la pantalla importada

   El módulo trabaja con un lienzo multi-pantalla y una cámara: lo que sale
   en el render es lo que la cámara ve, en el formato de la composición
   (ancho×alto). Ese formato lo elige el usuario al arrancar (16:9, 9:16,
   1:1, 4:5 o a medida) y NO lo cambia importar una pantalla de Figma: una
   landing de 1440×9000 entra al lienzo como pantalla, y la cámara la
   encuadra en 16:9 (arriba, a lo ancho) — antes, la primera pantalla
   importada pisaba el formato y el render quedaba gigante y vertical.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";

export type Formato = { id: string; nombre: string; ancho: number; alto: number };

export const FORMATOS: Formato[] = [
  { id: "16:9", nombre: "16:9 horizontal", ancho: 1920, alto: 1080 },
  { id: "9:16", nombre: "9:16 vertical", ancho: 1080, alto: 1920 },
  { id: "1:1", nombre: "1:1 cuadrado", ancho: 1080, alto: 1080 },
  { id: "4:5", nombre: "4:5 feed", ancho: 1080, alto: 1350 },
];

export const FORMATO_MIN = 64;
export const FORMATO_MAX = 8192;

/** El id del preset que coincide EXACTO con el formato de la composición,
    o «medida» si es un tamaño propio. */
export function formatoDe(comp: Pick<Composicion, "ancho" | "alto">): string {
  return FORMATOS.find((f) => f.ancho === comp.ancho && f.alto === comp.alto)?.id ?? "medida";
}

/** La composición con otro formato: las capas no se tocan (viven en el
    lienzo, la cámara encuadra); ancho/alto enteros y acotados. */
export function conFormato(comp: Composicion, ancho: number, alto: number): Composicion {
  const acotar = (v: number, def: number) =>
    Math.round(Math.min(FORMATO_MAX, Math.max(FORMATO_MIN, Number.isFinite(v) ? v : def)));
  return { ...comp, ancho: acotar(ancho, comp.ancho), alto: acotar(alto, comp.alto) };
}

export type CajaPantalla = { x: number; y: number; ancho: number; alto: number };

/** Una pantalla «página» es la que es mucho más alta que ancha (una landing,
    un scroll): más de 3 veces. Se encuadra a lo ANCHO desde arriba, y la
    cámara después baja por ella. Lo demás (un frame de app, un poster) se
    encuadra ENTERO, centrado. */
export function esPagina(p: Pick<CajaPantalla, "ancho" | "alto">): boolean {
  return p.ancho > 0 && p.alto / p.ancho > 3;
}

/**
 * Encuadre de cámara (base) para ver una pantalla en el formato de la
 * composición. El zoom es relativo al ancho de la composición (1 = el frame
 * entero): la cámara ve comp.ancho/zoom × comp.alto/zoom px del lienzo.
 * - página: zoom = fit al ancho, centrada en x, arrancando ARRIBA
 * - resto: zoom = contain (la pantalla completa cabe), centrada
 */
export function encuadreDePantalla(
  comp: Pick<Composicion, "ancho" | "alto">,
  p: CajaPantalla,
): { x: number; y: number; zoom: number } {
  const acotarZoom = (z: number) => Math.min(20, Math.max(0.05, z));
  if (esPagina(p)) {
    const zoom = acotarZoom(comp.ancho / p.ancho);
    const altoVisible = comp.alto / zoom;
    const arriba = p.y - p.alto / 2;
    return { x: p.x, y: arriba + altoVisible / 2, zoom };
  }
  const zoom = acotarZoom(Math.min(comp.ancho / p.ancho, comp.alto / p.alto));
  return { x: p.x, y: p.y, zoom };
}
