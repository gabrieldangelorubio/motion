import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoEn, cantidadUnidades, altoUnidad } from "@/lib/motion/evaluar-puro";
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
import { suavizarGrabacion, type MuestraCamara } from "@/lib/motion/suavizar-puro";
import { normalizarFigma, type ImportFigma } from "@/lib/motion/figma-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import type { CapaTexto, CapaTrazo, Composicion } from "@/lib/motion/modelo";

/* Base mínima: un lienzo 1920×1080 de 5s sin capas — cada test arma lo suyo. */
const base = (): Composicion => ({
  version: 1,
  nombre: "prueba",
  ancho: 1920,
  alto: 1080,
  fps: 30,
  duracion: 5000,
  fondo: "#000000",
  capas: [],
});

const textoRevelado = (): CapaTexto => ({
  id: "titulo",
  nombre: "Título",
  tipo: "texto",
  texto: "UNO DOS TRES",
  fuente: { familia: "sans-serif", tamano: 100, peso: 700 },
  color: "#ffffff",
  division: "palabras",
  x: 960,
  y: 540,
  entrada: { preset: "revelar", en: 0, duracion: 1000, easing: "lineal" },
});

const trazoDePrueba = (extra: Partial<CapaTrazo> = {}): CapaTrazo => ({
  id: "linea",
  nombre: "Línea",
  tipo: "trazo",
  path: "M 0 0 L 200 0",
  ancho: 200,
  alto: 0,
  color: "#ff0000",
  grosor: 4,
  largo: 200,
  x: 960,
  y: 540,
  ...extra,
});

/* El mismo contexto falso del test de pintar: registra llamadas. */
function contextoFalso() {
  const llamadas: string[] = [];
  const registrar = (nombre: string) => (...args: unknown[]) => {
    llamadas.push(`${nombre}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : String(a))).join(",")})`);
    if (nombre === "measureText") return { width: 10 * String(args[0]).length };
    return undefined;
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(objetivo, prop: string) {
      if (prop in objetivo) return objetivo[prop];
      return registrar(prop);
    },
    set(objetivo, prop: string, valor) {
      llamadas.push(`set ${prop}=${String(valor)}`);
      objetivo[prop] = valor;
      return true;
    },
  });
  return { ctx: ctx as unknown as Contexto2D, llamadas };
}

/* ——— Revelado enmascarado (texto multilínea + recorte) ——— */

test("revelar: durante la entrada la unidad baja en múltiplos del alto de línea y queda recortada", () => {
  const comp = { ...base(), capas: [textoRevelado()] };
  const inicio = estadoEn(comp, 0);
  const u = inicio.capas[0].unidades[0];
  // dy = 1.1 × interlineado (100 × 1.15 = 115) = 126.5, con recorte activo
  assert.ok(Math.abs(u.dy - 126.5) < 0.01, `dy relativo esperado 126.5, vino ${u.dy}`);
  assert.equal(u.recorte, true);
});

test("revelar: al terminar la entrada el texto queda en reposo y SIN recorte (los descendentes no se cortan)", () => {
  const comp = { ...base(), capas: [textoRevelado()] };
  const fin = estadoEn(comp, 1000);
  for (const u of fin.capas[0].unidades) {
    assert.ok(Math.abs(u.dy) < 0.01);
    assert.equal(u.recorte, false);
  }
});

test("ocultar (salida) activa el recorte desde que arranca en adelante", () => {
  const capa: CapaTexto = { ...textoRevelado(), entrada: undefined, salida: { preset: "ocultar", en: 3000, duracion: 800, easing: "lineal" } };
  const comp = { ...base(), capas: [capa] };
  assert.equal(estadoEn(comp, 2999).capas[0].unidades[0].recorte, false);
  assert.equal(estadoEn(comp, 3400).capas[0].unidades[0].recorte, true);
  assert.equal(estadoEn(comp, 4500).capas[0].unidades[0].recorte, true, "después de salir sigue recortada (escondida)");
});

test("cantidadUnidades entiende multilínea: lineas cuenta renglones, palabras cruza saltos de línea", () => {
  const capa = textoRevelado();
  assert.equal(cantidadUnidades({ ...capa, texto: "una\ndos\ntres", division: "lineas" }), 3);
  assert.equal(cantidadUnidades({ ...capa, texto: "hola mundo\nfinal", division: "palabras" }), 3);
  assert.ok(Math.abs(altoUnidad(capa) - 115) < 0.001, "interlineado default = tamaño × 1.15");
  assert.equal(altoUnidad({ ...capa, fuente: { ...capa.fuente, interlineado: 90 } }), 90);
});

