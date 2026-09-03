import { test } from "node:test";
import assert from "node:assert/strict";
import { camaraDeEncuadres, describirEncuadres, encuadrarEnPantalla, marcarEncuadre, quitarEncuadre } from "@/lib/motion/encuadres-puro";
import { crearComposicion, describir } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import { auditarDireccion } from "@/lib/motion/auditoria-puro";
import type { Composicion } from "@/lib/motion/modelo";

function landing(): Composicion {
  let comp = crearComposicion({ nombre: "landing" });
  comp = ejecutarHerramienta(comp, "ajustar_composicion", { duracion: 16000 }).comp;
  comp = ejecutarHerramienta(comp, "agregar_capa_forma", { id: "p", forma: "rect", x: 720, y: 1614.5, ancho: 1440, alto: 900 }).comp;
  comp = { ...comp, capas: comp.capas.map((c) => (c.id === "p" && c.tipo === "forma" ? { ...c, nombre: "lemlist", alto: 3229, grupo: "p" } : c)) };
  return comp;
}

test("marcar y quitar escenas: ids e índices en orden, valores redondeados, la lista desaparece al vaciarse", () => {
  let comp = landing();
  comp = marcarEncuadre(comp, { x: 720.004, y: 330, zoom: 1.7 });
  comp = marcarEncuadre(comp, { x: 720, y: 830, zoom: 1.45 }, "Editor");
  assert.deepEqual(comp.encuadres?.map((e) => [e.id, e.nombre, e.x, e.zoom]), [["esc-1", "Escena 1", 720, 1.7], ["esc-2", "Editor", 720, 1.45]]);
  const sin = quitarEncuadre(quitarEncuadre(comp, "esc-1"), "esc-2");
  assert.equal(sin.encuadres, undefined);
  // el estado que lee el director las lista con lo que ve la cámara
  const lineas = describirEncuadres(comp);
  assert.equal(lineas.length, 3);
  assert.match(lineas[1], /1\. «Escena 1» \(id esc-1\): centro \(720, 330\) zoom 1\.7 → ve 1129×635 px del lienzo, x 155–1285/);
  // y la zona segura de cada encuadre (5 % del cuadro por lado)
  assert.match(lineas[1], /zona segura x 212–1228, y 44–616/);
  assert.ok(describir(comp).includes("ENCUADRES MARCADOS por el usuario (2 escenas"));
  assert.deepEqual(describirEncuadres(landing()), []);
});

