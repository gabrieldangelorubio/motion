import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { deserializar } from "@/lib/motion/serializar-puro";

/* Un contexto falso que registra las llamadas: pintar() es determinista, así
   que el LOG de llamadas de dos pinturas del mismo estado tiene que ser
   idéntico — ese es el test de oro del rasterizador. */
function contextoFalso() {
  const llamadas: string[] = [];
  const registrar = (nombre: string) => (...args: unknown[]) => {
    llamadas.push(`${nombre}(${args.map((a) => (typeof a === "number" ? a.toFixed(3) : String(a))).join(",")})`);
    if (nombre === "measureText") return { width: 10 * String(args[0]).length };
    return undefined;
  };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(objetivo, prop: string) {
      if (prop in objetivo) return objetivo[prop];
      return registrar(prop);
    },
    set(objetivo, prop: string, valor) {
      llamadas.push(`set ${prop}=${String(valor)}`);
      objetivo[prop] = valor;
      return true;
    },
  });
  return { ctx: ctx as unknown as Contexto2D, llamadas };
}

const fixture = () =>
  deserializar(readFileSync(join(import.meta.dirname, "fixtures", "composicion-ejemplo.json"), "utf8"));

test("pintar el mismo estado dos veces produce EXACTAMENTE las mismas llamadas", () => {
  const comp = fixture();
  const estado = estadoEn(comp, 1234);
  const a = contextoFalso();
  const b = contextoFalso();
  pintar(estado, a.ctx);
  pintar(estado, b.ctx);
  assert.ok(a.llamadas.length > 20, `esperaba trabajo real, hubo ${a.llamadas.length} llamadas`);
  assert.deepEqual(a.llamadas, b.llamadas);
});

test("pinta el fondo del tamaño del lienzo antes que nada", () => {
  const comp = fixture();
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(comp, 0), ctx);
  const indiceFondo = llamadas.findIndex((l) => l === "fillRect(0.000,0.000,1920.000,1080.000)");
  assert.ok(indiceFondo >= 0 && indiceFondo <= 3, `el fondo va primero (apareció en ${indiceFondo})`);
});

test("una capa de texto dividida pinta un fillText por carácter", () => {
  const comp = fixture();
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(comp, 3000), ctx);
  const textos = llamadas.filter((l) => l.startsWith("fillText"));
  const letrasTitulo = textos.filter((l) => /fillText\([MOTIN],/.test(l));
  assert.equal(letrasTitulo.length, 6, `MOTION son 6 glifos, hubo ${letrasTitulo.length}`);
});

test("una capa de media sin imagen resuelta pinta el placeholder, con imagen llama drawImage", () => {
  const comp = fixture();
  const sin = contextoFalso();
  pintar(estadoEn(comp, 2000), sin.ctx);
  assert.ok(!sin.llamadas.some((l) => l.startsWith("drawImage")), "sin imagen no hay drawImage");

  const con = contextoFalso();
  const imagenFalsa = {} as CanvasImageSource;
  pintar(estadoEn(comp, 2000), con.ctx, { imagenDe: () => imagenFalsa });
  assert.ok(con.llamadas.some((l) => l.startsWith("drawImage")), "con imagen resuelta sí");
});

test("cada save tiene su restore (el contexto no queda sucio)", () => {
  const comp = fixture();
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(comp, 1500), ctx);
  const saves = llamadas.filter((l) => l.startsWith("save")).length;
  const restores = llamadas.filter((l) => l.startsWith("restore")).length;
  assert.equal(saves, restores);
});

test("una capa con mezcla setea el globalCompositeOperation dentro de su save/restore", () => {
  const comp = fixture();
  const capas = comp.capas.map((c) => (c.id === "placa" ? { ...c, mezcla: "multiply" as const } : c));
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn({ ...comp, capas }, 2000), ctx);
  const indiceMezcla = llamadas.findIndex((l) => l === "set globalCompositeOperation=multiply");
  assert.ok(indiceMezcla > 0, "se seteó la mezcla");
  // y las capas SIN mezcla no la setean (control negativo)
  const sinMezcla = contextoFalso();
  pintar(estadoEn(comp, 2000), sinMezcla.ctx);
  assert.ok(!sinMezcla.llamadas.some((l) => l.startsWith("set globalCompositeOperation")));
});

