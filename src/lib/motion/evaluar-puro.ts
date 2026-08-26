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
};

/** Cantidad de unidades animables de una capa (caracteres o palabras del texto). */
export function cantidadUnidades(capa: Capa): number {
  if (capa.tipo !== "texto" || capa.division === "ninguna") return 1;
  if (capa.division === "palabras") {
    return capa.texto.split(/\s+/).filter(Boolean).length || 1;
  }
  return [...capa.texto.replace(/\s/g, "")].length || 1;
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
  t: number,
  delay: number,
  motionBlur: number,
): void {
  const inicio = seg.en + delay;
  const bruto = (t - inicio) / seg.duracion;
  const fn = easing(seg.easing);
  const p = fn(Math.min(1, Math.max(0, bruto)));

  unidad.dx += offsetDe(compilado.pista.dx, p);
  unidad.dy += offsetDe(compilado.pista.dy, p);
  unidad.dEscala += offsetDe(compilado.pista.dEscala, p);
  unidad.opacidad += offsetDe(compilado.pista.dOpacidad, p);
  unidad.desenfoque += offsetDe(compilado.pista.desenfoque, p);

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
  const segmentos: { seg: Segmento; compilado: PresetCompilado; delays: number[] }[] = [];
  for (const seg of [capa.entrada, capa.salida]) {
    if (!seg) continue;
    segmentos.push({
      seg,
      compilado: compilarSegmento(seg),
      delays: delaysEscalonado(n, seg.escalonado ?? 0, seg.ordenEscalonado ?? "inicio"),
    });
  }

  const desenfoqueBase = pistas.desenfoque ? interpolar(pistas.desenfoque, t) : 0;
  for (let i = 0; i < n; i++) {
    const unidad: EstadoUnidad = {
      dx: 0, dy: 0, dEscala: 0, opacidad: 1, desenfoque: desenfoqueBase, blurX: 0, blurY: 0,
    };
    for (const { seg, compilado, delays } of segmentos) {
      aplicarSegmento(unidad, seg, compilado, t, delays[i], capa.motionBlur ?? 0);
    }
    unidad.opacidad = Math.min(1, Math.max(0, unidad.opacidad));
    base.unidades.push(unidad);
  }
  return base;
}

export function estadoEn(comp: Composicion, t: number): EstadoComposicion {
  return {
    ancho: comp.ancho,
    alto: comp.alto,
    fondo: comp.fondo,
    capas: comp.capas.filter((c) => !c.oculta).map((c) => estadoDeCapa(c, t)),
  };
}
