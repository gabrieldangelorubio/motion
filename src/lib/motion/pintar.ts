/* -----------------------------------------------------------------------------
   pintar(estado, ctx) — el rasterizador determinista

   Recibe el estado YA resuelto por estadoEn y lo dibuja en un canvas 2D.
   No decide nada de animación: si dos llamadas con el mismo estado pintaran
   distinto, el export dejaría de ser reproducible. Por eso acá no hay reloj,
   ni aleatoriedad, ni lecturas del DOM: sólo estado → trazos.

   Funciona igual sobre CanvasRenderingContext2D y OffscreenCanvasRenderingContext2D
   (preview y render usan la misma función — §10.3 del kit). En tests se pasa
   un contexto falso que registra llamadas.
----------------------------------------------------------------------------- */

import type { EstadoCapa, EstadoComposicion } from "@/lib/motion/evaluar-puro";

/** El subconjunto de la API de canvas que usamos — permite un doble de test. */
export type Contexto2D = Pick<
  CanvasRenderingContext2D,
  | "save" | "restore" | "translate" | "rotate" | "scale"
  | "fillRect" | "fillText" | "measureText" | "beginPath" | "ellipse" | "fill"
  | "roundRect" | "stroke"
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  filter: string;
  lineWidth: number;
};

/** Imágenes ya resueltas por el caller (el motor no sabe de red ni catálogo). */
export type FuentesDeMedia = {
  imagenDe?: (mediaId: string) => CanvasImageSource | null;
};

function filtroDe(desenfoque: number, blurX: number, blurY: number): string {
  // Canvas 2D no tiene blur direccional: se aproxima con el mayor de los ejes.
  // El blur direccional real queda para el render con supersampling temporal.
  const total = Math.max(desenfoque, blurX, blurY);
  return total > 0.3 ? `blur(${total.toFixed(2)}px)` : "none";
}

function pintarTexto(estado: EstadoCapa, ctx: Contexto2D): void {
  const capa = estado.capa;
  if (capa.tipo !== "texto") return;
  const { familia, tamano, peso, interletrado = 0 } = capa.fuente;
  ctx.font = `${peso} ${tamano}px ${familia}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = capa.color;

  if (capa.division === "ninguna" || estado.unidades.length === 1) {
    const u = estado.unidades[0];
    ctx.save();
    ctx.globalAlpha *= u.opacidad;
    ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY);
    ctx.textAlign = capa.alineacion === "izquierda" ? "left" : capa.alineacion === "derecha" ? "right" : "center";
    ctx.translate(u.dx, u.dy);
    ctx.scale(1 + u.dEscala, 1 + u.dEscala);
    ctx.fillText(capa.texto, 0, 0);
    ctx.restore();
    return;
  }

  // División: cada unidad se posiciona con measureText, acumulando anchos.
  const unidades = capa.division === "palabras"
    ? capa.texto.split(/\s+/).filter(Boolean)
    : [...capa.texto];
  const anchoEspacio = ctx.measureText(" ").width;
  const anchos = unidades.map((u) => (u === " " ? anchoEspacio : ctx.measureText(u).width + interletrado));
  const total = anchos.reduce((a, b) => a + b, 0) +
    (capa.division === "palabras" ? anchoEspacio * (unidades.length - 1) : 0);
  let cursor = capa.alineacion === "izquierda" ? 0 : capa.alineacion === "derecha" ? -total : -total / 2;

  let indiceAnimable = 0;
  for (let i = 0; i < unidades.length; i++) {
    const glifo = unidades[i];
    const esEspacio = glifo.trim() === "";
    if (!esEspacio) {
      const u = estado.unidades[indiceAnimable] ?? estado.unidades[estado.unidades.length - 1];
      ctx.save();
      ctx.globalAlpha *= u.opacidad;
      ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY);
      ctx.textAlign = "left";
      ctx.translate(cursor + u.dx, u.dy);
      ctx.scale(1 + u.dEscala, 1 + u.dEscala);
      ctx.fillText(glifo, 0, 0);
      ctx.restore();
      indiceAnimable++;
    }
    cursor += anchos[i] + (capa.division === "palabras" ? anchoEspacio : 0);
  }
}

function pintarForma(estado: EstadoCapa, ctx: Contexto2D): void {
  const capa = estado.capa;
  if (capa.tipo !== "forma") return;
  const u = estado.unidades[0];
  ctx.save();
  ctx.globalAlpha *= u.opacidad;
  ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY);
  ctx.translate(u.dx, u.dy);
  ctx.scale(1 + u.dEscala, 1 + u.dEscala);
  ctx.fillStyle = capa.color;
  const x = -capa.ancho / 2;
  const y = -capa.alto / 2;
  if (capa.forma === "elipse") {
    ctx.beginPath();
    ctx.ellipse(0, 0, capa.ancho / 2, capa.alto / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (capa.forma === "linea") {
    ctx.fillRect(x, -capa.alto / 2, capa.ancho, capa.alto);
  } else if (capa.radio && ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, capa.ancho, capa.alto, capa.radio);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, capa.ancho, capa.alto);
  }
  ctx.restore();
}

function pintarMedia(estado: EstadoCapa, ctx: Contexto2D, media: FuentesDeMedia): void {
  const capa = estado.capa;
  if (capa.tipo !== "media") return;
  const u = estado.unidades[0];
  ctx.save();
  ctx.globalAlpha *= u.opacidad;
  ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY);
  ctx.translate(u.dx, u.dy);
  ctx.scale(1 + u.dEscala, 1 + u.dEscala);
  const imagen = media.imagenDe?.(capa.mediaId) ?? null;
  if (imagen) {
    (ctx as unknown as CanvasRenderingContext2D).drawImage(
      imagen, -capa.ancho / 2, -capa.alto / 2, capa.ancho, capa.alto,
    );
  } else {
    // Placeholder determinista mientras el asset carga (o en un test).
    ctx.fillStyle = "rgba(128, 128, 140, 0.25)";
    ctx.fillRect(-capa.ancho / 2, -capa.alto / 2, capa.ancho, capa.alto);
  }
  ctx.restore();
}

export function pintar(estado: EstadoComposicion, ctx: Contexto2D, media: FuentesDeMedia = {}): void {
  ctx.save();
  ctx.fillStyle = estado.fondo;
  ctx.fillRect(0, 0, estado.ancho, estado.alto);

  for (const capa of estado.capas) {
    if (!capa.visible || capa.opacidad <= 0) continue;
    ctx.save();
    ctx.globalAlpha = capa.opacidad;
    ctx.translate(capa.x, capa.y);
    if (capa.rotacion) ctx.rotate((capa.rotacion * Math.PI) / 180);
    if (capa.escala !== 1) ctx.scale(capa.escala, capa.escala);
    if (capa.capa.tipo === "texto") pintarTexto(capa, ctx);
    else if (capa.capa.tipo === "forma") pintarForma(capa, ctx);
    else pintarMedia(capa, ctx, media);
    ctx.restore();
  }
  ctx.restore();
}
