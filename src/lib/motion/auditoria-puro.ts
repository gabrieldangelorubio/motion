/* -----------------------------------------------------------------------------
   Auditoría de dirección — la regla de oro del motion grapher, MEDIDA

   Gabriel (2026-09-02): «tiene que ser un motion grapher… animar con
   animaciones secundarias, capa por capa, escalonado… que no sea vago, que
   no vaya al recurso de una escala y un bounce o un fade… dinámico,
   profesional, premium. Regla superestricta de todo lo que hagamos.»

   El prompt lo pide; esto lo VERIFICA sin gastar un token: números medidos
   sobre la composición que el director recibe en la revisión visual como
   hechos, no opiniones. Una pieza que cae en estos hallazgos no se aprueba.
   Pura: sin canvas, sin red, testeable.
----------------------------------------------------------------------------- */

import type { Capa, CapaForma, CapaTexto, Composicion, Keyframe, Segmento } from "@/lib/motion/modelo";
import { PRESETS } from "@/lib/motion/presets-puro";
import { esPlaca } from "@/lib/motion/estilo-puro";

/** Presets que, dominando una pieza, la vuelven plantilla: el fade, la escala
    y el pop genérico. Están bien COMO condimento, nunca como plato. */
const PRESETS_DE_PLANTILLA = new Set(["aparecer", "escalar", "pop"]);

/** Con menos entradas que esto la variedad no se puede exigir (una tarjeta
    con dos textos no necesita cuatro familias). */
const MIN_PARA_VARIEDAD = 5;

/** Piso para exigir que la pieza no tenga tramos muertos: con una o dos
    entradas que quedan quietas (un título y un claim) no hay pieza que
    «respirar», y exigirle cámara o pistas sería movimiento espurio. */
const MIN_PARA_TIEMPO_MUERTO = 3;

const pct = (parte: number, total: number) => Math.round((parte / total) * 100);
const r = (v: number) => Math.round(v);

