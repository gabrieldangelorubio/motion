import { test } from "node:test";
import assert from "node:assert/strict";
import { fusionarComposiciones } from "@/lib/motion/fusionar-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import type { CapaForma, Composicion } from "@/lib/motion/modelo";

const capa = (id: string, v: number, x = 0): CapaForma => ({
  id, nombre: id, tipo: "forma", forma: "rectangulo", ancho: 10, alto: 10,
  color: "#33333c", x, y: 0, v,
});

const base = (capas: CapaForma[], borrados: { id: string; v: number }[] = []): Composicion => ({
  ...crearComposicion({ nombre: "m" }),
  capas,
  borrados,
});

test("por capa gana el v más alto", () => {
  const servidor = base([capa("a", 100, 1), capa("b", 300, 2)]);
  const entrante = base([capa("a", 200, 9), capa("b", 250, 9)]);
  const fusion = fusionarComposiciones(servidor, entrante);
  assert.equal(fusion.capas.find((c) => c.id === "a")!.x, 9);
  assert.equal(fusion.capas.find((c) => c.id === "b")!.x, 2);
});

test("una capa que sólo existe de un lado sobrevive (nadie la borró)", () => {
  const fusion = fusionarComposiciones(
    base([capa("a", 100), capa("nueva-servidor", 150)]),
    base([capa("a", 100), capa("nueva-cliente", 160)]),
  );
  assert.deepEqual(fusion.capas.map((c) => c.id).sort(), ["a", "nueva-cliente", "nueva-servidor"]);
});

test("la LÁPIDA mata a la capa aunque el otro lado la siga mandando", () => {
  const servidor = base([capa("a", 100), capa("b", 100)], [{ id: "c", v: 500 }]);
  const entrante = base([capa("a", 100), capa("c", 400)]); // c editada ANTES del borrado
  const fusion = fusionarComposiciones(servidor, entrante);
  assert.ok(!fusion.capas.some((x) => x.id === "c"), "c fue borrada con v=500 > 400");
  assert.ok(fusion.borrados!.some((b) => b.id === "c"));
});

test("una edición POSTERIOR a la lápida resucita la capa (gana el v más alto)", () => {
  const servidor = base([], [{ id: "c", v: 500 }]);
  const entrante = base([capa("c", 600, 7)]);
  const fusion = fusionarComposiciones(servidor, entrante);
  assert.equal(fusion.capas.find((x) => x.id === "c")?.x, 7);
});

test("fusionar es idempotente (fusionar dos veces no cambia nada)", () => {
  const servidor = base([capa("a", 100, 1)], [{ id: "z", v: 50 }]);
  const entrante = base([capa("a", 200, 2), capa("b", 90)]);
  const una = fusionarComposiciones(servidor, entrante);
  const dos = fusionarComposiciones(una, una);
  assert.deepEqual(dos, una);
});
