import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capasPorLinea,
  cajaMascara,
  esRecorte,
  instantesMedicion,
  mascaraTexto,
  sinRecorte,
  soloRecorte,
  tieneRecorteAE,
  ventanasMascara,
} from "@/lib/motion/revelado-ae-puro";
import { animadorDeSegmento } from "@/lib/motion/animadores-ae-puro";
import { generarScriptAE } from "@/lib/motion/exportar-ae-puro";
import { delaysEscalonado } from "@/lib/motion/keyframes-puro";
import type { CapaForma, CapaTexto, CapaTrazo, CapaVector, Composicion } from "@/lib/motion/modelo";

const comp = (capas: Composicion["capas"]): Composicion => ({
  version: 1, nombre: "Rev", ancho: 1920, alto: 1080, fps: 30, duracion: 4000, fondo: "#101015", capas,
});

const texto = (extra: Partial<CapaTexto> = {}): CapaTexto => ({
  id: "t", nombre: "Titulo", tipo: "texto", texto: "HOLA", x: 960, y: 540,
  fuente: { familia: "Arial", tamano: 60, peso: 700 }, color: "#fff",
  division: "ninguna", alineacion: "centro", ...extra,
});

const forma = (extra: Partial<CapaForma> = {}): CapaForma => ({
  id: "f", nombre: "Placa", tipo: "forma", forma: "rectangulo", x: 400, y: 300,
  ancho: 200, alto: 100, color: "#fff", ...extra,
});

/* ——— ventanas de la mask (la ventana del motor) ————————————————— */

test("ventanasMascara: la entrada recorta hasta que su ULTIMA unidad terminó, la salida desde que arranca", () => {
  const capa = texto({
    texto: "AB CD",
    division: "caracteres",
    entrada: { preset: "revelar", en: 200, duracion: 600, escalonado: 40 },
    salida: { preset: "ocultar", en: 3000, duracion: 400 },
  });
  // 4 caracteres sin espacios: fin = 200 + 40×3 + 600 = 920
  assert.deepEqual(ventanasMascara(capa), [
    { t: 0, caja: true },
    { t: 920, caja: false },
    { t: 3000, caja: true },
  ]);
});

test("ventanasMascara: solo entrada, solo salida, ventanas solapadas y sin recorte", () => {
  const entrada = texto({ entrada: { preset: "revelar", en: 0, duracion: 500 } });
  assert.deepEqual(ventanasMascara(entrada), [{ t: 0, caja: true }, { t: 500, caja: false }]);

  const salida = texto({ salida: { preset: "ocultarSubir", en: 2000, duracion: 300 } });
  assert.deepEqual(ventanasMascara(salida), [{ t: 0, caja: false }, { t: 2000, caja: true }]);

  // la entrada termina DESPUÉS de que la salida arrancó: caja siempre
  const solapada = texto({
    entrada: { preset: "revelar", en: 0, duracion: 2000 },
    salida: { preset: "ocultar", en: 1500, duracion: 400 },
  });
  assert.deepEqual(ventanasMascara(solapada), [{ t: 0, caja: true }]);

  // un segmento SIN recorte no abre ventana
  const sinMascara = texto({ entrada: { preset: "subir", en: 0, duracion: 500 } });
  assert.deepEqual(ventanasMascara(sinMascara), []);
});

/* ——— geometría de la caja ———————————————————————————————————— */

test("cajaMascara: el rect de recortarACaja — la caja de la capa más el margen del borde", () => {
  assert.deepEqual(cajaMascara(forma()), { x1: -100, y1: -50, x2: 100, y2: 50 });
  const trazo: CapaTrazo = {
    id: "z", nombre: "Linea", tipo: "trazo", x: 0, y: 0, ancho: 100, alto: 40,
    path: "M0 0L100 40", largo: 108, color: "#fff", grosor: 8,
  };
  assert.deepEqual(cajaMascara(trazo), { x1: -54, y1: -24, x2: 54, y2: 24 });
  const vector: CapaVector = {
    id: "v", nombre: "Estrella", tipo: "vector", x: 0, y: 0, ancho: 80, alto: 80,
    path: "M0 0L80 80Z", relleno: "#fff", trazoGrosor: 4, trazoColor: "#000",
  };
  assert.deepEqual(cajaMascara(vector), { x1: -42, y1: -42, x2: 42, y2: 42 });
  // texto mide su renglón en AE; media queda anotada (pendiente)
  assert.equal(cajaMascara(texto()), null);
});

