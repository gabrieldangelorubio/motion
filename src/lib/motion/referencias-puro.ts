/* -----------------------------------------------------------------------------
   Referencias visuales para el director — la parte PURA

   El usuario adjunta al CHAT un video (o una imagen) de referencia: «que se
   mueva como esto». El cliente extrae frames en orden (referencias.ts, DOM)
   y acá se decide QUÉ instantes muestrear y CÓMO contárselo al director —
   el texto que acompaña a las imágenes para que las lea como un director
   (dirección, easing percibido, ritmo del stagger, cámara) y TRADUZCA ese
   carácter a nuestras herramientas, sin copiar el contenido ajeno.

   Primer paso del módulo M8 del blueprint (la medición CV viene después):
   acá mira y traduce a criterio; medir curvas contra el video es backlog.
----------------------------------------------------------------------------- */

/** Cuántos frames viajan de un video de referencia: suficientes para leer
    el ARCO del movimiento (entrada, medio, reposo, salida) sin inflar el
    costo del pedido — cada frame son tokens de visión. */
export const MAX_FRAMES_REFERENCIA = 8;

/** Los instantes (ms) a muestrear de un video de referencia: uniformes,
    con el primero en 0 y el último ANTES del final exacto (el último frame
    de un video suele ser negro o repetido; ε = 2% del largo). Un video
    corto muestrea menos: nunca más de un frame cada 150ms. */
export function instantesDeMuestreo(duracionMs: number, maxFrames = MAX_FRAMES_REFERENCIA): number[] {
  if (!(duracionMs > 0)) return [0];
  const n = Math.max(2, Math.min(maxFrames, Math.floor(duracionMs / 150) + 1));
  const fin = duracionMs * 0.98;
  return Array.from({ length: n }, (_, i) => Math.round((fin * i) / (n - 1)));
}

/** ¿Este instante necesita un SEEK real (y esperar `seeked`)? El primero
    suele ser 0 y el video recién cargado YA está ahí: pedir un seek al
    mismo tiempo puede no disparar `seeked` (la spec lo permite saltear —
    Chromium lo dispara, Safari no siempre) y colgaría hasta el timeout.
    Determinista: tras buscar t_i, la posición ES t_i. */
export function necesitaSeek(posicionActualMs: number, destinoMs: number): boolean {
  return Math.abs(posicionActualMs - destinoMs) > 1;
}

/** MIME inferido por extensión cuando File.type viene VACÍO («» es un caso
    real de .mov según SO/gestor de archivos): el accept invita a subirlo,
    rechazarlo en silencio sería mentirle al usuario. */
