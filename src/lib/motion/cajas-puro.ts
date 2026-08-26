/* -----------------------------------------------------------------------------
   Cajas de capas y hit-test — la geometría de la selección en el lienzo

   La caja de una capa depende de medir texto, y medir texto necesita un
   canvas: para mantener esto puro (y testeable con node), el medidor entra
   como función. El hit-test invierte la transformación de la capa (rotación
   alrededor del ancla + escala) en vez de rotar la caja: un punto se
   transforma barato, un polígono no.
----------------------------------------------------------------------------- */

import type { Capa } from "@/lib/motion/modelo";

/** Caja en coordenadas LOCALES de la capa (el ancla es el origen). */
export type CajaLocal = { x: number; y: number; w: number; h: number };
/** Caja alineada a ejes en coordenadas de mundo (para snapping y marcos). */
export type CajaMundo = { x: number; y: number; w: number; h: number };

export type MedirTexto = (texto: string, font: string) => number;

const ASCENDENTE = 0.8; // fracción del tamaño por encima del baseline (aprox del stack del sistema)
const DESCENDENTE = 0.25;

export function cajaLocalDeCapa(capa: Capa, medir: MedirTexto): CajaLocal {
  if (capa.tipo !== "texto") {
    return { x: -capa.ancho / 2, y: -capa.alto / 2, w: capa.ancho, h: capa.alto };
  }
  const { familia, tamano, peso } = capa.fuente;
  const interlineado = capa.fuente.interlineado ?? tamano * 1.15;
  const lineas = capa.texto.split("\n");
  const anchoTexto = Math.max(...lineas.map((l) => medir(l, `${peso} ${tamano}px ${familia}`)));
  // El bloque multilínea queda centrado en el ancla (misma cuenta que pintar):
  // la baseline de la línea i cae en (i − (n−1)/2) · interlineado.
  const h = (lineas.length - 1) * interlineado + tamano * (ASCENDENTE + DESCENDENTE);
  const y = -((lineas.length - 1) / 2) * interlineado - tamano * ASCENDENTE;
  if (capa.alineacion === "izquierda") return { x: 0, y, w: anchoTexto, h };
  if (capa.alineacion === "derecha") return { x: -anchoTexto, y, w: anchoTexto, h };
  return { x: -anchoTexto / 2, y, w: anchoTexto, h };
}

/** ¿El punto de mundo (px, py) cae dentro de la capa? Invierte rotación y escala. */
export function puntoEnCapa(capa: Capa, medir: MedirTexto, px: number, py: number): boolean {
  const caja = cajaLocalDeCapa(capa, medir);
  const escala = capa.escala ?? 1;
  if (escala === 0) return false;
  const rad = (-(capa.rotacion ?? 0) * Math.PI) / 180;
  const dx = px - capa.x;
  const dy = py - capa.y;
  const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / escala;
  const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / escala;
  return lx >= caja.x && lx <= caja.x + caja.w && ly >= caja.y && ly <= caja.y + caja.h;
}

/** Caja de mundo alineada a ejes (envolvente si hay rotación) — para snapping y guías. */
export function cajaMundoDeCapa(capa: Capa, medir: MedirTexto): CajaMundo {
  const caja = cajaLocalDeCapa(capa, medir);
  const escala = capa.escala ?? 1;
  const rad = ((capa.rotacion ?? 0) * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const esquinas = [
    [caja.x, caja.y],
    [caja.x + caja.w, caja.y],
    [caja.x, caja.y + caja.h],
    [caja.x + caja.w, caja.y + caja.h],
  ].map(([lx, ly]) => [
    capa.x + (lx * cos - ly * sin) * escala,
    capa.y + (lx * sin + ly * cos) * escala,
  ]);
  const xs = esquinas.map((e) => e[0]);
  const ys = esquinas.map((e) => e[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

/** La capa de MÁS ARRIBA bajo el punto (el orden del array es el z-order). */
export function capaEnPunto(capas: Capa[], medir: MedirTexto, px: number, py: number): Capa | null {
  for (let i = capas.length - 1; i >= 0; i--) {
    const capa = capas[i];
    if (capa.oculta) continue;
    if (puntoEnCapa(capa, medir, px, py)) return capa;
  }
  return null;
}
