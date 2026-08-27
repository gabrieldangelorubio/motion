/* -----------------------------------------------------------------------------
   Export a After Effects — generador de script ExtendScript (.jsx)

   El camino elegido para llevar composiciones a AE es GENERAR UN SCRIPT que,
   corrido adentro de AE (Archivo → Scripts → Ejecutar archivo de script…),
   construye la comp con OBJETOS NATIVOS: capas de texto reales con su fuente,
   keyframes con temporal ease real, expresiones reales. Nada se "importa":
   es como si alguien hubiera armado la comp a mano — por eso todo queda
   100% editable. (El .aep binario es propietario; Lottie degrada el texto.)

   Este módulo es PURO: (escenas) → string determinista, testeable en node
   sin AE. El script emitido es ExtendScript (ES3): var y function, nada de
   const/let/arrow. Los strings se escapan a ASCII (\uXXXX) porque la
   codificación de .jsx sin BOM es frágil en AE.

   Mapeo (MVP — tanda 1):
   - escena → comp de AE; si hay cámara, el contenido vive en una precomp
     y la cámara son keyframes de anchor/scale de esa precomp (zoom=escala).
   - pistas crudas x/y/escala/rotación/opacidad/desenfoque → keyframes
     nativos con el easing convertido a KeyframeEase (velocidad+influencia).
   - temblor → EXPRESIÓN con nuestra misma suma de senos (matchea el render
     y encima queda editable en AE).
   - presets entrada/salida → todavía NO se traducen (tanda 2: text
     animators); quedan anotados en el comentario de la capa para que nada
     se pierda en silencio (degradar, no romper).
   - media → sólido placeholder con el nombre (el asset se relinkea en AE);
     trazo → rectángulo con Trim Paths real (el path SVG es de la tanda 2).
   - varias escenas → una comp por escena + comp master con cortes duros.
----------------------------------------------------------------------------- */

import type {
  Capa,
  Composicion,
  Keyframe,
  MezclaCapa,
  NombreEasing,
  Pistas,
  Segmento,
} from "@/lib/motion/modelo";
import { camaraEn } from "@/lib/motion/evaluar-puro";
import { filasDeCapas, type FilaCapas } from "@/lib/motion/herramientas-puro";

/* ——— Números y strings deterministas ————————————————————————————— */

function redondear(n: number, d = 4): number {
  const f = 10 ** d;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

function num(n: number): string {
  return String(redondear(n));
}

/** Escapa un string a un literal ExtendScript ASCII-seguro. */
function cadena(s: string): string {
  let salida = '"';
  for (const letra of s) {
    const codigo = letra.codePointAt(0) ?? 0;
    if (letra === '"') salida += '\\"';
    else if (letra === "\\") salida += "\\\\";
    else if (letra === "\n") salida += "\\n";
    else if (letra === "\r") salida += "\\r";
    else if (letra === "\t") salida += "\\t";
    else if (codigo < 32 || codigo > 126) {
      // fuera del BMP serían dos unidades UTF-16: escapamos cada una
      salida += letra
        .split("")
        .map((u) => "\\u" + u.charCodeAt(0).toString(16).padStart(4, "0"))
        .join("");
    } else salida += letra;
  }
  return salida + '"';
}

/** #rgb / #rrggbb → [r, g, b] en 0–1 (AE). Color roto degrada a gris. */
export function colorAE(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [0.5, 0.5, 0.5];
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const canal = (i: number) => redondear(parseInt(h.slice(i, i + 2), 16) / 255);
  return [canal(0), canal(2), canal(4)];
}

function colorLit(hex: string): string {
  const [r, g, b] = colorAE(hex);
  return `[${num(r)}, ${num(g)}, ${num(b)}]`;
}

/* ——— Fuentes del proyecto: viajan en fuentes/ dentro del zip ————————
   AE no puede instalar tipografías por script (eso es del sistema): van
   como ARCHIVOS para instalar con doble click antes de correr el .jsx,
   más un LEEME que lista qué hace falta y de dónde sacar lo que no viaja. */

/** Formato real del binario de una fuente, por número mágico. */
export function extensionDeFuente(bytes: ArrayLike<number>): "otf" | "ttf" | "woff" | "woff2" {
  const magia = [bytes[0], bytes[1], bytes[2], bytes[3]];
  const es = (s: string) => s.split("").every((c, i) => magia[i] === c.charCodeAt(0));
  if (es("OTTO")) return "otf";
  if (es("wOFF")) return "woff";
  if (es("wOF2")) return "woff2";
  return "ttf"; // 0x00010000 y "true" son TrueType; default sano
}

/** Nombre de archivo ASCII-seguro para una familia. */
export function archivoDeFamilia(familia: string, ext: string): string {
  const base = familia
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 _-]/g, "")
    .replace(/\s+/g, "");
  return `fuentes/${base || "fuente"}.${ext}`;
}

