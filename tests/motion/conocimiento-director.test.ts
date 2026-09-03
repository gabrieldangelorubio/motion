import { test } from "node:test";
import assert from "node:assert/strict";
import { LECCIONES, bloqueDeLecciones } from "@/lib/motion/conocimiento-director-puro";
import { SISTEMA } from "@/lib/motion/agente";
import { sistemaGuionista } from "@/lib/motion/guionista-puro";

test("las lecciones guardadas entran en el SISTEMA del director (iterativo) y en el del guionista (los tres proveedores)", () => {
  assert.ok(LECCIONES.length >= 8);
  for (const l of LECCIONES) {
    assert.ok(l.cuando && l.pieza && l.leccion.length > 40, `lección incompleta: ${JSON.stringify(l)}`);
    assert.ok(SISTEMA.includes(l.leccion), `falta en SISTEMA: ${l.leccion.slice(0, 40)}`);
  }
  assert.ok(SISTEMA.includes("# LECCIONES APRENDIDAS"));
  assert.ok(sistemaGuionista(SISTEMA).includes("# LECCIONES APRENDIDAS"));
  // una línea por lección, con la pieza que la enseñó
  const bloque = bloqueDeLecciones([{ cuando: "hoy", pieza: "prueba", leccion: "hacé esto porque aquello" }]);
  assert.equal(bloque.split("\n")[1], "- [prueba] hacé esto porque aquello");
});
