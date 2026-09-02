import { test } from "node:test";
import assert from "node:assert/strict";
import { auditarDireccion, bloqueDeAuditoria, cajaAproximada, cajaVisibleEn } from "@/lib/motion/auditoria-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import type { Composicion } from "@/lib/motion/modelo";

type Entrada = { preset: string; en: number; duracion: number; easing?: string; escalonado?: number };

/** n textos con las entradas dadas (cíclicas), sobre una comp de 10s. */
function piezaCon(entradas: Entrada[], n = entradas.length, division?: string): Composicion {
  let comp = crearComposicion({ nombre: "aud" });
  comp = ejecutarHerramienta(comp, "ajustar_composicion", { duracion: 10000 }).comp;
  for (let i = 0; i < n; i++) {
    const id = `t${i}`;
    comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id, texto: `TEXTO ${i} DE PRUEBA` }).comp;
    if (division) comp = ejecutarHerramienta(comp, "editar_capa", { capaId: id, division }).comp;
    const e = entradas[i % entradas.length];
    comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: id, ...e }).comp;
  }
  return comp;
}

const VARIADA: Entrada[] = [
  { preset: "revelar", en: 200, duracion: 800, easing: "salidaQuint", escalonado: 60 },
  { preset: "subirDesenfocado", en: 700, duracion: 700, easing: "salidaCubic" },
  { preset: "voltear", en: 1500, duracion: 600, easing: "salidaBack" },
  { preset: "trackingAbrir", en: 3200, duracion: 900, easing: "salidaExpo" },
  { preset: "pop", en: 4800, duracion: 500, easing: "salidaSine" },
  { preset: "deslizarIzquierda", en: 6500, duracion: 650, easing: "salidaQuart" },
  { preset: "golpe", en: 8200, duracion: 450, easing: "salidaCirc" },
];

test("una pieza variada, escalonada, con coreografía propia y sin huecos PASA la auditoría", () => {
  let comp = piezaCon(VARIADA);
  comp = ejecutarHerramienta(comp, "definir_pista", {
    capaId: "t0", propiedad: "escala",
    keyframes: [{ t: 2000, v: 1 }, { t: 2300, v: 1.05 }, { t: 2600, v: 1 }],
  }).comp;
  assert.deepEqual(auditarDireccion(comp), []);
  assert.equal(bloqueDeAuditoria([]), "");
});

test("la plantilla fade/escala/pop con un solo easing y una sola duración cae en varias reglas a la vez", () => {
  const comp = piezaCon([{ preset: "aparecer", en: 200, duracion: 500 }, { preset: "escalar", en: 400, duracion: 500 }], 8);
  const h = auditarDireccion(comp);
  const claves = h.map((x) => x.split(":")[0]);
  assert.ok(claves.includes("MONOTONÍA"), `falta MONOTONÍA en ${claves}`);
  assert.ok(claves.includes("PLANTILLA"), `falta PLANTILLA en ${claves}`);
  assert.ok(claves.includes("POCAS FAMILIAS"), `falta POCAS FAMILIAS en ${claves}`);
  assert.ok(claves.includes("EASING ÚNICO"), `falta EASING ÚNICO en ${claves}`);
  assert.ok(claves.includes("DURACIÓN ÚNICA"), `falta DURACIÓN ÚNICA en ${claves}`);
  // todo entra en el primer segundo y queda quieto 9s: tiempo muerto
  assert.ok(claves.includes("TIEMPO MUERTO"), `falta TIEMPO MUERTO en ${claves}`);
  assert.ok(claves.includes("SIN COREOGRAFÍA PROPIA"), `falta SIN COREOGRAFÍA PROPIA en ${claves}`);
  // los números que lo prueban viajan en el texto
  assert.match(h.find((x) => x.startsWith("MONOTONÍA")) ?? "", /4 de 8 entradas \(50%\)/);
  const bloque = bloqueDeAuditoria(h);
  assert.ok(bloque.startsWith("AUDITORÍA DE DIRECCIÓN"));
  assert.equal(bloque.split("\n- ").length - 1, h.length);
});

