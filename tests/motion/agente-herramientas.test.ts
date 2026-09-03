import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarHerramienta, DEFINICIONES_HERRAMIENTAS } from "@/lib/motion/agente-herramientas";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import type { CapaTexto, Composicion } from "@/lib/motion/modelo";

const base = (): Composicion => crearComposicion({ nombre: "prueba" });

const conTitulo = (): Composicion => {
  const res = ejecutarHerramienta(base(), "agregar_capa_texto", {
    id: "titulo",
    texto: "HOLA",
    division: "caracteres",
    tamano: 120,
  });
  return res.comp;
};

test("agregar_capa_texto crea la capa con defaults sanos y estado en el resultado", () => {
  const res = ejecutarHerramienta(base(), "agregar_capa_texto", { texto: "HOLA" });
  assert.ok(!res.esError);
  assert.equal(res.comp.capas.length, 1);
  assert.match(res.resultado, /Estado actual/);
  assert.ok(res.resumen);
});

test("los números del modelo se CLAMPEAN (tamaño 99999 no rompe nada)", () => {
  const res = ejecutarHerramienta(base(), "agregar_capa_texto", { texto: "x", tamano: 99999, peso: 5000, x: -99999 });
  const capa = res.comp.capas[0] as CapaTexto;
  assert.equal(capa.fuente.tamano, 600);
  assert.equal(capa.fuente.peso, 900);
  assert.equal(capa.x, -1920);
});

test("definir_entrada valida el preset y clampea el timing a la composición", () => {
  const comp = conTitulo();
  const malo = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "inventado", en: 0, duracion: 500 });
  assert.ok(malo.esError);
  assert.match(malo.resultado, /no existe/);

  const bueno = ejecutarHerramienta(comp, "definir_entrada", {
    capaId: "titulo", preset: "subir", en: 999999, duracion: 800, easing: "salidaExpo", escalonado: 40, ordenEscalonado: "centro",
  });
  assert.ok(!bueno.esError);
  const capa = bueno.comp.capas[0];
  assert.equal(capa.entrada!.en, comp.duracion);
  assert.equal(capa.entrada!.escalonado, 40);
});

test("un capaId inexistente devuelve error legible CON los ids disponibles", () => {
  const res = ejecutarHerramienta(conTitulo(), "editar_capa", { capaId: "fantasma", x: 0 });
  assert.ok(res.esError);
  assert.match(res.resultado, /titulo/);
  assert.equal(res.comp.capas[0].x, 960, "la composición no cambió");
});

test("definir_pista ordena keyframes desordenados y clampea t a la duración", () => {
  const res = ejecutarHerramienta(conTitulo(), "definir_pista", {
    capaId: "titulo",
    propiedad: "x",
    keyframes: [{ t: 99999, v: 1500 }, { t: 0, v: 400, easing: "entradaSalidaCubic" }],
  });
  assert.ok(!res.esError);
  const pista = res.comp.capas[0].pistas!.x!;
  assert.equal(pista[0].t, 0);
  assert.equal(pista[1].t, 5000);
});

test("una op que deja invariantes rotos devuelve AVISOS (verificación semántica)", () => {
  const comp = conTitulo();
  // duración achicada por debajo de una entrada existente → aviso de validar()
  const con = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 4000, duracion: 900 });
  const achicada = ejecutarHerramienta(con.comp, "ajustar_composicion", { duracion: 1000 });
  assert.match(achicada.resultado, /AVISOS/);
});

test("reordenar_capas exige la lista completa y aplica el z-order", () => {
  let comp = conTitulo();
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "placa", forma: "rectangulo" }).comp;
  const invalido = ejecutarHerramienta(comp, "reordenar_capas", { orden: ["placa"] });
  assert.ok(invalido.esError);
  const valido = ejecutarHerramienta(comp, "reordenar_capas", { orden: ["placa", "titulo"] });
  assert.deepEqual(valido.comp.capas.map((c) => c.id), ["placa", "titulo"]);
});

