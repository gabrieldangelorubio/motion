/* -----------------------------------------------------------------------------
   Derivar una PANTALLA — tanda D2: «armar pantallas con el mismo estilo»

   Clona una pantalla entera (la placa y todas sus capas) al lado de la
   última del lienzo, conservando estructura, estilo Y MOVIMIENTO (entradas,
   salidas, keyframes — la ventaja de que diseño y animación vivan en el
   mismo modelo), y reemplaza el contenido: textos nuevos por capa, con el
   mismo heurístico de encaje de transformar_texto (un texto más largo achica
   el cuerpo por cociente de caracteres — nunca agranda; mayúsculas se
   respetan). Opcionalmente corre toda la animación de la pantalla nueva en
   el tiempo (desdeMs) para que suceda DESPUÉS de la original.

   Pura: recibe y devuelve la composición; ids nuevos garantizados únicos;
   grupo y subgrupo remapeados; las pistas de x/y se desplazan con la
   pantalla (son valores absolutos del lienzo).
----------------------------------------------------------------------------- */

import type { Capa, CapaTexto, Composicion, Keyframe } from "@/lib/motion/modelo";
import { desplazarTiempoCapas, type Resultado } from "@/lib/motion/herramientas-puro";
import { esPlaca } from "@/lib/motion/estilo-puro";

export type Reemplazo = { capaId: string; texto: string };

export type OpcionesDerivar = {
  /** nombre de la pantalla nueva; default «<original> B» */
  nombre?: string;
  /** textos nuevos por capa ORIGINAL (los ids de la pantalla de origen) */
  reemplazos?: Reemplazo[];
  /** corre toda la animación de la pantalla nueva estos ms (≥0) */
  desdeMs?: number;
  /** separación horizontal con la última pantalla, px */
  separacion?: number;
};

export type PantallaDerivada = {
  composicion: Composicion;
  /** id de la placa nueva (= grupo de la pantalla) */
  pantallaId: string;
  /** id original → id nuevo, para que el director siga editando lo derivado */
  renombres: Record<string, string>;
};

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Texto nuevo con el ESTILO del original: conserva mayúsculas totales y
    achica el cuerpo si la línea más larga crece (encaje en la caja). */
export function textoEncajado(original: CapaTexto, textoNuevo: string): { texto: string; tamano: number } {
  const esMayusculas = /[A-ZÁÉÍÓÚÑ]/.test(original.texto) && !/[a-záéíóúñ]/.test(original.texto);
  const texto = esMayusculas ? textoNuevo.toUpperCase() : textoNuevo;
  const lineaMasLarga = (t: string) => Math.max(0, ...t.split("\n").map((l) => l.replace(/\s/g, "").length));
  const largoOriginal = lineaMasLarga(original.texto);
  const largoNuevo = lineaMasLarga(texto);
  // un original vacío (placeholder) no dice nada del encaje: cuerpo intacto
  const factor = largoOriginal > 0 && largoNuevo > 0 ? Math.min(1, largoOriginal / largoNuevo) : 1;
  // piso de 8px, el mismo clamp de editar_capa: un texto ilegible no es «encajado»
  const tamano = Math.max(8, Math.round(original.fuente.tamano * factor * 10) / 10);
  return { texto, tamano: Math.min(tamano, Math.max(8, original.fuente.tamano)) };
}

