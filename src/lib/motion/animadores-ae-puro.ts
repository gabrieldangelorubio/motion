/* -----------------------------------------------------------------------------
   Text Animators nativos para el export a AE — la parte PURA

   Un texto con división (letras/palabras/líneas) dejaba de animarse por
   unidad al viajar a AE: se horneaba como bloque. El idioma correcto de AE
   para esto es su Text Animator: propiedades (Position/Opacity/Scale/
   Rotation/Tracking/Blur) + Range Selector con Start animado 0→100% y
   Based On según la división — nativo, MUY editable (ajustás el stagger
   tocando el selector, como en cualquier template pro) y fiel al motor.

   Acá se traduce cada segmento (preset compilado) al animador: el estado
   EXTREMO del preset (p=0 en entradas, p=1 en salidas) son las propiedades
   del animador, y el barrido del selector reproduce el escalonado. Lo que
   no cabe (overshoots internos del preset, la máscara del revelado, orden
   centro/bordes) degrada CON AVISO — nunca en silencio.
----------------------------------------------------------------------------- */

import type { CapaTexto, Segmento } from "@/lib/motion/modelo";
import { compilarSegmento, type PresetCompilado } from "@/lib/motion/presets-puro";
import { altoUnidad } from "@/lib/motion/evaluar-puro";

export type AnimadorAE = {
  clase: "entrada" | "salida";
  preset: string;
  nombre: string;
  /** ADBE Text Range Type2: 2 = chars sin espacios, 3 = palabras, 4 = líneas */
  basadoEn: 2 | 3 | 4;
  /** ordenEscalonado azar → Randomize Order del selector */
  azar: boolean;
  /** unidades reales del texto para esta división (informa el comentario) */
  unidades: number;
  /** [matchName, valor] de cada propiedad del animador */
  props: [string, number | number[]][];
  /** qué borde del selector se anima: en la ENTRADA el Start barre 0→100
      (la selección se ACHICA y cada unidad va quedando en reposo); en la
      SALIDA se anima el End 0→100 (la selección CRECE y cada unidad va
      adoptando el estado de salida) */
  canalSelector: "ADBE Text Percent Start" | "ADBE Text Percent End";
  /** keyframes del borde animado: 0→100% sobre la ventana total */
  claves: { t: number; v: number }[];
  easing?: Segmento["easing"];
  avisos: string[];
};

/** Cuántas unidades tiene el texto en una división (espacios afuera en
    caracteres, como divide el motor). */
export function contarUnidades(texto: string, division: CapaTexto["division"]): number {
  if (division === "caracteres") return texto.replace(/\s/g, "").length;
  if (division === "palabras") return texto.split(/\s+/).filter(Boolean).length;
  if (division === "lineas") return texto.split("\n").length;
  return 1;
}