test("quitar_segmento y quitar_capa funcionan y el resto queda intacto", () => {
  let comp = conTitulo();
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 0, duracion: 500 }).comp;
  const sinEntrada = ejecutarHerramienta(comp, "quitar_segmento", { capaId: "titulo", cual: "entrada" });
  assert.equal(sinEntrada.comp.capas[0].entrada, undefined);
  const sinCapa = ejecutarHerramienta(comp, "quitar_capa", { capaId: "titulo" });
  assert.equal(sinCapa.comp.capas.length, 0);
  assert.ok(sinCapa.comp.borrados!.some((b) => b.id === "titulo"), "queda la lápida");
});

test("una herramienta desconocida falla legible, nunca lanza", () => {
  const res = ejecutarHerramienta(base(), "hacer_magia", {});
  assert.ok(res.esError);
});

test("toda definición de herramienta tiene ejecutor (los nombres están sincronizados)", () => {
  const comp = conTitulo();
  for (const def of DEFINICIONES_HERRAMIENTAS) {
    const res = ejecutarHerramienta(comp, def.name, {});
    assert.ok(
      !res.resultado.includes("herramienta desconocida"),
      `«${def.name}» está definida para el modelo pero no tiene ejecutor`,
    );
  }
});

test("dividir sin escalonado no queda en bloque: definir_entrada defaultea el sano por división", () => {
  // capa dividida por caracteres, el agente no pasa escalonado → default 35
  const comp = conTitulo();
  const res = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 0, duracion: 500 });
  assert.equal((res.comp.capas[0] as CapaTexto).entrada?.escalonado, 35);

  // palabras → 90; y un 0 EXPLÍCITO del agente manda sobre el default
  const porPalabras = ejecutarHerramienta(comp, "editar_capa", { capaId: "titulo", division: "palabras" }).comp;
  const conDefault = ejecutarHerramienta(porPalabras, "definir_entrada", { capaId: "titulo", preset: "subir", en: 0, duracion: 500 });
  assert.equal((conDefault.comp.capas[0] as CapaTexto).entrada?.escalonado, 90);
  const conCero = ejecutarHerramienta(porPalabras, "definir_entrada", { capaId: "titulo", preset: "subir", en: 0, duracion: 500, escalonado: 0 });
  assert.equal((conCero.comp.capas[0] as CapaTexto).entrada?.escalonado, 0);
});

test("editar_capa: activar una división propaga el escalonado sano a segmentos que no tenían", () => {
  let comp = conTitulo();
  comp = ejecutarHerramienta(comp, "editar_capa", { capaId: "titulo", division: "ninguna" }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 0, duracion: 500 }).comp;
  assert.equal((comp.capas[0] as CapaTexto).entrada?.escalonado, undefined, "sin división no hay default");
  const dividida = ejecutarHerramienta(comp, "editar_capa", { capaId: "titulo", division: "palabras" }).comp;
  assert.equal((dividida.capas[0] as CapaTexto).entrada?.escalonado, 90);
  // uno puesto a mano NO se pisa
  const conPropio = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 0, duracion: 500, escalonado: 120 }).comp;
  const redividida = ejecutarHerramienta(conPropio, "editar_capa", { capaId: "titulo", division: "lineas" }).comp;
  assert.equal((redividida.capas[0] as CapaTexto).entrada?.escalonado, 120);
});

test("escalonadoSano: un valor por división, 0 para «ninguna»", async () => {
  const { escalonadoSano } = await import("@/lib/motion/presets-puro");
  assert.equal(escalonadoSano("caracteres"), 35);
  assert.equal(escalonadoSano("palabras"), 90);
  assert.equal(escalonadoSano("lineas"), 140);
  assert.equal(escalonadoSano("ninguna"), 0);
});

/* ——— La escuela GSAP del agente ————————————————————————————— */

