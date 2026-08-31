import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  crearComposicion,
  agregarCapa,
  quitarCapa,
  editarCapa,
  moverKeyframe,
  describir,
} from "@/lib/motion/herramientas-puro";
import { deserializar } from "@/lib/motion/serializar-puro";
import type { CapaTexto } from "@/lib/motion/modelo";

const fixture = () =>
  deserializar(readFileSync(join(import.meta.dirname, "fixtures", "composicion-ejemplo.json"), "utf8"));

const capaNueva = (id: string): CapaTexto => ({
  id,
  nombre: "Nueva",
  tipo: "texto",
  texto: "hola",
  fuente: { familia: "sans-serif", tamano: 40, peso: 600 },
  color: "#fff",
  division: "ninguna",
  x: 100,
  y: 100,
});

test("las operaciones no MUTAN la composición de entrada", () => {
  const comp = fixture();
  const copia = JSON.stringify(comp);
  agregarCapa(comp, capaNueva("nueva"), 123);
  quitarCapa(comp, "titulo", 123);
  editarCapa(comp, "titulo", { x: 0 }, 123);
  moverKeyframe(comp, "placa", "x", 1000, 1100);
  assert.equal(JSON.stringify(comp), copia);
});

test("agregarCapa estampa v y rechaza un id repetido con error en castellano", () => {
  const comp = fixture();
  const ok = agregarCapa(comp, capaNueva("nueva"), 555);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.valor.capas.at(-1)!.v, 555);

  const repetida = agregarCapa(comp, capaNueva("titulo"));
  assert.ok(!repetida.ok);
  if (!repetida.ok) assert.match(repetida.error, /Ya hay una capa/);
});

test("quitarCapa deja LÁPIDA en borrados (sin eso el merge la resucita)", () => {
  const comp = fixture();
  const res = quitarCapa(comp, "bajada", 999);
  assert.ok(res.ok);
  if (res.ok) {
    assert.ok(!res.valor.capas.some((c) => c.id === "bajada"));
    assert.ok(res.valor.borrados!.some((b) => b.id === "bajada" && b.v === 999));
  }
});

test("moverKeyframe mueve, reordena y valida el destino", () => {
  const comp = fixture();
  const ok = moverKeyframe(comp, "placa", "x", 1000, 3200);
  assert.ok(ok.ok);
  if (ok.ok) {
    const pista = ok.valor.capas.find((c) => c.id === "placa")!.pistas!.x!;
    assert.deepEqual(pista.map((k) => k.t), [3000, 3200, 3500, 4200]);
  }
  const fuera = moverKeyframe(comp, "placa", "x", 1000, 99999);
  assert.ok(!fuera.ok);
  const sinPista = moverKeyframe(comp, "titulo", "rotacion", 0, 10);
  assert.ok(!sinPista.ok);
});

