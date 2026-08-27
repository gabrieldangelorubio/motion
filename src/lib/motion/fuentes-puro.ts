/* -----------------------------------------------------------------------------
   Tipografías de una composición — detección y carga

   La parte pura: qué familias usa la composición (la primera familia real de
   cada stack, sin las genéricas). La parte browser: cargar una familia desde
   Google Fonts (fetch del CSS + FontFace por cada @font-face, así el fallo
   es detectable — un <link> falla en silencio) o desde un archivo subido.
   Nunca se sustituye en silencio: lo que falta se marca y el usuario decide.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";

const GENERICAS = new Set([
  "sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui",
  "-apple-system", "blinkmacsystemfont", "segoe ui", "roboto", "helvetica",
  "arial", "ui-monospace", "sf pro text", "sf pro display",
]);

/** Primera familia real de un stack CSS ("'Neue Machina', -apple-system, …" → "Neue Machina"). */
export function familiaPrincipal(stack: string): string | null {
  for (const cruda of stack.split(",")) {
    const nombre = cruda.trim().replace(/^['"]|['"]$/g, "");
    if (!nombre) continue;
    if (GENERICAS.has(nombre.toLowerCase())) return null; // el stack ya arranca en el sistema
    return nombre;
  }
  return null;
}

/** Familias reales que usa la composición, con los pesos que cada una necesita. */
export function familiasDeComposicion(comp: Composicion): { familia: string; pesos: number[] }[] {
  const porFamilia = new Map<string, Set<number>>();
  const sumar = (cruda: string, peso: number) => {
    const familia = familiaPrincipal(cruda);
    if (!familia) return;
    if (!porFamilia.has(familia)) porFamilia.set(familia, new Set());
    porFamilia.get(familia)!.add(peso);
  };
  for (const capa of comp.capas) {
    if (capa.tipo !== "texto") continue;
    sumar(capa.fuente.familia, capa.fuente.peso);
    // los tramos de rich text pueden traer una SEGUNDA tipografía
    for (const tramo of capa.tramos ?? []) {
      if (tramo.familia) sumar(tramo.familia, tramo.peso ?? capa.fuente.peso);
    }
  }
  return [...porFamilia.entries()].map(([familia, pesos]) => ({
    familia,
    pesos: [...pesos].sort((a, b) => a - b),
  }));
}

/* ——— Browser (sin React): carga real de fuentes ——— */

let ctxMedidor: CanvasRenderingContext2D | null = null;

/**
 * ¿La familia está realmente disponible para pintar?
 * OJO: document.fonts.check() devuelve true para CUALQUIER familia que no
 * está en el FontFaceSet (la asume "del sistema") — inútil para detectar
 * faltantes. La detección confiable es la clásica por medición: si el texto
 * mide EXACTAMENTE igual que con monospace y que con serif, la familia no
 * existe y está cayendo al fallback.
 */
export function familiaDisponible(familia: string, peso = 400): boolean {
  if (typeof document === "undefined") return true;
  if (!ctxMedidor) ctxMedidor = document.createElement("canvas").getContext("2d");
  const ctx = ctxMedidor;
  if (!ctx) return true;
  const muestra = "abmw QWIlij 019 —";
  const medir = (font: string) => {
    ctx.font = font;
    return ctx.measureText(muestra).width;
  };
  const conMono = medir(`${peso} 48px "${familia}", monospace`);
  const soloMono = medir(`${peso} 48px monospace`);
  if (conMono !== soloMono) return true;
  const conSerif = medir(`${peso} 48px "${familia}", serif`);
  const soloSerif = medir(`${peso} 48px serif`);
  return conSerif !== soloSerif;
}

/** Parsea los @font-face de un CSS de Google Fonts a descriptores cargables. */
export function parsearFontFaces(css: string): { url: string; peso: string; estilo: string; rango?: string }[] {
  const caras: { url: string; peso: string; estilo: string; rango?: string }[] = [];
  for (const bloque of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const url = bloque.match(/src:\s*url\(([^)]+)\)/)?.[1];
    if (!url) continue;
    caras.push({
      url,
      peso: bloque.match(/font-weight:\s*([^;]+);/)?.[1].trim() ?? "400",
      estilo: bloque.match(/font-style:\s*([^;]+);/)?.[1].trim() ?? "normal",
      rango: bloque.match(/unicode-range:\s*([^;]+);/)?.[1].trim(),
    });
  }
  return caras;
}

/**
 * Intenta cargar una familia desde Google Fonts. Prueba primero el rango
 * variable (100..900) y cae a los pesos pedidos como estáticos.
 * Devuelve ok:false con motivo legible si la fuente no está en Google.
 */
export async function cargarDeGoogleFonts(
  familia: string,
  pesos: number[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nombreUrl = familia.trim().replace(/\s+/g, "+");
  const candidatas = [
    `https://fonts.googleapis.com/css2?family=${nombreUrl}:wght@100..900&display=swap`,
    `https://fonts.googleapis.com/css2?family=${nombreUrl}:wght@${[...new Set([400, ...pesos])].sort((a, b) => a - b).join(";")}&display=swap`,
    `https://fonts.googleapis.com/css2?family=${nombreUrl}&display=swap`,
  ];
  for (const urlCss of candidatas) {
    try {
      const res = await fetch(urlCss);
      if (!res.ok) continue;
      const caras = parsearFontFaces(await res.text());
      if (caras.length === 0) continue;
      await Promise.all(
        caras.map(async (cara) => {
          const fuente = new FontFace(familia, `url(${cara.url})`, {
            weight: cara.peso,
            style: cara.estilo,
            unicodeRange: cara.rango,
          });
          await fuente.load();
          document.fonts.add(fuente);
        }),
      );
      return { ok: true };
    } catch {
      // probar la siguiente variante
    }
  }
  return { ok: false, error: `«${familia}» no está en Google Fonts (o no responde): subí el archivo de la fuente` };
}

/** Carga una familia desde un archivo subido (.otf/.ttf/.woff/.woff2). */
export async function cargarDeArchivo(
  familia: string,
  datos: ArrayBuffer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const fuente = new FontFace(familia, datos, { weight: "100 900" });
    await fuente.load();
    document.fonts.add(fuente);
    return { ok: true };
  } catch {
    // algunos formatos no aceptan el rango variable: reintento sin descriptor
    try {
      const fuente = new FontFace(familia, datos);
      await fuente.load();
      document.fonts.add(fuente);
      return { ok: true };
    } catch {
      return { ok: false, error: `El archivo no se pudo leer como una fuente válida para «${familia}»` };
    }
  }
}