test("mascaraTexto: la caja del renglón relativa a la baseline, glifo completo con interlineado apretado", () => {
  const normal = mascaraTexto(texto());
  // tamano 60: padX 15, arriba -51, alto = max(69, 72) = 72
  assert.deepEqual(normal, { padX: 15, arriba: -51, alto: 72 });
  // interlineado APRETADO (48 < 1.2×60): el alto no baja del glifo completo
  const apretado = mascaraTexto(texto({ fuente: { familia: "Arial", tamano: 60, peso: 700, interlineado: 48 } }));
  assert.equal(apretado.alto, 72);
});

test("instantesMedicion: un momento de reposo — después de la entrada; sin entrada, el 0", () => {
  const capa = texto({
    texto: "AB CD",
    division: "caracteres",
    entrada: { preset: "revelar", en: 200, duracion: 600, escalonado: 40 },
  });
  assert.deepEqual(instantesMedicion(capa), [921]); // 200 + 40×3 + 600 + 1
  assert.deepEqual(instantesMedicion(texto({ salida: { preset: "ocultar", en: 2000, duracion: 300 } })), [0]);
});

test("instantesMedicion con CONTADOR y salida que recorta: se mide también al arrancar la salida", () => {
  // el contador sigue cambiando el texto después del reposo de la entrada:
  // «STOCK:9» puede ser «STOCK:100» cuando la salida vuelve a recortar
  const capa = texto({
    texto: "STOCK:9",
    pistas: { numero: [{ t: 0, v: 9 }, { t: 2500, v: 100 }] },
    entrada: { preset: "revelar", en: 0, duracion: 500 },
    salida: { preset: "ocultar", en: 3000, duracion: 400 },
  });
  assert.deepEqual(instantesMedicion(capa), [501, 3000]);
  // sin contador, o con salida que NO recorta, un solo instante alcanza
  assert.deepEqual(instantesMedicion(texto({
    entrada: { preset: "revelar", en: 0, duracion: 500 },
    salida: { preset: "ocultar", en: 3000, duracion: 400 },
  })), [501]);
  assert.deepEqual(instantesMedicion(texto({
    pistas: { numero: [{ t: 0, v: 9 }] },
    entrada: { preset: "revelar", en: 0, duracion: 500 },
    salida: { preset: "desvanecer", en: 3000, duracion: 400 },
  })), [501]);
});

/* ——— la partición del viaje (shapes) ————————————————————————— */

test("soloRecorte/sinRecorte parten los segmentos: el revelado al grupo, el resto a la capa", () => {
  const capa = forma({
    entrada: { preset: "revelar", en: 0, duracion: 500 },
    salida: { preset: "desvanecer", en: 3000, duracion: 400 },
    pistas: { x: [{ t: 0, v: 100 }, { t: 1000, v: 200 }] },
  });
  const solo = soloRecorte(capa);
  assert.equal(solo.entrada?.preset, "revelar");
  assert.equal(solo.salida, undefined);
  // parada en el origen y sin pistas: horneada da el viaje PURO del preset
  assert.equal(solo.x, 0);
  assert.equal(solo.y, 0);
  assert.equal(solo.pistas, undefined);
  const resto = sinRecorte(capa);
  assert.equal(resto.entrada, undefined);
  assert.equal(resto.salida?.preset, "desvanecer");
  assert.deepEqual(resto.pistas, capa.pistas);
});

test("tieneRecorteAE: texto y shapes sí; media y capas ocultas no", () => {
  const entrada = { preset: "revelar" as const, en: 0, duracion: 500 };
  assert.ok(tieneRecorteAE(texto({ entrada })));
  assert.ok(tieneRecorteAE(forma({ entrada })));
  assert.ok(!tieneRecorteAE(forma({ entrada, oculta: true })));
  assert.ok(!tieneRecorteAE(forma({ entrada: { preset: "subir", en: 0, duracion: 500 } })));
  assert.ok(!tieneRecorteAE({
    id: "m", nombre: "Foto", tipo: "media", x: 0, y: 0, ancho: 100, alto: 100,
    mediaId: "xx", ajuste: "cubrir", entrada,
  }));
  assert.ok(esRecorte(entrada) && !esRecorte({ preset: "subir", en: 0, duracion: 500 }));
});

