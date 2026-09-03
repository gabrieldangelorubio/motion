/* -----------------------------------------------------------------------------
   MÁRGENES SEGUROS — nada pegado al borde del cuadro

   Gabriel (2026-09-03), con cuatro frames de logbook donde los chips
   tocaban el borde y las barras caídas sangraban por los dos lados: «algo
   que tiene que quedar superclaro son los safe margins: nunca se puede
   poner algo fuera, porque se va a cortar; que haya un toggle para verlos y
   que el director los maneje muy bien, que siempre todo lo ponga un poquito
   más safe». Como en TV: dos rectángulos concéntricos sobre el cuadro.

   - ACCIÓN (5 % por lado, el 90 % del cuadro): la zona que NINGÚN contenido
     cruza. Es la regla dura: la auditoría marca lo que queda afuera.
   - TÍTULO (10 % por lado, el 80 % del cuadro): donde se PLANEA. El zoom por
     contenido apunta acá, así el push-in de un hold (+3 a +6 %) sigue
     adentro de la zona de acción.

   Todo en px del LIENZO relativos al cuadro visible (ancho/zoom × alto/zoom):
   los márgenes escalan con el zoom, como el cuadro. Sin dependencias del
   motor: lo usan la auditoría, el estado que lee el director, el Lienzo (las
   guías) y los frames de la revisión visual.
----------------------------------------------------------------------------- */

export type Caja = { x1: number; y1: number; x2: number; y2: number };

/** Fracción del cuadro que se deja libre por lado. */
export const MARGEN_SEGURO = { accion: 0.05, titulo: 0.1 } as const;
export type NivelSeguro = keyof typeof MARGEN_SEGURO;

const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** La caja metida `margen` (fracción del cuadro) por cada lado. */
export function cajaSegura(caja: Caja, margen: number): Caja {
  const mx = (caja.x2 - caja.x1) * margen;
  const my = (caja.y2 - caja.y1) * margen;
  return { x1: caja.x1 + mx, y1: caja.y1 + my, x2: caja.x2 - mx, y2: caja.y2 - my };
}

export type Desborde = { izq: number; der: number; arr: number; aba: number };

/** Cuánto sobresale una caja de la zona segura de un cuadro visible, por
    lado, en px del lienzo (0 = adentro por ese lado). */
export function desbordeSeguro(caja: Caja, visible: Caja, margen: number = MARGEN_SEGURO.accion): Desborde {
  const s = cajaSegura(visible, margen);
  return {
    izq: Math.max(0, s.x1 - caja.x1),
    der: Math.max(0, caja.x2 - s.x2),
    arr: Math.max(0, s.y1 - caja.y1),
    aba: Math.max(0, caja.y2 - s.y2),
  };
}

export function totalDesborde(d: Desborde): number {
  return d.izq + d.der + d.arr + d.aba;
}

/**
 * La corrección de cámara que mete la caja en la zona segura, en los dos
 * sentidos posibles: el ZOOM que alcanza conservando el centro actual (si ya
 * entra, el zoom actual), y el CENTRO que alcanza conservando el zoom
 * (null si la caja no entra en la zona ni centrada: hay que bajar el zoom).
 */
export function correccionSegura(
  caja: Caja,
  visible: Caja,
  zoom: number,
  margen: number = MARGEN_SEGURO.accion,
): { zoom: number; centro: { x: number; y: number } | null } {
  const cx = (visible.x1 + visible.x2) / 2;
  const cy = (visible.y1 + visible.y2) / 2;
  const anchoRender = (visible.x2 - visible.x1) * zoom;
  const altoRender = (visible.y2 - visible.y1) * zoom;
  // con el centro fijo, la zona segura a zoom z mide (ancho/z)(1 − 2m) de
  // ancho: la caja entra cuando su punto más lejano al centro cae adentro
  const dx = Math.max(Math.abs(caja.x1 - cx), Math.abs(caja.x2 - cx));
  const dy = Math.max(Math.abs(caja.y1 - cy), Math.abs(caja.y2 - cy));
  const zx = dx > 0 ? (anchoRender * (1 - 2 * margen)) / (2 * dx) : Infinity;
  const zy = dy > 0 ? (altoRender * (1 - 2 * margen)) / (2 * dy) : Infinity;
  const zoomSeguro = Math.min(zoom, zx, zy);

  const s = cajaSegura(visible, margen);
  let centro: { x: number; y: number } | null = null;
  if (caja.x2 - caja.x1 <= s.x2 - s.x1 && caja.y2 - caja.y1 <= s.y2 - s.y1) {
    const ddx = caja.x1 < s.x1 ? caja.x1 - s.x1 : caja.x2 > s.x2 ? caja.x2 - s.x2 : 0;
    const ddy = caja.y1 < s.y1 ? caja.y1 - s.y1 : caja.y2 > s.y2 ? caja.y2 - s.y2 : 0;
    centro = { x: r1(cx + ddx), y: r1(cy + ddy) };
  }
  return { zoom: r2(zoomSeguro), centro };
}

