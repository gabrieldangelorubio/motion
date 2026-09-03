import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MARGEN_SEGURO,
  cajaSegura,
  correccionSegura,
  describirMargenSeguro,
  desbordeSeguro,
  dibujarMargenesSeguros,
  guiasSeguras,
  totalDesborde,
  type ContextoGuias,
} from "@/lib/motion/margenes-puro";

// el cuadro de un render 1920×1080 a zoom 1.6 centrado en (720, 900):
// ve 1200×675, x 120–1320, y 562.5–1237.5
const VE = { x1: 120, y1: 562.5, x2: 1320, y2: 1237.5 };

test("la zona segura mete el cuadro un 5 % (acción) o un 10 % (título) por lado", () => {
  assert.deepEqual(cajaSegura(VE, MARGEN_SEGURO.accion), { x1: 180, y1: 596.25, x2: 1260, y2: 1203.75 });
  const titulo = cajaSegura(VE, MARGEN_SEGURO.titulo);
  assert.deepEqual(titulo, { x1: 240, y1: 630, x2: 1200, y2: 1170 });
  assert.equal(describirMargenSeguro(VE), "zona segura x 180–1260, y 596–1204");
});

test("desborde por lado: adentro es 0; pegado al borde mide cuánto le falta hasta la zona", () => {
  assert.deepEqual(desbordeSeguro({ x1: 300, y1: 700, x2: 900, y2: 1000 }, VE), { izq: 0, der: 0, arr: 0, aba: 0 });
  // un chip a 20 px del borde derecho e inferior (la zona empieza a 60 / 33.75)
  const d = desbordeSeguro({ x1: 1100, y1: 1100, x2: 1300, y2: 1217.5 }, VE);
  assert.equal(d.izq, 0);
  assert.equal(d.arr, 0);
  assert.equal(d.der, 40);
  assert.equal(d.aba, 13.75);
  assert.equal(totalDesborde(d), 53.75);
});

test("la corrección propone el zoom que entra con el centro actual y el centro que entra con el zoom actual", () => {
  const chip = { x1: 1100, y1: 1100, x2: 1300, y2: 1217.5 };
  const fix = correccionSegura(chip, VE, 1.6);
  // centro (720, 900): el punto más lejano en x está a 580 → (1920/z/2)·0.9 ≥ 580 → z ≤ 1.49
  assert.equal(fix.zoom, 1.49);
  // con el zoom actual entra corriendo el centro 40 px a la derecha y 13.75 abajo
  assert.deepEqual(fix.centro, { x: 760, y: 913.8 });
  // una capa que ya está adentro conserva el zoom
  assert.equal(correccionSegura({ x1: 300, y1: 700, x2: 900, y2: 1000 }, VE, 1.6).zoom, 1.6);
  // una capa más ancha que la zona no entra centrada: solo el zoom la salva
  const ancha = { x1: 130, y1: 700, x2: 1310, y2: 800 };
  const f2 = correccionSegura(ancha, VE, 1.6);
  assert.equal(f2.centro, null);
  assert.ok(f2.zoom < 1.6);
});

test("las guías: dos rectángulos concéntricos y seis marcas (cuatro de centro de lado, la cruz)", () => {
  const g = guiasSeguras({ x: 0, y: 0, ancho: 1920, alto: 1080 });
  assert.deepEqual(g.accion, { x: 96, y: 54, ancho: 1728, alto: 972 });
  assert.deepEqual(g.titulo, { x: 192, y: 108, ancho: 1536, alto: 864 });
  assert.equal(g.marcas.length, 6);
  // la marca de arriba nace en el borde superior de la zona de título, centrada en x
  assert.equal(g.marcas[0].x, 960);
  assert.equal(g.marcas[0].y, 108);
  // dibujar: dos rectángulos por zona (halo + línea) y dos fillRect por marca
  const llamadas: string[] = [];
  const ctx: ContextoGuias = {
    save: () => llamadas.push("save"),
    restore: () => llamadas.push("restore"),
    beginPath: () => {},
    rect: () => llamadas.push("rect"),
    stroke: () => {},
    fillRect: () => llamadas.push("fill"),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
    globalAlpha: 1,
  };
  dibujarMargenesSeguros(ctx, { x: 0, y: 0, ancho: 1920, alto: 1080 }, 0.5);
  assert.equal(llamadas.filter((l) => l === "rect").length, 4);
  assert.equal(llamadas.filter((l) => l === "fill").length, 12);
  assert.equal(llamadas[0], "save");
  assert.equal(llamadas[llamadas.length - 1], "restore");
});