/* ——— capasPorLinea: el texto partido por renglón ————————————————— */

test("capasPorLinea con un renglón: la misma capa, con división «ninguna» normalizada a «lineas»", () => {
  const [linea, ...resto] = capasPorLinea(texto({ entrada: { preset: "revelar", en: 0, duracion: 500 } }));
  assert.equal(resto.length, 0);
  assert.equal(linea.capa.division, "lineas");
  assert.equal(linea.capa.texto, "HOLA");
  assert.equal(linea.desplazarY, 0);
});

test("división «lineas»: cada renglón lleva su delay EXACTO (el orden del escalonado incluido) y escalonado 0", () => {
  const capa = texto({
    texto: "UNO\nDOS\nTRES",
    division: "lineas",
    entrada: { preset: "revelar", en: 200, duracion: 600, escalonado: 140, ordenEscalonado: "fin" },
  });
  const lineas = capasPorLinea(capa);
  assert.equal(lineas.length, 3);
  // orden «fin»: la última primero — los delays exactos del motor
  const delays = delaysEscalonado(3, 140, "fin");
  lineas.forEach((l, i) => {
    assert.equal(l.capa.entrada?.en, 200 + delays[i]);
    assert.equal(l.capa.entrada?.escalonado, 0);
    assert.equal(l.capa.entrada?.ordenEscalonado, undefined);
  });
  // el ancla de cada renglón: su lugar dentro del bloque (interlineado 69)
  assert.deepEqual(lineas.map((l) => l.desplazarY), [69, 0, -69]);
  assert.deepEqual(lineas.map((l) => l.capa.nombre), ["Titulo . linea 1", "Titulo . linea 2", "Titulo . linea 3"]);
});

test("división «caracteres»: el en corre por las unidades previas y los tramos se re-indexan al renglón", () => {
  const capa = texto({
    texto: "AB CD\nEF",
    division: "caracteres",
    tramos: [{ desde: 2, hasta: 6, color: "#ff0000" }],
    deformaciones: [{ desde: 4, hasta: 5, escalaX: 2 }],
    entrada: { preset: "revelar", en: 0, duracion: 500, escalonado: 35 },
  });
  const [l1, l2] = capasPorLinea(capa);
  assert.equal(l1.capa.entrada?.en, 0);
  assert.equal(l1.capa.entrada?.escalonado, 35); // vivo adentro del animator
  // el renglón 2 arranca después de las 4 unidades del primero
  assert.equal(l2.capa.entrada?.en, 4 * 35);
  // el tramo [2,6) sobre la tinta ABCDEF: [2,4) en el renglón 1, [0,2) en el 2
  assert.deepEqual(l1.capa.tramos, [{ desde: 2, hasta: 4, color: "#ff0000" }]);
  assert.deepEqual(l2.capa.tramos, [{ desde: 0, hasta: 2, color: "#ff0000" }]);
  // la deformación [4,5) cae entera en el renglón 2 → [0,1)
  assert.equal(l1.capa.deformaciones, undefined);
  assert.deepEqual(l2.capa.deformaciones, [{ desde: 0, hasta: 1, escalaX: 2 }]);
});

test("división «ninguna» multilínea: los renglones viajan JUNTOS (sin corrimiento) y un renglón vacío no genera capa", () => {
  const capa = texto({
    texto: "UNO\n\nDOS 42",
    division: "ninguna",
    pistas: { numero: [{ t: 0, v: 42 }, { t: 1000, v: 0 }] },
    entrada: { preset: "revelar", en: 300, duracion: 500, escalonado: 100 },
  });
  const lineas = capasPorLinea(capa);
  assert.equal(lineas.length, 2); // el renglón vacío se saltea
  for (const l of lineas) {
    assert.equal(l.capa.division, "lineas");
    assert.equal(l.capa.entrada?.en, 300); // ninguna no escalona
    assert.equal(l.capa.entrada?.escalonado, 0);
  }
  // la pista «numero» solo en el renglón que lleva la primera cifra
  assert.equal(lineas[0].capa.pistas?.numero, undefined);
  assert.deepEqual(lineas[1].capa.pistas?.numero, capa.pistas?.numero);
  // el desplazarY del renglón salteado no se pierde (3 renglones de bloque)
  assert.deepEqual(lineas.map((l) => l.desplazarY), [69, -69]);
});

