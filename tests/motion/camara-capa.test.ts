import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import {
  agregarKeyframeCamara,
  borrarGrupo,
  fijarValorCamara,
  moverCapas,
  moverCapasJuntoA,
  moverKeyframeCamara,
  moverPoseCamara,
  ponerKeyframe,
  poseCamaraEn,
  quitarKeyframe,
  quitarPoseCamara,
  describir,
} from "@/lib/motion/herramientas-puro";
import { sumarAlLienzo, type ResultadoImport } from "@/lib/motion/figma-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import type { Composicion } from "@/lib/motion/modelo";

const base = (): Composicion => ({
  version: 1,
  nombre: "lienzo",
  ancho: 1920,
  alto: 1080,
  fps: 30,
  duracion: 5000,
  fondo: "#000000",
  capas: [],
});

/* ——— La cámara como capa: base + auto-key ——— */

test("la base de la cámara define el encuadre sin animar; las pistas la pisan", () => {
  const comp: Composicion = { ...base(), camara: { base: { x: 3000, zoom: 2 }, pistas: {} } };
  const cam = estadoEn(comp, 1000).camara;
  assert.equal(cam.x, 3000);
  assert.equal(cam.y, 540, "canal sin base cae al centro del lienzo");
  assert.equal(cam.zoom, 2);

  const conPista: Composicion = {
    ...comp,
    camara: { ...comp.camara!, pistas: { x: [{ t: 0, v: 100 }, { t: 1000, v: 500, easing: "lineal" }] } },
  };
  assert.equal(estadoEn(conPista, 0).camara.x, 100, "la pista pisa la base");
  assert.equal(estadoEn(conPista, 0).camara.zoom, 2, "el canal sin pista sigue en su base");
});

test("fijarValorCamara hace auto-key: sin keyframes edita la base, con keyframes agrega/pisa en t", () => {
  // sin pistas → base (mover la cámara no arranca una animación sola)
  const soloBase = fijarValorCamara(base(), "x", 1000, 2500);
  assert.equal(soloBase.camara?.base?.x, 2500);
  assert.equal(soloBase.camara?.pistas.x, undefined);

  // con pista → keyframe nuevo en t…
  const conPista: Composicion = { ...base(), camara: { pistas: { x: [{ t: 0, v: 100 }] } } };
  const conKf = fijarValorCamara(conPista, "x", 1000, 900);
  assert.deepEqual(conKf.camara?.pistas.x?.map((k) => [k.t, k.v]), [[0, 100], [1000, 900]]);

  // …y si ya había uno en ese t, lo PISA (no duplica)
  const pisado = fijarValorCamara(conKf, "x", 1000, 950);
  assert.deepEqual(pisado.camara?.pistas.x?.map((k) => [k.t, k.v]), [[0, 100], [1000, 950]]);
});

test("agregarKeyframeCamara congela los canales provistos, ordenados por t", () => {
  const comp = agregarKeyframeCamara(base(), 2000, { x: 960, zoom: 1 });
  const conSegundo = agregarKeyframeCamara(comp, 500, { x: 400 });
  assert.deepEqual(conSegundo.camara?.pistas.x?.map((k) => k.t), [500, 2000], "ordenado");
  assert.equal(conSegundo.camara?.pistas.zoom?.length, 1);
  assert.equal(conSegundo.camara?.pistas.y, undefined, "canal no provisto no aparece");
});

test("moverKeyframeCamara retimea y valida: fuera de rango o inexistente son errores legibles", () => {
  const comp = agregarKeyframeCamara(base(), 1000, { zoom: 2 });
  const ok = moverKeyframeCamara(comp, "zoom", 1000, 2000);
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.valor.camara?.pistas.zoom?.[0].t, 2000);
  assert.ok(!moverKeyframeCamara(comp, "zoom", 999, 2000).ok, "t inexistente");
  assert.ok(!moverKeyframeCamara(comp, "zoom", 1000, 99999).ok, "fuera de la composición");
  assert.ok(!moverKeyframeCamara(comp, "x", 1000, 2000).ok, "canal sin pista");
});

test("describir muestra los keyframes de cámara CON valores y easing (el asistente los reanima)", () => {
  const comp: Composicion = {
    ...base(),
    camara: {
      base: { zoom: 1 },
      pistas: { x: [{ t: 0, v: 960 }, { t: 2000, v: 4000, easing: "entradaSalidaCubic" }] },
    },
  };
  const texto = describir(comp);
  assert.match(texto, /0ms→960/);
  assert.match(texto, /2000ms→4000 \(entradaSalidaCubic\)/);
  assert.match(texto, /el render es lo que ella ve/);
});

/* ——— El lienzo de pantallas: import aditivo ——— */

