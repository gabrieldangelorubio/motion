/* -----------------------------------------------------------------------------
   El ESTILO de la pieza, leído de la composición — tanda D1

   Para diseñar por prompt («cambiá el color del título», «armá otra pantalla
   con el mismo estilo») el director necesita saber cuál ES el estilo: no se
   lo declara nadie, se LEE de lo que hay. Esto extrae, de forma pura y
   determinista, el sistema implícito de una composición: paleta (con
   frecuencia de uso, fondos aparte), tipografías con su ROL en la jerarquía
   (título / subtítulo / cuerpo / detalle, por tamaño relativo al mayor),
   márgenes mínimos al borde de la pantalla, y el RITMO de la animación
   (duraciones medianas, easings y presets más usados, escalonado). Y lo
   describe en un bloque compacto para el system/primer mensaje.
----------------------------------------------------------------------------- */

import type { Capa, Composicion, Segmento } from "@/lib/motion/modelo";

export type RolTipografico = "titulo" | "subtitulo" | "cuerpo" | "detalle";

export type EstiloPieza = {
  /** colores de las piezas (no de fondos), del más usado al menos */
  paleta: { color: string; usos: number }[];
  /** fondos: el de la composición y las placas de pantalla */
  fondos: string[];
  /** por (familia, peso): tamaños usados y el rol del mayor de ellos */
  tipografias: { familia: string; peso: number; tamanos: number[]; rol: RolTipografico; capas: number }[];
  /** distancia mínima de las piezas a cada borde de su pantalla (px); null sin datos */
  margenes: { izquierda: number; derecha: number; arriba: number; abajo: number } | null;
  ritmo: {
    entrada: { duracion: number; presets: string[]; easings: string[] } | null;
    salida: { duracion: number; presets: string[]; easings: string[] } | null;
    /** escalonado mediano entre unidades (ms) cuando hay división; null si no */
    escalonado: number | null;
  };
};

const normalizarColor = (c: string) => c.trim().toLowerCase();

