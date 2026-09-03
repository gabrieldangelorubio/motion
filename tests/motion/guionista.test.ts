import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUION_REFERENCIA,
  MODO_GUION,
  elegirModo,
  mensajeDeCorreccion,
  necesitaCorreccion,
  parsearGuion,
  resumenDeGuion,
  sistemaGuionista,
} from "@/lib/motion/guionista-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";

test("elegirModo: pieza sin dirigir → guion; con una entrada o un viaje de cámara → iterativo", () => {
  let comp = crearComposicion({ nombre: "m" });
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "a", texto: "A" }).comp;
  assert.equal(elegirModo(comp), "guion");
  const animada = ejecutarHerramienta(comp, "definir_entrada", { capaId: "a", preset: "subir" }).comp;
  assert.equal(elegirModo(animada), "iterativo");
  const conCamara = ejecutarHerramienta(comp, "definir_camara", { zoom: [{ t: 0, v: 1 }, { t: 1000, v: 1.2 }] }).comp;
  assert.equal(elegirModo(conCamara), "iterativo");
  // con charla previa NO se reescribe la pieza aunque esté sin animar
  assert.equal(elegirModo(comp, [{ rol: "usuario", texto: "animá" }, { rol: "agente", texto: "listo" }]), "iterativo");
});

test("parsearGuion tolera fences y texto alrededor, valida los pasos y separa el guion", () => {
  const texto = `Acá va el guion:\n\`\`\`json\n{"guion":["LECTURA. x","GUION. y"],"pasos":[{"herramienta":"definir_entrada","input":{"capaId":"a","preset":"subir"},"nota":"n"}]}\n\`\`\`\nlisto.`;
  const r = parsearGuion(texto);
  assert.ok(!("error" in r));
  if (!("error" in r)) {
    assert.deepEqual(r.guion, ["LECTURA. x", "GUION. y"]);
    assert.equal(r.pasos.length, 1);
    assert.equal(r.pasos[0].nota, "n");
  }
  // sólo pasos (la corrección) también vale
  const soloPasos = parsearGuion(`{"pasos":[{"herramienta":"definir_camara","input":{}}]}`);
  assert.ok(!("error" in soloPasos) && soloPasos.guion.length === 0);
  assert.deepEqual(parsearGuion("no hay json"), { error: "la respuesta no trae JSON" });
  assert.match((parsearGuion("{\"pasos\": [") as { error: string }).error, /JSON inválido/);
  assert.equal((parsearGuion('{"pasos":[]}') as { error: string }).error, "el guion está vacío");
});

test("el sistema del guionista suma el modo guion y la referencia al SISTEMA del director", () => {
  const s = sistemaGuionista("BASE");
  assert.ok(s.startsWith("BASE"));
  assert.ok(s.includes(MODO_GUION) && s.includes(GUION_REFERENCIA));
  // la lección del logo cortado viaja con la fórmula del encuadre
  assert.match(GUION_REFERENCIA, /visible = \[cx − ancho\/\(2·zoom\)/);
  assert.match(MODO_GUION, /Respondé ÚNICAMENTE con un JSON/);
});

test("mensajeDeCorreccion lleva los ✗ y la auditoría, y pide solo pasos; necesitaCorreccion decide", () => {
  const msg = mensajeDeCorreccion(["✓ 01 ok", "✗ 02 definir_entrada → capa «x» no existe"], ["MONOTONÍA: …"]);
  assert.ok(msg.includes("✗ 02") && !msg.includes("✓ 01"));
  assert.ok(msg.includes("MONOTONÍA"));
  assert.match(msg, /SOLO con el JSON \{"pasos"/);
  assert.equal(necesitaCorreccion(0, []), false);
  assert.equal(necesitaCorreccion(1, []), true);
  assert.equal(necesitaCorreccion(0, ["x"]), true);
});

test("resumenDeGuion cuenta pasos aplicados, errores y rondas", () => {
  const r = resumenDeGuion(["LECTURA. a", "GUION. b"], ["✓ 01", "✓ 02", "✗ 03"], 1, 2);
  assert.ok(r.startsWith("LECTURA. a\nGUION. b"));
  assert.match(r, /Ejecuté 2 pasos del guion \(1 no se pudieron aplicar\) en 2 rondas\./);
});

test("aplicarGuionExterno: parsea, ejecuta, encuadra automáticamente y audita — sin modelo", async () => {
  const { aplicarGuionExterno } = await import("@/lib/motion/guionista-puro");
  let comp = crearComposicion({ nombre: "ext" });
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "p", forma: "rect", x: 720, y: 450, ancho: 1440, alto: 900 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "p" ? { ...c, grupo: "p" } : c)) };
  comp = ejecutarHerramienta(comp, "agregar_capa_texto", { id: "t", texto: "HOLA", x: 720, y: 300 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "t" ? { ...c, grupo: "p" } : c)) };
  const guion = JSON.stringify({
    guion: ["LECTURA. una pantalla", "GUION. 4 s"],
    pasos: [
      { herramienta: "ajustar_composicion", input: { duracion: 4000 } },
      { herramienta: "definir_camara", input: { base: { x: 960, y: 450, zoom: 1.33 } } },
      { herramienta: "definir_entrada", input: { capaId: "t", preset: "subirDesenfocado", en: 200, duracion: 800, easing: "salidaExpo" } },
      { herramienta: "definir_entrada", input: { capaId: "nope", preset: "subir" } },
    ],
  });
  const res = aplicarGuionExterno(comp, guion);
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  assert.equal(res.errores, 1);
  assert.equal(res.guion.length, 2);
  // el x = 960 se corrigió a 720 por el encuadre automático y quedó anotado
  assert.equal(res.comp.camara?.base?.x, 720);
  assert.ok(res.informe.some((l) => l.includes("encuadre automático")));
  assert.equal(res.comp.capas.find((c) => c.id === "t")?.entrada?.preset, "subirDesenfocado");
  assert.deepEqual(res.auditoria.filter((h) => h.startsWith("ENCUADRE")), []);
  assert.match((aplicarGuionExterno(comp, "esto no es json") as { error: string }).error, /no trae JSON/);
});

test("la segunda referencia (logbook) enseña la cámara viva y el zoom por contenido", () => {
  assert.match(GUION_REFERENCIA, /SEGUNDA REFERENCIA/);
  assert.match(GUION_REFERENCIA, /PUSH-IN lento/);
  assert.match(GUION_REFERENCIA, /zoom_max = alto_render \/ \(alto_contenido × 1\.05\)/);
  assert.match(GUION_REFERENCIA, /NINGUNA CAPA DEL DISEÑO SE QUEDA SIN ENTRADA/);
  assert.match(MODO_GUION, /CAJA DEL CONTENIDO/);
});