test("la escuela del agente solo nombra easings QUE EXISTEN en el motor (no le enseña fantasmas)", async () => {
  const { ESCUELA_GSAP } = await import("@/lib/motion/escuela-gsap");
  const { EASINGS } = await import("@/lib/motion/easings-puro");
  const nombres = ESCUELA_GSAP.match(/\b(?:entradaSalida|salida|entrada)[A-Z][a-zA-Z]+\b|\bescalones\b|\bresorte(?:Suave|Tenso|Rebote)\b/g) ?? [];
  assert.ok(nombres.length > 20, `la escuela nombra easings concretos (encontró ${nombres.length})`);
  for (const nombre of new Set(nombres)) {
    // «entradaSalida» pelado es el comodín de la FAMILIA (entradaSalida*), no un nombre
    if (nombre === "entradaSalida") continue;
    assert.ok(nombre in EASINGS, `«${nombre}» está en la escuela pero no en el motor`);
  }
  // y cubre las piezas nuevas del catálogo GSAP
  for (const clave of ["salidaElastico", "salidaPique", "escalones", "azar", "entradaSalidaBack"]) {
    assert.ok(ESCUELA_GSAP.includes(clave), `la escuela enseña ${clave}`);
  }
});

/* ——— transformar_texto: el swap de agencia con el estilo CLONADO ———— */

test("transformar_texto clona el estilo entero, arma salida+entrada y ubica el clon encima", () => {
  let comp = base();
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", {
    id: "cta", texto: "BUY NOW", tamano: 90, peso: 800, color: "#ffffff",
  }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "fondo-x" }).comp;
  const res = ejecutarHerramienta(comp, "transformar_texto", { capaId: "cta", texto: "SOLD OUT", en: 2000 });
  assert.ok(!res.esError, res.resultado);
  const original = res.comp.capas.find((c) => c.id === "cta") as CapaTexto;
  const clon = res.comp.capas.find((c) => c.id === "cta-swap") as CapaTexto;
  assert.ok(clon, "el clon existe");
  // MISMO estilo: tipografía, peso, color, posición — el tamaño baja
  // proporcional porque «SOLD OUT» (7 visibles) es más largo que «BUY NOW» (6)
  assert.equal(clon.fuente.familia, original.fuente.familia);
  assert.equal(clon.fuente.peso, original.fuente.peso);
  assert.ok(Math.abs(clon.fuente.tamano - original.fuente.tamano * (6 / 7)) < 0.5);
  assert.equal(clon.color, original.color);
  assert.equal(clon.x, original.x);
  assert.equal(clon.texto, "SOLD OUT");
  // el cruce: salida de la original y entrada del clon EN el mismo ms
  assert.equal(original.salida?.en, 2000);
  assert.equal(clon.entrada?.en, 2000);
  assert.equal(clon.salida, undefined);
  // el clon queda JUSTO encima de la original en el z-order
  const idx = res.comp.capas.findIndex((c) => c.id === "cta");
  assert.equal(res.comp.capas[idx + 1].id, "cta-swap");
});

test("transformar_texto rechaza capas que no son texto y textos vacíos", () => {
  let comp = base();
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "caja" }).comp;
  assert.ok(ejecutarHerramienta(comp, "transformar_texto", { capaId: "caja", texto: "X", en: 0 }).esError);
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "tx", texto: "HOLA" }).comp;
  assert.ok(ejecutarHerramienta(comp, "transformar_texto", { capaId: "tx", texto: "  ", en: 0 }).esError);
});

test("definir_pista «numero» solo va en textos con una cifra", () => {
  let comp = base();
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "stock", texto: "STOCK:171" }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "puro", texto: "HOLA" }).comp;
  const ok = ejecutarHerramienta(comp, "definir_pista", {
    capaId: "stock", propiedad: "numero",
    keyframes: [{ t: 0, v: 171 }, { t: 1500, v: 0, easing: "salidaExpo" }],
  });
  assert.ok(!ok.esError, ok.resultado);
  const mal = ejecutarHerramienta(comp, "definir_pista", {
    capaId: "puro", propiedad: "numero", keyframes: [{ t: 0, v: 1 }],
  });
  assert.ok(mal.esError);
});

/* ——— el director multi-proveedor (Claude / Gemini) ————————————— */

test("modeloDirector: MOTION_AGENTE_MODELO manda; sin él, la key de Gemini elige flash", async () => {
  const { modeloDirector } = await import("@/lib/motion/agente");
  assert.equal(modeloDirector({}), "claude-opus-5");
  assert.equal(modeloDirector({ GEMINI_API_KEY: "x" }), "gemini-3.8-flash");
  assert.equal(modeloDirector({ GEMINI_API_KEY: "x", MOTION_AGENTE_MODELO: "claude-sonnet-5" }), "claude-sonnet-5");
  assert.equal(modeloDirector({ MOTION_AGENTE_MODELO: "gemini-2.5-pro" }), "gemini-2.5-pro");
});