/* ——— el animator con mask: sin aproximación por opacidad ——————————— */

test("animadorDeSegmento conMascara: el revelado ya no degrada a opacidad ni avisa", () => {
  const capa = texto({ texto: "HOLA QUE", division: "palabras" });
  const seg = { preset: "revelar", en: 0, duracion: 500 };
  const aproximado = animadorDeSegmento(capa, seg, "entrada")!;
  assert.equal(aproximado.props.find(([n]) => n === "ADBE Text Opacity")?.[1], 0);
  assert.ok(aproximado.avisos.some((x) => /mascara/.test(x)));
  const conMascara = animadorDeSegmento(capa, seg, "entrada", true)!;
  assert.equal(conMascara.props.find(([n]) => n === "ADBE Text Opacity"), undefined);
  assert.ok(!conMascara.avisos.some((x) => /mascara/.test(x)));
  // el viaje escala por altoUnidad (nunca menos que 1.2× el cuerpo): 79.2
  assert.deepEqual(conMascara.props.find(([n]) => n === "ADBE Text Position 3D")?.[1], [0, 79.2]);
});

/* ——— el .jsx completo ———————————————————————————————————————— */

test("multilínea con revelado → una capa por renglón, cada una con su mask, su timing y su ancla", () => {
  const jsx = generarScriptAE([comp([texto({
    texto: "UNO\nDOS",
    division: "lineas",
    entrada: { preset: "revelar", en: 200, duracion: 600, escalonado: 140, easing: "salidaExpo" },
    salida: { preset: "ocultar", en: 3000, duracion: 400 },
  })])]);
  assert.match(jsx, /addText\("UNO"\)/);
  assert.match(jsx, /addText\("DOS"\)/);
  assert.match(jsx, /capa\.name = "Titulo \. linea 1";/);
  assert.match(jsx, /capa\.name = "Titulo \. linea 2";/);
  assert.match(jsx, /capa partida por renglon para el revelado \(2 capas, una mask por linea\)/);
  // cada renglón en su lugar del bloque: 540 ∓ interlineado/2 (69/2 = 34.5)
  assert.match(jsx, /"ADBE Position"\)\.setValue\(\[960, 505\.5\]\);/);
  assert.match(jsx, /"ADBE Position"\)\.setValue\(\[960, 574\.5\]\);/);
  // el timing corrido del renglón 2 (en 200+140) y su ventana propia
  assert.match(jsx, /\{t: 0\.34, v: 0, eo: /);
  assert.match(jsx, /__mascaraTexto\(capa, 15, -51, 72, \[0\.801\], \[\[0, true\], \[0\.8, false\], \[3, true\]\]\);/);
  assert.match(jsx, /__mascaraTexto\(capa, 15, -51, 72, \[0\.941\], \[\[0, true\], \[0\.94, false\], \[3, true\]\]\);/);
  // dos masks, una por renglón (llamadas emitidas, no la definición del helper)
  assert.equal((jsx.match(/^__mascaraTexto\(capa, /gm) ?? []).length, 2);
});

test("forma con revelar: el viaje va en la Position del GRUPO y la mask queda quieta en la capa", () => {
  const jsx = generarScriptAE([comp([forma({
    entrada: { preset: "revelar", en: 0, duracion: 500, easing: "salidaExpo" },
  })])]);
  // el grupo viaja 1.1 × alto de la capa (110) → 0, con su temporal ease
  assert.match(jsx, /__pista\(gr\.property\("ADBE Vector Transform Group"\)\.property\("ADBE Vector Position"\), \[\{t: 0, v: \[0, 110\], eo: \[[^\]]+\]\}, \{t: 0\.5, v: \[0, 0\], ei: \[[^\]]+\]\}\], 1\);/);
  // la mask es la caja de la capa, con su ventana
  assert.match(jsx, /__mascara\(capa, -100, -50, 100, 50, \[\[0, true\], \[0\.5, false\]\]\);/);
  // la Position de la CAPA queda quieta (el viaje no va ahí)
  assert.match(jsx, /"ADBE Position"\)\.setValue\(\[400, 300\]\);/);
  assert.ok(!/__pista\(__t\(capa, "ADBE Position"\)/.test(jsx), "sin keyframes de capa");
  assert.match(jsx, /revelado con MASCARA real: la caja recorta y el viaje va en la Position del grupo/);
});