/** El LEEME de fuentes/: qué instalar, qué bajar de Google, qué conseguir. */
export function leemeDeFuentes(
  incluidas: { familia: string; archivo: string }[],
  deGoogle: string[],
  restantes: string[],
): string {
  const L: string[] = [
    "FUENTES DEL PROYECTO",
    "====================",
    "Instalalas ANTES de correr el .jsx en After Effects (doble click en",
    "cada archivo > Instalar). AE no puede instalarlas solo: eso es del",
    "sistema operativo.",
    "",
  ];
  if (incluidas.length) {
    L.push("Incluidas en esta carpeta:");
    for (const f of incluidas) L.push(`- ${f.familia} -> ${f.archivo.replace("fuentes/", "")}`);
    L.push("");
  }
  if (deGoogle.length) {
    L.push("De Google Fonts (bajalas gratis e instalalas):");
    for (const familia of deGoogle) {
      L.push(`- ${familia}: https://fonts.google.com/specimen/${familia.replace(/\s+/g, "+")}`);
    }
    L.push("");
  }
  if (restantes.length) {
    L.push("Usadas por el proyecto (si no las tenes instaladas, conseguilas):");
    for (const familia of restantes) L.push(`- ${familia}`);
    L.push("");
  }
  return L.join("\n");
}

/* ——— Easings → temporal ease de AE ——————————————————————————————— */

// Los mismos cubic-bezier de easings-puro. Los resortes no tienen bezier
// exacto (rebotan): se aproximan con overshoot tipo back — documentado; el
// horneado por frame exacto queda para cuando haga falta fidelidad total.
const BEZIER_AE: Record<NombreEasing, [number, number, number, number]> = {
  lineal: [0, 0, 1, 1],
  suave: [0.4, 0.0, 0.2, 1],
  seco: [0.9, 0.05, 0.1, 1],
  salidaQuad: [0.25, 0.46, 0.45, 0.94],
  salidaCubic: [0.215, 0.61, 0.355, 1],
  salidaQuart: [0.165, 0.84, 0.44, 1],
  salidaExpo: [0.19, 1, 0.22, 1],
  salidaBack: [0.175, 0.885, 0.32, 1.275],
  entradaQuad: [0.55, 0.085, 0.68, 0.53],
  entradaCubic: [0.55, 0.055, 0.675, 0.19],
  entradaExpo: [0.95, 0.05, 0.795, 0.035],
  entradaBack: [0.6, -0.28, 0.735, 0.045],
  entradaSalidaCubic: [0.645, 0.045, 0.355, 1],
  entradaSalidaExpo: [0.87, 0, 0.13, 1],
  resorteSuave: [0.175, 0.885, 0.32, 1.275],
  resorteTenso: [0.2, 0.9, 0.25, 1.2],
  resorteRebote: [0.175, 0.885, 0.32, 1.35],
};

/** [velocidad, influencia] de salida (key a) y entrada (key b) de un tramo.
    La conversión estándar bezier→AE: la influencia es cuánto del tramo toma
    la manija (x·100) y la velocidad es la pendiente de la manija por la
    velocidad promedio del tramo. `lineal` devuelve null (interpolación
    lineal nativa, sin ease que setear). */
export function easeDeTramo(
  nombre: NombreEasing | undefined,
  dv: number,
  dtSeg: number,
): { salida: [number, number]; entrada: [number, number] } | null {
  const real = nombre ?? "suave"; // ausente = el default de la casa
  if (real === "lineal") return null;
  const [x1, y1, x2, y2] = BEZIER_AE[real] ?? BEZIER_AE.suave;
  const prom = dtSeg > 0 ? dv / dtSeg : 0;
  const vSalida = x1 <= 0.001 ? 0 : (y1 / x1) * prom;
  const vEntrada = x2 >= 0.999 ? 0 : ((1 - y2) / (1 - x2)) * prom;
  const clamp = (n: number) => Math.max(0.1, Math.min(100, n));
  return {
    salida: [redondear(vSalida), redondear(clamp(x1 * 100))],
    entrada: [redondear(vEntrada), redondear(clamp((1 - x2) * 100))],
  };
}

/* ——— Claves listas para el helper __pista del script —————————————— */

type ClaveAE = {
  t: number; // segundos
  v: number | number[];
  /** [velocidad, influencia] entrante / saliente */
  ei?: [number, number];
  eo?: [number, number];
  hold?: boolean;
};

/** Pista del modelo → claves AE. `mapV` convierte el valor (0–1 → 0–100,
    px → [x,y]…); `dvDe` da el delta que escala la velocidad del ease (para
    props espaciales, magnitud ≥ 0). */
function clavesDe(
  pista: Keyframe[],
  mapV: (v: number) => number | number[],
  dvDe: (a: number, b: number) => number = (a, b) => b - a,
): ClaveAE[] {
  return pista.map((kf, i) => {
    const clave: ClaveAE = { t: redondear(kf.t / 1000), v: mapV(kf.v) };
    if (kf.hold) {
      clave.hold = true;
    } else if (i < pista.length - 1) {
      const sig = pista[i + 1];
      const ease = easeDeTramo(kf.easing, dvDe(kf.v, sig.v), (sig.t - kf.t) / 1000);
      if (ease) clave.eo = ease.salida;
    }
    const previa = i > 0 ? pista[i - 1] : null;
    if (previa && !previa.hold) {
      const ease = easeDeTramo(previa.easing, dvDe(previa.v, kf.v), (kf.t - previa.t) / 1000);
      if (ease) clave.ei = ease.entrada;
    }
    return clave;
  });
}

