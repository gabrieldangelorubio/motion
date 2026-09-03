/* -----------------------------------------------------------------------------
   Operaciones puras sobre una composición — listas para ser tools de Diosa

   El asistente de diosa opera módulos con tools; el kit (§10.5) pide dejar
   el motor listo: funciones puras que reciben y devuelven la composición,
   sin tocar UI ni base. Cada una valida lo suyo y devuelve el resultado
   discriminado por `ok`, con mensajes en castellano.

   También son la base del undo (cada op produce una composición nueva, el
   historial guarda snapshots) y del futuro chat: una edición del asistente
   es una secuencia de estas ops, nunca una regeneración total.
----------------------------------------------------------------------------- */

import type { Camara, CanalCamara, Capa, Composicion, Keyframe, NombrePropiedad, Segmento, TemblorCamara } from "@/lib/motion/modelo";
import { ordenarKeyframes } from "@/lib/motion/keyframes-puro";
import { nombresPresets } from "@/lib/motion/presets-puro";
import { esPlaca } from "@/lib/motion/estilo-puro";
import { describirEncuadres } from "@/lib/motion/encuadres-puro";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/** Id reservado de la «capa» cámara en la UI — nunca es una capa real del modelo. */
export const CAMARA_ID = "::camara";

export function crearComposicion(datos: {
  nombre: string;
  ancho?: number;
  alto?: number;
  fps?: number;
  duracion?: number;
}): Composicion {
  return {
    version: 1,
    nombre: datos.nombre,
    ancho: datos.ancho ?? 1920,
    alto: datos.alto ?? 1080,
    fps: datos.fps ?? 30,
    duracion: datos.duracion ?? 5000,
    fondo: "#0c0c11",
    capas: [],
  };
}

export function agregarCapa(comp: Composicion, capa: Capa, ahora = Date.now()): Resultado<Composicion> {
  if (comp.capas.some((c) => c.id === capa.id)) {
    return { ok: false, error: `Ya hay una capa con el id «${capa.id}»` };
  }
  return { ok: true, valor: { ...comp, capas: [...comp.capas, { ...capa, v: capa.v ?? ahora }] } };
}

export function quitarCapa(comp: Composicion, capaId: string, ahora = Date.now()): Resultado<Composicion> {
  const capa = comp.capas.find((c) => c.id === capaId);
  if (!capa) return { ok: false, error: `No hay ninguna capa «${capaId}»` };
  return {
    ok: true,
    valor: {
      ...comp,
      capas: comp.capas.filter((c) => c.id !== capaId),
      borrados: [...(comp.borrados ?? []), { id: capaId, v: ahora }],
    },
  };
}

export function editarCapa(
  comp: Composicion,
  capaId: string,
  cambios: Partial<Capa>,
  ahora = Date.now(),
): Resultado<Composicion> {
  const indice = comp.capas.findIndex((c) => c.id === capaId);
  if (indice < 0) return { ok: false, error: `No hay ninguna capa «${capaId}»` };
  const capas = [...comp.capas];
  capas[indice] = { ...capas[indice], ...cambios, id: capaId, v: ahora } as Capa;
  return { ok: true, valor: { ...comp, capas } };
}

export function moverKeyframe(
  comp: Composicion,
  capaId: string,
  propiedad: NombrePropiedad,
  t: number,
  nuevoT: number,
): Resultado<Composicion> {
  const capa = comp.capas.find((c) => c.id === capaId);
  if (!capa) return { ok: false, error: `No hay ninguna capa «${capaId}»` };
  const pista = capa.pistas?.[propiedad];
  if (!pista) return { ok: false, error: `«${capa.nombre}» no tiene keyframes de ${propiedad}` };
  const indice = pista.findIndex((k) => k.t === t);
  if (indice < 0) return { ok: false, error: `No hay un keyframe de ${propiedad} en ${t}ms` };
  if (nuevoT < 0 || nuevoT > comp.duracion) {
    return { ok: false, error: `El destino ${nuevoT}ms cae fuera de la composición` };
  }
  const nueva: Keyframe[] = ordenarKeyframes(
    pista.map((k, i) => (i === indice ? { ...k, t: nuevoT } : k)),
  );
  return editarCapa(comp, capaId, { pistas: { ...capa.pistas, [propiedad]: nueva } });
}

