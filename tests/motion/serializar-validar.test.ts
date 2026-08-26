import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serializar, deserializar, migrar } from "@/lib/motion/serializar-puro";
import { validar } from "@/lib/motion/validar-puro";
import type { Composicion } from "@/lib/motion/modelo";

const fixtureJson = () =>
  readFileSync(join(import.meta.dirname, "fixtures", "composicion-ejemplo.json"), "utf8");

test("serializar ∘ deserializar es identidad sobre el fixture", () => {
  const comp = deserializar(fixtureJson());
  const otraVez = deserializar(serializar(comp));
  assert.deepEqual(otraVez, comp);
});

test("migrar acepta un v0 sin versión ni fps y lo sube a v1 con fps 30", () => {
  const v0 = { nombre: "vieja", ancho: 1920, alto: 1080, duracion: 3000, fondo: "#000", capas: [] };
  const migrada = migrar(v0);
  assert.equal(migrada.version, 1);
  assert.equal(migrada.fps, 30);
});

test("migrar rechaza una versión desconocida con un mensaje legible", () => {
  assert.throws(
    () => migrar({ version: 99, capas: [] }),
    /Versión de composición desconocida: 99/,
  );
});

test("deserializar ORDENA keyframes desordenados (defensa del evaluador)", () => {
  const comp = deserializar(fixtureJson());
  const capas = comp.capas.map((c) =>
    c.id === "placa"
      ? { ...c, pistas: { x: [{ t: 3000, v: 9 }, { t: 0, v: 1 }] } }
      : c,
  );
  const roundtrip = deserializar(serializar({ ...comp, capas }));
  const placa = roundtrip.capas.find((c) => c.id === "placa")!;
  assert.equal(placa.pistas!.x![0].t, 0);
});

test("el fixture de ejemplo es una composición VÁLIDA (control positivo del validador)", () => {
  const problemas = validar(deserializar(fixtureJson()));
  assert.deepEqual(problemas, []);
});

test("validar detecta fps no entero, keyframe fuera de rango e ids duplicados", () => {
  const comp = deserializar(fixtureJson());
  const rota: Composicion = {
    ...comp,
    fps: 29.97,
    capas: [
      ...comp.capas,
      { ...comp.capas[0], nombre: "clon" },
      {
        ...comp.capas[2],
        id: "fuera",
        nombre: "fuera",
        pistas: { x: [{ t: 99999, v: 0 }] },
      },
    ],
  };
  const problemas = validar(rota);
  assert.ok(problemas.some((p) => p.mensaje.includes("fps")), "detecta el fps");
  assert.ok(problemas.some((p) => p.mensaje.includes("dos capas")), "detecta el id duplicado");
  assert.ok(problemas.some((p) => p.mensaje.includes("fuera de la duración")), "detecta el keyframe fuera");
});
