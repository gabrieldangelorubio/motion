/* -----------------------------------------------------------------------------
   ÁRBOL DE CAPAS — la jerarquía de Figma en el panel

   Gabriel (2026-09-03): «¿mucho problema mantener exactamente el mismo
   orden, distribución y nombre de las capas que tienen en Figma?». El
   orden y los nombres ya venían iguales; lo que se aplanaba era la
   anidación. Cada capa importada trae `ruta` («carpeta / subcarpeta»)
   y acá se vuelve árbol: carpetas plegables a cualquier profundidad, en
   el MISMO orden de z que el array (el caller decide si lo invierte para
   pintar frente arriba). Una carpeta partida en rachas (reordenaste en z
   una sola capa) son dos nodos con id distinto, como en filasDeCapas.
   Sin `ruta` (imports viejos) vale el subgrupo como carpeta de un nivel.
----------------------------------------------------------------------------- */

import type { Capa } from "@/lib/motion/modelo";

export type NodoArbol =
  | { tipo: "capa"; capa: Capa }
  | { tipo: "carpeta"; id: string; nombre: string; ruta: string; hijos: NodoArbol[] };

export const SEPARADOR_RUTA = " / ";

/** Los segmentos de carpeta de una capa: su `ruta`, o el subgrupo. */
export function carpetasDe(capa: Capa): string[] {
  if (capa.ruta) return capa.ruta.split(SEPARADOR_RUTA).filter(Boolean);
  const sub = capa.subgrupoNombre ?? capa.subgrupo;
  return sub ? [sub] : [];
}

/** Ids de todas las capas bajo un nodo (en orden). */
export function idsDelArbol(nodo: NodoArbol): string[] {
  if (nodo.tipo === "capa") return [nodo.capa.id];
  return nodo.hijos.flatMap(idsDelArbol);
}

export function contarCapas(nodo: NodoArbol): number {
  return nodo.tipo === "capa" ? 1 : nodo.hijos.reduce((n, h) => n + contarCapas(h), 0);
}

/**
 * Arma el árbol respetando el orden de `capas`: dos capas consecutivas con
 * el mismo prefijo de ruta comparten carpeta; cuando la ruta cambia, la
 * carpeta se cierra y una capa posterior con la misma ruta abre OTRA racha
 * (id con sufijo ·2) — así el z-order nunca miente en el panel.
 */
export function arbolDeCapas(capas: Capa[]): NodoArbol[] {
  const raiz: NodoArbol[] = [];
  const rachas = new Map<string, number>();
  // la pila de carpetas abiertas: [nivel] = { nodo, segmento }
  let pila: { nodo: Extract<NodoArbol, { tipo: "carpeta" }>; segmento: string }[] = [];

  for (const capa of capas) {
    const segmentos = carpetasDe(capa);
    // cuántos niveles de la pila siguen valiendo para esta capa
    let comunes = 0;
    while (comunes < pila.length && comunes < segmentos.length && pila[comunes].segmento === segmentos[comunes]) comunes++;
    pila = pila.slice(0, comunes);
    for (let nivel = comunes; nivel < segmentos.length; nivel++) {
      const ruta = segmentos.slice(0, nivel + 1).join(SEPARADOR_RUTA);
      const n = (rachas.get(ruta) ?? 0) + 1;
      rachas.set(ruta, n);
      const carpeta: Extract<NodoArbol, { tipo: "carpeta" }> = {
        tipo: "carpeta",
        id: n === 1 ? ruta : `${ruta}·${n}`,
        nombre: segmentos[nivel],
        ruta,
        hijos: [],
      };
      (pila.length ? pila[pila.length - 1].nodo.hijos : raiz).push(carpeta);
      pila.push({ nodo: carpeta, segmento: segmentos[nivel] });
    }
    (pila.length ? pila[pila.length - 1].nodo.hijos : raiz).push({ tipo: "capa", capa });
  }
  return raiz;
}

/** El padre inmediato de una capa en Figma (o null): para el estado que
    lee el director («en «div.card-info»») sin cargar la ruta entera. */
export function padreDe(capa: Capa): string | null {
  const segmentos = carpetasDe(capa);
  return segmentos.length ? segmentos[segmentos.length - 1] : null;
}
