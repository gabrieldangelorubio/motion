import { test } from "node:test";
import assert from "node:assert/strict";
import { aMono, remuestrear, oracionesDeTrozos } from "@/lib/motion/stt-puro";

test("aMono promedia canales; un canal pasa tal cual", () => {
  assert.deepEqual(Array.from(aMono([[1, 0.5], [0, 0.5]])), [0.5, 0.5]);
  assert.deepEqual(Array.from(aMono([[0.25, -0.25]])), [0.25, -0.25]);
  assert.equal(aMono([]).length, 0);
});

test("remuestrear: mitad de rate = mitad de muestras, extremos intactos", () => {
  const salida = remuestrear([0, 1, 2, 3, 4, 5, 6, 7], 8000, 4000);
  assert.equal(salida.length, 4);
  assert.equal(salida[0], 0);
  assert.equal(salida[salida.length - 1], 7);
  // mismo rate: copia
  assert.deepEqual(Array.from(remuestrear([1, 2, 3], 16000, 16000)), [1, 2, 3]);
});

test("remuestrear interpola lineal entre muestras (subir el rate no inventa saltos)", () => {
  const salida = remuestrear([0, 1], 1000, 3000);
  assert.equal(salida.length, 6);
  for (let i = 1; i < salida.length; i++) {
    assert.ok(salida[i] >= salida[i - 1], "monótona creciente");
  }
});

test("oracionesDeTrozos: ms redondeados, trozos vacíos afuera, fin nulo hereda el fin del audio", () => {
  const oraciones = oracionesDeTrozos(
    [
      { text: " Hola equipo. ", timestamp: [0, 1.5] },
      { text: "   ", timestamp: [1.5, 2] },
      { text: "Vamos con la escena dos.", timestamp: [2.25, null] },
    ],
    5000,
  );
  assert.deepEqual(oraciones, [
    { texto: "Hola equipo.", desdeMs: 0, hastaMs: 1500 },
    { texto: "Vamos con la escena dos.", desdeMs: 2250, hastaMs: 5000 },
  ]);
});
