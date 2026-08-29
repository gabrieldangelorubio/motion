/* -----------------------------------------------------------------------------
   estadoEn(composicion, t) — el corazón del motor

   Devuelve el árbol de capas RESUELTO para un instante: números listos para
   pintar, sin nada pendiente. Es la única función que combina base + presets
   + pistas crudas + escalonado + motion blur, y es PURA: mismo (comp, t) →
   mismo estado, siempre. El preview y el export llaman exactamente esto.

   Orden de aplicación por capa (importa):
   1. estado base (x, y, escala, rotación, opacidad declaradas en la capa)
   2. pistas crudas de keyframes (valores ABSOLUTOS que pisan la base)
   3. offsets de presets entrada/salida (RELATIVOS, con escalonado por unidad)
   4. motion blur sintetizado desde la velocidad del easing del segmento
----------------------------------------------------------------------------- */

import type { Capa, Composicion, Keyframe, Segmento, TemblorCamara } from "@/lib/motion/modelo";
import { easing, velocidadEn } from "@/lib/motion/easings-puro";
import { interpolar, delaysEscalonado } from "@/lib/motion/keyframes-puro";
import { compilarSegmento, type PresetCompilado, type PistaRelativa } from "@/lib/motion/presets-puro";

export type EstadoUnidad = {
  dx: number;
  dy: number;
  dEscala: number;
  opacidad: number;
  desenfoque: number;
  /** desenfoque direccional sintetizado, px por eje */
  blurX: number;
  blurY: number;
  /** rotación de la unidad alrededor de su centro, grados */
  dRotacion: number;
  /** la unidad se pinta recortada a su caja de reposo (revelado con máscara) */
  recorte: boolean;
  /** trim del trazo resuelto 0–1 (sólo significa algo en capas tipo trazo) */
  trazoInicio: number;
  trazoFin: number;
};

export type EstadoCapa = {
  capa: Capa;
  x: number;
  y: number;
  escala: number;
  rotacion: number;
  opacidad: number;
  visible: boolean;
  /** el texto con el CONTADOR aplicado (pista «numero»): la primera cifra
      del contenido reemplazada por el valor interpolado — ausente si la
      capa no cuenta. pintar() lo prefiere sobre capa.texto */
  textoVivo?: string;
  /** una por unidad de división (1 sola si la capa no se divide) */
  unidades: EstadoUnidad[];
};

export type EstadoComposicion = {
  ancho: number;
  alto: number;
  fondo: string;
  capas: EstadoCapa[];
  /** cámara resuelta; identidad = centro del lienzo con zoom 1 */
  camara: { x: number; y: number; zoom: number };
};

/** Cantidad de unidades animables de una capa (caracteres, palabras o líneas del texto). */
export function cantidadUnidades(capa: Capa): number {
  if (capa.tipo !== "texto" || capa.division === "ninguna") return 1;
  if (capa.division === "lineas") return capa.texto.split("\n").length || 1;
  if (capa.division === "palabras") {
    return capa.texto.split(/\s+/).filter(Boolean).length || 1;
  }
  return [...capa.texto.replace(/\s/g, "")].length || 1;
}

/** Alto de una unidad de la capa, la escala de los presets `relativo`
    (revelar/ocultar). Para texto, NUNCA menos que el glifo completo (1.2×
    el cuerpo): con interlineado APRETADO (display al 80%) el viaje del
    revelado y su máscara tienen que cubrir ascendentes y descendentes — si
    no, la máscara corta el texto en su posición FINAL y la base de las
    letras aparece de golpe cuando la ventana de recorte se apaga (con el
    supersampling temporal, una banda semitransparente). El interlineado de
    PINTADO no cambia: esto es sólo el viaje y la máscara. */
export function altoUnidad(capa: Capa): number {
  if (capa.tipo === "texto") {
    const tamano = capa.fuente.tamano;
    return Math.max(capa.fuente.interlineado ?? tamano * 1.15, tamano * 1.2);
  }
  return capa.alto;
}

function offsetDe(pista: PistaRelativa[keyof PistaRelativa], p: number): number {
  if (!pista || pista.length === 0) return 0;
  if (p <= pista[0].p) return pista[0].v;
  const ultimo = pista[pista.length - 1];
  if (p >= ultimo.p) return ultimo.v;
  let i = 0;
  while (i < pista.length - 1 && pista[i + 1].p <= p) i++;
  const a = pista[i];
  const b = pista[i + 1];
  const f = (p - a.p) / (b.p - a.p);
  return a.v + (b.v - a.v) * f;
}

