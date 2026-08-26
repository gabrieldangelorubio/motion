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
    /** líneas RENDERIZADAS que el wrap de la caja produjo (la API no da los
        cortes: el plugin las estima por geometría y el editor re-envuelve) */
    lineasEstimadas?: number;
    /** tope de la TINTA renderizada (absoluteRenderBounds) en px del frame:
        el dato duro del anclaje vertical, independiente de métricas */
    tintaY?: number;
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
  /** textos cuyo salto de línea era wrap de la caja en Figma: el editor los
      re-envuelve al ancho de la caja (acá no se puede medir texto) */
  reajustes: ReajusteTexto[];
  /** tope de la caja de cada texto: el editor re-ancla la vertical midiendo
      las métricas reales de la fuente (acá sólo hay una aproximación) */
  anclas: AnclaTexto[];
};

export type ReajusteTexto = { capaId: string; anchoCaja: number; lineas: number };
export type AnclaTexto = { capaId: string; topCaja: number; tintaY?: number };

/**
 * Baseline de la primera línea desde el tope de la caja, con el modelo de
 * Figma: los glifos quedan CENTRADOS en la caja de línea. Con el ascenso y
 * descenso aproximados del sistema (0.8 / 0.25 del tamaño) queda
 * (interlineado − 1.05·tamaño)/2 + 0.8·tamaño. Sin interlineado conocido
 * degrada al 0.8·tamaño clásico. El editor la refina con métricas reales.
 */
export function baselineAproximada(tamano: number, interlineado?: number): number {
  if (interlineado === undefined) return tamano * 0.8;
  return (interlineado - tamano * 1.05) / 2 + tamano * 0.8;
}

export type MedirAncho = (texto: string) => number;

function envolverGreedy(palabras: string[], anchoMax: number, medir: MedirAncho): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (actual && medir(candidata) > anchoMax) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = candidata;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/**
 * Reconstruye el wrap que Figma hizo en su caja. Pura: la medición entra
 * como función. Primero prueba el ancho de la caja; si el conteo no coincide
 * con las líneas que Figma REALMENTE renderizó (las métricas de la fuente
 * medida pueden diferir de la real), busca por bisección el ancho más
 * angosto que produce exactamente ese conteo — el dato fuerte es el conteo,
 * no el ancho. Una palabra más ancha que la caja desborda, no se corta.
 */
export function envolverEnLineas(
  texto: string,
  anchoMax: number,
  medir: MedirAncho,
  lineasObjetivo?: number,
): string {
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length < 2) return texto;

  const porCaja = envolverGreedy(palabras, anchoMax, medir);
  const objetivo = Math.min(lineasObjetivo ?? 0, palabras.length);
  if (objetivo <= 1 || porCaja.length === objetivo) return porCaja.join("\n");

  let angosto = Math.max(...palabras.map(medir));
  let ancho = medir(palabras.join(" "));
  for (let i = 0; i < 30; i++) {
    const medio = (angosto + ancho) / 2;
    if (envolverGreedy(palabras, medio, medir).length > objetivo) angosto = medio;
    else ancho = medio;
  }
  return envolverGreedy(palabras, ancho, medir).join("\n");
}

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
  const reajustes: ReajusteTexto[] = [];
  const anclas: AnclaTexto[] = [];

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
      // El motor centra el bloque multilínea en el ancla: el ancla queda en
      // la baseline de la primera línea más media altura de bloque extra por
      // línea adicional. La baseline usa el modelo de centrado de Figma.
      const lineas = t.contenido.split("\n").length;
      const interlineado = t.interlineado ?? t.tamano * 1.15;
      if (lineas === 1 && (t.lineasEstimadas ?? 1) > 1) {
        // el quiebre era wrap de la caja: el editor lo reconstruye midiendo
        reajustes.push({ capaId: id, anchoCaja: nodo.ancho, lineas: t.lineasEstimadas! });
      }
      anclas.push({ capaId: id, topCaja: nodo.y, tintaY: t.tintaY });
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
        y: nodo.y + baselineAproximada(t.tamano, t.interlineado) + ((lineas - 1) / 2) * interlineado,
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
    reajustes,
    anclas,
  };
}
