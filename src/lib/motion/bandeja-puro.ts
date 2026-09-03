/* -----------------------------------------------------------------------------
   BANDEJA DE ENTRADA — el JSON del plugin llega al módulo sin copy/paste

   Gabriel (2026-09-03): «¿por qué no usamos el MCP directamente para no
   estar trayendo un JSON todo el tiempo?». El exportador ya corre dentro
   de Figma vía use_figma; lo que faltaba era que el resultado LLEGUE al
   editor sin pasar por el portapapeles. Esto es el buzón: quien tenga el
   JSON (el agente que corrió use_figma, un script, el propio plugin cuando
   tenga red) lo deja con POST /api/motion/bandeja y el panel «Importar de
   Figma» lo lista y lo trae con un clic, por el MISMO camino que el pegado
   (validación del IR, normalización, avisos).

   Pura: la lógica del buzón sin red ni proceso, para testear. El route la
   envuelve con un buzón en memoria del proceso (andamiaje: en diosa sería
   una tabla o un objeto en storage con caducidad).
----------------------------------------------------------------------------- */

export type EntradaBandeja = {
  id: string;
  /** nombre del frame (o «N pantallas») para reconocerla en la lista */
  nombre: string;
  /** tamaño del JSON en caracteres: para mostrar «12,6 MB» y para el tope */
  caracteres: number;
  /** cuándo llegó (ms desde epoch) */
  llegada: number;
  /** de dónde vino, si el que la dejó lo dijo («use_figma», «cli», «plugin») */
  origen?: string;
};

export type Bandeja = {
  entradas: EntradaBandeja[];
  contenidos: Map<string, string>;
};

/** Cuántas quedan y cuánto pueden pesar entre todas: es un buzón, no un
    archivo. Lo más viejo se cae cuando entra algo nuevo. */
export const TOPE_ENTRADAS = 8;
export const TOPE_CARACTERES = 120_000_000;

export function crearBandeja(): Bandeja {
  return { entradas: [], contenidos: new Map() };
}

/** ¿Parece el JSON del plugin? Lo mismo que mira el panel al pegar, sin
    normalizar: origen figma y un frame con nodos o un lote de pantallas. */
export function pareceExportDelPlugin(datos: unknown): { ok: true; nombre: string } | { ok: false; error: string } {
  if (!datos || typeof datos !== "object") return { ok: false, error: "el cuerpo no es un objeto JSON" };
  const d = datos as { origen?: unknown; nodos?: unknown; frame?: { nombre?: unknown }; pantallas?: unknown };
  if (d.origen !== "figma") return { ok: false, error: "no es un export del plugin de Figma del módulo (falta origen: figma)" };
  if (Array.isArray(d.pantallas)) {
    if (d.pantallas.length === 0) return { ok: false, error: "el lote no trae pantallas" };
    return { ok: true, nombre: `${d.pantallas.length} pantallas` };
  }
  if (!Array.isArray(d.nodos)) return { ok: false, error: "el export no trae nodos" };
  const nombre = typeof d.frame?.nombre === "string" && d.frame.nombre.trim() ? d.frame.nombre : "pantalla";
  return { ok: true, nombre };
}

/** Deja un JSON (ya validado como string) en la bandeja. Devuelve la entrada
    y la bandeja nueva (sin mutar la anterior). */
export function dejarEnBandeja(
  bandeja: Bandeja,
  contenido: string,
  nombre: string,
  ahora: number,
  origen?: string,
  id: string = `b-${ahora.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
): { bandeja: Bandeja; entrada: EntradaBandeja } {
  const entrada: EntradaBandeja = { id, nombre, caracteres: contenido.length, llegada: ahora, origen };
  const entradas = [entrada, ...bandeja.entradas.filter((e) => e.id !== id)];
  const contenidos = new Map(bandeja.contenidos);
  contenidos.set(id, contenido);
  // topes: primero por cantidad, después por peso (lo más viejo se va)
  let total = entradas.reduce((s, e) => s + e.caracteres, 0);
  while (entradas.length > TOPE_ENTRADAS || (total > TOPE_CARACTERES && entradas.length > 1)) {
    const vieja = entradas.pop();
    if (!vieja) break;
    contenidos.delete(vieja.id);
    total -= vieja.caracteres;
  }
  return { bandeja: { entradas, contenidos }, entrada };
}

/** Saca una entrada (la bandeja nueva ya no la tiene). null si no está. */
export function tomarDeBandeja(bandeja: Bandeja, id: string): { bandeja: Bandeja; contenido: string } | null {
  const contenido = bandeja.contenidos.get(id);
  if (contenido === undefined) return null;
  const contenidos = new Map(bandeja.contenidos);
  contenidos.delete(id);
  return { bandeja: { entradas: bandeja.entradas.filter((e) => e.id !== id), contenidos }, contenido };
}

/** Lo que ve el panel: sin los contenidos, de la más nueva a la más vieja. */
export function listarBandeja(bandeja: Bandeja): EntradaBandeja[] {
  return [...bandeja.entradas].sort((a, b) => b.llegada - a.llegada);
}

export function describirPeso(caracteres: number): string {
  if (caracteres < 1_000) return `${caracteres} B`;
  if (caracteres < 1_000_000) return `${Math.round(caracteres / 1_000)} KB`;
  return `${(caracteres / 1_000_000).toFixed(1).replace(".", ",")} MB`;
}
