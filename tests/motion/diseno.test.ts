/* Tests de la parte de DISEÑO (tandas D1+D2): el estilo leído de la pieza,
   la derivación de pantallas con estilo Y animación heredados, y las tools
   del director que los exponen. */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Capa, CapaTexto, Composicion } from "@/lib/motion/modelo";
import { crearComposicion } from "@/lib/motion/herramientas-puro";
import { describirEstilo, estiloDePieza } from "@/lib/motion/estilo-puro";
import { derivarPantalla, textoEncajado } from "@/lib/motion/derivar-puro";
import { ejecutarHerramienta, DEFINICIONES_HERRAMIENTAS } from "@/lib/motion/agente-herramientas";

/** Una pantalla 1000×600 en (0,0) con placa, título, bajada, caja y un
    subgrupo — animada. */
function compConPantalla(): Composicion {
  const capas: Capa[] = [
    { id: "home", nombre: "Home (fondo)", tipo: "forma", forma: "rectangulo", ancho: 1000, alto: 600, color: "#F5F2EC", x: 500, y: 300, grupo: "home" },
    {
      id: "titulo", nombre: "Titular", tipo: "texto", texto: "MOTION TOTAL",
      fuente: { familia: "Inter", tamano: 80, peso: 700 }, color: "#141416", division: "caracteres",
      x: 500, y: 120, grupo: "home",
      entrada: { preset: "revelar", en: 200, duracion: 700, easing: "salidaExpo", escalonado: 40 },
      salida: { preset: "desvanecer", en: 4000, duracion: 400 },
    },
    {
      id: "bajada", nombre: "Bajada", tipo: "texto", texto: "todo el pipeline en un lugar",
      fuente: { familia: "Inter", tamano: 28, peso: 400 }, color: "#141416", division: "ninguna",
      x: 500, y: 200, grupo: "home",
      entrada: { preset: "subir", en: 500, duracion: 600, easing: "salidaQuint" },
    },
    {
      id: "caja", nombre: "Caja", tipo: "forma", forma: "rectangulo", ancho: 300, alto: 120, color: "#E3332F", radio: 12,
      x: 500, y: 420, grupo: "home",
      entrada: { preset: "pop", en: 900, duracion: 500, easing: "back.out(2)" },
      pistas: { x: [{ t: 1500, v: 500, easing: "suave" }, { t: 2500, v: 700 }] },
    },
    { id: "l1", nombre: "L", tipo: "texto", texto: "L", fuente: { familia: "Inter", tamano: 40, peso: 900 }, color: "#0A84FF", division: "ninguna", x: 100, y: 520, grupo: "home", subgrupo: "home:logo", subgrupoNombre: "logo" },
    { id: "l2", nombre: "O", tipo: "texto", texto: "O", fuente: { familia: "Inter", tamano: 40, peso: 900 }, color: "#0A84FF", division: "ninguna", x: 140, y: 520, grupo: "home", subgrupo: "home:logo", subgrupoNombre: "logo" },
  ];
  return { ...crearComposicion({ nombre: "diseño", ancho: 1920, alto: 1080, duracion: 5000 }), capas };
}

test("estiloDePieza lee paleta (fondos aparte), jerarquía tipográfica por tamaño, márgenes y ritmo", () => {
  const e = estiloDePieza(compConPantalla());
  // la placa NO cuenta como color de pieza: es fondo
  assert.equal(e.paleta[0].color, "#141416");
  assert.equal(e.paleta[0].usos, 2);
  assert.ok(e.paleta.some((p) => p.color === "#0a84ff" && p.usos === 2), "colores normalizados en minúscula");
  assert.ok(e.fondos.includes("#f5f2ec"), "la placa es fondo");
  assert.ok(!e.paleta.some((p) => p.color === "#f5f2ec"));
  // roles: 80px título, 40px (0.5) subtítulo, 28px (0.35) cuerpo
  const rol = (peso: number) => e.tipografias.find((t) => t.peso === peso)!.rol;
  assert.equal(rol(700), "titulo");
  assert.equal(rol(900), "subtitulo");
  assert.equal(rol(400), "cuerpo");
  // márgenes contra la PLACA (1000×600 en 0,0): la caja llega a x=350..650 → izq 80 por el logo (100-0), abajo 600-540=60
  assert.ok(e.margenes);
  assert.equal(e.margenes!.izquierda, 100);
  assert.equal(e.margenes!.abajo, 60);
  // ritmo: mediana de entradas (700, 600, 500) = 600; escalonado 40
  assert.equal(e.ritmo.entrada!.duracion, 600);
  assert.equal(e.ritmo.escalonado, 40);
  assert.deepEqual(e.ritmo.entrada!.presets.slice(0, 3).sort(), ["pop", "revelar", "subir"]);

  const texto = describirEstilo(e);
  assert.match(texto, /ESTILO DE LA PIEZA/);
  assert.match(texto, /Inter 700 → títulos \(80px\)/);
  assert.match(texto, /izq 100px/);
  assert.match(texto, /entradas ~600ms/);
  assert.equal(describirEstilo(estiloDePieza(crearComposicion({ nombre: "vacía" }))), "", "sin piezas, sin bloque");
});