test("pintar multilínea: división por líneas pinta un fillText por renglón, y el recorte clipea ANTES de mover", () => {
  const capa: CapaTexto = {
    ...textoRevelado(),
    texto: "HOLA\nMUNDO",
    division: "lineas",
    entrada: { preset: "revelar", en: 0, duracion: 1000, easing: "lineal" },
  };
  const comp = { ...base(), capas: [capa] };
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(comp, 200), ctx);
  const textos = llamadas.filter((l) => l.startsWith("fillText"));
  assert.equal(textos.length, 2, `dos renglones = dos fillText, hubo ${textos.length}`);
  const indiceClip = llamadas.findIndex((l) => l.startsWith("clip"));
  const indiceTexto = llamadas.findIndex((l) => l.startsWith("fillText"));
  assert.ok(indiceClip >= 0 && indiceClip < indiceTexto, "el clip va antes del texto");
  // en reposo (sin segmento activo) NO hay clip
  const reposo = contextoFalso();
  pintar(estadoEn(comp, 2000), reposo.ctx);
  assert.ok(!reposo.llamadas.some((l) => l.startsWith("clip")), "sin revelado activo no se recorta");
});

/* ——— Trazos con trim (el «pathway» de AE) ——— */

test("trazar: la entrada lleva trazoFin de 0 a 1; borrar (salida) lleva trazoInicio a 1", () => {
  const capa = trazoDePrueba({
    entrada: { preset: "trazar", en: 0, duracion: 1000, easing: "lineal" },
    salida: { preset: "borrar", en: 3000, duracion: 1000, easing: "lineal" },
  });
  const comp = { ...base(), capas: [capa] };
  assert.equal(estadoEn(comp, 0).capas[0].unidades[0].trazoFin, 0);
  const mitad = estadoEn(comp, 500).capas[0].unidades[0];
  assert.ok(mitad.trazoFin > 0.4 && mitad.trazoFin < 0.6, `a mitad de trazar, trazoFin ≈ 0.5 (vino ${mitad.trazoFin})`);
  assert.equal(estadoEn(comp, 2000).capas[0].unidades[0].trazoFin, 1);
  assert.equal(estadoEn(comp, 4000).capas[0].unidades[0].trazoInicio, 1, "borrar completo: todo borrado");
});

test("pintar un trazo recortado usa el dash: [visible, largo] corrido por lineDashOffset", () => {
  const G = globalThis as { Path2D?: unknown };
  const original = G.Path2D;
  // Path2D no existe en node: un doble con toString para ver el path en el log
  G.Path2D = class {
    d: string;
    constructor(d: string) { this.d = d; }
    toString() { return this.d; }
  };
  try {
    const capa = trazoDePrueba({ trazoInicio: 0.25, trazoFin: 0.75 });
    const comp = { ...base(), capas: [capa] };
    const { ctx, llamadas } = contextoFalso();
    pintar(estadoEn(comp, 0), ctx);
    // el arg del dash es un ARRAY: el contexto falso lo loguea con String()
    assert.ok(llamadas.includes("setLineDash(100,200)"), `dash visible de (0.75−0.25)×200: ${llamadas.filter((l) => l.startsWith("setLineDash"))}`);
    assert.ok(llamadas.includes("set lineDashOffset=-50"), "corrido 0.25×200 dentro del path");
    assert.ok(llamadas.some((l) => l === "stroke(M 0 0 L 200 0)"), "se trazó el path");

    // trim completo (0→1): trazo entero SIN dash
    const entero = contextoFalso();
    pintar(estadoEn({ ...base(), capas: [trazoDePrueba()] }, 0), entero.ctx);
    assert.ok(!entero.llamadas.some((l) => l.startsWith("setLineDash")), "sin trim no hay dash");
    assert.ok(entero.llamadas.some((l) => l.startsWith("stroke")));

    // trim vacío (fin ≤ inicio): no se dibuja nada
    const vacio = contextoFalso();
    pintar(estadoEn({ ...base(), capas: [trazoDePrueba({ trazoFin: 0 })] }, 0), vacio.ctx);
    assert.ok(!vacio.llamadas.some((l) => l.startsWith("stroke")), "trim vacío = nada que dibujar");
  } finally {
    if (original === undefined) delete G.Path2D;
    else G.Path2D = original;
  }
});

