/* -----------------------------------------------------------------------------
   Presets de entrada/salida — el vocabulario que se le muestra al usuario

   Un preset COMPILA a pistas de keyframes relativas (offset respecto del
   estado base de la capa): «presets encima, tracks debajo». Contrato de
   identidad: una entrada termina en offset cero / opacidad 1; una salida
   parte de ahí. Así cualquier entrada combina con cualquier salida.
   `eje` y `distancia` son metadata para el motion blur direccional.
----------------------------------------------------------------------------- */

import type { Segmento } from "@/lib/motion/modelo";

export type PistaRelativa = {
  /** progreso 0–1 del segmento → valor OFFSET (dx, dy, dEscala, dOpacidad, desenfoque px, dRotacion grados, dTrazo 0–1) */
  [k in "dx" | "dy" | "dEscala" | "dOpacidad" | "desenfoque" | "dRotacion" | "dTrazoInicio" | "dTrazoFin"]?: { p: number; v: number }[];
};

export type PresetCompilado = {
  pista: PistaRelativa;
  eje: "x" | "y" | null;
  distancia: number;
  /** el preset anima desenfoque propio: el blur sintetizado no se superpone */
  desenfoquePropio?: boolean;
  /** la unidad se pinta RECORTADA a su caja de reposo (revelado con máscara) */
  recorte?: boolean;
  /** los dy del preset son múltiplos del alto de la unidad (para revelados de texto) */
  relativo?: boolean;
  /** los dx son POR ÍNDICE desde el centro (tracking: las letras convergen/divergen) */
  tracking?: boolean;
};

/** Categorías de la biblioteca; el orden acá es el orden en que se muestran. */
export type CategoriaPreset =
  | "mascaras" | "texto" | "desenfoque" | "rotacion" | "tracking" | "energia" | "grafica" | "trazos";

export const CATEGORIAS: { id: CategoriaPreset; nombre: string }[] = [
  { id: "mascaras", nombre: "Máscaras y revelados" },
  { id: "texto", nombre: "Texto" },
  { id: "desenfoque", nombre: "Desenfoque" },
  { id: "rotacion", nombre: "Rotación" },
  { id: "tracking", nombre: "Tracking" },
  { id: "energia", nombre: "Impacto y rebote" },
  { id: "grafica", nombre: "Logos y gráficas" },
  { id: "trazos", nombre: "Trazos" },
];

type DefPreset = {
  clase: "entrada" | "salida";
  categoria: CategoriaPreset;
  compilar: (params: Record<string, number>) => PresetCompilado;
};

const d = (params: Record<string, number>, clave: string, def: number) =>
  params[clave] === undefined ? def : params[clave];

/** progreso→offset lineal de dos puntos, el tramo típico de un preset */
const tramo = (desde: number, hasta: number) => [{ p: 0, v: desde }, { p: 1, v: hasta }];
const APARECE = tramo(-1, 0);
const DESAPARECE = tramo(0, -1);

