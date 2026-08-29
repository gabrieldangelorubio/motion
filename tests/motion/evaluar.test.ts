import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { estadoEn, cantidadUnidades } from "@/lib/motion/evaluar-puro";
import { deserializar } from "@/lib/motion/serializar-puro";
import type { CapaTexto, Composicion } from "@/lib/motion/modelo";

const fixture = (): Composicion =>
  deserializar(readFileSync(join(import.meta.dirname, "fixtures", "composicion-ejemplo.json"), "utf8"));

test("mismo (composición, t) → mismo estado, siempre (determinismo)", () => {
  const comp = fixture();
  const a = JSON.stringify(estadoEn(comp, 1234));
  const b = JSON.stringify(estadoEn(comp, 1234));
  assert.equal(a, b);
});

test("antes de su entrada, una capa con preset de opacidad está invisible; después, visible", () => {
  const comp = fixture();
  const antes = estadoEn(comp, 0);
  const titulo = antes.capas.find((c) => c.capa.id === "titulo")!;
  for (const u of titulo.unidades) assert.equal(u.opacidad, 0);

  const despues = estadoEn(comp, 3000);
  const tituloDespues = despues.capas.find((c) => c.capa.id === "titulo")!;
  for (const u of tituloDespues.unidades) assert.equal(u.opacidad, 1);
});

test("al terminar la entrada, la capa queda en IDENTIDAD (offset cero) — el contrato de presets", () => {
  const comp = fixture();
  const estado = estadoEn(comp, 3000);
  const titulo = estado.capas.find((c) => c.capa.id === "titulo")!;
  for (const u of titulo.unidades) {
    assert.ok(Math.abs(u.dx) < 0.01 && Math.abs(u.dy) < 0.01, `offset residual: ${u.dx}, ${u.dy}`);
    assert.ok(Math.abs(u.dEscala) < 0.01);
  }
});

test("el escalonado por centro hace que los caracteres del medio entren antes", () => {
  const comp = fixture();
  // titulo: entrada en=600, dur=950, escalonado=45 centro, "MOTION" = 6 unidades
  const durante = estadoEn(comp, 700);
  const titulo = durante.capas.find((c) => c.capa.id === "titulo")!;
  const centro = titulo.unidades[3].opacidad;
  const borde = titulo.unidades[0].opacidad;
  assert.ok(centro > borde, `centro (${centro}) debería ir adelante del borde (${borde})`);
});

test("las pistas crudas PISAN la posición base (la placa viaja de 400 a 1400)", () => {
  const comp = fixture();
  const inicio = estadoEn(comp, 1000);
  const fin = estadoEn(comp, 3000);
  const placaInicio = inicio.capas.find((c) => c.capa.id === "placa")!;
  const placaFin = fin.capas.find((c) => c.capa.id === "placa")!;
  assert.equal(placaInicio.x, 400);
  assert.equal(placaFin.x, 1400);
});

test("el hold de la pista mantiene x=1400 hasta 3500 y el tramo siguiente la lleva a 1600", () => {
  const comp = fixture();
  assert.equal(estadoEn(comp, 3499).capas.find((c) => c.capa.id === "placa")!.x, 1400);
  assert.equal(estadoEn(comp, 4200).capas.find((c) => c.capa.id === "placa")!.x, 1600);
});

test("el motion blur sintetizado es >0 durante el movimiento y 0 en reposo (control positivo)", () => {
  const comp = fixture();
  const durante = estadoEn(comp, 800);
  const titulo = durante.capas.find((c) => c.capa.id === "titulo")!;
  const conBlur = titulo.unidades.some((u) => u.blurY > 0.3);
  assert.ok(conBlur, "en pleno movimiento de entrada tendría que haber blur vertical");

  const reposo = estadoEn(comp, 3000);
  const tituloReposo = reposo.capas.find((c) => c.capa.id === "titulo")!;
  for (const u of tituloReposo.unidades) {
    assert.equal(u.blurX, 0);
    assert.equal(u.blurY, 0);
  }
});

test("un preset con desenfoque propio NO recibe blur sintetizado encima", () => {
  const comp = fixture();
  // bajada usa subirDesenfocado (desenfoquePropio) y NO tiene motionBlur declarado
  const durante = estadoEn(comp, 1700);
  const bajada = durante.capas.find((c) => c.capa.id === "bajada")!;
  for (const u of bajada.unidades) {
    assert.equal(u.blurX, 0);
    assert.equal(u.blurY, 0);
    // pero SÍ tiene el desenfoque del preset (control positivo)
  }
  const conDesenfoque = bajada.unidades.some((u) => u.desenfoque > 0);
  assert.ok(conDesenfoque, "el preset subirDesenfocado tendría que estar desenfocando");
});