test("textoEncajado conserva mayúsculas y achica el cuerpo por la línea más larga (nunca agranda)", () => {
  const original = compConPantalla().capas.find((c) => c.id === "titulo") as CapaTexto; // "MOTION TOTAL" (11 visibles), 80px
  const largo = textoEncajado(original, "un título bastante más largo"); // 24 visibles
  assert.equal(largo.texto, "UN TÍTULO BASTANTE MÁS LARGO");
  assert.equal(largo.tamano, Math.round(80 * (11 / 24) * 10) / 10);
  const corto = textoEncajado(original, "hola");
  assert.equal(corto.tamano, 80, "más corto: mismo cuerpo");
  // multilínea: manda la línea MÁS LARGA
  const dos = textoEncajado(original, "corta\nesta es la larga de verdad");
  assert.equal(dos.tamano, Math.round(80 * (11 / 21) * 10) / 10); // «estaeslalargadeverdad» = 21
});

test("textoEncajado nunca baja de 8px y un original vacío no achica (review)", () => {
  const chico = { ...(compConPantalla().capas.find((c) => c.id === "bajada") as CapaTexto), fuente: { familia: "Inter", tamano: 10, peso: 400 }, texto: "ab" };
  assert.equal(textoEncajado(chico, "una frase muchísimo más larga que dos letras").tamano, 8);
  const vacio = { ...chico, texto: "  " };
  assert.equal(textoEncajado(vacio, "placeholder relleno").tamano, 10, "original vacío: cuerpo intacto");
  assert.equal(textoEncajado(chico, "").tamano, 10, "nuevo vacío: cuerpo intacto");
});

test("márgenes POR EJE: una pieza sangrada anula solo su eje, y el nombre por defecto no apila «B B» (review)", () => {
  const comp = compConPantalla();
  // una sola pieza que sangra por la izquierda: izq sin dato, los otros tres sí
  const sangrada: Composicion = {
    ...comp,
    capas: [comp.capas[0], { id: "banda", nombre: "Banda", tipo: "forma", forma: "rectangulo", ancho: 400, alto: 50, color: "#333333", x: 150, y: 300, grupo: "home" }],
  };
  const m = estiloDePieza(sangrada).margenes!;
  assert.equal(m.izquierda, undefined);
  assert.equal(m.derecha, 650);
  assert.equal(m.arriba, 275);
  assert.match(describirEstilo(estiloDePieza(sangrada)), /Márgenes.*der 650px, arriba 275px, abajo 275px/);

  const una = derivarPantalla(comp, "home");
  assert.ok(una.ok);
  if (!una.ok) return;
  const dos = derivarPantalla(una.valor.composicion, una.valor.pantallaId);
  assert.ok(dos.ok);
  if (!dos.ok) return;
  const nombres = dos.valor.composicion.capas.filter((c) => c.grupo === c.id).map((c) => c.nombre);
  assert.deepEqual(nombres, ["Home (fondo)", "Home B (fondo)", "Home B 2 (fondo)"]);

  // describir solo marca PLACA lo que esPlaca acepta (grupo === id Y forma)
  const rara: Composicion = { ...comp, capas: [...comp.capas, { ...(comp.capas[1] as CapaTexto), id: "t2", grupo: "t2" }] };
  const desc = ejecutarHerramienta(rara, "ver_composicion", {}).resultado;
  assert.equal((desc.match(/PLACA de pantalla/g) ?? []).length, 1);
});

test("derivarPantalla clona a la derecha con ids/grupo/subgrupo nuevos, pistas desplazadas y animación heredada", () => {
  const comp = compConPantalla();
  const res = derivarPantalla(comp, "home", { nombre: "Pricing", reemplazos: [{ capaId: "titulo", texto: "precios claros" }] }, 77);
  assert.ok(res.ok);
  if (!res.ok) return;
  const { composicion, pantallaId, renombres } = res.valor;
  assert.equal(pantallaId, "pantalla-pricing");
  assert.equal(composicion.capas.length, comp.capas.length * 2, "la pantalla entera se clonó");
  const nuevas = composicion.capas.filter((c) => c.grupo === pantallaId);
  assert.equal(nuevas.length, 6);
  // a la derecha: borde derecho 1000 + 200 → la placa nueva arranca en 1200
  const placa = nuevas.find((c) => c.id === pantallaId)!;
  assert.equal(placa.x, 500 + 1200);
  assert.equal(placa.nombre, "Pricing (fondo)");
  // ids únicos y remapeados
  assert.equal(renombres.titulo, "titulo-pricing");
  assert.ok(!composicion.capas.some((c) => c.id === "titulo-pricing" && c.grupo === "home"));
  // subgrupo por pantalla
  const l1 = nuevas.find((c) => c.id === renombres.l1)!;
  assert.equal(l1.subgrupo, "pantalla-pricing:logo");
  // pistas ABSOLUTAS desplazadas con la pantalla
  const caja = nuevas.find((c) => c.id === renombres.caja)!;
  assert.deepEqual(caja.pistas!.x!.map((k) => k.v), [500 + 1200, 700 + 1200]);
  // animación heredada tal cual
  const titulo = nuevas.find((c) => c.id === renombres.titulo) as CapaTexto;
  assert.deepEqual(titulo.entrada, comp.capas[1].entrada);
  assert.equal(titulo.texto, "PRECIOS CLAROS", "mayúsculas del original");
  assert.ok(titulo.fuente.tamano < 80, "más largo → cuerpo achicado");
  assert.equal(titulo.v, 77);
  // la original quedó intacta
  assert.equal((composicion.capas[1] as CapaTexto).texto, "MOTION TOTAL");
});

