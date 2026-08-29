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
import type { TramoTexto } from "@/lib/motion/modelo";

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

/** La máscara del revelado para capas NO-texto: la caja de REPOSO de la
    capa (por eso va antes del translate por dx/dy) — la gráfica entra y
    sale «por detrás» de su propio marco, como un track matte del bbox. El
    margen cubre el grosor del borde (el stroke centrado sobresale). */
function recortarACaja(ctx: Contexto2D, ancho: number, alto: number, margen = 0): void {
  ctx.beginPath();
  ctx.rect(-ancho / 2 - margen, -alto / 2 - margen, ancho + margen * 2, alto + margen * 2);
  ctx.clip();
}

function pintarTexto(estado: EstadoCapa, ctx: Contexto2D, escalaPx: number): void {
  const capa = estado.capa;
  if (capa.tipo !== "texto") return;
  const { familia, tamano, peso, interletrado = 0 } = capa.fuente;
  const interlineado = capa.fuente.interlineado ?? tamano * 1.15;
  const fuenteBase = `${peso} ${tamano}px ${familia}`;
  ctx.font = fuenteBase;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = capa.color;

  // ——— Tramos de estilo (rich text de Figma): corridas de fuente/peso/
  // tamaño/color dentro del texto, indexadas por carácter NO BLANCO. Todo
  // segmento a pintar se parte en corridas uniformes; cada una se mide y se
  // dibuja con su propia font sobre la MISMA baseline. Sin tramos, la única
  // corrida es el estilo base — el camino de siempre.
  const tramos = capa.tramos ?? [];
  const estiloEn = (k: number): TramoTexto | null => {
    for (const tramo of tramos) if (k >= tramo.desde && k < tramo.hasta) return tramo;
    return null;
  };
  // deformaciones por letra (estirados tipo logo): misma indexación que los
  // tramos — cada rango deformado corta su propia corrida
  const defs = capa.deformaciones ?? [];
  type Def = (typeof defs)[number];
  const defEn = (k: number): Def | null => {
    for (const d of defs) if (k >= d.desde && k < d.hasta) return d;
    return null;
  };
  type Corrida = { texto: string; font: string; color: string; ancho: number; escalaX: number; escalaY: number };
  const esBlanco = (letra: string) => /\s/.test(letra);
  const noBlancos = (s: string) => {
    let n = 0;
    for (const letra of s) if (!esBlanco(letra)) n++;
    return n;
  };
  // parte `texto` (cuyo primer carácter no blanco es el índice k0) en corridas
  const corridasDe = (texto: string, k0: number): Corrida[] => {
    const brutas: { tramo: TramoTexto | null; def: Def | null; texto: string }[] = [];
    let k = k0;
    for (const letra of texto) {
      const blanco = esBlanco(letra);
      const previa = brutas[brutas.length - 1];
      // el blanco no tiene estilo propio: viaja con la corrida anterior
      const tramo = blanco ? (previa ? previa.tramo : null) : estiloEn(k);
      const def = blanco ? (previa ? previa.def : null) : defEn(k);
      if (previa && previa.tramo === tramo && previa.def === def) previa.texto += letra;
      else brutas.push({ tramo, def, texto: letra });
      if (!blanco) k++;
    }
    const corridas = brutas.map(({ tramo, def, texto: tx }) => {
      const font = tramo
        ? `${tramo.peso ?? peso} ${tramo.tamano ?? tamano}px ${tramo.familia ?? familia}`
        : fuenteBase;
      ctx.font = font;
      const escalaX = def?.escalaX ?? 1;
      return {
        texto: tx,
        font,
        color: tramo?.color ?? capa.color,
        // el ancho YA estirado: la letra ancha empuja a las que siguen
        ancho: ctx.measureText(tx).width * escalaX,
        escalaX,
        escalaY: def?.escalaY ?? 1,
      };
    });
    ctx.font = fuenteBase;
    return corridas;
  };
  const anchoDe = (corridas: Corrida[]) => corridas.reduce((a, c) => a + c.ancho, 0);

  // el CONTADOR (pista «numero») pisa el contenido: el texto vivo del frame
  const lineas = (estado.textoVivo ?? capa.texto).split("\n");
  // El bloque queda centrado verticalmente en el ancla: con 1 línea la
  // baseline cae en y=0 (igual que antes de existir multilínea).
  const baseDeLinea = (i: number) => (i - (lineas.length - 1) / 2) * interlineado;

  const pintarUnidad = (corridas: Corrida[], x: number, y: number, ancho: number, u: EstadoUnidad) => {
    ctx.save();
    ctx.globalAlpha *= u.opacidad;
    ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY, escalaPx);
    if (u.recorte) {
      // La máscara del revelado: la caja de REPOSO de la unidad (por eso el
      // rect va antes del translate por dx/dy). Generosa a los costados; en
      // vertical cubre el GLIFO COMPLETO (nunca menos que 1.2× el cuerpo):
      // con interlineado apretado una máscara de un interlineado de alto
      // cortaría la base de las letras en su posición final. El alto de la
      // máscara es EL MISMO que el viaje del preset (altoUnidad): la unidad
      // arranca exactamente escondida y termina exactamente entera.
      const altoMascara = Math.max(interlineado, tamano * 1.2);
      ctx.beginPath();
      ctx.rect(x - tamano * 0.25, y - tamano * 0.85, ancho + tamano * 0.5, altoMascara);
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
    let cursorCorrida = 0;
    for (const corrida of corridas) {
      ctx.font = corrida.font;
      ctx.fillStyle = corrida.color;
      if (corrida.escalaX !== 1 || corrida.escalaY !== 1) {
        // el estirado escala desde la BASELINE (la letra crece hacia arriba
        // y a lo ancho, como en un logo): el avance ya viene estirado
        ctx.save();
        ctx.translate(cursorCorrida, 0);
        ctx.scale(corrida.escalaX, corrida.escalaY);
        ctx.fillText(corrida.texto, 0, 0);
        ctx.restore();
      } else {
        ctx.fillText(corrida.texto, cursorCorrida, 0);
      }
      cursorCorrida += corrida.ancho;
    }
    ctx.font = fuenteBase;
    ctx.fillStyle = capa.color;
    ctx.restore();
  };

  let indiceAnimable = 0;
  let indiceTinta = 0; // caracteres no blancos ya consumidos (para los tramos)
  const ultima = () => estado.unidades[estado.unidades.length - 1];
  for (let l = 0; l < lineas.length; l++) {
    const linea = lineas[l];
    const y = baseDeLinea(l);
    const anchoEspacio = ctx.measureText(" ").width;

    if (capa.division === "ninguna" || capa.division === "lineas") {
      const corridas = corridasDe(linea, indiceTinta);
      const anchoLinea = anchoDe(corridas);
      const x0 = capa.alineacion === "izquierda" ? 0 : capa.alineacion === "derecha" ? -anchoLinea : -anchoLinea / 2;
      const u = capa.division === "lineas"
        ? (estado.unidades[indiceAnimable++] ?? ultima())
        : estado.unidades[0];
      pintarUnidad(corridas, x0, y, anchoLinea, u);
      indiceTinta += noBlancos(linea);
      continue;
    }

    // caracteres / palabras: cada unidad se posiciona midiendo sus corridas,
    // acumulando anchos.
    const trozos = capa.division === "palabras" ? linea.split(/\s+/).filter(Boolean) : [...linea];
    const corridasPorTrozo: Corrida[][] = [];
    {
      let k = indiceTinta;
      for (const trozo of trozos) {
        corridasPorTrozo.push(trozo.trim() === "" ? [] : corridasDe(trozo, k));
        k += noBlancos(trozo);
      }
    }
    const anchos = trozos.map((trozo, i) => (trozo.trim() === "" ? anchoEspacio : anchoDe(corridasPorTrozo[i]) + interletrado));
    const total = anchos.reduce((a, b) => a + b, 0) +
      (capa.division === "palabras" ? anchoEspacio * Math.max(0, trozos.length - 1) : 0);
    let cursor = capa.alineacion === "izquierda" ? 0 : capa.alineacion === "derecha" ? -total : -total / 2;

    for (let i = 0; i < trozos.length; i++) {
      const glifo = trozos[i];
      if (glifo.trim() !== "") {
        const u = estado.unidades[indiceAnimable] ?? ultima();
        pintarUnidad(corridasPorTrozo[i], cursor, y, anchos[i], u);
        indiceAnimable++;
      }
      cursor += anchos[i] + (capa.division === "palabras" ? anchoEspacio : 0);
    }
    indiceTinta += noBlancos(linea);
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
  if (u.recorte) recortarACaja(ctx, capa.ancho, capa.alto, capa.grosor / 2);
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

function pintarVector(estado: EstadoCapa, ctx: Contexto2D, escalaPx: number): void {
  const capa = estado.capa;
  if (capa.tipo !== "vector") return;
  const u = estado.unidades[0];
  ctx.save();
  ctx.globalAlpha *= u.opacidad;
  ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY, escalaPx);
  if (u.recorte) recortarACaja(ctx, capa.ancho, capa.alto, (capa.trazoGrosor ?? 0) / 2);
  ctx.translate(u.dx, u.dy);
  if (u.dRotacion) ctx.rotate((u.dRotacion * Math.PI) / 180);
  ctx.scale(1 + u.dEscala, 1 + u.dEscala);
  // el path viene en coordenadas locales del nodo; el ancla es el centro
  ctx.translate(-capa.ancho / 2, -capa.alto / 2);
  // Path2D no existe en node: en tests el vector se valida por el estado del
  // contexto; en el navegador (preview y export) siempre está — mismo trato
  // que el trazo.
  const RutaSVG = (globalThis as { Path2D?: new (d: string) => Path2D }).Path2D;
  if (RutaSVG) {
    const ruta = new RutaSVG(capa.path);
    if (capa.relleno) {
      ctx.fillStyle = capa.relleno;
      ctx.fill(ruta, capa.reglaRelleno ?? "nonzero");
    }
    if (capa.trazoColor && capa.trazoGrosor) {
      ctx.strokeStyle = capa.trazoColor;
      ctx.lineWidth = capa.trazoGrosor;
      ctx.lineCap = capa.remate === "recto" ? "butt" : "round";
      ctx.stroke(ruta);
    }
  }
  ctx.restore();
}

function pintarForma(estado: EstadoCapa, ctx: Contexto2D, escalaPx: number): void {
  const capa = estado.capa;
  if (capa.tipo !== "forma") return;
  const u = estado.unidades[0];
  ctx.save();
  ctx.globalAlpha *= u.opacidad;
  ctx.filter = filtroDe(u.desenfoque, u.blurX, u.blurY, escalaPx);
  if (u.recorte) recortarACaja(ctx, capa.ancho, capa.alto);
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
  if (u.recorte) recortarACaja(ctx, capa.ancho, capa.alto);
  ctx.translate(u.dx, u.dy);
  if (u.dRotacion) ctx.rotate((u.dRotacion * Math.PI) / 180);
  ctx.scale(1 + u.dEscala, 1 + u.dEscala);
  const imagen = media.imagenDe?.(capa.mediaId) ?? null;
  if (imagen) {
    // ajuste dentro de la caja, como en Figma/CSS: «cubrir» llena la caja
    // recortando centrado (clip), «contener» muestra la imagen entera con
    // aire. Sin tamaño natural conocido (un test, un bitmap raro): estirar.
    const natural = imagen as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
    const natW = natural.naturalWidth || natural.width || 0;
    const natH = natural.naturalHeight || natural.height || 0;
    const real = ctx as unknown as CanvasRenderingContext2D;
    if (natW > 0 && natH > 0) {
      const factor =
        capa.ajuste === "contener"
          ? Math.min(capa.ancho / natW, capa.alto / natH)
          : Math.max(capa.ancho / natW, capa.alto / natH);
      const dw = natW * factor;
      const dh = natH * factor;
      if (capa.ajuste !== "contener" && (dw > capa.ancho || dh > capa.alto)) {
        ctx.beginPath();
        ctx.rect(-capa.ancho / 2, -capa.alto / 2, capa.ancho, capa.alto);
        ctx.clip();
      }
      real.drawImage(imagen, -dw / 2, -dh / 2, dw, dh);
    } else {
      real.drawImage(imagen, -capa.ancho / 2, -capa.alto / 2, capa.ancho, capa.alto);
    }
  } else {
    // Placeholder determinista mientras el asset carga (o en un test).
    ctx.fillStyle = "rgba(128, 128, 140, 0.25)";
    ctx.fillRect(-capa.ancho / 2, -capa.alto / 2, capa.ancho, capa.alto);
  }
  ctx.restore();
}

export function pintar(estado: EstadoComposicion, ctx: Contexto2D, media: FuentesDeMedia = {}, escalaPx = 1): void {
  ctx.save();
  // fondo vacío = LIENZO TRANSPARENTE (secuencia PNG con alfa: las gráficas
  // solas, para montar encima de un video en AE/Premiere)
  if (estado.fondo) {
    ctx.fillStyle = estado.fondo;
    ctx.fillRect(0, 0, estado.ancho, estado.alto);
  }

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
    else if (capa.capa.tipo === "vector") pintarVector(capa, ctx, escalaPx);
    else pintarMedia(capa, ctx, media, escalaPx);
    ctx.restore();
  }
  ctx.restore();
}
