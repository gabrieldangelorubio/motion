import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generarScriptAE,
  generarProyectoAE,
  assetsDeEscenas,
  easeDeTramo,
  colorAE,
  fuentePostScript,
  extensionDeFuente,
  archivoDeFamilia,
  leemeDeFuentes,
  candidatosDeFuente,
} from "@/lib/motion/exportar-ae-puro";
import { duracionDesdeAudio } from "@/lib/motion/audio-puro";
import { nombreDeArchivo } from "@/lib/motion/exportar";
import { quitarEscena } from "@/lib/motion/escenas-puro";
import { estirarTiempoCapas, rangoAnimacionCapas } from "@/lib/motion/herramientas-puro";
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
  // la fuente se fija con candidatos VERIFICADOS (AE sustituye en silencio)
  assert.match(jsx, /__fijarFuente\(capa, \["SpaceGrotesk-Bold", "SpaceGroteskBold", "SpaceGrotesk"\], "Space Grotesk \(peso 700\)"\)/);
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

test("solo diseño: sin keyframes, sin cámara, sin temblor — las capas en su estado base", () => {
  const comp = base({
    capas: [
      titulo({
        entrada: { preset: "revelar", en: 0, duracion: 500 },
        pistas: { x: [{ t: 0, v: 100 }, { t: 1000, v: 500 }], opacidad: [{ t: 0, v: 0 }, { t: 500, v: 1 }] },
      }),
    ],
    camara: {
      pistas: { x: [{ t: 0, v: 960 }, { t: 2000, v: 1200 }] },
      temblor: { preset: "handheld" },
    },
  });
  const jsx = generarScriptAE([comp], undefined, { sinAnimacion: true });
  assert.match(jsx, /modo: solo diseno/);
  // la CABECERA define el helper __pista; lo que no puede haber es LLAMADAS
  assert.ok(!/^__pista\(/m.test(jsx), "no tiene que emitir ni un keyframe");
  assert.ok(!jsx.includes(".expression"), "sin temblor");
  assert.ok(!jsx.includes(". contenido"), "sin precomp de camara");
  assert.ok(!jsx.includes("entrada: revelar"), "sin notas de presets pendientes");
  // la posición es la BASE de la capa (el reposo), no la pista
  assert.match(jsx, /"ADBE Position"\)\.setValue\(\[960, 540\]\)/);
});

test("solo diseño apagado sigue emitiendo la animación completa (default intacto)", () => {
  const comp = base({
    capas: [titulo({ pistas: { x: [{ t: 0, v: 100 }, { t: 1000, v: 500 }] } })],
  });
  const jsx = generarScriptAE([comp]);
  assert.ok(jsx.includes("__pista("));
  assert.ok(!jsx.includes("modo: solo diseno"));
});

test("nombreDeArchivo translitera acentos: Chromium descarta el nombre entero si trae no-ASCII", () => {
  assert.equal(nombreDeArchivo("demo-del-módulo.jsx"), "demo-del-modulo.jsx");
  assert.equal(nombreDeArchivo("Animación ñoña.mp4"), "Animacion nona.mp4");
});

test("quitarEscena: al borrar salta a la ANTERIOR; la última del proyecto no se borra", () => {
  const escenas = [{ id: "a" }, { id: "b" }, { id: "c" }];
  // borrar la del medio → destino: la anterior
  assert.deepEqual(quitarEscena(escenas, "b"), { restantes: [{ id: "a" }, { id: "c" }], destino: { id: "a" } });
  // borrar la primera → destino: la que quedó primera
  assert.deepEqual(quitarEscena(escenas, "a"), { restantes: [{ id: "b" }, { id: "c" }], destino: { id: "b" } });
  // borrar la ÚLTIMA → destino: su anterior (no la primera del proyecto)
  assert.deepEqual(quitarEscena(escenas, "c"), { restantes: [{ id: "a" }, { id: "b" }], destino: { id: "b" } });
  // la última escena no se borra; un id ajeno tampoco hace nada
  assert.equal(quitarEscena([{ id: "solo" }], "solo"), null);
  assert.equal(quitarEscena(escenas, "zzz"), null);
});