test("con supersampling espacial el blur de ctx.filter escala (px de dispositivo)", async () => {
  const { crearComposicion } = await import("@/lib/motion/herramientas-puro");
  const base = crearComposicion({ nombre: "aa" });
  const comp = {
    ...base,
    capas: [{
      id: "f", nombre: "f", tipo: "forma" as const, forma: "rectangulo" as const,
      ancho: 10, alto: 10, color: "#fff", x: 5, y: 5,
      pistas: { desenfoque: [{ t: 0, v: 10 }] },
    }],
  };
  const estado = estadoEn(comp, 0);
  const normal = contextoFalso();
  pintar(estado, normal.ctx);
  assert.ok(normal.llamadas.includes("set filter=blur(10.00px)"), "a 1× el blur va tal cual");
  const doble = contextoFalso();
  pintar(estado, doble.ctx, {}, 2);
  assert.ok(doble.llamadas.includes("set filter=blur(20.00px)"), "a 2× el radio se duplica para verse igual");
});

test("tramos de estilo: cada corrida se pinta con SU fuente sobre la misma baseline", async () => {
  const { crearComposicion } = await import("@/lib/motion/herramientas-puro");
  const base = crearComposicion({ nombre: "rich" });
  const capa = {
    id: "t", nombre: "t", tipo: "texto" as const, texto: "AB CD",
    fuente: { familia: "Base", tamano: 40, peso: 700 },
    color: "#fff",
    // índices NO BLANCOS: A=0 B=1 C=2 D=3 → «CD» va con la otra fuente
    tramos: [{ desde: 2, hasta: 4, familia: "Otra", color: "#f00" }],
    division: "ninguna" as const,
    alineacion: "izquierda" as const,
    x: 0, y: 0,
  };
  const comp = { ...base, capas: [capa] };
  const a = contextoFalso();
  pintar(estadoEn(comp, 0), a.ctx);
  // dos corridas: «AB » con la base (3 chars × 10 = ancho 30) y «CD» corrida a x=30 con Otra
  assert.ok(a.llamadas.includes("fillText(AB ,0.000,0.000)"), "la corrida base arranca en 0");
  assert.ok(a.llamadas.includes("fillText(CD,30.000,0.000)"), "la corrida estilada continúa donde terminó la anterior");
  assert.ok(a.llamadas.some((l) => l.startsWith("set font=") && l.includes("Otra")), "la segunda corrida usa su fuente");
  assert.ok(a.llamadas.includes("set fillStyle=#f00"), "y su color");

  // determinismo: dos pinturas del mismo estado, mismas llamadas
  const b = contextoFalso();
  pintar(estadoEn(comp, 0), b.ctx);
  assert.deepEqual(a.llamadas, b.llamadas);

  // división por palabras: la palabra estilada sigue midiéndose con su corrida
  const porPalabras = { ...comp, capas: [{ ...capa, division: "palabras" as const }] };
  const c = contextoFalso();
  pintar(estadoEn(porPalabras, 0), c.ctx);
  const textos = c.llamadas.filter((l) => l.startsWith("fillText"));
  assert.ok(textos.some((l) => l.startsWith("fillText(AB,")), "palabra base");
  assert.ok(textos.some((l) => l.startsWith("fillText(CD,")), "palabra estilada");
});

test("figma-puro: los tramos del plugin viajan a la capa de texto", async () => {
  const { normalizarFigma } = await import("@/lib/motion/figma-puro");
  const res = normalizarFigma({
    origen: "figma", version: 1,
    frame: { nombre: "f", ancho: 100, alto: 100, fondo: "#000" },
    nodos: [{
      nombre: "titulo", tipo: "texto", x: 0, y: 0, ancho: 100, alto: 40,
      texto: {
        contenido: "AB CD", familia: "Base", peso: 700, tamano: 20,
        alineacion: "izquierda", color: "#fff",
        tramos: [{ desde: 2, hasta: 4, familia: "Otra" }],
      },
    }],
  });
  const texto = res.composicion.capas.find((c) => c.tipo === "texto");
  assert.ok(texto && texto.tipo === "texto");
  assert.deepEqual(texto.tramos, [{ desde: 2, hasta: 4, familia: "Otra" }]);
});

