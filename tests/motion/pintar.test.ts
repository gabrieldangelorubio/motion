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
