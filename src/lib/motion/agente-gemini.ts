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
import { sumarUso, type UsoTokens } from "@/lib/motion/costo-agente-puro";
import type { ImagenRevision } from "@/lib/motion/revision-puro";

type ParteGemini =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
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

/** El primer turno de usuario como partes: los frames de la revisión
    visual (inlineData) ANTES del texto — el orden que Gemini recomienda
    para que el texto refiera a las imágenes. Pura: testeable. */
export function partesDeUsuario(texto: string, imagenes?: ImagenRevision[]): ParteGemini[] {
  return [
    ...(imagenes ?? []).map<ParteGemini>((im) => ({ inlineData: { mimeType: im.mime, data: im.datosBase64 } })),
    { text: texto },
  ];
}

/** El PENSAMIENTO de Gemini a fondo: presupuesto DINÁMICO (-1) — el modelo
    razona lo que el paso pida en vez del default conservador de Flash. Sólo
    para las familias que lo soportan (2.5+, 3.x); para el resto no se manda
    nada. Pura: testeable. */
export function configGeneracion(modelo: string): { thinkingConfig: { thinkingBudget: number } } | undefined {
  return /^gemini-(2\.5|[3-9])/.test(modelo) ? { thinkingConfig: { thinkingBudget: -1 } } : undefined;
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
  /** frames de la revisión visual (van como inlineData antes del texto) */
  imagenes?: ImagenRevision[];
  herramientas: DefHerramienta[];
  maxIteraciones: number;
  ejecutar: (nombre: string, input: Record<string, unknown>) => { resultado: string; esError?: boolean; resumen?: string };
  onEvento?: (evento: EventoAgente) => void;
}): Promise<{ ok: true; respuesta: string; uso: UsoTokens } | { ok: false; error: string }> {
  let usoTotal: UsoTokens = { entrada: 0, salida: 0 };
  let modeloVivo = opts.modelo;
  let reintentoModelo = false;
  // pensamiento dinámico prendido; si el modelo lo rechaza (400 que nombra
  // thinking) se apaga y se reintenta UNA vez — degradar, no romper
  let conPensamiento = true;
  const tools = herramientasParaGemini(opts.herramientas);

  const contents: ContenidoGemini[] = [
    ...opts.historial.slice(-12).map<ContenidoGemini>((turno) => ({
      role: turno.rol === "usuario" ? "user" : "model",
      parts: [{ text: turno.texto }],
    })),
    { role: "user", parts: partesDeUsuario(opts.primerUsuario, opts.imagenes) },
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
        ...(conPensamiento && configGeneracion(modeloVivo)
          ? { generationConfig: configGeneracion(modeloVivo) }
          : {}),
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
      // el modelo no acepta thinkingConfig: se apaga y se sigue sin él
      if (res.status === 400 && conPensamiento && /thinking/i.test(detalle)) {
        conPensamiento = false;
        iteracion--;
        continue;
      }
      return { ok: false, error: `Gemini respondió ${res.status}: ${detalle.slice(0, 300)}` };
    }
    const datos = (await res.json()) as {
      candidates?: { content?: { parts?: ParteGemini[] }; finishReason?: string }[];
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        thoughtsTokenCount?: number;
        cachedContentTokenCount?: number;
      };
    };
    const msModelo = Date.now() - t0;
    const um = datos.usageMetadata;
    const cacheLeido = um?.cachedContentTokenCount ?? 0;
    const usoPaso: UsoTokens = {
      // promptTokenCount INCLUYE lo cacheado: se separa para cobrarlo bien
      entrada: Math.max(0, (um?.promptTokenCount ?? 0) - cacheLeido),
      salida: (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0),
      cacheLectura: cacheLeido,
      // el razonamiento aparte (ya está DENTRO de salida): el log muestra
      // cuánto pensó cada paso — «¿se bajó el thinking?» se responde mirando
      pensamiento: um?.thoughtsTokenCount ?? 0,
    };
    usoTotal = sumarUso(usoTotal, usoPaso);
    const partes = datos.candidates?.[0]?.content?.parts ?? [];
    const llamadas = partes.filter(
      (p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p,
    );

    if (llamadas.length === 0) {
      opts.onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: [], uso: usoPaso });
      const texto = partes
        .filter((p): p is { text: string } => "text" in p)
        .map((p) => p.text)
        .join("\n")
        .trim();
      return { ok: true, respuesta: texto || "Listo.", uso: usoTotal };
    }

    contents.push({ role: "model", parts: partes });
    const respuestas: ParteGemini[] = [];
    const opsIteracion: string[] = [];
    for (const llamada of llamadas) {
      const res2 = opts.ejecutar(llamada.functionCall.name, llamada.functionCall.args ?? {});
      // el error VIAJA al log: «definir_entrada → ERROR» a secas no le
      // decía a nadie qué pasó (ni al usuario ni al log que nos copia)
      opsIteracion.push(
        res2.esError
          ? `${llamada.functionCall.name} → ERROR: ${res2.resultado.replace(/^ERROR: /, "").split("\n")[0].slice(0, 110)}`
          : (res2.resumen ?? llamada.functionCall.name),
      );
      respuestas.push({
        functionResponse: {
          name: llamada.functionCall.name,
          response: res2.esError ? { error: res2.resultado } : { resultado: res2.resultado },
        },
      });
    }
    contents.push({ role: "user", parts: respuestas });
    opts.onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: opsIteracion, uso: usoPaso });
  }

  return { ok: true, respuesta: "Corté acá para no seguir en bucle — revisá lo aplicado y pedime el siguiente paso.", uso: usoTotal };
}
