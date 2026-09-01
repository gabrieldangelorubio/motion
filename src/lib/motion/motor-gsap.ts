/* -----------------------------------------------------------------------------
   MOTOR GSAP — la línea de tiempo de la composición ES un timeline de GSAP

   FORK GSAP, tanda G2: acá GSAP deja de prestar solo curvas y pasa a ser el
   MOTOR. La parte animada de cada CAPA se compila a un gsap.timeline pausado
   cuyos tweens animan PROXIES de valores (nunca DOM): un {v} por pista de
   keyframes, un {p} por segmento×unidad. `estadoVivo(comp, t)` seekea los
   timelines (tl.time es determinista: mismo t → mismo estado, en cualquier
   orden — verificado) y arma el EstadoComposicion con el MISMO ensamblador
   de evaluar-puro, leyendo los proxies vía LectorCapa. El canvas pinta lo
   que GSAP resolvió; preview, MP4 y secuencia PNG con alfa ven exactamente
   el mismo frame.

   Por qué UN TIMELINE POR CAPA y no uno maestro: el costo de compilar es
   proporcional a los tweens (una comp con 20 títulos escalonados son ~800
   tweens, varios ms), y durante un gesto de RETIMADO cada pointermove
   produce una composición nueva. Con timelines por capa + el cache de
   FIRMAS, retimar recompila SOLO la capa tocada (~1ms) y mover en x/y no
   recompila nada — el resto se reusa por referencia. Seekear N timelines
   chicos cuesta lo mismo que uno grande (los tweens son los mismos).

   Determinismo: timelines HUÉRFANOS (paused + removidos del globalTimeline:
   nadie los tickea, nada los retiene → el GC limpia con los caches), tweens
   fromTo con extremos explícitos e immediateRender:false (el seek hacia
   atrás repone exactamente el valor inicial), eases como FUNCIONES crudas
   de easings-puro (los mismos números que el clásico), y el seek clampeado
   a ≥0 (Timeline.time de GSAP tiene un borde con t negativo: el módulo
   interno da -0 y cae a renderizar la DURACIÓN — el final en vez del
   arranque; el clásico resuelve t<0 igual que t=0, y así quedamos a la par).
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

/** Lo ÚNICO que el timeline compila de una capa. Las ops puras conservan
    los sub-objetos que no tocan, así que comparar REFERENCIAS alcanza: un
    drag de posición edita x/y pero no pistas/segmentos → firma igual →
    cero rebuild; retimar cambia `entrada` → rebuild de ESA capa sola. */
type FirmaCapa = {
  pistas?: Capa["pistas"];
  entrada?: Capa["entrada"];
  salida?: Capa["salida"];
  n: number;
};

function firmaCapaDe(capa: Capa): FirmaCapa {
  return { pistas: capa.pistas, entrada: capa.entrada, salida: capa.salida, n: cantidadUnidades(capa) };
}

function mismaFirmaCapa(a: FirmaCapa, b: FirmaCapa): boolean {
  return a.pistas === b.pistas && a.entrada === b.entrada && a.salida === b.salida && a.n === b.n;
}

