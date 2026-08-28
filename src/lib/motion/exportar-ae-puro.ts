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
import { camaraEn, estadoEn } from "@/lib/motion/evaluar-puro";
import { filasDeCapas, type FilaCapas } from "@/lib/motion/herramientas-puro";
import { familiaPrincipal } from "@/lib/motion/fuentes-puro";
import { compilarSegmento } from "@/lib/motion/presets-puro";
import { desplazarSubrutas, subrutasDeSvg } from "@/lib/motion/ruta-puro";

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

// Los mismos cubic-bezier de easings-puro. Los que rebotan de verdad
// (resortes, elastico, pique) no tienen bezier exacto: se aproximan con
// overshoot tipo back — y en PRESETS van horneados densos (fidelidad total);
// escalones tampoco (una escalera no es una curva): en pistas crudas degrada
// a lineal, en presets el horneado por frame la captura exacta.
const BEZIER_AE: Record<NombreEasing, [number, number, number, number]> = {
  lineal: [0, 0, 1, 1],
  suave: [0.4, 0.0, 0.2, 1],
  seco: [0.9, 0.05, 0.1, 1],
  salidaSine: [0.39, 0.575, 0.565, 1],
  salidaQuad: [0.25, 0.46, 0.45, 0.94],
  salidaCubic: [0.215, 0.61, 0.355, 1],
  salidaQuart: [0.165, 0.84, 0.44, 1],
  salidaQuint: [0.23, 1, 0.32, 1],
  salidaExpo: [0.19, 1, 0.22, 1],
  salidaCirc: [0.075, 0.82, 0.165, 1],
  salidaBack: [0.175, 0.885, 0.32, 1.275],
  salidaElastico: [0.175, 0.885, 0.32, 1.35],
  salidaPique: [0.175, 0.885, 0.32, 1.275],
  entradaSine: [0.47, 0, 0.745, 0.715],
  entradaQuad: [0.55, 0.085, 0.68, 0.53],
  entradaCubic: [0.55, 0.055, 0.675, 0.19],
  entradaQuart: [0.895, 0.03, 0.685, 0.22],
  entradaQuint: [0.755, 0.05, 0.855, 0.06],
  entradaExpo: [0.95, 0.05, 0.795, 0.035],
  entradaCirc: [0.6, 0.04, 0.98, 0.335],
  entradaBack: [0.6, -0.28, 0.735, 0.045],
  entradaElastico: [0.6, -0.28, 0.735, 0.045],
  entradaPique: [0.6, -0.28, 0.735, 0.045],
  entradaSalidaSine: [0.445, 0.05, 0.55, 0.95],
  entradaSalidaQuad: [0.455, 0.03, 0.515, 0.955],
  entradaSalidaCubic: [0.645, 0.045, 0.355, 1],
  entradaSalidaQuart: [0.77, 0, 0.175, 1],
  entradaSalidaQuint: [0.86, 0, 0.07, 1],
  entradaSalidaExpo: [0.87, 0, 0.13, 1],
  entradaSalidaCirc: [0.785, 0.135, 0.15, 0.86],
  entradaSalidaBack: [0.68, -0.55, 0.265, 1.55],
  escalones: [0, 0, 1, 1],
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

const SUFIJOS_POR_PESO: Record<number, string[]> = {
  100: ["Thin", "Hairline"],
  200: ["ExtraLight", "UltraLight"],
  300: ["Light"],
  400: ["Regular", "Book", "Roman", "Normal"],
  500: ["Medium"],
  600: ["SemiBold", "Semibold", "DemiBold", "Demi"],
  700: ["Bold"],
  800: ["ExtraBold", "Heavy", "UltraBold"],
  900: ["Black", "Heavy"],
};

/** El orden CSS de fallback de pesos: el pedido primero y de ahí los
    vecinos (400 y 500 se prefieren entre sí; un pedido liviano baja antes
    de subir, uno pesado sube antes de bajar). Una familia que NO tiene el
    estilo pedido cae al MÁS PARECIDO — no al que AE sustituya en silencio
    (así fue como un peso 400 terminó en Thin). */
export function escaleraDePesos(peso: number): number[] {
  const todos = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const pedido = todos.reduce((m, p) => (Math.abs(p - peso) < Math.abs(m - peso) ? p : m));
  const abajo = todos.filter((p) => p < pedido).reverse();
  const arriba = todos.filter((p) => p > pedido);
  if (pedido === 400) return [400, 500, ...abajo, ...arriba.filter((p) => p !== 500)];
  if (pedido === 500) return [500, 400, ...abajo.filter((p) => p !== 400), ...arriba];
  if (pedido < 400) return [pedido, ...abajo, ...arriba];
  return [pedido, ...arriba, ...abajo];
}

/** CANDIDATOS de nombre PostScript para una familia+peso: primero todas
    las variantes del peso pedido y después la ESCALERA entera de pesos
    vecinos. El script los prueba EN AE y verifica cuál agarró de verdad
    (setear una fuente inexistente no lanza: AE sustituye en silencio —
    por eso hay que releer y comparar). */
export function candidatosDeFuente(familia: string, peso: number): string[] {
  const base = familia.replace(/\s+/g, "");
  const candidatos: string[] = [];
  const sumar = (n: string) => {
    if (!candidatos.includes(n)) candidatos.push(n);
  };
  for (const p of escaleraDePesos(peso)) {
    for (const sufijo of SUFIJOS_POR_PESO[p]) {
      sumar(`${base}-${sufijo}`);
      sumar(`${base}${sufijo}`);
    }
    // el Regular de muchas familias es el nombre pelado, sin sufijo
    if (p === 400) sumar(base);
  }
  sumar(base);
  return candidatos;
}

/** Índices REALES [ini, fin) en el string para un tramo de rich text: los
    tramos cuentan caracteres NO BLANCOS (sobreviven al re-wrap), pero el
    characterRange de AE cuenta todos. Un tramo fuera del texto da [0, 0). */
export function rangoRealDeTramo(texto: string, desde: number, hasta: number): [number, number] {
  const reales: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    if (!/\s/.test(texto[i])) reales.push(i);
  }
  if (desde < 0 || desde >= reales.length || hasta <= desde) return [0, 0];
  return [reales[desde], reales[Math.min(hasta, reales.length) - 1] + 1];
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
function comentarioPendientes(
  capa: Capa,
  sinAnimacion: boolean,
  conAsset = false,
  animacion: AnimacionAE | null = null,
): string | null {
  const pendientes: string[] = [];
  if (!sinAnimacion) {
    if (animacion) {
      // los presets ya viajaron como keyframes: el comentario informa, no
      // reclama — y la división avisa que llegó como bloque
      const partes = [capa.entrada && `entrada ${capa.entrada.preset}`, capa.salida && `salida ${capa.salida.preset}`]
        .filter(Boolean)
        .join(" + ");
      if (animacion.ralas) pendientes.push(`animacion en keyframes editables (${partes})`);
      else pendientes.push(`animacion horneada a keyframes (${partes}) — la coreografia se edita en motion`);
      if (capa.tipo === "texto" && capa.division !== "ninguna") {
        pendientes.push(`division por ${capa.division}: horneada como bloque (letra por letra pendiente)`);
      }
      // el recorte del revelado (la máscara por renglón) no se puede hornear
      // en keyframes de transform: en AE hay que enmascarar a mano (pendiente)
      if ([capa.entrada, capa.salida].some((seg) => seg && compilarSegmento(seg).recorte)) {
        pendientes.push("la MASCARA del revelado no viaja: agregala en AE (pendiente)");
      }
    } else {
      if (capa.entrada) pendientes.push(describirSegmento("entrada", capa.entrada));
      if (capa.salida) pendientes.push(describirSegmento("salida", capa.salida));
      if (capa.tipo === "texto" && capa.division !== "ninguna") {
        pendientes.push(`division: ${capa.division}`);
      }
    }
  }
  if (capa.tipo === "media" && !conAsset) pendientes.push(`relinkear asset (${capa.mediaId.slice(0, 40)})`);
  if (pendientes.length === 0) return null;
  return "motion, pendiente de traducir: " + pendientes.join(" | ");
}

/** Canales horneados de una capa: la animación RESUELTA por el motor
    (presets + pistas + escalonado colapsado) muestreada frame a frame. */
type ClavesHorneadas = {
  posicion?: ClaveAE[];
  escala?: ClaveAE[];
  rotacion?: ClaveAE[];
  opacidad?: ClaveAE[];
  desenfoque?: ClaveAE[];
  trazoInicio?: ClaveAE[];
  trazoFin?: ClaveAE[];
};

/** La animación de la capa resuelta a keyframes; `ralas` dice si son los
    2 keyframes editables por segmento (in y out con ease) o el horneado
    denso frame a frame. */
type AnimacionAE = { claves: ClavesHorneadas; ralas: boolean };

const varia = (claves: ClaveAE[]) =>
  claves.some((c) => JSON.stringify(c.v) !== JSON.stringify(claves[0].v));

/** Muestreador del estado RESUELTO por el motor (el mismo `estadoEn` del
    preview) para UNA capa, con la división colapsada a bloque. Devuelve los
    valores en unidades de AE (escala/opacidad/trim en %, y con el ancla de
    texto corrida). */
function muestreador(comp: Composicion, capa: Capa, desplazarY: number) {
  const plana: Capa =
    capa.tipo === "texto" && capa.division !== "ninguna" ? { ...capa, division: "ninguna" } : capa;
  const compUna: Composicion = { ...comp, capas: [plana] };
  return (t: number) => {
    const est = estadoEn(compUna, t).capas[0];
    const u = est?.unidades[0];
    if (!est || !u) return null;
    const s = redondear(Math.max(0, est.escala * (1 + u.dEscala)) * 100);
    return {
      posicion: [redondear(est.x + u.dx), redondear(est.y + u.dy - desplazarY)] as [number, number],
      escala: s,
      rotacion: redondear(est.rotacion + u.dRotacion),
      opacidad: redondear(Math.min(1, Math.max(0, est.opacidad * u.opacidad)) * 100),
      desenfoque: redondear(u.desenfoque),
      trazoInicio: redondear(u.trazoInicio * 100),
      trazoFin: redondear(u.trazoFin * 100),
    };
  };
}

function canalesVacios(): Required<ClavesHorneadas> {
  return { posicion: [], escala: [], rotacion: [], opacidad: [], desenfoque: [], trazoInicio: [], trazoFin: [] };
}

function empujarMuestra(
  canales: Required<ClavesHorneadas>,
  t: number,
  m: NonNullable<ReturnType<ReturnType<typeof muestreador>>>,
): void {
  const ts = redondear(t / 1000);
  canales.posicion.push({ t: ts, v: m.posicion });
  canales.escala.push({ t: ts, v: [m.escala, m.escala] });
  canales.rotacion.push({ t: ts, v: m.rotacion });
  canales.opacidad.push({ t: ts, v: m.opacidad });
  canales.desenfoque.push({ t: ts, v: m.desenfoque });
  canales.trazoInicio.push({ t: ts, v: m.trazoInicio });
  canales.trazoFin.push({ t: ts, v: m.trazoFin });
}

function filtrarCanales(canales: Required<ClavesHorneadas>, capa: Capa): ClavesHorneadas {
  return {
    posicion: varia(canales.posicion) ? canales.posicion : undefined,
    escala: varia(canales.escala) ? canales.escala : undefined,
    rotacion: varia(canales.rotacion) ? canales.rotacion : undefined,
    opacidad: varia(canales.opacidad) ? canales.opacidad : undefined,
    desenfoque: varia(canales.desenfoque) ? canales.desenfoque : undefined,
    trazoInicio: capa.tipo === "trazo" && varia(canales.trazoInicio) ? canales.trazoInicio : undefined,
    trazoFin: capa.tipo === "trazo" && varia(canales.trazoFin) ? canales.trazoFin : undefined,
  };
}

/**
 * HORNEA los presets de entrada/salida a keyframes: el mismo `estadoEn`
 * del preview se muestrea a un keyframe POR FRAME dentro de las ventanas
 * animadas — la coreografía llega a AE exacta (lineal denso: la curva del
 * easing ya viene adentro de las muestras). Un texto con división se
 * hornea como bloque entero (letra por letra = text animators, tanda
 * aparte). Devuelve solo los canales que realmente se mueven.
 */
function clavesHorneadas(comp: Composicion, capa: Capa, desplazarY: number): ClavesHorneadas | null {
  if ((!capa.entrada && !capa.salida) || capa.oculta) return null;
  const paso = 1000 / comp.fps;

  const ventanas: [number, number][] = [];
  for (const seg of [capa.entrada, capa.salida]) {
    if (seg) ventanas.push([seg.en, seg.en + seg.duracion]);
  }
  for (const pista of Object.values(capa.pistas ?? {})) {
    const ts = (pista ?? []).map((k) => k.t);
    if (ts.length) ventanas.push([Math.min(...ts), Math.max(...ts)]);
  }
  const desde = Math.max(0, Math.min(...ventanas.map((v) => v[0])));
  const hasta = Math.min(comp.duracion, Math.max(...ventanas.map((v) => v[1])));
  if (hasta <= desde) return null;

  const tiempos: number[] = [];
  for (let t = desde; t < hasta; t += paso) tiempos.push(t);
  tiempos.push(hasta);

  const muestra = muestreador(comp, capa, desplazarY);
  const canales = canalesVacios();
  for (const t of tiempos) {
    const m = muestra(t);
    if (!m) return null;
    empujarMuestra(canales, t, m);
  }
  return filtrarCanales(canales, capa);
}

// Los que rebotan o saltan de verdad en el motor (resortes, elastico, pique,
// escalones) no caben en un solo tramo bezier de AE — van horneados densos.
// Los back sí: su overshoot es un cubic-bezier y el temporal ease lo aproxima.
const EASINGS_NO_RALOS: NombreEasing[] = [
  "resorteSuave", "resorteTenso", "resorteRebote",
  "salidaElastico", "entradaElastico", "salidaPique", "entradaPique", "escalones",
];

/** ¿El segmento se puede contar RALO (in y out, 2 keyframes con ease) sin
    mentir? Sí cuando cada canal de su preset es un tramo simple 0→1 (el
    valor en el tiempo es exactamente la curva del easing reescalada) y el
    easing es un bezier de verdad. Los presets con puntos intermedios (pop,
    rebotar: el overshoot vive EN la pista) van horneados densos. */
function esSegmentoRalo(seg: Segmento, duracionComp: number): boolean {
  if (EASINGS_NO_RALOS.includes(seg.easing ?? "suave")) return false;
  if (seg.en < 0 || seg.en + seg.duracion > duracionComp) return false;
  if (seg.duracion <= 0) return false;
  const compilado = compilarSegmento(seg);
  return Object.values(compilado.pista).every(
    (pista) => !pista || (pista.length === 2 && pista[0].p === 0 && pista[1].p === 1),
  );
}

/** Keyframes RALOS: un keyframe en cada borde de segmento con el easing
    convertido a temporal ease — el «in y un out» editable que se espera en
    AE, en vez del muro de keyframes por frame. Solo cuando la capa es
    representable así (presets simples, sin pistas crudas encima, segmentos
    sin solaparse); si no, null y el caller cae al horneado denso. */
function clavesRalas(comp: Composicion, capa: Capa, desplazarY: number): ClavesHorneadas | null {
  if ((!capa.entrada && !capa.salida) || capa.oculta) return null;
  // una pista cruda sobre el mismo canal se SUMA al preset: eso ya no es un
  // tramo simple — denso (las pistas solas, sin presets, van por su via)
  if (Object.values(capa.pistas ?? {}).some((p) => (p ?? []).length > 0)) return null;
  const segs = [capa.entrada, capa.salida].filter((s): s is Segmento => Boolean(s));
  if (!segs.every((s) => esSegmentoRalo(s, comp.duracion))) return null;
  if (capa.entrada && capa.salida && capa.entrada.en + capa.entrada.duracion > capa.salida.en) return null;

  const tiempos = [...new Set(segs.flatMap((s) => [s.en, s.en + s.duracion]))].sort((a, b) => a - b);
  const muestra = muestreador(comp, capa, desplazarY);
  const canales = canalesVacios();
  for (const t of tiempos) {
    const m = muestra(t);
    if (!m) return null;
    empujarMuestra(canales, t, m);
  }

  // el ease del segmento, en el tramo de keyframes que le corresponde; los
  // tramos entre segmentos quedan lineales (los valores son iguales: reposo)
  for (const seg of segs) {
    const i = tiempos.indexOf(seg.en);
    const j = tiempos.indexOf(seg.en + seg.duracion);
    if (i < 0 || j !== i + 1) continue;
    const dt = seg.duracion / 1000;
    for (const claves of Object.values(canales)) {
      const a = claves[i];
      const b = claves[j];
      if (JSON.stringify(a.v) === JSON.stringify(b.v)) continue;
      const dv = Array.isArray(a.v) && Array.isArray(b.v)
        ? Math.hypot(b.v[0] - a.v[0], b.v[1] - a.v[1])
        : (b.v as number) - (a.v as number);
      const ease = easeDeTramo(seg.easing, dv, dt);
      if (!ease) continue;
      a.eo = ease.salida;
      b.ei = ease.entrada;
    }
  }

  // recortar las puntas quietas de cada canal (un canal que solo anima la
  // entrada no necesita arrastrar los keyframes planos de la salida)
  const igual = (a: ClaveAE, b: ClaveAE) => JSON.stringify(a.v) === JSON.stringify(b.v);
  const recortar = (claves: ClaveAE[]): ClaveAE[] => {
    let d = 0;
    let h = claves.length - 1;
    while (d < h && igual(claves[d], claves[d + 1]) && !claves[d].eo) d++;
    while (h > d && igual(claves[h - 1], claves[h]) && !claves[h].ei) h--;
    return claves.slice(d, h + 1);
  };
  const listos = canalesVacios();
  for (const canal of Object.keys(canales) as (keyof ClavesHorneadas)[]) {
    listos[canal] = recortar(canales[canal]);
  }
  return filtrarCanales(listos, capa);
}

/** La animación de la capa lista para AE: ralas si se puede, densa si no. */
function animacionDeCapa(comp: Composicion, capa: Capa, desplazarY: number): AnimacionAE | null {
  const ralas = clavesRalas(comp, capa, desplazarY);
  if (ralas) return { claves: ralas, ralas: true };
  const densas = clavesHorneadas(comp, capa, desplazarY);
  return densas ? { claves: densas, ralas: false } : null;
}

/** Emite transformaciones (base + pistas) de una capa ya creada en `capa`.
    Con `sinAnimacion` las pistas se ignoran: queda el estado base, quieto.
    `escalaYaPuesta`: el footage importado ya lleva su escala de encaje —
    la base no se pisa (pistas de escala crudas igual mandan). */
function emitirTransform(
  L: string[],
  capa: Capa,
  desplazarY = 0,
  sinAnimacion = false,
  escalaYaPuesta = false,
  horneadas: ClavesHorneadas | null = null,
): void {
  // ——— HORNEADO: la animación resuelta llega como keyframes densos; las
  // pistas crudas NO se emiten aparte (el muestreo ya las compone) ———
  if (horneadas) {
    if (horneadas.posicion) {
      L.push(`__pista(__t(capa, "ADBE Position"), ${clavesLit(horneadas.posicion)}, 1);`);
    } else {
      L.push(`__t(capa, "ADBE Position").setValue([${num(capa.x)}, ${num(capa.y - desplazarY)}]);`);
    }
    if (horneadas.escala && escalaYaPuesta) {
      // el footage importado lleva su escala de ENCAJE como reposo: la
      // animación (100 = reposo) se compone multiplicando sobre ella
      L.push(`__pista(__t(capa, "ADBE Scale"), __reescalar(${clavesLit(horneadas.escala)}, __encaje), 2);`);
    } else if (horneadas.escala) {
      L.push(`__pista(__t(capa, "ADBE Scale"), ${clavesLit(horneadas.escala)}, 2);`);
    } else if ((capa.escala ?? 1) !== 1 && !escalaYaPuesta) {
      const s = num((capa.escala ?? 1) * 100);
      L.push(`__t(capa, "ADBE Scale").setValue([${s}, ${s}]);`);
    }
    if (horneadas.rotacion) {
      L.push(`__pista(__t(capa, "ADBE Rotate Z"), ${clavesLit(horneadas.rotacion)}, 1);`);
    } else if (capa.rotacion) {
      L.push(`__t(capa, "ADBE Rotate Z").setValue(${num(capa.rotacion)});`);
    }
    if (horneadas.opacidad) {
      L.push(`__pista(__t(capa, "ADBE Opacity"), ${clavesLit(horneadas.opacidad)}, 1);`);
    } else if ((capa.opacidad ?? 1) !== 1) {
      L.push(`__t(capa, "ADBE Opacity").setValue(${num((capa.opacidad ?? 1) * 100)});`);
    }
    if (horneadas.desenfoque) {
      L.push(`fx = capa.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");`);
      L.push(`__pista(fx.property("ADBE Gaussian Blur 2-0001"), ${clavesLit(horneadas.desenfoque)}, 1);`);
    }
    return;
  }

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
    const clavesEscala = clavesLit(
      clavesDe(pistas.escala, (v) => [redondear(v * 100), redondear(v * 100)], (a, b) => (b - a) * 100),
    );
    // sobre footage importado la pista se compone con el encaje (100 = reposo)
    if (escalaYaPuesta) L.push(`__pista(__t(capa, "ADBE Scale"), __reescalar(${clavesEscala}, __encaje), 2);`);
    else L.push(`__pista(__t(capa, "ADBE Scale"), ${clavesEscala}, 2);`);
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

function emitirComunes(
  L: string[],
  capa: Capa,
  sinAnimacion: boolean,
  conAsset = false,
  animacion: AnimacionAE | null = null,
): void {
  L.push(`capa.name = ${cadena(capa.nombre)};`);
  if (capa.oculta) L.push("capa.enabled = false;");
  if (capa.mezcla && MEZCLA_AE[capa.mezcla]) {
    L.push(`try { capa.blendingMode = BlendingMode.${MEZCLA_AE[capa.mezcla]}; } catch (e) {}`);
  }
  const comentario = comentarioPendientes(capa, sinAnimacion, conAsset, animacion);
  if (comentario) L.push(`capa.comment = ${cadena(comentario)};`);
}

/** Cada subruta del path SVG → un «ADBE Vector Shape - Group» dentro del
    grupo `gr` en curso, con los vértices CENTRADOS en el ancla de la capa
    (el path local tiene 0,0 arriba-izq; el ancla es el centro). Varias
    subrutas bajo un mismo fill componen los agujeros con la fill rule. */
function emitirSubrutas(L: string[], path: string, ancho: number, alto: number): void {
  const subrutas = desplazarSubrutas(subrutasDeSvg(path), -ancho / 2, -alto / 2);
  const par = (p: [number, number]) => `[${num(redondear(p[0], 3))}, ${num(redondear(p[1], 3))}]`;
  for (const s of subrutas) {
    L.push(`forma = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Shape - Group");`);
    L.push(`sh = new Shape();`);
    L.push(`sh.vertices = [${s.puntos.map(par).join(", ")}];`);
    L.push(`sh.inTangents = [${s.tanEntrada.map(par).join(", ")}];`);
    L.push(`sh.outTangents = [${s.tanSalida.map(par).join(", ")}];`);
    L.push(`sh.closed = ${s.cerrada ? "true" : "false"};`);
    L.push(`forma.property("ADBE Vector Shape").setValue(sh);`);
  }
}

function emitirCapa(
  L: string[],
  capa: Capa,
  sinAnimacion: boolean,
  rutasMedia: Record<string, string> = {},
  compHorneo: Composicion | null = null,
): void {
  // presets (entrada/salida) a keyframes — ralos si se puede, densos si no
  const hornearCon = (desplazarY: number) =>
    !sinAnimacion && compHorneo ? animacionDeCapa(compHorneo, capa, desplazarY) : null;

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
    // CONTADOR (pista «numero»): un Slider con los keyframes + expression en
    // el Source Text que reemplaza la primera cifra — editable en AE
    const pistaNumero = sinAnimacion ? undefined : capa.pistas?.numero;
    if (pistaNumero?.length) {
      L.push(`fx = capa.property("ADBE Effect Parade").addProperty("ADBE Slider Control");`);
      L.push(`fx.name = ${cadena("Contador")};`);
      L.push(`__pista(fx.property("ADBE Slider Control-0001"), ${clavesLit(clavesDe(pistaNumero, redondear))}, 1);`);
      const expr = `${JSON.stringify(capa.texto)}.replace(/\\d[\\d.,]*/, "" + Math.round(effect("Contador")("ADBE Slider Control-0001")))`;
      L.push(`capa.property("ADBE Text Properties").property("ADBE Text Document").expression = ${cadena(expr)};`);
    }
    const animTexto = hornearCon(desplazarY);
    emitirComunes(L, capa, sinAnimacion, false, animTexto);
    // DESPUÉS del comentario: si la fuente no aparece, el helper le anexa
    // «tipografia original: …» y la suma al resumen final de faltantes.
    // OJO: la familia del import viene como STACK CSS entero («'Yamantaka',
    // -apple-system, …») — a AE va SOLO la familia real.
    const familiaReal = familiaPrincipal(capa.fuente.familia) ?? capa.fuente.familia;
    const baseFamilia = familiaReal.replace(/\s+/g, "");
    L.push(`__fijarFuente(capa, [${candidatosDeFuente(familiaReal, capa.fuente.peso).map(cadena).join(", ")}], ${cadena(baseFamilia)}, ${cadena(`${familiaReal} (peso ${capa.fuente.peso})`)});`);
    // TRAMOS de rich text (dos tipografías en un título, un color por
    // palabra): estilos por RANGO de caracteres, DESPUÉS de la fuente base
    // para que no los pise. AE viejo (sin characterRange) degrada avisado.
    for (const tramo of capa.tramos ?? []) {
      const [ini, fin] = rangoRealDeTramo(capa.texto, tramo.desde, tramo.hasta);
      if (fin <= ini) continue;
      const familiaTramo = tramo.familia ? (familiaPrincipal(tramo.familia) ?? tramo.familia) : null;
      const cambiaFuente = Boolean(familiaTramo && (familiaTramo !== familiaReal || (tramo.peso ?? capa.fuente.peso) !== capa.fuente.peso));
      const pesoTramo = tramo.peso ?? capa.fuente.peso;
      const etiqueta = `${familiaTramo ?? familiaReal} (peso ${pesoTramo}, tramo ${tramo.desde}-${tramo.hasta} de ${capa.nombre})`;
      const candidatos = cambiaFuente && familiaTramo
        ? `[${candidatosDeFuente(familiaTramo, pesoTramo).map(cadena).join(", ")}]`
        : "null";
      const baseTramo = cambiaFuente && familiaTramo ? cadena(familiaTramo.replace(/\s+/g, "")) : "null";
      const tam = tramo.tamano !== undefined ? num(tramo.tamano) : "null";
      const color = tramo.color ? colorLit(tramo.color) : "null";
      if (candidatos === "null" && tam === "null" && color === "null") continue;
      L.push(`__tramo(capa, ${ini}, ${fin}, ${candidatos}, ${baseTramo}, ${cadena(etiqueta)}, ${tam}, ${color});`);
    }
    emitirTransform(L, capa, desplazarY, sinAnimacion, false, animTexto?.claves ?? null);
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
    const animForma = hornearCon(0);
    emitirComunes(L, capa, sinAnimacion, false, animForma);
    emitirTransform(L, capa, 0, sinAnimacion, false, animForma?.claves ?? null);
    return;
  }

  if (capa.tipo === "vector") {
    // Vector REAL: cada subruta del path SVG entra como bezier de AE
    // (vértices + tangentes) — shape layer editable, nada rasterizado.
    // El borde va ANTES del relleno en el grupo (queda encima, como Figma).
    L.push(`capa = comp.layers.addShape();`);
    L.push(`gr = capa.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");`);
    emitirSubrutas(L, capa.path, capa.ancho, capa.alto);
    if (capa.trazoColor && capa.trazoGrosor) {
      L.push(`tr = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");`);
      L.push(`tr.property("ADBE Vector Stroke Color").setValue(${colorLit(capa.trazoColor)});`);
      L.push(`tr.property("ADBE Vector Stroke Width").setValue(${num(capa.trazoGrosor)});`);
      L.push(`tr.property("ADBE Vector Stroke Line Cap").setValue(${capa.remate === "recto" ? 1 : 2});`);
    }
    if (capa.relleno) {
      L.push(`fx = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Fill");`);
      L.push(`fx.property("ADBE Vector Fill Color").setValue(${colorLit(capa.relleno)});`);
      // regla de relleno de AE: 1 = non-zero, 2 = even-odd (los agujeros)
      if (capa.reglaRelleno === "evenodd") L.push(`fx.property("ADBE Vector Fill Rule").setValue(2);`);
    }
    const animVector = hornearCon(0);
    emitirComunes(L, capa, sinAnimacion, false, animVector);
    emitirTransform(L, capa, 0, sinAnimacion, false, animVector?.claves ?? null);
    return;
  }

  if (capa.tipo === "trazo") {
    // El PATH REAL del trazo (tanda 2 cumplida): las subrutas del SVG entran
    // como bezier de AE y el Trim Paths anima sobre el vector de verdad.
    L.push(`capa = comp.layers.addShape();`);
    L.push(`gr = capa.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group");`);
    emitirSubrutas(L, capa.path, capa.ancho, capa.alto);
    L.push(`tr = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Graphic - Stroke");`);
    L.push(`tr.property("ADBE Vector Stroke Color").setValue(${colorLit(capa.color)});`);
    L.push(`tr.property("ADBE Vector Stroke Width").setValue(${num(capa.grosor)});`);
    L.push(`tr.property("ADBE Vector Stroke Line Cap").setValue(${capa.remate === "recto" ? 1 : 2});`);
    L.push(`tr = gr.property("ADBE Vectors Group").addProperty("ADBE Vector Filter - Trim");`);
    const animTrazo = hornearCon(0);
    if (animTrazo?.claves.trazoInicio) {
      L.push(`__pista(tr.property("ADBE Vector Trim Start"), ${clavesLit(animTrazo.claves.trazoInicio)}, 1);`);
    }
    if (animTrazo?.claves.trazoFin) {
      L.push(`__pista(tr.property("ADBE Vector Trim End"), ${clavesLit(animTrazo.claves.trazoFin)}, 1);`);
    }
    const pistas: Pistas = sinAnimacion || animTrazo ? {} : (capa.pistas ?? {});
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
    emitirComunes(L, capa, sinAnimacion, false, animTrazo);
    emitirTransform(L, capa, 0, sinAnimacion, false, animTrazo?.claves ?? null);
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
    // el encaje FIEL al editor: escala UNIFORME («cubrir» llena la caja y
    // RECORTA con una máscara centrada — el clip que faltaba y desarmaba
    // los vectores —, «contener» muestra entero) × la escala de la capa
    L.push(`__encaje = __encajar(capa, ${num(capa.ancho)}, ${num(capa.alto)}, ${num(capa.escala ?? 1)}, ${capa.ajuste === "contener" ? "true" : "false"});`);
    L.push(`} else {`);
    L.push(`capa = comp.layers.addSolid([0.5, 0.5, 0.55], ${cadena(capa.nombre)}, ${num(capa.ancho)}, ${num(capa.alto)}, 1);`);
    L.push(`capa.comment = ${cadena(`falta ${ruta}: descomprimi el zip ENTERO y deja assets/ al lado del .jsx`)};`);
    L.push(`__encaje = 100;`);
    L.push(`}`);
    const animMedia = hornearCon(0);
    emitirComunes(L, capa, sinAnimacion, true, animMedia);
    emitirTransform(L, capa, 0, sinAnimacion, true, animMedia?.claves ?? null);
    return;
  }
  L.push(`capa = comp.layers.addSolid([0.5, 0.5, 0.55], ${cadena(capa.nombre)}, ${num(capa.ancho)}, ${num(capa.alto)}, 1);`);
  const animSolido = hornearCon(0);
  emitirComunes(L, capa, sinAnimacion, false, animSolido);
  emitirTransform(L, capa, 0, sinAnimacion, false, animSolido?.claves ?? null);
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
// RELEEMOS cual agarro. Un candidato EXACTO gana; si ninguno pega pero AE
// resolvio alguna cara de la MISMA familia (peso 400 en una familia sin
// Regular, p. ej.), nos quedamos con esa y la capa lo anota; si ni eso,
// la capa recuerda la original y el resumen final lista las faltantes.
var __fuentesFaltantes = [];
function __fijarFuente(capaTexto, candidatos, base, original) {
  var prop = capaTexto.property("ADBE Text Properties").property("ADBE Text Document");
  var baseMin = base.toLowerCase();
  var mejor = null;
  var primero = null;
  for (var i = 0; i < candidatos.length; i++) {
    try {
      var v = prop.value;
      v.font = candidatos[i];
      prop.setValue(v);
      var puesto = String(prop.value.font);
      if (primero === null) primero = puesto;
      if (puesto.toLowerCase() === candidatos[i].toLowerCase()) return;
      if (!mejor && puesto.toLowerCase().indexOf(baseMin) === 0) mejor = puesto;
    } catch (e) {}
  }
  if (mejor) {
    try { var v2 = prop.value; v2.font = mejor; prop.setValue(v2); } catch (e2) {}
    capaTexto.comment = (capaTexto.comment ? capaTexto.comment + " | " : "") + "tipografia aproximada: pedida " + original + ", AE puso " + mejor;
    __avisar("fuente " + original + ": ningun nombre PS pego exacto, quedo " + mejor);
    return;
  }
  __fuentesFaltantes.push(original);
  capaTexto.comment = (capaTexto.comment ? capaTexto.comment + " | " : "") + "tipografia original: " + original;
  __avisar("fuente " + original + ": ningun candidato existe; AE resolvio " + primero + " para " + candidatos[0]);
}
function __t(capa, nombre) { return capa.property("ADBE Transform Group").property(nombre); }
function __eases(par, n) {
  var e = par ? new KeyframeEase(par[0], __clamp(par[1], 0.1, 100)) : new KeyframeEase(0, 33.3333);
  var lista = [];
  for (var i = 0; i < n; i++) lista.push(e);
  return lista;
}
var __avisos = [];
// OJO: los errores nativos de AE NO se pueden concatenar con + (el operador
// de ExtendScript los rechaza: "Object of type Error found where a Number,
// Array, or Property is needed" -- y ESO si aborta el script). El detalle
// se lee por .message, con red por si tampoco.
function __detalle(e) {
  try { return String(e.message !== undefined ? e.message : e); } catch (x) { return "error sin detalle"; }
}
function __avisar(texto, e) {
  var linea = String(texto);
  if (e !== undefined) linea += ": " + __detalle(e);
  for (var i = 0; i < __avisos.length; i++) if (__avisos[i] === linea) return;
  if (__avisos.length < 12) __avisos.push(linea);
}
// Encaje FIEL al editor: escala UNIFORME (cubrir = llenar la caja recortando
// con una MASCARA centrada, contener = entera con aire) x la escala propia.
// Devuelve el porcentaje de escala puesto (el reposo del footage) para que
// una escala ANIMADA se componga encima (__reescalar).
var __encaje = 100;
function __encajar(capa, w, h, extra, contener) {
  try {
    var sw = Math.max(1, capa.source.width);
    var sh = Math.max(1, capa.source.height);
    var f = contener ? Math.min(w / sw, h / sh) : Math.max(w / sw, h / sh);
    var s = f * extra * 100;
    __t(capa, "ADBE Scale").setValue([s, s]);
    if (!contener && (sw * f > w + 0.5 || sh * f > h + 0.5)) {
      var mw = w / f;
      var mh = h / f;
      var m = capa.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
      var forma = new Shape();
      forma.vertices = [
        [(sw - mw) / 2, (sh - mh) / 2],
        [(sw - mw) / 2, (sh + mh) / 2],
        [(sw + mw) / 2, (sh + mh) / 2],
        [(sw + mw) / 2, (sh - mh) / 2]
      ];
      forma.closed = true;
      m.property("ADBE Mask Shape").setValue(forma);
    }
    return s;
  } catch (e) { __avisar("encaje de " + capa.name, e); return 100; }
}
function __reescalar(claves, s) {
  var lista = [];
  for (var i = 0; i < claves.length; i++) {
    var c = claves[i];
    var o = { t: c.t, v: [c.v[0] * s / 100, c.v[1] * s / 100] };
    if (c.ei) o.ei = [c.ei[0] * s / 100, c.ei[1]];
    if (c.eo) o.eo = [c.eo[0] * s / 100, c.eo[1]];
    if (c.hold) o.hold = true;
    lista.push(o);
  }
  return lista;
}
// Estilos POR RANGO de caracteres (rich text de Figma: dos tipografias en un
// titulo, un color por palabra). Necesita la API characterRange (AE 24.3+):
// en un AE mas viejo degrada avisado y queda el estilo base de la capa.
function __tramo(capaTexto, ini, fin, candidatos, base, original, tamano, color) {
  var prop = capaTexto.property("ADBE Text Properties").property("ADBE Text Document");
  try {
    var td = prop.value;
    if (!td.characterRange) {
      __avisar("estilos por rango (" + original + "): tu AE no tiene characterRange (necesita 24.3+)");
      return;
    }
    var r = td.characterRange(ini, fin);
    if (tamano !== null) r.fontSize = tamano;
    if (color !== null) { r.applyFill = true; r.fillColor = color; }
    prop.setValue(td);
    if (candidatos) {
      var baseMin = base.toLowerCase();
      var puesto = null;
      for (var i = 0; i < candidatos.length; i++) {
        try {
          td = prop.value;
          td.characterRange(ini, fin).font = candidatos[i];
          prop.setValue(td);
          puesto = String(prop.value.characterRange(ini, fin).font);
          if (puesto.toLowerCase() === candidatos[i].toLowerCase()) return;
          if (puesto.toLowerCase().indexOf(baseMin) === 0) return;
        } catch (eC) {}
      }
      __fuentesFaltantes.push(original);
      __avisar("tramo " + original + ": ningun candidato existe; AE resolvio " + puesto);
    }
  } catch (e) { __avisar("tramo " + original, e); }
}
function __pista(prop, claves, dims) {
  var i;
  for (i = 0; i < claves.length; i++) prop.setValueAtTime(claves[i].t, claves[i].v);
  for (i = 0; i < claves.length; i++) {
    var c = claves[i];
    if (c.hold) {
      try { prop.setInterpolationTypeAtKey(i + 1, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.HOLD); } catch (e) { __avisar("hold", e); }
    } else if (c.ei || c.eo) {
      // BEZIER explicito ANTES del ease: sin esto algunas versiones dejan
      // el keyframe lineal en silencio (visto en AE real)
      try { prop.setInterpolationTypeAtKey(i + 1, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER); } catch (e) { __avisar("bezier", e); }
      try { prop.setTemporalEaseAtKey(i + 1, __eases(c.ei, dims), __eases(c.eo, dims)); } catch (e) { __avisar("ease", e); }
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
  L.push(`var comp, capa, doc, fx, gr, forma, tr, fuente, sh;`);

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
      for (const capa of g.capas) emitirCapa(L, capa, sinAnimacion, rutasMedia, escena);
    });
    const emitirContenido = () => {
      for (const fila of filas) {
        if (fila.tipo === "capa") {
          emitirCapa(L, fila.capa, sinAnimacion, rutasMedia, escena);
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
  L.push(`if (__avisos.length) alert("Avisos tecnicos del import (mandale una captura de esto a motion):\\n- " + __avisos.join("\\n- "));`);
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
