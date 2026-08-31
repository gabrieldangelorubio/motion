import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_FRAMES_REFERENCIA,
  contextoDeReferencias,
  instantesDeMuestreo,
  necesitaSeek,
  tipoPorNombre,
} from "@/lib/motion/referencias-puro";
import { armarPrimerUsuario } from "@/lib/motion/agente";
import { partesDeUsuario } from "@/lib/motion/agente-gemini";
import type { Composicion } from "@/lib/motion/modelo";

const comp: Composicion = {
  version: 1, nombre: "Ref", ancho: 1920, alto: 1080, fps: 30, duracion: 4000, fondo: "#101015",
  capas: [{
    id: "t", nombre: "Titulo", tipo: "texto", texto: "HOLA", x: 960, y: 540,
    fuente: { familia: "Arial", tamano: 60, peso: 700 }, color: "#fff", division: "ninguna",
  }],
};

/* ——— muestreo del video de referencia ————————————————————————— */

test("instantesDeMuestreo: uniforme, arranca en 0 y termina ANTES del final exacto", () => {
  const tiempos = instantesDeMuestreo(3000);
  assert.equal(tiempos.length, MAX_FRAMES_REFERENCIA);
  assert.equal(tiempos[0], 0);
  const ultimo = tiempos[tiempos.length - 1];
  assert.ok(ultimo <= 3000 * 0.98 && ultimo > 2800, `el último evita el frame final (${ultimo})`);
  // monótono creciente, sin repetidos
  for (let i = 1; i < tiempos.length; i++) assert.ok(tiempos[i] > tiempos[i - 1]);
});

test("instantesDeMuestreo: un video corto muestrea menos (nunca más de un frame cada 150ms)", () => {
  const corto = instantesDeMuestreo(500);
  assert.ok(corto.length <= 4 && corto.length >= 2, `500ms → pocos frames (${corto.length})`);
  assert.deepEqual(instantesDeMuestreo(0), [0]); // duración rota: degrada
});

test("necesitaSeek: el instante donde el video YA está no se busca (pedir seek al mismo tiempo puede no disparar seeked)", () => {
  // el caso del cuelgue: video recién cargado (posición 0) y primer instante 0
  assert.ok(!necesitaSeek(0, 0), "el 0 inicial no espera seeked");
  assert.ok(necesitaSeek(0, 450), "un destino distinto sí busca");
  assert.ok(!necesitaSeek(450.4, 450), "sub-milisegundo = mismo frame");
});

test("tipoPorNombre: un .mov con File.type vacío se infiere por extensión (rechazarlo mentiría)", () => {
  assert.equal(tipoPorNombre("spot final.mov"), "video/quicktime");
  assert.equal(tipoPorNombre("clip.MP4"), "video/mp4");
  assert.equal(tipoPorNombre("poster.jpg"), "image/jpeg");
  assert.equal(tipoPorNombre("raro.xyz"), "");
  assert.equal(tipoPorNombre("sin-extension"), "");
});

/* ——— el contexto que acompaña a los frames ————————————————————— */

test("contextoDeReferencias: el video declara sus tiempos EN ORDEN; la imagen, su lectura compositiva", () => {
  const video = contextoDeReferencias([
    { nombre: "nike-spot", tipo: "video", duracionMs: 3200, instantes: [0, 1600, 3136] },
  ]);
  assert.match(video, /REFERENCIA ADJUNTA «nike-spot» \(video de 3\.2s\)/);
  assert.match(video, /EN ORDEN cronológico/);
  assert.match(video, /0\.00s, 1\.60s, 3\.14s/);
  const imagen = contextoDeReferencias([{ nombre: "poster", tipo: "imagen" }]);
  assert.match(imagen, /imagen quieta/);
  assert.equal(contextoDeReferencias([]), "");
});

/* ——— qué ve el director ————————————————————————————————————— */

test("armarPrimerUsuario intercala las referencias entre el estilo y el pedido", () => {
  const texto = armarPrimerUsuario(
    comp,
    "que el título entre como en la referencia",
    "palabra @ 200ms",
    "SENSACIÓN de la pieza: snappy",
    contextoDeReferencias([{ nombre: "spot", tipo: "video", duracionMs: 2000, instantes: [0, 1960] }]),
  );
  assert.match(texto, /Estado actual de la composición:/);
  assert.match(texto, /LA LOCUCIÓN/);
  assert.match(texto, /SENSACIÓN de la pieza: snappy/);
  assert.match(texto, /REFERENCIA ADJUNTA «spot»/);
  assert.match(texto, /Pedido: que el título entre como en la referencia$/);
  // el orden: la referencia ANTES del pedido (el pedido la nombra)
  assert.ok(texto.indexOf("REFERENCIA ADJUNTA") < texto.indexOf("Pedido:"));
  // sin referencias, ni rastro
  assert.ok(!armarPrimerUsuario(comp, "hola").includes("REFERENCIA"));
});

test("los frames de referencia viajan a Gemini como inlineData ANTES del texto (mismo camino que la revisión)", () => {
  const partes = partesDeUsuario("Pedido: como la ref", [
    { mime: "image/jpeg", datosBase64: "AAAA" },
    { mime: "image/jpeg", datosBase64: "BBBB" },
  ]);
  assert.equal(partes.length, 3);
  assert.deepEqual(partes[0], { inlineData: { mimeType: "image/jpeg", data: "AAAA" } });
  assert.deepEqual(partes[2], { text: "Pedido: como la ref" });
});
