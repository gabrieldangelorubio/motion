/* Tests del MOTOR GSAP (fork, tanda G2): la composición compilada a un
   gsap.timeline pausado sobre proxies tiene que dar EXACTAMENTE el mismo
   estado que el evaluador clásico (el ensamblador es compartido; los tweens
   usan las mismas funciones de ease), con seek determinista en cualquier
   orden. La paridad ES el contrato: si esto pasa, preview/MP4/PNG no
   cambian ni un pixel al cambiar de motor. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Capa, Composicion } from "@/lib/motion/modelo";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { estadoVivo } from "@/lib/motion/motor-gsap";
import { deserializar } from "@/lib/motion/serializar-puro";

const fixture = (): Composicion =>
  deserializar(readFileSync(join(import.meta.dirname, "fixtures", "composicion-ejemplo.json"), "utf8"));

/** Una composición que pisa TODOS los caminos del motor: presets con
    escalonado (orden azar incluido), pistas con holds y eases GSAP,
    resortes, contador, trazo con trim, y cuantizado de fpsAnimacion. */
function compIntensa(): Composicion {
  const capas: Capa[] = [
    {
      id: "titulo",
      nombre: "Título",
      tipo: "texto",
      texto: "VUELO TOTAL",
      fuente: { familia: "sans-serif", tamano: 90, peso: 700 },
      color: "#fff",
      division: "caracteres",
      x: 400,
      y: 300,
      motionBlur: 1,
      entrada: { preset: "revelar", en: 200, duracion: 600, easing: "back.out(3)", escalonado: 40, ordenEscalonado: "azar" },
      salida: { preset: "desvanecer", en: 3800, duracion: 400, easing: "entradaExpo" },
    },
    {
      id: "caja",
      nombre: "Caja",
      tipo: "forma",
      forma: "rectangulo",
      ancho: 300,
      alto: 180,
      color: "#e33",
      x: 900,
      y: 500,
      entrada: { preset: "pop", en: 0, duracion: 500, easing: "resorteRebote" },
      pistas: {
        x: [
          { t: 500, v: 900, easing: "elastic.out(1,0.5)" },
          { t: 1500, v: 1400, hold: true },
          { t: 2500, v: 1400, easing: "steps(4)" },
          { t: 3200, v: 600 },
        ],
        rotacion: [
          { t: 0, v: 0, easing: "entradaSalidaQuint" },
          { t: 4000, v: 360 },
        ],
      },
    },
    {
      id: "stock",
      nombre: "Contador",
      tipo: "texto",
      texto: "STOCK:171",
      fuente: { familia: "monospace", tamano: 40, peso: 500 },
      color: "#ddd",
      division: "ninguna",
      x: 200,
      y: 800,
      pistas: { numero: [{ t: 1000, v: 171, easing: "salidaExpo" }, { t: 3000, v: 0 }] },
    },
    {
      id: "linea",
      nombre: "Línea",
      tipo: "trazo",
      path: "M 0 0 L 500 0",
      ancho: 500,
      alto: 4,
      color: "#0af",
      grosor: 4,
      largo: 500,
      x: 100,
      y: 950,
      pistas: { trazoFin: [{ t: 0, v: 0, easing: "suave" }, { t: 1200, v: 1 }] },
    },
  ];
  return {
    version: 1,
    nombre: "intensa",
    ancho: 1920,
    alto: 1080,
    fps: 30,
    duracion: 4500,
    fondo: "#111",
    fpsAnimacion: 12,
    capas,
  } as Composicion;
}

/** Igualdad numérica profunda. Tolerancia 1e-4 relativa: GSAP redondea los
    números de tweens de objeto a 6 decimales (medido: p con error ≤5e-7,
    que escalado a px queda en ~1e-4 px — invisible; cualquier bug real de
    lógica produce diferencias órdenes de magnitud mayores). */
function casiIgual(a: unknown, b: unknown, ruta: string): void {
  if (typeof a === "number" && typeof b === "number") {
    const tol = 1e-4 * Math.max(1, Math.abs(a));
    assert.ok(Math.abs(a - b) <= tol, `${ruta}: ${a} vs ${b}`);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${ruta}.length`);
    a.forEach((x, i) => casiIgual(x, b[i], `${ruta}[${i}]`));
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of claves) {
      casiIgual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${ruta}.${k}`);
    }
    return;
  }
  assert.deepEqual(a, b, ruta);
}

