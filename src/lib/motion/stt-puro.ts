/* -----------------------------------------------------------------------------
   STT — la parte pura: preparar PCM para Whisper

   Whisper come mono a 16 kHz. Acá viven la mezcla a mono y el remuestreo
   (interpolación lineal: para VOZ alcanza sobrado y no mete dependencias).
   Números adentro, números afuera — testeable en node.
----------------------------------------------------------------------------- */

/** Mezcla N canales a mono promediando muestra a muestra. */
export function aMono(canales: ArrayLike<number>[]): Float32Array {
  if (canales.length === 0) return new Float32Array(0);
  if (canales.length === 1) return Float32Array.from(canales[0]);
  const largo = Math.min(...canales.map((c) => c.length));
  const mono = new Float32Array(largo);
  for (let i = 0; i < largo; i++) {
    let suma = 0;
    for (const canal of canales) suma += canal[i];
    mono[i] = suma / canales.length;
  }
  return mono;
}

/** Remuestreo por interpolación lineal. Mismo rate = copia tal cual. */
export function remuestrear(pcm: ArrayLike<number>, deHz: number, aHz: number): Float32Array {
  if (deHz === aHz || pcm.length === 0) return Float32Array.from(pcm);
  const largo = Math.max(1, Math.round((pcm.length * aHz) / deHz));
  const salida = new Float32Array(largo);
  const paso = (pcm.length - 1) / Math.max(1, largo - 1);
  for (let i = 0; i < largo; i++) {
    const pos = i * paso;
    const izq = Math.floor(pos);
    const der = Math.min(pcm.length - 1, izq + 1);
    const f = pos - izq;
    salida[i] = pcm[izq] * (1 - f) + pcm[der] * f;
  }
  return salida;
}

export type Oracion = { texto: string; desdeMs: number; hastaMs: number };
/** Una palabra con su lugar exacto en el audio: la unidad para ubicar
    keyframes sobre la locución. */
export type Palabra = { texto: string; desdeMs: number; hastaMs: number };
export type Transcripcion = {
  texto: string;
  oraciones: Oracion[];
  /** timestamps POR PALABRA (Whisper word-level); ausente en
      transcripciones viejas o si el modelo no los da — degradar */
  palabras?: Palabra[];
};

/** Trozos crudos de Whisper (texto + [desdeS, hastaS]) → oraciones en ms.
    Un hastaS nulo (el último trozo a veces no cierra) hereda el fin del
    audio; trozos vacíos se descartan. */
export function oracionesDeTrozos(
  trozos: { text: string; timestamp: [number, number | null] }[],
  duracionMs: number,
): Oracion[] {
  const oraciones: Oracion[] = [];
  for (const trozo of trozos) {
    const texto = trozo.text.trim();
    if (!texto) continue;
    const desdeMs = Math.max(0, Math.round((trozo.timestamp[0] ?? 0) * 1000));
    const hastaMs = trozo.timestamp[1] == null ? duracionMs : Math.round(trozo.timestamp[1] * 1000);
    oraciones.push({ texto, desdeMs, hastaMs: Math.max(desdeMs, hastaMs) });
  }
  return oraciones;
}

/** Trozos POR PALABRA de Whisper → palabras en ms (misma limpieza que las
    oraciones: vacíos afuera, fin nulo hereda el fin del audio). */
export function palabrasDeTrozos(
  trozos: { text: string; timestamp: [number, number | null] }[],
  duracionMs: number,
): Palabra[] {
  return oracionesDeTrozos(trozos, duracionMs);
}

/** Agrupa palabras en ORACIONES legibles: cierra donde la palabra termina
    en puntuación final (. ! ? …) o donde el silencio hasta la próxima
    supera `pausaMs` — las pausas de la locución también son cortes. */
export function oracionesDePalabras(palabras: Palabra[], pausaMs = 700): Oracion[] {
  const oraciones: Oracion[] = [];
  let actual: Palabra[] = [];
  const cerrar = () => {
    if (actual.length === 0) return;
    oraciones.push({
      texto: actual.map((p) => p.texto).join(" "),
      desdeMs: actual[0].desdeMs,
      hastaMs: actual[actual.length - 1].hastaMs,
    });
    actual = [];
  };
  palabras.forEach((palabra, i) => {
    actual.push(palabra);
    const siguiente = palabras[i + 1];
    const cierraPuntuacion = /[.!?…]["')\]]?$/.test(palabra.texto);
    const cierraPausa = siguiente ? siguiente.desdeMs - palabra.hastaMs > pausaMs : true;
    if (cierraPuntuacion || cierraPausa) cerrar();
  });
  cerrar();
  return oraciones;
}
