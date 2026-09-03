/* -----------------------------------------------------------------------------
   Proveedor OPENROUTER del director de motion (Kimi K3 y cualquier modelo
   con id «proveedor/modelo»)

   Gabriel (2026-09-03): «quiero integrar Kimi usando la API de OpenRouter».
   OpenRouter habla el formato de OpenAI: chat completions con `tools` y
   `tool_calls`. Mismo prompt-escuela (SISTEMA) y mismas herramientas que
   Anthropic y Gemini: acá solo se traduce el transporte. El razonamiento
   viaja como `reasoning: {effort}` (el slider del panel) y si el modelo lo
   rechaza se reintenta sin él — degradar, no romper.

   Selección: MOTION_AGENTE_MODELO=moonshotai/kimi-k3 (la barra delata el
   proveedor: ni claude-* ni gemini-* la llevan) + OPENROUTER_API_KEY.
----------------------------------------------------------------------------- */

import type { EventoAgente, TurnoAgente } from "@/lib/motion/agente";
import { sumarUso, type UsoTokens } from "@/lib/motion/costo-agente-puro";
import type { ImagenRevision } from "@/lib/motion/revision-puro";
import type { DefHerramienta, NivelPensamiento } from "@/lib/motion/agente-gemini";

export const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

/** Un id con barra («moonshotai/kimi-k3») es de OpenRouter. */
export function esModeloOpenRouter(modelo: string): boolean {
  return modelo.includes("/");
}

type ParteContenido =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type LlamadaHerramienta = { id: string; type: "function"; function: { name: string; arguments: string } };

type MensajeOpenAI = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ParteContenido[] | null;
  tool_calls?: LlamadaHerramienta[];
  tool_call_id?: string;
  /** el razonamiento que OpenRouter pide devolver tal cual entre turnos
      con herramientas (Kimi y otros pensadores lo necesitan para seguir) */
  reasoning_details?: unknown;
};

/** Anthropic tools → tools de OpenAI: mismo JSON Schema bajo `parameters`. */
export function herramientasParaOpenAI(defs: DefHerramienta[]): { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }[] {
  return defs.map((d) => ({ type: "function", function: { name: d.name, description: d.description, parameters: d.input_schema } }));
}

/** El slider del panel como `reasoning.effort`; apagado/ausente = nada. */
export function razonamientoOpenRouter(nivel: NivelPensamiento | undefined): { reasoning: { effort: "low" | "medium" | "high" } } | Record<string, never> {
  if (!nivel || nivel === "apagado") return {};
  return { reasoning: { effort: nivel === "alto" ? "high" : nivel === "medio" ? "medium" : "low" } };
}

