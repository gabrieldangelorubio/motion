import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32, crearZip } from "@/lib/motion/zip-puro";

const bytes = (s: string) => new TextEncoder().encode(s);
const u32en = (zip: Uint8Array, pos: number) =>
  new DataView(zip.buffer, zip.byteOffset).getUint32(pos, true);
const u16en = (zip: Uint8Array, pos: number) =>
  new DataView(zip.buffer, zip.byteOffset).getUint16(pos, true);

test("crc32 da el valor canónico de referencia ('123456789' → 0xCBF43926)", () => {
  assert.equal(crc32(bytes("123456789")), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test("crearZip: firmas locales, directorio central y EOCD con los conteos bien", () => {
  const zip = crearZip([
    { nombre: "frame-00000.png", datos: bytes("aaa") },
    { nombre: "frame-00001.png", datos: bytes("bbbb") },
  ]);
  // primer header local
  assert.equal(u32en(zip, 0), 0x04034b50);
  assert.equal(u16en(zip, 8), 0, "método STORE");
  // EOCD al final: 2 entradas
  const eocd = zip.length - 22;
  assert.equal(u32en(zip, eocd), 0x06054b50);
  assert.equal(u16en(zip, eocd + 8), 2);
  assert.equal(u16en(zip, eocd + 10), 2);
  // el offset del central apunta a una firma central real
  const inicioCentral = u32en(zip, eocd + 16);
  assert.equal(u32en(zip, inicioCentral), 0x02014b50);
  // el contenido crudo está adentro (STORE, sin comprimir)
  const texto = new TextDecoder("latin1").decode(zip);
  assert.ok(texto.includes("aaa"));
  assert.ok(texto.includes("bbbb"));
});

test("crearZip es determinista: mismas entradas, mismos bytes", () => {
  const entradas = [{ nombre: "a.png", datos: bytes("hola") }];
  assert.deepEqual(crearZip(entradas), crearZip(entradas));
});