/** Agrega (o pisa, si ya hay uno en ese t) UN keyframe en una pista de capa. */
export function ponerKeyframe(
  comp: Composicion,
  capaId: string,
  propiedad: NombrePropiedad,
  kf: Keyframe,
): Resultado<Composicion> {
  const capa = comp.capas.find((c) => c.id === capaId);
  if (!capa) return { ok: false, error: `No hay ninguna capa «${capaId}»` };
  if (kf.t < 0 || kf.t > comp.duracion) {
    return { ok: false, error: `El keyframe en ${kf.t}ms cae fuera de la composición` };
  }
  const pista = capa.pistas?.[propiedad] ?? [];
  const nueva = ordenarKeyframes([...pista.filter((k) => k.t !== kf.t), kf]);
  return editarCapa(comp, capaId, { pistas: { ...capa.pistas, [propiedad]: nueva } });
}

/** Borra UN keyframe; si la pista queda vacía, la pista entera se va con él. */
export function quitarKeyframe(
  comp: Composicion,
  capaId: string,
  propiedad: NombrePropiedad,
  t: number,
): Resultado<Composicion> {
  const capa = comp.capas.find((c) => c.id === capaId);
  if (!capa) return { ok: false, error: `No hay ninguna capa «${capaId}»` };
  const pista = capa.pistas?.[propiedad];
  if (!pista?.some((k) => k.t === t)) {
    return { ok: false, error: `No hay un keyframe de ${propiedad} en ${t}ms` };
  }
  const nueva = pista.filter((k) => k.t !== t);
  const pistas = { ...capa.pistas };
  if (nueva.length === 0) delete pistas[propiedad];
  else pistas[propiedad] = nueva;
  return editarCapa(comp, capaId, { pistas });
}

/**
 * Reordena en el z-order: mueve un bloque de capas (una sola, o una pantalla
 * entera) para quedar pegado a la referencia, antes o después. El orden
 * interno del bloque se conserva.
 */
export function moverCapasJuntoA(
  comp: Composicion,
  ids: string[],
  referenciaId: string,
  despues: boolean,
): Resultado<Composicion> {
  const set = new Set(ids);
  if (set.has(referenciaId)) return { ok: false, error: "La referencia no puede ser parte del bloque" };
  const bloque = comp.capas.filter((c) => set.has(c.id));
  if (bloque.length === 0) return { ok: false, error: "El bloque no tiene ninguna capa existente" };
  const resto = comp.capas.filter((c) => !set.has(c.id));
  const i = resto.findIndex((c) => c.id === referenciaId);
  if (i < 0) return { ok: false, error: `No hay ninguna capa «${referenciaId}»` };
  const indice = despues ? i + 1 : i;
  return {
    ok: true,
    valor: { ...comp, capas: [...resto.slice(0, indice), ...bloque, ...resto.slice(indice)] },
  };
}

/**
 * Corre la selección UN escalón en el z-order: `direccion` +1 la acerca al
 * frente (más adelante en `capas`, tapa más), −1 la manda hacia el fondo.
 * La selección se compacta en bloque (orden interno intacto) y salta UNA
 * capa vecina no seleccionada por pulsación — el gesto de ⌘] / ⌘[ en AE.
 * Los videos de referencia no entran al bloque y son piso: nada puede
 * meterse debajo de ellos. Si el orden de ids no cambia, devuelve la misma
 * composición (así el caller no registra un undo vacío).
 */
