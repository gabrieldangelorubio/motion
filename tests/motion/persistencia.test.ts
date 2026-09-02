import { test } from "node:test";
import assert from "node:assert/strict";
import { caminoDeGuardado, TOPE_STRING_ACTION, UMBRAL_SNAPSHOT_RUTA } from "@/lib/motion/persistencia-puro";

test("el snapshot chico va por server action y el grande por ruta, con aire debajo del tope de Flight", () => {
  assert.equal(caminoDeGuardado("x".repeat(1000)), "action");
  assert.equal(caminoDeGuardado("x".repeat(UMBRAL_SNAPSHOT_RUTA)), "action");
  assert.equal(caminoDeGuardado("x".repeat(UMBRAL_SNAPSHOT_RUTA + 1)), "ruta");
  assert.ok(UMBRAL_SNAPSHOT_RUTA < TOPE_STRING_ACTION, "el umbral queda debajo del tope real");
  assert.equal(caminoDeGuardado("x".repeat(34_000_000)), "ruta");
});