export function tipoPorNombre(nombre: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(nombre)?.[1]?.toLowerCase() ?? "";
  if (["mov", "mp4", "m4v", "webm", "mkv", "avi"].includes(ext)) return `video/${ext === "mov" ? "quicktime" : ext}`;
  if (["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
  return "";
}

/** Tope del ARCHIVO de video que viaja inline al analista (Gemini lee el
    video nativo por generateContent; el request inline aguanta ~20MB y el
    base64 infla ×1.37 — 13MB de archivo deja margen para el prompt). Un
    video más pesado degrada a frames-solos, avisado. */
export const LIMITE_BYTES_VIDEO = 13_000_000;

/** El MIME como lo espera Gemini (File.type dice video/quicktime para un
    .mov; la API lo lista como video/mov). Devuelve "" si no es un video
    que la API declare soportar. */
export function mimeParaGemini(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "video/quicktime") return "video/mov";
  if (["video/mp4", "video/mpeg", "video/mov", "video/avi", "video/x-flv", "video/mpg", "video/webm", "video/wmv", "video/3gpp"].includes(m)) return m;
  return "";
}

/** El prompt del ANALISTA de movimiento (Gemini Flash, que VE el video
    entero): destilar la coreografía a un análisis que el director pueda
    ejecutar con nuestro vocabulario — timestamps, dirección, easing
    percibido, staggers, cámara y cortes. Nada de contenido ajeno. */
export function promptAnalisisReferencia(nombre: string, duracionMs?: number): string {
  const dur = duracionMs ? ` (dura ${(duracionMs / 1000).toFixed(1)}s)` : "";
  return `Sos un analista de motion design. Mirá el video «${nombre}»${dur} COMPLETO y destilá su COREOGRAFÍA — el movimiento, no el contenido — para que otro director la reproduzca sobre otra pieza.

Respondé en castellano, compacto y ejecutable, con esta estructura:
1. CARÁCTER GLOBAL (1-2 líneas): ritmo (frenético/pausado), energía (snappy/suave/mecánico), si parece animado a bajos fps (stop-motion, en doses) o fluido.
2. LÍNEA DE TIEMPO: cada evento de movimiento con su timestamp aproximado — «0.0-0.4s: el título entra desde abajo, frena suave (ease-out fuerte, tipo expo)». Incluí TODOS los cortes de escena/plano si los hay.
3. POR ELEMENTO: qué se mueve, desde dónde, cuánto tarda, y el easing PERCIBIDO nombrado en este vocabulario: lineal, salidaSine/Quad/Cubic/Expo (frena suave→fuerte), entradaExpo (acelera al salir), salidaBack (pasa de largo y vuelve), salidaElastico (rebota elástico), salidaPique (pica como pelota), escalones (a saltos mecánicos), resortes. Si algo aparece/desaparece de golpe (sin interpolación), decilo: «corte seco» o «switch».
4. STAGGERS: si hay elementos en cascada (letras, palabras, líneas, items), el orden (inicio/fin/centro/bordes/azar) y el Δt aproximado entre unidades en ms.
5. CÁMARA: paneos, zooms, shakes — o «quieta».
6. TEXTO EN MOVIMIENTO: si hay tipografía cinética, describí el MECANISMO (¿las palabras se reemplazan en el mismo lugar? ¿entran por máscara? ¿escalan? ¿cuántas palabras por segundo?).

NO describas colores, marcas ni el contenido de los textos salvo que el mecanismo lo necesite. Números concretos siempre que puedas (ms, cantidad de unidades).`;
}

/** El bloque que viaja al DIRECTOR cuando el analista leyó el video
    entero: el análisis es la lectura principal, los frames el apoyo. */
export function contextoConAnalisis(contextoCliente: string, analisis: string, modelo: string): string {
  return `${contextoCliente}\n\nANÁLISIS DEL MOVIMIENTO (un analista —${modelo}— vio el video COMPLETO frame a frame; esta es la lectura principal de la referencia, los frames adjuntos son apoyo visual):\n${analisis}`;
}

export type MetaReferencia = {
  nombre: string;
  tipo: "video" | "imagen";
  /** solo video: duración del archivo e instantes muestreados (ms) */
  duracionMs?: number;
  instantes?: number[];
};

/** El bloque de texto que viaja en el primer turno junto a las imágenes:
    le dice al director QUÉ está mirando (los frames en orden, con sus
    tiempos) — la regla de CÓMO leerlo vive en el system prompt. */
export function contextoDeReferencias(refs: MetaReferencia[]): string {
  if (refs.length === 0) return "";
  const lineas = refs.map((ref) => {
    if (ref.tipo === "imagen") {
      return `REFERENCIA ADJUNTA «${ref.nombre}» (imagen quieta): leé la intención compositiva y proponé el movimiento acorde.`;
    }
    const seg = ((ref.duracionMs ?? 0) / 1000).toFixed(1);
    const tiempos = (ref.instantes ?? []).map((ms) => `${(ms / 1000).toFixed(2)}s`).join(", ");
    return `REFERENCIA ADJUNTA «${ref.nombre}» (video de ${seg}s): las imágenes son sus frames EN ORDEN cronológico, tomados en ${tiempos}. Estudiá el movimiento entre frames y traducí ese carácter a esta pieza.`;
  });
  return lineas.join("\n");
}
