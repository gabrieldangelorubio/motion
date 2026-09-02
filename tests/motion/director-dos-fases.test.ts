import { test } from "node:test";
import assert from "node:assert/strict";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import type { EventoAgente } from "@/lib/motion/agente";

/** Gemini de mentira: responde lo que le digan, en orden, y guarda lo que
    recibió (para mirar el sistema y el mensaje que viajaron). */
function geminiFalso(respuestas: string[]) {
  const pedidos: { url: string; body: Record<string, unknown> }[] = [];
  let i = 0;
  const fetchFalso = async (url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    const texto = respuestas[Math.min(i, respuestas.length - 1)];
    i++;
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: texto }] } }],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200, thoughtsTokenCount: 500 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return { pedidos, fetchFalso: fetchFalso as unknown as typeof fetch };
}

function piezaSinDirigir() {
  let comp = crearComposicion({ nombre: "dos fases" });
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "titulo", texto: "HOLA MUNDO", x: 960, y: 400 }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "claim", texto: "un claim", x: 960, y: 520 }).comp;
  return comp;
}

test("director en dos fases: el guionista devuelve el guion, el código lo aplica y la corrección cierra los errores", async () => {
  const fetchOriginal = globalThis.fetch;
  const envOriginal = { ...process.env };
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  delete process.env.MOTION_AGENTE_MODELO;
  delete process.env.MOTION_DIRECTOR_MODO;
  const guion = {
    guion: ["LECTURA. Un título y un claim.", "GUION. 4 s: el título abre, el claim lo sigue.", "CARÁCTER. Sereno."],
    pasos: [
      { herramienta: "ajustar_composicion", input: { duracion: 4000 } },
      { herramienta: "definir_entrada", input: { capaId: "titulo", preset: "subirDesenfocado", en: 200, duracion: 900, easing: "salidaExpo" }, nota: "protagonista" },
      { herramienta: "definir_entrada", input: { capaId: "no-existe", preset: "subir", en: 800, duracion: 500 } },
      { herramienta: "definir_camara", input: { zoom: [{ t: 0, v: 1.05 }, { t: 3000, v: 1, easing: "entradaSalidaSine" }] } },
    ],
  };
  const correccion = {
    pasos: [{ herramienta: "definir_entrada", input: { capaId: "claim", preset: "revelar", en: 800, duracion: 600, easing: "salidaQuint" }, nota: "el claim que faltaba" }],
  };
  const { pedidos, fetchFalso } = geminiFalso([`\`\`\`json\n${JSON.stringify(guion)}\n\`\`\``, JSON.stringify(correccion)]);
  globalThis.fetch = fetchFalso;
  const eventos: EventoAgente[] = [];
  try {
    const { dirigirComposicion } = await import("@/lib/motion/agente");
    const res = await dirigirComposicion(piezaSinDirigir(), "animá la pieza", [], undefined, (e) => eventos.push(e));
    assert.ok(res.ok, res.ok ? "" : res.error);
    if (!res.ok) return;
    // dos llamadas: guion + corrección (hubo un ✗)
    assert.equal(pedidos.length, 2);
    // el guionista va SIN herramientas, con salida JSON y el modo guion en el sistema
    assert.equal(pedidos[0].body.tools, undefined);
    const gen = pedidos[0].body.generationConfig as Record<string, unknown>;
    assert.equal(gen.responseMimeType, "application/json");
    const sistema = (pedidos[0].body.systemInstruction as { parts: { text: string }[] }).parts[0].text;
    assert.ok(sistema.includes("# MODO GUION") && sistema.includes("# GUION DE REFERENCIA") && sistema.includes("REGLA DE ORO"));
    // el segundo turno pide solo pasos y lleva el ✗
    const contents = pedidos[1].body.contents as { role: string; parts: { text?: string }[] }[];
    const ultimo = contents[contents.length - 1].parts.map((p) => p.text ?? "").join("");
    assert.match(ultimo, /CORRECCIÓN DEL GUION/);
    assert.match(ultimo, /✗ 03 definir_entrada/);
    // la composición quedó dirigida por las dos rondas
    assert.equal(res.composicion.duracion, 4000);
    assert.equal(res.composicion.capas.find((c) => c.id === "titulo")?.entrada?.preset, "subirDesenfocado");
    assert.equal(res.composicion.capas.find((c) => c.id === "claim")?.entrada?.preset, "revelar");
    assert.equal(res.composicion.camara?.pistas.zoom?.length, 2);
    // la respuesta trae el guion y el conteo; los eventos, el guion en texto y el informe en ops
    assert.match(res.respuesta, /^LECTURA\. Un título y un claim\./);
    assert.match(res.respuesta, /Ejecuté 4 pasos del guion/);
    assert.equal(eventos.length, 2);
    assert.match(eventos[0].texto ?? "", /LECTURA\. Un título/);
    assert.ok(eventos[0].ops.some((o) => o.startsWith("✗ 03")));
    assert.ok(eventos[1].ops.every((o) => o.startsWith("✓")));
    assert.equal(res.uso?.pensamiento, 1000, "el pensamiento de las dos llamadas se suma");
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = envOriginal;
  }
});

test("una pieza YA dirigida no pasa por el guionista: sigue el loop de herramientas", async () => {
  const fetchOriginal = globalThis.fetch;
  const envOriginal = { ...process.env };
  process.env.GEMINI_API_KEY = "clave-de-prueba";
  delete process.env.MOTION_AGENTE_MODELO;
  // el loop iterativo: una respuesta final sin functionCall
  const { pedidos, fetchFalso } = geminiFalso(["Listo, retoqué."]);
  globalThis.fetch = fetchFalso;
  try {
    const { dirigirComposicion } = await import("@/lib/motion/agente");
    const dirigida = ejecutarHerramienta(piezaSinDirigir(), "definir_entrada", { capaId: "titulo", preset: "subir" }).comp;
    const res = await dirigirComposicion(dirigida, "más lento", []);
    assert.ok(res.ok);
    assert.equal(pedidos.length, 1);
    assert.ok(Array.isArray(pedidos[0].body.tools), "el loop iterativo SÍ manda herramientas");
  } finally {
    globalThis.fetch = fetchOriginal;
    process.env = envOriginal;
  }
});
