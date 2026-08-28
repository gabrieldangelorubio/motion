import { test } from "node:test";
import assert from "node:assert/strict";
import { esAprobado, mensajeDeRevision, tiemposDeRevision } from "@/lib/motion/revision-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import type { Composicion } from "@/lib/motion/modelo";

const conCapas = (): Composicion => {
  let comp = crearComposicion({ nombre: "rev" });
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "a", texto: "UNO" }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "b", texto: "DOS" }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "a", preset: "subir", en: 200, duracion: 600 }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "b", preset: "subir", en: 900, duracion: 500 }).comp;
  comp = ejecutarHerramienta(comp, "definir_salida", { capaId: "a", preset: "bajarSalida", en: 3600, duracion: 400 }).comp;
  return comp;
};

test("tiemposDeRevision: dentro de la composición, ordenados, deduplicados y acotados", () => {
  const comp = conCapas();
  const tiempos = tiemposDeRevision(comp);
  assert.ok(tiempos.length >= 2 && tiempos.length <= 4, `dio ${tiempos.length}`);
  for (const t of tiempos) assert.ok(t >= 0 && t <= comp.duracion);
  for (let i = 1; i < tiempos.length; i++) assert.ok(tiempos[i] > tiempos[i - 1] + 150);
  // el final de la entrada de «a» (200+600+80) está mirado (±150 por dedupe)
  assert.ok(tiempos.some((t) => Math.abs(t - 880) <= 150), `no mira la entrada asentada: ${tiempos.join(",")}`);
});

test("tiemposDeRevision sin capas animadas igual mira el medio y el casi-final", () => {
  const comp = crearComposicion({ nombre: "vacia" });
  const tiempos = tiemposDeRevision(comp);
  assert.ok(tiempos.length >= 1);
  assert.ok(tiempos.some((t) => Math.abs(t - comp.duracion / 2) <= 150));
});

test("mensajeDeRevision nombra los tiempos y el protocolo APROBADO / Corregí:", () => {
  const msg = mensajeDeRevision([880, 2500]);
  assert.match(msg, /880ms/);
  assert.match(msg, /2500ms/);
  assert.match(msg, /APROBADO/);
  assert.match(msg, /Corregí:/);
  assert.match(msg, /REVISIÓN VISUAL AUTOMÁTICA/);
});

test("esAprobado reconoce el visto bueno y no confunde correcciones", () => {
  assert.ok(esAprobado("APROBADO"));
  assert.ok(esAprobado("  Aprobado.  "));
  assert.ok(esAprobado("«APROBADO»"));
  assert.ok(!esAprobado("Corregí: el título desbordaba el encuadre"));
  assert.ok(!esAprobado("No apruebo: falta la salida"));
  assert.ok(!esAprobado(""));
});
