import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { estadoVivo } from "@/lib/motion/motor-gsap";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";

test("cargar: la barra crece de izquierda a derecha recortada a su caja; descargar la vacía; el motor GSAP coincide", () => {
  let comp = crearComposicion({ nombre: "barra" });
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "barra", forma: "rect", x: 500, y: 100, ancho: 400, alto: 40, color: "#a33" }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "barra", preset: "cargar", en: 1000, duracion: 1000, easing: "lineal" }).comp;
  comp = ejecutarHerramienta(comp, "definir_salida", { capaId: "barra", preset: "descargar", en: 4000, duracion: 500, easing: "lineal" }).comp;
  const u = (t: number) => estadoEn(comp, t).capas[0].unidades[0];
  // al arrancar está corrida un ANCHO entero a la izquierda y recortada: vacía
  assert.equal(u(1000).dx, -400);
  assert.equal(u(1000).recorte, true);
  // a la mitad, media barra a la vista
  assert.equal(u(1500).dx, -200);
  // llena y sin recorte al terminar
  assert.equal(u(2000).dx, 0);
  assert.equal(u(2500).recorte, false);
  // la salida la vacía hacia la izquierda
  assert.equal(u(4250).dx, -200);
  assert.equal(u(4250).recorte, true);
  // el motor GSAP da lo mismo
  assert.ok(Math.abs(estadoVivo(comp, 1500).capas[0].unidades[0].dx - -200) < 1e-3);
  // distancia 0.5: arranca por la mitad
  const media = ejecutarHerramienta(comp, "definir_entrada", { capaId: "barra", preset: "cargar", en: 1000, duracion: 1000, easing: "lineal", params: { distancia: 0.5 } }).comp;
  assert.equal(estadoEn(media, 1000).capas[0].unidades[0].dx, -200);
});
