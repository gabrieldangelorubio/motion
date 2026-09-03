import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogoDeModelos, esModeloDelCatalogo, etiquetaDeModelo, proveedorDe } from "@/lib/motion/modelos-director-puro";

test("el catálogo sale de las claves cargadas, con el default del entorno primero", () => {
  const todo = catalogoDeModelos({ ANTHROPIC_API_KEY: "a", GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o" });
  assert.deepEqual(todo.modelos.map((m) => m.id), ["gemini-3.8-flash", "claude-opus-5", "claude-sonnet-5", "moonshotai/kimi-k3"]);
  assert.equal(todo.defecto, "gemini-3.8-flash");
  // con MOTION_AGENTE_MODELO=kimi, Kimi va primero y es el default
  const kimi = catalogoDeModelos({ GEMINI_API_KEY: "g", OPENROUTER_API_KEY: "o", MOTION_AGENTE_MODELO: "moonshotai/kimi-k3" });
  assert.equal(kimi.defecto, "moonshotai/kimi-k3");
  assert.deepEqual(kimi.modelos.map((m) => m.id), ["moonshotai/kimi-k3", "gemini-3.8-flash"]);
  // sin clave de un proveedor, sus modelos no aparecen — salvo el default, que se muestra igual
  const soloGemini = catalogoDeModelos({ GEMINI_API_KEY: "g" });
  assert.deepEqual(soloGemini.modelos.map((m) => m.id), ["gemini-3.8-flash"]);
  const nada = catalogoDeModelos({});
  assert.deepEqual(nada.modelos.map((m) => m.id), ["claude-opus-5"]);
  // un modelo raro del entorno entra con nombre derivado
  const raro = catalogoDeModelos({ OPENROUTER_API_KEY: "o", MOTION_AGENTE_MODELO: "moonshotai/kimi-k2-thinking" });
  assert.equal(raro.modelos[0].nombre, "Kimi K2 Thinking");
  assert.equal(raro.modelos[0].proveedor, "openrouter");
  assert.ok(esModeloDelCatalogo(todo, "claude-sonnet-5"));
  assert.ok(!esModeloDelCatalogo(todo, "gpt-9"));
  assert.ok(!esModeloDelCatalogo(todo, 42));
});

test("etiquetas y proveedores", () => {
  assert.equal(etiquetaDeModelo("gemini-3.8-flash"), "Gemini 3.8 Flash");
  assert.equal(etiquetaDeModelo("moonshotai/kimi-k3"), "Kimi K3");
  assert.equal(etiquetaDeModelo("claude-opus-5"), "Claude Opus 5");
  assert.equal(proveedorDe("moonshotai/kimi-k3"), "openrouter");
  assert.equal(proveedorDe("gemini-3.8-flash"), "gemini");
  assert.equal(proveedorDe("claude-opus-5"), "anthropic");
});