export function desplazarEnZ(comp: Composicion, ids: string[], direccion: 1 | -1): Composicion {
  const set = new Set(ids);
  const bloque = comp.capas.filter((c) => set.has(c.id) && c.tipo !== "video");
  if (bloque.length === 0) return comp;
  const enBloque = new Set(bloque.map((c) => c.id));
  const resto = comp.capas.filter((c) => !enBloque.has(c.id));
  const primero = comp.capas.findIndex((c) => enBloque.has(c.id));
  const p = comp.capas.slice(0, primero).filter((c) => !enBloque.has(c.id)).length;
  // el piso es DESPUÉS del último video de resto (no solo la primera racha:
  // si un video quedó fuera de lugar por otra vía, nada nuevo baja debajo)
  const piso = resto.reduce((max, c, i) => (c.tipo === "video" ? i + 1 : max), 0);
  const nuevoP = Math.min(Math.max(p + direccion, piso), resto.length);
  // el clamp jamás mueve CONTRA el gesto (p < piso solo en estados ya rotos)
  if (Math.sign(nuevoP - p) === -direccion) return comp;
  const capas = [...resto.slice(0, nuevoP), ...bloque, ...resto.slice(nuevoP)];
  const igual = capas.every((c, i) => c.id === comp.capas[i].id);
  return igual ? comp : { ...comp, capas };
}

/** Posiciones ABSOLUTAS para varias capas de una: la base del drag de una
    pantalla entera (el caller calcula origen + delta; acá no hay acumulación
    de error por deltas relativos). */
export function moverCapas(
  comp: Composicion,
  posiciones: { id: string; x: number; y: number }[],
): Composicion {
  const porId = new Map(posiciones.map((p) => [p.id, p]));
  // el recorte del padre (clip content de Figma) es del LIENZO: viaja con
  // la pantalla cuando se arrastra la placa entera, y se queda quieto
  // cuando se mueve una capa sola dentro de su tarjeta
  const deltaDePlaca = (c: Capa): { dx: number; dy: number } | null => {
    if (!c.recorte || !c.grupo) return null;
    const placa = comp.capas.find((p) => p.id === c.grupo && esPlaca(p));
    const destino = placa ? porId.get(placa.id) : undefined;
    return placa && destino ? { dx: destino.x - placa.x, dy: destino.y - placa.y } : null;
  };
  return {
    ...comp,
    capas: comp.capas.map((c) => {
      const p = porId.get(c.id);
      if (!p) return c;
      const d = deltaDePlaca(c);
      return d && c.recorte && (d.dx || d.dy)
        ? { ...c, x: p.x, y: p.y, recorte: { ...c.recorte, x: c.recorte.x + d.dx, y: c.recorte.y + d.dy } }
        : { ...c, x: p.x, y: p.y };
    }),
  };
}

/** Borra una pantalla completa (todas las capas del grupo), con lápidas. */
export function borrarGrupo(comp: Composicion, grupo: string, ahora = Date.now()): Resultado<Composicion> {
  const ids = comp.capas.filter((c) => c.grupo === grupo).map((c) => c.id);
  if (ids.length === 0) return { ok: false, error: `No hay ninguna pantalla «${grupo}»` };
  return {
    ok: true,
    valor: {
      ...comp,
      capas: comp.capas.filter((c) => c.grupo !== grupo),
      borrados: [...(comp.borrados ?? []), ...ids.map((id) => ({ id, v: ahora }))],
    },
  };
}

/**
 * Corre EN BLOQUE la animación de varias capas en el tiempo: entradas,
 * salidas y todos los keyframes de pistas se desplazan dt ms — para traer
 * cosas más adelante o más atrás sin rearmar nada. El dt se clampea para
 * que nada quede antes de 0 (pasarse del final no rompe: validar avisa y
 * la duración de la escena se estira aparte). Capas fuera de `ids` quedan
 * intactas; el diseño (x/y/valores) no se toca, sólo CUÁNDO pasa.
 */
export function desplazarTiempoCapas(comp: Composicion, ids: string[], dt: number): Composicion {
  const elegidas = comp.capas.filter((c) => ids.includes(c.id));
  if (!elegidas.length || dt === 0) return comp;
  let minT = Infinity;
  for (const capa of elegidas) {
    if (capa.entrada) minT = Math.min(minT, capa.entrada.en);
    if (capa.salida) minT = Math.min(minT, capa.salida.en);
    for (const pista of Object.values(capa.pistas ?? {})) {
      for (const kf of pista ?? []) minT = Math.min(minT, kf.t);
    }
  }
  if (!Number.isFinite(minT)) return comp; // sin animación: nada que correr
  const efectivo = Math.max(dt, -minT);
  if (efectivo === 0) return comp;
  const capas = comp.capas.map((c) => {
    if (!ids.includes(c.id)) return c;
    const nueva: Capa = { ...c };
    if (c.entrada) nueva.entrada = { ...c.entrada, en: c.entrada.en + efectivo };
    if (c.salida) nueva.salida = { ...c.salida, en: c.salida.en + efectivo };
    if (c.pistas) {
      const pistas: NonNullable<Capa["pistas"]> = {};
      for (const [prop, pista] of Object.entries(c.pistas)) {
        (pistas as Record<string, Keyframe[]>)[prop] = (pista ?? []).map((kf) => ({ ...kf, t: kf.t + efectivo }));
      }
      nueva.pistas = pistas;
    }
    return nueva;
  });
  return { ...comp, capas };
}

