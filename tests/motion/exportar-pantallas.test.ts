import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escenasPorPantalla,
  manifiestoPantallas,
  medidaPar,
  nombreDeCarpeta,
} from "@/lib/motion/exportar-pantallas-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import { estadoVivo } from "@/lib/motion/motor-gsap";
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
import type { Composicion } from "@/lib/motion/modelo";

/** Lienzo con dos pantallas: «Hero» de 1440×900 en (0,0) y «Pricing» de
    1440×1200 a la derecha, cada una con su placa y un texto adentro, más un
    texto suelto sin grupo y una cámara que viaja de una a otra. */
function lienzoDeDos(): Composicion {
  let comp = crearComposicion({ nombre: "Landing" });
  comp = ejecutarHerramienta(comp, "ajustar_composicion", { duracion: 4000 }).comp;
  const placa = (id: string, nombre: string, x: number, ancho: number, alto: number) => {
    comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id, forma: "rect", x: x + ancho / 2, y: alto / 2, ancho, alto, color: "#101020" }).comp;
    comp = { ...comp, capas: comp.capas.map((c) => (c.id === id ? { ...c, nombre, grupo: id } : c)) };
  };
  placa("hero", "Hero Section", 0, 1440, 900);
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "titulo", texto: "3x your reply", x: 720, y: 400 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "titulo" ? { ...c, grupo: "hero" } : c)) };
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 200, duracion: 600 }).comp;
  placa("pricing", "Pricing / Planes", 1640, 1440, 1201);
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "precio", texto: "$49", x: 2360, y: 600 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "precio" ? { ...c, grupo: "pricing" } : c)) };
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "suelto", texto: "nota", x: 100, y: 2000 }).comp;
  comp = ejecutarHerramienta(comp, "definir_camara", {
    base: { x: 720, y: 450, zoom: 1.33 },
    x: [{ t: 1000, v: 720 }, { t: 2500, v: 2360, easing: "entradaSalidaCubic" }],
  }).comp;
  return comp;
}

function contextoFalso() {
  const llamadas: string[] = [];
  const registrar = (nombre: string) => (...args: unknown[]) => {
    llamadas.push(`${nombre}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : String(a))).join(",")})`);
    if (nombre === "measureText") return { width: 10 * String(args[0]).length };
    return undefined;
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(objetivo, prop: string) {
      if (prop in objetivo) return objetivo[prop];
      return registrar(prop);
    },
    set(objetivo, prop: string, valor) {
      llamadas.push(`set ${prop}=${String(valor)}`);
      objetivo[prop] = valor;
      return true;
    },
  });
  return { ctx: ctx as unknown as Contexto2D, llamadas };
}

test("una escena por placa, en orden, con formato = placa (par), cámara fija centrada y sólo sus capas", () => {
  const comp = lienzoDeDos();
  const escenas = escenasPorPantalla(comp);
  assert.equal(escenas.length, 2);
  const [hero, pricing] = escenas;
  assert.equal(hero.pantallaId, "hero");
  assert.equal(hero.carpeta, "01-hero-section");
  assert.equal(pricing.carpeta, "02-pricing-planes");
  // formato de la placa, redondeado a par (1201 → 1202)
  assert.deepEqual([hero.comp.ancho, hero.comp.alto], [1440, 900]);
  assert.deepEqual([pricing.comp.ancho, pricing.comp.alto], [1440, 1202]);
  // caja en el lienzo (esquina) y cámara quieta en el centro de la placa
  assert.deepEqual(hero.caja, { x: 0, y: 0, ancho: 1440, alto: 900 });
  assert.deepEqual(pricing.caja, { x: 1640, y: 0, ancho: 1440, alto: 1201 });
  assert.deepEqual(hero.comp.camara, { base: { x: 720, y: 450, zoom: 1 }, pistas: {} });
  assert.deepEqual(pricing.comp.camara?.base, { x: 2360, y: 600.5, zoom: 1 });
  // sólo las capas de esa pantalla, sin la placa (alfa) y sin la suelta
  assert.deepEqual(hero.comp.capas.map((c) => c.id), ["titulo"]);
  assert.deepEqual(pricing.comp.capas.map((c) => c.id), ["precio"]);
  assert.equal(hero.comp.fondo, "");
  // la animación viaja intacta
  assert.equal(hero.comp.capas[0].entrada?.preset, "subir");
  // la original no se toca
  assert.equal(comp.capas.length, 5);
  assert.equal(comp.camara?.pistas.x?.length, 2);
});