function claveLit(clave: ClaveAE): string {
  const partes = [`t: ${num(clave.t)}`];
  partes.push(`v: ${Array.isArray(clave.v) ? `[${clave.v.map(num).join(", ")}]` : num(clave.v)}`);
  if (clave.ei) partes.push(`ei: [${clave.ei.map(num).join(", ")}]`);
  if (clave.eo) partes.push(`eo: [${clave.eo.map(num).join(", ")}]`);
  if (clave.hold) partes.push("hold: true");
  return `{${partes.join(", ")}}`;
}

function clavesLit(claves: ClaveAE[]): string {
  return `[${claves.map(claveLit).join(", ")}]`;
}

/* ——— Fuentes y mezclas ————————————————————————————————————————— */

const SUFIJO_PESO: Record<number, string> = {
  100: "-Thin", 200: "-ExtraLight", 300: "-Light", 400: "-Regular", 500: "-Medium",
  600: "-SemiBold", 700: "-Bold", 800: "-ExtraBold", 900: "-Black",
};

/** Adivinanza del nombre PostScript ("Space Grotesk", 700 → SpaceGrotesk-Bold).
    Si AE no la resuelve, marca la fuente como faltante y se elige a mano —
    mejor un nombre que casi siempre acierta que ninguno. */
export function fuentePostScript(familia: string, peso: number): string {
  const base = familia.replace(/\s+/g, "");
  return base + (SUFIJO_PESO[peso] ?? "-Regular");
}

/** CANDIDATOS de nombre PostScript para una familia+peso, en orden de
    probabilidad. El script los prueba EN AE y verifica cuál agarró de
    verdad (setear una fuente inexistente no lanza: AE sustituye en
    silencio — por eso hay que releer y comparar). */
export function candidatosDeFuente(familia: string, peso: number): string[] {
  const base = familia.replace(/\s+/g, "");
  const sufijos: Record<number, string[]> = {
    100: ["Thin"], 200: ["ExtraLight", "UltraLight"], 300: ["Light"],
    400: ["Regular", ""], 500: ["Medium"],
    600: ["SemiBold", "Semibold", "DemiBold"], 700: ["Bold"],
    800: ["ExtraBold", "Heavy"], 900: ["Black", "Heavy"],
  };
  const candidatos: string[] = [];
  for (const sufijo of sufijos[peso] ?? ["Regular"]) {
    if (sufijo) candidatos.push(`${base}-${sufijo}`, `${base}${sufijo}`);
    else candidatos.push(base);
  }
  if (!candidatos.includes(base)) candidatos.push(base);
  return candidatos;
}

const MEZCLA_AE: Record<MezclaCapa, string> = {
  multiply: "MULTIPLY", screen: "SCREEN", overlay: "OVERLAY",
  darken: "DARKEN", lighten: "LIGHTEN",
  "color-dodge": "CLASSIC_COLOR_DODGE", "color-burn": "CLASSIC_COLOR_BURN",
  "hard-light": "HARD_LIGHT", "soft-light": "SOFT_LIGHT",
  difference: "DIFFERENCE", exclusion: "EXCLUSION",
  hue: "HUE", saturation: "SATURATION", color: "COLOR", luminosity: "LUMINOSITY",
};

/* ——— Capas ———————————————————————————————————————————————————— */

function describirSegmento(clase: string, seg: Segmento): string {
  const partes = [`${clase}: ${seg.preset} (en ${seg.en}ms, dura ${seg.duracion}ms`];
  if (seg.escalonado) partes.push(`escalonado ${seg.escalonado}ms`);
  return partes.join(", ") + ")";
}

/** Modo del export: `sinAnimacion` manda SOLO el diseño — cada capa en su
    estado BASE (el reposo al que los presets entran), sin keyframes, sin
    cámara y sin temblor. Para armar la animación de cero en AE.
    `rutasMedia` mapea mediaId → ruta relativa del asset (dentro del zip):
    con eso el script IMPORTA los archivos reales en vez de placeholders. */
export type OpcionesAE = { sinAnimacion?: boolean; rutasMedia?: Record<string, string> };

/* ——— Assets: los data-uris de las capas media, como archivos del zip ——— */

const EXT_DE_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/gif": "gif", "image/svg+xml": "svg",
};

export type AssetAE = { mediaId: string; ruta: string; mime: string; base64: string };

/** Los assets únicos de las escenas, en orden de aparición, con nombre
    ordenado (`assets/media-01.png`). Solo data-uris base64; un mediaId de
    catálogo (sin bytes acá) queda afuera y su capa cae al placeholder. */
export function assetsDeEscenas(escenas: Composicion[]): AssetAE[] {
  const assets: AssetAE[] = [];
  const vistos = new Set<string>();
  for (const escena of escenas) {
    for (const capa of escena.capas) {
      if (capa.tipo !== "media" || vistos.has(capa.mediaId)) continue;
      const m = /^data:([a-z0-9.+/-]+);base64,(.+)$/i.exec(capa.mediaId);
      if (!m) continue;
      vistos.add(capa.mediaId);
      const ext = EXT_DE_MIME[m[1].toLowerCase()] ?? "png";
      assets.push({
        mediaId: capa.mediaId,
        ruta: `assets/media-${String(assets.length + 1).padStart(2, "0")}.${ext}`,
        mime: m[1].toLowerCase(),
        base64: m[2],
      });
    }
  }
  return assets;
}