test("rangoAnimacionCapas abraza spans y keyframes de la selección; sin animación es null", () => {
  const comp = base({
    capas: [
      titulo({ id: "a", entrada: { preset: "revelar", en: 200, duracion: 600 } }),
      titulo({ id: "b", pistas: { x: [{ t: 100, v: 0 }, { t: 1500, v: 10 }] } }),
      titulo({ id: "quieta" }),
      titulo({ id: "afuera", entrada: { preset: "revelar", en: 5, duracion: 10 } }),
    ],
  });
  assert.deepEqual(rangoAnimacionCapas(comp, ["a", "b"]), { desde: 100, hasta: 1500 });
  assert.equal(rangoAnimacionCapas(comp, ["quieta"]), null);
});

test("estirarTiempoCapas: time-stretch grupal — escala inicios, duraciones, keyframes y escalonado", () => {
  const comp = base({
    capas: [
      titulo({ id: "a", entrada: { preset: "revelar", en: 200, duracion: 600, escalonado: 40 } }),
      titulo({ id: "b", pistas: { x: [{ t: 100, v: 0 }, { t: 900, v: 10 }] } }),
      titulo({ id: "afuera", entrada: { preset: "pop", en: 300, duracion: 100 } }),
    ],
  });
  const doble = estirarTiempoCapas(comp, ["a", "b"], 0, 2);
  const a = doble.capas[0];
  const b = doble.capas[1];
  assert.equal(a.entrada?.en, 400);
  assert.equal(a.entrada?.duracion, 1200);
  assert.equal(a.entrada?.escalonado, 80);
  assert.deepEqual(b.pistas?.x?.map((k) => k.t), [200, 1800]);
  // la capa fuera de la selección no se toca
  assert.equal(doble.capas[2].entrada?.en, 300);
  // pivote en el FIN: comprimir a la mitad acerca todo hacia el fin
  const mitad = estirarTiempoCapas(comp, ["b"], 900, 0.5);
  assert.deepEqual(mitad.capas[1].pistas?.x?.map((k) => k.t), [500, 900]);
  // factor sin sentido: la comp queda tal cual
  assert.equal(estirarTiempoCapas(comp, ["a"], 0, 0), comp);
});

test("assetsDeEscenas: deduplica data-uris, nombra ordenado y salta ids de catálogo", () => {
  const uri = "data:image/png;base64,AAAA";
  const media = (id: string, mediaId: string) => ({
    id, nombre: id, tipo: "media" as const, x: 0, y: 0, mediaId, ancho: 10, alto: 10, ajuste: "cubrir" as const,
  });
  const escenas = [
    base({ capas: [media("a", uri), media("b", "data:image/jpeg;base64,BBBB")] }),
    base({ nombre: "E2", capas: [media("c", uri), media("d", "catalogo-123")] }),
  ];
  const assets = assetsDeEscenas(escenas);
  assert.deepEqual(assets.map((a) => a.ruta), ["assets/media-01.png", "assets/media-02.jpg"]);
  assert.equal(assets[0].base64, "AAAA");
});