export function contenidoDeUsuario(texto: string, imagenes?: ImagenRevision[]): string | ParteContenido[] {
  if (!imagenes?.length) return texto;
  return [
    ...imagenes.map<ParteContenido>((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.datosBase64}` } })),
    { type: "text", text: texto },
  ];
}

type RespuestaChat = {
  choices?: { message?: MensajeOpenAI & { reasoning?: string }; finish_reason?: string }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
};

function usoDe(datos: RespuestaChat): UsoTokens {
  const u = datos.usage;
  const cache = u?.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    entrada: Math.max(0, (u?.prompt_tokens ?? 0) - cache),
    salida: u?.completion_tokens ?? 0,
    cacheLectura: cache,
    pensamiento: u?.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

/** UN pedido con degradación: si el modelo rechaza `reasoning` o
    `response_format` (400 que los nombra) se reintenta sin eso. */
async function pedirOpenRouter(
  apiKey: string,
  cuerpo: Record<string, unknown>,
): Promise<{ ok: true; datos: RespuestaChat; cuerpo: Record<string, unknown> } | { ok: false; error: string }> {
  let vivo = { ...cuerpo };
  for (let intento = 0; intento < 3; intento++) {
    const res = await fetch(URL_OPENROUTER, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://adiosadios.com",
        "X-Title": "diosa motion",
      },
      body: JSON.stringify(vivo),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      if (res.status === 400 && "reasoning" in vivo && /reason/i.test(detalle)) {
        const { reasoning: _r, ...sinRazon } = vivo;
        void _r;
        vivo = sinRazon;
        continue;
      }
      if (res.status === 400 && "response_format" in vivo && /response_format|json/i.test(detalle)) {
        const { response_format: _f, ...sinFormato } = vivo;
        void _f;
        vivo = sinFormato;
        continue;
      }
      return { ok: false, error: `OpenRouter respondió ${res.status}: ${detalle.slice(0, 300)}` };
    }
    const datos = (await res.json()) as RespuestaChat;
    // OpenRouter puede devolver 200 con {error} adentro (proveedor caído)
    if (datos.error?.message && !datos.choices?.length) return { ok: false, error: `OpenRouter: ${datos.error.message.slice(0, 300)}` };
    return { ok: true, datos, cuerpo: vivo };
  }
  return { ok: false, error: "OpenRouter rechazó el pedido tres veces" };
}

function textoDe(contenido: MensajeOpenAI["content"]): string {
  if (typeof contenido === "string") return contenido;
  if (!contenido) return "";
  return contenido.map((p) => (p.type === "text" ? p.text : "")).join("\n");
}

/** UNA llamada sin herramientas (el GUIONISTA). Con `json` pide salida
    JSON (response_format); si el modelo no lo soporta, sin él. */
export async function generarOpenRouter(opts: {
  apiKey: string;
  modelo: string;
  sistema: string;
  historial: TurnoAgente[];
  primerUsuario: string;
  imagenes?: ImagenRevision[];
  json?: boolean;
  pensamiento?: NivelPensamiento;
}): Promise<{ ok: true; texto: string; uso: UsoTokens; modelo: string } | { ok: false; error: string }> {
  const messages: MensajeOpenAI[] = [
    { role: "system", content: opts.sistema },
    ...opts.historial.slice(-12).map<MensajeOpenAI>((t) => ({ role: t.rol === "usuario" ? "user" : "assistant", content: t.texto })),
    { role: "user", content: contenidoDeUsuario(opts.primerUsuario, opts.imagenes) },
  ];
  const res = await pedirOpenRouter(opts.apiKey, {
    model: opts.modelo,
    messages,
    ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    ...razonamientoOpenRouter(opts.pensamiento ?? "alto"),
  });
  if (!res.ok) return res;
  const texto = textoDe(res.datos.choices?.[0]?.message?.content ?? "").trim();
  if (!texto) return { ok: false, error: "OpenRouter devolvió una respuesta vacía" };
  return { ok: true, texto, uso: usoDe(res.datos), modelo: opts.modelo };
}

/** El loop agéntico contra OpenRouter: mismo contrato que loopGemini. */
export async function loopOpenRouter(opts: {
  apiKey: string;
  modelo: string;
  sistema: string;
  historial: TurnoAgente[];
  primerUsuario: string;
  imagenes?: ImagenRevision[];
  herramientas: DefHerramienta[];
  maxIteraciones: number;
  ejecutar: (nombre: string, input: Record<string, unknown>) => { resultado: string; esError?: boolean; resumen?: string };
  onEvento?: (evento: EventoAgente) => void;
  pensamiento?: NivelPensamiento;
}): Promise<{ ok: true; respuesta: string; uso: UsoTokens } | { ok: false; error: string }> {
  let usoTotal: UsoTokens = { entrada: 0, salida: 0 };
  const tools = herramientasParaOpenAI(opts.herramientas);
  let razon: Record<string, unknown> = razonamientoOpenRouter(opts.pensamiento ?? "alto");
  const messages: MensajeOpenAI[] = [
    { role: "system", content: opts.sistema },
    ...opts.historial.slice(-12).map<MensajeOpenAI>((t) => ({ role: t.rol === "usuario" ? "user" : "assistant", content: t.texto })),
    { role: "user", content: contenidoDeUsuario(opts.primerUsuario, opts.imagenes) },
  ];

  for (let iteracion = 0; iteracion < opts.maxIteraciones; iteracion++) {
    const t0 = Date.now();
    const res = await pedirOpenRouter(opts.apiKey, { model: opts.modelo, messages, tools, tool_choice: "auto", ...razon });
    if (!res.ok) return res;
    // si el pedido salió sin reasoning (lo rechazó), no se vuelve a mandar
    if (!("reasoning" in res.cuerpo)) razon = {};
    const msModelo = Date.now() - t0;
    const usoPaso = usoDe(res.datos);
    usoTotal = sumarUso(usoTotal, usoPaso);
    const mensaje = res.datos.choices?.[0]?.message;
    const llamadas = mensaje?.tool_calls ?? [];
    const texto = textoDe(mensaje?.content ?? "").trim();

    if (llamadas.length === 0) {
      opts.onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: [], uso: usoPaso });
      return { ok: true, respuesta: texto || "Listo.", uso: usoTotal };
    }

    messages.push({
      role: "assistant",
      content: mensaje?.content ?? null,
      tool_calls: llamadas,
      ...(mensaje?.reasoning_details !== undefined ? { reasoning_details: mensaje.reasoning_details } : {}),
    });
    const opsIteracion: string[] = [];
    for (const llamada of llamadas) {
      let input: Record<string, unknown> = {};
      try {
        input = llamada.function.arguments ? (JSON.parse(llamada.function.arguments) as Record<string, unknown>) : {};
      } catch {
        input = {};
      }
      const r = opts.ejecutar(llamada.function.name, input);
      opsIteracion.push(
        r.esError
          ? `${llamada.function.name} → ERROR: ${r.resultado.replace(/^ERROR: /, "").split("\n")[0].slice(0, 110)}`
          : (r.resumen ?? llamada.function.name),
      );
      messages.push({ role: "tool", tool_call_id: llamada.id, content: r.esError ? `ERROR: ${r.resultado}` : r.resultado });
    }
    opts.onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: opsIteracion, uso: usoPaso, texto: texto || undefined });
  }
  return { ok: true, respuesta: "Corté acá para no seguir en bucle — revisá lo aplicado y pedime el siguiente paso.", uso: usoTotal };
}
