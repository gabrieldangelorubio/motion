/* -----------------------------------------------------------------------------
   Proveedor GEMINI del director (servidor)

   El director no está «entrenado»: su oficio vive en el system prompt (la
   escuela GSAP + catálogo + reglas duras) y en las herramientas validadas —
   y eso viaja tal cual a cualquier modelo con function calling. Este módulo
   habla la REST de Gemini (generateContent, sin SDK nuevo): mismo loop
   agéntico, mismas herramientas, mismos eventos de progreso. Se elige por
   modelo: MOTION_AGENTE_MODELO=gemini-* (o GEMINI_API_KEY presente).
----------------------------------------------------------------------------- */

import type { EventoAgente } from "@/lib/motion/agente";

type ParteGemini =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

type ContenidoGemini = { role: "user" | "model"; parts: ParteGemini[] };

export type DefHerramienta = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** Anthropic tools → functionDeclarations de Gemini: mismo JSON Schema,
    el campo se llama `parameters` y las claves fuera del subset OpenAPI
    (additionalProperties, $schema) se podan. Pura: testeable. */
export function herramientasParaGemini(defs: DefHerramienta[]): { functionDeclarations: { name: string; description: string; parameters: Record<string, unknown> }[] }[] {
  const limpiar = (schema: unknown): unknown => {
    if (Array.isArray(schema)) return schema.map(limpiar);
    if (schema === null || typeof schema !== "object") return schema;
    const limpio: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(schema)) {
      if (clave === "additionalProperties" || clave === "$schema") continue;
      limpio[clave] = limpiar(valor);
    }
    return limpio;
  };
  return [{
    functionDeclarations: defs.map((d) => ({
      name: d.name,
      description: d.description,
      parameters: limpiar(d.input_schema) as Record<string, unknown>,
    })),
  }];
}

/** Cuando Gemini retira un modelo devuelve 404 con el reemplazo adentro
    («Please update your code to use models/gemini-X»): se extrae para
    reintentar solo — el director no se cae por un rename de Google. */
export function modeloSugerido(mensaje404: string, modeloActual: string): string | null {
  const m = /use models\/([a-zA-Z0-9._-]+)/.exec(mensaje404);
  if (!m || m[1] === modeloActual) return null;
  return m[1];
}

/** El loop agéntico contra Gemini. `ejecutar` cierra sobre la composición
    del caller (agente.ts): acá solo se orquesta la conversación. */
export async function loopGemini(opts: {
  apiKey: string;
  modelo: string;
  sistema: string;
  /** historial previo del chat, plano */
  historial: { rol: "usuario" | "agente"; texto: string }[];
  /** el primer turno de usuario: estado + locución + pedido */
  primerUsuario: string;
  herramientas: DefHerramienta[];
  maxIteraciones: number;
  ejecutar: (nombre: string, input: Record<string, unknown>) => { resultado: string; esError?: boolean };
  onEvento?: (evento: EventoAgente) => void;
}): Promise<{ ok: true; respuesta: string } | { ok: false; error: string }> {
  let modeloVivo = opts.modelo;
  let reintentoModelo = false;
  const tools = herramientasParaGemini(opts.herramientas);

  const contents: ContenidoGemini[] = [
    ...opts.historial.slice(-12).map<ContenidoGemini>((turno) => ({
      role: turno.rol === "usuario" ? "user" : "model",
      parts: [{ text: turno.texto }],
    })),
    { role: "user", parts: [{ text: opts.primerUsuario }] },
  ];

  for (let iteracion = 0; iteracion < opts.maxIteraciones; iteracion++) {
    const t0 = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modeloVivo)}:generateContent`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.sistema }] },
        contents,
        tools,
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      // modelo retirado: Google manda el reemplazo en el 404 — UN reintento
      const sugerido = res.status === 404 && !reintentoModelo ? modeloSugerido(detalle, modeloVivo) : null;
      if (sugerido) {
        reintentoModelo = true;
        modeloVivo = sugerido;
        iteracion--;
        continue;
      }
      return { ok: false, error: `Gemini respondió ${res.status}: ${detalle.slice(0, 300)}` };
    }
    const datos = (await res.json()) as {
      candidates?: { content?: { parts?: ParteGemini[] }; finishReason?: string }[];
    };
    const msModelo = Date.now() - t0;
    const partes = datos.candidates?.[0]?.content?.parts ?? [];
    const llamadas = partes.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p,
    );

    if (llamadas.length === 0) {
      opts.onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: [] });
      const texto = partes
        .filter((p): p is { text: string } => "text" in p)
        .map((p) => p.text)
        .join("\n")
        .trim();
      return { ok: true, respuesta: texto || "Listo." };
    }

    contents.push({ role: "model", parts: partes });
    const respuestas: ParteGemini[] = [];
    const opsIteracion: string[] = [];
    for (const llamada of llamadas) {
      const res2 = opts.ejecutar(llamada.functionCall.name, llamada.functionCall.args ?? {});
      opsIteracion.push(res2.esError ? `${llamada.functionCall.name} → ERROR` : llamada.functionCall.name);
      respuestas.push({
        functionResponse: {
          name: llamada.functionCall.name,
          response: res2.esError ? { error: res2.resultado } : { resultado: res2.resultado },
        },
      });
    }
    contents.push({ role: "user", parts: respuestas });
    opts.onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: opsIteracion });
  }

  return { ok: true, respuesta: "Corté acá para no seguir en bucle — revisá lo aplicado y pedime el siguiente paso." };
}
