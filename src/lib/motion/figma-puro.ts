/* -----------------------------------------------------------------------------
   Normalización Figma → capas del módulo

   El plugin (figma-plugin/) hace la mitad del trabajo DENTRO de Figma, donde
   la API es rica: aplana estilos, resuelve transforms y rasteriza lo que no
   se puede expresar (research: degradación por-nodo, nunca all-or-nothing).
   Emite un IR propio y chico — este archivo mapea ese IR al scene graph.

   Reglas del research que se aplican acá:
   - texto → capa de texto real (la mayor ganancia de fidelidad);
   - rects/elipses con fill sólido → formas nativas;
   - todo lo demás llega rasterizado como imagen (dataUri) con su aviso;
   - los avisos de conversión son datos visibles, no silencio.
----------------------------------------------------------------------------- */

import { MEZCLAS, type Capa, type Composicion, type MezclaCapa } from "@/lib/motion/modelo";

export type NodoFigma = {
  tipo: "texto" | "rect" | "elipse" | "imagen" | "trazo";
  nombre: string;
  /** top-left en px del frame */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  opacidad?: number;
  /** modo de mezcla en términos de canvas (el plugin ya mapeó el enum de Figma) */
  mezcla?: string;
  /** grados; el plugin ya avisa si venía rotado y lo rasterizó */
  texto?: {
    contenido: string;
    familia: string;
    peso: number;
    tamano: number;
    interletrado?: number;
    /** lineHeight en px si Figma lo tenía en px; ausente = tamano × 1.15 */
    interlineado?: number;
    alineacion: "izquierda" | "centro" | "derecha";
    color: string;
  };
  forma?: { color: string; radio?: number };
  imagen?: { dataUri: string };
  /** vector con stroke y sin fill: candidato a animarse con trim (trazar/retraer) */
  trazo?: { path: string; color: string; grosor: number; remate?: "redondo" | "recto" };
  aviso?: string;
};

export type ImportFigma = {
  origen: "figma";
  version: 1;
  frame: { nombre: string; ancho: number; alto: number; fondo: string };
  nodos: NodoFigma[];
};

export type ResultadoImport = {
  composicion: Composicion;
  avisos: string[];
};

const sanitizarId = (nombre: string, indice: number) =>
  `fig-${indice}-${nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "capa"}`;

export function validarImportFigma(datos: unknown): datos is ImportFigma {
  const d = datos as ImportFigma;
  return (
    typeof d === "object" && d !== null && d.origen === "figma" && d.version === 1 &&
    typeof d.frame === "object" && Array.isArray(d.nodos)
  );
}

/**
 * IR de Figma → composición nueva del tamaño del frame, con las capas
 * estáticas en su lugar (el orden del IR es el z-order: primero = fondo).
 * La animación la ponen después el usuario o el agente.
 */
export function normalizarFigma(datos: ImportFigma, fps = 30, duracion = 5000): ResultadoImport {
  const avisos: string[] = [];
  const capas: Capa[] = [];

  datos.nodos.forEach((nodo, i) => {
    if (nodo.aviso) avisos.push(`«${nodo.nombre}»: ${nodo.aviso}`);
    const id = sanitizarId(nodo.nombre, i);
    let mezcla: MezclaCapa | undefined;
    if (nodo.mezcla) {
      if ((MEZCLAS as string[]).includes(nodo.mezcla)) mezcla = nodo.mezcla as MezclaCapa;
      else avisos.push(`«${nodo.nombre}»: modo de mezcla «${nodo.mezcla}» desconocido — quedó normal`);
    }
    const base = {
      id,
      nombre: nodo.nombre,
      opacidad: nodo.opacidad,
      mezcla,
      v: i,
    };

    if (nodo.tipo === "texto" && nodo.texto) {
      const t = nodo.texto;
      // nuestro ancla de texto: izquierda = borde izquierdo, centro = medio, derecha = borde derecho
      const x =
        t.alineacion === "izquierda" ? nodo.x :
        t.alineacion === "derecha" ? nodo.x + nodo.ancho :
        nodo.x + nodo.ancho / 2;
      // El motor centra el bloque multilínea en el ancla: la baseline de la
      // primera línea queda aprox a 0.8 del tamaño desde el tope de la caja,
      // así que el ancla baja media altura de bloque extra por línea adicional.
      const lineas = t.contenido.split("\n").length;
      const interlineado = t.interlineado ?? t.tamano * 1.15;
      capas.push({
        ...base,
        tipo: "texto",
        texto: t.contenido,
        fuente: {
          familia: `'${t.familia}', -apple-system, 'Segoe UI', Roboto, sans-serif`,
          tamano: t.tamano,
          peso: t.peso,
          interletrado: t.interletrado,
          interlineado: t.interlineado,
        },
        color: t.color,
        division: "ninguna",
        alineacion: t.alineacion,
        x,
        y: nodo.y + t.tamano * 0.8 + ((lineas - 1) / 2) * interlineado,
      });
      return;
    }

    if (nodo.tipo === "trazo" && nodo.trazo) {
      capas.push({
        ...base,
        tipo: "trazo",
        path: nodo.trazo.path,
        ancho: nodo.ancho,
        alto: nodo.alto,
        color: nodo.trazo.color,
        grosor: nodo.trazo.grosor,
        remate: nodo.trazo.remate,
        // el largo real lo mide el editor al importar (necesita el DOM de SVG);
        // 0 = «sin medir»: pintar degrada a trazo completo, nunca rompe
        largo: 0,
        x: nodo.x + nodo.ancho / 2,
        y: nodo.y + nodo.alto / 2,
      });
      return;
    }

    if ((nodo.tipo === "rect" || nodo.tipo === "elipse") && nodo.forma) {
      capas.push({
        ...base,
        tipo: "forma",
        forma: nodo.tipo === "rect" ? "rectangulo" : "elipse",
        ancho: nodo.ancho,
        alto: nodo.alto,
        color: nodo.forma.color,
        radio: nodo.forma.radio,
        x: nodo.x + nodo.ancho / 2,
        y: nodo.y + nodo.alto / 2,
      });
      return;
    }

    if (nodo.tipo === "imagen" && nodo.imagen) {
      capas.push({
        ...base,
        tipo: "media",
        mediaId: nodo.imagen.dataUri,
        ancho: nodo.ancho,
        alto: nodo.alto,
        ajuste: "cubrir",
        x: nodo.x + nodo.ancho / 2,
        y: nodo.y + nodo.alto / 2,
      });
      return;
    }

    avisos.push(`«${nodo.nombre}»: tipo desconocido «${nodo.tipo}» — capa salteada`);
  });

  return {
    composicion: {
      version: 1,
      nombre: datos.frame.nombre,
      ancho: Math.round(datos.frame.ancho),
      alto: Math.round(datos.frame.alto),
      fps,
      duracion,
      fondo: datos.frame.fondo,
      capas,
    },
    avisos,
  };
}
