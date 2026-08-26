/* -----------------------------------------------------------------------------
   Merge por elemento para el guardado concurrente (patrón §2.4 del kit)

   Dos pestañas editan la misma composición: cuando el UPDATE condicional por
   rev falla, el server fusiona ANTES de reintentar. Por capa gana el `v`
   (timestamp) más alto; los borrados son lápidas — sin ellas, la capa que
   una pestaña borró resucita porque la otra la sigue mandando.
----------------------------------------------------------------------------- */

import type { Capa, Composicion } from "@/lib/motion/modelo";

export function fusionarComposiciones(servidor: Composicion, entrante: Composicion): Composicion {
  const lapidas = new Map<string, number>();
  for (const b of [...(servidor.borrados ?? []), ...(entrante.borrados ?? [])]) {
    lapidas.set(b.id, Math.max(lapidas.get(b.id) ?? 0, b.v));
  }

  const porId = new Map<string, Capa>();
  for (const capa of servidor.capas) porId.set(capa.id, capa);
  for (const capa of entrante.capas) {
    const previa = porId.get(capa.id);
    if (!previa || (capa.v ?? 0) >= (previa.v ?? 0)) porId.set(capa.id, capa);
  }

  const capas: Capa[] = [];
  for (const capa of porId.values()) {
    const lapida = lapidas.get(capa.id);
    if (lapida !== undefined && lapida >= (capa.v ?? 0)) continue;
    capas.push(capa);
  }

  // El orden de capas lo decide el snapshot con la edición más reciente:
  // fusionar orden por-elemento no tiene una respuesta buena y éste es el
  // mismo criterio de los otros dos lienzos.
  const ordenDe = (c: Composicion) => Math.max(0, ...c.capas.map((x) => x.v ?? 0));
  const guia = ordenDe(entrante) >= ordenDe(servidor) ? entrante : servidor;
  const posicion = new Map(guia.capas.map((c, i) => [c.id, i]));
  capas.sort((a, b) => (posicion.get(a.id) ?? 1e9) - (posicion.get(b.id) ?? 1e9));

  return {
    ...guia,
    capas,
    borrados: [...lapidas.entries()].map(([id, v]) => ({ id, v })),
    rev: Math.max(servidor.rev ?? 0, entrante.rev ?? 0),
  };
}