test("trazo con revelar + trim: el grupo lleva el viaje, la mask suma el margen del grosor, el trim sigue vivo", () => {
  const trazo: CapaTrazo = {
    id: "z", nombre: "Linea", tipo: "trazo", x: 500, y: 500, ancho: 100, alto: 40,
    path: "M0 0L100 40", largo: 108, color: "#fff", grosor: 8,
    entrada: { preset: "revelar", en: 0, duracion: 400 },
  };
  const jsx = generarScriptAE([comp([trazo])]);
  assert.match(jsx, /__mascara\(capa, -54, -24, 54, 24, \[\[0, true\], \[0\.4, false\]\]\);/);
  assert.match(jsx, /ADBE Vector Transform Group/);
  assert.match(jsx, /ADBE Vector Filter - Trim/);
});

test("media con revelar sigue ANOTADA (la mask del encaje ya ocupa el footage)", () => {
  const jsx = generarScriptAE([comp([{
    id: "m", nombre: "Foto", tipo: "media", x: 200, y: 200, ancho: 300, alto: 200,
    mediaId: "data:image/png;base64,iVBORw0KGgo=", ajuste: "cubrir",
    entrada: { preset: "revelar", en: 0, duracion: 500 },
  }])]);
  assert.match(jsx, /la MASCARA del revelado no viaja/);
  assert.ok(!/^__mascara\(capa, /m.test(jsx), "media no lleva mask de revelado");
});

test("sin animación (solo diseño) no hay mask ni partición por renglón", () => {
  const jsx = generarScriptAE(
    [comp([texto({ texto: "UNO\nDOS", entrada: { preset: "revelar", en: 0, duracion: 500 } })])],
    undefined,
    { sinAnimacion: true },
  );
  assert.match(jsx, /addText\("UNO\\nDOS"\)/);
  assert.ok(!/^__mascaraTexto\(capa, /m.test(jsx), "sin mask en solo diseño");
  assert.ok(!jsx.includes(". linea 1"), "sin partición");
});

test("texto con TODOS los renglones en blanco no desaparece: cae al camino de siempre", () => {
  const jsx = generarScriptAE([comp([texto({
    texto: " \n\n ",
    entrada: { preset: "revelar", en: 0, duracion: 500 },
  })])]);
  assert.match(jsx, /addText\(/); // la capa sigue existiendo en AE
  assert.ok(!/^__mascaraTexto\(capa, /m.test(jsx), "sin mask: no hay tinta que enmascarar");
  assert.ok(!jsx.includes(". linea 1"), "sin partición");
});

test("azar por caracteres multilínea: el barajado queda POR RENGLON y el comentario lo avisa", () => {
  const jsx = generarScriptAE([comp([texto({
    texto: "AB\nCD",
    division: "caracteres",
    entrada: { preset: "revelar", en: 0, duracion: 500, escalonado: 35, ordenEscalonado: "azar" },
  })])]);
  assert.match(jsx, /el orden azar se baraja POR RENGLON, no sobre el texto entero/);
  // por líneas el azar viaja EXACTO en los delays: sin aviso
  const porLineas = generarScriptAE([comp([texto({
    texto: "AB\nCD",
    division: "lineas",
    entrada: { preset: "revelar", en: 0, duracion: 500, escalonado: 140, ordenEscalonado: "azar" },
  })])]);
  assert.ok(!porLineas.includes("azar se baraja POR RENGLON"), "por líneas no degrada");
});

test("el alert final cuenta las capas REALMENTE emitidas (el renglón partido suma)", () => {
  const jsx = generarScriptAE([comp([texto({
    texto: "UNO\nDOS",
    division: "lineas",
    entrada: { preset: "revelar", en: 0, duracion: 500 },
  })])]);
  assert.match(jsx, /2 capa\(s\)/);
});

test("el generador sigue siendo determinista con revelado partido", () => {
  const escena = comp([texto({
    texto: "UNO\nDOS GRANDES",
    division: "caracteres",
    entrada: { preset: "revelar", en: 0, duracion: 500, escalonado: 35 },
    salida: { preset: "ocultar", en: 3000, duracion: 400 },
  })]);
  assert.equal(generarScriptAE([escena]), generarScriptAE([escena]));
});