const BASADO_EN: Record<string, 2 | 3 | 4> = { caracteres: 2, palabras: 3, lineas: 4 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

/** El valor de un canal del preset en su extremo: p=0 (de dónde viene una
    entrada) o p=1 (a dónde va una salida). */
function extremo(pista: { p: number; v: number }[] | undefined, p0: boolean): number {
  if (!pista || pista.length === 0) return 0;
  return p0 ? pista[0].v : pista[pista.length - 1].v;
}

/** ¿La pista del preset guarda puntos intermedios (overshoot adentro, como
    pop/rebotar)? El selector del animador barre monótono: eso se pierde. */
function tieneIntermedios(compilado: PresetCompilado): boolean {
  return Object.values(compilado.pista).some((pista) => pista && pista.length > 2);
}

/** Traduce UN segmento de una capa de texto dividida a su Text Animator.
    null = este segmento no es representable (sin división, canales de
    trazo, o nada que animar) y sigue el camino de siempre. `conMascara`:
    el revelado viaja con MASK real (revelado-ae-puro) — el fundido por
    unidad que la aproximaba ya no hace falta. */
export function animadorDeSegmento(
  capa: CapaTexto,
  seg: Segmento,
  clase: "entrada" | "salida",
  conMascara = false,
): AnimadorAE | null {
  if (capa.division === "ninguna") return null;
  const compilado = compilarSegmento(seg);
  if (compilado.pista.dTrazoInicio || compilado.pista.dTrazoFin) return null;
  const p0 = clase === "entrada";
  const avisos: string[] = [];
  const props: [string, number | number[]][] = [];

  // los dy de presets `relativo` son múltiplos del ALTO DE UNIDAD del motor
  // (nunca menos que 1.2× el cuerpo): con interlineado apretado el viaje
  // tiene que cubrir el glifo completo o el texto asoma bajo la máscara
  const escalaDy = compilado.relativo ? altoUnidad(capa) : 1;
  let dx = extremo(compilado.pista.dx, p0);
  const dy = extremo(compilado.pista.dy, p0) * escalaDy;
  if (compilado.tracking) {
    // dx por índice desde el centro → Tracking Amount (milésimas de em),
    // la misma conversión que el tracking base del documento
    const tracking = Math.round((dx / capa.fuente.tamano) * 1000);
    if (tracking !== 0) props.push(["ADBE Text Tracking Amount", tracking]);
    dx = 0;
  }
  if (dx !== 0 || dy !== 0) props.push(["ADBE Text Position 3D", [r1(dx), r1(dy)]]);

  const dEscala = extremo(compilado.pista.dEscala, p0);
  if (dEscala !== 0) {
    const s = r1(clamp((1 + dEscala) * 100, 0, 4000));
    props.push(["ADBE Text Scale 3D", [s, s]]);
  }
  const dRotacion = extremo(compilado.pista.dRotacion, p0);
  if (dRotacion !== 0) props.push(["ADBE Text Rotation", r1(dRotacion)]);

  let dOpacidad = extremo(compilado.pista.dOpacidad, p0);
  if (compilado.recorte && dOpacidad === 0 && !conMascara) {
    // sin la MASK real del revelado (conMascara), el fundido por unidad
    // es la aproximación estándar — avisada
    dOpacidad = -1;
    avisos.push("mascara del revelado aproximada con opacidad por unidad");
  }
  if (dOpacidad !== 0) props.push(["ADBE Text Opacity", r1(clamp((1 + dOpacidad) * 100, 0, 100))]);

  const desenfoque = extremo(compilado.pista.desenfoque, p0);
  if (desenfoque !== 0) props.push(["ADBE Text Blur", [r1(desenfoque), r1(desenfoque)]]);

  if (props.length === 0) return null;
  if (tieneIntermedios(compilado)) avisos.push(`el overshoot interno de «${seg.preset}» se aproxima (el selector barre directo)`);

  const orden = seg.ordenEscalonado ?? "inicio";
  const azar = orden === "azar";
  if (orden !== "inicio" && orden !== "azar") avisos.push(`orden «${orden}» no viaja al selector: queda desde el inicio`);

  const unidades = contarUnidades(capa.texto, capa.division);
  const total = seg.duracion + (seg.escalonado ?? 0) * Math.max(0, unidades - 1);
  return {
    clase,
    preset: seg.preset,
    nombre: `${clase} ${seg.preset}`,
    basadoEn: BASADO_EN[capa.division] ?? 2,
    azar,
    unidades,
    props,
    canalSelector: clase === "entrada" ? "ADBE Text Percent Start" : "ADBE Text Percent End",
    claves: [
      { t: seg.en, v: 0 },
      { t: seg.en + total, v: 100 },
    ],
    easing: seg.easing,
    avisos,
  };
}

export type EstiradoAE = {
  nombre: string;
  /** Start/End del selector en % sobre los caracteres sin espacios */
  desdePct: number;
  hastaPct: number;
  escala: [number, number];
};

/** Los estirados por letra como animadores de Scale con selector FIJO
    (Shape Square sobre el rango de la letra): el look logo, editable. */
export function estiradosDeCapa(capa: CapaTexto): EstiradoAE[] {
  const n = contarUnidades(capa.texto, "caracteres");
  if (n === 0) return [];
  return (capa.deformaciones ?? [])
    .filter((d) => d.hasta > d.desde && ((d.escalaX ?? 1) !== 1 || (d.escalaY ?? 1) !== 1))
    .map((d) => ({
      nombre: `estirar ${d.desde}-${d.hasta}`,
      desdePct: r1(clamp((d.desde / n) * 100, 0, 100)),
      hastaPct: r1(clamp((Math.min(d.hasta, n) / n) * 100, 0, 100)),
      escala: [r1((d.escalaX ?? 1) * 100), r1((d.escalaY ?? 1) * 100)],
    }));
}

/** Los animadores de la capa: entrada y/o salida traducibles. */
export function animadoresDeCapa(capa: CapaTexto, conMascara = false): AnimadorAE[] {
  const lista: AnimadorAE[] = [];
  if (capa.entrada) {
    const a = animadorDeSegmento(capa, capa.entrada, "entrada", conMascara);
    if (a) lista.push(a);
  }
  if (capa.salida) {
    const a = animadorDeSegmento(capa, capa.salida, "salida", conMascara);
    if (a) lista.push(a);
  }
  return lista;
}
