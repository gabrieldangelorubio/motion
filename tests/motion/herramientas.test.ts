import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  crearComposicion,
  agregarCapa,
  quitarCapa,
  editarCapa,
  moverKeyframe,
  describir,
} from "@/lib/motion/herramientas-puro";
import { deserializar } from "@/lib/motion/serializar-puro";
import type { CapaTexto } from "@/lib/motion/modelo";

const fixture = () =>
  deserializar(readFileSync(join(import.meta.dirname, "fixtures", "composicion-ejemplo.json"), "utf8"));

const capaNueva = (id: string): CapaTexto => ({
  id,
  nombre: "Nueva",
  tipo: "texto",
  texto: "hola",
  fuente: { familia: "sans-serif", tamano: 40, peso: 600 },
  color: "#fff",
  division: "ninguna",
  x: 100,
  y: 100,
});

test("las operaciones no MUTAN la composición de entrada", () => {
  const comp = fixture();
  const copia = JSON.stringify(comp);
  agregarCapa(comp, capaNueva("nueva"), 123);
  quitarCapa(comp, "titulo", 123);
  editarCapa(comp, "titulo", { x: 0 }, 123);
  moverKeyframe(comp, "placa", "x", 1000, 1100);
  assert.equal(JSON.stringify(comp), copia);
});

test("agregarCapa estampa v y rechaza un id repetido con error en castellano", () => {
  const comp = fixture();
  const ok = agregarCapa(comp, capaNueva("nueva"), 555);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.valor.capas.at(-1)!.v, 555);

  const repetida = agregarCapa(comp, capaNueva("titulo"));
  assert.ok(!repetida.ok);
  if (!repetida.ok) assert.match(repetida.error, /Ya hay una capa/);
});

test("quitarCapa deja LÁPIDA en borrados (sin eso el merge la resucita)", () => {
  const comp = fixture();
  const res = quitarCapa(comp, "bajada", 999);
  assert.ok(res.ok);
  if (res.ok) {
    assert.ok(!res.valor.capas.some((c) => c.id === "bajada"));
    assert.ok(res.valor.borrados!.some((b) => b.id === "bajada" && b.v === 999));
  }
});

test("moverKeyframe mueve, reordena y valida el destino", () => {
  const comp = fixture();
  const ok = moverKeyframe(comp, "placa", "x", 1000, 3200);
  assert.ok(ok.ok);
  if (ok.ok) {
    const pista = ok.valor.capas.find((c) => c.id === "placa")!.pistas!.x!;
    assert.deepEqual(pista.map((k) => k.t), [3000, 3200, 3500, 4200]);
  }
  const fuera = moverKeyframe(comp, "placa", "x", 1000, 99999);
  assert.ok(!fuera.ok);
  const sinPista = moverKeyframe(comp, "titulo", "rotacion", 0, 10);
  assert.ok(!sinPista.ok);
});

test("crearComposicion da defaults sanos y describir cuenta lo que hay", () => {
  const comp = crearComposicion({ nombre: "demo" });
  assert.equal(comp.fps, 30);
  const texto = describir(fixture());
  assert.match(texto, /4 capas/);
  assert.match(texto, /entrada subir @600ms/);
  assert.match(texto, /Presets de entrada:/);
});
