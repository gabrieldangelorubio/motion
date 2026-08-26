import { test } from "node:test";
import assert from "node:assert/strict";
import { ejecutarHerramienta, DEFINICIONES_HERRAMIENTAS } from "@/lib/motion/agente-herramientas";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import type { CapaTexto, Composicion } from "@/lib/motion/modelo";

const base = (): Composicion => crearComposicion({ nombre: "prueba" });

const conTitulo = (): Composicion => {
  const res = ejecutarHerramienta(base(), "agregar_capa_texto", {
    id: "titulo",
    texto: "HOLA",
    division: "caracteres",
    tamano: 120,
  });
  return res.comp;
};

test("agregar_capa_texto crea la capa con defaults sanos y estado en el resultado", () => {
  const res = ejecutarHerramienta(base(), "agregar_capa_texto", { texto: "HOLA" });
  assert.ok(!res.esError);
  assert.equal(res.comp.capas.length, 1);
  assert.match(res.resultado, /Estado actual/);
  assert.ok(res.resumen);
});

test("los números del modelo se CLAMPEAN (tamaño 99999 no rompe nada)", () => {
  const res = ejecutarHerramienta(base(), "agregar_capa_texto", { texto: "x", tamano: 99999, peso: 5000, x: -99999 });
  const capa = res.comp.capas[0] as CapaTexto;
  assert.equal(capa.fuente.tamano, 600);
  assert.equal(capa.fuente.peso, 900);
  assert.equal(capa.x, -1920);
});

test("definir_entrada valida el preset y clampea el timing a la composición", () => {
  const comp = conTitulo();
  const malo = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "inventado", en: 0, duracion: 500 });
  assert.ok(malo.esError);
  assert.match(malo.resultado, /no existe/);

  const bueno = ejecutarHerramienta(comp, "definir_entrada", {
    capaId: "titulo", preset: "subir", en: 999999, duracion: 800, easing: "salidaExpo", escalonado: 40, ordenEscalonado: "centro",
  });
  assert.ok(!bueno.esError);
  const capa = bueno.comp.capas[0];
  assert.equal(capa.entrada!.en, comp.duracion);
  assert.equal(capa.entrada!.escalonado, 40);
});

test("un capaId inexistente devuelve error legible CON los ids disponibles", () => {
  const res = ejecutarHerramienta(conTitulo(), "editar_capa", { capaId: "fantasma", x: 0 });
  assert.ok(res.esError);
  assert.match(res.resultado, /titulo/);
  assert.equal(res.comp.capas[0].x, 960, "la composición no cambió");
});

test("definir_pista ordena keyframes desordenados y clampea t a la duración", () => {
  const res = ejecutarHerramienta(conTitulo(), "definir_pista", {
    capaId: "titulo",
    propiedad: "x",
    keyframes: [{ t: 99999, v: 1500 }, { t: 0, v: 400, easing: "entradaSalidaCubic" }],
  });
  assert.ok(!res.esError);
  const pista = res.comp.capas[0].pistas!.x!;
  assert.equal(pista[0].t, 0);
  assert.equal(pista[1].t, 5000);
});

test("una op que deja invariantes rotos devuelve AVISOS (verificación semántica)", () => {
  const comp = conTitulo();
  // duración achicada por debajo de una entrada existente → aviso de validar()
  const con = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 4000, duracion: 900 });
  const achicada = ejecutarHerramienta(con.comp, "ajustar_composicion", { duracion: 1000 });
  assert.match(achicada.resultado, /AVISOS/);
});

test("reordenar_capas exige la lista completa y aplica el z-order", () => {
  let comp = conTitulo();
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "placa", forma: "rectangulo" }).comp;
  const invalido = ejecutarHerramienta(comp, "reordenar_capas", { orden: ["placa"] });
  assert.ok(invalido.esError);
  const valido = ejecutarHerramienta(comp, "reordenar_capas", { orden: ["placa", "titulo"] });
  assert.deepEqual(valido.comp.capas.map((c) => c.id), ["placa", "titulo"]);
});

test("quitar_segmento y quitar_capa funcionan y el resto queda intacto", () => {
  let comp = conTitulo();
  comp = ejecutarHerramienta(comp, "definir_entrada", { capaId: "titulo", preset: "subir", en: 0, duracion: 500 }).comp;
  const sinEntrada = ejecutarHerramienta(comp, "quitar_segmento", { capaId: "titulo", cual: "entrada" });
  assert.equal(sinEntrada.comp.capas[0].entrada, undefined);
  const sinCapa = ejecutarHerramienta(comp, "quitar_capa", { capaId: "titulo" });
  assert.equal(sinCapa.comp.capas.length, 0);
  assert.ok(sinCapa.comp.borrados!.some((b) => b.id === "titulo"), "queda la lápida");
});

test("una herramienta desconocida falla legible, nunca lanza", () => {
  const res = ejecutarHerramienta(base(), "hacer_magia", {});
  assert.ok(res.esError);
});

test("toda definición de herramienta tiene ejecutor (los nombres están sincronizados)", () => {
  const comp = conTitulo();
  for (const def of DEFINICIONES_HERRAMIENTAS) {
    const res = ejecutarHerramienta(comp, def.name, {});
    assert.ok(
      !res.resultado.includes("herramienta desconocida"),
      `«${def.name}» está definida para el modelo pero no tiene ejecutor`,
    );
  }
});