test("derivarPantalla: desdeMs corre la animación de la nueva; errores claros", () => {
  const comp = compConPantalla();
  const corrida = derivarPantalla(comp, "home", { desdeMs: 3000 });
  assert.ok(corrida.ok);
  if (corrida.ok) {
    const t = corrida.valor.composicion.capas.find((c) => c.id === corrida.valor.renombres.titulo)!;
    assert.equal(t.entrada!.en, 3200);
    const caja = corrida.valor.composicion.capas.find((c) => c.id === corrida.valor.renombres.caja)!;
    assert.equal(caja.pistas!.x![0].t, 4500);
  }
  const noPlaca = derivarPantalla(comp, "titulo");
  assert.ok(!noPlaca.ok && /las pantallas son: home/.test(noPlaca.error));
  const malReemplazo = derivarPantalla(comp, "home", { reemplazos: [{ capaId: "caja", texto: "x" }] });
  assert.ok(!malReemplazo.ok && /no es una capa de texto/.test(malReemplazo.error));
  const ajeno = derivarPantalla(comp, "home", { reemplazos: [{ capaId: "otra", texto: "x" }] });
  assert.ok(!ajeno.ok && /no es una capa de la pantalla/.test(ajeno.error));
  // segunda derivación: se ubica a la derecha de la ÚLTIMA pantalla, no de la original
  const dos = derivarPantalla(corrida.ok ? corrida.valor.composicion : comp, "home", { nombre: "Tres" });
  assert.ok(dos.ok);
  if (dos.ok) {
    const placa = dos.valor.composicion.capas.find((c) => c.id === dos.valor.pantallaId)!;
    assert.equal(placa.x, 500 + 2400, "borde derecho 2200 + 200");
  }
});

test("tools del director: derivar_pantalla y los campos de diseño nuevos de editar_capa", () => {
  const comp = compConPantalla();
  const res = ejecutarHerramienta(comp, "derivar_pantalla", {
    pantallaId: "home",
    nombre: "Pricing",
    reemplazos: [{ capaId: "bajada", texto: "planes para cada equipo" }],
    desdeMs: 2000,
  });
  assert.ok(!res.esError, res.resultado);
  assert.match(res.resultado, /Ids nuevos: .*titulo→titulo-pricing/);
  assert.match(res.resultado, /PLACA de pantalla/, "describir marca las placas");
  assert.match(res.resultado, /pantalla pantalla-pricing/, "y la pertenencia");

  const roto = ejecutarHerramienta(comp, "derivar_pantalla", { pantallaId: "home", reemplazos: [{ capaId: "bajada" }] });
  assert.ok(roto.esError);

  const editada = ejecutarHerramienta(comp, "editar_capa", {
    capaId: "bajada", familia: "Georgia", interlineado: 40, interletrado: 2, alineacion: "izquierda",
  });
  const bajada = editada.comp.capas.find((c) => c.id === "bajada") as CapaTexto;
  assert.equal(bajada.fuente.familia, "Georgia");
  assert.equal(bajada.fuente.interlineado, 40);
  assert.equal(bajada.fuente.interletrado, 2);
  assert.equal(bajada.alineacion, "izquierda");

  const forma = ejecutarHerramienta(comp, "editar_capa", { capaId: "caja", ancho: 420, alto: 99999, radio: 24, color: "#00FF00" });
  const caja = forma.comp.capas.find((c) => c.id === "caja")!;
  assert.ok(caja.tipo === "forma");
  if (caja.tipo === "forma") {
    assert.equal(caja.ancho, 420);
    assert.equal(caja.alto, 1080 * 4, "clampeado");
    assert.equal(caja.radio, 24);
    assert.equal(caja.color, "#00FF00");
  }

  const ver = ejecutarHerramienta(comp, "ver_composicion", {});
  assert.match(ver.resultado, /ESTILO DE LA PIEZA/, "ver_composicion trae el estilo");
  assert.ok(DEFINICIONES_HERRAMIENTAS.some((d) => d.name === "derivar_pantalla"));
});
