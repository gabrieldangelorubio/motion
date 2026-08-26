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

/** Agrega (o pisa, si ya hay uno en t) un keyframe por cada canal provisto. */
export function agregarKeyframeCamara(
  comp: Composicion,
  t: number,
  valores: Partial<Record<CanalCamara, number>>,
): Composicion {
  const camara: Camara = comp.camara ?? { pistas: {} };
  const pistas = { ...camara.pistas };
  for (const canal of ["x", "y", "zoom"] as const) {
    const v = valores[canal];
    if (v === undefined) continue;
    const previa = pistas[canal] ?? [];
    pistas[canal] = ordenarKeyframes([
      ...previa.filter((k) => k.t !== t),
      { t, v },
    ]);
  }
  return { ...comp, camara: { ...camara, pistas } };
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