test("generarProyectoAE: el .jsx importa los assets por su ruta y cae a placeholder si faltan", () => {
  const uri = "data:image/png;base64,AAAA";
  const comp = base({
    capas: [{ id: "m", nombre: "Fondo", tipo: "media", x: 960, y: 540, mediaId: uri, ancho: 400, alto: 300, ajuste: "cubrir" }],
  });
  const { jsx, assets } = generarProyectoAE([comp]);
  assert.equal(assets.length, 1);
  assert.match(jsx, /__importar\("assets\/media-01\.png"\)/);
  assert.match(jsx, /if \(fuente\) \{/);
  assert.match(jsx, /addSolid\(\[0\.5, 0\.5, 0\.55\], "Fondo"/); // el fallback sigue ahí
  assert.ok(!jsx.includes("relinkear asset"), "con asset en el zip no hay nota de relinkear");
  // sin media: el proyecto no trae assets y el jsx no importa nada
  const seco = generarProyectoAE([base({ capas: [titulo()] })]);
  assert.equal(seco.assets.length, 0);
  // (la cabecera define el helper __importar siempre; sin assets no hay LLAMADAS)
  assert.ok(!/^fuente = __importar\(/m.test(seco.jsx));
});

test("el tracking de AE sale ENTERO (un float aborta el script) y el interletrado negativo también", () => {
  const comp = base({
    capas: [titulo({ fuente: { familia: "Inter", tamano: 120, peso: 400, interletrado: -3.6012 } })],
  });
  const jsx = generarScriptAE([comp]);
  const m = /doc\.tracking = (-?[\d.]+);/.exec(jsx);
  assert.ok(m, "hay tracking");
  assert.ok(Number.isInteger(Number(m[1])), `tracking entero (salió ${m[1]})`);
  assert.equal(Number(m[1]), -30); // -3.6012/120*1000 = -30.01 → -30
});

test("candidatosDeFuente cubre variantes de peso y termina en la familia pelada", () => {
  assert.deepEqual(candidatosDeFuente("Space Grotesk", 700), ["SpaceGrotesk-Bold", "SpaceGroteskBold", "SpaceGrotesk"]);
  assert.deepEqual(candidatosDeFuente("Inter", 400), ["Inter-Regular", "InterRegular", "Inter"]);
  assert.ok(candidatosDeFuente("Archivo", 600).includes("Archivo-SemiBold"));
  assert.ok(candidatosDeFuente("Archivo", 600).includes("Archivo-DemiBold"));
});

test("fuentes que AE no encuentre: el script las junta y las canta al final", () => {
  const jsx = generarScriptAE([base({ capas: [titulo()] })]);
  assert.match(jsx, /var __fuentesFaltantes = \[\];/);
  assert.match(jsx, /tipografia original: /);
  assert.match(jsx, /if \(__fuentesFaltantes\.length\) alert\(/);
});

test("extensionDeFuente reconoce el formato por número mágico", () => {
  const de = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));
  assert.equal(extensionDeFuente(de("OTTO....")), "otf");
  assert.equal(extensionDeFuente(de("wOFF....")), "woff");
  assert.equal(extensionDeFuente(de("wOF2....")), "woff2");
  assert.equal(extensionDeFuente([0, 1, 0, 0]), "ttf");
});

test("archivoDeFamilia y leemeDeFuentes arman la carpeta fuentes/ legible", () => {
  assert.equal(archivoDeFamilia("Space Grotesk", "otf"), "fuentes/SpaceGrotesk.otf");
  assert.equal(archivoDeFamilia("Canción Ñandú", "ttf"), "fuentes/CancionNandu.ttf");
  const leeme = leemeDeFuentes(
    [{ familia: "Archivo Black", archivo: "fuentes/ArchivoBlack.otf" }],
    ["Space Grotesk"],
    ["Helvetica"],
  );
  assert.match(leeme, /Archivo Black -> ArchivoBlack\.otf/);
  assert.match(leeme, /fonts\.google\.com\/specimen\/Space\+Grotesk/);
  assert.match(leeme, /- Helvetica/);
  assert.match(leeme, /ANTES de correr el \.jsx/);
});

test("duracionDesdeAudio: el largo del audio + 10% de aire, acotado a una escena", () => {
  assert.equal(duracionDesdeAudio(4000), 4400);
  assert.equal(duracionDesdeAudio(100), 500);
  assert.equal(duracionDesdeAudio(500000), 120000);
});

test("sin escenas es un error claro, no un script vacio", () => {
  assert.throws(() => generarScriptAE([]), /No hay escenas/);
});
