import { test } from "node:test";
import assert from "node:assert/strict";
import { efectosDeBiblioteca, plantillaDeEfecto, reposoDeEfecto } from "@/lib/motion/biblioteca-puro";
import { PRESETS } from "@/lib/motion/presets-puro";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { validar } from "@/lib/motion/validar-puro";

test("la biblioteca cubre TODOS los presets, con su clase y si es de trazo", () => {
  const efectos = efectosDeBiblioteca();
  assert.deepEqual(efectos.map((e) => e.nombre).sort(), Object.keys(PRESETS).sort());
  const porNombre = new Map(efectos.map((e) => [e.nombre, e]));
  assert.equal(porNombre.get("trazar")?.esDeTrazo, true);
  assert.equal(porNombre.get("borrar")?.esDeTrazo, true);
  assert.equal(porNombre.get("revelar")?.esDeTrazo, false);
  assert.equal(porNombre.get("subir")?.clase, "entrada");
  assert.equal(porNombre.get("hundir")?.clase, "salida");
});

test("cada efecto tiene una plantilla VÁLIDA que el motor evalúa sin romper", () => {
  for (const efecto of efectosDeBiblioteca()) {
    const plantilla = plantillaDeEfecto(efecto.nombre);
    assert.deepEqual(validar(plantilla), [], `plantilla de «${efecto.nombre}» inválida`);
    // el motor la evalúa en varios instantes del bucle sin explotar
    for (const t of [0, 400, 900, 1400, 1899]) {
      const estado = estadoEn(plantilla, t);
      assert.equal(estado.capas.length, 1);
    }
    // la capa de demo coincide con la naturaleza del efecto
    assert.equal(plantilla.capas[0].tipo, efecto.esDeTrazo ? "trazo" : "texto");
    if (plantilla.capas[0].tipo === "trazo") {
      assert.ok(plantilla.capas[0].largo > 0, "el trazo de demo tiene largo medible sin DOM");
    }
    // el segmento es de la clase del preset
    assert.equal(plantilla.capas[0][efecto.clase]?.preset, efecto.nombre);
  }
});

test("en el instante de reposo la plantilla está quieta y visible (la carta sin hover)", () => {
  for (const efecto of efectosDeBiblioteca()) {
    const plantilla = plantillaDeEfecto(efecto.nombre);
    const estado = estadoEn(plantilla, reposoDeEfecto(efecto.clase));
    for (const u of estado.capas[0].unidades) {
      assert.ok(u.opacidad > 0.99, `«${efecto.nombre}» en reposo tendría que verse (opacidad ${u.opacidad})`);
      assert.ok(Math.abs(u.dx) < 0.01 && Math.abs(u.dy) < 0.01, `«${efecto.nombre}» en reposo tendría que estar quieta`);
    }
  }
});
