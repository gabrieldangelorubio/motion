import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALTO_TRAMO_LECTURA,
  ANCHO_MAX_LECTURA,
  MAX_IMAGENES_LECTURA,
  contextoDeLectura,
  planDeLectura,
  sinAnimacion,
} from "@/lib/motion/lectura-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import { armarPrimerUsuario } from "@/lib/motion/agente";
import type { Composicion } from "@/lib/motion/modelo";

function conPantallas(altoLanding: number): Composicion {
  let comp = crearComposicion({ nombre: "Lemlist" });
  const placa = (id: string, nombre: string, x: number, ancho: number, alto: number) => {
    comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id, forma: "rect", x: x + ancho / 2, y: alto / 2, ancho, alto, color: "#05060f" }).comp;
    // la herramienta clampea el alto al doble del render: una landing de
    // 9000 px entra por el import, no por la herramienta — se fija a mano
    comp = { ...comp, capas: comp.capas.map((c) => (c.id === id && c.tipo === "forma" ? { ...c, nombre, grupo: id, alto, y: alto / 2 } : c)) };
  };
  placa("tel", "Teléfono", 0, 390, 844);
  placa("landing", "lemlist.com/ai (fondo)", 600, 1440, altoLanding);
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "h1", texto: "3x your reply", x: 1320, y: 300 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "h1" ? { ...c, grupo: "landing" } : c)) };
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "h1", preset: "subirDesenfocado", en: 200, duracion: 800 }).comp;
  comp = ejecutarHerramienta(comp, "definir_pista", { capaId: "h1", propiedad: "escala", keyframes: [{ t: 0, v: 1 }, { t: 1000, v: 1.1 }] }).comp;
  comp = ejecutarHerramienta(comp, "definir_camara", { temblor: { preset: "flotar" } }).comp;
  return comp;
}

test("sinAnimacion deja el diseño en reposo: sin entradas, salidas, pistas ni temblor; no toca la original", () => {
  const comp = conPantallas(900);
  const quieta = sinAnimacion(comp);
  const h1 = quieta.capas.find((c) => c.id === "h1");
  assert.ok(h1 && !h1.entrada && !h1.pistas, "el título queda quieto");
  assert.equal(quieta.camara?.temblor, undefined);
  assert.ok(comp.capas.find((c) => c.id === "h1")?.entrada, "la original conserva su animación");
  assert.ok(comp.camara?.temblor);
});

test("planDeLectura: una imagen por pantalla, escalada al ancho máximo, y la página larga en tramos", () => {
  const plan = planDeLectura(conPantallas(9000));
  const tel = plan.filter((t) => t.pantallaId === "tel");
  const landing = plan.filter((t) => t.pantallaId === "landing");
  assert.equal(tel.length, 1);
  assert.equal(tel[0].escala, 1, "390 de ancho no se agranda");
  assert.deepEqual([tel[0].yDesde, tel[0].yHasta], [0, 844]);
  // 1440 → 1024: escala 0.711; tramo = 2048/0.711 ≈ 2880 px de pantalla; 9000/2880 → 4 tramos
  assert.ok(Math.abs(landing[0].escala - ANCHO_MAX_LECTURA / 1440) < 1e-9);
  assert.equal(landing[0].total, 4);
  assert.equal(landing.length, 4, "los 4 tramos entran en el tope de 6");
  assert.equal(landing[0].yDesde, 0);
  assert.equal(landing[3].yHasta, 9000);
  for (const t of landing) assert.ok((t.yHasta - t.yDesde) * t.escala <= ALTO_TRAMO_LECTURA + 1);
  // las escenas llevan la placa (fondo) y el diseño quieto
  assert.ok(landing[0].comp.capas.some((c) => c.id === "landing"));
  assert.ok(!landing[0].comp.capas.find((c) => c.id === "h1")?.entrada);
});

test("planDeLectura recorta al tope de imágenes y el contexto avisa qué tramos no viajaron", () => {
  const plan = planDeLectura(conPantallas(30000));
  assert.equal(plan.length, MAX_IMAGENES_LECTURA);
  const ctx = contextoDeLectura(plan);
  assert.match(ctx, /imagen 1: pantalla «Teléfono» \(pantallaId tel\), caja en el lienzo \(0, 0\)–\(390, 844\)/);
  assert.match(ctx, /imágenes 2-6: pantalla «lemlist.com\/ai \(fondo\)» \(pantallaId landing\)/);
  assert.match(ctx, /página larga en 11 tramos verticales/);
  assert.match(ctx, /los últimos 6 tramos no viajaron/);
  assert.match(ctx, /imagen 2 = y 0–2880 de la pantalla/);
});

test("contextoDeLectura conecta imagen ↔ pantallaId y separa las imágenes de referencia; sin tramos, vacío", () => {
  const plan = planDeLectura(conPantallas(900));
  const ctx = contextoDeLectura(plan, 8);
  assert.ok(ctx.startsWith("PANTALLAS ADJUNTAS"));
  assert.match(ctx, /imagen 2: pantalla «lemlist.com\/ai \(fondo\)» \(pantallaId landing\), caja en el lienzo \(600, 0\)–\(2040, 900\), 1440×900\./);
  assert.match(ctx, /Las 8 imágenes que siguen NO son el diseño: son la REFERENCIA ADJUNTA/);
  assert.match(ctx, /GUION/);
  assert.equal(contextoDeLectura([]), "");
  assert.deepEqual(planDeLectura(crearComposicion({ nombre: "sin placas" })), []);
});

test("el primer mensaje al director lleva la LECTURA antes del pedido, después del estado", () => {
  const comp = conPantallas(900);
  const lectura = contextoDeLectura(planDeLectura(comp));
  const msg = armarPrimerUsuario(comp, "animá el hero", undefined, undefined, undefined, lectura);
  const iEstado = msg.indexOf("Estado actual");
  const iLectura = msg.indexOf("PANTALLAS ADJUNTAS");
  const iPedido = msg.indexOf("Pedido: animá el hero");
  assert.ok(iEstado >= 0 && iLectura > iEstado && iPedido > iLectura, `orden: ${iEstado} ${iLectura} ${iPedido}`);
  assert.ok(!armarPrimerUsuario(comp, "x").includes("PANTALLAS ADJUNTAS"));
});