function aplicarSegmento(
  unidad: EstadoUnidad,
  seg: Segmento,
  compilado: PresetCompilado,
  clase: "entrada" | "salida",
  t: number,
  delay: number,
  motionBlur: number,
  alto: number,
  factorTracking: number,
): void {
  const inicio = seg.en + delay;
  const bruto = (t - inicio) / seg.duracion;
  const fn = easing(seg.easing);
  const p = fn(Math.min(1, Math.max(0, bruto)));

  // En presets `relativo` los dy son múltiplos del alto de la unidad, no px:
  // así «revelar» funciona igual en un título de 200px que en un caption de 18px.
  const escalaDy = compilado.relativo ? alto : 1;
  // En presets `tracking` los dx son POR ÍNDICE desde el centro: la unidad
  // del medio no se mueve y las puntas se abren/cierran proporcionalmente.
  const escalaDx = compilado.tracking ? factorTracking : 1;
  unidad.dx += offsetDe(compilado.pista.dx, p) * escalaDx;
  unidad.dy += offsetDe(compilado.pista.dy, p) * escalaDy;
  unidad.dEscala += offsetDe(compilado.pista.dEscala, p);
  unidad.opacidad += offsetDe(compilado.pista.dOpacidad, p);
  unidad.desenfoque += offsetDe(compilado.pista.desenfoque, p);
  unidad.dRotacion += offsetDe(compilado.pista.dRotacion, p);
  unidad.trazoInicio += offsetDe(compilado.pista.dTrazoInicio, p);
  unidad.trazoFin += offsetDe(compilado.pista.dTrazoFin, p);

  // El recorte de máscara sólo está activo mientras hace falta esconder algo:
  // una entrada deja de recortar cuando terminó (t ≥ fin → la unidad está en
  // reposo), una salida recorta desde que arranca en adelante. Fuera de esas
  // ventanas los ascendentes/descendentes se pintan sin cortar.
  if (compilado.recorte) {
    if (clase === "entrada" ? t < inicio + seg.duracion : t >= inicio) unidad.recorte = true;
  }

  // Motion blur sintetizado: |velocidad del easing| × distancia recorrida en
  // un intervalo de obturación de 60 fps, a la mitad (la std de un gaussiano
  // es ≈ media smear), sólo mientras el segmento está activo.
  if (motionBlur > 0 && !compilado.desenfoquePropio && compilado.distancia > 0 && bruto > 0 && bruto < 1) {
    const v = Math.abs(velocidadEn(fn, bruto)) * (compilado.distancia / seg.duracion);
    const blur = Math.min(40, v * 16.7 * 0.5 * motionBlur);
    if (compilado.eje === "x") unidad.blurX = Math.max(unidad.blurX, blur);
    else if (compilado.eje === "y") unidad.blurY = Math.max(unidad.blurY, blur);
    else {
      unidad.blurX = Math.max(unidad.blurX, blur / 2);
      unidad.blurY = Math.max(unidad.blurY, blur / 2);
    }
  }
}

/** El texto con el contador puesto: la PRIMERA cifra (con . o , adentro)
    reemplazada por el valor redondeado — «STOCK:171» + 98.4 → «STOCK:98». */
export function textoConNumero(texto: string, valor: number): string {
  return texto.replace(/\d[\d.,]*/, String(Math.round(valor)));
}

function estadoDeCapa(capa: Capa, t: number): EstadoCapa {
  const pistas = capa.pistas ?? {};
  const base: EstadoCapa = {
    capa,
    x: pistas.x ? interpolar(pistas.x, t) : capa.x,
    y: pistas.y ? interpolar(pistas.y, t) : capa.y,
    escala: pistas.escala ? interpolar(pistas.escala, t) : (capa.escala ?? 1),
    rotacion: pistas.rotacion ? interpolar(pistas.rotacion, t) : (capa.rotacion ?? 0),
    opacidad: pistas.opacidad ? interpolar(pistas.opacidad, t) : (capa.opacidad ?? 1),
    visible: !capa.oculta,
    textoVivo:
      capa.tipo === "texto" && pistas.numero
        ? textoConNumero(capa.texto, interpolar(pistas.numero, t))
        : undefined,
    unidades: [],
  };

  const n = cantidadUnidades(capa);
  const alto = altoUnidad(capa);
  const clases: ("entrada" | "salida")[] = ["entrada", "salida"];
  const segmentos: { seg: Segmento; compilado: PresetCompilado; clase: "entrada" | "salida"; delays: number[] }[] = [];
  for (const clase of clases) {
    const seg = capa[clase];
    if (!seg) continue;
    segmentos.push({
      seg,
      compilado: compilarSegmento(seg),
      clase,
      delays: delaysEscalonado(n, seg.escalonado ?? 0, seg.ordenEscalonado ?? "inicio"),
    });
  }

  const esTrazo = capa.tipo === "trazo";
  const trazoInicioBase = pistas.trazoInicio
    ? interpolar(pistas.trazoInicio, t)
    : esTrazo ? (capa.trazoInicio ?? 0) : 0;
  const trazoFinBase = pistas.trazoFin
    ? interpolar(pistas.trazoFin, t)
    : esTrazo ? (capa.trazoFin ?? 1) : 1;

  const desenfoqueBase = pistas.desenfoque ? interpolar(pistas.desenfoque, t) : 0;
  for (let i = 0; i < n; i++) {
    const unidad: EstadoUnidad = {
      dx: 0, dy: 0, dEscala: 0, opacidad: 1, desenfoque: desenfoqueBase, blurX: 0, blurY: 0,
      dRotacion: 0, recorte: false, trazoInicio: trazoInicioBase, trazoFin: trazoFinBase,
    };
    // índice centrado para tracking: la unidad del medio queda en 0
    const factorTracking = i - (n - 1) / 2;
    for (const { seg, compilado, clase, delays } of segmentos) {
      aplicarSegmento(unidad, seg, compilado, clase, t, delays[i], capa.motionBlur ?? 0, alto, factorTracking);
    }
    unidad.opacidad = Math.min(1, Math.max(0, unidad.opacidad));
    unidad.trazoInicio = Math.min(1, Math.max(0, unidad.trazoInicio));
    unidad.trazoFin = Math.min(1, Math.max(0, unidad.trazoFin));
    base.unidades.push(unidad);
  }
  return base;
}

