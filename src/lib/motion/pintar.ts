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

import type { EstadoCapa, EstadoComposicion, EstadoUnidad } from "@/lib/motion/evaluar-puro";

/** El subconjunto de la API de canvas que usamos — permite un doble de test. */
export type Contexto2D = Pick<
  CanvasRenderingContext2D,
  | "save" | "restore" | "translate" | "rotate" | "scale"
  | "fillRect" | "fillText" | "measureText" | "beginPath" | "ellipse" | "fill"
  | "roundRect" | "stroke" | "rect" | "clip" | "setLineDash"
> & {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  filter: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineDashOffset: number;
};

/** Imágenes ya resueltas por el caller (el motor no sabe de red ni catálogo). */
export type FuentesDeMedia = {
  imagenDe?: (mediaId: string) => CanvasImageSource | null;
};

function filtroDe(desenfoque: number, blurX: number, blurY: number, escalaPx: number): string {
  // Canvas 2D no tiene blur direccional: se aproxima con el mayor de los ejes.
  // El blur direccional real queda para el render con supersampling temporal.
  // ctx.filter trabaja en píxeles de DISPOSITIVO (la transform no lo escala):
  // con supersampling espacial el radio se multiplica para verse igual.
  const total = Math.max(desenfoque, blurX, blurY);
  return total > 0.3 ? `blur(${(total * escalaPx).toFixed(2)}px)` : "none";
}