export function derivarPantalla(
  comp: Composicion,
  placaId: string,
  opciones: OpcionesDerivar = {},
  ahora = Date.now(),
): Resultado<PantallaDerivada> {
  const placa = comp.capas.find((c) => c.id === placaId);
  if (!placa || !esPlaca(placa) || placa.tipo !== "forma") {
    const pantallas = comp.capas.filter(esPlaca).map((p) => `${p.id} («${p.nombre}»)`);
    return {
      ok: false,
      error: pantallas.length
        ? `«${placaId}» no es la placa de una pantalla; las pantallas son: ${pantallas.join(", ")}`
        : "esta composición no tiene pantallas (placas de fondo) para derivar",
    };
  }
  const miembros = comp.capas.filter((c) => c.grupo === placaId);
  const reemplazos = opciones.reemplazos ?? [];
  for (const r of reemplazos) {
    const capa = miembros.find((c) => c.id === r.capaId);
    if (!capa) return { ok: false, error: `el reemplazo apunta a «${r.capaId}», que no es una capa de la pantalla «${placa.nombre}»` };
    if (capa.tipo !== "texto") return { ok: false, error: `«${capa.nombre}» no es una capa de texto: solo se reemplazan textos` };
  }

  // a la derecha de la ÚLTIMA pantalla del lienzo (o de la original si es la única)
  const placas = comp.capas.filter((c): c is Extract<Capa, { tipo: "forma" }> => esPlaca(c) && c.tipo === "forma");
  const bordeDerecho = Math.max(...placas.map((p) => p.x + p.ancho / 2));
  const separacion = opciones.separacion ?? 200;
  const dx = bordeDerecho + separacion - (placa.x - placa.ancho / 2);
  const dy = 0;

  // ids únicos
  const usados = new Set(comp.capas.map((c) => c.id));
  const idLibre = (base: string) => {
    let candidato = base;
    let n = 2;
    while (usados.has(candidato)) candidato = `${base}-${n++}`;
    usados.add(candidato);
    return candidato;
  };
  const nombreBase = placa.nombre.replace(/ \(fondo\)$/, "");
  const nombresPlacas = new Set(placas.map((p) => p.nombre.replace(/ \(fondo\)$/, "")));
  let nombre = opciones.nombre?.trim() || `${nombreBase} B`;
  if (!opciones.nombre?.trim()) {
    // derivar lo derivado no apila «B B»: Home B, Home B 2, Home B 3…
    const raiz = nombreBase.replace(/ B( \d+)?$/, "");
    nombre = `${raiz} B`;
    for (let n = 2; nombresPlacas.has(nombre); n++) nombre = `${raiz} B ${n}`;
  }
  const pantallaId = idLibre(`pantalla-${slug(nombre).slice(0, 24) || "derivada"}`);
  const sufijo = slug(nombre).slice(0, 12) || "b";

  const renombres: Record<string, string> = { [placaId]: pantallaId };
  const desplazarPista = (pista: Keyframe[] | undefined, d: number) => pista?.map((k) => ({ ...k, v: k.v + d }));
  const prefijoSub = `${placaId}:`;

  const nuevas: Capa[] = miembros.map((c) => {
    const id = c.id === placaId ? pantallaId : idLibre(`${c.id}-${sufijo}`);
    renombres[c.id] = id;
    const pistas = c.pistas
      ? { ...c.pistas, ...(c.pistas.x ? { x: desplazarPista(c.pistas.x, dx) } : {}), ...(c.pistas.y ? { y: desplazarPista(c.pistas.y, dy) } : {}) }
      : undefined;
    let capa: Capa = {
      ...c,
      id,
      x: c.x + dx,
      y: c.y + dy,
      grupo: pantallaId,
      subgrupo: c.subgrupo ? `${pantallaId}:${c.subgrupo.startsWith(prefijoSub) ? c.subgrupo.slice(prefijoSub.length) : c.subgrupo}` : undefined,
      pistas,
      v: ahora,
    };
    if (c.id === placaId) capa = { ...capa, nombre: `${nombre} (fondo)` };
    const reemplazo = reemplazos.find((r) => r.capaId === c.id);
    if (reemplazo && capa.tipo === "texto") {
      const { texto, tamano } = textoEncajado(capa, reemplazo.texto);
      const mismaTinta = texto.replace(/\s+/g, "") === capa.texto.replace(/\s+/g, "");
      capa = {
        ...capa,
        texto,
        fuente: { ...capa.fuente, tamano },
        // los tramos indexan caracteres del texto viejo: con otra tinta no valen
        tramos: mismaTinta ? capa.tramos : undefined,
      };
    }
    return capa;
  });

  let composicion: Composicion = { ...comp, capas: [...comp.capas, ...nuevas] };
  if (opciones.desdeMs && opciones.desdeMs > 0) {
    composicion = desplazarTiempoCapas(composicion, nuevas.map((c) => c.id), opciones.desdeMs);
  }
  return { ok: true, valor: { composicion, pantallaId, renombres } };
}
