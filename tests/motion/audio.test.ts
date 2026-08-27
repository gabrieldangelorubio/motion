import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cortesDeEscenas,
  duracionTotal,
  escenaEnPunto,
  posicionGlobal,
  picosDe,
  recorteDeAudio,
} from "@/lib/motion/audio-puro";
import { encajarMedia } from "@/lib/motion/media-puro";

const escenas = [
  { id: "a", nombre: "Escena 1", duracion: 3000 },
  { id: "b", nombre: "Escena 2", duracion: 5000 },
  { id: "c", nombre: "Escena 3" }, // sin duración conocida → fallback
];

test("cortesDeEscenas acumula los inicios y usa el fallback donde falta la duración", () => {
  const cortes = cortesDeEscenas(escenas, 4000);
  assert.deepEqual(cortes.map((c) => c.desdeMs), [0, 3000, 8000]);
  assert.deepEqual(cortes.map((c) => c.duracionMs), [3000, 5000, 4000]);
  assert.equal(duracionTotal(cortes), 12000);
});

test("escenaEnPunto: el límite exacto pertenece a la escena SIGUIENTE (es su primer frame)", () => {
  const cortes = cortesDeEscenas(escenas, 4000);
  assert.deepEqual(escenaEnPunto(cortes, 0), { id: "a", localMs: 0 });
  assert.deepEqual(escenaEnPunto(cortes, 2999), { id: "a", localMs: 2999 });
  assert.deepEqual(escenaEnPunto(cortes, 3000), { id: "b", localMs: 0 });
  assert.deepEqual(escenaEnPunto(cortes, 9000), { id: "c", localMs: 1000 });
  // pasado el final: la última escena en su último ms; negativo clampea a 0
  assert.deepEqual(escenaEnPunto(cortes, 99999), { id: "c", localMs: 4000 });
  assert.deepEqual(escenaEnPunto(cortes, -50), { id: "a", localMs: 0 });
  assert.equal(escenaEnPunto([], 100), null);
});

test("posicionGlobal es la inversa de escenaEnPunto", () => {
  const cortes = cortesDeEscenas(escenas, 4000);
  assert.equal(posicionGlobal(cortes, "b", 1200), 4200);
  assert.equal(posicionGlobal(cortes, "a", 0), 0);
  assert.equal(posicionGlobal(cortes, "zzz", 100), null);
  const punto = escenaEnPunto(cortes, 4200);
  assert.ok(punto);
  assert.equal(posicionGlobal(cortes, punto.id, punto.localMs), 4200);
});

test("picosDe: máximo absoluto por balde, normalizado al pico global", () => {
  // 8 muestras en 4 baldes: el máximo |v| de cada par
  const picos = picosDe([0.1, -0.5, 0.2, 0.2, -1.0, 0.3, 0.0, 0.25], 4);
  assert.deepEqual(picos, [0.5, 0.2, 1.0, 0.25]);
});

test("picosDe: señal muda o vacía no divide por cero", () => {
  assert.deepEqual(picosDe([0, 0, 0, 0], 2), [0, 0]);
  assert.deepEqual(picosDe([], 3), [0, 0, 0]);
});

test("picosDe con más baldes que muestras no deja huecos NaN", () => {
  const picos = picosDe([0.5, 1.0], 4);
  assert.equal(picos.length, 4);
  for (const p of picos) assert.ok(Number.isFinite(p));
});

test("recorteDeAudio: el tramo de video elige sus muestras, clampeado al largo real", () => {
  // audio de 2s a 1000 Hz (2000 muestras)
  assert.deepEqual(recorteDeAudio(2000, 1000, 0, 1000), { desde: 0, muestras: 1000 });
  assert.deepEqual(recorteDeAudio(2000, 1000, 500, 1000), { desde: 500, muestras: 1000 });
  // el video sigue después del final del audio: silencio, no error
  assert.deepEqual(recorteDeAudio(2000, 1000, 1500, 1000), { desde: 1500, muestras: 500 });
  // arranca DESPUÉS del final: mudo (0 muestras)
  assert.deepEqual(recorteDeAudio(2000, 1000, 3000, 1000), { desde: 2000, muestras: 0 });
});

test("encajarMedia: entra al 70% del frame como máximo, sin agrandar nunca", () => {
  // una foto 4000×3000 en un frame 1920×1080 → limita el ALTO (1080×0.7)
  assert.deepEqual(encajarMedia(4000, 3000, 1920, 1080), { ancho: 1008, alto: 756 });
  // una imagen chica queda en su tamaño natural (no inventar píxeles)
  assert.deepEqual(encajarMedia(300, 200, 1920, 1080), { ancho: 300, alto: 200 });
});