test("monotonía: un preset que domina más del 45 % se marca; al 45 % justo no", () => {
  // 5 de 11 = 45.45% → marca
  const domina = piezaCon([
    ...Array.from({ length: 5 }, (_, i) => ({ preset: "revelar", en: 200 + i * 900, duracion: 600 + i * 50, easing: i % 2 ? "salidaQuint" : "salidaCubic", escalonado: 40 })),
    { preset: "voltear", en: 4700, duracion: 700, easing: "salidaBack" },
    { preset: "subirDesenfocado", en: 5600, duracion: 800, easing: "salidaExpo" },
    { preset: "trackingAbrir", en: 6500, duracion: 900, easing: "salidaQuart" },
    { preset: "golpe", en: 7400, duracion: 450, easing: "salidaCirc" },
    { preset: "pop", en: 8300, duracion: 550, easing: "salidaSine" },
    { preset: "deslizarDerecha", en: 9200, duracion: 500, easing: "salidaQuad" },
  ]);
  const h = auditarDireccion(domina).filter((x) => x.startsWith("MONOTONÍA"));
  assert.equal(h.length, 1);
  assert.match(h[0], /«revelar» en 5 de 11 entradas \(45%\)/);
});

test("un texto dividido sin escalonado se marca con su nombre; con escalonado no", () => {
  // por herramienta el escalonado se rellena solo (escalonadoSano): la
  // auditoría no marca nada
  const con = piezaCon([{ preset: "revelar", en: 200, duracion: 700, easing: "salidaQuint" }], 1, "palabras");
  assert.deepEqual(auditarDireccion(con).filter((x) => x.startsWith("SIN ESCALONADO")), []);
  // a mano en el editor (o escalonado 0) la división queda muda: se marca
  const sin: Composicion = {
    ...con,
    capas: con.capas.map((c) => (c.id === "t0" && c.entrada ? { ...c, entrada: { ...c.entrada, escalonado: 0 } } : c)),
  };
  const h = auditarDireccion(sin).filter((x) => x.startsWith("SIN ESCALONADO"));
  assert.equal(h.length, 1);
  assert.match(h[0], /«t0» está dividido en palabras/);
});

test("tiempo muerto: un hueco lo tapa una pista, un viaje de cámara o una salida — no un hold ni el temblor", () => {
  // tres entradas al principio, 10s de pieza: hueco de ~8.5s
  const base = () => piezaCon([
    { preset: "revelar", en: 200, duracion: 700, easing: "salidaQuint", escalonado: 40 },
    { preset: "subirDesenfocado", en: 600, duracion: 700, easing: "salidaCubic" },
    { preset: "voltear", en: 900, duracion: 500, easing: "salidaBack" },
  ]);
  const muerto = auditarDireccion(base()).find((x) => x.startsWith("TIEMPO MUERTO"));
  assert.ok(muerto, "debería marcar el hueco");
  assert.match(muerto, /no se mueve nada \(8\.\ds de 10\.0s\)/);

  // un viaje de cámara en el medio parte el hueco en dos de ~4s → aún >2s → sigue marcando pero más corto
  let conCamara = base();
  conCamara = ejecutarHerramienta(conCamara, "definir_camara", {
    zoom: [{ t: 4000, v: 1 }, { t: 6000, v: 1.4, easing: "entradaSalidaCubic" }],
  }).comp;
  const h2 = auditarDireccion(conCamara).find((x) => x.startsWith("TIEMPO MUERTO")) ?? "";
  assert.match(h2, /\(4\.\ds de 10\.0s\)/);

  // y una salida al final + pista en el medio ya no dejan más de 2.5s (25 %) quietos
  let vivo = conCamara;
  vivo = ejecutarHerramienta(vivo, "definir_salida", { capaId: "t0", preset: "ocultar", en: 8200, duracion: 500 }).comp;
  vivo = ejecutarHerramienta(vivo, "definir_pista", {
    capaId: "t1", propiedad: "escala", keyframes: [{ t: 1800, v: 1 }, { t: 2600, v: 1.04 }, { t: 3400, v: 1 }],
  }).comp;
  vivo = ejecutarHerramienta(vivo, "definir_pista", {
    capaId: "t0", propiedad: "rotacion", keyframes: [{ t: 6000, v: 0 }, { t: 7000, v: 2 }, { t: 8200, v: 0 }],
  }).comp;
  assert.deepEqual(auditarDireccion(vivo).filter((x) => x.startsWith("TIEMPO MUERTO")), []);

  // un hold NO cuenta como movimiento
  let hold = base();
  hold = ejecutarHerramienta(hold, "definir_pista", {
    capaId: "t1", propiedad: "escala", keyframes: [{ t: 1500, v: 1, hold: true }, { t: 9500, v: 1 }],
  }).comp;
  assert.ok(auditarDireccion(hold).some((x) => x.startsWith("TIEMPO MUERTO")));
});

test("una pieza chica (título + claim que entran y quedan) NO se reprueba por tiempo muerto ni por variedad", () => {
  const chica = piezaCon([
    { preset: "revelar", en: 200, duracion: 800, easing: "salidaQuint", escalonado: 60 },
    { preset: "aparecer", en: 700, duracion: 500, easing: "salidaSine" },
  ]);
  assert.deepEqual(auditarDireccion(chica), []);
});