test("una letra estirada escala desde la baseline y EMPUJA a las que siguen", () => {
  const comp = fixture();
  comp.capas = [{
    id: "logo", nombre: "Logo", tipo: "texto", texto: "SNOG", x: 0, y: 0,
    fuente: { familia: "Arial", tamano: 60, peso: 700 },
    color: "#fff", division: "ninguna", alineacion: "izquierda",
    deformaciones: [{ desde: 2, hasta: 3, escalaX: 2 }],
  }];
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(comp, 0), ctx);
  // la O se pinta con scale(2,1)
  assert.ok(llamadas.some((l) => l.startsWith("scale(2.000,1.000)")), `sin scale: ${llamadas.filter((l) => l.startsWith("scale")).join(" ")}`);
  // el ancho total creció: SN(20) + O estirada(20) + G(10) = 50 — la G
  // arranca en x=40 (con el stub de 10px por letra)
  assert.ok(llamadas.some((l) => l === "fillText(G,40.000,0.000)"), `la G no se corrió: ${llamadas.filter((l) => l.startsWith("fillText")).join(" ")}`);
});

test("media «cubrir»: medio píxel de redondeo no recorta, y si recorta de verdad el clip deja margen para el desenfoque", () => {
  const capa = {
    tipo: "media" as const, id: "img", nombre: "img", x: 600, y: 300, mediaId: "m",
    ancho: 1200, alto: 400, ajuste: "cubrir" as const,
    entrada: { preset: "subirDesenfocado", en: 0, duracion: 800 },
  };
  const comp = { ...fixture(), capas: [capa] };
  const rects = (llamadas: string[]) => llamadas.filter((l) => l.startsWith("rect("));
  const clips = (llamadas: string[]) => llamadas.filter((l) => l.startsWith("clip(")).length;

  // PNG a 2× con un píxel de más (2401×800 para una caja de 1200×400): antes
  // recortaba y el blur del texto rasterizado salía cortado en una caja
  const casiExacta = { naturalWidth: 2401, naturalHeight: 800 } as unknown as CanvasImageSource;
  const a = contextoFalso();
  pintar(estadoEn(comp, 400), a.ctx, { imagenDe: () => casiExacta });
  assert.equal(clips(a.llamadas), 0, `no debería recortar: ${rects(a.llamadas).join(" ")}`);

  // sobra de verdad (3000×800 → cubrir escala 0.5 → 1500 de ancho): recorta,
  // pero en plena entrada desenfocada el clip es MÁS GRANDE que la caja
  const ancha = { naturalWidth: 3000, naturalHeight: 800 } as unknown as CanvasImageSource;
  const b = contextoFalso();
  pintar(estadoEn(comp, 400), b.ctx, { imagenDe: () => ancha });
  assert.equal(clips(b.llamadas), 1);
  const [rx, ry, rw, rh] = rects(b.llamadas)[0].replace(/^rect\(|\)$/g, "").split(",").map(Number);
  assert.ok(rw > 1200 && rh > 400 && rx < -600 && ry < -200, `clip con margen de blur, vino ${rects(b.llamadas)[0]}`);

  // asentada (sin desenfoque) el clip es la caja exacta
  const c = contextoFalso();
  pintar(estadoEn(comp, 2000), c.ctx, { imagenDe: () => ancha });
  assert.deepEqual(rects(c.llamadas), ["rect(-600.000,-200.000,1200.000,400.000)"]);
});

test("una capa con recorte de padre se pinta dentro de un clip de MUNDO (la ventana no se mueve con la capa)", () => {
  const comp = fixture();
  const capa = comp.capas.find((c) => c.tipo === "forma");
  assert.ok(capa);
  const conRecorte = {
    ...comp,
    capas: comp.capas.map((c) => (c.id === capa!.id ? { ...c, recorte: { x: 100, y: 200, ancho: 300, alto: 150 } } : c)),
  };
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(conRecorte, 0), ctx);
  const i = llamadas.indexOf("rect(100.000,200.000,300.000,150.000)");
  assert.ok(i > 0, "el rect del recorte se dibuja");
  assert.equal(llamadas[i + 1], "clip()");
  // el clip va ANTES del translate de la capa: es de mundo
  const j = llamadas.slice(i).findIndex((l) => l.startsWith("translate("));
  assert.ok(j > 1);
});

test("una forma con radios por esquina pinta roundRect con las cuatro esquinas", () => {
  const comp = fixture();
  const capa = comp.capas.find((c) => c.tipo === "forma");
  assert.ok(capa);
  const con = { ...comp, capas: comp.capas.map((c) => (c.id === capa!.id ? { ...c, radio: 35, radios: [0, 35, 35, 0] as [number, number, number, number] } : c)) };
  const { ctx, llamadas } = contextoFalso();
  pintar(estadoEn(con, 0), ctx);
  assert.ok(llamadas.some((l) => l.startsWith("roundRect(") && l.endsWith(",0,35,35,0)")), llamadas.filter((l) => l.startsWith("roundRect")).join(" | "));
});
