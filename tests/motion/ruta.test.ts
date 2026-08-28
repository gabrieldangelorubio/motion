import { test } from "node:test";
import assert from "node:assert/strict";
import { subrutasDeSvg, desplazarSubrutas } from "@/lib/motion/ruta-puro";

/* ——— el parser de rutas SVG → bezier de AE (vectores de verdad) ———— */

test("un cuadrado cerrado: vértices sin tangentes, el punto duplicado del cierre se fusiona", () => {
  const rutas = subrutasDeSvg("M0 0L10 0L10 10L0 10L0 0Z");
  assert.equal(rutas.length, 1);
  assert.deepEqual(rutas[0].puntos, [[0, 0], [10, 0], [10, 10], [0, 10]]);
  assert.equal(rutas[0].cerrada, true);
  assert.ok(rutas[0].tanEntrada.every(([x, y]) => x === 0 && y === 0));
  assert.ok(rutas[0].tanSalida.every(([x, y]) => x === 0 && y === 0));
});

test("una curva C: tangentes RELATIVAS al vértice (formato AE)", () => {
  const [r] = subrutasDeSvg("M0 0C3 0 7 10 10 10");
  assert.deepEqual(r.puntos, [[0, 0], [10, 10]]);
  // control 1 (3,0) − P0 (0,0) = salida [3,0]; control 2 (7,10) − P1 (10,10) = entrada [-3,0]
  assert.deepEqual(r.tanSalida[0], [3, 0]);
  assert.deepEqual(r.tanEntrada[1], [-3, 0]);
  assert.equal(r.cerrada, false);
});

test("una cuadrática Q se ELEVA a cúbica exacta (⅔ del camino al control)", () => {
  const [r] = subrutasDeSvg("M0 0Q5 10 10 0");
  assert.deepEqual(r.puntos, [[0, 0], [10, 0]]);
  // c1 = P0 + ⅔(Q−P0) = (3.33, 6.67) → salida relativa (3.33, 6.67)
  assert.ok(Math.abs(r.tanSalida[0][0] - 10 / 3) < 1e-9);
  assert.ok(Math.abs(r.tanSalida[0][1] - 20 / 3) < 1e-9);
  assert.ok(Math.abs(r.tanEntrada[1][0] + 10 / 3) < 1e-9);
  assert.ok(Math.abs(r.tanEntrada[1][1] - 20 / 3) < 1e-9);
});

test("S refleja el control cúbico previo sobre el punto actual", () => {
  const [r] = subrutasDeSvg("M0 0C0 5 5 5 10 0S20 -5 20 10");
  // último control de la C fue (5,5); reflejo sobre (10,0) = (15,-5) → salida de P1 = [5,-5]
  assert.deepEqual(r.tanSalida[1], [5, -5]);
  assert.deepEqual(r.puntos[2], [20, 10]);
});

test("comandos relativos, h/v y un segundo subpath", () => {
  const rutas = subrutasDeSvg("m1 1 l2 0 v2 h-2 z m10 10 l5 5");
  assert.equal(rutas.length, 2);
  assert.deepEqual(rutas[0].puntos, [[1, 1], [3, 1], [3, 3], [1, 3]]);
  assert.equal(rutas[0].cerrada, true);
  // la m relativa tras el z parte del INICIO del subpath cerrado (1,1)
  assert.deepEqual(rutas[1].puntos, [[11, 11], [16, 16]]);
  assert.equal(rutas[1].cerrada, false);
});

test("números con notación científica y signos pegados («5-3» son dos)", () => {
  const [r] = subrutasDeSvg("M1e1 -5L-3.5-2.5");
  assert.deepEqual(r.puntos, [[10, -5], [-3.5, -2.5]]);
});

test("un arco A degrada a línea recta hasta su punto final (Figma no emite arcos)", () => {
  const [r] = subrutasDeSvg("M0 0A5 5 0 0 1 10 10L20 10");
  assert.deepEqual(r.puntos, [[0, 0], [10, 10], [20, 10]]);
});

test("pares extra tras un moveto son lineto implícitos", () => {
  const [r] = subrutasDeSvg("M0 0 5 5 10 0");
  assert.deepEqual(r.puntos, [[0, 0], [5, 5], [10, 0]]);
});

test("desplazarSubrutas corre los vértices sin tocar las tangentes (relativas)", () => {
  const rutas = desplazarSubrutas(subrutasDeSvg("M0 0C3 0 7 10 10 10"), -5, -5);
  assert.deepEqual(rutas[0].puntos, [[-5, -5], [5, 5]]);
  assert.deepEqual(rutas[0].tanSalida[0], [3, 0]);
});

test("un path vacío o basura devuelve lista vacía, nunca rompe", () => {
  assert.deepEqual(subrutasDeSvg(""), []);
  assert.deepEqual(subrutasDeSvg("hola mundo"), []);
});