test("herramientasParaGemini convierte TODAS las herramientas al formato functionDeclarations", async () => {
  const { herramientasParaGemini } = await import("@/lib/motion/agente-gemini");
  const tools = herramientasParaGemini(DEFINICIONES_HERRAMIENTAS as never);
  assert.equal(tools.length, 1);
  const defs = tools[0].functionDeclarations;
  assert.equal(defs.length, (DEFINICIONES_HERRAMIENTAS as unknown as { name: string }[]).length);
  for (const d of defs) {
    assert.ok(d.name && d.description, `${d.name} sin descripción`);
    assert.ok(d.parameters && typeof d.parameters === "object", `${d.name} sin parameters`);
    // el subset OpenAPI: nada de additionalProperties en ningún nivel
    assert.ok(!JSON.stringify(d.parameters).includes("additionalProperties"));
  }
  // las herramientas clave del oficio viajan
  const nombres = defs.map((d) => d.name);
  for (const clave of ["transformar_texto", "definir_pista", "definir_camara", "definir_entrada"]) {
    assert.ok(nombres.includes(clave), `falta ${clave}`);
  }
});

test("un modelo de Gemini retirado se reemplaza por el que sugiere el 404 (y el default está al día)", async () => {
  const { modeloSugerido } = await import("@/lib/motion/agente-gemini");
  const { modeloDirector } = await import("@/lib/motion/agente");
  const cuerpo404 = '{ "error": { "code": 404, "message": "This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.6-flash for the latest features." } }';
  assert.equal(modeloSugerido(cuerpo404, "gemini-2.5-flash"), "gemini-3.6-flash");
  // sin sugerencia (o la misma) no hay reintento
  assert.equal(modeloSugerido("not found", "gemini-x"), null);
  assert.equal(modeloSugerido("use models/gemini-x", "gemini-x"), null);
  assert.equal(modeloDirector({ GEMINI_API_KEY: "k" }), "gemini-3.8-flash");
});

test("transformar_texto achica el tamaño si el texto nuevo es más largo y conserva el ALL-CAPS", () => {
  let comp = base();
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", {
    id: "cta2", texto: "BUY NOW", tamano: 90,
  }).comp;
  const res = ejecutarHerramienta(comp, "transformar_texto", { capaId: "cta2", texto: "sold out forever", en: 1000 });
  const clon = res.comp.capas.find((c) => c.id === "cta2-swap") as CapaTexto;
  // el original es ALL-CAPS → el nuevo también
  assert.equal(clon.texto, "SOLD OUT FOREVER");
  // 6 chars visibles → 14: el tamaño baja proporcional (nunca agranda)
  assert.ok(clon.fuente.tamano < 90 && Math.abs(clon.fuente.tamano - 90 * (6 / 14)) < 0.5, `dio ${clon.fuente.tamano}`);
  // un texto MÁS CORTO no agranda
  const res2 = ejecutarHerramienta(res.comp, "transformar_texto", { capaId: "cta2", texto: "OK", en: 2000 });
  const clon2 = res2.comp.capas.find((c) => c.id === "cta2-swap2") as CapaTexto;
  assert.equal(clon2.fuente.tamano, 90);
});

/* ——— presets de trazos: sólo capas de trazo (visto en producción:
   «trazar» sobre vectores con relleno devolvía OK sin efecto visible
   y el director creía haber animado) ————————————————————— */

test("definir_entrada rechaza un preset de trazos en una capa que no es trazo, con guía", () => {
  let comp = base();
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "titulo2", texto: "HOLA" }).comp;
  const res = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo2", preset: "trazar", en: 0, duracion: 600 });
  assert.ok(res.esError);
  assert.match(res.resultado, /TRAZOS/);
  assert.match(res.resultado, /revelar/); // le dice QUÉ usar en su lugar
  // la composición no cambió
  assert.equal(res.comp.capas.find((c) => c.id === "titulo2")?.entrada, undefined);
});

