/* -----------------------------------------------------------------------------
   Biblioteca de efectos — el catálogo de presets con su plantilla de preview

   Cada efecto se muestra con una MINI composición de demostración que corre
   por el motor real (estadoEn + pintar): el preview es exactamente lo que el
   efecto hace, nunca un video grabado que envejece.

   La biblioteca se organiza en FAMILIAS (qué clase de capa anima cada demo):
   - «texto»: demuestra sobre un título dividido por caracteres;
   - «grafica»: demuestra sobre una ESTRELLA vectorial (una capa entera, sin
     división) — los mismos presets, mostrados como se ven en un logo;
   - «trazo»: los efectos de trim, sobre la línea zigzag.
   Y en PARES in/out: cada entrada declara su salida inversa natural
   (salidaPareja) y la tarjeta ofrece aplicar la entrada, la salida o ambas.
----------------------------------------------------------------------------- */

import type { CapaTexto, CapaTrazo, CapaVector, Composicion, Segmento } from "@/lib/motion/modelo";
import { CATEGORIAS, PRESETS, type CategoriaPreset } from "@/lib/motion/presets-puro";

export type FamiliaEfecto = "texto" | "grafica" | "trazo";

export const FAMILIAS: { id: FamiliaEfecto; nombre: string }[] = [
  { id: "texto", nombre: "Textos" },
  { id: "grafica", nombre: "Gráficos" },
  { id: "trazo", nombre: "Trazos" },
];

export type EfectoBiblioteca = {
  nombre: string;
  clase: "entrada" | "salida";
  categoria: CategoriaPreset;
  /** anima el trim del trazo: sólo aplica a capas tipo trazo */
  esDeTrazo: boolean;
};

/** Un PAR de la biblioteca: la animación con su in y su out. Una salida sin
    entrada que la apunte queda como tarjeta solo-out (entrada ausente). */
export type ParBiblioteca = {
  /** nombre visible de la tarjeta (el de la entrada, o el de la salida) */
  id: string;
  entrada?: string;
  salida?: string;
  categoria: CategoriaPreset;
  esDeTrazo: boolean;
};

export function efectosDeBiblioteca(): EfectoBiblioteca[] {
  return Object.entries(PRESETS).map(([nombre, def]) => {
    const compilado = def.compilar({});
    return {
      nombre,
      clase: def.clase,
      categoria: def.categoria,
      esDeTrazo: !!(compilado.pista.dTrazoInicio || compilado.pista.dTrazoFin),
    };
  });
}

/** En qué familias vive un preset: los de trim sólo en trazos; el tracking
    sólo en texto (necesita varias unidades: en una gráfica no hace nada);
    todo lo demás sirve para texto Y gráficas (las máscaras incluidas: el
    recorte también funciona sobre el bbox de una capa entera). */
export function familiasDePreset(nombre: string): FamiliaEfecto[] {
  const def = PRESETS[nombre];
  if (!def) return [];
  const compilado = def.compilar({});
  if (compilado.pista.dTrazoInicio || compilado.pista.dTrazoFin) return ["trazo"];
  if (compilado.tracking) return ["texto"];
  return ["texto", "grafica"];
}

/** Los pares in/out de una familia, agrupados por categoría en el orden
    canónico. Dos entradas pueden compartir salida (cada una es su tarjeta);
    las salidas que nadie apunta salen como tarjeta solo-out al final. */
export function paresPorCategoria(familia: FamiliaEfecto): { categoria: (typeof CATEGORIAS)[number]; pares: ParBiblioteca[] }[] {
  const todos = efectosDeBiblioteca();
  const porNombre = new Map(todos.map((e) => [e.nombre, e]));
  const referenciadas = new Set<string>();
  const pares: ParBiblioteca[] = [];

  for (const efecto of todos) {
    if (efecto.clase !== "entrada") continue;
    if (!familiasDePreset(efecto.nombre).includes(familia)) continue;
    const salida = PRESETS[efecto.nombre].salidaPareja;
    const salidaValida = salida && porNombre.has(salida) ? salida : undefined;
    if (salidaValida) referenciadas.add(salidaValida);
    pares.push({
      id: efecto.nombre,
      entrada: efecto.nombre,
      salida: salidaValida,
      categoria: efecto.categoria,
      esDeTrazo: efecto.esDeTrazo,
    });
  }
  for (const efecto of todos) {
    if (efecto.clase !== "salida" || referenciadas.has(efecto.nombre)) continue;
    if (!familiasDePreset(efecto.nombre).includes(familia)) continue;
    pares.push({
      id: efecto.nombre,
      salida: efecto.nombre,
      categoria: efecto.categoria,
      esDeTrazo: efecto.esDeTrazo,
    });
  }

  return CATEGORIAS.map((categoria) => ({
    categoria,
    pares: pares.filter((p) => p.categoria === categoria.id),
  })).filter((seccion) => seccion.pares.length > 0);
}

