/* -----------------------------------------------------------------------------
   ANDAMIAJE — stub del traductor de diosa (kit §2.6 y anexo F)

   En la integración este archivo se reemplaza por el real
   (src/lib/i18n/traducir.ts) y el import no cambia de forma. El castellano
   ES la clave: t(x) === x acá y en producción con idioma "es".
----------------------------------------------------------------------------- */

import type { ReactNode } from "react";

type Vars = Record<string, string | number>;

const rellenar = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? "")) : s;

export const t = Object.assign(
  (clave: string, vars?: Vars) => rellenar(clave, vars),
  {
    idioma: "es" as const,
    plural: (n: number, sing: string, plur: string, vars?: Vars) =>
      rellenar(n === 1 ? sing : plur, { n, ...vars }),
    ctx: (_ctx: string, clave: string, vars?: Vars) => rellenar(clave, vars),
    rico: (clave: string, huecos: Record<string, ReactNode>) =>
      clave.split(/(\{\w+\})/).map((p) => huecos[p.slice(1, -1)] ?? p),
  },
);

/** El hook del cliente en diosa; acá devuelve el stub. */
export function useT() {
  return t;
}
