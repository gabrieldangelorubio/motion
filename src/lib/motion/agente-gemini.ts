/* -----------------------------------------------------------------------------
   Proveedor GEMINI del director (servidor)

   El director no está «entrenado»: su oficio vive en el system prompt (la
   escuela GSAP + catálogo + reglas duras) y en las herramientas validadas —
   y eso viaja tal cual a cualquier modelo con function calling. Este módulo
   habla la REST de Gemini (generateContent, sin SDK nuevo): mismo loop
   agéntico, mismas herramientas, mismos eventos de progreso. Se elige por
   modelo: MOTION_AGENTE_MODELO=gemini-* (o GEMINI_API_KEY presente).
----------------------------------------------------------------------------- */

import type { EventoAgente, TurnoAgente } from "@/lib/motion/agente";
import { sumarUso, type UsoTokens } from "@/lib/motion/costo-agente-puro";
import type { ImagenRevision } from "@/lib/motion/revision-puro";

type ParteGemini =
  | { text: string }
  // videoMetadata: muestreo denso del VIDEO (fps) — solo junto a inlineData
  | { inlineData: { mimeType: string; data: string }; videoMetadata?: { fps: number } }
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

/** Cuánto pensar: «alto» es el máximo de la familia 3.x (thinkingLevel
    high — con el presupuesto dinámico Flash decidía pensar 30-40 tokens en
    los pasos de ejecución, visto en el log), «dinamico» es el presupuesto -1
    de la 2.5 (y el fallback si un 3.x rechaza thinkingLevel), «apagado» no
    manda nada. La escalera baja un peldaño por cada 400 que nombre thinking:
    degradar, no romper. */
/** Cuánto piensa Gemini: «alto/medio/bajo» los elige el slider del panel
    (Gabriel, 2026-09-03: «deberíamos tener un slider para cambiar de
    thinking»); «apagado» es el último peldaño de la escalera de
    degradación, no una opción del usuario. */
export type NivelPensamiento = "alto" | "medio" | "bajo" | "apagado";

/** La escalera ante un 400 que nombra thinking: alto → medio (3.x) → apagado.
    La 2.5 no distingue alto de medio (los dos son presupuesto -1): repetir el
    mismo request sería gastar un intento — directo a apagado. */
export function bajarPensamiento(nivel: NivelPensamiento, modelo: string): NivelPensamiento {
  return nivel === "alto" && /^gemini-[3-9]/.test(modelo) ? "medio" : "apagado";
}

/** El PENSAMIENTO de Gemini a fondo. Sólo para las familias que lo soportan
    (2.5+, 3.x); para el resto no se manda nada. Pura: testeable. */
export function configGeneracion(
  modelo: string,
  nivel: NivelPensamiento = "alto",
): { thinkingConfig: { thinkingLevel: "high" | "medium" | "low" } | { thinkingBudget: number } } | undefined {
  if (nivel === "apagado") return undefined;
  if (/^gemini-[3-9]/.test(modelo)) {
    if (nivel === "alto") return { thinkingConfig: { thinkingLevel: "high" } };
    if (nivel === "bajo") return { thinkingConfig: { thinkingLevel: "low" } };
    // medio: 3.8+ piensa por niveles (low/medium/high, sin minimal) y el
    // peldaño intermedio es «medium»; hasta la 3.7 es el presupuesto
    // dinámico (verificado con la 3.6).
    return /^gemini-3\.[89]|^gemini-[4-9]/.test(modelo)
      ? { thinkingConfig: { thinkingLevel: "medium" } }
      : { thinkingConfig: { thinkingBudget: -1 } };
  }
  // la 2.5 no conoce niveles: presupuesto dinámico, o corto para «bajo»
  if (/^gemini-2\.5/.test(modelo)) return { thinkingConfig: { thinkingBudget: nivel === "bajo" ? 1024 : -1 } };
  return undefined;
}

/** Cuando Gemini retira un modelo devuelve 404 con el reemplazo adentro
    («Please update your code to use models/gemini-X»): se extrae para
    reintentar solo — el director no se cae por un rename de Google. */
export function modeloSugerido(mensaje404: string, modeloActual: string): string | null {
  const m = /use models\/([a-zA-Z0-9._-]+)/.exec(mensaje404);
  if (!m || m[1] === modeloActual) return null;
  return m[1];
}