function resultadoDePantalla(): ResultadoImport {
  return {
    composicion: {
      version: 1,
      nombre: "Pantalla 2",
      ancho: 1920,
      alto: 1080,
      fps: 30,
      duracion: 5000,
      fondo: "#112233",
      capas: [
        {
          id: "fig-0-titulo", nombre: "Título", tipo: "texto", texto: "HOLA",
          fuente: { familia: "sans-serif", tamano: 100, peso: 700 },
          color: "#fff", division: "ninguna", x: 960, y: 540,
        },
      ],
    },
    avisos: [],
    reajustes: [{ capaId: "fig-0-titulo", anchoCaja: 800, lineas: 2 }],
    anclas: [{ capaId: "fig-0-titulo", topCaja: 500, tintaY: 512 }],
  };
}

test("sumarAlLienzo desplaza la pantalla, antepone su fondo como placa y remapea reajustes y anclas", () => {
  const comp: Composicion = {
    ...base(),
    capas: [{
      id: "existente", nombre: "Algo", tipo: "forma", forma: "rectangulo",
      ancho: 100, alto: 100, color: "#fff", x: 500, y: 500,
    }],
  };
  const { composicion, reajustes, anclas } = sumarAlLienzo(comp, resultadoDePantalla(), 2120, 0);
  assert.equal(composicion.capas.length, 3, "existente + fondo + título");
  const fondo = composicion.capas[1];
  assert.equal(fondo.tipo, "forma");
  assert.equal(fondo.x, 2120 + 960, "la placa de fondo centrada en la pantalla nueva");
  const titulo = composicion.capas[2];
  assert.equal(titulo.x, 960 + 2120);
  assert.equal(titulo.y, 540);
  // reajustes y anclas siguen apuntando a la capa (mismo id acá) y las
  // anclas se corren con la pantalla
  assert.equal(reajustes[0].capaId, titulo.id);
  assert.equal(anclas[0].topCaja, 500, "dy=0: la vertical no se corre");
  assert.equal(anclas[0].tintaY, 512);
  const conDy = sumarAlLienzo(comp, resultadoDePantalla(), 2120, 300);
  assert.equal(conDy.anclas[0].topCaja, 800);
  assert.equal(conDy.anclas[0].tintaY, 812);
});

test("sumarAlLienzo renombra ids que chocan (dos imports de la misma pantalla conviven)", () => {
  const primera = sumarAlLienzo(base(), resultadoDePantalla(), 0, 0);
  const segunda = sumarAlLienzo(primera.composicion, resultadoDePantalla(), 2120, 0);
  const ids = segunda.composicion.capas.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "ids únicos");
  assert.equal(segunda.reajustes[0].capaId, segunda.composicion.capas[3].id, "el reajuste apunta al id RENOMBRADO");
});

test("sumarAlLienzo agrupa la pantalla: la placa de fondo es la manija y todas las capas llevan su grupo", () => {
  const { composicion } = sumarAlLienzo(base(), resultadoDePantalla(), 0, 0);
  const placa = composicion.capas[0];
  assert.equal(placa.grupo, placa.id, "la placa se agrupa consigo misma");
  for (const capa of composicion.capas) {
    assert.equal(capa.grupo, placa.id, `«${capa.nombre}» pertenece a la pantalla`);
  }
});

test("moverCapas aplica posiciones ABSOLUTAS a varias capas (el drag de pantalla no acumula error)", () => {
  const { composicion } = sumarAlLienzo(base(), resultadoDePantalla(), 0, 0);
  const ids = composicion.capas.map((c) => c.id);
  const movida = moverCapas(composicion, ids.map((id, i) => ({ id, x: 100 + i, y: 50 })));
  movida.capas.forEach((c, i) => {
    assert.equal(c.x, 100 + i);
    assert.equal(c.y, 50);
  });
  // una capa fuera de la lista no se toca
  const parcial = moverCapas(composicion, [{ id: ids[0], x: 9, y: 9 }]);
  assert.equal(parcial.capas[1].x, composicion.capas[1].x);
});

test("borrarGrupo saca la pantalla entera CON lápidas (no resucita en el merge)", () => {
  const { composicion } = sumarAlLienzo(base(), resultadoDePantalla(), 0, 0);
  const grupo = composicion.capas[0].grupo!;
  const res = borrarGrupo(composicion, grupo, 777);
  assert.ok(res.ok);
  if (res.ok) {
    assert.equal(res.valor.capas.length, 0);
    assert.equal(res.valor.borrados?.length, composicion.capas.length);
    assert.ok(res.valor.borrados?.every((b) => b.v === 777));
  }
  assert.ok(!borrarGrupo(composicion, "no-existe").ok, "grupo inexistente = error legible");
});

/* ——— Keyframes: poner, quitar, y las POSES de cámara ——— */