/** Comentario de capa con lo que TODAVÍA no se traduce, para que nada se
    pierda en silencio al abrir el proyecto en AE. */
function comentarioPendientes(capa: Capa, sinAnimacion: boolean, conAsset = false): string | null {
  const pendientes: string[] = [];
  if (!sinAnimacion) {
    if (capa.entrada) pendientes.push(describirSegmento("entrada", capa.entrada));
    if (capa.salida) pendientes.push(describirSegmento("salida", capa.salida));
    if (capa.tipo === "texto" && capa.division !== "ninguna") {
      pendientes.push(`division: ${capa.division}`);
    }
  }
  if (capa.tipo === "trazo") pendientes.push("path SVG real (aca va un rectangulo)");
  if (capa.tipo === "media" && !conAsset) pendientes.push(`relinkear asset (${capa.mediaId.slice(0, 40)})`);
  if (pendientes.length === 0) return null;
  return "motion, pendiente de traducir: " + pendientes.join(" | ");
}

/** Emite transformaciones (base + pistas) de una capa ya creada en `capa`.
    Con `sinAnimacion` las pistas se ignoran: queda el estado base, quieto.
    `escalaYaPuesta`: el footage importado ya lleva su escala de encaje —
    la base no se pisa (pistas de escala crudas igual mandan). */
function emitirTransform(L: string[], capa: Capa, desplazarY = 0, sinAnimacion = false, escalaYaPuesta = false): void {
  const pistas: Pistas = sinAnimacion ? {} : (capa.pistas ?? {});
  const mapY = (v: number) => redondear(v - desplazarY);

  if (pistas.x?.length || pistas.y?.length) {
    L.push(`__t(capa, "ADBE Position").dimensionsSeparated = true;`);
    if (pistas.x?.length) {
      L.push(`__pista(__t(capa, "ADBE Position_0"), ${clavesLit(clavesDe(pistas.x, (v) => redondear(v)))}, 1);`);
    } else {
      L.push(`__t(capa, "ADBE Position_0").setValue(${num(capa.x)});`);
    }
    if (pistas.y?.length) {
      L.push(`__pista(__t(capa, "ADBE Position_1"), ${clavesLit(clavesDe(pistas.y, mapY))}, 1);`);
    } else {
      L.push(`__t(capa, "ADBE Position_1").setValue(${num(capa.y - desplazarY)});`);
    }
  } else {
    L.push(`__t(capa, "ADBE Position").setValue([${num(capa.x)}, ${num(capa.y - desplazarY)}]);`);
  }

  if (pistas.escala?.length) {
    L.push(`__pista(__t(capa, "ADBE Scale"), ${clavesLit(
      clavesDe(pistas.escala, (v) => [redondear(v * 100), redondear(v * 100)], (a, b) => (b - a) * 100),
    )}, 2);`);
  } else if ((capa.escala ?? 1) !== 1 && !escalaYaPuesta) {
    const s = num((capa.escala ?? 1) * 100);
    L.push(`__t(capa, "ADBE Scale").setValue([${s}, ${s}]);`);
  }

  if (pistas.rotacion?.length) {
    L.push(`__pista(__t(capa, "ADBE Rotate Z"), ${clavesLit(clavesDe(pistas.rotacion, redondear))}, 1);`);
  } else if (capa.rotacion) {
    L.push(`__t(capa, "ADBE Rotate Z").setValue(${num(capa.rotacion)});`);
  }

  if (pistas.opacidad?.length) {
    L.push(`__pista(__t(capa, "ADBE Opacity"), ${clavesLit(
      clavesDe(pistas.opacidad, (v) => redondear(v * 100), (a, b) => (b - a) * 100),
    )}, 1);`);
  } else if ((capa.opacidad ?? 1) !== 1) {
    L.push(`__t(capa, "ADBE Opacity").setValue(${num((capa.opacidad ?? 1) * 100)});`);
  }

  if (pistas.desenfoque?.length) {
    L.push(`fx = capa.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");`);
    L.push(`__pista(fx.property("ADBE Gaussian Blur 2-0001"), ${clavesLit(clavesDe(pistas.desenfoque, redondear))}, 1);`);
  }
}

function emitirComunes(L: string[], capa: Capa, sinAnimacion: boolean, conAsset = false): void {
  L.push(`capa.name = ${cadena(capa.nombre)};`);
  if (capa.oculta) L.push("capa.enabled = false;");
  if (capa.mezcla && MEZCLA_AE[capa.mezcla]) {
    L.push(`try { capa.blendingMode = BlendingMode.${MEZCLA_AE[capa.mezcla]}; } catch (e) {}`);
  }
  const comentario = comentarioPendientes(capa, sinAnimacion, conAsset);
  if (comentario) L.push(`capa.comment = ${cadena(comentario)};`);
}