test("definir_entrada acepta trazar en una capa de TRAZO de verdad", () => {
  const comp = base();
  comp.capas.push({
    id: "linea", nombre: "Línea", tipo: "trazo", x: 100, y: 100,
    path: "M0 0L200 0", ancho: 200, alto: 0, color: "#fff", grosor: 3, largo: 200,
  });
  const res = ejecutarHerramienta(comp, "definir_entrada", { capaId: "linea", preset: "trazar", en: 0, duracion: 600 });
  assert.ok(!res.esError, res.resultado);
  assert.equal(res.comp.capas[0].entrada?.preset, "trazar");
});

test("el schema de definir_pista incluye «numero» (el contador viaja por schema estricto)", () => {
  const def = (DEFINICIONES_HERRAMIENTAS as unknown as { name: string; input_schema: { properties: { propiedad: { enum: string[] } } } }[])
    .find((d) => d.name === "definir_pista")!;
  assert.ok(def.input_schema.properties.propiedad.enum.includes("numero"));
});

test("partesDeUsuario arma imágenes ANTES del texto para el turno multimodal de Gemini", async () => {
  const { partesDeUsuario } = await import("@/lib/motion/agente-gemini");
  const partes = partesDeUsuario("mirá esto", [
    { mime: "image/jpeg", datosBase64: "AAAA" },
    { mime: "image/jpeg", datosBase64: "BBBB" },
  ]);
  assert.equal(partes.length, 3);
  assert.deepEqual(partes[0], { inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
  assert.deepEqual(partes[2], { text: "mirá esto" });
  // sin imágenes: sólo el texto
  assert.deepEqual(partesDeUsuario("hola"), [{ text: "hola" }]);
});

test("configGeneracion: thinkingLevel high para los 3.x, presupuesto dinámico para 2.5, nada para el resto", async () => {
  const { configGeneracion } = await import("@/lib/motion/agente-gemini");
  assert.deepEqual(configGeneracion("gemini-3.6-flash"), { thinkingConfig: { thinkingLevel: "high" } });
  assert.deepEqual(configGeneracion("gemini-4.0-pro"), { thinkingConfig: { thinkingLevel: "high" } });
  // la 2.5 no conoce thinkingLevel: presupuesto dinámico
  assert.deepEqual(configGeneracion("gemini-2.5-flash"), { thinkingConfig: { thinkingBudget: -1 } });
  assert.equal(configGeneracion("gemini-2.0-flash"), undefined);
  assert.equal(configGeneracion("gemini-1.5-pro"), undefined);
});

test("la escalera de pensamiento baja alto → medio → apagado y cada peldaño cambia el request", async () => {
  const { configGeneracion, bajarPensamiento } = await import("@/lib/motion/agente-gemini");
  assert.equal(bajarPensamiento("alto", "gemini-3.6-flash"), "medio");
  assert.equal(bajarPensamiento("medio", "gemini-3.6-flash"), "apagado");
  assert.equal(bajarPensamiento("bajo", "gemini-3.6-flash"), "apagado");
  assert.equal(bajarPensamiento("apagado", "gemini-3.6-flash"), "apagado");
  // la 2.5 no tiene peldaño intermedio distinto: alto → apagado sin repetir el request
  assert.equal(bajarPensamiento("alto", "gemini-2.5-flash"), "apagado");
  assert.deepEqual(configGeneracion("gemini-3.6-flash", "medio"), { thinkingConfig: { thinkingBudget: -1 } });
  // 3.8 piensa por niveles (el slider del panel): low / medium / high
  assert.deepEqual(configGeneracion("gemini-3.8-flash", "medio"), { thinkingConfig: { thinkingLevel: "medium" } });
  assert.deepEqual(configGeneracion("gemini-3.8-flash", "bajo"), { thinkingConfig: { thinkingLevel: "low" } });
  assert.deepEqual(configGeneracion("gemini-3.8-flash"), { thinkingConfig: { thinkingLevel: "high" } });
  assert.deepEqual(configGeneracion("gemini-2.5-flash", "bajo"), { thinkingConfig: { thinkingBudget: 1024 } });
  assert.equal(bajarPensamiento("alto", "gemini-3.8-flash"), "medio");
  assert.equal(configGeneracion("gemini-3.6-flash", "apagado"), undefined);
  assert.equal(configGeneracion("gemini-2.5-flash", "apagado"), undefined);
});

test("modeloDirector con nivel «fino» sube a Opus (o al MODELO_FINO del entorno)", async () => {
  const { modeloDirector } = await import("@/lib/motion/agente");
  // fino manda por encima de todo, incluso del override rápido
  assert.equal(modeloDirector({ GEMINI_API_KEY: "x" }, "fino"), "claude-opus-5");
  assert.equal(modeloDirector({ GEMINI_API_KEY: "x", MOTION_AGENTE_MODELO: "gemini-3.6-flash" }, "fino"), "claude-opus-5");
  assert.equal(modeloDirector({ MOTION_AGENTE_MODELO_FINO: "claude-sonnet-5" }, "fino"), "claude-sonnet-5");
  // rápido (o sin nivel) sigue el camino de siempre
  assert.equal(modeloDirector({ GEMINI_API_KEY: "x" }, "rapido"), "gemini-3.8-flash");
  assert.equal(modeloDirector({ GEMINI_API_KEY: "x" }), "gemini-3.8-flash");
});

test("sumarUso acumula el pensamiento y sigue siendo informativo (ya está dentro de salida)", async () => {
  const { sumarUso, costoUSD } = await import("@/lib/motion/costo-agente-puro");
  const total = sumarUso(
    { entrada: 100, salida: 50, pensamiento: 30 },
    { entrada: 200, salida: 80, pensamiento: 60 },
  );
  assert.equal(total.pensamiento, 90);
  assert.equal(total.salida, 130);
  // el costo NO suma el pensamiento aparte: se factura como salida, donde ya vive
  const conP = costoUSD("gemini-3.6-flash", { entrada: 1000, salida: 500, pensamiento: 400 });
  const sinP = costoUSD("gemini-3.6-flash", { entrada: 1000, salida: 500 });
  assert.equal(conP, sinP);
});

test("ajustar_composicion maneja fpsAnimacion: setear, clampear y apagar con 0", () => {
  const comp = base();
  let res = ejecutarHerramienta(comp, "ajustar_composicion", { fpsAnimacion: 12 });
  assert.equal(res.comp.fpsAnimacion, 12);
  assert.match(res.resultado, /12fps/);
  res = ejecutarHerramienta(res.comp, "ajustar_composicion", { fpsAnimacion: 1 });
  assert.equal(res.comp.fpsAnimacion, 2); // clamp abajo
  res = ejecutarHerramienta(res.comp, "ajustar_composicion", { fpsAnimacion: 0 });
  assert.equal(res.comp.fpsAnimacion, undefined); // 0 apaga
});

test("rangoDeLetras encuentra la letra sin importar mayúsculas y salta los espacios", async () => {
  const { rangoDeLetras } = await import("@/lib/motion/agente-herramientas");
  assert.deepEqual(rangoDeLetras("SNOG", "o"), [2, 3]);
  assert.deepEqual(rangoDeLetras("BUY NOW", "NOW"), [3, 6]); // el espacio no cuenta
  assert.deepEqual(rangoDeLetras("SNOG", "NOG"), [1, 4]);
  assert.equal(rangoDeLetras("SNOG", "X"), null);
});

test("estirar_letras estira la O, reemplaza el estirado del mismo rango y quitar limpia", () => {
  let comp = base();
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "logo", texto: "SNOG" }).comp;
  let res = ejecutarHerramienta(comp, "estirar_letras", { capaId: "logo", letras: "O", escalaX: 2 });
  assert.ok(!res.esError, res.resultado);
  const capa = () => res.comp.capas.find((c) => c.id === "logo") as CapaTexto;
  assert.deepEqual(capa().deformaciones, [{ desde: 2, hasta: 3, escalaX: 2, escalaY: undefined }]);
  // el mismo rango se REEMPLAZA, no se apila
  res = ejecutarHerramienta(res.comp, "estirar_letras", { capaId: "logo", letras: "O", escalaX: 3 });
  assert.equal(capa().deformaciones!.length, 1);
  assert.equal(capa().deformaciones![0].escalaX, 3);
  // errores legibles
  assert.ok(ejecutarHerramienta(res.comp, "estirar_letras", { capaId: "logo", letras: "Z", escalaX: 2 }).esError);
  assert.ok(ejecutarHerramienta(res.comp, "estirar_letras", { capaId: "logo", letras: "O" }).esError);
  // quitar
  res = ejecutarHerramienta(res.comp, "estirar_letras", { capaId: "logo", quitar: true });
  assert.equal(capa().deformaciones, undefined);
});

