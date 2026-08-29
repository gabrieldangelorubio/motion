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
  escaleraDePesos,
  rangoRealDeTramo,
} from "@/lib/motion/exportar-ae-puro";
import { duracionDesdeAudio } from "@/lib/motion/audio-puro";
import { nombreDeArchivo } from "@/lib/motion/exportar";
import { quitarEscena } from "@/lib/motion/escenas-puro";
import { estirarTiempoCapas, filasDeCapas, rangoAnimacionCapas } from "@/lib/motion/herramientas-puro";
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
  // la fuente se fija con candidatos VERIFICADOS (AE sustituye en silencio):
  // primero el peso pedido, después la escalera de vecinos, y la base para
  // el chequeo de familia + la etiqueta original para el comentario
  assert.match(jsx, /__fijarFuente\(capa, \["SpaceGrotesk-Bold", "SpaceGroteskBold", "SpaceGrotesk-ExtraBold",.*\], "SpaceGrotesk", "Space Grotesk \(peso 700\)", "Space Grotesk", \[/);
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

test("presets simples → keyframes RALOS: un in y un out por segmento, con el ease del easing", () => {
  // SIN división: el bloque entero sigue viajando como keyframes ralos
  // (con división ahora viaja como TEXT ANIMATOR — test aparte)
  const comp = base({
    capas: [
      titulo({
        division: "ninguna",
        entrada: { preset: "revelar", en: 200, duracion: 600, escalonado: 40 },
      }),
    ],
  });
  const jsx = generarScriptAE([comp]);
  // el comentario informa que la animación viajó editable
  assert.match(jsx, /animacion en keyframes editables \(entrada revelar\)/);
  assert.ok(!jsx.includes("pendiente de traducir: entrada revelar ("), "ya no queda como pendiente");
  // la posición son DOS keyframes (in y out) con temporal ease, no un muro
  const posicion = /__pista\(__t\(capa, "ADBE Position"\), (\[.*?\]), 1\);/.exec(jsx);
  assert.ok(posicion, "hay pista de posición");
  const claves = posicion![1].match(/\{t: /g) ?? [];
  assert.equal(claves.length, 2, `keyframes ralos (salieron ${claves.length})`);
  assert.match(posicion![1], /eo: \[/);
  assert.match(posicion![1], /ei: \[/);
  // revelar no toca opacidad (máscara + viaje): el canal quieto NO se emite,
  // y la máscara imposible de trasladar queda avisada en el comentario
  assert.ok(!jsx.includes('"ADBE Opacity"), [{'), "opacidad quieta no emite pista");
  assert.match(jsx, /la MASCARA del revelado no viaja/);
});

test("entrada + salida ralas comparten la pista: 4 claves con el tramo del medio plano", () => {
  const comp = base({
    capas: [
      titulo({
        entrada: { preset: "subir", en: 0, duracion: 600, easing: "salidaExpo" },
        salida: { preset: "desvanecer", en: 2400, duracion: 400 },
      }),
    ],
  });
  const jsx = generarScriptAE([comp]);
  const opacidad = /__pista\(__t\(capa, "ADBE Opacity"\), (\[.*?\]), 1\);/.exec(jsx);
  assert.ok(opacidad, "hay pista de opacidad");
  assert.equal((opacidad![1].match(/\{t: /g) ?? []).length, 4);
  assert.match(opacidad![1], /\{t: 0\.6, v: 100, ei: \[/); // fin de la entrada, con ease
  assert.match(opacidad![1], /\{t: 2\.4, v: 100, eo: \[/); // arranque de la salida
  // la posición solo la anima la entrada: las puntas quietas se recortan
  const posicion = /__pista\(__t\(capa, "ADBE Position"\), (\[.*?\]), 1\);/.exec(jsx);
  assert.equal((posicion![1].match(/\{t: /g) ?? []).length, 2);
});

test("presets con overshoot en la pista (pop) y resortes van HORNEADOS densos", () => {
  const pop = base({ capas: [titulo({ entrada: { preset: "pop", en: 0, duracion: 400 } })] });
  const jsxPop = generarScriptAE([pop]);
  assert.match(jsxPop, /animacion horneada a keyframes \(entrada pop\)/);
  const escala = /__pista\(__t\(capa, "ADBE Scale"\), (\[.*?\]), 2\);/.exec(jsxPop);
  assert.ok(escala, "hay pista de escala");
  assert.ok((escala![1].match(/\{t: /g) ?? []).length >= 10, "keyframes densos para pop");

  const resorte = base({
    capas: [titulo({ entrada: { preset: "subir", en: 0, duracion: 500, easing: "resorteRebote" } })],
  });
  const jsxResorte = generarScriptAE([resorte]);
  assert.match(jsxResorte, /animacion horneada a keyframes \(entrada subir\)/);

  // los nuevos de la escuela GSAP que rebotan/saltan tampoco caben en un tramo
  for (const easing of ["salidaElastico", "salidaPique", "escalones"] as const) {
    const comp = base({ capas: [titulo({ entrada: { preset: "subir", en: 0, duracion: 500, easing } })] });
    assert.match(generarScriptAE([comp]), /animacion horneada a keyframes/, `${easing} va denso`);
  }
  // y los bezier nuevos sí van ralos, con su temporal ease
  const sine = base({ capas: [titulo({ entrada: { preset: "subir", en: 0, duracion: 500, easing: "salidaSine" } })] });
  assert.match(generarScriptAE([sine]), /animacion en keyframes editables/);
  assert.ok(easeDeTramo("salidaSine", 100, 1), "salidaSine convierte a temporal ease");
  assert.ok(easeDeTramo("entradaSalidaBack", 100, 1), "entradaSalidaBack convierte a temporal ease");

  // una pista cruda sobre el preset también fuerza el horneado (se SUMAN)
  const mezcla = base({
    capas: [titulo({
      entrada: { preset: "subir", en: 0, duracion: 500 },
      pistas: { x: [{ t: 0, v: 100 }, { t: 1000, v: 500 }] },
    })],
  });
  assert.match(generarScriptAE([mezcla]), /animacion horneada a keyframes/);
});

test("horneado: el «solo diseño» lo apaga y una capa sin presets sigue con keyframes editables", () => {
  const conPreset = base({ capas: [titulo({ entrada: { preset: "pop", en: 0, duracion: 400 } })] });
  const sinAnim = generarScriptAE([conPreset], undefined, { sinAnimacion: true });
  assert.ok(!/^__pista\(/m.test(sinAnim));
  // sin presets: las pistas crudas siguen saliendo como keyframes con ease
  const crudas = base({ capas: [titulo({ pistas: { x: [{ t: 0, v: 0, easing: "suave" }, { t: 1000, v: 500 }] } })] });
  const jsx = generarScriptAE([crudas]);
  assert.match(jsx, /"ADBE Position_0"\), \[\{t: 0, v: 0, eo: \[0, 40\]\}/);
});

test("la familia CSS con stack va LIMPIA a AE (la fuente real, no el chorizo)", () => {
  const comp = base({
    capas: [
      titulo({ fuente: { familia: "'Yamantaka', -apple-system, 'Segoe UI', Roboto, sans-serif", tamano: 120, peso: 700 } }),
    ],
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /__fijarFuente\(capa, \["Yamantaka-Bold", "YamantakaBold", .*\], "Yamantaka", "Yamantaka \(peso 700\)", "Yamantaka", \[/);
  assert.ok(!jsx.includes("apple-system"), "el stack CSS no viaja");
});

test("los errores de ease ya no mueren en silencio: se juntan y se cantan al final", () => {
  const jsx = generarScriptAE([base({ capas: [titulo()] })]);
  assert.match(jsx, /var __avisos = \[\];/);
  assert.match(jsx, /KeyframeInterpolationType\.BEZIER, KeyframeInterpolationType\.BEZIER/);
  assert.match(jsx, /if \(__avisos\.length\) alert\(/);
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

test("escaleraDePesos: el pedido primero y los vecinos en orden CSS de fallback", () => {
  // 400 prefiere 500 antes de bajar; después los livianos bajando y los pesados subiendo
  assert.deepEqual(escaleraDePesos(400), [400, 500, 300, 200, 100, 600, 700, 800, 900]);
  assert.deepEqual(escaleraDePesos(500), [500, 400, 300, 200, 100, 600, 700, 800, 900]);
  // liviano: baja antes de subir; pesado: sube antes de bajar
  assert.deepEqual(escaleraDePesos(300), [300, 200, 100, 400, 500, 600, 700, 800, 900]);
  assert.deepEqual(escaleraDePesos(700), [700, 800, 900, 600, 500, 400, 300, 200, 100]);
  // un peso raro se acomoda al múltiplo más cercano
  assert.equal(escaleraDePesos(450)[0], 400);
});

test("candidatosDeFuente: el peso pedido primero, la ESCALERA entera después (una familia sin Regular cae al vecino, no a Thin)", () => {
  const inter = candidatosDeFuente("Inter", 400);
  assert.deepEqual(inter.slice(0, 2), ["Inter-Regular", "InterRegular"]);
  // la familia pelada aparece con el grupo del 400 (suele SER el Regular)
  assert.ok(inter.indexOf("Inter") < inter.indexOf("Inter-Medium"));
  // el caso Yamantaka: peso 400 en una familia Thin/Light/Medium/Bold/Heavy
  // tiene que probar Medium y Light ANTES que Thin (orden CSS de cercanía)
  const y = candidatosDeFuente("Yamantaka", 400);
  assert.ok(y.indexOf("Yamantaka-Medium") < y.indexOf("Yamantaka-Light"));
  assert.ok(y.indexOf("Yamantaka-Light") < y.indexOf("Yamantaka-Thin"));
  assert.ok(y.indexOf("Yamantaka-Thin") < y.indexOf("Yamantaka-Bold"));
  const bold = candidatosDeFuente("Space Grotesk", 700);
  assert.deepEqual(bold.slice(0, 2), ["SpaceGrotesk-Bold", "SpaceGroteskBold"]);
  assert.ok(candidatosDeFuente("Archivo", 600).includes("Archivo-SemiBold"));
  assert.ok(candidatosDeFuente("Archivo", 600).includes("Archivo-DemiBold"));
  // sin duplicados
  assert.equal(new Set(bold).size, bold.length);
});

test("fuentes que AE no encuentre: el script las junta y las canta al final", () => {
  const jsx = generarScriptAE([base({ capas: [titulo()] })]);
  assert.match(jsx, /var __fuentesFaltantes = \[\];/);
  assert.match(jsx, /tipografia original: /);
  // familia correcta con otro estilo: se queda con esa cara y lo anota
  assert.match(jsx, /tipografia aproximada: pedida /);
  assert.match(jsx, /if \(__fuentesFaltantes\.length\) alert\(/);
});

test("los avisos técnicos no concatenan el Error nativo (eso ABORTA ExtendScript): pasan por __detalle", () => {
  const jsx = generarScriptAE([base({ capas: [titulo()] })]);
  // el operador + de ExtendScript rechaza los Error nativos de AE con
  // "Object of type Error found where a Number, Array, or Property is
  // needed" (visto en AE real, linea 54): el detalle se lee por .message
  assert.match(jsx, /function __detalle\(e\)/);
  assert.match(jsx, /e\.message !== undefined/);
  assert.match(jsx, /__avisar\("ease", e\)/);
  assert.match(jsx, /__avisar\("bezier", e\)/);
  assert.match(jsx, /__avisar\("hold", e\)/);
  assert.ok(!jsx.includes('+ e);'), "ningún catch concatena el Error a pelo");
});

test("rangoRealDeTramo: los índices no-blancos del tramo se vuelven índices reales del string", () => {
  // "FROZEN RIVALS": RIVALS son los no-blancos 6..12, pero arranca en el char 7
  assert.deepEqual(rangoRealDeTramo("FROZEN RIVALS", 6, 12), [7, 13]);
  assert.deepEqual(rangoRealDeTramo("FROZEN RIVALS", 0, 6), [0, 6]);
  // multilínea: el salto también cuenta como blanco
  assert.deepEqual(rangoRealDeTramo("AB\nCD", 2, 4), [3, 5]);
  // fuera del texto o vacío → rango nulo
  assert.deepEqual(rangoRealDeTramo("ABC", 5, 8), [0, 0]);
  assert.deepEqual(rangoRealDeTramo("ABC", 2, 2), [0, 0]);
});

test("los TRAMOS de rich text viajan como estilos por rango (characterRange), después de la fuente base", () => {
  const comp = base({
    capas: [
      titulo({
        texto: "FROZEN RIVALS",
        fuente: { familia: "Yamantaka", tamano: 120, peso: 400 },
        tramos: [
          { desde: 0, hasta: 6, familia: "Texturina", peso: 700, color: "#ff0000" },
          { desde: 6, hasta: 12, tamano: 90 },
          { desde: 6, hasta: 12 }, // sin cambios: no emite nada
        ],
      }),
    ],
  });
  const jsx = generarScriptAE([comp]);
  // el helper existe y las llamadas van con índices REALES y candidatos del tramo
  assert.match(jsx, /function __tramo\(capaTexto, ini, fin, candidatos, base, original, tamano, color\)/);
  assert.match(jsx, /__tramo\(capa, 0, 6, \["Texturina-Bold", "TexturinaBold", .*\], "Texturina", "Texturina \(peso 700, tramo 0-6 de Titulo\)", null, \[1, 0, 0\]\);/);
  assert.match(jsx, /__tramo\(capa, 7, 13, null, null, "Yamantaka \(peso 400, tramo 6-12 de Titulo\)", 90, null\);/);
  assert.equal((jsx.match(/__tramo\(capa, /g) ?? []).length, 2, "el tramo sin cambios no emite");
  // el orden: la fuente BASE primero, los tramos encima (para que no los pise)
  assert.ok(jsx.indexOf("__fijarFuente(capa, ") < jsx.indexOf("__tramo(capa, "), "fijarFuente antes que los tramos");
  // degradación avisada en AE viejo
  assert.match(jsx, /characterRange \(necesita 24\.3\+\)/);
});

test("media: el encaje es UNIFORME con máscara para «cubrir» (el clip del editor) y entero para «contener»", () => {
  const uri = "data:image/png;base64,AAAA";
  // cajas DISTINTAS: así el flag de cada ajuste se verifica de verdad
  const media = (id: string, ajuste: "cubrir" | "contener", ancho: number, alto: number) => ({
    id, nombre: id, tipo: "media" as const, x: 0, y: 0, mediaId: uri, ancho, alto, ajuste,
  });
  const { jsx } = generarProyectoAE([base({ capas: [media("tapa", "cubrir", 400, 300), media("entera", "contener", 500, 200)] })]);
  // el helper escala uniforme y recorta con máscara centrada cuando sobra
  assert.match(jsx, /function __encajar\(capa, w, h, extra, contener\)/);
  assert.match(jsx, /ADBE Mask Atom/);
  assert.match(jsx, /__encaje = __encajar\(capa, 400, 300, 1, false\);/); // cubrir
  assert.match(jsx, /__encaje = __encajar\(capa, 500, 200, 1, true\);/); // contener
  // ya no queda el estirado por eje de antes
  assert.ok(!jsx.includes("/ Math.max(1, capa.source.width)"), "sin escala por eje");
});

test("la escala ANIMADA de una imagen importada se compone con el encaje (ya no se pierde avisada)", () => {
  const uri = "data:image/png;base64,AAAA";
  const comp = base({
    capas: [{
      id: "star", nombre: "Star 1", tipo: "media", x: 0, y: 0, mediaId: uri,
      ancho: 100, alto: 100, ajuste: "cubrir",
      entrada: { preset: "pop", en: 0, duracion: 400 },
    }],
  });
  const { jsx } = generarProyectoAE([comp]);
  assert.match(jsx, /__pista\(__t\(capa, "ADBE Scale"\), __reescalar\(\[\{t: 0/);
  assert.ok(!jsx.includes("no se horneo (imagen importada)"), "el aviso viejo ya no existe");
  // y con pistas crudas de escala pasa lo mismo
  const cruda = base({
    capas: [{
      id: "m", nombre: "M", tipo: "media", x: 0, y: 0, mediaId: uri, ancho: 100, alto: 100, ajuste: "cubrir",
      pistas: { escala: [{ t: 0, v: 1 }, { t: 500, v: 1.5 }] },
    }],
  });
  assert.match(generarProyectoAE([cruda]).jsx, /__reescalar\(\[\{t: 0, v: \[100, 100\]/);
});

test("__avisar deduplica: ocho capas con el mismo problema son UN renglón del alert", () => {
  const jsx = generarScriptAE([base({ capas: [titulo()] })]);
  assert.match(jsx, /for \(var i = 0; i < __avisos\.length; i\+\+\) if \(__avisos\[i\] === linea\) return;/);
  // y el diagnóstico de fuentes canta qué resolvió AE cuando nada pega
  assert.match(jsx, /ningun candidato existe; AE resolvio /);
});

test("filasDeCapas pliega los subgrupos consecutivos en UNA fila", () => {
  const capas = [
    titulo({ id: "solo1" }),
    titulo({ id: "l1", subgrupo: "g:logo", subgrupoNombre: "Logo" }),
    titulo({ id: "l2", subgrupo: "g:logo", subgrupoNombre: "Logo" }),
    titulo({ id: "l3", subgrupo: "g:logo", subgrupoNombre: "Logo" }),
    titulo({ id: "solo2" }),
  ];
  const filas = filasDeCapas(capas);
  assert.equal(filas.length, 3);
  assert.equal(filas[0].tipo, "capa");
  assert.deepEqual(filas[1].tipo === "grupo" ? { nombre: filas[1].nombre, n: filas[1].capas.length } : null, { nombre: "Logo", n: 3 });
  assert.equal(filas[2].tipo, "capa");
});

test("los subgrupos salen a AE como PRECOMPS: una comp propia y una capa en la escena", () => {
  const comp = base({
    nombre: "Home",
    capas: [
      titulo({ id: "fondo" }),
      titulo({ id: "l1", subgrupo: "g:logo", subgrupoNombre: "Lagermeister" }),
      titulo({ id: "l2", subgrupo: "g:logo", subgrupoNombre: "Lagermeister" }),
    ],
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /addComp\("Home \. Lagermeister", 1920, 1080/);
  assert.match(jsx, /var esc1g0 = comp;/);
  assert.match(jsx, /capa = comp\.layers\.add\(esc1g0\);/);
  assert.match(jsx, /capa\.name = "Lagermeister";/);
  // el precomp entra centrado, identidad
  assert.match(jsx, /add\(esc1g0\);\ncapa\.name = "Lagermeister";\n__t\(capa, "ADBE Position"\)\.setValue\(\[960, 540\]\);/);
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

/* ——— vectores de VERDAD (tanda 2): shapes editables en AE ————————— */

test("una capa vector sale como shape con bezier REAL: vértices centrados, fill y regla even-odd", () => {
  const comp = base({
    capas: [{
      id: "estrella",
      nombre: "Estrella",
      tipo: "vector",
      path: "M0 0L10 0L10 10L0 10Z M2 2L8 2L8 8L2 8Z",
      ancho: 10,
      alto: 10,
      relleno: "#ff0000",
      reglaRelleno: "evenodd",
      x: 100,
      y: 100,
    }],
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /new Shape\(\)/);
  // dos subrutas = dos Shape - Group (el agujero compone con la fill rule)
  assert.equal(jsx.split('ADBE Vector Shape - Group').length - 1, 2);
  // vértices CENTRADOS en el ancla (10×10 → 0,0 pasa a −5,−5)
  assert.match(jsx, /sh\.vertices = \[\[-5, -5\], \[5, -5\], \[5, 5\], \[-5, 5\]\];/);
  assert.match(jsx, /sh\.closed = true;/);
  assert.match(jsx, /ADBE Vector Fill Color/);
  assert.match(jsx, /ADBE Vector Fill Rule"\)\.setValue\(2\)/);
  // sin borde: no hay stroke
  assert.ok(!jsx.includes("ADBE Vector Graphic - Stroke"));
});

test("un vector con borde lleva stroke ANTES del fill (el borde encima, como Figma)", () => {
  const comp = base({
    capas: [{
      id: "v",
      nombre: "V",
      tipo: "vector",
      path: "M0 0L10 0L10 10Z",
      ancho: 10,
      alto: 10,
      relleno: "#00ff00",
      trazoColor: "#0000ff",
      trazoGrosor: 2,
      remate: "redondo",
      x: 0,
      y: 0,
    }],
  });
  const jsx = generarScriptAE([comp]);
  const iStroke = jsx.indexOf("ADBE Vector Graphic - Stroke");
  const iFill = jsx.indexOf("ADBE Vector Graphic - Fill");
  assert.ok(iStroke > -1 && iFill > -1 && iStroke < iFill);
  assert.match(jsx, /ADBE Vector Stroke Line Cap"\)\.setValue\(2\)/);
});

test("el TRAZO exporta su path real (bezier), ya no un rectángulo placeholder", () => {
  const trazo: CapaTrazo = {
    id: "linea",
    nombre: "Linea",
    tipo: "trazo",
    path: "M0 0C10 0 30 20 40 20",
    ancho: 40,
    alto: 20,
    color: "#ffffff",
    grosor: 3,
    largo: 50,
    x: 200,
    y: 200,
  };
  const jsx = generarScriptAE([base({ capas: [trazo] })]);
  assert.match(jsx, /new Shape\(\)/);
  // tangentes de la curva, relativas (10,0) y (−10,0)
  assert.match(jsx, /sh\.outTangents = \[\[10, 0\], \[0, 0\]\];/);
  assert.match(jsx, /sh\.inTangents = \[\[0, 0\], \[-10, 0\]\];/);
  assert.ok(!jsx.includes("ADBE Vector Shape - Rect") || !jsx.includes("pendiente de traducir: path SVG real"));
  assert.match(jsx, /ADBE Vector Filter - Trim/);
  // el comentario de pendientes ya no anuncia el rectángulo
  assert.ok(!jsx.includes("path SVG real (aca va un rectangulo)"));
});

test("el CONTADOR exporta como Slider + expression en el Source Text", () => {
  const comp = base({
    capas: [titulo({
      texto: "STOCK:171",
      pistas: { numero: [{ t: 0, v: 171, easing: "salidaExpo" }, { t: 1500, v: 0 }] },
    })],
  });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /ADBE Slider Control/);
  assert.match(jsx, /Contador/);
  assert.match(jsx, /expression = /);
  assert.match(jsx, /STOCK:171/);
  assert.match(jsx, /Math\.round\(effect\(/);
});

/* ——— la fuente por app.fonts (AE 24+): familia+estilo real, sin adivinar — */

test("estilosDeFuente: el estilo EXACTO de Figma primero, después la escalera del peso", async () => {
  const { estilosDeFuente } = await import("@/lib/motion/exportar-ae-puro");
  const conEstilo = estilosDeFuente(700, "Condensed Heavy");
  assert.equal(conEstilo[0], "Condensed Heavy");
  assert.ok(conEstilo.includes("Bold"));
  assert.ok(conEstilo.includes("Regular"));
  // sin estilo: arranca por el peso pedido, sin duplicados
  const sinEstilo = estilosDeFuente(400);
  assert.equal(sinEstilo[0], "Regular");
  assert.equal(new Set(sinEstilo).size, sinEstilo.length);
});

test("el .jsx busca la fuente MODERNA (fontObject por familia+estilo) y el ease usa las dimensiones REALES", () => {
  const comp = base({
    capas: [titulo({ fuente: { familia: "'Yamantaka', sans-serif", tamano: 60, peso: 700, estilo: "Heavy" } })],
  });
  const jsx = generarScriptAE([comp]);
  // el helper moderno con su fallback
  assert.match(jsx, /getFontsByFamilyNameAndStyleName/);
  assert.match(jsx, /fontObject/);
  assert.match(jsx, /allFonts/);
  // la llamada lleva la FAMILIA con espacios reales y el estilo exacto primero
  assert.match(jsx, /__fijarFuente\(capa, \[[^\]]*\], "Yamantaka", "Yamantaka \(peso 700\)", "Yamantaka", \["Heavy", "Bold"/);
  // el ease por dimensiones reales de la propiedad (Escala [x,y,z] en AE 2026)
  assert.match(jsx, /__nEases/);
  assert.match(jsx, /dimsReales/);
});

test("figma v10: el estilo de la cara viaja del plugin a la capa", async () => {
  const { normalizarFigma, PLUGIN_ESPERADO } = await import("@/lib/motion/figma-puro");
  assert.equal(PLUGIN_ESPERADO, 10);
  const res = normalizarFigma({
    origen: "figma",
    version: 1,
    plugin: 10,
    frame: { nombre: "F", ancho: 400, alto: 300, fondo: "#000" },
    nodos: [{
      tipo: "texto", nombre: "T", x: 10, y: 10, ancho: 200, alto: 40,
      texto: { contenido: "HOLA", familia: "Yamantaka", estilo: "Condensed Heavy", peso: 800, tamano: 30, alineacion: "centro", color: "#fff" },
    }],
  } as never);
  const capa = res.composicion.capas.find((c) => c.tipo === "texto") as CapaTexto;
  assert.equal(capa.fuente.estilo, "Condensed Heavy");
});

test("fpsAnimacion: la comp de AE se crea a los fps de la animación (idioma «en doses»)", () => {
  const comp = base({ fpsAnimacion: 12, capas: [titulo()] });
  const jsx = generarScriptAE([comp]);
  assert.match(jsx, /addComp\("Prueba AE", 1920, 1080, 1, 4, 12\)/);
  // sin fpsAnimacion, a los fps del render
  assert.match(generarScriptAE([base({ capas: [titulo()] })]), /addComp\("Prueba AE", 1920, 1080, 1, 4, 30\)/);
});