/**
 * El zoom de cámara interpola en espacio LOGARÍTMICO: el zoom es
 * multiplicativo, y mezclar su valor lineal hace que un zoom-out se sienta
 * acelerando sobre el final (la tasa percibida es d(log z), no dz) — la
 * llegada queda «trabada», peleada con el ease del paneo. En log, la
 * velocidad perceptual es pareja y paneo + zoom cierran juntos. Los
 * keyframes no cambian (los extremos son exactos): sólo el camino entre
 * medio. El easing del keyframe se aplica igual, sobre el progreso.
 */
function interpolarZoomLog(pista: Keyframe[], t: number): number {
  const enLog = pista.map((k) => ({ ...k, v: Math.log(Math.max(0.05, k.v)) }));
  return Math.exp(interpolar(enLog, t));
}

/** El segmento [a,b] de una pista que contiene a t (null fuera de rango). */
function segmentoEn(pista: Keyframe[], t: number): { a: Keyframe; b: Keyframe } | null {
  if (pista.length < 2 || t <= pista[0].t || t >= pista[pista.length - 1].t) return null;
  let i = 0;
  while (i < pista.length - 1 && pista[i + 1].t <= t) i++;
  return { a: pista[i], b: pista[i + 1] };
}

/**
 * Encuadre resuelto SIN temblor: keyframes/base con defaults sanos. Es lo
 * que leen los gestos y el inspector — editar sobre el valor con temblor
 * hornearía el jitter adentro de los keyframes.
 *
 * POSE-SYNC: la UI trata los keyframes de x/y/zoom que caen en el mismo
 * instante como UNA pose (un rombo) — el motor lo honra: cuando los canales
 * comparten los límites del tramo, los tres viajan con UN progreso y UN
 * easing compartidos (el primero definido entre x → y → zoom). Sin esto,
 * cada canal desacelera a su ritmo y la cámara llega en dos tiempos: el
 * paneo frena primero y el zoom sigue solo — la llegada «trabada». Canales
 * con tiempos propios siguen interpolando por su cuenta, como siempre.
 */
