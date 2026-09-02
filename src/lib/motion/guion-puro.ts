/* -----------------------------------------------------------------------------
   GUION externo — la parte PURA

   Un guion es la dirección escrita como una lista de pasos con las MISMAS
   herramientas que usa el director (definir_entrada, definir_camara,
   definir_pista…), en JSON. Lo puede escribir un director externo (Fable
   desde el chat de desarrollo, un humano) y se aplica sin modelo, en orden,
   con el mismo ejecutor y las mismas validaciones. El informe dice qué pasó
   con cada paso; los errores no cortan (se anotan y se sigue), igual que en
   el loop del director.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";

export type PasoGuion = {
  herramienta: string;
  input: Record<string, unknown>;
  /** por qué este paso (viaja al informe; el guion se lee como guion) */
  nota?: string;
};

export type ResultadoGuion = {
  comp: Composicion;
  /** una línea por paso: «✓ 3 definir_entrada → resumen» o «✗ 3 … ERROR: …» */
  informe: string[];
  errores: number;
};

/** Acepta el JSON crudo (un array, o {pasos:[…]}) y devuelve pasos válidos
    o el motivo por el que no lo son. */
export function validarGuion(crudo: unknown): PasoGuion[] | string {
  const lista = Array.isArray(crudo)
    ? crudo
    : crudo && typeof crudo === "object" && Array.isArray((crudo as { pasos?: unknown }).pasos)
      ? (crudo as { pasos: unknown[] }).pasos
      : null;
  if (!lista) return "el guion tiene que ser un array de pasos o {pasos: [...]}";
  if (lista.length === 0) return "el guion está vacío";
  const pasos: PasoGuion[] = [];
  for (let i = 0; i < lista.length; i++) {
    const p = lista[i] as { herramienta?: unknown; input?: unknown; nota?: unknown };
    if (!p || typeof p !== "object" || typeof p.herramienta !== "string" || !p.herramienta) {
      return `paso ${i + 1}: falta «herramienta»`;
    }
    if (p.input !== undefined && (typeof p.input !== "object" || p.input === null || Array.isArray(p.input))) {
      return `paso ${i + 1} (${p.herramienta}): «input» tiene que ser un objeto`;
    }
    pasos.push({
      herramienta: p.herramienta,
      input: (p.input as Record<string, unknown> | undefined) ?? {},
      nota: typeof p.nota === "string" ? p.nota : undefined,
    });
  }
  return pasos;
}

/** Aplica el guion paso a paso sobre la composición. Pura: misma entrada,
    misma salida; la comp original no se toca. */
export function aplicarGuion(comp: Composicion, pasos: PasoGuion[]): ResultadoGuion {
  let viva = comp;
  const informe: string[] = [];
  let errores = 0;
  pasos.forEach((paso, i) => {
    const res = ejecutarHerramienta(viva, paso.herramienta, paso.input);
    viva = res.comp;
    const n = String(i + 1).padStart(2, "0");
    if (res.esError) {
      errores++;
      informe.push(`✗ ${n} ${paso.herramienta} → ${res.resultado.replace(/^ERROR: /, "").split("\n")[0].slice(0, 160)}${paso.nota ? `  [${paso.nota}]` : ""}`);
    } else {
      informe.push(`✓ ${n} ${res.resumen ?? paso.herramienta}${paso.nota ? `  [${paso.nota}]` : ""}`);
    }
  });
  return { comp: viva, informe, errores };
}