/** Una fila del timeline: capa suelta, o un SUBGRUPO plegado (las capas
    consecutivas que comparten `subgrupo` — el logo con sus letras). */
export type FilaCapas =
  | { tipo: "capa"; capa: Capa }
  | { tipo: "grupo"; id: string; nombre: string; capas: Capa[] };

/** Agrupa las capas en filas: los subgrupos consecutivos colapsan en una.
    La misma partición alimenta el timeline (fila plegable) y el export a
    AE (precomp por subgrupo). */
export function filasDeCapas(capas: Capa[]): FilaCapas[] {
  const filas: FilaCapas[] = [];
  // un subgrupo puede quedar PARTIDO en rachas (reordenando en z una sola de
  // sus capas): cada racha es una fila con id único — sin esto, dos filas
  // compartirían key de React y estado de plegado
  const rachas = new Map<string, number>();
  for (const capa of capas) {
    if (capa.subgrupo) {
      const previa = filas[filas.length - 1];
      if (previa?.tipo === "grupo" && previa.capas[0].subgrupo === capa.subgrupo) {
        previa.capas.push(capa);
        continue;
      }
      const n = (rachas.get(capa.subgrupo) ?? 0) + 1;
      rachas.set(capa.subgrupo, n);
      filas.push({
        tipo: "grupo",
        id: n === 1 ? capa.subgrupo : `${capa.subgrupo}·${n}`,
        nombre: capa.subgrupoNombre ?? capa.subgrupo,
        capas: [capa],
      });
      continue;
    }
    filas.push({ tipo: "capa", capa });
  }
  return filas;
}

/**
 * Rango temporal [desde, hasta] de la animación de las capas dadas: los
 * spans de entrada/salida (en → en+duración, como se DIBUJAN en el
 * timeline) y los keyframes crudos. null si ninguna tiene animación.
 */
export function rangoAnimacionCapas(
  comp: Composicion,
  ids: string[],
): { desde: number; hasta: number } | null {
  let desde = Infinity;
  let hasta = -Infinity;
  for (const capa of comp.capas) {
    if (!ids.includes(capa.id)) continue;
    for (const seg of [capa.entrada, capa.salida]) {
      if (!seg) continue;
      desde = Math.min(desde, seg.en);
      hasta = Math.max(hasta, seg.en + seg.duracion);
    }
    for (const pista of Object.values(capa.pistas ?? {})) {
      for (const kf of pista ?? []) {
        desde = Math.min(desde, kf.t);
        hasta = Math.max(hasta, kf.t);
      }
    }
  }
  return Number.isFinite(desde) && hasta > desde ? { desde, hasta } : null;
}

/**
 * TIME-STRETCH grupal: estira (o comprime) la animación de las capas
 * elegidas alrededor de `pivote` por `factor` — agarrás el borde del
 * recuadro de la selección y toda la coreografía se extiende junta.
 * Escala CUÁNDO pasa todo: inicios, duraciones, keyframes y también el
 * escalonado (estirada al doble, la cascada respira al doble — como el
 * time-stretch de AE). El diseño no se toca. Capas fuera de `ids`,
 * intactas; factor sin sentido (≤0) devuelve la comp tal cual.
 */