test("POCAS FAMILIAS rige desde 5 entradas, como promete el SISTEMA", () => {
  // 5 entradas, 2 familias (texto + máscaras), sin monotonía (2/5 = 40 %)
  const comp = piezaCon([
    { preset: "subir", en: 200, duracion: 700, easing: "salidaQuint" },
    { preset: "revelar", en: 1500, duracion: 800, easing: "salidaCubic", escalonado: 50 },
    { preset: "caer", en: 3500, duracion: 600, easing: "salidaBack" },
    { preset: "aparecer", en: 5500, duracion: 500, easing: "salidaSine" },
    { preset: "deslizarIzquierda", en: 7500, duracion: 650, easing: "salidaExpo" },
  ]);
  const claves = auditarDireccion(comp).map((x) => x.split(":")[0]);
  assert.ok(claves.includes("POCAS FAMILIAS"), `faltó en ${claves}`);
  assert.ok(!claves.includes("MONOTONÍA"));
});

test("nada animado con varias capas es UN hallazgo tajante; una comp vacía o de una capa no dice nada", () => {
  let comp = crearComposicion({ nombre: "quieta" });
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "a", texto: "A" }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "b", texto: "B" }).comp;
  const h = auditarDireccion(comp);
  assert.equal(h.length, 1);
  assert.match(h[0], /^NADA SE MUEVE: 2 capas/);
  assert.deepEqual(auditarDireccion(crearComposicion({ nombre: "vacia" })), []);
});

test("dos pantallas en el lienzo y cámara quieta → CÁMARA QUIETA; con viaje, no", () => {
  let comp = piezaCon(VARIADA);
  // dos placas: formas cuyo grupo es su propio id
  for (const id of ["p1", "p2"]) {
    comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id, forma: "rect", x: id === "p1" ? 0 : 2000, y: 0, ancho: 1440, alto: 900 }).comp;
    comp = { ...comp, capas: comp.capas.map((c) => (c.id === id ? { ...c, grupo: id } : c)) };
  }
  comp = ejecutarHerramienta(comp, "definir_pista", {
    capaId: "t0", propiedad: "escala", keyframes: [{ t: 2000, v: 1 }, { t: 2300, v: 1.05 }, { t: 2600, v: 1 }],
  }).comp;
  assert.ok(auditarDireccion(comp).some((x) => x.startsWith("CÁMARA QUIETA: hay 2 pantallas")));
  const viaja = ejecutarHerramienta(comp, "definir_camara", {
    x: [{ t: 3000, v: 720 }, { t: 4500, v: 2720, easing: "entradaSalidaCubic" }],
  }).comp;
  assert.deepEqual(auditarDireccion(viaja).filter((x) => x.startsWith("CÁMARA QUIETA")), []);
});

test("ENCUADRE CORTA: una capa que termina de entrar a medias del cuadro se marca; entera adentro o entera afuera, no", () => {
  let comp = crearComposicion({ nombre: "enc" });
  // el logo del hero de lemlist: caja x 110–252, y 21–163; cámara zoom 1.7 centrada en (720, 330) ve x 155–1285
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "logo", forma: "rect", x: 181, y: 92, ancho: 142, alto: 142 }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "titulo", texto: "3x", x: 720, y: 300, tamano: 100 }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "abajo", forma: "rect", x: 720, y: 2800, ancho: 400, alto: 100 }).comp;
  comp = ejecutarHerramienta(comp, "definir_camara", { base: { x: 720, y: 330, zoom: 1.7 } }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "logo", preset: "pop", en: 150, duracion: 900 }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 500, duracion: 800 }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "abajo", preset: "subir", en: 600, duracion: 800 }).comp;
  const ve = cajaVisibleEn(comp, 1050);
  assert.ok(Math.abs(ve.x1 - (720 - 1920 / 1.7 / 2)) < 0.01);
  const h = auditarDireccion(comp).filter((x) => x.startsWith("ENCUADRE CORTA"));
  assert.equal(h.length, 1, h.join(" | "));
  assert.match(h[0], /«logo» termina de entrar en 1050ms/);
  assert.match(h[0], /caja x 110–252/);
  // con el centro corrido a x 640 la cámara ve desde x 75: el logo entra entero
  const corregida = ejecutarHerramienta(comp, "definir_camara", { base: { x: 640, y: 330, zoom: 1.7 } }).comp;
  assert.deepEqual(auditarDireccion(corregida).filter((x) => x.startsWith("ENCUADRE CORTA")), []);
});

