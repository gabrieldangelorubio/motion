import { test } from "node:test";
import assert from "node:assert/strict";
import type { CapaTexto, CapaVideo, Composicion } from "@/lib/motion/modelo";
import { esCapaReferencia, estadoEn, sinCapasReferencia } from "@/lib/motion/evaluar-puro";
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
import { generarScriptAE } from "@/lib/motion/exportar-ae-puro";
import { validar } from "@/lib/motion/validar-puro";
import { describir, quitarCapa } from "@/lib/motion/herramientas-puro";
import { ejecutarHerramienta } from "@/lib/motion/agente-herramientas";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";

const video = (extra: Partial<CapaVideo> = {}): CapaVideo => ({
  id: "ref",
  nombre: "Locucion final",
  tipo: "video",
  videoId: "video-abc",
  x: 960,
  y: 540,
  ancho: 1920,
  alto: 1080,
  ajuste: "cubrir",
  referencia: true,
  ...extra,
});

const titulo = (): CapaTexto => ({
  id: "t",
  nombre: "Titulo",
  tipo: "texto",
  texto: "HOLA",
  x: 960,
  y: 540,
  fuente: { familia: "Arial", tamano: 60, peso: 700 },
  color: "#fff",
  division: "ninguna",
  entrada: { preset: "subir", en: 0, duracion: 500 },
});

const comp = (capas: Composicion["capas"]): Composicion => ({
  version: 1, nombre: "Ref", ancho: 1920, alto: 1080, fps: 30, duracion: 4000, fondo: "#101015", capas,
});

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

/* ——— el filtro de referencia: lo que un export renderiza ————————— */

test("sinCapasReferencia saca el video y deja el resto; sin videos devuelve la MISMA composición", () => {
  const con = comp([video(), titulo()]);
  const filtrada = sinCapasReferencia(con);
  assert.deepEqual(filtrada.capas.map((c) => c.id), ["t"]);
  // sin referencias no se fabrica un objeto nuevo (identidad: cero costo)
  const sinVideo = comp([titulo()]);
  assert.equal(sinCapasReferencia(sinVideo), sinVideo);
  assert.ok(esCapaReferencia(video()) && !esCapaReferencia(titulo()));
});

test("estadoEn evalúa la capa video como una capa más (el preview la anima si hace falta)", () => {
  const estado = estadoEn(comp([video({ escala: 0.5, opacidad: 0.8 })]), 1000);
  assert.equal(estado.capas.length, 1);
  assert.equal(estado.capas[0].escala, 0.5);
  assert.equal(estado.capas[0].opacidad, 0.8);
  assert.equal(estado.capas[0].unidades.length, 1);
});

/* ——— pintar: frame vivo o placeholder ————————————————————————— */

test("pintar el video: sin resolver pinta placeholder; con videoDe llama drawImage con el encaje", () => {
  const escena = comp([video()]);
  const sin = contextoFalso();
  pintar(estadoEn(escena, 0), sin.ctx);
  assert.ok(!sin.llamadas.some((l) => l.startsWith("drawImage")), "sin video no hay drawImage");
  assert.ok(sin.llamadas.some((l) => l.startsWith("fillRect(-960.000,-540.000")), "placeholder en la caja");

  const con = contextoFalso();
  const falso = { videoWidth: 3840, videoHeight: 2160 } as unknown as CanvasImageSource;
  pintar(estadoEn(escena, 0), con.ctx, { videoDe: () => falso });
  // cubrir 3840×2160 en 1920×1080: factor 0.5 → 1920×1080 centrado
  assert.ok(con.llamadas.some((l) => l === "drawImage([object Object],-960.000,-540.000,1920.000,1080.000)"),
    `esperaba el drawImage del encaje, hubo: ${con.llamadas.filter((l) => l.startsWith("drawImage")).join(" | ")}`);
});

/* ——— exports: la referencia nunca viaja ———————————————————————— */

