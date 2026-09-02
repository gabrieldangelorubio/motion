/* Tests del FORMATO del render (tanda F1): presets, el formato como decisión
   del proyecto, y el encuadre automático de una pantalla importada. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMATOS, camaraParaLienzoNuevo, conFormato, encuadrarCamara, encuadreDePantalla, esPagina, formatoDe } from "@/lib/motion/formato-puro";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";

test("presets y formatoDe: el id exacto o «medida»", () => {
  assert.equal(FORMATOS.length, 4);
  assert.equal(formatoDe({ ancho: 1920, alto: 1080 }), "16:9");
  assert.equal(formatoDe({ ancho: 1080, alto: 1920 }), "9:16");
  assert.equal(formatoDe({ ancho: 1440, alto: 9000 }), "medida");
});

test("conFormato acota, redondea y NO toca las capas", () => {
  const comp = { ...crearComposicion({ nombre: "f" }), capas: [{ id: "a", nombre: "A", tipo: "forma" as const, forma: "rectangulo" as const, ancho: 10, alto: 10, color: "#fff", x: 0, y: 0 }] };
  const nueva = conFormato(comp, 1080.4, 999999);
  assert.equal(nueva.ancho, 1080);
  assert.equal(nueva.alto, 8192);
  assert.equal(nueva.capas, comp.capas, "las capas viven en el lienzo: mismas referencias");
  assert.equal(conFormato(comp, NaN, 20).ancho, 1920, "no finito: conserva");
  assert.equal(conFormato(comp, NaN, 20).alto, 64, "mínimo 64");
});

test("encuadreDePantalla: una PÁGINA se ve a lo ancho desde arriba; lo demás, entero y centrado", () => {
  const comp = { ancho: 1920, alto: 1080 };
  // landing 1440×9000 con placa centrada en (720, 4500)
  const landing = { x: 720, y: 4500, ancho: 1440, alto: 9000 };
  assert.ok(esPagina(landing));
  const e = encuadreDePantalla(comp, landing);
  assert.ok(Math.abs(e.zoom - 1920 / 1440) < 1e-9, "fit al ancho");
  assert.equal(e.x, 720);
  assert.ok(Math.abs(e.y - (0 + 1080 / (1920 / 1440) / 2)) < 1e-9, "arranca arriba: el centro del frame a media altura visible");
  // un frame de teléfono 390×844: cabe entero (contain), centrado
  const tel = { x: 195, y: 422, ancho: 390, alto: 844 };
  assert.ok(!esPagina(tel));
  const c = encuadreDePantalla(comp, tel);
  assert.ok(Math.abs(c.zoom - 1080 / 844) < 1e-9, "manda el eje que limita");
  assert.equal(c.x, 195);
  assert.equal(c.y, 422);
  // una pantalla del formato exacto: zoom 1
  assert.equal(encuadreDePantalla(comp, { x: 960, y: 540, ancho: 1920, alto: 1080 }).zoom, 1);
  // un formato vertical con la misma landing: sigue siendo fit al ancho
  const v = encuadreDePantalla({ ancho: 1080, alto: 1920 }, landing);
  assert.ok(Math.abs(v.zoom - 1080 / 1440) < 1e-9);
});

test("ajustar_composicion acepta ancho/alto (el director puede fijar el formato)", () => {
  const res = ejecutarHerramienta(crearComposicion({ nombre: "f" }), "ajustar_composicion", { ancho: 1080, alto: 1920 });
  assert.ok(!res.esError);
  assert.equal(res.comp.ancho, 1080);
  assert.equal(res.comp.alto, 1920);
  assert.match(res.resultado, /1080×1920/);
  const loco = ejecutarHerramienta(crearComposicion({ nombre: "f" }), "ajustar_composicion", { ancho: 5, alto: 99999 });
  assert.equal(loco.comp.ancho, 64);
  assert.equal(loco.comp.alto, 8192);
});

test("cámara para lienzo nuevo: base encuadrada y SIN keyframes viejos; encuadrar con auto-key (review)", () => {
  const comp = { ...crearComposicion({ nombre: "f" }), camara: { pistas: { x: [{ t: 0, v: 10 }, { t: 1000, v: 900 }] } } };
  const tel = { x: 195, y: 422, ancho: 390, alto: 844 };
  const nueva = camaraParaLienzoNuevo(comp, tel);
  assert.deepEqual(nueva.pistas, {}, "los keyframes de un lienzo vaciado no viajan");
  assert.equal(nueva.base!.x, 195);

  // encuadrar SOBRE una cámara con keyframes en x: x recibe keyframe en t, y/zoom van a la base
  const encuadrada = encuadrarCamara(comp, tel, 500);
  const kfsX = encuadrada.camara!.pistas.x!;
  assert.ok(kfsX.some((k) => k.t === 500 && k.v === 195), "x tenía pistas: keyframe en el playhead");
  assert.equal(encuadrada.camara!.base!.y, 422, "y sin pistas: base");
  assert.ok(Math.abs(encuadrada.camara!.base!.zoom! - 1080 / 844) < 1e-9);
  // sin cámara previa: todo a la base
  const limpia = encuadrarCamara(crearComposicion({ nombre: "g" }), tel, 0);
  assert.deepEqual(limpia.camara!.pistas, {});
  assert.equal(limpia.camara!.base!.x, 195);
});