export function estirarTiempoCapas(
  comp: Composicion,
  ids: string[],
  pivote: number,
  factor: number,
): Composicion {
  if (!(factor > 0) || factor === 1) return comp;
  const escalar = (t: number) => Math.max(0, Math.round(pivote + (t - pivote) * factor));
  const escalarSegmento = (seg: Segmento): Segmento => ({
    ...seg,
    en: escalar(seg.en),
    duracion: Math.max(1, Math.round(seg.duracion * factor)),
    ...(seg.escalonado !== undefined ? { escalonado: Math.round(seg.escalonado * factor) } : {}),
  });
  const capas = comp.capas.map((c) => {
    if (!ids.includes(c.id)) return c;
    const nueva: Capa = { ...c };
    if (c.entrada) nueva.entrada = escalarSegmento(c.entrada);
    if (c.salida) nueva.salida = escalarSegmento(c.salida);
    if (c.pistas) {
      const pistas: NonNullable<Capa["pistas"]> = {};
      for (const [prop, pista] of Object.entries(c.pistas)) {
        (pistas as Record<string, Keyframe[]>)[prop] = (pista ?? []).map((kf) => ({ ...kf, t: escalar(kf.t) }));
      }
      nueva.pistas = pistas;
    }
    return nueva;
  });
  return { ...comp, capas };
}

/* ——— Cámara: el render es lo que ella ve; estas ops la editan como a una capa ——— */

/**
 * Fija el valor de un canal de la cámara en el instante t, con auto-key:
 * si el canal YA tiene keyframes, agrega/actualiza el keyframe en t (el
 * valor tiene que quedar donde el usuario lo puso); si no tiene, edita la
 * base — mover la cámara sin keyframes no arranca una animación sola.
 */
export function fijarValorCamara(
  comp: Composicion,
  canal: CanalCamara,
  t: number,
  v: number,
): Composicion {
  const camara: Camara = comp.camara ?? { pistas: {} };
  const pista = camara.pistas[canal];
  if (pista && pista.length > 0) {
    return agregarKeyframeCamara(comp, t, { [canal]: v });
  }
  return {
    ...comp,
    camara: { ...camara, base: { ...camara.base, [canal]: v } },
  };
}

/** Pone (o saca, con undefined) el temblor procedural de la cámara: un
    movimiento CONSTANTE encima de los keyframes, que nunca los toca. */
export function definirTemblorCamara(
  comp: Composicion,
  temblor: TemblorCamara | undefined,
): Composicion {
  const camara: Camara = comp.camara ?? { pistas: {} };
  return { ...comp, camara: { ...camara, temblor } };
}

/** Agrega (o pisa, si ya hay uno en t) un keyframe por cada canal provisto.
    Acepta número pelado o {v, easing} — el easing del tramo que SALE de ahí. */
export function agregarKeyframeCamara(
  comp: Composicion,
  t: number,
  valores: Partial<Record<CanalCamara, number | { v: number; easing?: Keyframe["easing"] }>>,
): Composicion {
  const camara: Camara = comp.camara ?? { pistas: {} };
  const pistas = { ...camara.pistas };
  for (const canal of ["x", "y", "zoom"] as const) {
    const cruda = valores[canal];
    if (cruda === undefined) continue;
    const kf: Keyframe = typeof cruda === "number" ? { t, v: cruda } : { t, v: cruda.v, easing: cruda.easing };
    const previa = pistas[canal] ?? [];
    pistas[canal] = ordenarKeyframes([...previa.filter((k) => k.t !== t), kf]);
  }
  return { ...comp, camara: { ...camara, pistas } };
}

/** La POSE de cámara en t: los keyframes de cada canal que caen exactos ahí. */
export function poseCamaraEn(
  comp: Composicion,
  t: number,
): Partial<Record<CanalCamara, { v: number; easing?: Keyframe["easing"] }>> {
  const pose: Partial<Record<CanalCamara, { v: number; easing?: Keyframe["easing"] }>> = {};
  for (const canal of ["x", "y", "zoom"] as const) {
    const kf = comp.camara?.pistas[canal]?.find((k) => k.t === t);
    if (kf) pose[canal] = { v: kf.v, easing: kf.easing };
  }
  return pose;
}

/** Borra la pose entera (los keyframes de todos los canales en t); las pistas
    que quedan vacías se van. Si no queda ningún keyframe, la cámara conserva
    su base (el encuadre fijo no se pierde por limpiar la animación). */