/** Lo que el director lee: los px de margen que corresponden a un cuadro. */
export function describirMargenSeguro(visible: Caja, margen: number = MARGEN_SEGURO.accion): string {
  const s = cajaSegura(visible, margen);
  return `zona segura x ${Math.round(s.x1)}–${Math.round(s.x2)}, y ${Math.round(s.y1)}–${Math.round(s.y2)}`;
}

/* ——— las guías, dibujadas ——— */

/** Lo mínimo de un contexto 2D que necesitan las guías (el Lienzo pasa el
    real; los tests, un doble). */
export type ContextoGuias = {
  save(): void;
  restore(): void;
  beginPath(): void;
  rect(x: number, y: number, w: number, h: number): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  globalAlpha: number;
};

export type Cuadro = { x: number; y: number; ancho: number; alto: number };

/** Las dos zonas de un cuadro más las marcas de centro (los ticks del
    medio de cada lado de la zona de título y la cruz del centro), en las
    coordenadas del cuadro. Para dibujar y para testear la geometría. */
export function guiasSeguras(cuadro: Cuadro): {
  accion: Cuadro;
  titulo: Cuadro;
  marcas: { x: number; y: number; ancho: number; alto: number }[];
} {
  const zona = (m: number): Cuadro => ({
    x: cuadro.x + cuadro.ancho * m,
    y: cuadro.y + cuadro.alto * m,
    ancho: cuadro.ancho * (1 - 2 * m),
    alto: cuadro.alto * (1 - 2 * m),
  });
  const accion = zona(MARGEN_SEGURO.accion);
  const titulo = zona(MARGEN_SEGURO.titulo);
  const largo = Math.min(cuadro.ancho, cuadro.alto) * 0.025;
  const cx = cuadro.x + cuadro.ancho / 2;
  const cy = cuadro.y + cuadro.alto / 2;
  // las marcas son rectángulos finísimos (grosor 0: el que dibuja pone el
  // suyo en px de pantalla): arriba, abajo, izquierda, derecha, y la cruz
  const marcas = [
    { x: cx, y: titulo.y, ancho: 0, alto: largo },
    { x: cx, y: titulo.y + titulo.alto - largo, ancho: 0, alto: largo },
    { x: titulo.x, y: cy, ancho: largo, alto: 0 },
    { x: titulo.x + titulo.ancho - largo, y: cy, ancho: largo, alto: 0 },
    { x: cx, y: cy - largo / 2, ancho: 0, alto: largo },
    { x: cx - largo / 2, y: cy, ancho: largo, alto: 0 },
  ];
  return { accion, titulo, marcas };
}

/**
 * Dibuja las guías sobre un cuadro. `escala` es cuántos px de pantalla mide
 * un px del cuadro: las líneas salen de 1 px de pantalla siempre, con un
 * halo oscuro debajo para que se lean sobre claro y sobre oscuro.
 */
export function dibujarMargenesSeguros(ctx: ContextoGuias, cuadro: Cuadro, escala = 1): void {
  const { accion, titulo, marcas } = guiasSeguras(cuadro);
  const fino = 1 / escala;
  ctx.save();
  const trazar = (z: Cuadro, alfa: number) => {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = fino * 3;
    ctx.beginPath();
    ctx.rect(z.x, z.y, z.ancho, z.alto);
    ctx.stroke();
    ctx.globalAlpha = alfa;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = fino;
    ctx.beginPath();
    ctx.rect(z.x, z.y, z.ancho, z.alto);
    ctx.stroke();
  };
  trazar(accion, 0.85);
  trazar(titulo, 0.55);
  for (const m of marcas) {
    const w = m.ancho || fino;
    const h = m.alto || fino;
    const x = m.ancho ? m.x : m.x - fino / 2;
    const y = m.alto ? m.y : m.y - fino / 2;
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - fino, y - fino, w + fino * 2, h + fino * 2);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}
