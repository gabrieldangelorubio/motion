import { test } from "node:test";
import assert from "node:assert/strict";
import { arbolDeCapas, carpetasDe, contarCapas, idsDelArbol, padreDe } from "@/lib/motion/arbol-capas-puro";
import { describir } from "@/lib/motion/herramientas-puro";
import { normalizarFigma, type ImportFigma } from "@/lib/motion/figma-puro";
import type { Capa } from "@/lib/motion/modelo";

const forma = (id: string, ruta?: string, extra: Partial<Capa> = {}): Capa =>
  ({ id, nombre: id, tipo: "forma", forma: "rectangulo", ancho: 10, alto: 10, color: "#000", x: 0, y: 0, ruta, ...extra }) as Capa;

test("arbolDeCapas arma carpetas anidadas en el orden dado y parte las rachas", () => {
  const capas = [
    forma("fondo", "card"),
    forma("icono", "card / info"),
    forma("titulo", "card / info"),
    forma("suelta"),
    forma("tarde", "card / info"),
  ];
  const arbol = arbolDeCapas(capas);
  assert.equal(arbol.length, 3);
  const card = arbol[0];
  assert.ok(card.tipo === "carpeta" && card.nombre === "card" && card.id === "card");
  if (card.tipo !== "carpeta") return;
  assert.deepEqual(idsDelArbol(card), ["fondo", "icono", "titulo"]);
  const info = card.hijos[1];
  assert.ok(info.tipo === "carpeta" && info.ruta === "card / info" && contarCapas(info) === 2);
  assert.ok(arbol[1].tipo === "capa" && arbol[1].capa.id === "suelta");
  // la segunda racha de «card / info» es otro nodo con id distinto
  const otra = arbol[2];
  assert.ok(otra.tipo === "carpeta" && otra.id === "card·2");
  if (otra.tipo !== "carpeta") return;
  const info2 = otra.hijos[0];
  assert.ok(info2.tipo === "carpeta" && info2.id === "card / info·2");
  assert.deepEqual(idsDelArbol(otra), ["tarde"]);
});

test("sin ruta vale el subgrupo como carpeta de un nivel; padreDe da el padre inmediato", () => {
  const vieja = forma("l", undefined, { subgrupo: "p:LOGO", subgrupoNombre: "LOGO" });
  assert.deepEqual(carpetasDe(vieja), ["LOGO"]);
  assert.equal(padreDe(vieja), "LOGO");
  assert.equal(padreDe(forma("x", "a / b / c")), "c");
  assert.equal(padreDe(forma("y")), null);
  const arbol = arbolDeCapas([vieja]);
  assert.ok(arbol[0].tipo === "carpeta" && arbol[0].nombre === "LOGO");
});

test("la ruta de Figma llega a la capa y el estado del director nombra el padre inmediato", () => {
  const datos: ImportFigma = {
    origen: "figma",
    version: 1,
    frame: { nombre: "f", ancho: 400, alto: 400, fondo: "#000" },
    nodos: [
      { tipo: "rect", nombre: "fondo tarjeta", x: 0, y: 0, ancho: 100, alto: 100, forma: { color: "#111" }, ruta: "sección / tarjeta" },
      { tipo: "texto", nombre: "Título", x: 10, y: 10, ancho: 80, alto: 20, ruta: "sección / tarjeta / info", texto: { contenido: "Hola", familia: "Inter", peso: 700, tamano: 16, alineacion: "izquierda", color: "#fff" } },
    ],
  };
  const { composicion } = normalizarFigma(datos);
  assert.equal(composicion.capas[0].ruta, "sección / tarjeta");
  assert.equal(composicion.capas[1].ruta, "sección / tarjeta / info");
  const estado = describir(composicion);
  assert.match(estado, /«Título» \(id: [^)]+\) dentro de «info»/);
});