test("ponerKeyframe agrega o pisa en t (con easing y hold); quitarKeyframe limpia la pista vacía", () => {
  const comp: Composicion = {
    ...base(),
    capas: [{
      id: "caja", nombre: "Caja", tipo: "forma", forma: "rectangulo",
      ancho: 100, alto: 100, color: "#fff", x: 500, y: 500,
    }],
  };
  const conKf = ponerKeyframe(comp, "caja", "x", { t: 1000, v: 800, easing: "salidaExpo" });
  assert.ok(conKf.ok);
  const pisado = ponerKeyframe(conKf.ok ? conKf.valor : comp, "caja", "x", { t: 1000, v: 900, hold: true });
  assert.ok(pisado.ok);
  if (pisado.ok) {
    const pista = pisado.valor.capas[0].pistas!.x!;
    assert.equal(pista.length, 1, "pisó, no duplicó");
    assert.equal(pista[0].v, 900);
    assert.equal(pista[0].hold, true);

    const sinKf = quitarKeyframe(pisado.valor, "caja", "x", 1000);
    assert.ok(sinKf.ok);
    if (sinKf.ok) {
      assert.equal(sinKf.valor.capas[0].pistas!.x, undefined, "la pista vacía se va con el último keyframe");
    }
  }
  assert.ok(!ponerKeyframe(comp, "caja", "x", { t: 99999, v: 0 }).ok, "fuera de la composición");
  assert.ok(!quitarKeyframe(comp, "caja", "x", 500).ok, "keyframe inexistente");
});

test("las poses de cámara: leer, borrar y retimear los canales de un instante como UNIDAD", () => {
  let comp = agregarKeyframeCamara(base(), 1000, { x: 400, zoom: { v: 2, easing: "entradaSalidaCubic" } });
  comp = agregarKeyframeCamara(comp, 3000, { x: 3000 });

  const pose = poseCamaraEn(comp, 1000);
  assert.equal(pose.x?.v, 400);
  assert.equal(pose.zoom?.easing, "entradaSalidaCubic");
  assert.equal(pose.y, undefined);

  const movida = moverPoseCamara(comp, 1000, 1500);
  assert.ok(movida.ok);
  if (movida.ok) {
    assert.deepEqual(movida.valor.camara?.pistas.x?.map((k) => k.t), [1500, 3000]);
    assert.equal(movida.valor.camara?.pistas.zoom?.[0].t, 1500, "el zoom viaja con la pose");
  }
  assert.ok(!moverPoseCamara(comp, 1000, 3000).ok, "no pisa otra pose");

  const borrada = quitarPoseCamara(comp, 1000);
  assert.ok(borrada.ok);
  if (borrada.ok) {
    assert.equal(borrada.valor.camara?.pistas.zoom, undefined, "pista vacía se va");
    assert.equal(borrada.valor.camara?.pistas.x?.length, 1, "la pose de 3000 sigue");
  }
  assert.ok(!quitarPoseCamara(comp, 777).ok, "instante sin pose = error legible");
});

test("moverCapasJuntoA reordena el z-order: una capa o una pantalla ENTERA, antes o después de la referencia", () => {
  const capa = (id: string, grupo?: string): Composicion["capas"][number] => ({
    id, nombre: id, tipo: "forma", forma: "rectangulo",
    ancho: 10, alto: 10, color: "#fff", x: 0, y: 0, grupo,
  });
  const comp: Composicion = {
    ...base(),
    capas: [capa("a"), capa("p1", "p1"), capa("p1-hijo", "p1"), capa("b")],
  };
  // una capa suelta al final
  const alFinal = moverCapasJuntoA(comp, ["a"], "b", true);
  assert.ok(alFinal.ok);
  if (alFinal.ok) assert.deepEqual(alFinal.valor.capas.map((c) => c.id), ["p1", "p1-hijo", "b", "a"]);
  // la pantalla entera (bloque) delante de «a», conservando su orden interno
  const bloque = moverCapasJuntoA(comp, ["p1", "p1-hijo"], "a", false);
  assert.ok(bloque.ok);
  if (bloque.ok) assert.deepEqual(bloque.valor.capas.map((c) => c.id), ["p1", "p1-hijo", "a", "b"]);
  // defensas
  assert.ok(!moverCapasJuntoA(comp, ["a"], "a", true).ok, "la referencia no puede estar en el bloque");
  assert.ok(!moverCapasJuntoA(comp, ["zzz"], "a", true).ok, "bloque vacío");
  assert.ok(!moverCapasJuntoA(comp, ["a"], "zzz", true).ok, "referencia inexistente");
});

/* ——— El agente y la cámara con base ——— */

test("definir_camara acepta una base sin keyframes (encuadre fijo) y la clampea", () => {
  const res = ejecutarHerramienta(base(), "definir_camara", { base: { x: 4000, zoom: 99 } });
  assert.ok(!res.esError, res.resultado);
  assert.equal(res.comp.camara?.base?.x, 3840, "clampeado a 2×ancho");
  assert.equal(res.comp.camara?.base?.zoom, 10);
  assert.ok(ejecutarHerramienta(base(), "definir_camara", {}).esError, "sin canales ni base sigue siendo error");
});
