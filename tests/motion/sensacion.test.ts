import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarSensacion, descripcionSensacion, easingConSensacion, factorDuracion } from "@/lib/motion/sensacion-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import type { Composicion } from "@/lib/motion/modelo";

test("factorDuracion: snappy achica, suave estira, neutro no toca", () => {
  assert.ok(Math.abs(factorDuracion(-1) - 0.7) < 1e-9);
  assert.equal(factorDuracion(0), 1);
  assert.ok(Math.abs(factorDuracion(1) - 1.4) < 1e-9);
  // fuera de rango se clampea
  assert.equal(factorDuracion(-5), factorDuracion(-1));
});

test("easingConSensacion corre DENTRO de la familia y respeta el carácter", () => {
  // snappy total: dos escalones hacia expo
  assert.equal(easingConSensacion("salidaCubic", -1), "salidaQuint");
  assert.equal(easingConSensacion("entradaSalidaQuint", -1), "entradaSalidaExpo");
  // suave total: dos hacia sine (con tope)
  assert.equal(easingConSensacion("salidaCubic", 1), "salidaSine");
  assert.equal(easingConSensacion("salidaQuad", 1), "salidaSine");
  // neutro no toca
  assert.equal(easingConSensacion("salidaCubic", 0), "salidaCubic");
  // los de carácter no se pisan
  assert.equal(easingConSensacion("salidaElastico", -1), "salidaElastico");
  assert.equal(easingConSensacion("salidaBack", 1), "salidaBack");
  assert.equal(easingConSensacion("lineal", -1), "lineal");
});

const armada = (): Composicion => {
  let comp = crearComposicion({ nombre: "sens" });
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "a", texto: "HOLA", division: "palabras" }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", {
    capaId: "a", preset: "subir", en: 500, duracion: 800, easing: "salidaCubic", escalonado: 90,
  }).comp;
  comp = ejecutarHerramienta(comp, "definir_pista", {
    capaId: "a", propiedad: "x", keyframes: [{ t: 0, v: 100 }, { t: 2000, v: 300 }],
  }).comp;
  return comp;
};

test("aplicarSensacion snappy: duración y escalonado bajan, easing sube, el «en» y las pistas quedan", () => {
  const comp = armada();
  const res = aplicarSensacion(comp, -1, 99);
  const capa = res.capas.find((c) => c.id === "a")!;
  assert.equal(capa.entrada?.duracion, 560); // 800 × 0.7
  assert.equal(capa.entrada?.escalonado, 63); // 90 × 0.7
  assert.equal(capa.entrada?.easing, "salidaQuint");
  assert.equal(capa.entrada?.en, 500); // la sincronización es sagrada
  assert.deepEqual(capa.pistas?.x, comp.capas[0].pistas?.x); // coreografía fina intacta
  assert.equal(capa.v, 99); // sellada para el merge
  // la original no se mutó
  assert.equal(comp.capas[0].entrada?.duracion, 800);
});

test("aplicarSensacion neutro devuelve la MISMA composición (identidad barata)", () => {
  const comp = armada();
  assert.equal(aplicarSensacion(comp, 0), comp);
});

test("descripcionSensacion: neutro calla, los extremos hablan el registro", () => {
  assert.equal(descripcionSensacion(0), null);
  assert.equal(descripcionSensacion(0.03), null);
  assert.match(descripcionSensacion(-0.8) ?? "", /SNAPPY/);
  assert.match(descripcionSensacion(0.8) ?? "", /SUAVE/);
  assert.match(descripcionSensacion(0.8) ?? "", /SENSACIÓN de la pieza/);
});