export function camaraEn(comp: Composicion, t: number): { x: number; y: number; zoom: number } {
  const cam = comp.camara?.pistas;
  const base = comp.camara?.base;
  const suelto = () => ({
    x: cam?.x?.length ? interpolar(cam.x, t) : (base?.x ?? comp.ancho / 2),
    y: cam?.y?.length ? interpolar(cam.y, t) : (base?.y ?? comp.alto / 2),
    // zoom nunca ≤ 0: un keyframe roto degrada a casi-plano, no a un frame invertido
    zoom: Math.max(0.05, cam?.zoom?.length ? interpolarZoomLog(cam.zoom, t) : (base?.zoom ?? 1)),
  });

  const segX = cam?.x?.length ? segmentoEn(cam.x, t) : null;
  const segY = cam?.y?.length ? segmentoEn(cam.y, t) : null;
  const segZ = cam?.zoom?.length ? segmentoEn(cam.zoom, t) : null;
  const conSegmento = [segX, segY, segZ].filter((s): s is NonNullable<typeof s> => s !== null);
  if (conSegmento.length < 2) return suelto();
  const ref = conSegmento[0];
  const esPose = conSegmento.every((s) => s.a.t === ref.a.t && s.b.t === ref.b.t);
  if (!esPose) return suelto();

  // un canal sin tramo acá (t fuera de su rango, o sin keyframes) resuelve
  // como siempre: clampeado a sus keyframes, o a la base
  const resto = (pista: Keyframe[] | undefined, deBase: number, log = false) =>
    pista?.length ? (log ? interpolarZoomLog(pista, t) : interpolar(pista, t)) : deBase;

  if (conSegmento.some((s) => s.a.hold)) {
    return {
      x: segX ? segX.a.v : resto(cam?.x, base?.x ?? comp.ancho / 2),
      y: segY ? segY.a.v : resto(cam?.y, base?.y ?? comp.alto / 2),
      zoom: Math.max(0.05, segZ ? segZ.a.v : resto(cam?.zoom, base?.zoom ?? 1, true)),
    };
  }

  const nombre = segX?.a.easing ?? segY?.a.easing ?? segZ?.a.easing;
  const p = easing(nombre)((t - ref.a.t) / (ref.b.t - ref.a.t));
  const lerp = (s: { a: Keyframe; b: Keyframe }) => s.a.v + (s.b.v - s.a.v) * p;
  const lerpLog = (s: { a: Keyframe; b: Keyframe }) => {
    const la = Math.log(Math.max(0.05, s.a.v));
    const lb = Math.log(Math.max(0.05, s.b.v));
    return Math.exp(la + (lb - la) * p);
  };
  return {
    x: segX ? lerp(segX) : resto(cam?.x, base?.x ?? comp.ancho / 2),
    y: segY ? lerp(segY) : resto(cam?.y, base?.y ?? comp.alto / 2),
    zoom: Math.max(0.05, segZ ? lerpLog(segZ) : resto(cam?.zoom, base?.zoom ?? 1, true)),
  };
}

// Presets de temblor: amplitud en px (a 1920 de ancho; escala con la comp)
// y velocidad en ciclos por segundo del armónico base.
const PRESETS_TEMBLOR: Record<string, { amplitud: number; velocidad: number }> = {
  handheld: { amplitud: 7, velocidad: 0.45 },
  flotar: { amplitud: 16, velocidad: 0.12 },
  nervioso: { amplitud: 3.5, velocidad: 1.6 },
};

/**
 * Desplazamiento del temblor en el tiempo t: suma de senos inconmensurables
 * — suave, acotado, sin memoria y 100% determinista (nada de Math.random:
 * dos renders del mismo frame son idénticos). x e y corren desfasados para
 * que el recorrido sea orgánico, no una diagonal.
 */
export function desplazamientoTemblor(
  temblor: TemblorCamara,
  t: number,
  ancho: number,
): { dx: number; dy: number } {
  const def = PRESETS_TEMBLOR[temblor.preset] ?? PRESETS_TEMBLOR.handheld;
  const amp = def.amplitud * (temblor.intensidad ?? 1) * (ancho / 1920);
  const vel = def.velocidad * (temblor.velocidad ?? 1);
  const fase = (temblor.semilla ?? 1) * 7.31;
  const ts = (t / 1000) * vel * Math.PI * 2;
  const onda = (des: number) =>
    Math.sin(ts + des) * 0.55 + Math.sin(ts * 2.17 + des * 1.7) * 0.3 + Math.sin(ts * 4.31 + des * 2.9) * 0.15;
  return { dx: onda(fase) * amp, dy: onda(fase + 4.7) * amp * 0.85 };
}

/** El tiempo cuantizado a la grilla de fps de animación: el look
    stop-motion («en doses»: 12 fps de movimiento en un render a 24). */
export function cuantizarTiempo(t: number, fpsAnimacion?: number): number {
  if (!fpsAnimacion || fpsAnimacion <= 0) return t;
  const paso = 1000 / fpsAnimacion;
  return Math.floor(t / paso) * paso;
}

export function estadoEn(comp: Composicion, tReal: number): EstadoComposicion {
  // los BAJOS FPS son del motor, no del render: preview, export MP4 y
  // frames de revisión heredan el mismo escalonado por venir todos de acá
  const t = cuantizarTiempo(tReal, comp.fpsAnimacion);
  const camara = camaraEn(comp, t);
  const temblor = comp.camara?.temblor;
  if (temblor && (temblor.intensidad ?? 1) > 0) {
    const d = desplazamientoTemblor(temblor, t, comp.ancho);
    camara.x += d.dx;
    camara.y += d.dy;
  }
  return {
    ancho: comp.ancho,
    alto: comp.alto,
    fondo: comp.fondo,
    capas: comp.capas.filter((c) => !c.oculta).map((c) => estadoDeCapa(c, t)),
    camara,
  };
}
