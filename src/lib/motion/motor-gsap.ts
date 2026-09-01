/* -----------------------------------------------------------------------------
   MOTOR GSAP — la línea de tiempo de la composición ES un timeline de GSAP

   FORK GSAP, tanda G2: acá GSAP deja de prestar solo curvas y pasa a ser el
   MOTOR. Cada composición se compila a UN gsap.timeline pausado cuyos tweens
   animan PROXIES de valores (nunca DOM): un objeto {v} por pista de
   keyframes, un {p} por segmento×unidad. `estadoVivo(comp, t)` seekea el
   timeline (tl.time es determinista: mismo t → mismo estado, en cualquier
   orden — verificado) y arma el EstadoComposicion con el MISMO ensamblador
   de evaluar-puro, leyendo los proxies vía LectorCapa. El canvas pinta lo
   que GSAP resolvió; preview, MP4 y secuencia PNG con alfa ven exactamente
   el mismo frame.

   Por qué así: GSAP es dueño del tiempo, los tweens, los eases y el
   scheduling (lo que crece en G3: solapamiento, labels, timeScale, timelines
   anidados); el ensamblado geométrico (offsets de presets, máscaras de
   recorte, motion blur por derivada, cámara con pose-sync y zoom log) sigue
   siendo UN solo cuerpo compartido con el evaluador clásico — nada puede
   divergir entre motores porque es el mismo código.

   Determinismo: timeline HUÉRFANO (paused + removido del globalTimeline:
   nadie lo tickea, nada lo retiene → el WeakMap deja juntar basura), tweens
   fromTo con extremos explícitos e immediateRender:false (el seek hacia
   atrás repone exactamente el valor inicial), eases como FUNCIONES crudas de
   easings-puro (los mismos números que el clásico, bit a bit).
----------------------------------------------------------------------------- */

import { gsap } from "gsap";
import type { Capa, Composicion, Keyframe, NombrePropiedad } from "@/lib/motion/modelo";
import { easing } from "@/lib/motion/easings-puro";
import { interpolar, delaysEscalonado } from "@/lib/motion/keyframes-puro";
import {
  cantidadUnidades,
  cuantizarTiempo,
  estadoDeCapa,
  estadoEnCon,
  type EstadoComposicion,
  type LectorCapa,
} from "@/lib/motion/evaluar-puro";

const S = 1 / 1000; // el modelo habla en ms; gsap, en segundos

type ProxiesCapa = {
  /** un proxy {v} por pista de keyframes presente en la capa */
  pistas: Partial<Record<NombrePropiedad, { v: number }>>;
  /** un proxy {p} por unidad, por clase — ausente si el segmento no pudo
      compilarse a tween (en negativo): el ensamblador cae al cálculo clásico */
  progresos: { entrada?: { p: number }[]; salida?: { p: number }[] };
};

type Motor = {
  tl: gsap.core.Timeline;
  capas: Map<string, ProxiesCapa>;
};

/** Compila la pista de keyframes a tweens del proxy {v}: un fromTo por
    tramo (extremos explícitos — el seek en cualquier orden repone bien),
    set para holds y tramos de duración cero, y el clamp fuera de rango es
    el de interpolar: set del primer valor en t=0, el último queda pegado. */
function tweensDePista(tl: gsap.core.Timeline, pista: Keyframe[]): { v: number } {
  const proxy = { v: pista[0].v };
  tl.set(proxy, { v: pista[0].v }, 0);
  for (let i = 0; i < pista.length - 1; i++) {
    const a = pista[i];
    const b = pista[i + 1];
    if (a.hold || b.t === a.t) {
      tl.set(proxy, { v: b.v }, b.t * S);
    } else {
      tl.fromTo(
        proxy,
        { v: a.v },
        { v: b.v, duration: (b.t - a.t) * S, ease: easing(a.easing), immediateRender: false },
        a.t * S,
      );
    }
  }
  return proxy;
}

function construir(comp: Composicion): Motor {
  const tl = gsap.timeline({ paused: true });
  // huérfano: fuera del globalTimeline nadie lo tickea ni lo retiene —
  // cuando la composición cambia, el WeakMap suelta motor y proxies juntos
  gsap.globalTimeline.remove(tl);

  const capas = new Map<string, ProxiesCapa>();
  for (const capa of comp.capas) {
    const proxies: ProxiesCapa = { pistas: {}, progresos: {} };

    for (const [prop, pista] of Object.entries(capa.pistas ?? {})) {
      if (!pista?.length) continue;
      proxies.pistas[prop as NombrePropiedad] = tweensDePista(tl, pista);
    }

    const n = cantidadUnidades(capa);
    for (const clase of ["entrada", "salida"] as const) {
      const seg = capa[clase];
      if (!seg) continue;
      const delays = delaysEscalonado(n, seg.escalonado ?? 0, seg.ordenEscalonado ?? "inicio");
      const fn = easing(seg.easing);
      const unidades: { p: number }[] = [];
      let completo = true;
      for (let i = 0; i < n; i++) {
        const inicio = (seg.en + delays[i]) * S;
        if (inicio < 0 || seg.duracion <= 0) {
          // fuera del dominio del timeline: esa clase entera cae al cálculo
          // clásico del ensamblador (p = undefined) — mismo resultado
          completo = false;
          break;
        }
        const proxy = { p: 0 };
        tl.fromTo(proxy, { p: 0 }, { p: 1, duration: seg.duracion * S, ease: fn, immediateRender: false }, inicio);
        unidades.push(proxy);
      }
      if (completo) proxies.progresos[clase] = unidades;
    }

    capas.set(capa.id, proxies);
  }
  return { tl, capas };
}

// una composición = un motor; cada edición produce una composición nueva
// (ops puras + undo por snapshots), así que la identidad del objeto es la
// clave perfecta y el WeakMap limpia solo
const motores = new WeakMap<Composicion, Motor>();

function motorDe(comp: Composicion): Motor {
  let motor = motores.get(comp);
  if (!motor) {
    motor = construir(comp);
    motores.set(comp, motor);
  }
  return motor;
}

function lectorDe(motor: Motor, capa: Capa): LectorCapa {
  const proxies = motor.capas.get(capa.id);
  return {
    pista: (prop, pista, t) => {
      const proxy = proxies?.pistas[prop];
      return proxy ? proxy.v : interpolar(pista, t);
    },
    progreso: (clase, unidad) => proxies?.progresos[clase]?.[unidad]?.p,
  };
}

/**
 * estadoEn, con GSAP de motor: seekea el timeline de la composición al t
 * pedido (cuantizado con la MISMA grilla de fpsAnimacion que usa el
 * ensamblador) y arma el estado leyendo los proxies. Es la función que
 * llaman el preview, el export MP4 y la secuencia PNG en el fork.
 */
export function estadoVivo(comp: Composicion, tReal: number): EstadoComposicion {
  const motor = motorDe(comp);
  // UN seek por frame, con la MISMA cuantización de fpsAnimacion que aplica
  // estadoEnCon: el timeline y el ensamblador miran el mismo instante
  motor.tl.time(cuantizarTiempo(tReal, comp.fpsAnimacion) * S, true);
  return estadoEnCon(comp, tReal, (capa, t) => estadoDeCapa(capa, t, lectorDe(motor, capa)));
}
