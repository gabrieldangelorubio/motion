/* -----------------------------------------------------------------------------
   Revisión visual automática del director — la parte PURA

   Antes de dar por buena una dirección, el director MIRA el resultado:
   el cliente renderiza unos frames clave con el motor real (el mismo
   estadoEn+pintar del preview — determinista: lo que ve es lo que hay)
   y se los manda en un turno extra de revisión. Acá vive lo testeable:
   qué instantes mirar, el mensaje del turno y el veredicto.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";
import { bloqueDeAuditoria } from "@/lib/motion/auditoria-puro";

/** Un frame renderizado listo para viajar al modelo multimodal. */
export type ImagenRevision = { mime: string; datosBase64: string };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Los instantes que valen la pena mirar: el final de cada entrada (la capa
    ya asentada — ahí se ven desbordes y encimados), el arranque de cada
    salida, el medio y el casi-final. Deduplicados (150ms) y repartidos si
    son demasiados: cada frame cuesta tokens. */
export function tiemposDeRevision(comp: Composicion, max = 4): number[] {
  const candidatos: number[] = [comp.duracion / 2, Math.max(0, comp.duracion - 120)];
  for (const capa of comp.capas) {
    if (capa.entrada) {
      candidatos.push(capa.entrada.en + capa.entrada.duracion + (capa.entrada.escalonado ?? 0) * 2 + 80);
    }
    if (capa.salida) candidatos.push(Math.max(0, capa.salida.en - 80));
  }
  const ordenados = candidatos
    .map((t) => clamp(Math.round(t), 0, comp.duracion))
    .sort((a, b) => a - b);
  const unicos: number[] = [];
  for (const t of ordenados) {
    if (unicos.length === 0 || t - unicos[unicos.length - 1] > 150) unicos.push(t);
  }
  if (unicos.length <= max) return unicos;
  // repartidos: siempre el primero y el último, el resto a paso parejo
  const elegidos: number[] = [];
  for (let i = 0; i < max; i++) {
    elegidos.push(unicos[Math.round((i * (unicos.length - 1)) / (max - 1))]);
  }
  return [...new Set(elegidos)];
}

/** El turno de revisión que acompaña a los frames. No es un pedido del
    usuario: es el director mirándose el trabajo antes de entregar. */
export function mensajeDeRevision(tiempos: number[], auditoria: string[] = []): string {
  const bloque = bloqueDeAuditoria(auditoria);
  return `REVISIÓN VISUAL AUTOMÁTICA (no es un pedido nuevo del usuario: es tu control de calidad antes de entregar). Adjunto ${tiempos.length} frames del RENDER REAL de lo que quedó, en t = ${tiempos.map((t) => `${t}ms`).join(", ")} (en ese orden).

Miralos como director:
- ¿Algo desborda el encuadre o pisa un borde?
- ¿Textos encimados, ilegibles o tapados por otra capa?
- ¿Capas que deberían animarse y se ven IGUALES en todos los frames (quietas, o que aparecen de golpe sin animación)?
- ¿Algo del pedido original que falta?
- ¿Cumple la REGLA DE ORO (capa por capa, escalonado, animación secundaria, variedad de familias y easings, cámara narradora)? Una pieza que se ve a plantilla no se aprueba aunque nada desborde.
${bloque ? `\n${bloque}\n` : ""}
Si está todo bien, respondé EXACTAMENTE «APROBADO» y nada más.
Si hay problemas, corregilos ahora con las herramientas (ajustes puntuales sobre lo hecho — jamás rehacer la escena) y terminá con una línea por corrección, empezando por «Corregí:».`;
}

/** ¿El director dio el visto bueno? */
export function esAprobado(respuesta: string): boolean {
  return /^\s*«?aprobado»?\s*\.?\s*$/i.test(respuesta.trim().split("\n")[0]) || /^\s*aprobado\b/i.test(respuesta.trim());
}
