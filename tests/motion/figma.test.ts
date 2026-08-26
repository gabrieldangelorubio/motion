import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { envolverEnLineas, normalizarFigma, validarImportFigma, type ImportFigma } from "@/lib/motion/figma-puro";
import { validar } from "@/lib/motion/validar-puro";
import type { CapaForma, CapaMedia, CapaTexto } from "@/lib/motion/modelo";

const fixture = (): ImportFigma =>
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "import-figma.json"), "utf8"));

test("validarImportFigma acepta el fixture y rechaza basura", () => {
  assert.ok(validarImportFigma(fixture()));
  assert.ok(!validarImportFigma(null));
  assert.ok(!validarImportFigma({ origen: "sketch", version: 1 }));
});

test("el frame define lienzo, nombre y fondo; el resultado es una composición válida", () => {
  const { composicion } = normalizarFigma(fixture());
  assert.equal(composicion.ancho, 390);
  assert.equal(composicion.alto, 844);
  assert.equal(composicion.fondo, "#f5f2ec");
  assert.equal(composicion.nombre, "Pantalla home");
  assert.deepEqual(validar(composicion), []);
});

test("un texto centrado ancla en el medio de su caja y conserva estilo", () => {
  const { composicion } = normalizarFigma(fixture());
  const titulo = composicion.capas.find((c) => c.nombre === "Titular") as CapaTexto;
  assert.equal(titulo.tipo, "texto");
  assert.equal(titulo.x, 40 + 310 / 2);
  assert.equal(titulo.y, 120 + 34 * 0.8);
  assert.equal(titulo.fuente.peso, 700);
  assert.equal(titulo.color, "#141416");
  assert.match(titulo.fuente.familia, /Inter/);
});

test("un texto alineado a la izquierda ancla en su borde izquierdo", () => {
  const { composicion } = normalizarFigma(fixture());
  const parrafo = composicion.capas.find((c) => c.nombre === "Bajada") as CapaTexto;
  assert.equal(parrafo.alineacion, "izquierda");
  assert.equal(parrafo.x, 40);
});

test("rects y elipses se centran en su caja con color y radio", () => {
  const { composicion } = normalizarFigma(fixture());
  const boton = composicion.capas.find((c) => c.nombre === "Botón CTA") as CapaForma;
  assert.equal(boton.forma, "rectangulo");
  assert.equal(boton.x, 40 + 310 / 2);
  assert.equal(boton.radio, 12);
  const punto = composicion.capas.find((c) => c.nombre === "Punto") as CapaForma;
  assert.equal(punto.forma, "elipse");
});

test("una imagen rasterizada viaja como media con dataUri y su AVISO llega", () => {
  const { composicion, avisos } = normalizarFigma(fixture());
  const hero = composicion.capas.find((c) => c.nombre === "Foto hero") as CapaMedia;
  assert.equal(hero.tipo, "media");
  assert.match(hero.mediaId, /^data:image\/png;base64,/);
  assert.ok(avisos.some((a) => a.includes("Foto hero") && a.includes("rasteriz")));
});

test("el orden de los nodos se conserva como z-order (primero = fondo)", () => {
  const { composicion } = normalizarFigma(fixture());
  assert.deepEqual(
    composicion.capas.map((c) => c.nombre),
    ["Fondo tarjeta", "Foto hero", "Titular", "Bajada", "Botón CTA", "Punto"],
  );
});

test("un tipo desconocido se saltea CON aviso, nunca en silencio", () => {
  const datos = fixture();
  datos.nodos.push({ tipo: "video" as never, nombre: "Raro", x: 0, y: 0, ancho: 10, alto: 10 });
  const { composicion, avisos } = normalizarFigma(datos);
  assert.ok(!composicion.capas.some((c) => c.nombre === "Raro"));
  assert.ok(avisos.some((a) => a.includes("Raro")));
});

test("los ids generados son únicos y estables", () => {
  const { composicion } = normalizarFigma(fixture());
  const ids = composicion.capas.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const otraVez = normalizarFigma(fixture());
  assert.deepEqual(otraVez.composicion.capas.map((c) => c.id), ids);
});

test("un texto con wrap de caja (lineasEstimadas > 1, sin \\n) queda marcado para reajuste en el editor", () => {
  const datos = fixture();
  datos.nodos.push({
    tipo: "texto",
    nombre: "Titular envuelto",
    x: 100, y: 500, ancho: 300, alto: 80,
    texto: {
      contenido: "A PLACE IN COMMON WITH THE",
      familia: "Inter", peso: 800, tamano: 34, lineasEstimadas: 2,
      alineacion: "izquierda", color: "#141416",
    },
  });
  const { composicion, reajustes } = normalizarFigma(datos);
  const capa = composicion.capas.find((c) => c.nombre === "Titular envuelto")!;
  assert.equal(reajustes.length, 1);
  assert.deepEqual(reajustes[0], { capaId: capa.id, anchoCaja: 300, lineas: 2 });
  // un texto que YA trae \n explícito no se reajusta (el quiebre es del usuario)
  const otros = normalizarFigma(fixture());
  assert.equal(otros.reajustes.length, 0);
});

test("envolverEnLineas reconstruye el wrap greedy de la caja", () => {
  const medir = (t: string) => t.length * 10;
  assert.equal(
    envolverEnLineas("A PLACE IN COMMON WITH THE", 170, medir),
    "A PLACE IN COMMON\nWITH THE",
  );
  // cabe entero → una línea; una sola palabra jamás se corta aunque desborde
  assert.equal(envolverEnLineas("corto", 170, medir), "corto");
  assert.equal(envolverEnLineas("PALABRADEMASIADOLARGA sigue", 100, medir), "PALABRADEMASIADOLARGA\nsigue");
});

test("el conteo de líneas de Figma manda: si el ancho de la caja da otro conteo, se busca el que coincide", () => {
  const medir = (t: string) => t.length * 10;
  // con 170 el greedy daría 2 líneas — coincide con el objetivo: igual resultado
  assert.equal(
    envolverEnLineas("A PLACE IN COMMON WITH THE", 170, medir, 2),
    "A PLACE IN COMMON\nWITH THE",
  );
  // la caja «mide» angosta para esta fuente (daría 3 líneas), pero Figma
  // renderizó 2: el conteo gana y quedan 2 líneas balanceadas
  const dosLineas = envolverEnLineas("A PLACE IN COMMON WITH THE", 120, medir, 2);
  assert.equal(dosLineas.split("\n").length, 2);
  // y al revés: la caja daría 1 línea pero Figma vio 2
  const partido = envolverEnLineas("HOLA MUNDO", 999, medir, 2);
  assert.equal(partido, "HOLA\nMUNDO");
  // un objetivo imposible (más líneas que palabras) se acota a las palabras
  assert.equal(envolverEnLineas("HOLA MUNDO", 999, medir, 5).split("\n").length, 2);
});

test("la mezcla viaja del IR a la capa; una desconocida degrada a normal CON aviso", () => {
  const { composicion, avisos } = normalizarFigma(fixture());
  const hero = composicion.capas.find((c) => c.nombre === "Foto hero")!;
  assert.equal(hero.mezcla, "multiply");
  const punto = composicion.capas.find((c) => c.nombre === "Punto")!;
  assert.equal(punto.mezcla, undefined);
  assert.ok(avisos.some((a) => a.includes("Punto") && a.includes("modo-inventado")));
});
