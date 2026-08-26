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

import type { Camara, CanalCamara, Capa, Composicion, Keyframe, NombrePropiedad } from "@/lib/motion/modelo";
import { ordenarKeyframes } from "@/lib/motion/keyframes-puro";
import { nombresPresets } from "@/lib/motion/presets-puro";

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

/** Posiciones ABSOLUTAS para varias capas de una: la base del drag de una
    pantalla entera (el caller calcula origen + delta; acá no hay acumulación
    de error por deltas relativos). */
export function moverCapas(
  comp: Composicion,
  posiciones: { id: string; x: number; y: number }[],
): Composicion {
  const porId = new Map(posiciones.map((p) => [p.id, p]));
  return {
    ...comp,
    capas: comp.capas.map((c) => {
      const p = porId.get(c.id);
      return p ? { ...c, x: p.x, y: p.y } : c;
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
    `«${comp.nombre}» — ${comp.ancho}×${comp.alto} @ ${comp.fps}fps, ${(comp.duracion / 1000).toFixed(2)}s, ${comp.capas.length} capas`,
  ];
  if (comp.camara) {
    // los keyframes van CON valores y easings: el asistente los reanima
    const partes: string[] = [];
    const base = comp.camara.base;
    if (base) {
      partes.push(`base (${base.x ?? "·"}, ${base.y ?? "·"}) zoom ${base.zoom ?? "·"}`);
    }
    for (const canal of ["x", "y", "zoom"] as const) {
      const pista = comp.camara.pistas[canal];
      if (!pista?.length) continue;
      const kfs = pista.map((k) => `${k.t}ms→${k.v}${k.easing ? ` (${k.easing})` : ""}`).join(", ");
      partes.push(`${canal}: ${kfs}`);
    }
    lineas.push(`  cámara — el render es lo que ella ve: ${partes.join(" · ") || "sin pistas (plano fijo)"}`);
  }
  for (const capa of comp.capas) {
    const partes = [`  · [${capa.tipo}] «${capa.nombre}» en (${Math.round(capa.x)}, ${Math.round(capa.y)})`];
    if (capa.tipo === "texto" && capa.division !== "ninguna") partes.push(`división ${capa.division}`);
    if (capa.tipo === "texto" && capa.texto.includes("\n")) partes.push(`${capa.texto.split("\n").length} líneas`);
    if (capa.tipo === "trazo") partes.push(`largo ${Math.round(capa.largo)}px`);
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