function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Los n más frecuentes, empates por orden de aparición (determinista). */
function frecuentes(items: string[], n: number): string[] {
  const conteo = new Map<string, number>();
  for (const it of items) conteo.set(it, (conteo.get(it) ?? 0) + 1);
  return [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** ¿La capa es la PLACA de una pantalla (su id es el grupo)? */
export function esPlaca(capa: Capa): boolean {
  return capa.grupo === capa.id && capa.tipo === "forma";
}

function rolPorTamano(tamano: number, mayor: number): RolTipografico {
  const r = tamano / mayor;
  if (r >= 0.7) return "titulo";
  if (r >= 0.45) return "subtitulo";
  if (r >= 0.25) return "cuerpo";
  return "detalle";
}

/** Caja ocupada por una pieza (centro ± mitad); los textos no tienen ancho
    medido, así que solo aportan su vertical (± medio cuerpo). */
function cajaDe(capa: Capa): { x1: number; y1: number; x2: number; y2: number } | null {
  if (capa.tipo === "texto") {
    const medio = capa.fuente.tamano / 2;
    return { x1: capa.x, y1: capa.y - medio, x2: capa.x, y2: capa.y + medio };
  }
  if (capa.tipo === "video") return null;
  const ancho = capa.tipo === "forma" || capa.tipo === "media" || capa.tipo === "trazo" || capa.tipo === "vector" ? capa.ancho : 0;
  const alto = capa.tipo === "forma" || capa.tipo === "media" || capa.tipo === "trazo" || capa.tipo === "vector" ? capa.alto : 0;
  return { x1: capa.x - ancho / 2, y1: capa.y - alto / 2, x2: capa.x + ancho / 2, y2: capa.y + alto / 2 };
}

function ritmoDe(segmentos: Segmento[]) {
  if (!segmentos.length) return null;
  return {
    duracion: Math.round(mediana(segmentos.map((s) => s.duracion))),
    presets: frecuentes(segmentos.map((s) => s.preset), 3),
    easings: frecuentes(segmentos.map((s) => s.easing ?? "suave"), 3),
  };
}

export function estiloDePieza(comp: Composicion): EstiloPieza {
  const piezas = comp.capas.filter((c) => c.tipo !== "video" && !esPlaca(c));
  const placas = comp.capas.filter(esPlaca);

  // paleta: cada capa aporta sus colores visibles
  const colores: string[] = [];
  for (const c of piezas) {
    if (c.tipo === "texto") {
      colores.push(c.color);
      for (const tr of c.tramos ?? []) if (tr.color) colores.push(tr.color);
    } else if (c.tipo === "forma" || c.tipo === "trazo") colores.push(c.color);
    else if (c.tipo === "vector") {
      if (c.relleno) colores.push(c.relleno);
      if (c.trazoColor) colores.push(c.trazoColor);
    }
  }
  const conteo = new Map<string, number>();
  for (const col of colores.map(normalizarColor)) conteo.set(col, (conteo.get(col) ?? 0) + 1);
  const paleta = [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([color, usos]) => ({ color, usos }));
  const fondos = [...new Set([comp.fondo, ...placas.map((p) => (p.tipo === "forma" ? p.color : ""))].filter(Boolean).map(normalizarColor))];

  // tipografías por (familia, peso), con rol por el tamaño mayor del grupo
  const textos = piezas.filter((c): c is Extract<Capa, { tipo: "texto" }> => c.tipo === "texto");
  const mayor = Math.max(0, ...textos.map((t) => t.fuente.tamano));
  const grupos = new Map<string, { familia: string; peso: number; tamanos: Set<number>; capas: number }>();
  for (const t of textos) {
    const k = `${t.fuente.familia}|${t.fuente.peso}`;
    const g = grupos.get(k) ?? { familia: t.fuente.familia, peso: t.fuente.peso, tamanos: new Set<number>(), capas: 0 };
    g.tamanos.add(t.fuente.tamano);
    g.capas++;
    grupos.set(k, g);
  }
  const tipografias = [...grupos.values()]
    .map((g) => {
      const tamanos = [...g.tamanos].sort((a, b) => b - a);
      return { familia: g.familia, peso: g.peso, tamanos, rol: rolPorTamano(tamanos[0], mayor), capas: g.capas };
    })
    .sort((a, b) => b.tamanos[0] - a.tamanos[0]);

  // márgenes: piezas contra SU pantalla (la placa del grupo) o contra el frame
  let margenes: EstiloPieza["margenes"] = null;
  const acum = { izquierda: Infinity, derecha: Infinity, arriba: Infinity, abajo: Infinity };
  for (const c of piezas) {
    const caja = cajaDe(c);
    if (!caja) continue;
    const placa = placas.find((p) => p.id === c.grupo);
    const marco = placa && placa.tipo === "forma"
      ? { x1: placa.x - placa.ancho / 2, y1: placa.y - placa.alto / 2, x2: placa.x + placa.ancho / 2, y2: placa.y + placa.alto / 2 }
      : { x1: 0, y1: 0, x2: comp.ancho, y2: comp.alto };
    // si la pieza se sale del marco, no habla de márgenes (es un fondo o un
    // elemento sangrado) — se ignora ese eje
    if (caja.x1 >= marco.x1) acum.izquierda = Math.min(acum.izquierda, caja.x1 - marco.x1);
    if (caja.x2 <= marco.x2) acum.derecha = Math.min(acum.derecha, marco.x2 - caja.x2);
    if (caja.y1 >= marco.y1) acum.arriba = Math.min(acum.arriba, caja.y1 - marco.y1);
    if (caja.y2 <= marco.y2) acum.abajo = Math.min(acum.abajo, marco.y2 - caja.y2);
  }
  if (Object.values(acum).every(Number.isFinite)) {
    margenes = {
      izquierda: Math.round(acum.izquierda),
      derecha: Math.round(acum.derecha),
      arriba: Math.round(acum.arriba),
      abajo: Math.round(acum.abajo),
    };
  }

  // ritmo
  const entradas = piezas.map((c) => c.entrada).filter((s): s is Segmento => Boolean(s));
  const salidas = piezas.map((c) => c.salida).filter((s): s is Segmento => Boolean(s));
  const escalonados = [...entradas, ...salidas].map((s) => s.escalonado ?? 0).filter((e) => e > 0);

  return {
    paleta,
    fondos,
    tipografias,
    margenes,
    ritmo: {
      entrada: ritmoDe(entradas),
      salida: ritmoDe(salidas),
      escalonado: escalonados.length ? Math.round(mediana(escalonados)) : null,
    },
  };
}

const NOMBRE_ROL: Record<RolTipografico, string> = {
  titulo: "títulos",
  subtitulo: "subtítulos",
  cuerpo: "cuerpo",
  detalle: "detalle",
};

/** El bloque para el director: compacto, en su vocabulario, solo con lo que
    hay (una pieza sin animación no habla de ritmo). Vacío si la composición
    no tiene piezas todavía. */
export function describirEstilo(estilo: EstiloPieza): string {
  const lineas: string[] = [];
  if (estilo.paleta.length) {
    const paleta = estilo.paleta.slice(0, 6).map((p) => `${p.color} (${p.usos})`).join(", ");
    lineas.push(`- Paleta: ${paleta}${estilo.fondos.length ? ` · fondos: ${estilo.fondos.join(", ")}` : ""}`);
  }
  if (estilo.tipografias.length) {
    const tipos = estilo.tipografias
      .map((t) => `${t.familia} ${t.peso} → ${NOMBRE_ROL[t.rol]} (${t.tamanos.map((n) => `${n}px`).join(", ")})`)
      .join("; ");
    lineas.push(`- Tipografías: ${tipos}`);
  }
  if (estilo.margenes) {
    const m = estilo.margenes;
    lineas.push(`- Márgenes mínimos al borde de pantalla: izq ${m.izquierda}px, der ${m.derecha}px, arriba ${m.arriba}px, abajo ${m.abajo}px`);
  }
  const r = estilo.ritmo;
  if (r.entrada || r.salida) {
    const partes: string[] = [];
    if (r.entrada) partes.push(`entradas ~${r.entrada.duracion}ms (${r.entrada.presets.join("/")}; ${r.entrada.easings.join("/")})`);
    if (r.salida) partes.push(`salidas ~${r.salida.duracion}ms (${r.salida.presets.join("/")}; ${r.salida.easings.join("/")})`);
    if (r.escalonado) partes.push(`escalonado ~${r.escalonado}ms`);
    lineas.push(`- Ritmo: ${partes.join(" · ")}`);
  }
  if (!lineas.length) return "";
  return `ESTILO DE LA PIEZA (leído de la composición — respetalo al diseñar o derivar pantallas):\n${lineas.join("\n")}`;
}
