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

import type { Capa, Composicion, Keyframe, NombrePropiedad } from "@/lib/motion/modelo";
import { ordenarKeyframes } from "@/lib/motion/keyframes-puro";
import { nombresPresets } from "@/lib/motion/presets-puro";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

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

/** Resumen legible de la composición — el contexto que un tool le da al asistente. */
export function describir(comp: Composicion): string {
  const lineas = [
    `«${comp.nombre}» — ${comp.ancho}×${comp.alto} @ ${comp.fps}fps, ${(comp.duracion / 1000).toFixed(2)}s, ${comp.capas.length} capas`,
  ];
  for (const capa of comp.capas) {
    const partes = [`  · [${capa.tipo}] «${capa.nombre}» en (${Math.round(capa.x)}, ${Math.round(capa.y)})`];
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
