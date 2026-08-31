/* -----------------------------------------------------------------------------
   Invariantes de una composición

   Devuelve problemas como datos (no lanza): la UI los muestra, un tool de
   Diosa los lee, y el guardado puede decidir si son bloqueantes. Mensajes
   en castellano y para un humano (§2.8 del kit).
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";

export type Problema = {
  capaId?: string;
  mensaje: string;
};

export function validar(comp: Composicion): Problema[] {
  const problemas: Problema[] = [];

  if (!Number.isInteger(comp.fps) || comp.fps < 1 || comp.fps > 120) {
    problemas.push({ mensaje: `El fps tiene que ser un entero entre 1 y 120 (vino ${comp.fps})` });
  }
  if (comp.duracion <= 0) {
    problemas.push({ mensaje: "La duración tiene que ser mayor a cero" });
  }
  if (comp.ancho <= 0 || comp.alto <= 0) {
    problemas.push({ mensaje: "El lienzo necesita ancho y alto positivos" });
  }

  for (const [canal, keyframes] of Object.entries(comp.camara?.pistas ?? {})) {
    for (const kf of keyframes ?? []) {
      if (kf.t < 0 || kf.t > comp.duracion) {
        problemas.push({ mensaje: `Cámara: un keyframe de ${canal} en ${kf.t}ms cae fuera de la duración (${comp.duracion}ms)` });
      }
      if (canal === "zoom" && kf.v <= 0) {
        problemas.push({ mensaje: `Cámara: el zoom tiene que ser positivo (vino ${kf.v} en ${kf.t}ms)` });
      }
    }
  }

  const ids = new Set<string>();
  for (const capa of comp.capas) {
    if (ids.has(capa.id)) {
      problemas.push({ capaId: capa.id, mensaje: `Hay dos capas con el id «${capa.id}»` });
    }
    ids.add(capa.id);

    for (const seg of [capa.entrada, capa.salida]) {
      if (!seg) continue;
      if (seg.duracion <= 0) {
        problemas.push({ capaId: capa.id, mensaje: `«${capa.nombre}»: un segmento con duración cero o negativa` });
      }
      if (seg.en < 0 || seg.en > comp.duracion) {
        problemas.push({ capaId: capa.id, mensaje: `«${capa.nombre}»: un segmento arranca fuera de la composición` });
      }
    }

    if (capa.tipo === "trazo" && (capa.trazoFin ?? 1) <= (capa.trazoInicio ?? 0)) {
      problemas.push({ capaId: capa.id, mensaje: `«${capa.nombre}»: el trim base deja el trazo vacío (fin ≤ inicio)` });
    }

    if (capa.tipo === "video" && !capa.videoId) {
      problemas.push({ capaId: capa.id, mensaje: `«${capa.nombre}»: el video de referencia no apunta a ningún archivo` });
    }

    for (const [prop, keyframes] of Object.entries(capa.pistas ?? {})) {
      for (const kf of keyframes ?? []) {
        if (kf.t < 0 || kf.t > comp.duracion) {
          problemas.push({
            capaId: capa.id,
            mensaje: `«${capa.nombre}»: un keyframe de ${prop} en ${kf.t}ms cae fuera de la duración (${comp.duracion}ms)`,
          });
        }
      }
    }
  }
  return problemas;
}