function emitirCapa(L: string[], capa: Capa, sinAnimacion: boolean, rutasMedia: Record<string, string> = {}): void {
  if (capa.tipo === "texto") {
    const lineas = capa.texto.split("\n").length;
    const interlineado = capa.fuente.interlineado ?? capa.fuente.tamano * 1.15;
    // nuestro ancla centra el bloque vertical; el de AE es la baseline de la
    // PRIMERA línea — el corrimiento compensa la diferencia
    const desplazarY = ((lineas - 1) / 2) * interlineado;
    const justif =
      capa.alineacion === "izquierda" ? "LEFT_JUSTIFY"
      : capa.alineacion === "derecha" ? "RIGHT_JUSTIFY"
      : "CENTER_JUSTIFY";
    L.push(`capa = comp.layers.addText(${cadena(capa.texto)});`);
    L.push(`doc = capa.property("ADBE Text Properties").property("ADBE Text Document").value;`);
    L.push(`doc.resetCharStyle();`);
    L.push(`doc.fontSize = ${num(capa.fuente.tamano)};`);
    L.push(`doc.applyFill = true;`);
    L.push(`doc.fillColor = ${colorLit(capa.color)};`);
    L.push(`doc.justification = ParagraphJustification.${justif};`);
    // el tracking de AE es ENTERO (milésimas de em): un float lo hace abortar
    L.push(`doc.tracking = ${num(Math.round(((capa.fuente.interletrado ?? 0) / capa.fuente.tamano) * 1000))};`);
    L.push(`doc.autoLeading = false;`);
    L.push(`doc.leading = ${num(interlineado)};`);
    L.push(`capa.property("ADBE Text Properties").property("ADBE Text Document").setValue(doc);`);
    emitirComunes(L, capa, sinAnimacion);
    // DESPUÉS del comentario: si la fuente no aparece, el helper le anexa
    // «tipografia original: …» y la suma al resumen final de faltantes
    L.push(`__fijarFuente(capa, [${candidatosDeFuente(capa.fuente.familia, capa.fuente.peso).map(cadena).join(", ")}], ${cadena(`${capa.fuente.familia} (peso ${capa.fuente.peso})`)});`);
    emitirTransform(L, capa, desplazarY, sinAnimacion);
    return;
  }

  if (capa.tipo === "forma") {
    L.push(`capa = comp.layers.addShape();`);
    L.push(`gr = capa.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");`);
    if (capa.forma === "elipse") {
      L.push(`forma = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Ellipse");`);
      L.push(`forma.property("ADBE Vector Ellipse Size").setValue([${num(capa.ancho)}, ${num(capa.alto)}]);`);
    } else {
      L.push(`forma = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");`);
      L.push(`forma.property("ADBE Vector Rect Size").setValue([${num(capa.ancho)}, ${num(capa.alto)}]);`);
      if (capa.radio) L.push(`forma.property("ADBE Vector Rect Roundness").setValue(${num(capa.radio)});`);
    }
    L.push(`gr.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue(${colorLit(capa.color)});`);
    emitirComunes(L, capa, sinAnimacion);
    emitirTransform(L, capa, 0, sinAnimacion);
    return;
  }

  if (capa.tipo === "trazo") {
    // El path SVG real es de la tanda 2: mientras tanto un rectángulo del
    // MISMO tamaño con Trim Paths REAL — la animación de trim ya es fiel,
    // el vector se reemplaza a mano (queda anotado en el comentario).
    L.push(`capa = comp.layers.addShape();`);
    L.push(`gr = capa.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");`);
    L.push(`forma = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Rect");`);
    L.push(`forma.property("ADBE Vector Rect Size").setValue([${num(capa.ancho)}, ${num(capa.alto)}]);`);
    L.push(`tr = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");`);
    L.push(`tr.property("ADBE Vector Stroke Color").setValue(${colorLit(capa.color)});`);
    L.push(`tr.property("ADBE Vector Stroke Width").setValue(${num(capa.grosor)});`);
    L.push(`tr = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim");`);
    const pistas: Pistas = sinAnimacion ? {} : (capa.pistas ?? {});
    if (pistas.trazoInicio?.length) {
      L.push(`__pista(tr.property("ADBE Vector Trim Start"), ${clavesLit(
        clavesDe(pistas.trazoInicio, (v) => redondear(v * 100), (a, b) => (b - a) * 100),
      )}, 1);`);
    } else if (capa.trazoInicio) {
      L.push(`tr.property("ADBE Vector Trim Start").setValue(${num(capa.trazoInicio * 100)});`);
    }
    if (pistas.trazoFin?.length) {
      L.push(`__pista(tr.property("ADBE Vector Trim End"), ${clavesLit(
        clavesDe(pistas.trazoFin, (v) => redondear(v * 100), (a, b) => (b - a) * 100),
      )}, 1);`);
    } else if ((capa.trazoFin ?? 1) !== 1) {
      L.push(`tr.property("ADBE Vector Trim End").setValue(${num((capa.trazoFin ?? 1) * 100)});`);
    }
    emitirComunes(L, capa, sinAnimacion);
    emitirTransform(L, capa, 0, sinAnimacion);
    return;
  }

  // media: si el asset viaja en el zip, el script lo IMPORTA de verdad
  // (assets/ junto al .jsx); sin archivo cae al sólido placeholder — el
  // proyecto abre igual, degradado y avisado
  const ruta = rutasMedia[capa.mediaId];
  if (ruta) {
    L.push(`fuente = __importar(${cadena(ruta)});`);
    L.push(`if (fuente) {`);
    L.push(`fuente.parentFolder = __carpeta;`);
    L.push(`capa = comp.layers.add(fuente);`);
    // la caja de la capa manda: el footage se escala a ancho×alto (por eje,
    // como pintaba el estirado clásico; los rasters de Figma ya vienen con
    // el aspecto de su caja) × la escala propia de la capa
    const escalaCapa = capa.escala ?? 1;
    L.push(`try { __t(capa, "ADBE Scale").setValue([${num(capa.ancho * 100 * escalaCapa)} / Math.max(1, capa.source.width), ${num(capa.alto * 100 * escalaCapa)} / Math.max(1, capa.source.height)]); } catch (e) {}`);
    L.push(`} else {`);
    L.push(`capa = comp.layers.addSolid([0.5, 0.5, 0.55], ${cadena(capa.nombre)}, ${num(capa.ancho)}, ${num(capa.alto)}, 1);`);
    L.push(`capa.comment = ${cadena(`falta ${ruta}: descomprimi el zip ENTERO y deja assets/ al lado del .jsx`)};`);
    L.push(`}`);
    emitirComunes(L, capa, sinAnimacion, true);
    emitirTransform(L, capa, 0, sinAnimacion, true);
    return;
  }
  L.push(`capa = comp.layers.addSolid([0.5, 0.5, 0.55], ${cadena(capa.nombre)}, ${num(capa.ancho)}, ${num(capa.alto)}, 1);`);
  emitirComunes(L, capa, sinAnimacion);
  emitirTransform(L, capa, 0, sinAnimacion);
}