test("cajaAproximada: trazos y vectores tienen caja (un logo importado suele ser vector)", () => {
  const vector = { tipo: "vector" as const, id: "v", nombre: "logo", x: 181, y: 92, ancho: 142, alto: 142, path: "M0 0 L1 1", color: "#fff" };
  const caja = cajaAproximada(vector as unknown as import("@/lib/motion/modelo").Capa);
  assert.deepEqual(caja, { x1: 110, y1: 21, x2: 252, y2: 163 });
});

test("ENCUADRE DESCENTRADO: centrar en x=960 una pantalla de 1440 y mostrar vacío arriba se marca; x=720 y zoom cerrado, no", () => {
  const conPlaca = (base: { x: number; y: number; zoom: number }) => {
    let comp = crearComposicion({ nombre: "desc" });
    comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "p", forma: "rect", x: 720, y: 1614.5, ancho: 1440, alto: 900 }).comp;
    comp = { ...comp, capas: comp.capas.map((c) => (c.id === "p" && c.tipo === "forma" ? { ...c, nombre: "landing", alto: 3229, grupo: "p" } : c)) };
    comp = ejecutarHerramienta(comp, "definir_camara", { base }).comp;
    return comp;
  };
  // lo que hizo Flash: centro 960 (el render), zoom 1.33 → ve x 238–1682: 242 px de vacío a la derecha; y 330 → 76 px de vacío arriba
  const flash = auditarDireccion(conPlaca({ x: 960, y: 330, zoom: 1.33 })).filter((x) => x.startsWith("ENCUADRE DESCENTRADO"));
  assert.equal(flash.length, 1, flash.join(" | "));
  // a zoom 1.33 el cuadro (1444) es apenas más ancho que la pantalla (1440): tiene que quedar centrada en 720
  assert.match(flash[0], /descentrada en x \(centro de cámara 960, centro de la pantalla 720\)/);
  assert.match(flash[0], /76 px de vacío ARRIBA/);
  assert.match(flash[0], /el centro x tiene que estar 720/);
  // más cerrado (zoom 1.7, cuadro de 1129) y corrido a 960: vacío a la derecha
  const corrido = auditarDireccion(conPlaca({ x: 960, y: 500, zoom: 1.7 })).find((x) => x.startsWith("ENCUADRE DESCENTRADO")) ?? "";
  assert.match(corrido, /vacío a la DERECHA de la pantalla/);
  assert.match(corrido, /el centro x tiene que estar entre 565 y 875/);
  // lo que hizo Fable: centro 720, zoom 1.7 → ve 1129×635 centrado en y 330 (13–648): limpio
  assert.deepEqual(auditarDireccion(conPlaca({ x: 720, y: 330, zoom: 1.7 })).filter((x) => x.startsWith("ENCUADRE DESCENTRADO")), []);
  // pantalla más chica que el cuadro (un teléfono): tiene que quedar centrada
  let tel = crearComposicion({ nombre: "tel" });
  tel = ejecutarHerramienta(tel, "agregar_capa_forma", { id: "t", forma: "rect", x: 195, y: 422, ancho: 390, alto: 844 }).comp;
  tel = { ...tel, capas: tel.capas.map((c) => (c.id === "t" ? { ...c, grupo: "t" } : c)) };
  const descentrado = ejecutarHerramienta(tel, "definir_camara", { base: { x: 400, y: 422, zoom: 1.28 } }).comp;
  assert.match(auditarDireccion(descentrado).find((x) => x.startsWith("ENCUADRE DESCENTRADO")) ?? "", /descentrada en x/);
  const centrado = ejecutarHerramienta(tel, "definir_camara", { base: { x: 195, y: 422, zoom: 1.28 } }).comp;
  assert.deepEqual(auditarDireccion(centrado).filter((x) => x.startsWith("ENCUADRE DESCENTRADO")), []);
});

test("ENCUADRE CORTA ignora los fondos más grandes que el cuadro (un glow no exige encuadre)", () => {
  let comp = crearComposicion({ nombre: "glow" });
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "glow", forma: "elipse", x: 720, y: 500, ancho: 2070, alto: 1548 }).comp;
  comp = ejecutarHerramienta(comp, "definir_camara", { base: { x: 720, y: 330, zoom: 1.7 } }).comp;
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "glow", preset: "aparecer", en: 0, duracion: 1200 }).comp;
  assert.deepEqual(auditarDireccion(comp).filter((x) => x.startsWith("ENCUADRE CORTA")), []);
});
