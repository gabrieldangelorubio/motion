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
  tipo: "texto" | "rect" | "elipse" | "imagen" | "trazo" | "vector";
  nombre: string;
  /** top-left en px del frame */
  x: number;
  y: number;
  ancho: number;
  alto: number;
  opacidad?: number;
  /** modo de mezcla en términos de canvas (el plugin ya mapeó el enum de Figma) */
  mezcla?: string;
  /** rotación en grados HORARIOS (el plugin ya invirtió el signo de Figma):
      solo la traen los vectores rotados — el path viaja sin rotar y la capa
      rota alrededor de su centro, igual que el motor y AE */
  rotacion?: number;
  /** grados; el plugin ya avisa si venía rotado y lo rasterizó */
  texto?: {
    contenido: string;
    familia: string;
    /** el estilo exacto de la cara en la fuente («Bold», «Condensed Heavy») */
    estilo?: string;
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
    /** corridas de estilo distintas al dominante (rich text): índices sobre
        los caracteres NO BLANCOS del contenido — sobreviven al re-wrap */
    tramos?: { desde: number; hasta: number; familia?: string; peso?: number; tamano?: number; color?: string }[];
  };
  forma?: { color: string; radio?: number };
  imagen?: { dataUri: string };
  /** vector con stroke y sin fill: candidato a animarse con trim (trazar/retraer) */
  trazo?: { path: string; color: string; grosor: number; remate?: "redondo" | "recto" };
  /** vector REAL (estrella, polígono, path, boolean combinada): el path SVG
      viaja tal cual — el motor lo pinta con Path2D y AE lo recibe editable */
  vector?: {
    path: string;
    relleno?: string;
    reglaRelleno?: "nonzero" | "evenodd";
    trazoColor?: string;
    trazoGrosor?: number;
    remate?: "redondo" | "recto";
  };
  /** nombre del grupo de Figma que contenía este nodo (el más externo
      debajo del frame): el editor lo pliega y AE lo precompone */
  subgrupo?: string;
  aviso?: string;
};

export type ImportFigma = {
  origen: "figma";
  version: 1;
  /** x/y = posición absoluta del frame en el canvas de Figma: al importar un
      lote, las pantallas conservan su disposición relativa */
  frame: { nombre: string; ancho: number; alto: number; fondo: string; x?: number; y?: number };
  nodos: NodoFigma[];
};

