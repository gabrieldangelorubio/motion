import { test } from "node:test";
import assert from "node:assert/strict";
import { cajaLocalDeCapa, cajaMundoDeCapa, puntoEnCapa, capaEnPunto } from "@/lib/motion/cajas-puro";
import { snapArrastre } from "@/lib/motion/snap-puro";
import type { CapaForma, CapaTexto } from "@/lib/motion/modelo";

const medirFalso = (texto: string) => texto.length * 10;

const forma = (extra: Partial<CapaForma> = {}): CapaForma => ({
  id: "f",
  nombre: "f",
  tipo: "forma",
  forma: "rectangulo",
  ancho: 200,
  alto: 100,
  color: "#33333c",
  x: 500,
  y: 300,
  ...extra,
});

const texto = (extra: Partial<CapaTexto> = {}): CapaTexto => ({
  id: "t",
  nombre: "t",
  tipo: "texto",
  texto: "HOLA",
  fuente: { familia: "sans-serif", tamano: 100, peso: 700 },
  color: "#fff",
  division: "ninguna",
  x: 0,
  y: 0,
  ...extra,
});

test("la caja de una forma está centrada en el ancla", () => {
  assert.deepEqual(cajaLocalDeCapa(forma(), medirFalso), { x: -100, y: -50, w: 200, h: 100 });
});

test("la caja de un texto centrado reparte el ancho; alineado a la izquierda arranca en 0", () => {
  const centrado = cajaLocalDeCapa(texto(), medirFalso); // "HOLA" = 40 de ancho falso
  assert.equal(centrado.x, -20);
  assert.equal(centrado.w, 40);
  const izq = cajaLocalDeCapa(texto({ alineacion: "izquierda" }), medirFalso);
  assert.equal(izq.x, 0);
});

test("hit-test: adentro sí, afuera no (control positivo y negativo)", () => {
  const capa = forma();
  assert.ok(puntoEnCapa(capa, medirFalso, 500, 300));
  assert.ok(puntoEnCapa(capa, medirFalso, 599, 349));
  assert.ok(!puntoEnCapa(capa, medirFalso, 601, 300));
  assert.ok(!puntoEnCapa(capa, medirFalso, 500, 351));
});

test("hit-test respeta la ROTACIÓN: la esquina rotada entra, la original ya no", () => {
  const capa = forma({ rotacion: 90 }); // 200×100 rotada: ahora ocupa 100×200
  assert.ok(puntoEnCapa(capa, medirFalso, 500, 395), "el largo ahora es vertical");
  assert.ok(!puntoEnCapa(capa, medirFalso, 595, 300), "el largo horizontal ya no está");
});

test("hit-test respeta la ESCALA", () => {
  const capa = forma({ escala: 0.5 });
  assert.ok(puntoEnCapa(capa, medirFalso, 545, 300));
  assert.ok(!puntoEnCapa(capa, medirFalso, 560, 300));
});

test("capaEnPunto devuelve la de MÁS ARRIBA y saltea ocultas", () => {
  const abajo = forma({ id: "abajo" });
  const arriba = forma({ id: "arriba" });
  assert.equal(capaEnPunto([abajo, arriba], medirFalso, 500, 300)?.id, "arriba");
  assert.equal(capaEnPunto([abajo, { ...arriba, oculta: true }], medirFalso, 500, 300)?.id, "abajo");
  assert.equal(capaEnPunto([abajo], medirFalso, 0, 0), null);
});

test("la caja de mundo de una capa rotada es la envolvente", () => {
  const caja = cajaMundoDeCapa(forma({ rotacion: 90 }), medirFalso);
  assert.ok(Math.abs(caja.w - 100) < 1e-9);
  assert.ok(Math.abs(caja.h - 200) < 1e-9);
});

test("snap: engancha el borde más cercano dentro del umbral, con su guía", () => {
  const movida = { x: 95, y: 500, w: 100, h: 50 };
  const otra = { x: 200, y: 0, w: 100, h: 100 };
  const res = snapArrastre(movida, [otra], 8);
  assert.equal(res.dx, 5); // borde-fin (195) → borde-inicio de la otra (200)
  assert.equal(res.dy, 0);
  assert.deepEqual(res.guias, [{ eje: "x", pos: 200 }]);
});

test("snap: UN solo ganador por eje — gana la distancia mínima", () => {
  const movida = { x: 0, y: 0, w: 100, h: 100 };
  const cerca = { x: 103, y: 300, w: 50, h: 50 };
  const lejos = { x: 107, y: 300, w: 50, h: 50 };
  const res = snapArrastre(movida, [lejos, cerca], 8);
  assert.equal(res.dx, 3);
  assert.equal(res.guias.filter((g) => g.eje === "x").length, 1);
});

test("snap: fuera del umbral no ajusta nada (control negativo)", () => {
  const res = snapArrastre({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 500, y: 500, w: 10, h: 10 }], 8);
  assert.deepEqual(res, { dx: 0, dy: 0, guias: [] });
});

test("snap: centro con centro también engancha", () => {
  const movida = { x: 0, y: 96, w: 100, h: 100 }; // centro y = 146
  const otra = { x: 300, y: 100, w: 100, h: 100 }; // centro y = 150
  const res = snapArrastre(movida, [otra], 8);
  assert.equal(res.dy, 4);
});