/* ——— Cámara ——————————————————————————————————————————————————— */

/** Claves de anchor point de la cámara: la unión de tiempos de x/y muestreada
    con camaraEn (encuadre limpio: pose-sync y zoom log incluidos — en los
    keyframes los valores son exactos). El ease de cada tramo sale del
    keyframe fuente (x primero, y si no). */
function clavesCamaraXY(comp: Composicion): ClaveAE[] {
  const px = comp.camara?.pistas.x ?? [];
  const py = comp.camara?.pistas.y ?? [];
  const tiempos = [...new Set([...px.map((k) => k.t), ...py.map((k) => k.t)])].sort((a, b) => a - b);
  const fuenteEn = (t: number): Keyframe | undefined =>
    px.find((k) => k.t === t) ?? py.find((k) => k.t === t);

  const puntos = tiempos.map((t) => {
    const cam = camaraEn(comp, t);
    return { t, x: redondear(cam.x), y: redondear(cam.y), kf: fuenteEn(t) };
  });

  return puntos.map((p, i) => {
    const clave: ClaveAE = { t: redondear(p.t / 1000), v: [p.x, p.y] };
    if (p.kf?.hold) {
      clave.hold = true;
    } else if (i < puntos.length - 1) {
      const sig = puntos[i + 1];
      const dist = Math.hypot(sig.x - p.x, sig.y - p.y);
      const ease = easeDeTramo(p.kf?.easing, dist, (sig.t - p.t) / 1000);
      if (ease) clave.eo = ease.salida;
    }
    const previa = i > 0 ? puntos[i - 1] : null;
    if (previa && !previa.kf?.hold) {
      const dist = Math.hypot(p.x - previa.x, p.y - previa.y);
      const ease = easeDeTramo(previa.kf?.easing, dist, (p.t - previa.t) / 1000);
      if (ease) clave.ei = ease.entrada;
    }
    return clave;
  });
}

function emitirCamara(L: string[], comp: Composicion): void {
  const cam = comp.camara;
  if (!cam) return;
  L.push(`capa.name = ${cadena("camara")};`);
  L.push(`__t(capa, "ADBE Position").setValue([${num(comp.ancho / 2)}, ${num(comp.alto / 2)}]);`);

  const clavesXY = clavesCamaraXY(comp);
  if (clavesXY.length > 0) {
    L.push(`__pista(__t(capa, "ADBE Anchor Point"), ${clavesLit(clavesXY)}, 1);`);
  } else {
    L.push(`__t(capa, "ADBE Anchor Point").setValue([${num(cam.base?.x ?? comp.ancho / 2)}, ${num(cam.base?.y ?? comp.alto / 2)}]);`);
  }

  const zoom = cam.pistas.zoom ?? [];
  if (zoom.length > 0) {
    // el camino entre keyframes acá es lineal-en-porcentaje (AE no interpola
    // en log): los extremos son exactos y el ease acerca la forma — anotado
    L.push(`__pista(__t(capa, "ADBE Scale"), ${clavesLit(
      clavesDe(zoom, (v) => [redondear(v * 100), redondear(v * 100)], (a, b) => (b - a) * 100),
    )}, 2);`);
  } else if ((cam.base?.zoom ?? 1) !== 1) {
    const s = num((cam.base?.zoom ?? 1) * 100);
    L.push(`__t(capa, "ADBE Scale").setValue([${s}, ${s}]);`);
  }

  const temblor = cam.temblor;
  if (temblor && (temblor.intensidad ?? 1) > 0) {
    // La MISMA suma de senos del motor (desplazamientoTemblor), como
    // expresión: el resultado matchea el render y sigue siendo editable.
    const presets: Record<string, { amplitud: number; velocidad: number }> = {
      handheld: { amplitud: 7, velocidad: 0.45 },
      flotar: { amplitud: 16, velocidad: 0.12 },
      nervioso: { amplitud: 3.5, velocidad: 1.6 },
    };
    const def = presets[temblor.preset] ?? presets.handheld;
    const amp = redondear(def.amplitud * (temblor.intensidad ?? 1) * (comp.ancho / 1920));
    const vel = redondear(def.velocidad * (temblor.velocidad ?? 1));
    const fase = redondear((temblor.semilla ?? 1) * 7.31);
    const expr = [
      `// temblor ${temblor.preset} (motion)`,
      `var amp = ${num(amp)}; var vel = ${num(vel)}; var fase = ${num(fase)};`,
      `var ts = time * vel * Math.PI * 2;`,
      `function onda(des) { return Math.sin(ts + des) * 0.55 + Math.sin(ts * 2.17 + des * 1.7) * 0.3 + Math.sin(ts * 4.31 + des * 2.9) * 0.15; }`,
      `value + [onda(fase) * amp, onda(fase + 4.7) * amp * 0.85];`,
    ].join("\n");
    L.push(`__t(capa, "ADBE Anchor Point").expression = ${cadena(expr)};`);
  }
}

