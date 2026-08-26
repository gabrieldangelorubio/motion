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

import type { Capa, Composicion, Segmento } from "@/lib/motion/modelo";
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

/** Alto de una unidad de la capa, la escala de los presets `relativo` (revelar/ocultar). */
export function altoUnidad(capa: Capa): number {
  if (capa.tipo === "texto") return capa.fuente.interlineado ?? capa.fuente.tamano * 1.15;
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
): void {
  const inicio = seg.en + delay;
  const bruto = (t - inicio) / seg.duracion;
  const fn = easing(seg.easing);
  const p = fn(Math.min(1, Math.max(0, bruto)));

  // En presets `relativo` los dy son múltiplos del alto de la unidad, no px:
  // así «revelar» funciona igual en un título de 200px que en un caption de 18px.
  const escalaDy = compilado.relativo ? alto : 1;
  unidad.dx += offsetDe(compilado.pista.dx, p);
  unidad.dy += offsetDe(compilado.pista.dy, p) * escalaDy;
  unidad.dEscala += offsetDe(compilado.pista.dEscala, p);
  unidad.opacidad += offsetDe(compilado.pista.dOpacidad, p);
  unidad.desenfoque += offsetDe(compilado.pista.desenfoque, p);
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
      recorte: false, trazoInicio: trazoInicioBase, trazoFin: trazoFinBase,
    };
    for (const { seg, compilado, clase, delays } of segmentos) {
      aplicarSegmento(unidad, seg, compilado, clase, t, delays[i], capa.motionBlur ?? 0, alto);
    }
    unidad.opacidad = Math.min(1, Math.max(0, unidad.opacidad));
    unidad.trazoInicio = Math.min(1, Math.max(0, unidad.trazoInicio));
    unidad.trazoFin = Math.min(1, Math.max(0, unidad.trazoFin));
    base.unidades.push(unidad);
  }
  return base;
}

export function estadoEn(comp: Composicion, t: number): EstadoComposicion {
  const cam = comp.camara?.pistas;
  return {
    ancho: comp.ancho,
    alto: comp.alto,
    fondo: comp.fondo,
    capas: comp.capas.filter((c) => !c.oculta).map((c) => estadoDeCapa(c, t)),
    camara: {
      x: cam?.x?.length ? interpolar(cam.x, t) : comp.ancho / 2,
      y: cam?.y?.length ? interpolar(cam.y, t) : comp.alto / 2,
      // zoom nunca ≤ 0: un keyframe roto degrada a casi-plano, no a un frame invertido
      zoom: Math.max(0.05, cam?.zoom?.length ? interpolar(cam.zoom, t) : 1),
    },
  };
}
