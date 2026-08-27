import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generarScriptAE,
  easeDeTramo,
  colorAE,
  fuentePostScript,
} from "@/lib/motion/exportar-ae-puro";
import { nombreDeArchivo } from "@/lib/motion/exportar";
import type { CapaTexto, CapaTrazo, Composicion } from "@/lib/motion/modelo";

const base = (extra: Partial<Composicion> = {}): Composicion => ({
  version: 1,
  nombre: "Prueba AE",
  ancho: 1920,
  alto: 1080,
  fps: 30,
  duracion: 4000,
  fondo: "#101015",
  capas: [],
  ...extra,
});

const titulo = (extra: Partial<CapaTexto> = {}): CapaTexto => ({
  id: "titulo",
  nombre: "Titulo",
  tipo: "texto",
  texto: "HOLA",
  x: 960,
  y: 540,
  fuente: { familia: "Space Grotesk", tamano: 120, peso: 700 },
  color: "#ffffff",
  division: "ninguna",
  ...extra,
});

/* ——— conversiones puras ————————————————————————————————————— */

test("colorAE convierte hex a [r,g,b] 0-1 y degrada el color roto a gris", () => {
  assert.deepEqual(colorAE("#ffffff"), [1, 1, 1]);
  assert.deepEqual(colorAE("#000000"), [0, 0, 0]);
  assert.deepEqual(colorAE("#f00"), [1, 0, 0]);
  assert.deepEqual(colorAE("no-es-color"), [0.5, 0.5, 0.5]);
});

test("fuentePostScript adivina el nombre PS por familia y peso", () => {
  assert.equal(fuentePostScript("Space Grotesk", 700), "SpaceGrotesk-Bold");
  assert.equal(fuentePostScript("Inter", 400), "Inter-Regular");
  assert.equal(fuentePostScript("Archivo Black", 900), "ArchivoBlack-Black");
});

test("easeDeTramo: lineal no setea ease; suave da influencia de sus manijas", () => {
  assert.equal(easeDeTramo("lineal", 100, 1), null);
  const suave = easeDeTramo("suave", 100, 1);
  assert.ok(suave);
  // suave = bezier(0.4, 0, 0.2, 1): influencia de salida 40, de entrada 80
  assert.equal(suave.salida[1], 40);
  assert.equal(suave.entrada[1], 80);
  // salida con y1=0 arranca a velocidad 0; la entrada llega a velocidad 0
  assert.equal(suave.salida[0], 0);
  assert.equal(suave.entrada[0], 0);
});

test("easeDeTramo: sin nombre usa el default de la casa (suave), no lineal", () => {
  const porDefecto = easeDeTramo(undefined, 100, 1);
  assert.ok(porDefecto);
  assert.equal(porDefecto.salida[1], 40);
});

/* ——— el script generado ————————————————————————————————————— */

test("genera la comp con formato y fondo; la capa de texto con fuente, leading y justificacion", () => {
  const comp = base({ capas: [titulo({ alineacion: "izquierda" })] });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /addComp\("Prueba AE", 1920, 1080, 1, 4, 30\)/);
  assert.match(jsx, /comp\.bgColor = \[0\.0627, 0\.0627, 0\.0824\];/);
  assert.match(jsx, /addText\("HOLA"\)/);
  assert.match(jsx, /doc\.font = "SpaceGrotesk-Bold"/);
  assert.match(jsx, /doc\.fontSize = 120;/);
  assert.match(jsx, /doc\.leading = 138;/); // 120 × 1.15
  assert.match(jsx, /LEFT_JUSTIFY/);
  assert.match(jsx, /"ADBE Position"\)\.setValue\(\[960, 540\]\)/);
});

test("texto multilinea corrige el ancla: la posicion Y baja a la baseline de la primera linea", () => {
  const comp = base({
    capas: [titulo({ texto: "UNA\nDOS\nTRES", fuente: { familia: "Inter", tamano: 100, peso: 400, interlineado: 100 } })],
  });
  const jsx = generarScriptAE([comp]);
  // 3 lineas de 100 → el bloque centrado corre el ancla (3-1)/2×100 = 100 px
  assert.match(jsx, /"ADBE Position"\)\.setValue\(\[960, 440\]\)/);
});

test("pistas crudas: x separa dimensiones y llega con keyframes, opacidad va 0-1 → 0-100", () => {
  const comp = base({
    capas: [
      titulo({
        pistas: {
          x: [{ t: 0, v: 100, easing: "suave" }, { t: 1000, v: 500 }],
          opacidad: [{ t: 0, v: 0, easing: "lineal" }, { t: 500, v: 1 }],
        },
      }),
    ],
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /dimensionsSeparated = true;/);
  assert.match(jsx, /"ADBE Position_0"\), \[\{t: 0, v: 100, eo: \[0, 40\]\}, \{t: 1, v: 500, ei: \[0, 80\]\}\], 1\)/);
  // opacidad lineal: sin ei/eo, valores ×100
  assert.match(jsx, /"ADBE Opacity"\), \[\{t: 0, v: 0\}, \{t: 0\.5, v: 100\}\], 1\)/);
});