test("definir_camara: el rango de x/y es el del LIENZO, no el del render (una landing de 3229 px se encuadra abajo)", async () => {
  const { crearComposicion } = await import("@/lib/motion/herramientas-puro");
  let comp = crearComposicion({ nombre: "landing" });
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "placa", forma: "rect", x: 720, y: 1614.5, ancho: 1440, alto: 900 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "placa" && c.tipo === "forma" ? { ...c, alto: 3229, grupo: "placa" } : c)) };
  const res = ejecutarHerramienta(comp, "definir_camara", {
    base: { x: 720, y: 2900, zoom: 1.45 },
    y: [{ t: 0, v: 300 }, { t: 2000, v: 2900, easing: "entradaSalidaCubic" }],
  });
  assert.ok(!res.esError, res.resultado);
  assert.equal(res.comp.camara?.base?.y, 2900);
  assert.equal(res.comp.camara?.pistas.y?.[1].v, 2900);
  // sin lienzo grande, sigue acotado alrededor del render (no se va al infinito)
  const chica = ejecutarHerramienta(crearComposicion({ nombre: "c" }), "definir_camara", { base: { y: 99999 } });
  assert.equal(chica.comp.camara?.base?.y, 1080 * 2);
});

test("rangoDelLienzo cuenta el ancho estimado de un texto (un título ancho al borde no queda fuera)", async () => {
  const { rangoDelLienzo } = await import("@/lib/motion/agente-herramientas");
  const { crearComposicion } = await import("@/lib/motion/herramientas-puro");
  let comp = crearComposicion({ nombre: "t" });
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "t", texto: "UN TITULO MUY LARGO", x: 1900, y: 540, tamano: 200 }).comp;
  const r = rangoDelLienzo(comp);
  // 19 caracteres × 200 × 0.6 / 2 = 1140 de medio ancho → borde derecho ≈ 3040, más un render de aire
  assert.ok(r.maxX >= 3040 + 1920 - 1, `maxX ${r.maxX}`);
});

