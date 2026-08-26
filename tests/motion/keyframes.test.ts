import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolar, ordenarKeyframes, delaysEscalonado } from "@/lib/motion/keyframes-puro";
import { EASINGS, velocidadEn } from "@/lib/motion/easings-puro";

test("entre dos keyframes lineales devuelve el punto medio", () => {
  assert.equal(interpolar([{ t: 0, v: 0, easing: "lineal" }, { t: 10, v: 100 }], 5), 50);
});

test("antes del primer keyframe clampea al primer valor, después del último al último", () => {
  const pista = [{ t: 100, v: 5 }, { t: 200, v: 15 }];
  assert.equal(interpolar(pista, 0), 5);
  assert.equal(interpolar(pista, 999), 15);
});

test("un hold congela el valor hasta el próximo keyframe", () => {
  const pista = [{ t: 0, v: 10, hold: true }, { t: 100, v: 99 }];
  assert.equal(interpolar(pista, 99.9), 10);
  assert.equal(interpolar(pista, 100), 99);
});

test("una pista vacía devuelve 0 y una de un solo keyframe devuelve su valor", () => {
  assert.equal(interpolar([], 50), 0);
  assert.equal(interpolar([{ t: 30, v: 7 }], 0), 7);
  assert.equal(interpolar([{ t: 30, v: 7 }], 90), 7);
});

test("el easing del tramo lo declara el keyframe de SALIDA", () => {
  // salidaExpo a mitad de tramo va bien arriba de 0.5; lineal da exactamente 0.5
  const lineal = interpolar([{ t: 0, v: 0, easing: "lineal" }, { t: 100, v: 1 }], 50);
  const expo = interpolar([{ t: 0, v: 0, easing: "salidaExpo" }, { t: 100, v: 1 }], 50);
  assert.equal(lineal, 0.5);
  assert.ok(expo > 0.9, `salidaExpo(0.5) debería pasar 0.9, dio ${expo}`);
});

test("ordenarKeyframes no muta y ordena por t", () => {
  const original = [{ t: 50, v: 1 }, { t: 0, v: 0 }];
  const ordenada = ordenarKeyframes(original);
  assert.equal(ordenada[0].t, 0);
  assert.equal(original[0].t, 50);
});

test("todos los easings arrancan en 0 y terminan en 1", () => {
  for (const [nombre, fn] of Object.entries(EASINGS)) {
    assert.ok(Math.abs(fn(0)) < 1e-6, `${nombre}(0) = ${fn(0)}`);
    assert.ok(Math.abs(fn(1) - 1) < 0.02, `${nombre}(1) = ${fn(1)}`);
  }
});

test("un resorte con rebote SE PASA de 1 en el camino (control positivo del overshoot)", () => {
  const fn = EASINGS.resorteRebote;
  let maximo = 0;
  for (let t = 0; t <= 1; t += 0.01) maximo = Math.max(maximo, fn(t));
  assert.ok(maximo > 1.02, `el rebote debería sobrepasar 1, llegó a ${maximo}`);
  // y el suave NO se pasa más que un pelo — sin este control, "no rebota" sería
  // verde también con la maquinaria rota
  let maximoSuave = 0;
  for (let t = 0; t <= 1; t += 0.01) maximoSuave = Math.max(maximoSuave, EASINGS.suave(t));
  assert.ok(maximoSuave <= 1.001, `suave no debería sobrepasar 1, llegó a ${maximoSuave}`);
});

test("la velocidad de salidaExpo es alta al principio y ~0 al final", () => {
  const fn = EASINGS.salidaExpo;
  assert.ok(velocidadEn(fn, 0.05) > 2, "arranca rápido");
  assert.ok(velocidadEn(fn, 0.95) < 0.2, "termina quieto");
});

test("delaysEscalonado: orden centro arranca del medio", () => {
  const delays = delaysEscalonado(5, 10, "centro");
  assert.equal(delays[2], 0);
  assert.equal(delays[0], 20);
  assert.equal(delays[4], 20);
});

test("delaysEscalonado: orden inicio es 0, paso, 2·paso…", () => {
  assert.deepEqual(delaysEscalonado(3, 40, "inicio"), [0, 40, 80]);
});
