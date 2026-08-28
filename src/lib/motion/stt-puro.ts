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

/** Limpia los LOOPS de decodificación de Whisper: cuando se traba, mete la
    misma palabra decenas de veces seguidas (con avances de tiempo casi
    nulos). Se colapsa una repetición consecutiva idéntica cuando casi no
    avanza (< `avanceMs` entre inicios) y toda racha idéntica de 4 o más se
    reduce a una sola — un «no, no, no» legítimo (3 veces, con tiempos
    reales) sobrevive. */
export function limpiarPalabras(palabras: Palabra[], avanceMs = 60): Palabra[] {
  const limpias: Palabra[] = [];
  let racha = 0;
  for (const palabra of palabras) {
    const previa = limpias[limpias.length - 1];
    const igual = previa !== undefined && previa.texto.toLowerCase() === palabra.texto.toLowerCase();
    if (igual) {
      racha++;
      // casi sin avance = el loop clásico; racha larga = loop aunque avance
      if (palabra.desdeMs - previa.desdeMs < avanceMs || racha >= 3) {
        // la racha ya era sospechosa: si venía acumulando, podar a UNA
        if (racha >= 3) {
          while (
            limpias.length >= 2 &&
            limpias[limpias.length - 2].texto.toLowerCase() === palabra.texto.toLowerCase()
          ) {
            limpias.pop();
          }
        }
        continue;
      }
    } else {
      racha = 0;
    }
    limpias.push(palabra);
  }
  return limpias;
}

/** Mueve la palabra `indice` a `desdeMs` (misma duración) y devuelve la
    lista ORDENADA por tiempo — el orden del array siempre es el orden
    temporal: sin esto, una palabra corrida detrás de otra rompe los anchos
    del carril y queda inagarrable. */
export function moverPalabraLista(palabras: Palabra[], indice: number, desdeMs: number): Palabra[] {
  const p = palabras[indice];
  if (!p) return palabras;
  const dur = p.hastaMs - p.desdeMs;
  const desde = Math.max(0, desdeMs);
  const nuevas = palabras.map((x, i) => (i === indice ? { ...x, desdeMs: desde, hastaMs: desde + dur } : x));
  return nuevas.sort((a, b) => a.desdeMs - b.desdeMs);
}

/** Inserta una palabra nueva EN ORDEN temporal (whisper se la olvidó, o el
    corrector la quiere a mano). */
export function agregarPalabraLista(palabras: Palabra[], palabra: Palabra): Palabra[] {
  return [...palabras, palabra].sort((a, b) => a.desdeMs - b.desdeMs);
}

/** Renombra la palabra `indice`; un texto vacío la deja como estaba. */
export function renombrarPalabraLista(palabras: Palabra[], indice: number, texto: string): Palabra[] {
  const limpio = texto.trim();
  if (!limpio || !palabras[indice]) return palabras;
  return palabras.map((x, i) => (i === indice ? { ...x, texto: limpio } : x));
}

/** transformers.js (≤2.17) pasa `num_frames` en frames del MEL (hop de
    10ms) al alinear palabras, pero la máscara del DTW vive sobre la salida
    del ENCODER, que va a la MITAD de resolución (conv stride 2, 20ms por
    frame): whisper oficial (python) hace `num_frames // 2` y el port JS lo
    perdió. Sin el ÷2, con audio < 30s el alineador VE EL DOBLE del audio
    real (relleno de silencio incluido) y las palabras derivan hacia el
    final — medido con jfk.wav (11s): timestamps hasta 21980ms ≈ 2× sin
    corregir, 0 fuera del audio con la corrección. null pasa de largo. */
export function framesDeEncoder(framesMel: number | null | undefined): number | null {
  return framesMel == null ? null : Math.floor(framesMel / 2);
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