// ── el diseño del usuario no se borra ni se «reemplaza» ──────────────────
// Gemini, ante «que el manifesto entre palabra por palabra» sobre dos rasters:
// editar_capa {division} falló seco, y quitó las dos capas para recrearlas
// como texto plano. Las herramientas tienen que hacer imposible ese camino.

const conPantalla = (): Composicion => {
  let comp = base();
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "placa", forma: "rect", x: 720, y: 450, ancho: 1440, alto: 900 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "placa" ? { ...c, grupo: "placa" } : c)) };
  comp = {
    ...comp,
    capas: [
      ...comp.capas,
      { id: "fig-9-manifesto", tipo: "media", nombre: "We're entering a new era", grupo: "placa", x: 720, y: 300, ancho: 900, alto: 80, mediaId: "data:x", ajuste: "contener" } as Composicion["capas"][number],
    ],
  };
  return comp;
};

test("editar_capa: pedir division/tipografía sobre un raster falla LEGIBLE con la alternativa, sin tocar la capa", () => {
  const comp = conPantalla();
  const res = ejecutarHerramienta(comp, "editar_capa", { capaId: "fig-9-manifesto", division: "palabras" });
  assert.ok(res.esError);
  assert.match(res.resultado, /RASTER \(media\)/);
  assert.match(res.resultado, /no se puede dividir en palabras/);
  assert.match(res.resultado, /exportarla como TEXTO desde Figma/);
  assert.match(res.resultado, /JAMÁS la quites/);
  assert.deepEqual(res.comp, comp);
  // lo que sí aplica a un raster sigue andando
  const movida = ejecutarHerramienta(comp, "editar_capa", { capaId: "fig-9-manifesto", opacidad: 0.5 });
  assert.ok(!movida.esError);
  assert.equal(movida.comp.capas.find((c) => c.id === "fig-9-manifesto")?.opacidad, 0.5);
});

