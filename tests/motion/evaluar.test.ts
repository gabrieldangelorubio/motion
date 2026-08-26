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
