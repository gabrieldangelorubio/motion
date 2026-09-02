/* -----------------------------------------------------------------------------
   LECTURA DE PANTALLA — la parte PURA

   Gabriel (2026-09-02): «siento que el director no sabe de qué se trata la
   imagen: agarra los layers y los anima escalonado sin entender el contexto.
   Cuando le subís el JSON tiene que poder VERLO como PNG y entender qué está
   animando: esto va primero porque está arriba, esta palabra va sola porque
   está en otro color, este botón carga como un botón.»

   Hasta acá el director recibía sólo la descripción textual de las capas y
   veía imágenes únicamente en la revisión visual (4 frames del render,
   DESPUÉS de animar). Acá se decide qué imágenes del DISEÑO EN REPOSO viajan
   con el pedido: una por pantalla (placa), a lo ancho legible, y las
   páginas largas en tramos verticales, con el texto que conecta cada imagen
   con el pantallaId y su caja en el lienzo. El render lo hace el editor
   (canvas); esto es testeable sin canvas.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";
import { escenasPorPantalla, type EscenaDePantalla } from "@/lib/motion/exportar-pantallas-puro";

/** Ancho máximo de cada imagen en px: legible para el modelo sin tilear de
    más (Gemini tilea a 768; Claude reduce por encima de 1568 en el lado
    largo — a 1024 de ancho un tramo de 2048 entra sin perder texto). */
export const ANCHO_MAX_LECTURA = 1024;
/** Alto máximo de cada tramo, en px de la IMAGEN (ya escalada). */
export const ALTO_TRAMO_LECTURA = 2048;
/** Tope de imágenes por pedido: cada una cuesta tokens en cada paso. */
export const MAX_IMAGENES_LECTURA = 6;

export type TramoDeLectura = {
  pantallaId: string;
  nombre: string;
  /** la escena de la pantalla (formato = placa, cámara fija, con la placa) */
  comp: Composicion;
  /** factor lienzo → imagen */
  escala: number;
  /** tramo vertical en px de la PANTALLA (no de la imagen) */
  yDesde: number;
  yHasta: number;
  /** índice del tramo dentro de su pantalla y cuántos tiene */
  indice: number;
  total: number;
  /** caja de la pantalla en el lienzo */
  caja: EscenaDePantalla["caja"];
};

/** El diseño EN REPOSO: sin entradas, salidas, pistas ni temblor. Lo que el
    usuario ve en Figma, no un frame cualquiera de la animación. */
export function sinAnimacion(comp: Composicion): Composicion {
  return {
    ...comp,
    capas: comp.capas.map((c) => {
      if (!c.entrada && !c.salida && !c.pistas) return c;
      const quieta = { ...c };
      delete quieta.entrada;
      delete quieta.salida;
      delete quieta.pistas;
      return quieta;
    }),
    camara: comp.camara ? { ...comp.camara, temblor: undefined } : comp.camara,
  };
}

/**
 * Qué imágenes armar para leer el diseño: una escena por placa (con su
 * fondo), escalada a ANCHO_MAX y partida en tramos de ALTO_TRAMO. Si hay más
 * tramos que el tope se recortan los últimos (las pantallas primeras y el
 * arranque de cada página pesan más que la cola). Sin placas: vacío — el
 * editor decide el fallback (el render de la cámara).
 */
export function planDeLectura(comp: Composicion): TramoDeLectura[] {
  const quieta = sinAnimacion(comp);
  const escenas = escenasPorPantalla(quieta, { conPlaca: true });
  const tramos: TramoDeLectura[] = [];
  for (const escena of escenas) {
    const escala = Math.min(1, ANCHO_MAX_LECTURA / escena.comp.ancho);
    const altoTramoPantalla = ALTO_TRAMO_LECTURA / escala;
    const total = Math.max(1, Math.ceil(escena.comp.alto / altoTramoPantalla));
    for (let i = 0; i < total; i++) {
      tramos.push({
        pantallaId: escena.pantallaId,
        nombre: escena.nombre,
        comp: escena.comp,
        escala,
        yDesde: Math.round(i * altoTramoPantalla),
        yHasta: Math.round(Math.min(escena.comp.alto, (i + 1) * altoTramoPantalla)),
        indice: i,
        total,
        caja: escena.caja,
      });
    }
  }
  return tramos.slice(0, MAX_IMAGENES_LECTURA);
}

const r = (v: number) => Math.round(v);

/**
 * El texto que acompaña a las imágenes: qué imagen es qué pantalla, con el
 * pantallaId (el mismo que da el estado en «PLACA de pantalla») y la caja
 * en el lienzo — así lo que el director VE lo puede conectar con las capas
 * que va a tocar y con el encuadre de cámara. `imagenesDespues` avisa cuántas
 * imágenes de REFERENCIA siguen a las de lectura, para que no las confunda.
 */
export function contextoDeLectura(tramos: TramoDeLectura[], imagenesDespues = 0): string {
  if (tramos.length === 0) return "";
  const lineas: string[] = [];
  let n = 1;
  const porPantalla = new Map<string, TramoDeLectura[]>();
  for (const t of tramos) {
    const lista = porPantalla.get(t.pantallaId) ?? [];
    lista.push(t);
    porPantalla.set(t.pantallaId, lista);
  }
  for (const [id, lista] of porPantalla) {
    const p = lista[0];
    const caja = `caja en el lienzo (${r(p.caja.x)}, ${r(p.caja.y)})–(${r(p.caja.x + p.caja.ancho)}, ${r(p.caja.y + p.caja.alto)}), ${r(p.caja.ancho)}×${r(p.caja.alto)}`;
    if (lista.length === 1 && p.total === 1) {
      lineas.push(`- imagen ${n}: pantalla «${p.nombre}» (pantallaId ${id}), ${caja}.`);
      n++;
    } else {
      const desde = n;
      const partes = lista.map((t) => {
        const linea = `imagen ${n} = y ${r(t.yDesde)}–${r(t.yHasta)} de la pantalla`;
        n++;
        return linea;
      });
      const faltan = p.total - lista.length;
      lineas.push(
        `- imágenes ${desde}-${n - 1}: pantalla «${p.nombre}» (pantallaId ${id}), ${caja}, página larga en ${p.total} tramos verticales de arriba a abajo: ${partes.join("; ")}${
          faltan > 0 ? ` (los últimos ${faltan} tramos no viajaron: el pie de la página queda fuera de la lectura)` : ""
        }.`,
      );
    }
  }
  return `PANTALLAS ADJUNTAS — el DISEÑO real que vas a animar, en reposo (sin animación), tal como lo ve el usuario. Las coordenadas de las cajas son las del estado (las capas de cada pantalla llevan «pantalla <pantallaId>»):
${lineas.join("\n")}${imagenesDespues > 0 ? `\nLas ${imagenesDespues} imágenes que siguen NO son el diseño: son la REFERENCIA ADJUNTA (ver su bloque).` : ""}
Leelas como motion grapher ANTES de tocar nada y escribí el GUION (regla LECTURA DE PANTALLA).`;
}