test("quitar_capa rechaza las capas del diseño (placa y capas de la pantalla) y ofrece ocultar; las propias se quitan", () => {
  let comp = conPantalla();
  const raster = ejecutarHerramienta(comp, "quitar_capa", { capaId: "fig-9-manifesto" });
  assert.ok(raster.esError);
  assert.match(raster.resultado, /parte del diseño importado/);
  assert.match(raster.resultado, /oculta: true/);
  assert.equal(raster.comp.capas.length, 2);
  const placa = ejecutarHerramienta(comp, "quitar_capa", { capaId: "placa" });
  assert.ok(placa.esError);
  // una capa que agregó el director (sin pantalla) sí se puede quitar
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "propia", texto: "x" }).comp;
  const propia = ejecutarHerramienta(comp, "quitar_capa", { capaId: "propia" });
  assert.ok(!propia.esError);
  assert.ok(!propia.comp.capas.some((c) => c.id === "propia"));
});

test("editar_capa {oculta} saca una capa del render sin borrarla, y vuelve", () => {
  const comp = conPantalla();
  const oculta = ejecutarHerramienta(comp, "editar_capa", { capaId: "fig-9-manifesto", oculta: true });
  assert.ok(!oculta.esError);
  assert.equal(oculta.comp.capas.find((c) => c.id === "fig-9-manifesto")?.oculta, true);
  const visible = ejecutarHerramienta(oculta.comp, "editar_capa", { capaId: "fig-9-manifesto", oculta: false });
  assert.equal(visible.comp.capas.find((c) => c.id === "fig-9-manifesto")?.oculta, undefined);
  assert.ok(DEFINICIONES_HERRAMIENTAS.find((d) => d.name === "editar_capa")?.input_schema.properties.oculta);
});

test("configPensamientoClaude: el slider manda (low/medium/xhigh); sin slider, solo «fino» piensa a fondo", async () => {
  const { configPensamientoClaude } = await import("@/lib/motion/agente");
  assert.deepEqual(configPensamientoClaude("bajo", "fino"), { thinking: { type: "adaptive" }, output_config: { effort: "low" } });
  assert.deepEqual(configPensamientoClaude("medio", undefined), { thinking: { type: "adaptive" }, output_config: { effort: "medium" } });
  assert.deepEqual(configPensamientoClaude("alto", "rapido"), { thinking: { type: "adaptive" }, output_config: { effort: "xhigh" } });
  assert.deepEqual(configPensamientoClaude(undefined, "fino"), { thinking: { type: "adaptive" }, output_config: { effort: "xhigh" } });
  assert.deepEqual(configPensamientoClaude(undefined, "rapido"), {});
  assert.deepEqual(configPensamientoClaude(undefined, undefined), {});
});

test("un typo en el nombre de la herramienta se corrige solo y el resultado lo dice (Kimi: «definar_camara»)", async () => {
  const { herramientaMasCercana } = await import("@/lib/motion/agente-herramientas");
  assert.equal(herramientaMasCercana("definar_camara", ["definir_camara", "definir_entrada"]), "definir_camara");
  assert.equal(herramientaMasCercana("Definir Camara", ["definir_camara"]), "definir_camara");
  assert.equal(herramientaMasCercana("hacer_magia", ["definir_camara", "editar_capa"]), null);
  // nunca hacia una destructiva, y nunca con empate
  assert.equal(herramientaMasCercana("qitar_capa", ["quitar_capa", "editar_capa"]), null);
  assert.equal(herramientaMasCercana("uitar_capa", ["quitar_capa", "editar_capa"]), null);
  assert.equal(herramientaMasCercana("editr_capa", ["quitar_capa", "editar_capa"]), "editar_capa");
  assert.equal(herramientaMasCercana("definir_x", ["definir_a", "definir_b"]), null);
  const comp = conTitulo();
  const res = ejecutarHerramienta(comp, "definar_entrada", { capaId: "titulo", preset: "subir" });
  assert.ok(!res.esError, res.resultado);
  assert.match(res.resultado, /«definar_entrada» no existe: apliqué «definir_entrada»/);
  assert.equal(res.comp.capas[0].entrada?.preset, "subir");
});
