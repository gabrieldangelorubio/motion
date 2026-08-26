import { test } from "node:test";
import assert from "node:assert/strict";
import { familiaPrincipal, familiasDeComposicion, parsearFontFaces } from "@/lib/motion/fuentes-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import type { CapaTexto, Composicion } from "@/lib/motion/modelo";

const texto = (familia: string, peso: number, id: string): CapaTexto => ({
  id, nombre: id, tipo: "texto", texto: "x",
  fuente: { familia, tamano: 40, peso },
  color: "#fff", division: "ninguna", x: 0, y: 0,
});

test("familiaPrincipal saca la primera familia real y descarta stacks del sistema", () => {
  assert.equal(familiaPrincipal("'Neue Machina', -apple-system, sans-serif"), "Neue Machina");
  assert.equal(familiaPrincipal('"Inter", sans-serif'), "Inter");
  assert.equal(familiaPrincipal("-apple-system, 'Segoe UI', Roboto, sans-serif"), null);
  assert.equal(familiaPrincipal("sans-serif"), null);
});

test("familiasDeComposicion junta pesos por familia y saltea capas no-texto", () => {
  const comp: Composicion = {
    ...crearComposicion({ nombre: "f" }),
    capas: [
      texto("'Neue Machina', sans-serif", 800, "a"),
      texto("'Neue Machina', sans-serif", 400, "b"),
      texto("'Inter', sans-serif", 700, "c"),
      { id: "d", nombre: "d", tipo: "forma", forma: "rectangulo", ancho: 1, alto: 1, color: "#000", x: 0, y: 0 },
    ],
  };
  assert.deepEqual(familiasDeComposicion(comp), [
    { familia: "Neue Machina", pesos: [400, 800] },
    { familia: "Inter", pesos: [700] },
  ]);
});

test("parsearFontFaces extrae url, peso, estilo y rango de un CSS de Google Fonts", () => {
  const css = `
/* latin */
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  src: url(https://fonts.gstatic.com/s/inter/v20/abc.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
@font-face {
  font-family: 'Inter';
  font-style: italic;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/inter/v20/def.woff2) format('woff2');
}`;
  const caras = parsearFontFaces(css);
  assert.equal(caras.length, 2);
  assert.equal(caras[0].peso, "100 900");
  assert.equal(caras[0].rango, "U+0000-00FF");
  assert.match(caras[0].url, /abc\.woff2/);
  assert.equal(caras[1].estilo, "italic");
});

test("un CSS sin @font-face devuelve lista vacía (control negativo)", () => {
  assert.deepEqual(parsearFontFaces("body { color: red }"), []);
});
