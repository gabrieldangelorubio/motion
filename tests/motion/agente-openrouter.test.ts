import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contenidoDeUsuario,
  esModeloOpenRouter,
  generarOpenRouter,
  herramientasParaOpenAI,
  loopOpenRouter,
  razonamientoOpenRouter,
  URL_OPENROUTER,
} from "@/lib/motion/agente-openrouter";
import { DEFINICIONES_HERRAMIENTAS, ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import type { DefHerramienta } from "@/lib/motion/agente-gemini";
import type { EventoAgente } from "@/lib/motion/agente";

/** OpenRouter de mentira: responde en orden y guarda lo que recibió. */
function openRouterFalso(respuestas: (Record<string, unknown> | { status: number; texto: string })[]) {
  const pedidos: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  let i = 0;
  const fetchFalso = async (url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, body: JSON.parse(String(init?.body ?? "{}")) });
    const r = respuestas[Math.min(i, respuestas.length - 1)];
    i++;
    if ("status" in r && typeof r.status === "number" && "texto" in r) return new Response(String(r.texto), { status: r.status });
    return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { pedidos, fetchFalso: fetchFalso as unknown as typeof fetch };
}

const mensajeFinal = (texto: string) => ({
  choices: [{ message: { role: "assistant", content: texto } }],
  usage: { prompt_tokens: 1000, completion_tokens: 200, completion_tokens_details: { reasoning_tokens: 150 }, prompt_tokens_details: { cached_tokens: 400 } },
});

test("esModeloOpenRouter: la barra delata el proveedor; tools y razonamiento se traducen al formato OpenAI", () => {
  assert.equal(esModeloOpenRouter("moonshotai/kimi-k3"), true);
  assert.equal(esModeloOpenRouter("gemini-3.8-flash"), false);
  assert.equal(esModeloOpenRouter("claude-opus-5"), false);
  const tools = herramientasParaOpenAI(DEFINICIONES_HERRAMIENTAS as unknown as DefHerramienta[]);
  assert.equal(tools.length, DEFINICIONES_HERRAMIENTAS.length);
  assert.equal(tools[0].type, "function");
  assert.ok(tools.some((t) => t.function.name === "definir_entrada" && t.function.parameters.type === "object"));
  assert.deepEqual(razonamientoOpenRouter("alto"), { reasoning: { effort: "high" } });
  assert.deepEqual(razonamientoOpenRouter("medio"), { reasoning: { effort: "medium" } });
  assert.deepEqual(razonamientoOpenRouter("bajo"), { reasoning: { effort: "low" } });
  assert.deepEqual(razonamientoOpenRouter("apagado"), {});
  assert.deepEqual(razonamientoOpenRouter(undefined), {});
  // las imágenes van como data URL antes del texto
  const partes = contenidoDeUsuario("hola", [{ mime: "image/jpeg", datosBase64: "AAA" }]);
  assert.ok(Array.isArray(partes) && partes[0].type === "image_url" && partes[1].type === "text");
  assert.equal(contenidoDeUsuario("hola"), "hola");
});