test("el .jsx de AE no lleva el video de referencia y el alert lo recuerda", () => {
  const jsx = generarScriptAE([comp([video(), titulo()])]);
  assert.ok(!jsx.includes("Locucion final"), "la capa video no aparece en el script");
  assert.match(jsx, /1 capa\(s\)/); // solo el título cuenta
  assert.match(jsx, /El video de REFERENCIA del preview \(1\) no viaja: monta estas comps sobre el video real aca\./);
  // sin video, el alert no dice nada de referencias
  assert.ok(!generarScriptAE([comp([titulo()])]).includes("REFERENCIA del preview"));
});

test("la capa video sobrevive el ciclo serializar → deserializar (videoId y desde incluidos)", () => {
  const original = comp([video({ desde: 1500 })]);
  const vuelta = deserializar(serializar(original));
  const capa = vuelta.capas[0];
  assert.equal(capa.tipo, "video");
  if (capa.tipo === "video") {
    assert.equal(capa.videoId, "video-abc");
    assert.equal(capa.desde, 1500);
    assert.equal(capa.referencia, true);
  }
});

/* ——— invariantes y borrado ————————————————————————————————— */

test("validar avisa un video sin archivo; quitarCapa la borra como a cualquiera (con lápida)", () => {
  const roto = comp([video({ videoId: "" })]);
  assert.ok(validar(roto).some((p) => p.mensaje.includes("no apunta a ningún archivo")));
  assert.equal(validar(comp([video()])).length, 0);

  const res = quitarCapa(comp([video(), titulo()]), "ref");
  assert.ok(res.ok);
  if (res.ok) {
    assert.deepEqual(res.valor.capas.map((c) => c.id), ["t"]);
    assert.ok(res.valor.borrados?.some((b) => b.id === "ref"));
  }
});

/* ——— el director la VE pero no la OPERA ———————————————————————— */

test("describir la nombra como VIDEO DE REFERENCIA (el director sabe que existe y que no se toca)", () => {
  const texto = describir(comp([video(), titulo()]));
  assert.match(texto, /VIDEO DE REFERENCIA de fondo: solo guía del preview, NO operarla/);
  // la capa normal sigue descripta con su posición
  assert.match(texto, /\[texto\] «Titulo» en \(960, 540\)/);
});

test("cualquier herramienta del director que apunte al video de referencia se rechaza con guía", () => {
  const escena = comp([video(), titulo()]);
  for (const [herramienta, entrada] of [
    ["editar_capa", { capaId: "ref", x: 100 }],
    ["quitar_capa", { capaId: "ref" }],
    ["definir_entrada", { capaId: "ref", preset: "revelar", en: 0, duracion: 500 }],
  ] as const) {
    const res = ejecutarHerramienta(escena, herramienta, entrada);
    assert.equal(res.comp, escena, `${herramienta}: la composición no cambia`);
    assert.match(res.resultado, /VIDEO DE REFERENCIA/, `${herramienta} rechazada con guía`);
  }
  // las herramientas sobre OTRAS capas siguen andando igual
  const ok = ejecutarHerramienta(escena, "editar_capa", { capaId: "t", x: 100 });
  assert.notEqual(ok.comp, escena);
});

test("reordenar_capas no puede subir el video: queda CLAVADO al fondo, con o sin su id en el orden", () => {
  const escena = comp([video(), titulo()]);
  // el director intenta ponerlo al FRENTE (la vía que esquivaba el guard)
  const alFrente = ejecutarHerramienta(escena, "reordenar_capas", { orden: ["t", "ref"] });
  assert.deepEqual(alFrente.comp.capas.map((c) => c.id), ["ref", "t"], "el video sigue primero (el fondo)");
  assert.match(alFrente.resultado, /sigue al fondo/);
  // el orden SIN el id de la referencia también vale (su posición no se negocia)
  const sinRef = ejecutarHerramienta(escena, "reordenar_capas", { orden: ["t"] });
  assert.deepEqual(sinRef.comp.capas.map((c) => c.id), ["ref", "t"]);
  // y un reorden normal de las demás capas sigue andando
  const dos = comp([video(), titulo(), { ...titulo(), id: "t2", nombre: "Otro" }]);
  const res = ejecutarHerramienta(dos, "reordenar_capas", { orden: ["t2", "t", "ref"] });
  assert.deepEqual(res.comp.capas.map((c) => c.id), ["ref", "t2", "t"]);
});