export const PRESETS: Record<string, DefPreset> = {
  /* ——— Máscaras y revelados: la unidad se mueve DENTRO de su caja de línea ——— */
  revelar: {
    clase: "entrada",
    categoria: "mascaras",
    compilar: (params) => ({
      pista: { dy: tramo(d(params, "distancia", 1.1), 0) },
      eje: "y",
      distancia: 0, // el recorte da corte seco: sin blur sintetizado encima
      recorte: true,
      relativo: true,
    }),
  },
  revelarCaer: {
    clase: "entrada",
    categoria: "mascaras",
    compilar: (params) => ({
      pista: { dy: tramo(-d(params, "distancia", 1.1), 0) },
      eje: "y",
      distancia: 0,
      recorte: true,
      relativo: true,
    }),
  },
  ocultar: {
    clase: "salida",
    categoria: "mascaras",
    compilar: (params) => ({
      pista: { dy: tramo(0, d(params, "distancia", 1.1)) },
      eje: "y",
      distancia: 0,
      recorte: true,
      relativo: true,
    }),
  },
  ocultarSubir: {
    clase: "salida",
    categoria: "mascaras",
    compilar: (params) => ({
      pista: { dy: tramo(0, -d(params, "distancia", 1.1)) },
      eje: "y",
      distancia: 0,
      recorte: true,
      relativo: true,
    }),
  },

  /* ——— Texto · básicos ——— */
  aparecer: {
    clase: "entrada",
    categoria: "texto",
    compilar: () => ({ pista: { dOpacidad: APARECE }, eje: null, distancia: 0 }),
  },
  subir: {
    clase: "entrada",
    categoria: "texto",
    compilar: (params) => {
      const dist = d(params, "distancia", 90);
      return { pista: { dy: tramo(dist, 0), dOpacidad: APARECE }, eje: "y", distancia: dist };
    },
  },
  caer: {
    clase: "entrada",
    categoria: "texto",
    compilar: (params) => {
      const dist = d(params, "distancia", 90);
      return { pista: { dy: tramo(-dist, 0), dOpacidad: APARECE }, eje: "y", distancia: dist };
    },
  },
  deslizarIzquierda: {
    clase: "entrada",
    categoria: "texto",
    compilar: (params) => {
      const dist = d(params, "distancia", 120);
      return { pista: { dx: tramo(dist, 0), dOpacidad: APARECE }, eje: "x", distancia: dist };
    },
  },
  deslizarDerecha: {
    clase: "entrada",
    categoria: "texto",
    compilar: (params) => {
      const dist = d(params, "distancia", 120);
      return { pista: { dx: tramo(-dist, 0), dOpacidad: APARECE }, eje: "x", distancia: dist };
    },
  },
  escalar: {
    clase: "entrada",
    categoria: "texto",
    compilar: (params) => ({
      pista: { dEscala: tramo(d(params, "desde", 0.6) - 1, 0), dOpacidad: APARECE },
      eje: null,
      distancia: 40,
    }),
  },
  desvanecer: {
    clase: "salida",
    categoria: "texto",
    compilar: () => ({ pista: { dOpacidad: DESAPARECE }, eje: null, distancia: 0 }),
  },
  hundir: {
    clase: "salida",
    categoria: "texto",
    compilar: (params) => {
      const dist = d(params, "distancia", 70);
      return { pista: { dy: tramo(0, dist), dOpacidad: DESAPARECE }, eje: "y", distancia: dist };
    },
  },
  elevar: {
    clase: "salida",
    categoria: "texto",
    compilar: (params) => {
      const dist = d(params, "distancia", 70);
      return { pista: { dy: tramo(0, -dist), dOpacidad: DESAPARECE }, eje: "y", distancia: dist };
    },
  },
  deslizarFuera: {
    clase: "salida",
    categoria: "texto",
    compilar: (params) => {
      const dist = d(params, "distancia", 120);
      return { pista: { dx: tramo(0, -dist), dOpacidad: DESAPARECE }, eje: "x", distancia: dist };
    },
  },

  /* ——— Desenfoque ——— */
  subirDesenfocado: {
    clase: "entrada",
    categoria: "desenfoque",
    compilar: (params) => {
      const dist = d(params, "distancia", 70);
      return {
        pista: {
          dy: tramo(dist, 0),
          dOpacidad: APARECE,
          desenfoque: tramo(d(params, "desenfoque", 14), 0),
        },
        eje: "y",
        distancia: dist,
        desenfoquePropio: true,
      };
    },
  },
  desenfocarEntrada: {
    clase: "entrada",
    categoria: "desenfoque",
    compilar: (params) => ({
      pista: { desenfoque: tramo(d(params, "desenfoque", 24), 0), dOpacidad: APARECE },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },
  acercarDesenfocado: {
    clase: "entrada",
    categoria: "desenfoque",
    compilar: (params) => ({
      pista: {
        dEscala: tramo(d(params, "desde", 0.55) - 1, 0),
        desenfoque: tramo(d(params, "desenfoque", 18), 0),
        dOpacidad: APARECE,
      },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },
  elevarDesenfocado: {
    clase: "salida",
    categoria: "desenfoque",
    compilar: (params) => {
      const dist = d(params, "distancia", 60);
      return {
        pista: {
          dy: tramo(0, -dist),
          dOpacidad: DESAPARECE,
          desenfoque: tramo(0, d(params, "desenfoque", 12)),
        },
        eje: "y",
        distancia: dist,
        desenfoquePropio: true,
      };
    },
  },
  desenfocarSalida: {
    clase: "salida",
    categoria: "desenfoque",
    compilar: (params) => ({
      pista: { desenfoque: tramo(0, d(params, "desenfoque", 20)), dOpacidad: DESAPARECE },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },

  /* ——— Rotación (por unidad, alrededor de su centro) ——— */
  girarEntrada: {
    clase: "entrada",
    categoria: "rotacion",
    compilar: (params) => {
      const dist = d(params, "distancia", 40);
      return {
        pista: {
          dRotacion: tramo(d(params, "angulo", -14), 0),
          dy: tramo(dist, 0),
          dOpacidad: APARECE,
        },
        eje: "y",
        distancia: dist,
      };
    },
  },
  voltear: {
    clase: "entrada",
    categoria: "rotacion",
    compilar: (params) => ({
      pista: {
        dRotacion: tramo(d(params, "angulo", 90), 0),
        dy: tramo(d(params, "distancia", 30), 0),
        dOpacidad: APARECE,
      },
      eje: "y",
      distancia: d(params, "distancia", 30),
    }),
  },
  remolino: {
    clase: "entrada",
    categoria: "rotacion",
    compilar: (params) => ({
      pista: {
        dRotacion: tramo(d(params, "angulo", -180), 0),
        dEscala: tramo(-0.7, 0),
        dOpacidad: APARECE,
      },
      eje: null,
      distancia: 30,
    }),
  },
  girarSalida: {
    clase: "salida",
    categoria: "rotacion",
    compilar: (params) => {
      const dist = d(params, "distancia", 30);
      return {
        pista: {
          dRotacion: tramo(0, d(params, "angulo", 14)),
          dy: tramo(0, -dist),
          dOpacidad: DESAPARECE,
        },
        eje: "y",
        distancia: dist,
      };
    },
  },
  voltearCaer: {
    clase: "salida",
    categoria: "rotacion",
    compilar: (params) => ({
      pista: {
        dRotacion: tramo(0, d(params, "angulo", -90)),
        dy: tramo(0, d(params, "distancia", 40)),
        dOpacidad: DESAPARECE,
      },
      eje: "y",
      distancia: d(params, "distancia", 40),
    }),
  },

  /* ——— Tracking: las unidades convergen/divergen desde el centro ——— */
  trackingCerrar: {
    clase: "entrada",
    categoria: "tracking",
    compilar: (params) => ({
      pista: { dx: tramo(d(params, "apertura", 34), 0), dOpacidad: APARECE },
      eje: "x",
      distancia: 0,
      tracking: true,
    }),
  },
  trackingAbrir: {
    clase: "entrada",
    categoria: "tracking",
    compilar: (params) => ({
      pista: { dx: tramo(-d(params, "apertura", 22), 0), dOpacidad: APARECE },
      eje: "x",
      distancia: 0,
      tracking: true,
    }),
  },
  trackingFuga: {
    clase: "salida",
    categoria: "tracking",
    compilar: (params) => ({
      pista: { dx: tramo(0, d(params, "apertura", 50)), dOpacidad: DESAPARECE },
      eje: "x",
      distancia: 0,
      tracking: true,
    }),
  },

  /* ——— Impacto y rebote: el overshoot vive EN la pista, no en el easing ——— */
  pop: {
    clase: "entrada",
    categoria: "energia",
    compilar: () => ({
      pista: {
        dEscala: [{ p: 0, v: -1 }, { p: 0.7, v: 0.09 }, { p: 1, v: 0 }],
        dOpacidad: [{ p: 0, v: -1 }, { p: 0.35, v: 0 }],
      },
      eje: null,
      distancia: 30,
    }),
  },
  rebotar: {
    clase: "entrada",
    categoria: "energia",
    compilar: (params) => {
      const dist = d(params, "distancia", 130);
      return {
        pista: {
          dy: [{ p: 0, v: -dist }, { p: 0.62, v: 0 }, { p: 0.8, v: -dist * 0.18 }, { p: 1, v: 0 }],
          dOpacidad: [{ p: 0, v: -1 }, { p: 0.3, v: 0 }],
        },
        eje: "y",
        distancia: dist,
      };
    },
  },
  golpe: {
    clase: "entrada",
    categoria: "energia",
    compilar: (params) => ({
      pista: {
        dEscala: tramo(d(params, "desde", 1.35) - 1, 0),
        desenfoque: tramo(d(params, "desenfoque", 16), 0),
        dOpacidad: APARECE,
      },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },
  contraer: {
    clase: "salida",
    categoria: "energia",
    compilar: () => ({
      pista: { dEscala: tramo(0, -1), dOpacidad: [{ p: 0.4, v: 0 }, { p: 1, v: -1 }] },
      eje: null,
      distancia: 30,
    }),
  },
  expulsar: {
    clase: "salida",
    categoria: "energia",
    compilar: (params) => {
      const dist = d(params, "distancia", 150);
      return {
        pista: { dy: tramo(0, -dist), dOpacidad: [{ p: 0.3, v: 0 }, { p: 1, v: -1 }] },
        eje: "y",
        distancia: dist,
      };
    },
  },

  /* ——— Logos y gráficas ——— */
  acercarProfundo: {
    clase: "entrada",
    categoria: "grafica",
    compilar: (params) => ({
      pista: {
        dEscala: tramo(d(params, "desde", 0.2) - 1, 0),
        desenfoque: tramo(d(params, "desenfoque", 20), 0),
        dOpacidad: APARECE,
      },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },
  atravesar: {
    clase: "entrada",
    categoria: "grafica",
    compilar: (params) => ({
      pista: {
        dEscala: tramo(d(params, "desde", 2.2) - 1, 0),
        desenfoque: tramo(d(params, "desenfoque", 14), 0),
        dOpacidad: APARECE,
      },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },
  aparecerGirando: {
    clase: "entrada",
    categoria: "grafica",
    compilar: (params) => ({
      pista: {
        dRotacion: tramo(d(params, "angulo", -8), 0),
        dEscala: tramo(-0.15, 0),
        dOpacidad: APARECE,
      },
      eje: null,
      distancia: 20,
    }),
  },
  alejarFondo: {
    clase: "salida",
    categoria: "grafica",
    compilar: (params) => ({
      pista: {
        dEscala: tramo(0, -d(params, "hasta", 0.6)),
        desenfoque: tramo(0, d(params, "desenfoque", 12)),
        dOpacidad: DESAPARECE,
      },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },
  acercarCamara: {
    clase: "salida",
    categoria: "grafica",
    compilar: (params) => ({
      pista: {
        dEscala: tramo(0, d(params, "hasta", 1.6)),
        desenfoque: tramo(0, d(params, "desenfoque", 10)),
        dOpacidad: [{ p: 0.35, v: 0 }, { p: 1, v: -1 }],
      },
      eje: null,
      distancia: 0,
      desenfoquePropio: true,
    }),
  },

  /* ——— Trazos (trim estilo AE) ——— */
  trazar: {
    clase: "entrada",
    categoria: "trazos",
    compilar: () => ({ pista: { dTrazoFin: tramo(-1, 0) }, eje: null, distancia: 0 }),
  },
  trazarCentro: {
    clase: "entrada",
    categoria: "trazos",
    // la línea nace desde el medio hacia las dos puntas
    compilar: () => ({
      pista: { dTrazoInicio: tramo(0.5, 0), dTrazoFin: tramo(-0.5, 0) },
      eje: null,
      distancia: 0,
    }),
  },
  retraer: {
    clase: "salida",
    categoria: "trazos",
    compilar: () => ({ pista: { dTrazoFin: tramo(0, -1) }, eje: null, distancia: 0 }),
  },
  borrar: {
    clase: "salida",
    categoria: "trazos",
    compilar: () => ({ pista: { dTrazoInicio: tramo(0, 1) }, eje: null, distancia: 0 }),
  },
  recogerCentro: {
    clase: "salida",
    categoria: "trazos",
    // la línea se recoge hacia el medio desde las dos puntas
    compilar: () => ({
      pista: { dTrazoInicio: tramo(0, 0.5), dTrazoFin: tramo(0, -0.5) },
      eje: null,
      distancia: 0,
    }),
  },
};

export function compilarSegmento(seg: Segmento): PresetCompilado {
  const def = PRESETS[seg.preset];
  // Degradar, no romper (§2.8 del kit): un preset que este build no conoce
  // (otra sesión guardó uno más nuevo) se vuelve un fade, nunca un throw.
  if (!def) return PRESETS.aparecer.compilar({});
  return def.compilar(seg.params ?? {});
}

export function nombresPresets(clase: "entrada" | "salida"): string[] {
  return Object.keys(PRESETS).filter((k) => PRESETS[k].clase === clase);
}

/** Escalonado por defecto (ms entre unidades) al activar una división que no
    trae escalonado propio: sin esto la división no se VE — todas las unidades
    arrancan a la vez y el texto entra como un bloque entero. Un escalonado
    puesto a mano (incluso 0 explícito) siempre manda sobre este default. */
export function escalonadoSano(division: "ninguna" | "caracteres" | "palabras" | "lineas"): number {
  if (division === "caracteres") return 35;
  if (division === "palabras") return 90;
  if (division === "lineas") return 140;
  return 0;
}