test("un trazo sin largo medido (0) degrada a trazo completo, nunca rompe", () => {
  const capa = trazoDePrueba({ largo: 0, trazoInicio: 0.25, trazoFin: 0.75 });
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn({ ...base(), capas: [capa] }, 0), ctx);
  assert.ok(!llamadas.some((l) => l.startsWith("setLineDash")), "sin largo no se puede recortar: sale entero");
});

/* ——— Cámara de composición ——— */

test("sin cámara el estado resuelve identidad (centro del lienzo, zoom 1) y pintar no transforma", () => {
  const comp = base();
  const estado = estadoEn(comp, 1000);
  assert.deepEqual(estado.camara, { x: 960, y: 540, zoom: 1 });
  const { ctx, llamadas } = contextoFalso();
  pintar(estado, ctx);
  assert.ok(!llamadas.some((l) => l.startsWith("scale")), "cámara identidad = ni una llamada de más");
});

test("la cámara interpola sus pistas y pintar aplica la transformación de mundo ANTES de las capas", () => {
  const comp: Composicion = {
    ...base(),
    capas: [trazoDePrueba()],
    camara: {
      pistas: {
        zoom: [{ t: 0, v: 1, easing: "lineal" }, { t: 1000, v: 2, easing: "lineal" }],
        x: [{ t: 0, v: 960, easing: "lineal" }, { t: 1000, v: 400, easing: "lineal" }],
      },
    },
  };
  assert.equal(estadoEn(comp, 0).camara.zoom, 1);
  assert.equal(estadoEn(comp, 1000).camara.zoom, 2);
  assert.equal(estadoEn(comp, 1000).camara.x, 400);
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(comp, 1000), ctx);
  const indiceZoom = llamadas.findIndex((l) => l === "scale(2.000,2.000)");
  const indiceCapa = llamadas.findIndex((l) => l.startsWith("stroke") || l.startsWith("setLineDash"));
  assert.ok(indiceZoom >= 0, "el zoom de cámara se aplicó");
  assert.ok(indiceCapa < 0 || indiceZoom < indiceCapa, "la cámara va antes de pintar capas");
});

test("un zoom roto (≤0) degrada al piso 0.05, no invierte el frame", () => {
  const comp: Composicion = { ...base(), camara: { pistas: { zoom: [{ t: 0, v: -3 }] } } };
  assert.equal(estadoEn(comp, 0).camara.zoom, 0.05);
});

/* ——— Suavizado de la grabación de cámara ——— */

function grabacionConTemblor(): MuestraCamara[] {
  // paneo lineal x 400→1400 en 3s a ~15Hz, con temblor determinista de ±6px
  const muestras: MuestraCamara[] = [];
  for (let i = 0; i <= 45; i++) {
    const t = (i / 45) * 3000;
    muestras.push({ t, x: 400 + (1000 * i) / 45 + (i % 3 - 1) * 6, y: 540, zoom: 1 });
  }
  return muestras;
}

test("suavizarGrabacion: cientos de muestras con temblor quedan en POCOS keyframes que conservan el gesto", () => {
  const camara = suavizarGrabacion(grabacionConTemblor());
  assert.ok(camara, "hay cámara");
  const x = camara!.pistas.x!;
  assert.ok(x.length >= 2 && x.length <= 10, `un paneo lineal se reduce a pocos keyframes (vino ${x.length})`);
  assert.equal(x[0].t, 0);
  assert.equal(x[x.length - 1].t, 3000);
  assert.ok(Math.abs(x[0].v - 400) < 20, `arranca cerca de 400 (vino ${x[0].v})`);
  assert.ok(Math.abs(x[x.length - 1].v - 1400) < 20, `termina cerca de 1400 (vino ${x[x.length - 1].v})`);
});

test("suavizarGrabacion omite los canales constantes y devuelve null si no hay material", () => {
  const camara = suavizarGrabacion(grabacionConTemblor());
  assert.equal(camara!.pistas.y, undefined, "y constante: sin pista");
  assert.equal(camara!.pistas.zoom, undefined, "zoom constante: sin pista");
  assert.equal(suavizarGrabacion([]), null);
  assert.equal(suavizarGrabacion([{ t: 0, x: 0, y: 0, zoom: 1 }]), null);
  const quieta = grabacionConTemblor().map((m) => ({ ...m, x: 700 }));
  assert.equal(suavizarGrabacion(quieta), null, "una toma sin movimiento no ensucia con cámara vacía");
});

/* ——— Import de Figma: trazos e interlineado ——— */

