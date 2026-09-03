/* -----------------------------------------------------------------------------
   CATÁLOGO DE MODELOS DEL DIRECTOR — qué puede elegir el panel

   Gabriel (2026-09-03): «¿cómo sé qué agente está elegido? En vez de
   rápido/fino pongamos un dropdown con los nombres reales». El servidor
   arma la lista con las CLAVES que tiene cargadas (Anthropic, Gemini,
   OpenRouter) y el panel la muestra con nombres legibles; el id viaja en
   el pedido y el route solo acepta ids de esta lista. Pura: testeable.
----------------------------------------------------------------------------- */

export type ProveedorDirector = "anthropic" | "gemini" | "openrouter";

export type ModeloDirector = { id: string; nombre: string; proveedor: ProveedorDirector };

export type EnvDirector = {
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  MOTION_AGENTE_MODELO?: string;
  MOTION_AGENTE_MODELO_FINO?: string;
};

const NOMBRES: Record<string, string> = {
  "claude-opus-5": "Claude Opus 5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "moonshotai/kimi-k3": "Kimi K3",
};

/** La barra es OpenRouter, gemini-* es Gemini, el resto Anthropic. */
export function proveedorDe(id: string): ProveedorDirector {
  if (id.includes("/")) return "openrouter";
  if (id.startsWith("gemini")) return "gemini";
  return "anthropic";
}

/** Nombre legible: conocido por tabla; si no, el id sin el proveedor y
    con mayúsculas («moonshotai/kimi-k2-thinking» → «Kimi K2 Thinking»). */
export function etiquetaDeModelo(id: string): string {
  if (NOMBRES[id]) return NOMBRES[id];
  const crudo = id.includes("/") ? id.slice(id.indexOf("/") + 1) : id;
  return crudo
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => (/^\d/.test(p) ? p : p[0].toUpperCase() + p.slice(1)))
    .join(" ");
}

/** El default del entorno (mismo criterio que modeloDirector en agente.ts,
    duplicado acá para que este módulo no arrastre el SDK). */
export function modeloPorDefecto(env: EnvDirector): string {
  if (env.MOTION_AGENTE_MODELO) return env.MOTION_AGENTE_MODELO;
  return env.GEMINI_API_KEY ? "gemini-3.8-flash" : "claude-opus-5";
}

/** Los modelos que este servidor puede correr: el default primero, después
    los conocidos de cada proveedor con clave, más los del entorno. */
export function catalogoDeModelos(env: EnvDirector): { modelos: ModeloDirector[]; defecto: string } {
  const hayClave: Record<ProveedorDirector, boolean> = {
    anthropic: !!env.ANTHROPIC_API_KEY,
    gemini: !!env.GEMINI_API_KEY,
    openrouter: !!env.OPENROUTER_API_KEY,
  };
  const defecto = modeloPorDefecto(env);
  const candidatos = [
    defecto,
    env.MOTION_AGENTE_MODELO_FINO,
    "gemini-3.8-flash",
    "claude-opus-5",
    "claude-sonnet-5",
    "moonshotai/kimi-k3",
  ].filter((id): id is string => !!id);
  const vistos = new Set<string>();
  const modelos: ModeloDirector[] = [];
  for (const id of candidatos) {
    if (vistos.has(id)) continue;
    const proveedor = proveedorDe(id);
    // el default entra aunque falte la clave: el error al usarlo es legible
    // («Falta X_API_KEY») y así se ve qué está configurado
    if (!hayClave[proveedor] && id !== defecto) continue;
    vistos.add(id);
    modelos.push({ id, nombre: etiquetaDeModelo(id), proveedor });
  }
  return { modelos, defecto };
}

export function esModeloDelCatalogo(catalogo: { modelos: ModeloDirector[] }, id: unknown): id is string {
  return typeof id === "string" && catalogo.modelos.some((m) => m.id === id);
}
