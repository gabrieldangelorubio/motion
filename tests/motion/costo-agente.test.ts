import { test } from "node:test";
import assert from "node:assert/strict";
import { costoUSD, formatearCosto, formatearTokens, precioDeModelo, sumarUso } from "@/lib/motion/costo-agente-puro";

test("precioDeModelo matchea por prefijo más largo y desconocido da null", () => {
  assert.ok(precioDeModelo("claude-opus-5"));
  assert.ok(precioDeModelo("gemini-3.6-flash-latest"), "sufijos de versión matchean por prefijo");
  assert.equal(precioDeModelo("gpt-9"), null);
});

test("costoUSD: la cuenta del director (entrada+salida+cache) da lo que tiene que dar", () => {
  // opus-5: $5/M in, $25/M out, cache read $0.5/M
  const usd = costoUSD("claude-opus-5", { entrada: 1_000_000, salida: 100_000, cacheLectura: 2_000_000 });
  assert.ok(usd !== null && Math.abs(usd - (5 + 2.5 + 1)) < 1e-9, `dio ${usd}`);
  // gemini flash intro: $0.75/M in, $3.75/M out
  const flash = costoUSD("gemini-3.6-flash", { entrada: 200_000, salida: 40_000 });
  assert.ok(flash !== null && Math.abs(flash - (0.15 + 0.15)) < 1e-9, `dio ${flash}`);
  // sin precio → null, jamás un número inventado
  assert.equal(costoUSD("modelo-misterioso", { entrada: 1, salida: 1 }), null);
});

test("sumarUso acumula todos los campos y los formatos son legibles", () => {
  const total = sumarUso({ entrada: 100, salida: 50 }, { entrada: 200, salida: 25, cacheLectura: 1000 });
  assert.deepEqual(total, { entrada: 300, salida: 75, cacheLectura: 1000, cacheEscritura: 0, pensamiento: 0 });
  assert.equal(formatearCosto(0.01234), "$0.012");
  assert.equal(formatearCosto(0.00005), "<$0.0001");
  assert.equal(formatearTokens(1_234_567), "1.2M tokens");
  assert.equal(formatearTokens(45_600), "46k tokens");
});