test("normalizarFigma convierte un vector con stroke en capa de trazo con largo 0 (lo mide el editor)", () => {
  const datos: ImportFigma = {
    origen: "figma",
    version: 1,
    frame: { nombre: "Refe", ancho: 1000, alto: 600, fondo: "#111111" },
    nodos: [
      {
        tipo: "trazo",
        nombre: "Subrayado",
        x: 100, y: 400, ancho: 300, alto: 12,
        trazo: { path: "M 0 6 L 300 6", color: "#ff3300", grosor: 3, remate: "redondo" },
      },
      {
        tipo: "texto",
        nombre: "Título",
        x: 100, y: 100, ancho: 400, alto: 240,
        texto: { contenido: "UNA\nDOS\nTRES", familia: "Archivo", peso: 800, tamano: 64, interlineado: 70, alineacion: "izquierda", color: "#ffffff" },
      },
    ],
  };
  const { composicion, avisos } = normalizarFigma(datos);
  assert.equal(avisos.length, 0);
  const trazo = composicion.capas.find((c) => c.tipo === "trazo") as CapaTrazo;
  assert.equal(trazo.path, "M 0 6 L 300 6");
  assert.equal(trazo.largo, 0);
  assert.equal(trazo.x, 250, "ancla al centro del nodo");
  const texto = composicion.capas.find((c) => c.tipo === "texto") as CapaTexto;
  assert.equal(texto.fuente.interlineado, 70);
  // ancla: baseline de la 1ª línea (100 + 64×0.8) + media altura de bloque extra (70)
  assert.ok(Math.abs(texto.y - (100 + 51.2 + 70)) < 0.01, `ancla multilínea corrida (vino ${texto.y})`);
});

/* ——— Herramientas del agente ——— */

test("definir_camara guarda pistas clampeadas y quitar_camara la saca; sin canales es error", () => {
  const comp = base();
  const res = ejecutarHerramienta(comp, "definir_camara", {
    zoom: [{ t: 0, v: 1 }, { t: 2000, v: 99 }],
    x: [{ t: 0, v: 960 }, { t: 2000, v: 400 }],
  });
  assert.ok(!res.esError, res.resultado);
  assert.equal(res.comp.camara!.pistas.zoom![1].v, 10, "zoom clampeado a 10");
  assert.equal(res.comp.camara!.pistas.x![1].v, 400);

  const sin = ejecutarHerramienta(res.comp, "quitar_camara", {});
  assert.equal(sin.comp.camara, undefined);
  assert.ok(ejecutarHerramienta(comp, "definir_camara", {}).esError, "sin canales = error legible");
  assert.ok(ejecutarHerramienta(base(), "quitar_camara", {}).esError, "no había cámara");
});

test("definir_pista de trazoFin funciona en capas de trazo (clampeado 0-1) y es error en otras", () => {
  const comp = { ...base(), capas: [trazoDePrueba(), textoRevelado()] };
  const ok = ejecutarHerramienta(comp, "definir_pista", {
    capaId: "linea",
    propiedad: "trazoFin",
    keyframes: [{ t: 0, v: -2 }, { t: 1000, v: 5 }],
  });
  assert.ok(!ok.esError, ok.resultado);
  const pista = (ok.comp.capas[0] as CapaTrazo).pistas!.trazoFin!;
  assert.deepEqual(pista.map((k) => k.v), [0, 1], "valores clampeados a 0-1");

  const mal = ejecutarHerramienta(comp, "definir_pista", {
    capaId: "titulo",
    propiedad: "trazoFin",
    keyframes: [{ t: 0, v: 0 }],
  });
  assert.ok(mal.esError, "trims sólo en trazos");
});

test("editar_capa acepta división por líneas y el trim base de un trazo", () => {
  const comp = { ...base(), capas: [trazoDePrueba(), textoRevelado()] };
  const texto = ejecutarHerramienta(comp, "editar_capa", { capaId: "titulo", division: "lineas" });
  assert.ok(!texto.esError);
  assert.equal((texto.comp.capas[1] as CapaTexto).division, "lineas");
  const trazo = ejecutarHerramienta(comp, "editar_capa", { capaId: "linea", trazoFin: 0.5, grosor: 8 });
  assert.ok(!trazo.esError);
  assert.equal((trazo.comp.capas[0] as CapaTrazo).trazoFin, 0.5);
  assert.equal((trazo.comp.capas[0] as CapaTrazo).grosor, 8);
});