/* ——— El script completo ———————————————————————————————————————— */

/** Texto para COMENTARIOS del .jsx (los literales van por cadena()): el
    archivo entero tiene que ser ASCII puro. */
function ascii(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, "_");
}

const CABECERA = `// --- helpers (ES3 de ExtendScript) ---
function __clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
// los assets viven en assets/ AL LADO de este .jsx (descomprimir el zip entero)
var __carpetaScript = (function () { try { return new File($.fileName).parent; } catch (e) { return null; } })();
function __importar(rel) {
  try {
    if (!__carpetaScript) return null;
    var f = new File(__carpetaScript.fsName + "/" + rel);
    if (!f.exists) return null;
    return app.project.importFile(new ImportOptions(f));
  } catch (e) { return null; }
}
// AE sustituye una fuente inexistente EN SILENCIO: probamos candidatos y
// RELEEMOS cual agarro; si ninguno pega, la capa recuerda la original en su
// comentario y el resumen final lista todas las faltantes.
var __fuentesFaltantes = [];
function __fijarFuente(capaTexto, candidatos, original) {
  var prop = capaTexto.property("ADBE Text Properties").property("ADBE Text Document");
  for (var i = 0; i < candidatos.length; i++) {
    try {
      var v = prop.value;
      v.font = candidatos[i];
      prop.setValue(v);
      if (prop.value.font === candidatos[i]) return;
    } catch (e) {}
  }
  __fuentesFaltantes.push(original);
  capaTexto.comment = (capaTexto.comment ? capaTexto.comment + " | " : "") + "tipografia original: " + original;
}
function __t(capa, nombre) { return capa.property("ADBE Transform Group").property(nombre); }
function __eases(par, n) {
  var e = par ? new KeyframeEase(par[0], __clamp(par[1], 0.1, 100)) : new KeyframeEase(0, 33.3333);
  var lista = [];
  for (var i = 0; i < n; i++) lista.push(e);
  return lista;
}
function __pista(prop, claves, dims) {
  var i;
  for (i = 0; i < claves.length; i++) prop.setValueAtTime(claves[i].t, claves[i].v);
  for (i = 0; i < claves.length; i++) {
    var c = claves[i];
    if (c.hold) {
      try { prop.setInterpolationTypeAtKey(i + 1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD); } catch (e) {}
    } else if (c.ei || c.eo) {
      try { prop.setTemporalEaseAtKey(i + 1, __eases(c.ei, dims), __eases(c.eo, dims)); } catch (e) {}
    }
  }
}`;

/**
 * Genera el script .jsx que reconstruye las escenas en After Effects.
 * Determinista: mismas escenas → mismo texto, byte a byte.
 */
