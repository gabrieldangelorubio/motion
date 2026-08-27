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
export type Transcripcion = { texto: string; oraciones: Oracion[] };

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