export function quitarPoseCamara(comp: Composicion, t: number): Resultado<Composicion> {
  const pistas = comp.camara?.pistas;
  if (!pistas) return { ok: false, error: "La cámara no tiene keyframes" };
  let hubo = false;
  const nuevas: Camara["pistas"] = {};
  for (const canal of ["x", "y", "zoom"] as const) {
    const pista = pistas[canal];
    if (!pista) continue;
    const filtrada = pista.filter((k) => k.t !== t);
    if (filtrada.length !== pista.length) hubo = true;
    if (filtrada.length > 0) nuevas[canal] = filtrada;
  }
  if (!hubo) return { ok: false, error: `No hay keyframes de cámara en ${t}ms` };
  return { ok: true, valor: { ...comp, camara: { ...comp.camara!, pistas: nuevas } } };
}

/** Retimea la pose entera: todos los canales con keyframe en t pasan a nuevoT. */
export function moverPoseCamara(comp: Composicion, t: number, nuevoT: number): Resultado<Composicion> {
  const pistas = comp.camara?.pistas;
  if (!pistas) return { ok: false, error: "La cámara no tiene keyframes" };
  if (nuevoT < 0 || nuevoT > comp.duracion) {
    return { ok: false, error: `El destino ${nuevoT}ms cae fuera de la composición` };
  }
  const canales = (["x", "y", "zoom"] as const).filter((c) => pistas[c]?.some((k) => k.t === t));
  if (canales.length === 0) return { ok: false, error: `No hay keyframes de cámara en ${t}ms` };
  // no pisar otra pose: si CUALQUIER canal ya tiene keyframe en el destino, no
  if (nuevoT !== t && (["x", "y", "zoom"] as const).some((c) => pistas[c]?.some((k) => k.t === nuevoT))) {
    return { ok: false, error: `Ya hay una pose de cámara en ${nuevoT}ms` };
  }
  const nuevas: Camara["pistas"] = { ...pistas };
  for (const canal of canales) {
    nuevas[canal] = ordenarKeyframes(pistas[canal]!.map((k) => (k.t === t ? { ...k, t: nuevoT } : k)));
  }
  return { ok: true, valor: { ...comp, camara: { ...comp.camara!, pistas: nuevas } } };
}

export function moverKeyframeCamara(
  comp: Composicion,
  canal: CanalCamara,
  t: number,
  nuevoT: number,
): Resultado<Composicion> {
  const pista = comp.camara?.pistas[canal];
  if (!pista) return { ok: false, error: `La cámara no tiene keyframes de ${canal}` };
  const indice = pista.findIndex((k) => k.t === t);
  if (indice < 0) return { ok: false, error: `No hay un keyframe de cámara (${canal}) en ${t}ms` };
  if (nuevoT < 0 || nuevoT > comp.duracion) {
    return { ok: false, error: `El destino ${nuevoT}ms cae fuera de la composición` };
  }
  const nueva = ordenarKeyframes(pista.map((k, i) => (i === indice ? { ...k, t: nuevoT } : k)));
  return {
    ok: true,
    valor: { ...comp, camara: { ...comp.camara!, pistas: { ...comp.camara!.pistas, [canal]: nueva } } },
  };
}

