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

/* ——— Timestamps por PALABRA ————————————————————————————————— */

test("palabrasDeTrozos: misma limpieza que las oraciones (vacíos afuera, fin nulo hereda)", async () => {
  const { palabrasDeTrozos } = await import("@/lib/motion/stt-puro");
  const palabras = palabrasDeTrozos(
    [
      { text: " Hello", timestamp: [0.1, 0.4] },
      { text: "  ", timestamp: [0.4, 0.5] },
      { text: "world", timestamp: [0.5, null] },
    ],
    2000,
  );
  assert.deepEqual(palabras, [
    { texto: "Hello", desdeMs: 100, hastaMs: 400 },
    { texto: "world", desdeMs: 500, hastaMs: 2000 },
  ]);
});

test("oracionesDePalabras agrupa por puntuación final y por PAUSA larga", async () => {
  const { oracionesDePalabras } = await import("@/lib/motion/stt-puro");
  const p = (texto: string, desdeMs: number, hastaMs: number) => ({ texto, desdeMs, hastaMs });
  const oraciones = oracionesDePalabras([
    p("Hello", 0, 300),
    p("world.", 350, 700), // puntuación → cierra
    p("Next", 900, 1100),
    p("part", 1150, 1400), // después viene una PAUSA de 1s → cierra
    p("final", 2400, 2700), // última palabra sin puntuación → cierra igual
  ]);
  assert.deepEqual(oraciones, [
    { texto: "Hello world.", desdeMs: 0, hastaMs: 700 },
    { texto: "Next part", desdeMs: 900, hastaMs: 1400 },
    { texto: "final", desdeMs: 2400, hastaMs: 2700 },
  ]);
  // la puntuación con comillas/paréntesis de cierre también corta
  const conComillas = oracionesDePalabras([p('done!"', 0, 200), p("More", 300, 500)]);
  assert.equal(conComillas.length, 2);
});

test("limpiarPalabras poda los LOOPS de whisper y perdona la repetición legítima", async () => {
  const { limpiarPalabras } = await import("@/lib/motion/stt-puro");
  const p = (texto: string, desdeMs: number) => ({ texto, desdeMs, hastaMs: desdeMs + 200 });
  // el trabón clásico: la misma palabra decenas de veces casi sin avanzar
  const loop = limpiarPalabras([
    p("And", 0),
    ...Array.from({ length: 25 }, (_, i) => p("works", 1000 + i * 10)),
    p("fine", 2000),
  ]);
  assert.deepEqual(loop.map((x) => x.texto), ["And", "works", "fine"]);
  // un «no, no, no» legítimo (tres, con tiempos reales) sobrevive
  const legit = limpiarPalabras([p("no", 0), p("no", 400), p("no", 800), p("way", 1300)]);
  assert.deepEqual(legit.map((x) => x.texto), ["no", "no", "no", "way"]);
  // cuatro o más idénticas seguidas = patológico aunque los tiempos avancen
  const racha = limpiarPalabras([p("go", 0), p("go", 400), p("go", 800), p("go", 1200), p("on", 1700)]);
  assert.deepEqual(racha.map((x) => x.texto), ["go", "on"]);
  // mayúsculas no salvan al loop
  const caso = limpiarPalabras([p("The", 0), p("the", 20), p("cat", 500)]);
  assert.deepEqual(caso.map((x) => x.texto), ["The", "cat"]);
});

/* ——— Edición manual de la lista de palabras (el modal «Palabras») ———— */

test("moverPalabraLista corre la palabra ENTERA y reordena: el array queda en orden temporal", async () => {
  const { moverPalabraLista } = await import("@/lib/motion/stt-puro");
  const p = (texto: string, desdeMs: number) => ({ texto, desdeMs, hastaMs: desdeMs + 200 });
  const lista = [p("one", 0), p("two", 1000), p("three", 2000)];
  // «three» se va ANTES de «two»: sin reorden quedaría inagarrable en el carril
  const movida = moverPalabraLista(lista, 2, 500);
  assert.deepEqual(movida.map((x) => x.texto), ["one", "three", "two"]);
  assert.deepEqual(movida[1], { texto: "three", desdeMs: 500, hastaMs: 700 }); // misma duración
  // no clava tiempos negativos
  assert.equal(moverPalabraLista(lista, 0, -300)[0].desdeMs, 0);
  // índice inexistente = intacta
  assert.equal(moverPalabraLista(lista, 9, 500), lista);
  // la original no se toca (pura)
  assert.equal(lista[2].desdeMs, 2000);
});

test("agregarPalabraLista inserta EN ORDEN temporal", async () => {
  const { agregarPalabraLista } = await import("@/lib/motion/stt-puro");
  const p = (texto: string, desdeMs: number) => ({ texto, desdeMs, hastaMs: desdeMs + 200 });
  const lista = agregarPalabraLista([p("one", 0), p("three", 2000)], p("two", 1000));
  assert.deepEqual(lista.map((x) => x.texto), ["one", "two", "three"]);
});

test("renombrarPalabraLista recorta espacios y un texto vacío no cambia nada", async () => {
  const { renombrarPalabraLista } = await import("@/lib/motion/stt-puro");
  const p = (texto: string, desdeMs: number) => ({ texto, desdeMs, hastaMs: desdeMs + 200 });
  const lista = [p("one", 0), p("dos", 1000)];
  assert.equal(renombrarPalabraLista(lista, 1, "  two ")[1].texto, "two");
  assert.equal(renombrarPalabraLista(lista, 1, "   "), lista);
  assert.equal(renombrarPalabraLista(lista, 7, "x"), lista);
});

test("framesDeEncoder: frames del mel → frames del encoder (÷2, el bug del alineador)", async () => {
  const { framesDeEncoder } = await import("@/lib/motion/stt-puro");
  // 11s de audio = 1100 frames de mel → 550 frames de encoder: sin el ÷2
  // el DTW ve el doble del audio y las palabras derivan hasta 2× (medido)
  assert.equal(framesDeEncoder(1100), 550);
  assert.equal(framesDeEncoder(3000), 1500);
  assert.equal(framesDeEncoder(0), 0);
  assert.equal(framesDeEncoder(null), null);
  assert.equal(framesDeEncoder(undefined), null);
});