type MotorCapa = {
  firma: FirmaCapa;
  tl: gsap.core.Timeline;
  /** un proxy {v} por pista de keyframes presente en la capa */
  pistas: Partial<Record<NombrePropiedad, { v: number }>>;
  /** un proxy {p} por unidad, por clase — ausente si el segmento no pudo
      compilarse a tween (en negativo): el ensamblador cae al cálculo clásico */
  progresos: { entrada?: { p: number }[]; salida?: { p: number }[] };
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

/** El timeline de UNA capa, o null si no tiene nada que compilar (una placa
    estática no paga ni un timeline: el ensamblador la resuelve solo). */
function construirCapa(capa: Capa, firma: FirmaCapa): MotorCapa | null {
  const tl = gsap.timeline({ paused: true });
  // huérfano: fuera del globalTimeline nadie lo tickea ni lo retiene
  gsap.globalTimeline.remove(tl);

  const motor: MotorCapa = { firma, tl, pistas: {}, progresos: {} };
  let algo = false;

  for (const [prop, pista] of Object.entries(capa.pistas ?? {})) {
    if (!pista?.length) continue;
    motor.pistas[prop as NombrePropiedad] = tweensDePista(tl, pista);
    algo = true;
  }

  const n = firma.n;
  for (const clase of ["entrada", "salida"] as const) {
    const seg = capa[clase];
    if (!seg) continue;
    const delays = delaysEscalonado(n, seg.escalonado ?? 0, seg.ordenEscalonado ?? "inicio");
    // validar ANTES de crear nada: si alguna unidad arranca en negativo (o
    // la duración no da), la clase ENTERA cae al cálculo clásico del
    // ensamblador (p = undefined, mismo resultado) — sin tweens huérfanos
    if (seg.duracion <= 0 || delays.some((d) => seg.en + d < 0)) continue;
    const fn = easing(seg.easing);
    motor.progresos[clase] = delays.map((d) => {
      const proxy = { p: 0 };
      tl.fromTo(proxy, { p: 0 }, { p: 1, duration: seg.duracion * S, ease: fn, immediateRender: false }, (seg.en + d) * S);
      return proxy;
    });
    algo = true;
  }
  return algo ? motor : null;
}

type Motor = Map<string, MotorCapa>;

// una composición = un motor; cada edición produce una composición nueva
// (ops puras + undo por snapshots), así que la identidad del objeto es la
// clave perfecta y el WeakMap limpia solo. Los motores viejos (undo) siguen
// apuntando a SUS MotorCapa: compartir una capa no editada entre versiones
// es seguro porque cada estadoVivo seekea y lee en el mismo tick síncrono.
const motores = new WeakMap<Composicion, Motor>();

// la compilación más reciente por id de capa: el cache que hace gratis el
// rebuild — solo las capas cuya firma cambió se recompilan
const ultimaPorCapa = new Map<string, MotorCapa | null>();

let construcciones = 0;
/** Cuántos timelines DE CAPA se compilaron desde cero (los tests de la
    firma verifican que un drag de posición no reconstruye nada y que
    retimar reconstruye exactamente una capa). */
export function construccionesDeMotor(): number {
  return construcciones;
}

function motorDe(comp: Composicion): Motor {
  const directo = motores.get(comp);
  if (directo) return directo;
  // capas borradas hace mucho no tienen por qué quedar vivas en el cache
  if (ultimaPorCapa.size > 2000) ultimaPorCapa.clear();
  const motor: Motor = new Map();
  for (const capa of comp.capas) {
    const firma = firmaCapaDe(capa);
    const previa = ultimaPorCapa.get(capa.id);
    let deCapa = previa !== undefined && (previa === null ? !tieneAnimacion(firma) : mismaFirmaCapa(previa.firma, firma))
      ? previa
      : undefined;
    if (deCapa === undefined) {
      deCapa = construirCapa(capa, firma);
      if (deCapa) construcciones++;
      ultimaPorCapa.set(capa.id, deCapa);
    }
    if (deCapa) motor.set(capa.id, deCapa);
  }
  motores.set(comp, motor);
  return motor;
}

function tieneAnimacion(firma: FirmaCapa): boolean {
  return Boolean(
    firma.entrada || firma.salida || Object.values(firma.pistas ?? {}).some((p) => p?.length),
  );
}

function lectorDe(motor: Motor, capa: Capa): LectorCapa {
  const proxies = motor.get(capa.id);
  return {
    pista: (prop, pista, t) => {
      const proxy = proxies?.pistas[prop];
      return proxy ? proxy.v : interpolar(pista, t);
    },
    progreso: (clase, unidad) => proxies?.progresos[clase]?.[unidad]?.p,
  };
}

/**
 * estadoEn, con GSAP de motor: seekea los timelines de la composición al t
 * pedido (cuantizado con la MISMA grilla de fpsAnimacion que usa el
 * ensamblador, clampeado a ≥0) y arma el estado leyendo los proxies. Es la
 * función que llaman el preview, el export MP4 y la secuencia PNG del fork.
 */
export function estadoVivo(comp: Composicion, tReal: number): EstadoComposicion {
  const motor = motorDe(comp);
  const tSeek = Math.max(0, cuantizarTiempo(tReal, comp.fpsAnimacion)) * S;
  for (const deCapa of motor.values()) deCapa.tl.time(tSeek, true);
  return estadoEnCon(comp, tReal, (capa, t) => estadoDeCapa(capa, t, lectorDe(motor, capa)));
}
