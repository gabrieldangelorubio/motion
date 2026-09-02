/* -----------------------------------------------------------------------------
   Export POR PANTALLA — la parte PURA (tanda G5 del fork GSAP)

   El pipeline del fork: las animaciones se dirigen y corrigen acá, con GSAP
   de motor; After Effects sólo ENSAMBLA las pantallas y hace los
   movimientos de cámara entre ellas. Para eso AE necesita cada pantalla
   como su propia secuencia PNG con alfa, en el formato de la placa y SIN la
   cámara del proyecto (la cámara se rehace en AE con las guías del
   manifiesto). Acá se decide qué escena sale por placa; el render frame a
   frame vive en exportar.ts.
----------------------------------------------------------------------------- */

import type { Camara, Capa, CapaForma, Composicion } from "@/lib/motion/modelo";
import { esPlaca } from "@/lib/motion/estilo-puro";

export type CajaDePantalla = { x: number; y: number; ancho: number; alto: number };

export type EscenaDePantalla = {
  pantallaId: string;
  nombre: string;
  /** carpeta dentro del zip, ASCII: «01-hero» */
  carpeta: string;
  /** caja de la placa en el lienzo (esquina superior izquierda + tamaño) */
  caja: CajaDePantalla;
  /** la composición recortada: formato = la placa, cámara fija centrada en
      ella, sólo las capas de esa pantalla, fondo transparente */
  comp: Composicion;
};

/** Par (los encoders lo piden y AE lo agradece), entero, nunca menor a 2. */
export function medidaPar(v: number): number {
  const entero = Math.max(2, Math.round(v));
  return entero % 2 === 0 ? entero : entero + 1;
}

/** «Hero Section / AI» → «01-hero-section-ai». Nombres ASCII para el zip. El
    sufijo « (fondo)» que el import pone a la placa no dice nada acá. */
export function nombreDeCarpeta(indice: number, nombre: string): string {
  const base = nombre
    .replace(/\s*\(fondo\)\s*$/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${String(indice + 1).padStart(2, "0")}-${base || "pantalla"}`;
}

export function cajaDePlaca(placa: CapaForma): CajaDePantalla {
  return { x: placa.x - placa.ancho / 2, y: placa.y - placa.alto / 2, ancho: placa.ancho, alto: placa.alto };
}

/** Cámara quieta que ve exactamente la placa: el render mide lo que la
    placa mide y el zoom 1 la muestra entera, centrada. */
function camaraFijaEn(placa: CapaForma): Camara {
  return { base: { x: placa.x, y: placa.y, zoom: 1 }, pistas: {} };
}

/**
 * Una escena por placa del lienzo, en el orden en que están en la comp.
 * `conPlaca` = true incluye el rect de fondo de la placa (la pantalla con su
 * color); por defecto queda afuera para que el PNG traiga alfa y el fondo
 * se ponga en AE. Las capas sueltas (sin `grupo`) no pertenecen a ninguna
 * pantalla y no salen en ninguna. Sin placas: lista vacía.
 */
export function escenasPorPantalla(comp: Composicion, opciones: { conPlaca?: boolean } = {}): EscenaDePantalla[] {
  const placas = comp.capas.filter((c): c is CapaForma => esPlaca(c) && c.tipo === "forma" && !c.oculta);
  return placas.map((placa, i) => {
    const caja = cajaDePlaca(placa);
    const capas: Capa[] = comp.capas.filter(
      (c) => c.grupo === placa.id && !c.oculta && (opciones.conPlaca === true || c.id !== placa.id),
    );
    return {
      pantallaId: placa.id,
      nombre: placa.nombre,
      carpeta: nombreDeCarpeta(i, placa.nombre),
      caja,
      comp: {
        ...comp,
        nombre: `${comp.nombre} — ${placa.nombre}`,
        ancho: medidaPar(placa.ancho),
        alto: medidaPar(placa.alto),
        fondo: "",
        camara: camaraFijaEn(placa),
        capas,
      },
    };
  });
}

/**
 * El manifiesto que viaja en la raíz del zip: qué carpeta es qué pantalla,
 * dónde vive cada una en el lienzo y la CÁMARA MAESTRA del proyecto
 * (base + keyframes), para rehacer los viajes entre pantallas en AE con los
 * mismos tiempos. JSON legible, ordenado, determinista.
 */
export function manifiestoPantallas(
  comp: Composicion,
  escenas: EscenaDePantalla[],
  rango: { desdeMs: number; frames: number },
): string {
  const pistas = comp.camara?.pistas ?? {};
  return JSON.stringify(
    {
      proyecto: comp.nombre,
      render: { ancho: comp.ancho, alto: comp.alto, fps: comp.fps },
      duracionMs: comp.duracion,
      secuencia: { desdeMs: rango.desdeMs, frames: rango.frames, nombre: "frame-#####.png" },
      pantallas: escenas.map((e) => ({
        carpeta: e.carpeta,
        id: e.pantallaId,
        nombre: e.nombre,
        lienzo: {
          x: Math.round(e.caja.x * 100) / 100,
          y: Math.round(e.caja.y * 100) / 100,
          ancho: Math.round(e.caja.ancho * 100) / 100,
          alto: Math.round(e.caja.alto * 100) / 100,
        },
        png: { ancho: e.comp.ancho, alto: e.comp.alto },
      })),
      camaraMaestra: {
        nota: "centro (x, y) en px del lienzo; zoom = ancho_render / ancho_visible. Rehacer en AE con una cámara/null sobre las secuencias ubicadas en `lienzo`.",
        base: comp.camara?.base ?? {},
        keyframes: {
          x: pistas.x ?? [],
          y: pistas.y ?? [],
          zoom: pistas.zoom ?? [],
        },
        temblor: comp.camara?.temblor ?? null,
      },
    },
    null,
    2,
  );
}