test("loopOpenRouter: ejecuta los tool_calls, devuelve el resultado con su id y cuenta tokens (razonamiento y cache aparte)", async () => {
  const fetchOriginal = globalThis.fetch;
  const conHerramienta = {
    choices: [{
      message: {
        role: "assistant",
        content: "LECTURA. Un título.",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "definir_entrada", arguments: JSON.stringify({ capaId: "t", preset: "subir" }) } }],
        reasoning_details: [{ type: "reasoning.text", text: "pienso" }],
      },
    }],
    usage: { prompt_tokens: 500, completion_tokens: 100 },
  };
  const { pedidos, fetchFalso } = openRouterFalso([conHerramienta, mensajeFinal("Listo: el título sube.")]);
  globalThis.fetch = fetchFalso;
  try {
    let comp = crearComposicion({ nombre: "or" });
    comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "t", texto: "HOLA" }).comp;
    const eventos: EventoAgente[] = [];
    const res = await loopOpenRouter({
      apiKey: "k",
      modelo: "moonshotai/kimi-k3",
      sistema: "SISTEMA",
      historial: [],
      primerUsuario: "animá",
      herramientas: DEFINICIONES_HERRAMIENTAS as unknown as DefHerramienta[],
      maxIteraciones: 5,
      ejecutar: (nombre, input) => {
        const r = ejecutarHerramienta(comp, nombre, input);
        comp = r.comp;
        return { resultado: r.resultado, esError: r.esError, resumen: r.resumen };
      },
      onEvento: (e) => eventos.push(e),
      pensamiento: "medio",
    });
    assert.ok(res.ok, res.ok ? "" : res.error);
    if (!res.ok) return;
    assert.equal(res.respuesta, "Listo: el título sube.");
    assert.equal(comp.capas[0].entrada?.preset, "subir");
    assert.equal(pedidos.length, 2);
    assert.equal(pedidos[0].url, URL_OPENROUTER);
    assert.equal(pedidos[0].headers.authorization, "Bearer k");
    assert.equal(pedidos[0].body.model, "moonshotai/kimi-k3");
    assert.deepEqual(pedidos[0].body.reasoning, { effort: "medium" });
    assert.equal(pedidos[0].body.max_tokens, 16000);
    assert.ok(Array.isArray(pedidos[0].body.tools) && (pedidos[0].body.tools as unknown[]).length > 5);
    // el segundo pedido lleva el assistant con sus tool_calls (y el razonamiento devuelto) y el tool result con el id
    const msgs = pedidos[1].body.messages as { role: string; tool_call_id?: string; content: unknown; reasoning_details?: unknown }[];
    assert.equal(msgs[0].role, "system");
    const asistente = msgs.find((m) => m.role === "assistant");
    assert.ok(asistente && asistente.reasoning_details);
    const tool = msgs.find((m) => m.role === "tool");
    assert.equal(tool?.tool_call_id, "call_1");
    assert.match(String(tool?.content), /subir/);
    // tokens: entrada sin lo cacheado, cache y razonamiento aparte
    assert.deepEqual(res.uso, { entrada: 500 + 600, salida: 300, cacheLectura: 400, cacheEscritura: 0, pensamiento: 150 });
    assert.equal(eventos.length, 2);
    assert.equal(eventos[0].texto, "LECTURA. Un título.");
    assert.match(eventos[0].ops[0], /subir|entrada/);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("generarOpenRouter pide JSON; si el modelo rechaza response_format o reasoning, reintenta sin eso", async () => {
  const fetchOriginal = globalThis.fetch;
  const { pedidos, fetchFalso } = openRouterFalso([
    { status: 400, texto: '{"error":{"message":"response_format is not supported by this model"}}' },
    { status: 400, texto: '{"error":{"message":"reasoning is not supported"}}' },
    mensajeFinal('{"pasos":[]}'),
  ]);
  globalThis.fetch = fetchFalso;
  try {
    const res = await generarOpenRouter({ apiKey: "k", modelo: "moonshotai/kimi-k3", sistema: "S", historial: [], primerUsuario: "u", json: true, pensamiento: "alto" });
    assert.ok(res.ok, res.ok ? "" : res.error);
    assert.equal(pedidos.length, 3);
    assert.ok("response_format" in pedidos[0].body && "reasoning" in pedidos[0].body);
    assert.equal(pedidos[0].body.max_tokens, 32000);
    assert.ok(!("response_format" in pedidos[1].body) && "reasoning" in pedidos[1].body);
    assert.ok(!("response_format" in pedidos[2].body) && !("reasoning" in pedidos[2].body));
    if (res.ok) assert.equal(res.texto, '{"pasos":[]}');
    // un error de verdad llega legible
    const { fetchFalso: roto } = openRouterFalso([{ status: 402, texto: "insufficient credits" }]);
    globalThis.fetch = roto;
    const mal = await generarOpenRouter({ apiKey: "k", modelo: "moonshotai/kimi-k3", sistema: "S", historial: [], primerUsuario: "u" });
    assert.ok(!mal.ok && /402/.test(mal.error));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test("dirigirComposicion manda a OpenRouter cuando MOTION_AGENTE_MODELO lleva barra, y pide la clave si falta", async () => {
  const fetchOriginal = globalThis.fetch;
  const envOriginal = { ...process.env };
  process.env.MOTION_AGENTE_MODELO = "moonshotai/kimi-k3";
  delete process.env.OPENROUTER_API_KEY;
  try {
    const { dirigirComposicion } = await import("@/lib/motion/agente");
    let comp = crearComposicion({ nombre: "or" });
    comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "t", texto: "HOLA" }).comp;
    // con charla previa va por el loop iterativo
    const historial = [{ rol: "usuario" as const, texto: "hola" }, { rol: "agente" as const, texto: "listo" }];
    const sinClave = await dirigirComposicion(comp, "más lento", historial);
    assert.ok(!sinClave.ok && /OPENROUTER_API_KEY/.test(sinClave.error));
    process.env.OPENROUTER_API_KEY = "k";
    const { pedidos, fetchFalso } = openRouterFalso([mensajeFinal("Nada que tocar.")]);
    globalThis.fetch = fetchFalso;
    const res = await dirigirComposicion(comp, "más lento", historial, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "bajo");
    assert.ok(res.ok, res.ok ? "" : res.error);
    if (res.ok) assert.equal(res.modelo, "moonshotai/kimi-k3");
    assert.equal(pedidos[0].url, URL_OPENROUTER);
    assert.deepEqual(pedidos[0].body.reasoning, { effort: "low" });
    assert.match(String((pedidos[0].body.messages as { content: string }[])[0].content), /REGLA DE ORO/);
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = envOriginal;
  }
});

test("el modelo elegido en el panel manda sobre el entorno: con default Gemini, elegir Kimi va a OpenRouter", async () => {
  const fetchOriginal = globalThis.fetch;
  const envOriginal = { ...process.env };
  process.env.GEMINI_API_KEY = "g";
  process.env.OPENROUTER_API_KEY = "o";
  delete process.env.MOTION_AGENTE_MODELO;
  try {
    const { dirigirComposicion } = await import("@/lib/motion/agente");
    let comp = crearComposicion({ nombre: "elegido" });
    comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "t", texto: "HOLA" }).comp;
    const historial = [{ rol: "usuario" as const, texto: "hola" }, { rol: "agente" as const, texto: "listo" }];
    const { pedidos, fetchFalso } = openRouterFalso([mensajeFinal("Nada que tocar.")]);
    globalThis.fetch = fetchFalso;
    const res = await dirigirComposicion(comp, "más lento", historial, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, "moonshotai/kimi-k3");
    assert.ok(res.ok, res.ok ? "" : res.error);
    if (res.ok) assert.equal(res.modelo, "moonshotai/kimi-k3");
    assert.equal(pedidos[0].url, URL_OPENROUTER);
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = envOriginal;
  }
});

test("un timeout del proveedor llega como error legible, no como panel colgado", async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    throw e;
  }) as unknown as typeof fetch;
  try {
    const res = await generarOpenRouter({ apiKey: "k", modelo: "moonshotai/kimi-k3", sistema: "S", historial: [], primerUsuario: "u" });
    assert.ok(!res.ok && /30 minutos/.test(res.error));
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});