export function generarScriptAE(
  escenas: Composicion[],
  nombreProyecto?: string,
  opciones: OpcionesAE = {},
): string {
  if (escenas.length === 0) throw new Error("No hay escenas para exportar");
  const sinAnimacion = opciones.sinAnimacion ?? false;
  const rutasMedia = opciones.rutasMedia ?? {};
  const proyecto = nombreProyecto ?? escenas[0].nombre;
  const L: string[] = [];
  L.push(`// Generado por motion (adios adios) -- correr en After Effects:`);
  L.push(`// Archivo > Scripts > Ejecutar archivo de script...`);
  if (sinAnimacion) L.push(`// modo: solo diseno (capas en su estado base, sin keyframes ni camara)`);
  L.push(CABECERA);
  L.push(`app.beginUndoGroup(${cadena("motion: " + proyecto)});`);
  L.push(`var __carpeta = app.project.items.addFolder(${cadena(proyecto)});`);
  L.push(`var comp, capa, doc, fx, gr, forma, tr, fuente;`);

  const varsEscena: string[] = [];
  let totalCapas = 0;
  escenas.forEach((escena, i) => {
    const varEscena = `esc${i + 1}`;
    varsEscena.push(varEscena);
    const dur = num(escena.duracion / 1000);
    const dims = `${num(escena.ancho)}, ${num(escena.alto)}, 1, ${dur}, ${num(escena.fps)}`;
    const conCamara = Boolean(escena.camara) && !sinAnimacion;
    totalCapas += escena.capas.length;

    L.push(``);
    L.push(`// --- escena: ${ascii(escena.nombre)} ---`);

    // ——— SUBGRUPOS (grupos de Figma: el logo con sus letras) → una PRECOMP
    // cada uno, creada antes; en la comp de la escena entra como UNA capa
    // en su lugar del z-order. Igual de editable, timeline de AE limpio.
    const filas = filasDeCapas(escena.capas);
    const grupos = filas.filter((f): f is Extract<FilaCapas, { tipo: "grupo" }> => f.tipo === "grupo");
    grupos.forEach((g, k) => {
      L.push(`comp = app.project.items.addComp(${cadena(`${escena.nombre} . ${g.nombre}`)}, ${dims});`);
      L.push(`comp.parentFolder = __carpeta;`);
      L.push(`var ${varEscena}g${k} = comp;`);
      for (const capa of g.capas) emitirCapa(L, capa, sinAnimacion, rutasMedia);
    });
    const emitirContenido = () => {
      for (const fila of filas) {
        if (fila.tipo === "capa") {
          emitirCapa(L, fila.capa, sinAnimacion, rutasMedia);
          continue;
        }
        const k = grupos.indexOf(fila);
        L.push(`capa = comp.layers.add(${varEscena}g${k});`);
        L.push(`capa.name = ${cadena(fila.nombre)};`);
        L.push(`__t(capa, "ADBE Position").setValue([${num(escena.ancho / 2)}, ${num(escena.alto / 2)}]);`);
      }
    };

    if (conCamara) {
      // el contenido vive en una precomp; la cámara es su transform
      L.push(`comp = app.project.items.addComp(${cadena(escena.nombre + " . contenido")}, ${dims});`);
      L.push(`comp.bgColor = ${colorLit(escena.fondo)};`);
      L.push(`comp.parentFolder = __carpeta;`);
      L.push(`var ${varEscena}c = comp;`);
      emitirContenido();
      L.push(`comp = app.project.items.addComp(${cadena(escena.nombre)}, ${dims});`);
      L.push(`comp.bgColor = ${colorLit(escena.fondo)};`);
      L.push(`comp.parentFolder = __carpeta;`);
      L.push(`var ${varEscena} = comp;`);
      L.push(`capa = comp.layers.add(${varEscena}c);`);
      emitirCamara(L, escena);
    } else {
      L.push(`comp = app.project.items.addComp(${cadena(escena.nombre)}, ${dims});`);
      L.push(`comp.bgColor = ${colorLit(escena.fondo)};`);
      L.push(`comp.parentFolder = __carpeta;`);
      L.push(`var ${varEscena} = comp;`);
      emitirContenido();
    }
  });

  if (escenas.length > 1) {
    const durTotal = num(escenas.reduce((a, e) => a + e.duracion, 0) / 1000);
    const ref = escenas[0];
    L.push(``);
    L.push(`// --- master: las escenas concatenadas con corte duro ---`);
    L.push(`comp = app.project.items.addComp(${cadena(proyecto + " . master")}, ${num(ref.ancho)}, ${num(ref.alto)}, 1, ${durTotal}, ${num(ref.fps)});`);
    L.push(`comp.parentFolder = __carpeta;`);
    let inicio = 0;
    escenas.forEach((escena, i) => {
      L.push(`capa = comp.layers.add(${varsEscena[i]});`);
      L.push(`capa.startTime = ${num(inicio / 1000)};`);
      inicio += escena.duracion;
    });
    L.push(`comp.openInViewer();`);
  } else {
    L.push(`${varsEscena[0]}.openInViewer();`);
  }

  L.push(`app.endUndoGroup();`);
  L.push(`alert(${cadena(`motion: «${proyecto}» importado — ${escenas.length} escena(s), ${totalCapas} capa(s). Las capas con animacion pendiente de traducir lo dicen en su comentario.`)});`);
  L.push(`if (__fuentesFaltantes.length) alert("Tipografias que AE no encontro (cada capa dice la ORIGINAL en su comentario; instalalas y volve a correr el script):\\n- " + __fuentesFaltantes.join("\\n- "));`);
  L.push(``);
  return L.join("\n");
}

/**
 * El PROYECTO entero para AE: el script + los assets que tiene que importar
 * (los data-uris de las capas media, como archivos ordenados en assets/).
 * El caller lo empaqueta en un zip: descomprimís, corrés el .jsx y AE
 * importa todo solo — comps, capas y archivos, en una carpeta.
 */
export function generarProyectoAE(
  escenas: Composicion[],
  nombreProyecto?: string,
  opciones: OpcionesAE = {},
): { jsx: string; assets: AssetAE[] } {
  const assets = assetsDeEscenas(escenas);
  const rutasMedia = Object.fromEntries(assets.map((a) => [a.mediaId, a.ruta]));
  return {
    jsx: generarScriptAE(escenas, nombreProyecto, { ...opciones, rutasMedia }),
    assets,
  };
}