/** Resumen legible de la composición — el contexto que un tool le da al asistente. */
export function describir(comp: Composicion): string {
  const lineas = [
    `«${comp.nombre}» — RENDER ${comp.ancho}×${comp.alto} @ ${comp.fps}fps${
      comp.fpsAnimacion ? ` (animación cuantizada a ${comp.fpsAnimacion}fps, look stop-motion)` : ""
    }, ${(comp.duracion / 1000).toFixed(2)}s, ${comp.capas.length} capas. La cámara ve ${comp.ancho}/zoom × ${comp.alto}/zoom px del lienzo centrada en (x, y): para encuadrar una región de W px de ancho, zoom = ${comp.ancho}/W y el centro es el de ESA región (la caja de cada pantalla está abajo) — nunca el del render (${comp.ancho / 2}, ${comp.alto / 2}) salvo que la pantalla esté ahí.`,
  ];
  if (comp.camara) {
    // los keyframes van CON valores y easings: el asistente los reanima
    const partes: string[] = [];
    const base = comp.camara.base;
    if (base) {
      partes.push(`base (${base.x ?? "·"}, ${base.y ?? "·"}) zoom ${base.zoom ?? "·"}`);
    }
    if (comp.camara.temblor) {
      const tb = comp.camara.temblor;
      partes.push(`temblor ${tb.preset} ×${tb.intensidad ?? 1} vel ${tb.velocidad ?? 1} (constante, encima de los keyframes)`);
    }
    for (const canal of ["x", "y", "zoom"] as const) {
      const pista = comp.camara.pistas[canal];
      if (!pista?.length) continue;
      const kfs = pista.map((k) => `${k.t}ms→${k.v}${k.easing ? ` (${k.easing})` : ""}`).join(", ");
      partes.push(`${canal}: ${kfs}`);
    }
    lineas.push(`  cámara — el render es lo que ella ve: ${partes.join(" · ") || "sin pistas (plano fijo)"}`);
  }
  lineas.push(...describirEncuadres(comp));
  for (const capa of comp.capas) {
    if (capa.tipo === "video") {
      // el director SABE que existe (es el fondo contra el que compone)
      // pero no la opera: no se anima, no se edita, no sale en el export
      lineas.push(`  · [video] «${capa.nombre}» — VIDEO DE REFERENCIA de fondo: solo guía del preview, NO operarla (no se anima ni se exporta)`);
      continue;
    }
    // el ID va A LA VISTA: las herramientas piden capaId y sin esto el
    // director lo adivinaba desde el nombre («right» por «fig-3-right»),
    // fallaba y quemaba un paso entero recuperándose del error
    const partes = [`  · [${capa.tipo}] «${capa.nombre}» (id: ${capa.id}) en (${Math.round(capa.x)}, ${Math.round(capa.y)})`];
    // pantallas del lienzo: la placa es la MANIJA (su id es el pantallaId de
    // derivar_pantalla); sus capas dicen a qué pantalla pertenecen
    if (esPlaca(capa) && capa.tipo === "forma") {
      const x1 = Math.round(capa.x - capa.ancho / 2);
      const y1 = Math.round(capa.y - capa.alto / 2);
      partes.push(`PLACA de pantalla (su id es el pantallaId): caja ${Math.round(capa.ancho)}×${Math.round(capa.alto)} de (${x1}, ${y1}) a (${x1 + Math.round(capa.ancho)}, ${y1 + Math.round(capa.alto)}), centro (${Math.round(capa.x)}, ${Math.round(capa.y)})`);
    }
    else if (capa.grupo) partes.push(`pantalla ${capa.grupo}`);
    if (capa.tipo === "texto" && capa.division !== "ninguna") partes.push(`división ${capa.division}`);
    if (capa.tipo === "texto" && capa.deformaciones?.length) {
      partes.push(
        `estiradas: ${capa.deformaciones.map((d) => `${d.desde}-${d.hasta} ×${d.escalaX ?? 1}/${d.escalaY ?? 1}`).join(", ")}`,
      );
    }
    if (capa.tipo === "texto" && capa.texto.includes("\n")) partes.push(`${capa.texto.split("\n").length} líneas`);
    if (capa.tipo === "trazo") partes.push(`largo ${Math.round(capa.largo)}px`);
    if (capa.tipo === "vector") partes.push(capa.relleno ? `vector con relleno ${capa.relleno}` : "vector solo borde");
    if (capa.entrada) partes.push(`entrada ${capa.entrada.preset} @${capa.entrada.en}ms`);
    if (capa.salida) partes.push(`salida ${capa.salida.preset} @${capa.salida.en}ms`);
    const pistas = Object.keys(capa.pistas ?? {});
    if (pistas.length) partes.push(`pistas: ${pistas.join(", ")}`);
    lineas.push(partes.join(" — "));
  }
  lineas.push(`Presets de entrada: ${nombresPresets("entrada").join(", ")}`);
  lineas.push(`Presets de salida: ${nombresPresets("salida").join(", ")}`);
  return lineas.join("\n");
}