test("crearComposicion da defaults sanos y describir cuenta lo que hay", () => {
  const comp = crearComposicion({ nombre: "demo" });
  assert.equal(comp.fps, 30);
  const texto = describir(fixture());
  assert.match(texto, /4 capas/);
  assert.match(texto, /entrada subir @600ms/);
  assert.match(texto, /Presets de entrada:/);
  // el ID de cada capa A LA VISTA: sin esto el director lo adivinaba por
  // el nombre y quemaba un paso en el ERROR de id inexistente
  assert.match(texto, /«[^»]+» \(id: [a-z0-9-]+\) en \(/i);
});

test("desplazarTiempoCapas corre EN BLOQUE spans y keyframes de las capas elegidas", async () => {
  const { crearComposicion, agregarCapa, desplazarTiempoCapas } = await import("@/lib/motion/herramientas-puro");
  let comp = crearComposicion({ nombre: "bloque" });
  const capa = (id: string) => ({
    id, nombre: id, tipo: "forma" as const, forma: "rectangulo" as const,
    ancho: 10, alto: 10, color: "#fff", x: 0, y: 0,
    entrada: { preset: "aparecer", en: 200, duracion: 400 },
    salida: { preset: "desvanecer", en: 3000, duracion: 400 },
    pistas: { x: [{ t: 500, v: 0 }, { t: 1500, v: 100 }] },
  });
  comp = (agregarCapa(comp, capa("a")) as { ok: true; valor: typeof comp }).valor;
  comp = (agregarCapa(comp, capa("b")) as { ok: true; valor: typeof comp }).valor;

  const corrida = desplazarTiempoCapas(comp, ["a"], 300);
  const a = corrida.capas.find((c) => c.id === "a")!;
  const b = corrida.capas.find((c) => c.id === "b")!;
  assert.equal(a.entrada!.en, 500);
  assert.equal(a.salida!.en, 3300);
  assert.deepEqual(a.pistas!.x!.map((k) => k.t), [800, 1800]);
  assert.equal(b.entrada!.en, 200, "la capa NO elegida queda intacta");

  // hacia atrás clampea: nada queda antes de 0 (el mínimo era 200)
  const alTope = desplazarTiempoCapas(comp, ["a", "b"], -1000);
  assert.equal(alTope.capas[0].entrada!.en, 0);
  assert.equal(alTope.capas[1].entrada!.en, 0);
  assert.deepEqual(alTope.capas[0].pistas!.x!.map((k) => k.t), [300, 1300]);

  // dt 0 o sin animación: la misma composición
  assert.equal(desplazarTiempoCapas(comp, ["a"], 0), comp);
});

test("escenas: la nueva hereda el formato, la duplicada es documento nuevo, y el rango de export clampea", async () => {
  const { escenaNueva, escenaDuplicada, idDeEscena, problemaDeFormatos, rangoDeExport } = await import("@/lib/motion/escenas-puro");
  const { crearComposicion } = await import("@/lib/motion/herramientas-puro");
  const base = { ...crearComposicion({ nombre: "Escena 1" }), rev: 7 };

  const nueva = escenaNueva(base, "Escena 2");
  assert.equal(nueva.ancho, base.ancho);
  assert.equal(nueva.fps, base.fps);
  assert.equal(nueva.fondo, base.fondo);
  assert.equal(nueva.capas.length, 0);
  assert.equal(nueva.rev, undefined);

  const dup = escenaDuplicada(base, "Escena 3");
  assert.equal(dup.nombre, "Escena 3");
  assert.equal(dup.rev, undefined, "documento nuevo: sin la rev de la original");

  assert.equal(idDeEscena("demo", 1), "demo");
  assert.equal(idDeEscena("demo", 3), "demo@e3");

  assert.equal(problemaDeFormatos([base, nueva]), null);
  assert.match(problemaDeFormatos([base, { ...nueva, ancho: 720 }]) ?? "", /otro formato/);

  assert.deepEqual(rangoDeExport(5000, 30), { desde: 0, frames: 150 });
  assert.deepEqual(rangoDeExport(5000, 30, 1000, 3000), { desde: 1000, frames: 60 });
  assert.deepEqual(rangoDeExport(5000, 30, -50, 99999), { desde: 0, frames: 150 });
  assert.equal(rangoDeExport(5000, 30, 4999, 4999).frames, 1, "nunca menos de un frame");
});

test("desplazarEnZ corre la selección un escalón, compacta, y respeta el piso de video", async () => {
  const { desplazarEnZ, crearComposicion } = await import("@/lib/motion/herramientas-puro");
  const video = (id: string): import("@/lib/motion/modelo").CapaVideo => ({
    id,
    nombre: "Ref",
    tipo: "video",
    videoId: "v1",
    ancho: 1920,
    alto: 1080,
    ajuste: "cubrir",
    referencia: true,
    x: 0,
    y: 0,
  });
  const compDe = (ids: string[], conVideo = false) => ({
    ...crearComposicion({ nombre: "z" }),
    capas: [...(conVideo ? [video("ref")] : []), ...ids.map(capaNueva)] as import("@/lib/motion/modelo").Capa[],
  });
  const orden = (c: { capas: { id: string }[] }) => c.capas.map((k) => k.id).join(",");

  // +1 acerca al frente (más adelante en el array); −1 manda al fondo
  assert.equal(orden(desplazarEnZ(compDe(["a", "b", "c"]), ["b"], 1)), "a,c,b");
  assert.equal(orden(desplazarEnZ(compDe(["a", "b", "c"]), ["b"], -1)), "b,a,c");

  // en el tope o en el fondo: MISMA referencia (el caller no registra undo)
  const tope = compDe(["a", "b"]);
  assert.equal(desplazarEnZ(tope, ["b"], 1), tope);
  assert.equal(desplazarEnZ(tope, ["a"], -1), tope);
  assert.equal(desplazarEnZ(tope, [], 1), tope);
  assert.equal(desplazarEnZ(tope, ["no-existe"], 1), tope);

  // selección salteada: se compacta en bloque conservando el orden interno
  assert.equal(orden(desplazarEnZ(compDe(["a", "b", "c", "d"]), ["a", "c"], 1)), "b,a,c,d");
  assert.equal(orden(desplazarEnZ(compDe(["a", "b", "c", "d"]), ["b", "d"], -1)), "b,d,a,c");

  // el video de referencia es PISO: nada baja debajo de él, y él nunca se mueve
  const conRef = compDe(["a", "b"], true);
  assert.equal(desplazarEnZ(conRef, ["a"], -1), conRef, "a ya está apoyada sobre el video");
  assert.equal(orden(desplazarEnZ(conRef, ["b"], -1)), "ref,b,a");
  assert.equal(orden(desplazarEnZ(conRef, ["ref", "a"], 1)), "ref,b,a", "el video no entra al bloque");

  // estado ya roto (un video fuera de lugar): nada NUEVO baja debajo de un
  // video, y el clamp jamás mueve contra el gesto
  const roto = {
    ...crearComposicion({ nombre: "z" }),
    capas: [video("v1"), capaNueva("a"), video("v2"), capaNueva("b")] as import("@/lib/motion/modelo").Capa[],
  };
  assert.equal(desplazarEnZ(roto, ["b"], -1), roto, "b no se mete debajo de v2");
  assert.equal(desplazarEnZ(roto, ["a"], -1), roto, "a no sube por un clamp de bajada");
});

test("filasDeCapas: un subgrupo partido en rachas da filas con id único", async () => {
  const { filasDeCapas } = await import("@/lib/motion/herramientas-puro");
  const con = (id: string, subgrupo?: string) => ({ ...capaNueva(id), subgrupo });
  const filas = filasDeCapas([con("s1", "logo"), con("suelta"), con("s2", "logo")]);
  assert.deepEqual(
    filas.map((f) => (f.tipo === "grupo" ? f.id : f.capa.id)),
    ["logo", "suelta", "logo·2"],
  );
  // la racha contigua sigue colapsando en UNA fila
  const juntas = filasDeCapas([con("s1", "logo"), con("s2", "logo")]);
  assert.equal(juntas.length, 1);
});