/** Las partes del pedido de ANÁLISIS de un video de referencia: el video
    inline + el prompt del analista. Con `fps` se pide muestreo DENSO
    (Gemini por defecto muestrea 1 frame/s: en un clip corto de motion el
    movimiento vive entre esos frames). Pura: testeable. */
export function partesDeVideo(
  mime: string,
  datosBase64: string,
  prompt: string,
  fps?: number,
): ParteGemini[] {
  return [
    {
      inlineData: { mimeType: mime, data: datosBase64 },
      ...(fps ? { videoMetadata: { fps } } : {}),
    },
    { text: prompt },
  ];
}

/** UN pedido a Gemini con el VIDEO entero adentro: el analista de
    movimiento (barato) lo ve frame a frame y devuelve el análisis que el
    director usa como lectura principal. Muestreo denso (fps 10) con
    degradación: si el modelo rechaza videoMetadata se reintenta sin él
    (muestreo default 1fps), y un modelo retirado reintenta con el que el
    404 sugiere — degradar, no romper. */
export async function analizarVideoGemini(opts: {
  apiKey: string;
  modelo: string;
  mime: string;
  datosBase64: string;
  prompt: string;
}): Promise<{ ok: true; texto: string; uso: UsoTokens; modelo: string } | { ok: false; error: string }> {
  let modeloVivo = opts.modelo;
  let reintentoModelo = false;
  let conFps = true;
  let pensamiento: NivelPensamiento = "alto";
  let ultimoDetalle = "";
  // 5 intentos: alcanza para 404-modelo + 400-fps + 2×400-thinking + éxito
  for (let intento = 0; intento < 5; intento++) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modeloVivo)}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: partesDeVideo(opts.mime, opts.datosBase64, opts.prompt, conFps ? 10 : undefined) }],
          ...(configGeneracion(modeloVivo, pensamiento)
            ? { generationConfig: configGeneracion(modeloVivo, pensamiento) }
            : {}),
        }),
        // el analista corre DENTRO del presupuesto del turno (maxDuration):
        // acotado para que un cuelgue no se coma el tiempo del director
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) {
        const detalle = await res.text().catch(() => "");
        ultimoDetalle = `${res.status}: ${detalle.slice(0, 200)}`;
        const sugerido = res.status === 404 && !reintentoModelo ? modeloSugerido(detalle, modeloVivo) : null;
        if (sugerido) {
          reintentoModelo = true;
          modeloVivo = sugerido;
          continue;
        }
        if (res.status === 400 && conFps && /video_?metadata|fps/i.test(detalle)) {
          conFps = false;
          continue;
        }
        // mismo retry que loopGemini: modelo que rechaza thinkingConfig
        if (res.status === 400 && pensamiento !== "apagado" && /thinking/i.test(detalle)) {
          pensamiento = bajarPensamiento(pensamiento, modeloVivo);
          continue;
        }
        return { ok: false, error: `El analista (${modeloVivo}) respondió ${ultimoDetalle}` };
      }
      const datos = (await res.json()) as {
        candidates?: { content?: { parts?: ParteGemini[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
      };
      const um = datos.usageMetadata;
      const uso: UsoTokens = {
        entrada: um?.promptTokenCount ?? 0,
        salida: (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0),
        pensamiento: um?.thoughtsTokenCount ?? 0,
      };
      const texto = (datos.candidates?.[0]?.content?.parts ?? [])
        .filter((p): p is { text: string } => "text" in p)
        .map((p) => p.text)
        .join("\n")
        .trim();
      if (!texto) return { ok: false, error: "El analista no devolvió texto" };
      return { ok: true, texto, uso, modelo: modeloVivo };
    } catch (e) {
      // red caída / timeout: el analista DEGRADA (frames-solos), jamás
      // rompe el turno del director
      return {
        ok: false,
        error: `El analista no pudo leer el video: ${e instanceof Error ? e.message : "error de red"}`,
      };
    }
  }
  return { ok: false, error: `El analista no pudo leer el video (reintentos agotados; último error ${ultimoDetalle || "desconocido"})` };
}

/** El loop agéntico contra Gemini. `ejecutar` cierra sobre la composición
    del caller (agente.ts): acá solo se orquesta la conversación. */
/** UNA llamada a Gemini sin herramientas (el GUIONISTA): devuelve el texto.
    Con `json` pide salida application/json. Misma escalera de pensamiento y
    mismo reintento por modelo retirado que el loop. */
