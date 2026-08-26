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
  /** progreso 0–1 del segmento → valor OFFSET (dx, dy, dEscala, dOpacidad, desenfoque px, dTrazo 0–1) */
  [k in "dx" | "dy" | "dEscala" | "dOpacidad" | "desenfoque" | "dTrazoInicio" | "dTrazoFin"]?: { p: number; v: number }[];
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
};

type DefPreset = {
  clase: "entrada" | "salida";
  compilar: (params: Record<string, number>) => PresetCompilado;
};

const d = (params: Record<string, number>, clave: string, def: number) =>
  params[clave] === undefined ? def : params[clave];

export const PRESETS: Record<string, DefPreset> = {
  aparecer: {
    clase: "entrada",
    compilar: () => ({
      pista: { dOpacidad: [{ p: 0, v: -1 }, { p: 1, v: 0 }] },
      eje: null,
      distancia: 0,
    }),
  },
  subir: {
    clase: "entrada",
    compilar: (params) => {
      const dist = d(params, "distancia", 90);
      return {
        pista: {
          dy: [{ p: 0, v: dist }, { p: 1, v: 0 }],
          dOpacidad: [{ p: 0, v: -1 }, { p: 1, v: 0 }],
        },
        eje: "y",
        distancia: dist,
      };
    },
  },
  caer: {
    clase: "entrada",
    compilar: (params) => {
      const dist = d(params, "distancia", 90);
      return {
        pista: {
          dy: [{ p: 0, v: -dist }, { p: 1, v: 0 }],
          dOpacidad: [{ p: 0, v: -1 }, { p: 1, v: 0 }],
        },
        eje: "y",
        distancia: dist,
      };
    },
  },
  deslizarIzquierda: {
    clase: "entrada",
    compilar: (params) => {
      const dist = d(params, "distancia", 120);
      return {
        pista: {
          dx: [{ p: 0, v: dist }, { p: 1, v: 0 }],
          dOpacidad: [{ p: 0, v: -1 }, { p: 1, v: 0 }],
        },
        eje: "x",
        distancia: dist,
      };
    },
  },
  escalar: {
    clase: "entrada",
    compilar: (params) => {
      const desde = d(params, "desde", 0.6);
      return {
        pista: {
          dEscala: [{ p: 0, v: desde - 1 }, { p: 1, v: 0 }],
          dOpacidad: [{ p: 0, v: -1 }, { p: 1, v: 0 }],
        },
        eje: null,
        distancia: 40,
      };
    },
  },
  subirDesenfocado: {
    clase: "entrada",
    compilar: (params) => {
      const dist = d(params, "distancia", 70);
      const blur = d(params, "desenfoque", 14);
      return {
        pista: {
          dy: [{ p: 0, v: dist }, { p: 1, v: 0 }],
          dOpacidad: [{ p: 0, v: -1 }, { p: 1, v: 0 }],
          desenfoque: [{ p: 0, v: blur }, { p: 1, v: 0 }],
        },
        eje: "y",
        distancia: dist,
        desenfoquePropio: true,
      };
    },
  },
  revelar: {
    clase: "entrada",
    // el clásico reveal enmascarado: la unidad sube DENTRO de su caja de línea
    compilar: (params) => ({
      pista: { dy: [{ p: 0, v: d(params, "distancia", 1.1) }, { p: 1, v: 0 }] },
      eje: "y",
      distancia: 0, // el recorte da corte seco: sin blur sintetizado encima
      recorte: true,
      relativo: true,
    }),
  },
  trazar: {
    clase: "entrada",
    // trim path estilo AE: la línea se dibuja de 0 al 100 %
    compilar: () => ({
      pista: { dTrazoFin: [{ p: 0, v: -1 }, { p: 1, v: 0 }] },
      eje: null,
      distancia: 0,
    }),
  },
  desvanecer: {
    clase: "salida",
    compilar: () => ({
      pista: { dOpacidad: [{ p: 0, v: 0 }, { p: 1, v: -1 }] },
      eje: null,
      distancia: 0,
    }),
  },
  hundir: {
    clase: "salida",
    compilar: (params) => {
      const dist = d(params, "distancia", 70);
      return {
        pista: {
          dy: [{ p: 0, v: 0 }, { p: 1, v: dist }],
          dOpacidad: [{ p: 0, v: 0 }, { p: 1, v: -1 }],
        },
        eje: "y",
        distancia: dist,
      };
    },
  },
  elevarDesenfocado: {
    clase: "salida",
    compilar: (params) => {
      const dist = d(params, "distancia", 60);
      const blur = d(params, "desenfoque", 12);
      return {
        pista: {
          dy: [{ p: 0, v: 0 }, { p: 1, v: -dist }],
          dOpacidad: [{ p: 0, v: 0 }, { p: 1, v: -1 }],
          desenfoque: [{ p: 0, v: 0 }, { p: 1, v: blur }],
        },
        eje: "y",
        distancia: dist,
        desenfoquePropio: true,
      };
    },
  },
  ocultar: {
    clase: "salida",
    compilar: (params) => ({
      pista: { dy: [{ p: 0, v: 0 }, { p: 1, v: d(params, "distancia", 1.1) }] },
      eje: "y",
      distancia: 0,
      recorte: true,
      relativo: true,
    }),
  },
  retraer: {
    clase: "salida",
    // la línea se des-dibuja retrocediendo desde el final
    compilar: () => ({
      pista: { dTrazoFin: [{ p: 0, v: 0 }, { p: 1, v: -1 }] },
      eje: null,
      distancia: 0,
    }),
  },
  borrar: {
    clase: "salida",
    // la línea se borra avanzando desde el inicio
    compilar: () => ({
      pista: { dTrazoInicio: [{ p: 0, v: 0 }, { p: 1, v: 1 }] },
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