/** Varios frames exportados juntos: entran todos al lienzo de una. */
export type ImportFigmaLote = {
  origen: "figma";
  version: 1;
  pantallas: ImportFigma[];
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
 * como función. Los \n EXPLÍCITOS del texto se respetan siempre (un Enter
 * tipeado a mano es un corte de autor): cada párrafo se envuelve por
 * separado y el objetivo cuenta el TOTAL de líneas renderizadas — el caso
 * real «un Enter + el wrap de la caja» produce ambas cosas. Primero prueba
 * el ancho de la caja; si el conteo total no coincide con las líneas que
 * Figma REALMENTE renderizó (las métricas de la fuente medida pueden
 * diferir de la real), busca por bisección el ancho más angosto que
 * produce exactamente ese conteo — el dato fuerte es el conteo, no el
 * ancho. Una palabra más ancha que la caja desborda, no se corta.
 */
export function envolverEnLineas(
  texto: string,
  anchoMax: number,
  medir: MedirAncho,
  lineasObjetivo?: number,
): string {
  const parrafos = texto.split("\n").map((p) => p.split(/\s+/).filter(Boolean));
  const totalPalabras = parrafos.reduce((a, p) => a + p.length, 0);
  if (totalPalabras < 2) return texto;

  // párrafo vacío (doble Enter) = una línea en blanco, se conserva
  const envolverTodo = (ancho: number): string[] =>
    parrafos.flatMap((p) => (p.length ? envolverGreedy(p, ancho, medir) : [""]));

  const porCaja = envolverTodo(anchoMax);
  // tope alcanzable: una línea por palabra + las líneas en blanco de autor
  const vacios = parrafos.filter((p) => p.length === 0).length;
  const objetivo = Math.min(lineasObjetivo ?? 0, totalPalabras + vacios);
  // el objetivo nunca puede bajar de los cortes explícitos: si no alcanza,
  // manda el wrap de la caja tal cual
  if (objetivo <= parrafos.length || porCaja.length === objetivo) return porCaja.join("\n");

  let angosto = Math.max(...parrafos.flat().map(medir));
  let ancho = medir(parrafos.flat().join(" "));
  for (let i = 0; i < 30; i++) {
    const medio = (angosto + ancho) / 2;
    if (envolverTodo(medio).length > objetivo) angosto = medio;
    else ancho = medio;
  }
  return envolverTodo(ancho).join("\n");
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

/** La versión del plugin que este build espera: el JSON exportado lleva el
    sello `plugin: N` y un sello menor delata un plugin desactualizado en
    Figma (la causa clásica de «el fix no anda»: el code.js viejo). */
export const PLUGIN_ESPERADO = 12;

/** El aviso de plugin viejo, o null si el sello está al día. */
export function avisoDePluginViejo(datos: unknown): string | null {
  const d = datos as { plugin?: unknown };
  if (typeof d !== "object" || d === null) return null;
  const sello = typeof d.plugin === "number" ? d.plugin : 0;
  if (sello >= PLUGIN_ESPERADO) return null;
  return `este JSON salió de un plugin VIEJO (v${sello || "sin sello"}, se espera v${PLUGIN_ESPERADO}): en Figma re-importá figma-plugin/manifest.json (Plugins → Development → Import plugin from manifest…) y volvé a exportar el frame`;
}

/** Normaliza pegar UNA pantalla o un LOTE a la misma lista de pantallas. */
export function pantallasDeImport(datos: unknown): ImportFigma[] | null {
  if (validarImportFigma(datos)) return [datos];
  const d = datos as ImportFigmaLote;
  if (
    typeof d === "object" && d !== null && d.origen === "figma" && d.version === 1 &&
    Array.isArray(d.pantallas) && d.pantallas.length > 0 && d.pantallas.every(validarImportFigma)
  ) {
    return d.pantallas;
  }
  return null;
}

/**
 * Desplazamientos de cada pantalla del lote RESPECTO DE LA PRIMERA. Si el
 * plugin mandó posiciones absolutas de Figma, se conserva la disposición
 * que el diseñador ya armó; si no (JSON viejo), quedan en fila con calle.
 */
export function offsetsDeLote(pantallas: ImportFigma[]): { dx: number; dy: number }[] {
  const primero = pantallas[0].frame;
  if (pantallas.every((p) => p.frame.x !== undefined && p.frame.y !== undefined)) {
    return pantallas.map((p) => ({ dx: p.frame.x! - primero.x!, dy: p.frame.y! - primero.y! }));
  }
  let x = 0;
  return pantallas.map((p) => {
    const offset = { dx: x, dy: 0 };
    x += p.frame.ancho + 200;
    return offset;
  });
}

/**
 * Suma una pantalla importada al LIENZO de una composición existente (el
 * paradigma canvas: muchas pantallas conviven y el render es lo que ve la
 * cámara). Desplaza todas las capas nuevas a (dx, dy), antepone el fondo del
 * frame como placa propia (en el canvas el fondo de la composición ya no lo
 * cubre), renombra ids que chocan con los existentes y remapea reajustes y
 * anclas (que están en coordenadas del frame) al lugar nuevo.
 */
export function sumarAlLienzo(
  comp: Composicion,
  resultado: ResultadoImport,
  dx: number,
  dy: number,
): { composicion: Composicion; reajustes: ReajusteTexto[]; anclas: AnclaTexto[] } {
  const nueva = resultado.composicion;
  const usados = new Set(comp.capas.map((c) => c.id));
  const renombres = new Map<string, string>();
  const idLibre = (id: string) => {
    let candidato = id;
    let n = 2;
    while (usados.has(candidato)) candidato = `${id}-${n++}`;
    usados.add(candidato);
    return candidato;
  };

  // La placa de fondo es la MANIJA de la pantalla: su id es el grupo de
  // todas las capas que llegaron con ella (arrastrarla mueve la pantalla
  // entera; borrarla desde el inspector borra el grupo completo).
  const idPantalla = idLibre(`pantalla-${nueva.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "figma"}`);
  const fondo: Capa = {
    id: idPantalla,
    nombre: `${nueva.nombre} (fondo)`,
    tipo: "forma",
    forma: "rectangulo",
    ancho: nueva.ancho,
    alto: nueva.alto,
    color: nueva.fondo,
    x: dx + nueva.ancho / 2,
    y: dy + nueva.alto / 2,
    grupo: idPantalla,
    v: Math.max(0, ...comp.capas.map((c) => c.v ?? 0)) + 1,
  };

  const capas = nueva.capas.map((c) => {
    const id = idLibre(c.id);
    renombres.set(c.id, id);
    return {
      ...c,
      id,
      x: c.x + dx,
      y: c.y + dy,
      grupo: idPantalla,
      // el subgrupo se hace único POR PANTALLA: dos imports con "Group 1"
      // no se mezclan (el nombre visible queda en subgrupoNombre)
      subgrupo: c.subgrupo ? `${idPantalla}:${c.subgrupo}` : undefined,
    };
  });

  return {
    composicion: { ...comp, capas: [...comp.capas, fondo, ...capas] },
    reajustes: resultado.reajustes.map((r) => ({ ...r, capaId: renombres.get(r.capaId) ?? r.capaId })),
    anclas: resultado.anclas.map((a) => ({
      ...a,
      capaId: renombres.get(a.capaId) ?? a.capaId,
      topCaja: a.topCaja + dy,
      tintaY: a.tintaY === undefined ? undefined : a.tintaY + dy,
    })),
  };
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
      // subgrupo de Figma (el logo con sus letras): viaja tal cual y
      // sumarAlLienzo lo hace único por pantalla
      subgrupo: nodo.subgrupo,
      subgrupoNombre: nodo.subgrupo,
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
      if ((t.lineasEstimadas ?? 0) > lineas) {
        // Figma renderizó MÁS líneas de las que el contenido trae escritas:
        // la diferencia es wrap de la caja (puede convivir con Enters de
        // autor) y el editor lo reconstruye midiendo, párrafo por párrafo
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
          estilo: t.estilo,
          interletrado: t.interletrado,
          interlineado: t.interlineado,
        },
        color: t.color,
        tramos: t.tramos && t.tramos.length ? t.tramos : undefined,
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
        // v11: los trazos también pueden llegar ROTADOS (una LINE vertical
        // de Figma es una LINE horizontal rotada 90°)
        rotacion: nodo.rotacion,
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

    if (nodo.tipo === "vector" && nodo.vector) {
      capas.push({
        ...base,
        tipo: "vector",
        rotacion: nodo.rotacion,
        path: nodo.vector.path,
        ancho: nodo.ancho,
        alto: nodo.alto,
        relleno: nodo.vector.relleno,
        reglaRelleno: nodo.vector.reglaRelleno,
        trazoColor: nodo.vector.trazoColor,
        trazoGrosor: nodo.vector.trazoGrosor,
        remate: nodo.vector.remate,
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