/** En qué instante del bucle la plantilla está EN REPOSO (la carta quieta):
    con entrada, después de que terminó; solo-out, antes de que arranque. */
export function reposoDePar(par: Pick<ParBiblioteca, "entrada">): number {
  return par.entrada ? 1150 : 400;
}

/** Compat: reposo de un efecto suelto (una sola clase). */
export function reposoDeEfecto(clase: "entrada" | "salida"): number {
  return clase === "entrada" ? 1500 : 250;
}

const PATH_ZIGZAG = "M 20 130 L 120 40 L 220 130 L 320 40 L 420 130";
const LARGO_ZIGZAG = 4 * Math.hypot(100, 90);

/** Estrella de 5 puntas centrada, generada acá (determinista, sin DOM). */
function pathEstrella(radio: number, radioInterno: number): string {
  const c = radio;
  const puntos: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? radio : radioInterno;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    puntos.push(`${i === 0 ? "M" : "L"} ${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`);
  }
  return puntos.join(" ") + " Z";
}

function capaDeDemo(familia: FamiliaEfecto): CapaTexto | CapaTrazo | CapaVector {
  if (familia === "trazo") {
    return {
      id: "linea",
      nombre: "Línea",
      tipo: "trazo",
      path: PATH_ZIGZAG,
      ancho: 440,
      alto: 170,
      color: "#8891ff",
      grosor: 7,
      largo: LARGO_ZIGZAG,
      remate: "redondo",
      x: 240,
      y: 135,
    };
  }
  if (familia === "grafica") {
    return {
      id: "estrella",
      nombre: "Estrella",
      tipo: "vector",
      path: pathEstrella(70, 27),
      ancho: 140,
      alto: 140,
      relleno: "#8891ff",
      x: 240,
      y: 135,
      motionBlur: 0.7,
    };
  }
  return {
    id: "titulo",
    nombre: "Título",
    tipo: "texto",
    texto: "Motion",
    fuente: { familia: "-apple-system, 'Segoe UI', Roboto, sans-serif", tamano: 72, peso: 800, interletrado: -1 },
    color: "#e8e8ee",
    division: "caracteres",
    alineacion: "centro",
    x: 240,
    y: 158,
    motionBlur: 0.7,
  };
}

/** Composición chica (480×270, bucle de 2.6 s) que demuestra el PAR entero:
    la entrada al principio, el reposo al medio, la salida al final. */
export function plantillaDePar(par: Pick<ParBiblioteca, "entrada" | "salida" | "esDeTrazo">, familia: FamiliaEfecto): Composicion {
  const capa = capaDeDemo(familia);
  const escalonado = familia === "texto" ? 40 : undefined;
  if (par.entrada) {
    capa.entrada = { preset: par.entrada, en: 250, duracion: 700, easing: "salidaExpo", escalonado };
  }
  if (par.salida) {
    capa.salida = { preset: par.salida, en: 1550, duracion: 650, easing: "entradaCubic", escalonado: familia === "texto" ? 30 : undefined };
  }
  return {
    version: 1,
    nombre: `fx-${par.entrada ?? par.salida ?? "par"}`,
    ancho: 480,
    alto: 270,
    fps: 30,
    duracion: 2600,
    fondo: "#101016",
    capas: [capa],
  };
}

/** Compat: plantilla de UN efecto (una sola clase), como la carta vieja. */
export function plantillaDeEfecto(nombre: string): Composicion {
  const def = PRESETS[nombre];
  const clase = def?.clase ?? "entrada";
  const esDeTrazo = def
    ? !!(def.compilar({}).pista.dTrazoInicio || def.compilar({}).pista.dTrazoFin)
    : false;
  const familia: FamiliaEfecto = esDeTrazo ? "trazo" : "texto";
  const capa = capaDeDemo(familia);
  const segmento: Segmento = clase === "entrada"
    ? { preset: nombre, en: 250, duracion: 800, easing: "salidaExpo", escalonado: esDeTrazo ? undefined : 40 }
    : { preset: nombre, en: 700, duracion: 700, easing: "entradaCubic", escalonado: esDeTrazo ? undefined : 30 };
  capa[clase] = segmento;
  return {
    version: 1,
    nombre: `fx-${nombre}`,
    ancho: 480,
    alto: 270,
    fps: 30,
    duracion: 1900,
    fondo: "#101016",
    capas: [capa],
  };
}