export async function generarGemini(opts: {
  apiKey: string;
  modelo: string;
  sistema: string;
  historial: TurnoAgente[];
  primerUsuario: string;
  imagenes?: ImagenRevision[];
  json?: boolean;
  /** nivel de pensamiento elegido en el panel (default alto) */
  pensamiento?: NivelPensamiento;
}): Promise<{ ok: true; texto: string; uso: UsoTokens; modelo: string } | { ok: false; error: string }> {
  let modeloVivo = opts.modelo;
  let reintentoModelo = false;
  let pensamiento: NivelPensamiento = opts.pensamiento ?? "alto";
  const contents: ContenidoGemini[] = [
    ...opts.historial.slice(-12).map<ContenidoGemini>((turno) => ({
      role: turno.rol === "usuario" ? "user" : "model",
      parts: [{ text: turno.texto }],
    })),
    { role: "user", parts: partesDeUsuario(opts.primerUsuario, opts.imagenes) },
  ];
  for (let intento = 0; intento < 4; intento++) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modeloVivo)}:generateContent`;
    const generationConfig = {
      ...(configGeneracion(modeloVivo, pensamiento) ?? {}),
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: opts.sistema }] },
        contents,
        ...(Object.keys(generationConfig).length ? { generationConfig } : {}),
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      const sugerido = res.status === 404 && !reintentoModelo ? modeloSugerido(detalle, modeloVivo) : null;
      if (sugerido) {
        reintentoModelo = true;
        modeloVivo = sugerido;
        continue;
      }
      if (res.status === 400 && pensamiento !== "apagado" && /thinking/i.test(detalle)) {
        pensamiento = bajarPensamiento(pensamiento, modeloVivo);
        continue;
      }
      return { ok: false, error: `Gemini respondió ${res.status}: ${detalle.slice(0, 300)}` };
    }
    const datos = (await res.json()) as {
      candidates?: { content?: { parts?: ParteGemini[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number };
    };
    const um = datos.usageMetadata;
    const cacheLeido = um?.cachedContentTokenCount ?? 0;
    const uso: UsoTokens = {
      entrada: Math.max(0, (um?.promptTokenCount ?? 0) - cacheLeido),
      salida: (um?.candidatesTokenCount ?? 0) + (um?.thoughtsTokenCount ?? 0),
      cacheLectura: cacheLeido,
      pensamiento: um?.thoughtsTokenCount ?? 0,
    };
    const texto = (datos.candidates?.[0]?.content?.parts ?? [])
      .filter((p): p is { text: string } => "text" in p && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();
    return { ok: true, texto, uso, modelo: modeloVivo };
  }
  return { ok: false, error: "Gemini no respondió tras los reintentos" };
}

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
  /** nivel de pensamiento elegido en el panel (default alto) */
  pensamiento?: NivelPensamiento;
}): Promise<{ ok: true; respuesta: string; uso: UsoTokens } | { ok: false; error: string }> {
  let usoTotal: UsoTokens = { entrada: 0, salida: 0 };
  let modeloVivo = opts.modelo;
  let reintentoModelo = false;
  // el pensamiento del panel de entrada; cada 400 que nombre thinking baja
  // un peldaño (alto → medio → apagado) y reintenta — degradar, no romper
  let pensamiento: NivelPensamiento = opts.pensamiento ?? "alto";
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
        ...(configGeneracion(modeloVivo, pensamiento)
          ? { generationConfig: configGeneracion(modeloVivo, pensamiento) }
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
      // el modelo no acepta este thinkingConfig: un peldaño menos y de nuevo
      if (res.status === 400 && pensamiento !== "apagado" && /thinking/i.test(detalle)) {
        pensamiento = bajarPensamiento(pensamiento, modeloVivo);
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
    // el texto que vino JUNTO a las herramientas (el guion de lectura) va al
    // log: se ve qué leyó el director antes de animar
    const textoPaso = partes
      .filter((p): p is { text: string } => "text" in p && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
      .trim();
    opts.onEvento?.({ tipo: "paso", iteracion: iteracion + 1, msModelo, ops: opsIteracion, uso: usoPaso, texto: textoPaso || undefined });
  }

  return { ok: true, respuesta: "Corté acá para no seguir en bucle — revisá lo aplicado y pedime el siguiente paso.", uso: usoTotal };
}
