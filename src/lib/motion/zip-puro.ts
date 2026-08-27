/* -----------------------------------------------------------------------------
   ZIP mínimo y puro — para entregar la secuencia PNG en un solo archivo

   Formato ZIP con método STORE (sin compresión: un PNG ya viene comprimido;
   deflatearlo de nuevo quema CPU para ganar nada). Sin dependencias y
   DETERMINISTA: fecha DOS fija, sin campos extra — mismo contenido, mismo
   zip byte a byte (testeable en node).
----------------------------------------------------------------------------- */

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < datos.length; i++) c = TABLA_CRC[(c ^ datos[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type EntradaZip = { nombre: string; datos: Uint8Array };

/** Arma el ZIP entero en memoria. Los nombres tienen que ser ASCII. */
export function crearZip(entradas: EntradaZip[]): Uint8Array {
  const codificador = new TextEncoder();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let offset = 0;

  const u16 = (v: number, destino: DataView, pos: number) => destino.setUint16(pos, v, true);
  const u32 = (v: number, destino: DataView, pos: number) => destino.setUint32(pos, v, true);

  for (const entrada of entradas) {
    const nombre = codificador.encode(entrada.nombre);
    const crc = crc32(entrada.datos);

    const local = new Uint8Array(30 + nombre.length + entrada.datos.length);
    const vl = new DataView(local.buffer);
    u32(0x04034b50, vl, 0); // firma local
    u16(20, vl, 4); // versión mínima
    u16(0, vl, 6); // flags
    u16(0, vl, 8); // método STORE
    u16(0, vl, 10); // hora DOS fija (determinismo)
    u16(0x21, vl, 12); // fecha DOS fija: 1980-01-01
    u32(crc, vl, 14);
    u32(entrada.datos.length, vl, 18); // comprimido = crudo (STORE)
    u32(entrada.datos.length, vl, 22);
    u16(nombre.length, vl, 26);
    u16(0, vl, 28); // sin extra
    local.set(nombre, 30);
    local.set(entrada.datos, 30 + nombre.length);
    locales.push(local);

    const central = new Uint8Array(46 + nombre.length);
    const vc = new DataView(central.buffer);
    u32(0x02014b50, vc, 0); // firma central
    u16(20, vc, 4); // hecha por
    u16(20, vc, 6); // versión mínima
    u16(0, vc, 8);
    u16(0, vc, 10);
    u16(0, vc, 12);
    u16(0x21, vc, 14);
    u32(crc, vc, 16);
    u32(entrada.datos.length, vc, 20);
    u32(entrada.datos.length, vc, 24);
    u16(nombre.length, vc, 28);
    // extra/comentario/disco/attrs internos y externos: todo 0
    u32(offset, vc, 42);
    central.set(nombre, 46);
    centrales.push(central);

    offset += local.length;
  }

  const largoCentral = centrales.reduce((a, c) => a + c.length, 0);
  const fin = new Uint8Array(22);
  const vf = new DataView(fin.buffer);
  u32(0x06054b50, vf, 0); // firma EOCD
  u16(entradas.length, vf, 8);
  u16(entradas.length, vf, 10);
  u32(largoCentral, vf, 12);
  u32(offset, vf, 16);

  const total = offset + largoCentral + fin.length;
  const zip = new Uint8Array(total);
  let pos = 0;
  for (const parte of [...locales, ...centrales, fin]) {
    zip.set(parte, pos);
    pos += parte.length;
  }
  return zip;
}