test("hold: el keyframe queda marcado y no arrastra ease de salida", () => {
  const comp = base({
    capas: [titulo({ pistas: { x: [{ t: 0, v: 100, hold: true }, { t: 1000, v: 500 }] } })],
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /\{t: 0, v: 100, hold: true\}/);
});

test("camara: precomp con anchor keyframeado desde camaraEn y zoom como escala", () => {
  const comp = base({
    capas: [titulo()],
    camara: {
      pistas: {
        x: [{ t: 0, v: 960, easing: "suave" }, { t: 2000, v: 1200 }],
        y: [{ t: 0, v: 540, easing: "suave" }, { t: 2000, v: 600 }],
        zoom: [{ t: 0, v: 1, easing: "suave" }, { t: 2000, v: 2 }],
      },
    },
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /addComp\("Prueba AE \. contenido", 1920, 1080/);
  assert.match(jsx, /capa\.name = "camara";/);
  assert.match(jsx, /"ADBE Position"\)\.setValue\(\[960, 540\]\);/);
  assert.match(jsx, /"ADBE Anchor Point"\), \[\{t: 0, v: \[960, 540\]/);
  assert.match(jsx, /\{t: 2, v: \[1200, 600\]/);
  assert.match(jsx, /"ADBE Scale"\), \[\{t: 0, v: \[100, 100\]/);
  assert.match(jsx, /\{t: 2, v: \[200, 200\]/);
});

test("temblor: la expresion lleva la misma suma de senos con amplitud escalada al ancho", () => {
  const comp = base({
    capas: [titulo()],
    camara: { pistas: {}, base: { zoom: 1.2 }, temblor: { preset: "handheld", intensidad: 1.5 } },
  });
  const jsx = generarScriptAE([comp]);
  // handheld: amplitud 7 × 1.5 × (1920/1920) = 10.5
  assert.match(jsx, /var amp = 10\.5; var vel = 0\.45; var fase = 7\.31;/);
  assert.match(jsx, /Math\.sin\(ts \+ des\) \* 0\.55/);
  assert.match(jsx, /\.expression = /);
  assert.match(jsx, /"ADBE Scale"\)\.setValue\(\[120, 120\]\);/);
});

test("presets entrada/salida quedan anotados en el comentario de la capa (nada se pierde en silencio)", () => {
  const comp = base({
    capas: [
      titulo({
        division: "palabras",
        entrada: { preset: "revelar", en: 200, duracion: 600, escalonado: 40 },
      }),
    ],
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /capa\.comment = ".*entrada: revelar \(en 200ms, dura 600ms, escalonado 40ms\).*division: palabras/);
});

test("trazo: rectangulo placeholder con Trim Paths real desde las pistas", () => {
  const trazo: CapaTrazo = {
    id: "t1", nombre: "Linea", tipo: "trazo", x: 500, y: 500,
    path: "M0 0L100 0", ancho: 100, alto: 2, color: "#ff0000", grosor: 3, largo: 100,
    pistas: { trazoFin: [{ t: 0, v: 0, easing: "lineal" }, { t: 1000, v: 1 }] },
  };
  const jsx = generarScriptAE([base({ capas: [trazo] })]);
  assert.match(jsx, /"ADBE Vector Filter - Trim"/);
  assert.match(jsx, /"ADBE Vector Trim End"\), \[\{t: 0, v: 0\}, \{t: 1, v: 100\}\], 1\)/);
  assert.match(jsx, /"ADBE Vector Stroke Width"\)\.setValue\(3\);/);
});

test("varias escenas: una comp por escena y un master con cortes duros por startTime", () => {
  const e1 = base({ nombre: "Escena 1", duracion: 2000 });
  const e2 = base({ nombre: "Escena 2", duracion: 3000 });
  const jsx = generarScriptAE([e1, e2], "Mi proyecto");
  assert.match(jsx, /addComp\("Escena 1", 1920, 1080, 1, 2, 30\)/);
  assert.match(jsx, /addComp\("Escena 2", 1920, 1080, 1, 3, 30\)/);
  assert.match(jsx, /addComp\("Mi proyecto \. master", 1920, 1080, 1, 5, 30\)/);
  assert.match(jsx, /capa\.startTime = 0;/);
  assert.match(jsx, /capa\.startTime = 2;/);
});

test("los strings se escapan: comillas y no-ASCII no rompen el .jsx", () => {
  const comp = base({ nombre: 'Con "comillas" y ñandú' });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /Con \\"comillas\\" y \\u00f1and\\u00fa/);
  assert.ok(!/[^\x00-\x7f]/.test(jsx), "el .jsx tiene que ser ASCII puro");
});

test("determinismo: mismas escenas, mismo script byte a byte", () => {
  const comp = base({
    capas: [titulo({ pistas: { x: [{ t: 0, v: 0 }, { t: 999, v: 333.3333 }] } })],
    camara: { pistas: { zoom: [{ t: 0, v: 1 }, { t: 1500, v: 1.8 }] }, temblor: { preset: "flotar" } },
  });
  assert.equal(generarScriptAE([comp]), generarScriptAE([comp]));
});

test("nombreDeArchivo translitera acentos: Chromium descarta el nombre entero si trae no-ASCII", () => {
  assert.equal(nombreDeArchivo("demo-del-módulo.jsx"), "demo-del-modulo.jsx");
  assert.equal(nombreDeArchivo("Animación ñoña.mp4"), "Animacion nona.mp4");
});

test("sin escenas es un error claro, no un script vacio", () => {
  assert.throws(() => generarScriptAE([]), /No hay escenas/);
});
