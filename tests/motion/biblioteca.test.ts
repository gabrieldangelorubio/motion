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

/* ——— Pares in/out y familias (tanda «templates por categoría») ————— */

test("TODA entrada tiene su salidaPareja válida: cada animación viene con in y out", async () => {
  const { PRESETS } = await import("@/lib/motion/presets-puro");
  for (const [nombre, def] of Object.entries(PRESETS)) {
    if (def.clase !== "entrada") continue;
    assert.ok(def.salidaPareja, `«${nombre}» (entrada) no declara salidaPareja`);
    const salida = PRESETS[def.salidaPareja!];
    assert.ok(salida, `la pareja «${def.salidaPareja}» de «${nombre}» no existe`);
    assert.equal(salida.clase, "salida", `la pareja de «${nombre}» tendría que ser una salida`);
  }
});

test("familiasDePreset: trim → trazo; tracking → texto; el resto vive en texto Y gráfica", async () => {
  const { familiasDePreset } = await import("@/lib/motion/biblioteca-puro");
  assert.deepEqual(familiasDePreset("trazar"), ["trazo"]);
  assert.deepEqual(familiasDePreset("trackingCerrar"), ["texto"]);
  assert.deepEqual(familiasDePreset("revelar"), ["texto", "grafica"]);
  assert.deepEqual(familiasDePreset("pop"), ["texto", "grafica"]);
});

test("paresPorCategoria filtra por familia y arma pares completos", async () => {
  const { paresPorCategoria } = await import("@/lib/motion/biblioteca-puro");
  const { PRESETS } = await import("@/lib/motion/presets-puro");
  const enTexto = paresPorCategoria("texto").flatMap((s) => s.pares);
  const enGrafica = paresPorCategoria("grafica").flatMap((s) => s.pares);
  const enTrazo = paresPorCategoria("trazo").flatMap((s) => s.pares);
  // trazos solo en Trazos; tracking solo en Textos
  assert.ok(!enTexto.some((p) => p.esDeTrazo) && !enGrafica.some((p) => p.esDeTrazo));
  assert.ok(enTrazo.every((p) => p.esDeTrazo));
  assert.ok(enTexto.some((p) => p.entrada === "trackingCerrar"));
  assert.ok(!enGrafica.some((p) => p.entrada === "trackingCerrar"));
  // cada par: entrada de clase entrada, salida de clase salida
  for (const p of [...enTexto, ...enGrafica, ...enTrazo]) {
    if (p.entrada) assert.equal(PRESETS[p.entrada].clase, "entrada");
    if (p.salida) assert.equal(PRESETS[p.salida].clase, "salida");
  }
  // «borrar» no es pareja de nadie: tarjeta solo-out en Trazos
  const borrar = enTrazo.find((p) => p.id === "borrar");
  assert.ok(borrar && !borrar.entrada && borrar.salida === "borrar");
});

test("plantillaDePar en «grafica» demuestra sobre un VECTOR y el motor la evalúa entera", async () => {
  const { paresPorCategoria, plantillaDePar, reposoDePar } = await import("@/lib/motion/biblioteca-puro");
  for (const seccion of paresPorCategoria("grafica")) {
    for (const par of seccion.pares) {
      const plantilla = plantillaDePar(par, "grafica");
      assert.equal(plantilla.capas[0].tipo, "vector", `demo de «${par.id}» tendría que ser vector`);
      assert.deepEqual(validar(plantilla), [], `plantilla de «${par.id}» inválida`);
      for (const t of [0, 500, 1150, 1900, 2599]) estadoEn(plantilla, t);
      // en reposo: quieta y visible
      const estado = estadoEn(plantilla, reposoDePar(par));
      for (const u of estado.capas[0].unidades) {
        assert.ok(u.opacidad > 0.99, `«${par.id}» en reposo tendría que verse`);
        assert.ok(Math.abs(u.dx) < 0.01 && Math.abs(u.dy) < 0.01, `«${par.id}» en reposo tendría que estar quieta`);
      }
    }
  }
});

test("la MÁSCARA (recorte) también se activa en una capa vector: el revelado de gráficas", async () => {
  const plantilla: Parameters<typeof estadoEn>[0] = {
    version: 1,
    nombre: "reveal-vector",
    ancho: 400,
    alto: 300,
    fps: 30,
    duracion: 2000,
    fondo: "#000000",
    capas: [{
      id: "v",
      nombre: "V",
      tipo: "vector",
      path: "M0 0L100 0L100 100L0 100Z",
      ancho: 100,
      alto: 100,
      relleno: "#ff0000",
      x: 200,
      y: 150,
      entrada: { preset: "revelar", en: 0, duracion: 600, easing: "salidaExpo" },
    }],
  };
  const mitad = estadoEn(plantilla, 120).capas[0].unidades[0];
  assert.equal(mitad.recorte, true, "a mitad de la entrada el recorte está activo");
  assert.ok(mitad.dy > 5, "la capa viene subiendo desde abajo de su caja");
  const fin = estadoEn(plantilla, 1500).capas[0].unidades[0];
  assert.equal(fin.recorte, false, "en reposo el recorte se apaga");
  assert.ok(Math.abs(fin.dy) < 0.01);
});
