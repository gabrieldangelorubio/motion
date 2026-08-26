/* -----------------------------------------------------------------------------
   Biblioteca de efectos — el catálogo de presets con su plantilla de preview

   Cada preset se muestra en la biblioteca con una MINI composición de
   demostración que corre por el motor real (estadoEn + pintar): el preview
   es exactamente lo que el efecto hace, nunca un video grabado que
   envejece. Los presets de trazo (trim) demuestran sobre una línea zigzag
   de largo conocido (calculado acá, sin DOM); el resto, sobre un título
   dividido por caracteres con escalonado.
----------------------------------------------------------------------------- */

import type { CapaTexto, CapaTrazo, Composicion, Segmento } from "@/lib/motion/modelo";
import { CATEGORIAS, PRESETS, type CategoriaPreset } from "@/lib/motion/presets-puro";

export type EfectoBiblioteca = {
  nombre: string;
  clase: "entrada" | "salida";
  categoria: CategoriaPreset;
  /** anima el trim del trazo: sólo aplica a capas tipo trazo */
  esDeTrazo: boolean;
};

export function efectosDeBiblioteca(): EfectoBiblioteca[] {
  return Object.entries(PRESETS).map(([nombre, def]) => {
    const compilado = def.compilar({});
    return {
      nombre,
      clase: def.clase,
      categoria: def.categoria,
      esDeTrazo: !!(compilado.pista.dTrazoInicio || compilado.pista.dTrazoFin),
    };
  });
}

/** Los efectos por categoría, en el orden canónico (entradas antes que salidas). */
export function efectosPorCategoria(): { categoria: (typeof CATEGORIAS)[number]; efectos: EfectoBiblioteca[] }[] {
  const todos = efectosDeBiblioteca();
  return CATEGORIAS.map((categoria) => ({
    categoria,
    efectos: todos
      .filter((e) => e.categoria === categoria.id)
      .sort((a, b) => (a.clase === b.clase ? 0 : a.clase === "entrada" ? -1 : 1)),
  })).filter((seccion) => seccion.efectos.length > 0);
}

/** En qué instante del bucle la plantilla está EN REPOSO (la carta quieta). */
export function reposoDeEfecto(clase: "entrada" | "salida"): number {
  return clase === "entrada" ? 1500 : 250;
}

const PATH_ZIGZAG = "M 20 130 L 120 40 L 220 130 L 320 40 L 420 130";
const LARGO_ZIGZAG = 4 * Math.hypot(100, 90);

/** Composición chica (480×270, bucle de 1.9 s) que demuestra el efecto. */
export function plantillaDeEfecto(nombre: string): Composicion {
  const def = PRESETS[nombre];
  const clase = def?.clase ?? "entrada";
  const esDeTrazo = def
    ? !!(def.compilar({}).pista.dTrazoInicio || def.compilar({}).pista.dTrazoFin)
    : false;

  const segmento: Segmento = clase === "entrada"
    ? { preset: nombre, en: 250, duracion: 800, easing: "salidaExpo", escalonado: esDeTrazo ? undefined : 40 }
    : { preset: nombre, en: 700, duracion: 700, easing: "entradaCubic", escalonado: esDeTrazo ? undefined : 30 };

  const capa: CapaTexto | CapaTrazo = esDeTrazo
    ? {
        id: "linea",
        nombre: "Línea",
        tipo: "trazo",
        path: PATH_ZIGZAG,
        ancho: 440,
        alto: 170,
        color: "#8891ff",
        grosor: 7,
        largo: LARGO_ZIGZAG,
        remate: "redondo",
        x: 240,
        y: 135,
        [clase]: segmento,
      }
    : {
        id: "titulo",
        nombre: "Título",
        tipo: "texto",
        texto: "Motion",
        fuente: { familia: "-apple-system, 'Segoe UI', Roboto, sans-serif", tamano: 72, peso: 800, interletrado: -1 },
        color: "#e8e8ee",
        division: "caracteres",
        alineacion: "centro",
        x: 240,
        y: 158,
        motionBlur: 0.7,
        [clase]: segmento,
      };

  return {
    version: 1,
    nombre: `fx-${nombre}`,
    ancho: 480,
    alto: 270,
    fps: 30,
    duracion: 1900,
    fondo: "#101016",
    capas: [capa],
  };
}