function porcentajes<T>(items: T[], clave: (x: T) => string): [string, number][] {
  const cuenta = new Map<string, number>();
  for (const it of items) {
    const k = clave(it);
    cuenta.set(k, (cuenta.get(k) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
}

/** Fin real de un segmento con escalonado: la última unidad termina n
    escalones después. No sabemos n sin medir el texto; 6 unidades es un
    piso razonable para «algo sigue moviéndose». */
function finDeSegmento(seg: Segmento): number {
  return seg.en + seg.duracion + (seg.escalonado ?? 0) * 6;
}

/** Tramos [desde, hasta] donde ALGO se mueve: entradas, salidas, pistas de
    capa (tramo entre keyframes, sin contar holds) y viajes de cámara. */
function tramosVivos(comp: Composicion, capas: Capa[]): [number, number][] {
  const tramos: [number, number][] = [];
  for (const capa of capas) {
    if (capa.entrada) tramos.push([capa.entrada.en, finDeSegmento(capa.entrada)]);
    if (capa.salida) tramos.push([capa.salida.en, finDeSegmento(capa.salida)]);
    for (const kfs of Object.values(capa.pistas ?? {})) {
      if (!kfs) continue;
      for (let i = 1; i < kfs.length; i++) {
        if (!kfs[i - 1].hold && kfs[i - 1].v !== kfs[i].v) tramos.push([kfs[i - 1].t, kfs[i].t]);
      }
    }
  }
  for (const kfs of Object.values(comp.camara?.pistas ?? {})) {
    if (!kfs) continue;
    for (let i = 1; i < kfs.length; i++) {
      if (!kfs[i - 1].hold && kfs[i - 1].v !== kfs[i].v) tramos.push([kfs[i - 1].t, kfs[i].t]);
    }
  }
  return tramos.sort((a, b) => a[0] - b[0]);
}

/** El hueco más largo sin nada en movimiento dentro de [0, duracion]. */
function huecoMuerto(comp: Composicion, tramos: [number, number][]): { desde: number; hasta: number } | null {
  let cursor = 0;
  let peor: { desde: number; hasta: number } | null = null;
  const considerar = (desde: number, hasta: number) => {
    if (hasta - desde > (peor ? peor.hasta - peor.desde : 0)) peor = { desde, hasta };
  };
  for (const [a, b] of tramos) {
    if (a > cursor) considerar(cursor, a);
    cursor = Math.max(cursor, b);
  }
  if (cursor < comp.duracion) considerar(cursor, comp.duracion);
  return peor;
}

/** Una forma que cubre (casi) todo el render es un fondo, no un actor. */
function esFondo(capa: Capa, comp: Composicion): boolean {
  return capa.tipo === "forma" && capa.ancho >= comp.ancho * 0.95 && capa.alto >= comp.alto * 0.95;
}

function tieneCoreografiaPropia(capa: Capa): boolean {
  return Object.values(capa.pistas ?? {}).some((kfs) => kfs && kfs.length >= 3);
}

/** Caja aproximada de una capa en el lienzo (centro ± mitades): las formas,
    media y video tienen tamaño; el texto se estima por fuente y contenido;
    el resto cuenta por su ancla. La comparte el rango de la cámara. */
export function cajaAproximada(capa: Capa): { x1: number; y1: number; x2: number; y2: number } {
  let w = 0;
  let h = 0;
  if (capa.tipo === "forma" || capa.tipo === "media" || capa.tipo === "video" || capa.tipo === "trazo" || capa.tipo === "vector") {
    w = capa.ancho / 2;
    h = capa.alto / 2;
  } else if (capa.tipo === "texto") {
    const lineas = capa.texto.split("\n");
    w = (capa.fuente.tamano * 0.6 * Math.max(...lineas.map((l) => l.length), 1)) / 2;
    h = (capa.fuente.tamano * 1.2 * lineas.length) / 2;
  }
  return { x1: capa.x - w, y1: capa.y - h, x2: capa.x + w, y2: capa.y + h };
}

/** Valor de un canal de cámara en t: interpolación lineal entre keyframes
    (alcanza para saber DÓNDE está la cámara al final de una entrada). */
function valorCamaraEn(kfs: Keyframe[] | undefined, base: number, t: number): number {
  if (!kfs || kfs.length === 0) return base;
  if (t <= kfs[0].t) return kfs[0].v;
  for (let i = 1; i < kfs.length; i++) {
    if (t <= kfs[i].t) {
      const a = kfs[i - 1];
      const b = kfs[i];
      if (a.hold || b.t === a.t) return a.v;
      return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
    }
  }
  return kfs[kfs.length - 1].v;
}

/** Lo que ve la cámara en t: caja en px del lienzo. */
export function cajaVisibleEn(comp: Composicion, t: number): { x1: number; y1: number; x2: number; y2: number } {
  const cam = comp.camara;
  const cx = valorCamaraEn(cam?.pistas.x, cam?.base?.x ?? comp.ancho / 2, t);
  const cy = valorCamaraEn(cam?.pistas.y, cam?.base?.y ?? comp.alto / 2, t);
  const zoom = Math.max(0.01, valorCamaraEn(cam?.pistas.zoom, cam?.base?.zoom ?? 1, t));
  const w = comp.ancho / zoom / 2;
  const h = comp.alto / zoom / 2;
  return { x1: cx - w, y1: cy - h, x2: cx + w, y2: cy + h };
}

/** La placa con más solapamiento con una caja visible (o null). */
function pantallaDe(comp: Composicion, ve: { x1: number; y1: number; x2: number; y2: number }): CapaForma | null {
  let mejor: { p: CapaForma; area: number } | null = null;
  for (const c of comp.capas) {
    if (!esPlaca(c) || c.tipo !== "forma" || c.oculta) continue;
    const px1 = c.x - c.ancho / 2, px2 = c.x + c.ancho / 2, py1 = c.y - c.alto / 2, py2 = c.y + c.alto / 2;
    const area = Math.max(0, Math.min(ve.x2, px2) - Math.max(ve.x1, px1)) * Math.max(0, Math.min(ve.y2, py2) - Math.max(ve.y1, py1));
    if (area > 0 && (!mejor || area > mejor.area)) mejor = { p: c, area };
  }
  return mejor?.p ?? null;
}

/** Instantes que valen la pena mirar de la cámara: t = 0 y cada keyframe
    de x/y/zoom (ahí están los encuadres en los que se detiene). */
function instantesDeCamara(comp: Composicion): number[] {
  const ts = new Set<number>([0]);
  for (const kfs of Object.values(comp.camara?.pistas ?? {})) for (const k of kfs ?? []) ts.add(k.t);
  return [...ts].sort((a, b) => a - b);
}

/** Encuadres que muestran vacío fuera de la pantalla o la dejan
    descentrada. Para cada instante de cámara: la placa con más solapamiento
    con lo visible es «la pantalla»; en cada eje, si la pantalla es más grande
    que lo visible, lo visible tiene que caer ADENTRO de ella; si es más
    chica, tiene que quedar CENTRADA. Un mensaje por instante, deduplicado. */
export function encuadresDescentrados(comp: Composicion): string[] {
  const placas = comp.capas.filter((c): c is CapaForma => esPlaca(c) && c.tipo === "forma" && !c.oculta);
  if (placas.length === 0) return [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const t of instantesDeCamara(comp)) {
    const ve = cajaVisibleEn(comp, t);
    const vw = ve.x2 - ve.x1;
    const vh = ve.y2 - ve.y1;
    let mejor: { p: CapaForma; area: number } | null = null;
    for (const p of placas) {
      const px1 = p.x - p.ancho / 2, px2 = p.x + p.ancho / 2, py1 = p.y - p.alto / 2, py2 = p.y + p.alto / 2;
      const area = Math.max(0, Math.min(ve.x2, px2) - Math.max(ve.x1, px1)) * Math.max(0, Math.min(ve.y2, py2) - Math.max(ve.y1, py1));
      if (area > 0 && (!mejor || area > mejor.area)) mejor = { p, area };
    }
    if (!mejor) continue;
    const p = mejor.p;
    const px1 = p.x - p.ancho / 2, px2 = p.x + p.ancho / 2, py1 = p.y - p.alto / 2, py2 = p.y + p.alto / 2;
    const problemas: string[] = [];
    const tolX = Math.max(8, vw * 0.02);
    const tolY = Math.max(8, vh * 0.02);
    if (p.ancho >= vw) {
      if (ve.x1 < px1 - tolX) problemas.push(`muestra ${r(px1 - ve.x1)} px de vacío a la IZQUIERDA de la pantalla`);
      if (ve.x2 > px2 + tolX) problemas.push(`muestra ${r(ve.x2 - px2)} px de vacío a la DERECHA de la pantalla`);
    } else if (Math.abs((ve.x1 + ve.x2) / 2 - p.x) > tolX) {
      problemas.push(`la pantalla queda descentrada en x (centro de cámara ${r((ve.x1 + ve.x2) / 2)}, centro de la pantalla ${r(p.x)})`);
    }
    if (p.alto >= vh) {
      if (ve.y1 < py1 - tolY) problemas.push(`muestra ${r(py1 - ve.y1)} px de vacío ARRIBA de la pantalla`);
      if (ve.y2 > py2 + tolY) problemas.push(`muestra ${r(ve.y2 - py2)} px de vacío ABAJO de la pantalla`);
    } else if (Math.abs((ve.y1 + ve.y2) / 2 - p.y) > tolY) {
      problemas.push(`la pantalla queda descentrada en y (centro de cámara ${r((ve.y1 + ve.y2) / 2)}, centro de la pantalla ${r(p.y)})`);
    }
    if (problemas.length === 0) continue;
    const clave = problemas.join("|");
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const cxOk = p.ancho >= vw ? `entre ${r(px1 + vw / 2)} y ${r(px2 - vw / 2)}` : `${r(p.x)}`;
    salida.push(
      `ENCUADRE DESCENTRADO: en ${r(t)}ms la cámara (centro ${r((ve.x1 + ve.x2) / 2)}, ${r((ve.y1 + ve.y2) / 2)}, ve ${r(vw)}×${r(vh)}) ${problemas.join("; ")}. Sobre la pantalla «${p.nombre}» (caja ${r(px1)}–${r(px2)} × ${r(py1)}–${r(py2)}) el centro x tiene que estar ${cxOk}. Se corrige SOLO con definir_camara, nunca moviendo capas.`,
    );
  }
  return salida;
}

/** Los hallazgos de la auditoría: una línea por regla violada, con los
    números que la prueban y qué hacer. Vacío = la pieza pasa la regla de
    oro (lo que NO significa que sea buena: eso lo ve la revisión visual). */
export function auditarDireccion(comp: Composicion): string[] {
  const hallazgos: string[] = [];
  // las placas y los fondos a pantalla completa son estructura: a ninguno se
  // le exige entrada (el fondo de la escena no «entra», está)
  const animables = comp.capas.filter((c) => !c.oculta && !esPlaca(c) && !esFondo(c, comp));
  const conEntrada = animables.filter((c) => c.entrada);
  const entradas = conEntrada.map((c) => c.entrada as Segmento);
  const n = entradas.length;
  const camaraViaja = Object.values(comp.camara?.pistas ?? {}).some((kfs) => kfs && kfs.length >= 2);
  const alguienConPistas = animables.some((c) => Object.keys(c.pistas ?? {}).length > 0);

  if (animables.length >= 2 && n === 0 && !alguienConPistas && !camaraViaja) {
    hallazgos.push(`NADA SE MUEVE: ${animables.length} capas y ninguna tiene entrada, pista ni viaje de cámara.`);
    return hallazgos;
  }
  // el encuadre se audita aunque nada entre todavía: una cámara mal puesta
  // ya es un hallazgo (y el guionista la fija antes que las entradas)
  const descentrados = encuadresDescentrados(comp).slice(0, 3);
  if (n === 0) return [...hallazgos, ...descentrados];

  // 1. Monotonía de preset
  const porPreset = porcentajes(entradas, (s) => s.preset);
  if (n >= MIN_PARA_VARIEDAD && porPreset[0][1] / n > 0.45) {
    const [preset, veces] = porPreset[0];
    hallazgos.push(
      `MONOTONÍA: «${preset}» en ${veces} de ${n} entradas (${pct(veces, n)}%). Un preset no puede dominar la pieza: repartí por familias según el rol de cada capa.`,
    );
  }

  // 2. Plantilla fade/escala/pop
  const dePlantilla = entradas.filter((s) => PRESETS_DE_PLANTILLA.has(s.preset)).length;
  if (n >= 4 && dePlantilla / n >= 0.6) {
    hallazgos.push(
      `PLANTILLA: ${dePlantilla} de ${n} entradas son aparecer/escalar/pop (${pct(dePlantilla, n)}%). Es el recurso vago: usá revelados con división, desplazamientos con desenfoque, trazos, rotación, tracking y pistas a medida.`,
    );
  }

  // 3. Pocas familias
  const familias = new Set(entradas.map((s) => PRESETS[s.preset]?.categoria ?? s.preset));
  if (n >= MIN_PARA_VARIEDAD && familias.size < 3) {
    hallazgos.push(
      `POCAS FAMILIAS: ${n} entradas y solo ${familias.size} categoría(s) de preset (${[...familias].join(", ")}). Mínimo tres familias en una pieza de este tamaño.`,
    );
  }

  // 4. Easing único o por defecto
  const easings = new Set(entradas.map((s) => s.easing ?? "(default)"));
  if (n >= MIN_PARA_VARIEDAD && easings.size <= 1) {
    hallazgos.push(
      `EASING ÚNICO: las ${n} entradas usan el mismo easing (${[...easings][0]}). Protagonista expo/quint o un GSAP a medida, secundarios cubic, micro sine.`,
    );
  }

  // 5. Misma duración en todo
  const duraciones = new Set(entradas.map((s) => Math.round(s.duracion / 50) * 50));
  if (n >= MIN_PARA_VARIEDAD && duraciones.size <= 1) {
    hallazgos.push(
      `DURACIÓN ÚNICA: las ${n} entradas duran ${[...duraciones][0]}ms. Títulos 700-1000, secundarios 500-700, micro 300-450: la jerarquía también es tiempo.`,
    );
  }

  // 6. Texto dividido sin escalonado (la división no sirve de nada)
  const divididosQuietos = conEntrada.filter(
    (c): c is CapaTexto => c.tipo === "texto" && c.division !== "ninguna" && !(c.entrada?.escalonado && c.entrada.escalonado > 0),
  );
  for (const c of divididosQuietos.slice(0, 3)) {
    hallazgos.push(`SIN ESCALONADO: «${c.nombre}» está dividido en ${c.division} pero su entrada no tiene escalonado — las unidades entran todas juntas.`);
  }

  // 7. Tiempo muerto
  const tramos = tramosVivos(comp, animables);
  const hueco = huecoMuerto(comp, tramos);
  const tolerancia = Math.max(2000, comp.duracion * 0.25);
  if (n >= MIN_PARA_TIEMPO_MUERTO && hueco && hueco.hasta - hueco.desde > tolerancia) {
    hallazgos.push(
      `TIEMPO MUERTO: entre ${Math.round(hueco.desde)}ms y ${Math.round(hueco.hasta)}ms no se mueve nada (${((hueco.hasta - hueco.desde) / 1000).toFixed(1)}s de ${(comp.duracion / 1000).toFixed(1)}s). Repartí las entradas en el tiempo, sumá salidas, micro-vida o un viaje de cámara.`,
    );
  }

  // 8. Sin coreografía a medida
  if (n >= 6 && !animables.some(tieneCoreografiaPropia) && !camaraViaja) {
    hallazgos.push(
      `SIN COREOGRAFÍA PROPIA: ${n} entradas y ninguna pista multi-keyframe (definir_pista) ni viaje de cámara. Al menos un momento hero con recorrido/hold/settle a medida: es lo que separa premium de plantilla.`,
    );
  }

  // 9b. Encuadre que corta: al terminar su entrada, la capa tiene que estar
  // ENTERA dentro de lo que ve la cámara (visto: el logo del hero a medias)
  const cortadas: string[] = [];
  for (const c of conEntrada) {
    const seg = c.entrada as Segmento;
    const t = seg.en + seg.duracion;
    const ve = cajaVisibleEn(comp, t);
    const caja = cajaAproximada(c);
    // un FONDO (glow, haz de luz, textura: más grande que el cuadro en algún
    // eje) no exige encuadre — visto: bajar el zoom «para que entre» el glow
    // descentraba toda la pieza
    const esFondo = caja.x2 - caja.x1 > (ve.x2 - ve.x1) * 0.9 || caja.y2 - caja.y1 > (ve.y2 - ve.y1) * 0.9;
    if (esFondo) continue;
    // un corte en el mismo borde donde la pieza ya SANGRA fuera de su
    // pantalla (haces de luz desde x = 0, rayos desde y = 0) no es un corte:
    // la cámara la recorta donde la página también la recorta
    const p = pantallaDe(comp, ve);
    const sangra = {
      izq: !!p && caja.x1 <= p.x - p.ancho / 2 + 2,
      der: !!p && caja.x2 >= p.x + p.ancho / 2 - 2,
      arr: !!p && caja.y1 <= p.y - p.alto / 2 + 2,
      aba: !!p && caja.y2 >= p.y + p.alto / 2 - 2,
    };
    const corteIzq = caja.x1 < ve.x1 - 2 && !sangra.izq;
    const corteDer = caja.x2 > ve.x2 + 2 && !sangra.der;
    const corteArr = caja.y1 < ve.y1 - 2 && !sangra.arr;
    const corteAba = caja.y2 > ve.y2 + 2 && !sangra.aba;
    const dentro = !(corteIzq || corteDer || corteArr || corteAba);
    const fuera = caja.x2 < ve.x1 || caja.x1 > ve.x2 || caja.y2 < ve.y1 || caja.y1 > ve.y2;
    if (!dentro && !fuera) {
      cortadas.push(
        `ENCUADRE CORTA: «${c.nombre}» termina de entrar en ${t}ms y la cámara la corta (caja x ${r(caja.x1)}–${r(caja.x2)}, y ${r(caja.y1)}–${r(caja.y2)}; la cámara ve x ${r(ve.x1)}–${r(ve.x2)}, y ${r(ve.y1)}–${r(ve.y2)}). Se corrige SOLO con definir_camara (centro o zoom de ese encuadre): JAMÁS moviendo ni escalando la capa.`,
      );
    }
  }
  hallazgos.push(...cortadas.slice(0, 4));

  // 9c. Encuadre descentrado o con vacío: en cada keyframe de cámara, lo
  // que se ve tiene que estar centrado en la pantalla y sin aire fuera de
  // ella (visto: Flash centró en x = 960 —el render— una pantalla de 1440,
  // y un hero a zoom 1.33 mostraba 76 px de vacío arriba de la página)
  hallazgos.push(...descentrados);

  // 9. Cámara quieta con más de una pantalla
  const placas = comp.capas.filter(esPlaca).length;
  if (placas >= 2 && !camaraViaja) {
    hallazgos.push(`CÁMARA QUIETA: hay ${placas} pantallas en el lienzo y la cámara no viaja. La cámara es la narradora: encuadre → hold → viaje con entradaSalida.`);
  }

  return hallazgos;
}

/** El bloque que viaja al director en la revisión visual. Vacío si pasa. */
export function bloqueDeAuditoria(hallazgos: string[]): string {
  if (hallazgos.length === 0) return "";
  return `AUDITORÍA DE DIRECCIÓN (medida sobre la composición — son hechos, no opiniones):
${hallazgos.map((h) => `- ${h}`).join("\n")}
Estos hallazgos NO se aprueban: corregilos en esta ronda con las herramientas antes de responder. Con hallazgos pendientes JAMÁS respondas «APROBADO».`;
}