test("camaraDeEncuadres: holds en cada escena y viajes de viajeMs antes de la siguiente, con easing; errores claros", () => {
  let comp = landing();
  comp = marcarEncuadre(comp, { x: 720, y: 330, zoom: 1.7 });
  comp = marcarEncuadre(comp, { x: 720, y: 830, zoom: 1.45 });
  comp = marcarEncuadre(comp, { x: 720, y: 2890, zoom: 1.5 });
  const res = camaraDeEncuadres(comp, [
    { escena: 1, desde: 0, hasta: 3700 },
    { escena: 2, desde: 3700, hasta: 8000 },
    { escena: "esc-3", desde: 9000, hasta: 16000 },
  ], { viajeMs: 1100, easing: "entradaSalidaQuart", temblor: { preset: "flotar", intensidad: 0.4 } });
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  const y = res.camara.pistas.y ?? [];
  // escena 1: hold 0→2600 (3700 − 1100), viaje hasta 3700; escena 2: hold 3700→7900; escena 3: 9000→16000
  assert.deepEqual(y.map((k) => [k.t, k.v, k.easing ?? null]), [
    [0, 330, null], [2600, 330, "entradaSalidaQuart"],
    [3700, 830, null], [7900, 830, "entradaSalidaQuart"],
    [9000, 2890, null], [16000, 2890, null],
  ]);
  assert.equal(res.camara.pistas.zoom?.[2].v, 1.45);
  assert.deepEqual(res.camara.base, { x: 720, y: 330, zoom: 1.7 });
  assert.equal(res.camara.temblor?.preset, "flotar");
  // errores
  assert.match((camaraDeEncuadres(landing(), [{ escena: 1, desde: 0, hasta: 100 }]) as { error: string }).error, /no hay encuadres marcados/);
  assert.match((camaraDeEncuadres(comp, [{ escena: 9, desde: 0, hasta: 100 }]) as { error: string }).error, /escena «9» no existe \(hay 3/);
});

test("la herramienta recorrer_encuadres arma la cámara y la auditoría de encuadre queda limpia", () => {
  let comp = landing();
  comp = marcarEncuadre(comp, { x: 720, y: 330, zoom: 1.7 });
  comp = marcarEncuadre(comp, { x: 720, y: 830, zoom: 1.45 });
  const res = ejecutarHerramienta(comp, "recorrer_encuadres", {
    tramos: [{ escena: 1, desde: 0, hasta: 3700 }, { escena: 2, desde: 3700, hasta: 8000 }],
    temblor: { preset: "flotar", intensidad: 0.35 },
  });
  assert.ok(!res.esError, res.resultado);
  assert.match(res.resumen ?? "", /cámara por encuadres marcados: 2 escenas/);
  assert.equal(res.comp.camara?.pistas.x?.length, 4);
  assert.deepEqual(auditarDireccion(res.comp).filter((h) => h.startsWith("ENCUADRE")), []);
  const sinEncuadres = ejecutarHerramienta(landing(), "recorrer_encuadres", { tramos: [{ escena: 1, desde: 0, hasta: 100 }] });
  assert.ok(sinEncuadres.esError);
});

test("encuadrarEnPantalla corrige lo que Flash escribió a ojo: x 960 → 720 y el vacío de arriba, sin tocar el zoom", () => {
  let comp = landing();
  // la cámara del log de Gabriel: centro 960 (el render), y 400 zoom 1.35 con viajes
  comp = ejecutarHerramienta(comp, "definir_camara", {
    base: { x: 960, y: 400, zoom: 1.35 },
    y: [{ t: 0, v: 300 }, { t: 3000, v: 300, easing: "entradaSalidaCubic" }, { t: 4200, v: 800 }, { t: 16000, v: 2840 }],
    zoom: [{ t: 0, v: 1.35 }, { t: 3000, v: 1.35 }, { t: 4200, v: 1.25 }, { t: 16000, v: 1.4 }],
  }).comp;
  const antes = auditarDireccion(comp).filter((h) => h.startsWith("ENCUADRE DESCENTRADO"));
  assert.ok(antes.length >= 1, "antes hay hallazgos");
  const { comp: corregida, ajustes } = encuadrarEnPantalla(comp);
  assert.ok(ajustes >= 2, `ajustes ${ajustes}`);
  assert.equal(corregida.camara?.base?.x, 720, "x sin keyframes: la base pasa al centro de la pantalla");
  // y 300 a zoom 1.35 veía desde −100: sube hasta que el borde superior sea 0 (400)
  assert.equal(corregida.camara?.pistas.y?.[0].v, 400);
  // y 2840 a zoom 1.4 veía hasta 3226: ya cabe (3229) → se queda
  assert.equal(corregida.camara?.pistas.y?.[3].v, 2840);
  assert.deepEqual(corregida.camara?.pistas.zoom?.map((k) => k.v), [1.35, 1.35, 1.25, 1.4], "el zoom no se toca");
  // lo que queda es solo lo que el zoom decide (a 1.25 el cuadro es más ancho
  // que la landing y el fondo se ve como BANDAS): el encuadre automático no
  // toca el zoom, eso lo corrige el director
  const restantes = auditarDireccion(corregida).filter((h) => h.startsWith("ENCUADRE DESCENTRADO"));
  assert.deepEqual(restantes.filter((h) => !h.includes("BANDAS")), []);
  assert.equal(restantes.length, 1);
  assert.match(restantes[0], /BANDAS de 48 px a cada costado/);
  // sin cámara o sin placas, no hace nada
  assert.equal(encuadrarEnPantalla(landing()).ajustes, 0);
});

test("serializar/deserializar conserva la BASE y el TEMBLOR de la cámara (antes se perdían en cada ida y vuelta)", async () => {
  const { serializar, deserializar } = await import("@/lib/motion/serializar-puro");
  let comp = landing();
  comp = ejecutarHerramienta(comp, "definir_camara", {
    base: { x: 720, y: 330, zoom: 1.7 },
    y: [{ t: 2000, v: 330 }, { t: 0, v: 330 }],
    temblor: { preset: "flotar", intensidad: 0.35, velocidad: 0.8 },
  }).comp;
  const vuelta = deserializar(serializar(comp));
  assert.deepEqual(vuelta.camara?.base, { x: 720, y: 330, zoom: 1.7 });
  assert.equal(vuelta.camara?.temblor?.preset, "flotar");
  assert.deepEqual(vuelta.camara?.pistas.y?.map((k) => k.t), [0, 2000], "las pistas siguen ordenadas");
  assert.deepEqual(vuelta.encuadres, undefined);
  const conEscenas = marcarEncuadre(comp, { x: 720, y: 330, zoom: 1.7 });
  assert.equal(deserializar(serializar(conEscenas)).encuadres?.[0].id, "esc-1");
});
