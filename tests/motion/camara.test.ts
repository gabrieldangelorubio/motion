import { test } from "node:test";
import assert from "node:assert/strict";
import {
  camaraConZoom,
  pantallaAMundo,
  camaraQueEncuadra,
  interpretarWheel,
  factorDePinch,
  esRuedaDiscreta,
  PAN_MAX,
  MIN_ESCALA,
  MAX_ESCALA,
} from "@/lib/motion/camara-puro";

test("el zoom es AL CURSOR: el punto de mundo bajo el mouse no se mueve", () => {
  const cam = { x: 100, y: 50, escala: 1 };
  const rect = { left: 0, top: 0, width: 1000, height: 800 };
  const antes = pantallaAMundo(400, 300, rect, cam);
  const conZoom = camaraConZoom(cam, 1.377, 400, 300);
  const despues = pantallaAMundo(400, 300, rect, conZoom);
  assert.ok(Math.abs(antes.x - despues.x) < 1e-9);
  assert.ok(Math.abs(antes.y - despues.y) < 1e-9);
});

test("la escala se clampea a [MIN, MAX]", () => {
  const cam = { x: 0, y: 0, escala: 1 };
  assert.equal(camaraConZoom(cam, 1000, 0, 0).escala, MAX_ESCALA);
  assert.equal(camaraConZoom(cam, 0.0001, 0, 0).escala, MIN_ESCALA);
});

test("interpretarWheel normaliza deltaMode y acota a PAN_MAX", () => {
  assert.equal(interpretarWheel({ deltaX: 0, deltaY: 100, deltaMode: 1 }).dy, PAN_MAX);
  assert.equal(interpretarWheel({ deltaX: 0, deltaY: 10, deltaMode: 1 }).dy, 160);
  assert.equal(interpretarWheel({ deltaX: -9999, deltaY: 0, deltaMode: 0 }).dx, -PAN_MAX);
});

test("rueda discreta vs trackpad se distingue por magnitud", () => {
  assert.ok(esRuedaDiscreta(120));
  assert.ok(!esRuedaDiscreta(8));
});

test("el pinch acota el delta antes del exponente (sin teletransportes)", () => {
  assert.ok(Math.abs(factorDePinch(100000) - factorDePinch(12)) < 1e-12);
});

test("camaraQueEncuadra centra el bbox y lo hace entrar con margen", () => {
  const cam = camaraQueEncuadra(
    { x: 0, y: 0, w: 1920, h: 1080 },
    { left: 0, top: 0, width: 1000, height: 800 },
    { margen: 100 },
  );
  const anchoPintado = 1920 * cam.escala;
  assert.ok(anchoPintado <= 800 + 1e-9, "entra con el margen a los costados");
  // centrado: lo que sobra se reparte simétrico
  const margenIzq = cam.x;
  const margenDer = 1000 - (cam.x + anchoPintado);
  assert.ok(Math.abs(margenIzq - margenDer) < 1e-9);
});
