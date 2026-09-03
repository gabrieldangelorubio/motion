/* -----------------------------------------------------------------------------
   Costo del director — cuánto salió CADA dirección, en dólares

   Las dos APIs devuelven los tokens usados por llamada; acá viven la tabla
   de precios por modelo (USD por MILLÓN de tokens, con fecha — los precios
   cambian: actualizar acá es un solo lugar) y la aritmética pura. Un modelo
   sin precio cargado devuelve null: la UI muestra los tokens igual y avisa
   que falta el precio, nunca inventa un número.
----------------------------------------------------------------------------- */

export type UsoTokens = {
  entrada: number;
  salida: number;
  /** tokens servidos desde el cache (mucho más baratos) */
  cacheLectura?: number;
  /** tokens escritos al cache (Anthropic: ~1.25× la entrada) */
  cacheEscritura?: number;
  /** tokens de RAZONAMIENTO (Gemini thoughts) — informativo: ya están
      INCLUIDOS en `salida` (así se facturan), acá viajan aparte para que
      el log muestre cuánto pensó de verdad cada paso */
  pensamiento?: number;
};

type Precio = { entrada: number; salida: number; cacheLectura?: number; cacheEscritura?: number };

/** USD por millón de tokens. Verificado 2026-08-28 (3.8-flash: 2026-09-03).
    OJO gemini-3.6-flash y gemini-3.8-flash: precio INTRO hasta el
    31/12/2026 — el 1/1/2027 pasan a 1.50 / 7.50 (cache 0.15). */
export const PRECIOS_USD_POR_MILLON: Record<string, Precio> = {
  "claude-opus-5": { entrada: 5, salida: 25, cacheLectura: 0.5, cacheEscritura: 6.25 },
  "claude-opus-4-8": { entrada: 5, salida: 25, cacheLectura: 0.5, cacheEscritura: 6.25 },
  "claude-sonnet-5": { entrada: 2, salida: 10, cacheLectura: 0.2, cacheEscritura: 2.5 },
  "claude-haiku-4-5": { entrada: 1, salida: 5, cacheLectura: 0.1, cacheEscritura: 1.25 },
  "gemini-3.8-flash": { entrada: 0.75, salida: 3.75, cacheLectura: 0.075 },
  "gemini-3.6-flash": { entrada: 0.75, salida: 3.75, cacheLectura: 0.15 },
  "gemini-2.5-flash": { entrada: 0.3, salida: 2.5 },
};

/** El precio del modelo, por prefijo MÁS LARGO que matchee (los ids reales
    pueden traer sufijos de versión). null = precio no cargado. */
export function precioDeModelo(modelo: string): Precio | null {
  let mejor: string | null = null;
  for (const clave of Object.keys(PRECIOS_USD_POR_MILLON)) {
    if (modelo.startsWith(clave) && (!mejor || clave.length > mejor.length)) mejor = clave;
  }
  return mejor ? PRECIOS_USD_POR_MILLON[mejor] : null;
}

export function sumarUso(a: UsoTokens, b: UsoTokens): UsoTokens {
  return {
    entrada: a.entrada + b.entrada,
    salida: a.salida + b.salida,
    cacheLectura: (a.cacheLectura ?? 0) + (b.cacheLectura ?? 0),
    cacheEscritura: (a.cacheEscritura ?? 0) + (b.cacheEscritura ?? 0),
    pensamiento: (a.pensamiento ?? 0) + (b.pensamiento ?? 0),
  };
}

/** Costo en USD del uso con el precio del modelo; null si no hay precio. */
export function costoUSD(modelo: string, uso: UsoTokens): number | null {
  const precio = precioDeModelo(modelo);
  if (!precio) return null;
  const M = 1_000_000;
  return (
    (uso.entrada / M) * precio.entrada +
    (uso.salida / M) * precio.salida +
    ((uso.cacheLectura ?? 0) / M) * (precio.cacheLectura ?? precio.entrada) +
    ((uso.cacheEscritura ?? 0) / M) * (precio.cacheEscritura ?? precio.entrada)
  );
}

/** "$0.0123" legible; los pedidos baratos no se redondean a cero. */
export function formatearCosto(usd: number): string {
  if (usd < 0.0001) return "<$0.0001";
  return `$${usd.toFixed(usd < 0.01 ? 4 : usd < 1 ? 3 : 2)}`;
}

/** "184k tokens" / "1.2M tokens" para el renglón de meta. */
export function formatearTokens(total: number): string {
  if (total >= 1_000_000) return `${(total / 1_000_000).toFixed(1)}M tokens`;
  if (total >= 1000) return `${Math.round(total / 1000)}k tokens`;
  return `${total} tokens`;
}