test("una capa oculta no aparece en el estado", () => {
  const comp = fixture();
  const capas = comp.capas.map((c) => (c.id === "foto" ? { ...c, oculta: true } : c));
  const estado = estadoEn({ ...comp, capas }, 2000);
  assert.equal(estado.capas.find((c) => c.capa.id === "foto"), undefined);
  assert.ok(estado.capas.length === comp.capas.length - 1, "las demás siguen");
});

test("cantidadUnidades: caracteres sin espacios, palabras por separador", () => {
  const comp = fixture();
  const titulo = comp.capas.find((c) => c.id === "titulo") as CapaTexto;
  assert.equal(cantidadUnidades(titulo), 6); // M-O-T-I-O-N
  const bajada = comp.capas.find((c) => c.id === "bajada") as CapaTexto;
  assert.equal(cantidadUnidades(bajada), 5); // case study dos mil veintiséis
});

test("un preset desconocido degrada a fade en vez de romper (§2.8)", () => {
  const comp = fixture();
  const capas = comp.capas.map((c) =>
    c.id === "titulo" ? { ...c, entrada: { ...c.entrada!, preset: "presetDelFuturo" } } : c,
  );
  const estado = estadoEn({ ...comp, capas }, 3000);
  const titulo = estado.capas.find((c) => c.capa.id === "titulo")!;
  assert.equal(titulo.unidades[0].opacidad, 1);
});

/* ——— el CONTADOR: pista «numero» dentro del texto —————————————— */

test("textoConNumero reemplaza la PRIMERA cifra, redondeada", async () => {
  const { textoConNumero } = await import("@/lib/motion/evaluar-puro");
  assert.equal(textoConNumero("STOCK:171", 98.4), "STOCK:98");
  assert.equal(textoConNumero("STOCK:171", 0), "STOCK:0");
  assert.equal(textoConNumero("$ 1.200 antes", 850), "$ 850 antes");
  assert.equal(textoConNumero("sin cifras", 5), "sin cifras");
});

test("la pista «numero» produce textoVivo interpolado en el estado (el contador de agencia)", () => {
  const comp: Composicion = {
    version: 1,
    nombre: "contador",
    ancho: 400,
    alto: 300,
    fps: 30,
    duracion: 2000,
    fondo: "#000000",
    capas: [{
      id: "stock",
      nombre: "Stock",
      tipo: "texto",
      texto: "STOCK:171",
      fuente: { familia: "x", tamano: 40, peso: 700 },
      color: "#ffffff",
      division: "ninguna",
      x: 100,
      y: 100,
      pistas: { numero: [{ t: 0, v: 171, easing: "lineal" }, { t: 1000, v: 0 }] },
    } as CapaTexto],
  };
  assert.equal(estadoEn(comp, 0).capas[0].textoVivo, "STOCK:171");
  assert.equal(estadoEn(comp, 500).capas[0].textoVivo, "STOCK:86");
  assert.equal(estadoEn(comp, 1500).capas[0].textoVivo, "STOCK:0");
  // sin pista numero, no hay textoVivo
  const quieta = { ...comp, capas: [{ ...comp.capas[0], pistas: {} } as CapaTexto] };
  assert.equal(estadoEn(quieta, 500).capas[0].textoVivo, undefined);
});

test("fpsAnimacion cuantiza el movimiento: dentro del mismo paso, el estado es idéntico", async () => {
  const { cuantizarTiempo, estadoEn } = await import("@/lib/motion/evaluar-puro");
  // la grilla de 12fps: pasos de 83.33ms
  assert.equal(cuantizarTiempo(0, 12), 0);
  assert.equal(cuantizarTiempo(84, 12), cuantizarTiempo(160, 12));
  assert.notEqual(cuantizarTiempo(84, 12), cuantizarTiempo(170, 12));
  assert.equal(cuantizarTiempo(500, undefined), 500); // sin fpsAnimacion no toca
  const comp = {
    version: 1 as const, nombre: "fps", ancho: 1920, alto: 1080, fps: 30, duracion: 4000, fondo: "#000",
    fpsAnimacion: 12,
    capas: [{
      id: "a", nombre: "A", tipo: "forma" as const, forma: "rectangulo" as const, ancho: 100, alto: 100,
      color: "#fff", x: 0, y: 0,
      pistas: { x: [{ t: 0, v: 0 }, { t: 1000, v: 1000 }] },
    }],
  };
  const en90 = estadoEn(comp, 90).capas[0].x;
  const en160 = estadoEn(comp, 160).capas[0].x;
  const en170 = estadoEn(comp, 170).capas[0].x;
  assert.equal(en90, en160); // mismo paso de 12fps → mismo cuadro
  assert.notEqual(en160, en170); // paso siguiente → salta
  // sin fpsAnimacion el mismo par se mueve suave
  const suave = { ...comp, fpsAnimacion: undefined };
  assert.notEqual(estadoEn(suave, 90).capas[0].x, estadoEn(suave, 160).capas[0].x);
});
