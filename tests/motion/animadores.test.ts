import { test } from "node:test";
import assert from "node:assert/strict";
import { animadorDeSegmento, animadoresDeCapa, contarUnidades } from "@/lib/motion/animadores-ae-puro";
import { generarScriptAE } from "@/lib/motion/exportar-ae-puro";
import type { CapaTexto, Composicion } from "@/lib/motion/modelo";

const capa = (extra: Partial<CapaTexto> = {}): CapaTexto => ({
  id: "t",
  nombre: "Titulo",
  tipo: "texto",
  texto: "HOLA QUE TAL",
  x: 960,
  y: 540,
  fuente: { familia: "Arial", tamano: 60, peso: 700 },
  color: "#fff",
  division: "palabras",
  alineacion: "centro",
  ...extra,
});

const comp = (capas: CapaTexto[]): Composicion => ({
  version: 1, nombre: "Anim", ancho: 1920, alto: 1080, fps: 30, duracion: 4000, fondo: "#101015", capas,
});

test("contarUnidades: caracteres sin espacios, palabras y líneas", () => {
  assert.equal(contarUnidades("HOLA QUE TAL", "caracteres"), 10);
  assert.equal(contarUnidades("HOLA QUE TAL", "palabras"), 3);
  assert.equal(contarUnidades("uno\ndos\ntres", "lineas"), 3);
  assert.equal(contarUnidades("lo que sea", "ninguna"), 1);
});

test("animadorDeSegmento traduce «subir»: posición y opacidad extremas + Start barriendo la ventana total", () => {
  const a = animadorDeSegmento(capa(), { preset: "subir", en: 200, duracion: 600, escalonado: 40 }, "entrada")!;
  assert.ok(a);
  assert.equal(a.basadoEn, 3); // palabras
  assert.equal(a.canalSelector, "ADBE Text Percent Start");
  assert.deepEqual(a.props.find(([n]) => n === "ADBE Text Position 3D")?.[1], [0, 90]);
  assert.equal(a.props.find(([n]) => n === "ADBE Text Opacity")?.[1], 0);
  // ventana: duracion + escalonado × (3 palabras − 1)
  assert.deepEqual(a.claves, [{ t: 200, v: 0 }, { t: 200 + 600 + 80, v: 100 }]);
  assert.equal(a.avisos.length, 0);
});

test("la SALIDA anima el End (la selección crece y las unidades van saliendo)", () => {
  const a = animadorDeSegmento(capa(), { preset: "hundir", en: 3000, duracion: 400 }, "salida")!;
  assert.equal(a.canalSelector, "ADBE Text Percent End");
  // extremo p=1: a dónde va la salida
  const pos = a.props.find(([n]) => n === "ADBE Text Position 3D")?.[1] as number[];
  assert.ok(Math.abs(pos[1]) > 0, `la salida corre la posición (${pos})`);
});

test("revelar con división: la máscara degrada a opacidad CON AVISO; azar prende Randomize", () => {
  const a = animadorDeSegmento(capa(), { preset: "revelar", en: 0, duracion: 500, ordenEscalonado: "azar" }, "entrada")!;
  assert.equal(a.props.find(([n]) => n === "ADBE Text Opacity")?.[1], 0);
  assert.ok(a.avisos.some((x) => /mascara/.test(x)));
  assert.ok(a.azar);
  // sin división NO hay animador
  assert.equal(animadorDeSegmento(capa({ division: "ninguna" }), { preset: "revelar", en: 0, duracion: 500 }, "entrada"), null);
});

test("el .jsx emite el TEXT ANIMATOR nativo y NO hornea ese segmento como bloque", () => {
  const jsx = generarScriptAE([comp([capa({
    entrada: { preset: "subir", en: 200, duracion: 600, escalonado: 40, easing: "salidaExpo" },
  })])]);
  assert.match(jsx, /__animador\(capa, "entrada subir", 3, false, "ADBE Text Percent Start", \[\["ADBE Text Position 3D", \[0, 90\]\], \["ADBE Text Opacity", 0\]\]/);
  // el selector barre 0→100 con el ease del segmento
  assert.match(jsx, /"ADBE Text Percent Start", \[.*\{t: 0\.2, v: 0, eo: \[/);
  // la entrada NO viaja además como keyframes de transform (sería doble)
  assert.ok(!/animacion (en keyframes editables|horneada)/.test(jsx), "no hay horneado de bloque del segmento");
  assert.match(jsx, /entrada subir como TEXT ANIMATOR nativo \(3 palabras\)/);
  // la cabecera trae el helper completo
  assert.match(jsx, /ADBE Text Animators/);
  assert.match(jsx, /ADBE Text Range Type2/);
});

test("entrada como animator + pista cruda: la pista sigue viajando por transform", () => {
  const jsx = generarScriptAE([comp([capa({
    entrada: { preset: "aparecer", en: 0, duracion: 400 },
    pistas: { x: [{ t: 0, v: 100 }, { t: 2000, v: 500 }] },
  })])]);
  assert.match(jsx, /__animador\(capa, "entrada aparecer"/);
  // la pista cruda de x sigue en la posición de la capa
  assert.match(jsx, /ADBE Position/);
});

test("animadoresDeCapa junta entrada y salida; texto sin división queda vacío", () => {
  const dos = animadoresDeCapa(capa({
    entrada: { preset: "subir", en: 0, duracion: 500 },
    salida: { preset: "hundir", en: 3000, duracion: 400 },
  }));
  assert.equal(dos.length, 2);
  assert.deepEqual(dos.map((a) => a.clase), ["entrada", "salida"]);
  assert.equal(animadoresDeCapa(capa({ division: "ninguna", entrada: { preset: "subir", en: 0, duracion: 500 } })).length, 0);
});

/* ——— estirados por letra (la O ancha del logo) ————————————————— */

test("estiradosDeCapa: el rango en % sobre los caracteres sin espacios, escala en %", async () => {
  const { estiradosDeCapa } = await import("@/lib/motion/animadores-ae-puro");
  const c = capa({ texto: "SNOG", deformaciones: [{ desde: 2, hasta: 3, escalaX: 2 }] });
  const [e] = estiradosDeCapa(c);
  assert.equal(e.desdePct, 50); // 2/4
  assert.equal(e.hastaPct, 75); // 3/4
  assert.deepEqual(e.escala, [200, 100]);
  // sin deformaciones (o neutras) no hay nada
  assert.equal(estiradosDeCapa(capa()).length, 0);
  assert.equal(estiradosDeCapa(capa({ deformaciones: [{ desde: 0, hasta: 1 }] })).length, 0);
});

test("el .jsx emite __estirar con el selector clavado en la letra", () => {
  const jsx = generarScriptAE([comp([capa({
    texto: "SNOG",
    division: "ninguna",
    deformaciones: [{ desde: 2, hasta: 3, escalaX: 2, escalaY: 1.2 }],
  })])]);
  assert.match(jsx, /__estirar\(capa, "estirar 2-3", 50, 75, \[200, 120\]\);/);
  assert.match(jsx, /ADBE Text Percent End/); // el helper está en la cabecera
});