function pintarTexto(estado: EstadoCapa, ctx: Contexto2D, escalaPx: number): void {
  const capa = estado.capa;
  if (capa.tipo !== "texto") return;
  const { familia, tamano, peso, interletrado = 0 } = capa.fuente;
  const interlineado = capa.fuente.interlineado ?? tamano * 1.15;
  ctx.font = `${peso} ${tamano}px ${familia}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = capa.color;

  const lineas = capa.texto.split("\n");
  // El bloque queda centrado verticalmente en el ancla: con 1 línea la
  // baseline cae en y=0 (igual que antes de existir multilínea).
  const baseDeLinea = (i: number) => (i - (lineas.length - 1) / 2) * interlineado;

  const pintarUnidad = (texto: string, x: number, y: number, ancho: number, u: EstadoUnidad) => {
    ctx.save();
    ctx.globalAlpha *= u.opacidad;
    ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY, escalaPx);
    if (u.recorte) {
      // La máscara del revelado: la caja de REPOSO de la unidad (por eso el
      // rect va antes del translate por dx/dy). Generosa a los costados,
      // exacta en vertical — ahí es donde la máscara «corta» el movimiento.
      ctx.beginPath();
      ctx.rect(x - tamano * 0.25, y - tamano * 0.85, ancho + tamano * 0.5, interlineado);
      ctx.clip();
    }
    ctx.translate(x + u.dx, y + u.dy);
    if (u.dRotacion) {
      // la unidad rota alrededor de su centro VISUAL (medio del ancho, media
      // altura de mayúsculas sobre la baseline), no del origen de la línea
      ctx.translate(ancho / 2, -tamano * 0.35);
      ctx.rotate((u.dRotacion * Math.PI) / 180);
      ctx.translate(-ancho / 2, tamano * 0.35);
    }
    ctx.scale(1 + u.dEscala, 1 + u.dEscala);
    ctx.fillText(texto, 0, 0);
    ctx.restore();
  };

  let indiceAnimable = 0;
  const ultima = () => estado.unidades[estado.unidades.length - 1];
  for (let l = 0; l < lineas.length; l++) {
    const linea = lineas[l];
    const y = baseDeLinea(l);
    const anchoEspacio = ctx.measureText(" ").width;

    if (capa.division === "ninguna" || capa.division === "lineas") {
      const anchoLinea = ctx.measureText(linea).width;
      const x0 = capa.alineacion === "izquierda" ? 0 : capa.alineacion === "derecha" ? -anchoLinea : -anchoLinea / 2;
      const u = capa.division === "lineas"
        ? (estado.unidades[indiceAnimable++] ?? ultima())
        : estado.unidades[0];
      pintarUnidad(linea, x0, y, anchoLinea, u);
      continue;
    }

    // caracteres / palabras: cada unidad se posiciona con measureText, acumulando anchos.
    const trozos = capa.division === "palabras" ? linea.split(/\s+/).filter(Boolean) : [...linea];
    const anchos = trozos.map((tz) => (tz.trim() === "" ? anchoEspacio : ctx.measureText(tz).width + interletrado));
    const total = anchos.reduce((a, b) => a + b, 0) +
      (capa.division === "palabras" ? anchoEspacio * Math.max(0, trozos.length - 1) : 0);
    let cursor = capa.alineacion === "izquierda" ? 0 : capa.alineacion === "derecha" ? -total : -total / 2;

    for (let i = 0; i < trozos.length; i++) {
      const glifo = trozos[i];
      if (glifo.trim() !== "") {
        const u = estado.unidades[indiceAnimable] ?? ultima();
        pintarUnidad(glifo, cursor, y, anchos[i], u);
        indiceAnimable++;
      }
      cursor += anchos[i] + (capa.division === "palabras" ? anchoEspacio : 0);
    }
  }
}

function pintarTrazo(estado: EstadoCapa, ctx: Contexto2D, escalaPx: number): void {
  const capa = estado.capa;
  if (capa.tipo !== "trazo") return;
  const u = estado.unidades[0];
  if (u.trazoFin <= u.trazoInicio) return; // trim vacío: no hay nada que dibujar
  ctx.save();
  ctx.globalAlpha *= u.opacidad;
  ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY, escalaPx);
  ctx.translate(u.dx, u.dy);
  if (u.dRotacion) ctx.rotate((u.dRotacion * Math.PI) / 180);
  ctx.scale(1 + u.dEscala, 1 + u.dEscala);
  // el path viene en coordenadas locales del nodo; el ancla de la capa es el centro
  ctx.translate(-capa.ancho / 2, -capa.alto / 2);
  ctx.strokeStyle = capa.color;
  ctx.lineWidth = capa.grosor;
  ctx.lineCap = capa.remate === "recto" ? "butt" : "round";
  if (capa.largo > 0 && (u.trazoInicio > 0 || u.trazoFin < 1)) {
    // Trim estilo AE con dash: un solo tramo visible de (fin−inicio)·largo,
    // corrido inicio·largo dentro del path. El gap ≥ largo evita repeticiones.
    ctx.setLineDash([(u.trazoFin - u.trazoInicio) * capa.largo, capa.largo]);
    ctx.lineDashOffset = -u.trazoInicio * capa.largo;
  }
  // Path2D no existe en node: en tests el trazo se valida por el dash; en el
  // navegador (preview y export) siempre está.
  const RutaSVG = (globalThis as { Path2D?: new (d: string) => Path2D }).Path2D;
  if (RutaSVG) ctx.stroke(new RutaSVG(capa.path));
  ctx.restore();
}

function pintarForma(estado: EstadoCapa, ctx: Contexto2D, escalaPx: number): void {
  const capa = estado.capa;
  if (capa.tipo !== "forma") return;
  const u = estado.unidades[0];
  ctx.save();
  ctx.globalAlpha *= u.opacidad;
  ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY, escalaPx);
  ctx.translate(u.dx, u.dy);
  if (u.dRotacion) ctx.rotate((u.dRotacion * Math.PI) / 180);
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

function pintarMedia(estado: EstadoCapa, ctx: Contexto2D, media: FuentesDeMedia, escalaPx: number): void {
  const capa = estado.capa;
  if (capa.tipo !== "media") return;
  const u = estado.unidades[0];
  ctx.save();
  ctx.globalAlpha *= u.opacidad;
  ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY, escalaPx);
  ctx.translate(u.dx, u.dy);
  if (u.dRotacion) ctx.rotate((u.dRotacion * Math.PI) / 180);
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

export function pintar(estado: EstadoComposicion, ctx: Contexto2D, media: FuentesDeMedia = {}, escalaPx = 1): void {
  ctx.save();
  ctx.fillStyle = estado.fondo;
  ctx.fillRect(0, 0, estado.ancho, estado.alto);

  // La cámara es una transformación de MUNDO: se aplica antes de las capas y
  // por eso el export la hereda gratis. Identidad → ni una llamada de más.
  const cam = estado.camara;
  const camActiva = cam && (cam.zoom !== 1 || cam.x !== estado.ancho / 2 || cam.y !== estado.alto / 2);
  if (camActiva) {
    ctx.translate(estado.ancho / 2, estado.alto / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
  }

  for (const capa of estado.capas) {
    if (!capa.visible || capa.opacidad <= 0) continue;
    ctx.save();
    ctx.globalAlpha = capa.opacidad;
    // el modo de mezcla es de la CAPA contra lo ya pintado (fiel a Figma)
    if (capa.capa.mezcla) ctx.globalCompositeOperation = capa.capa.mezcla;
    ctx.translate(capa.x, capa.y);
    if (capa.rotacion) ctx.rotate((capa.rotacion * Math.PI) / 180);
    if (capa.escala !== 1) ctx.scale(capa.escala, capa.escala);
    if (capa.capa.tipo === "texto") pintarTexto(capa, ctx, escalaPx);
    else if (capa.capa.tipo === "forma") pintarForma(capa, ctx, escalaPx);
    else if (capa.capa.tipo === "trazo") pintarTrazo(capa, ctx, escalaPx);
    else pintarMedia(capa, ctx, media, escalaPx);
    ctx.restore();
  }
  ctx.restore();
}
