import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarGuion, validarGuion } from "@/lib/motion/guion-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";

const base = () => {
  let comp = crearComposicion({ nombre: "guion" });
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "titulo", texto: "HOLA" }).comp;
  return comp;
};

test("validarGuion acepta array o {pasos}, rellena input vacío y rechaza lo que no es un paso", () => {
  const ok = validarGuion([{ herramienta: "definir_entrada", input: { capaId: "titulo", preset: "subir" }, nota: "el título abre" }]);
  assert.ok(Array.isArray(ok) && ok.length === 1 && ok[0].nota === "el título abre");
  const envuelto = validarGuion({ pasos: [{ herramienta: "ver_composicion" }] });
  assert.ok(Array.isArray(envuelto) && envuelto[0].input && Object.keys(envuelto[0].input).length === 0);
  assert.equal(validarGuion({}), "el guion tiene que ser un array de pasos o {pasos: [...]}");
  assert.equal(validarGuion([]), "el guion está vacío");
  assert.equal(validarGuion([{ input: {} }]), "paso 1: falta «herramienta»");
  assert.equal(validarGuion([{ herramienta: "x", input: [1] }]), "paso 1 (x): «input» tiene que ser un objeto");
});

test("aplicarGuion ejecuta en orden con el mismo ejecutor del director, anota errores sin cortar y no toca la original", () => {
  const comp = base();
  const { comp: dirigida, informe, errores } = aplicarGuion(comp, [
    { herramienta: "definir_entrada", input: { capaId: "titulo", preset: "subirDesenfocado", en: 200, duracion: 800, easing: "salidaQuint" }, nota: "protagonista" },
    { herramienta: "definir_entrada", input: { capaId: "no-existe", preset: "subir" } },
    { herramienta: "definir_camara", input: { zoom: [{ t: 0, v: 1 }, { t: 1500, v: 1.2, easing: "entradaSalidaCubic" }] } },
  ]);
  assert.equal(errores, 1);
  assert.equal(informe.length, 3);
  assert.match(informe[0], /^✓ 01 .*\[protagonista\]$/);
  assert.match(informe[1], /^✗ 02 definir_entrada → /);
  assert.match(informe[2], /^✓ 03 /);
  assert.equal(dirigida.capas.find((c) => c.id === "titulo")?.entrada?.preset, "subirDesenfocado");
  assert.equal(dirigida.camara?.pistas.zoom?.length, 2);
  // la original sigue quieta
  assert.equal(comp.capas.find((c) => c.id === "titulo")?.entrada, undefined);
});