const GRILLA = (duracion: number) => {
  const ts: number[] = [];
  for (let t = 0; t <= duracion; t += 137) ts.push(t);
  ts.push(0, 1, duracion - 1, duracion, duracion + 500);
  // los INSTANTES EXACTOS de los keyframes/segmentos de compIntensa: las
  // fronteras de sets y fromTo (holds incluidos) tienen que dar el mismo
  // lado que interpolar — el paso de 137 no las pisa solo
  ts.push(200, 500, 800, 1000, 1200, 1500, 2500, 3000, 3200, 3800, 4200);
  return ts;
};

test("PARIDAD: el motor GSAP da el mismo estado que el clásico en la comp intensa", () => {
  const comp = compIntensa();
  for (const t of GRILLA(comp.duracion)) {
    casiIgual(estadoVivo(comp, t), estadoEn(comp, t), `t=${t}`);
  }
});

test("PARIDAD: también en la fixture del proyecto", () => {
  const comp = fixture();
  for (const t of GRILLA(comp.duracion)) {
    casiIgual(estadoVivo(comp, t), estadoEn(comp, t), `t=${t}`);
  }
});

test("seek DESORDENADO: el orden de evaluación no cambia ni un bit", () => {
  const comp = compIntensa();
  const orden1 = [0, 4200, 300, 2500, 1100, 700, 3900];
  const orden2 = [3900, 700, 1100, 2500, 300, 4200, 0];
  const de = (orden: number[]) => {
    const porT = new Map<number, string>();
    for (const t of orden) porT.set(t, JSON.stringify(estadoVivo(comp, t)));
    return porT;
  };
  const a = de(orden1);
  const b = de(orden2);
  for (const t of orden1) assert.equal(a.get(t), b.get(t), `t=${t} difiere según el orden de seek`);
});

test("un segmento con en NEGATIVO cae al cálculo clásico (misma paridad, sin tween roto)", () => {
  const comp = compIntensa();
  comp.capas[0] = {
    ...comp.capas[0],
    entrada: { ...comp.capas[0].entrada!, en: -150 },
  } as Capa;
  for (const t of [0, 100, 300, 800]) {
    casiIgual(estadoVivo(comp, t), estadoEn(comp, t), `en<0 t=${t}`);
  }
});

test("t NEGATIVO da el estado inicial, no el final (el borde del -0 de Timeline.time)", () => {
  // sin el clamp del seek, gsap con t<0 múltiplo «limpio» de la duración
  // cae a renderizar la DURACIÓN entera — la entrada aparecía terminada
  const comp = compIntensa();
  for (const t of [-800, -400, -200, -100, -1]) {
    casiIgual(estadoVivo(comp, t), estadoEn(comp, t), `t=${t}`);
  }
});

test("FIRMA: un drag de posición NO recompila el timeline; retimar sí", async () => {
  const { construccionesDeMotor } = await import("@/lib/motion/motor-gsap");
  const comp = compIntensa();
  estadoVivo(comp, 1000);
  const base = construccionesDeMotor();

  // edición de POSICIÓN (comp nueva, mismas referencias de pistas/segmentos):
  // el motor anterior se reusa tal cual — cero rebuild durante un drag
  const movida: Composicion = {
    ...comp,
    capas: comp.capas.map((c) => (c.id === "caja" ? ({ ...c, x: 1234 } as Capa) : c)),
  };
  const estado = estadoVivo(movida, 1000);
  assert.equal(construccionesDeMotor(), base, "mover en x/y no reconstruye");
  assert.equal(estado.capas.find((c) => c.capa.id === "caja")!.capa.x, 1234, "y la edición se ve igual");

  // edición de TIMING (entrada nueva): eso SÍ recompila
  const retimada: Composicion = {
    ...comp,
    capas: comp.capas.map((c) =>
      c.id === "titulo" ? ({ ...c, entrada: { ...c.entrada!, en: 400 } } as Capa) : c,
    ),
  };
  estadoVivo(retimada, 1000);
  assert.equal(construccionesDeMotor(), base + 1, "retimar reconstruye una vez");
  casiIgual(estadoVivo(retimada, 1000), estadoEn(retimada, 1000), "y con paridad");
});

test("cada composición NUEVA rebuildea su timeline (la identidad es la clave del cache)", () => {
  const comp = compIntensa();
  const antes = estadoVivo(comp, 2000);
  const editada: Composicion = {
    ...comp,
    capas: comp.capas.map((c) => (c.id === "caja" ? ({ ...c, x: 5000, pistas: undefined } as Capa) : c)),
  };
  const despues = estadoVivo(editada, 2000);
  const caja = (e: typeof antes) => e.capas.find((c) => c.capa.id === "caja")!;
  assert.notEqual(caja(antes).x, caja(despues).x, "la edición se refleja");
  assert.equal(caja(despues).x, 5000);
  // y la comp original sigue intacta en su propio motor
  casiIgual(estadoVivo(comp, 2000), antes, "la original no se contaminó");
});
