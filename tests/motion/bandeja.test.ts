import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOPE_CARACTERES,
  TOPE_ENTRADAS,
  cabeEnBandeja,
  crearBandeja,
  dejarEnBandeja,
  describirPeso,
  listarBandeja,
  pareceExportDelPlugin,
  tomarDeBandeja,
} from "@/lib/motion/bandeja-puro";

const EXPORT = { origen: "figma", version: 1, plugin: 22, frame: { nombre: "logbook.so", ancho: 1440, alto: 6752 }, nodos: [] };

test("pareceExportDelPlugin: acepta un frame o un lote y rechaza lo demás con motivo", () => {
  assert.deepEqual(pareceExportDelPlugin(EXPORT), { ok: true, nombre: "logbook.so" });
  assert.deepEqual(pareceExportDelPlugin({ origen: "figma", pantallas: [EXPORT, EXPORT] }), { ok: true, nombre: "2 pantallas" });
  assert.equal(pareceExportDelPlugin({ guion: [], pasos: [] }).ok, false);
  assert.match((pareceExportDelPlugin("hola") as { error: string }).error, /no es un objeto/);
  assert.match((pareceExportDelPlugin({ origen: "figma" }) as { error: string }).error, /no trae nodos/);
  assert.match((pareceExportDelPlugin({ origen: "figma", pantallas: [] }) as { error: string }).error, /no trae pantallas/);
});

test("dejar, listar y tomar: la más nueva primero, tomar la saca, un id desconocido da null", () => {
  let b = crearBandeja();
  const a = dejarEnBandeja(b, JSON.stringify(EXPORT), "logbook.so", 1000, "cli", "uno");
  b = a.bandeja;
  b = dejarEnBandeja(b, "{}", "botón", 2000, "use_figma", "dos").bandeja;
  assert.deepEqual(listarBandeja(b).map((e) => [e.id, e.nombre, e.origen]), [["dos", "botón", "use_figma"], ["uno", "logbook.so", "cli"]]);
  assert.equal(a.entrada.caracteres, JSON.stringify(EXPORT).length);
  const tomada = tomarDeBandeja(b, "uno");
  assert.ok(tomada);
  assert.equal(tomada!.contenido, JSON.stringify(EXPORT));
  assert.deepEqual(listarBandeja(tomada!.bandeja).map((e) => e.id), ["dos"]);
  assert.equal(tomarDeBandeja(tomada!.bandeja, "uno"), null);
  // la bandeja anterior no se mutó
  assert.equal(listarBandeja(b).length, 2);
});

test("topes: más de TOPE_ENTRADAS tira la más vieja; el mismo id se reemplaza", () => {
  let b = crearBandeja();
  for (let i = 0; i < TOPE_ENTRADAS + 3; i++) b = dejarEnBandeja(b, "{}", `p${i}`, i, undefined, `id${i}`).bandeja;
  const ids = listarBandeja(b).map((e) => e.id);
  assert.equal(ids.length, TOPE_ENTRADAS);
  assert.equal(ids[0], `id${TOPE_ENTRADAS + 2}`);
  assert.ok(!ids.includes("id0"));
  b = dejarEnBandeja(b, '{"v":2}', "otra", 999, undefined, `id${TOPE_ENTRADAS + 2}`).bandeja;
  assert.equal(listarBandeja(b).filter((e) => e.id === `id${TOPE_ENTRADAS + 2}`).length, 1);
  assert.equal(tomarDeBandeja(b, `id${TOPE_ENTRADAS + 2}`)!.contenido, '{"v":2}');
});

test("describirPeso: B, KB y MB con coma", () => {
  assert.equal(describirPeso(512), "512 B");
  assert.equal(describirPeso(45_571), "46 KB");
  assert.equal(describirPeso(12_569_085), "12,6 MB");
});

test("tope de peso: una entrada sola más grande que la bandeja se rechaza; el id automático nunca pisa otra", () => {
  const b = crearBandeja();
  assert.ok(!cabeEnBandeja(TOPE_CARACTERES + 1));
  assert.ok(cabeEnBandeja(TOPE_CARACTERES));
  assert.throws(() => dejarEnBandeja(b, "x".repeat(TOPE_CARACTERES + 1), "gigante", 1), /tope de la bandeja/);
  // dos entradas en el mismo milisegundo, sin id dado: ids distintos, las dos quedan
  let c = dejarEnBandeja(b, "{}", "a", 5).bandeja;
  c = dejarEnBandeja(c, "{}", "b", 5).bandeja;
  assert.equal(listarBandeja(c).length, 2);
  assert.notEqual(listarBandeja(c)[0].id, listarBandeja(c)[1].id);
  // el peso total también evicta lo viejo cuando hay más de una
  let d = dejarEnBandeja(crearBandeja(), "x".repeat(TOPE_CARACTERES - 10), "casi", 1, undefined, "casi").bandeja;
  d = dejarEnBandeja(d, "x".repeat(100), "nueva", 2, undefined, "nueva").bandeja;
  assert.deepEqual(listarBandeja(d).map((e) => e.id), ["nueva"]);
});