test("conPlaca incluye el rect de la placa como primera capa (la pantalla con su color)", () => {
  const [hero] = escenasPorPantalla(lienzoDeDos(), { conPlaca: true });
  assert.deepEqual(hero.comp.capas.map((c) => c.id), ["hero", "titulo"]);
});

test("sin placas no hay escenas; una placa oculta no sale", () => {
  assert.deepEqual(escenasPorPantalla(crearComposicion({ nombre: "vacia" })), []);
  const comp = lienzoDeDos();
  const conOculta = { ...comp, capas: comp.capas.map((c) => (c.id === "pricing" ? { ...c, oculta: true } : c)) };
  assert.deepEqual(escenasPorPantalla(conOculta).map((e) => e.pantallaId), ["hero"]);
});

test("pintar la escena de una pantalla lleva el título de coordenadas de lienzo a coordenadas de la placa", () => {
  const comp = lienzoDeDos();
  const [, pricing] = escenasPorPantalla(comp);
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoVivo(pricing.comp, 3900), ctx);
  // cámara activa: centro del render (720, 601) → escala 1 → -centro de la placa (2360, 600.5)
  assert.ok(llamadas.includes("translate(720.000,601.000)"), llamadas.slice(0, 8).join(" | "));
  assert.ok(llamadas.includes("scale(1.000,1.000)"));
  assert.ok(llamadas.includes("translate(-2360.000,-600.500)"));
  // y después el texto en su posición de lienzo: la suma cae dentro del PNG
  assert.ok(llamadas.includes("translate(2360.000,600.000)"));
  // sin fondo: ningún fillRect del lienzo entero
  assert.ok(!llamadas.some((l) => l.startsWith("fillRect(0.000,0.000,1440.000")));
});

test("medidaPar y nombreDeCarpeta: pares, ASCII, acotados", () => {
  assert.equal(medidaPar(1201), 1202);
  assert.equal(medidaPar(1440), 1440);
  assert.equal(medidaPar(0.4), 2);
  assert.equal(nombreDeCarpeta(0, "Hero — Sección «AI» / v2"), "01-hero-seccion-ai-v2");
  assert.equal(nombreDeCarpeta(11, "   "), "12-pantalla");
  assert.equal(nombreDeCarpeta(0, "Pantalla home (fondo)"), "01-pantalla-home");
  assert.ok(nombreDeCarpeta(2, "x".repeat(100)).length <= 43);
});

test("el manifiesto lista carpetas, cajas de lienzo y la cámara maestra con sus keyframes", () => {
  const comp = lienzoDeDos();
  const escenas = escenasPorPantalla(comp);
  const json = JSON.parse(manifiestoPantallas(comp, escenas, { desdeMs: 0, frames: 120 }));
  assert.equal(json.proyecto, "Landing");
  assert.deepEqual(json.render, { ancho: comp.ancho, alto: comp.alto, fps: comp.fps });
  assert.deepEqual(json.secuencia, { desdeMs: 0, frames: 120, nombre: "frame-#####.png" });
  assert.equal(json.pantallas.length, 2);
  assert.deepEqual(json.pantallas[1].lienzo, { x: 1640, y: 0, ancho: 1440, alto: 1201 });
  assert.deepEqual(json.pantallas[1].png, { ancho: 1440, alto: 1202 });
  assert.deepEqual(json.camaraMaestra.base, { x: 720, y: 450, zoom: 1.33 });
  assert.equal(json.camaraMaestra.keyframes.x.length, 2);
  assert.equal(json.camaraMaestra.keyframes.x[1].easing, "entradaSalidaCubic");
  assert.deepEqual(json.camaraMaestra.keyframes.zoom, []);
});
