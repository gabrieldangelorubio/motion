/* -----------------------------------------------------------------------------
   Plugin de Figma: exportar la pantalla seleccionada al IR del módulo motion

   Corre DENTRO de Figma (plugin de desarrollo: Plugins → Development →
   Import plugin from manifest…). Hace la normalización donde la API es
   rica: texto → texto real, rects/elipses sólidos → formas, y TODO lo que
   no se puede expresar fiel (vectores, booleans, fills de imagen, efectos,
   rotaciones, texto con estilos mixtos) se rasteriza a PNG 2× por nodo,
   con su aviso. La degradación es por-nodo, nunca all-or-nothing.

   Sin red (networkAccess none): el JSON sale por copy/paste, patrón Jitter.
----------------------------------------------------------------------------- */

// Sello de versión: se ve en la UI del plugin y viaja en el JSON — para
// saber al toque si el plugin que corrió es el del repo actualizado.
var VERSION_PLUGIN = 10;

function aHex(color) {
  var c = function (v) {
    var s = Math.round(v * 255).toString(16);
    return s.length === 1 ? "0" + s : s;
  };
  return "#" + c(color.r) + c(color.g) + c(color.b);
}

function pinturaSolida(fills) {
  if (fills === figma.mixed || !Array.isArray(fills)) return null;
  var visibles = fills.filter(function (f) { return f.visible !== false; });
  if (visibles.length !== 1 || visibles[0].type !== "SOLID") return null;
  return visibles[0];
}

function colorDePintura(p) {
  var op = p.opacity === undefined ? 1 : p.opacity;
  if (op >= 1) return aHex(p.color);
  return (
    "rgba(" + Math.round(p.color.r * 255) + ", " + Math.round(p.color.g * 255) +
    ", " + Math.round(p.color.b * 255) + ", " + Math.round(op * 100) / 100 + ")"
  );
}

function tieneEfectos(nodo) {
  return "effects" in nodo && nodo.effects && nodo.effects.some(function (e) { return e.visible !== false; });
}

// Enum de blend de Figma → globalCompositeOperation de canvas. LINEAR_BURN y
// LINEAR_DODGE no existen en canvas: se aproximan con multiply/screen y aviso.
var MEZCLAS_FIGMA = {
  MULTIPLY: "multiply", SCREEN: "screen", OVERLAY: "overlay",
  DARKEN: "darken", LIGHTEN: "lighten",
  COLOR_DODGE: "color-dodge", COLOR_BURN: "color-burn",
  HARD_LIGHT: "hard-light", SOFT_LIGHT: "soft-light",
  DIFFERENCE: "difference", EXCLUSION: "exclusion",
  HUE: "hue", SATURATION: "saturation", COLOR: "color", LUMINOSITY: "luminosity",
};

function mezclaDe(nodo) {
  var modo = "blendMode" in nodo ? nodo.blendMode : "NORMAL";
  if (modo === "NORMAL" || modo === "PASS_THROUGH") return { mezcla: undefined, aviso: null };
  if (modo === "LINEAR_BURN") return { mezcla: "multiply", aviso: "mezcla LINEAR_BURN se aproximó con multiply" };
  if (modo === "LINEAR_DODGE") return { mezcla: "screen", aviso: "mezcla LINEAR_DODGE se aproximó con screen" };
  var mapa = MEZCLAS_FIGMA[modo];
  if (mapa) return { mezcla: mapa, aviso: null };
  return { mezcla: undefined, aviso: "mezcla " + modo + " sin equivalente — quedó normal" };
}

function conAviso(nodo, extra) {
  if (!extra) return nodo.aviso;
  return nodo.aviso ? nodo.aviso + "; " + extra : extra;
}

function caja(nodo, marco) {
  var b = nodo.absoluteBoundingBox;
  var m = marco.absoluteBoundingBox;
  return {
    x: Math.round((b.x - m.x) * 100) / 100,
    y: Math.round((b.y - m.y) * 100) / 100,
    ancho: Math.round(b.width * 100) / 100,
    alto: Math.round(b.height * 100) / 100,
  };
}

// ¿Este nodo puede viajar como VECTOR REAL (path SVG editable) en vez de
// rasterizarse? Necesita estilos sólidos: a lo sumo UN fill sólido y a lo
// sumo UN borde sólido (gradientes e imágenes siguen al rasterizado). El
// path sale de fillGeometry (la geometría YA COMPUTADA: esquinas redondeadas
// y booleans resueltas) y cae a vectorPaths si no hay. Devuelve null si no
// califica — el caller decide rasterizar.
function vectorSolido(nodo) {
  var fills = nodo.fills;
  if (fills === figma.mixed) return null;
  var fillsVisibles = Array.isArray(fills) ? fills.filter(function (f) { return f.visible !== false; }) : [];
  if (fillsVisibles.length > 1) return null;
  if (fillsVisibles.length === 1 && fillsVisibles[0].type !== "SOLID") return null;

  var strokes = nodo.strokes;
  if (strokes === figma.mixed) return null;
  var bordes = Array.isArray(strokes) ? strokes.filter(function (s) { return s.visible !== false; }) : [];
  if (bordes.length > 1) return null;
  if (bordes.length === 1 && (bordes[0].type !== "SOLID" || typeof nodo.strokeWeight !== "number")) return null;
  if (fillsVisibles.length === 0 && bordes.length === 0) return null;

  var geometria = null;
  if (nodo.fillGeometry && nodo.fillGeometry.length > 0) geometria = nodo.fillGeometry;
  else if (nodo.vectorPaths && nodo.vectorPaths.length > 0) geometria = nodo.vectorPaths;
  if (!geometria) return null;
  var path = geometria.map(function (p) { return p.data; }).join(" ");
  if (!path) return null;

  var aviso = null;
  if (bordes.length === 1 && nodo.strokeAlign && nodo.strokeAlign !== "CENTER") {
    aviso = "borde " + nodo.strokeAlign + " se pintó centrado";
  }
  return {
    vector: {
      path: path,
      reglaRelleno: geometria[0].windingRule === "EVENODD" ? "evenodd" : undefined,
      relleno: fillsVisibles.length === 1 ? colorDePintura(fillsVisibles[0]) : undefined,
      trazoColor: bordes.length === 1 ? colorDePintura(bordes[0]) : undefined,
      trazoGrosor: bordes.length === 1 ? Math.round(nodo.strokeWeight * 100) / 100 : undefined,
      remate: bordes.length === 1 && nodo.strokeCap === "ROUND" ? "redondo" : bordes.length === 1 ? "recto" : undefined,
    },
    aviso: aviso,
  };
}

// Empuja el nodo como capa «vector» a la salida. `avisoExtra` viaja además
// del posible aviso del borde no centrado.
function empujarVector(nodo, marco, salida, datos, avisoExtra) {
  var cv = caja(nodo, marco);
  var mezclaV = mezclaDe(nodo);
  var avisos = [datos.aviso, mezclaV.aviso, avisoExtra].filter(function (a) { return a; }).join("; ");
  salida.push({
    tipo: "vector",
    nombre: nodo.name,
    x: cv.x, y: cv.y, ancho: cv.ancho, alto: cv.alto,
    opacidad: "opacity" in nodo && nodo.opacity < 1 ? nodo.opacity : undefined,
    mezcla: mezclaV.mezcla,
    aviso: avisos || undefined,
    vector: datos.vector,
  });
}

// ¿La transform del nodo ESPEJA? (determinante negativo: flip horizontal o
// vertical). Un flip no es una rotación: no se puede reproducir con la capa.
function tieneFlip(nodo) {
  var m = "relativeTransform" in nodo ? nodo.relativeTransform : null;
  if (!m) return false;
  return m[0][0] * m[1][1] - m[0][1] * m[1][0] < 0;
}

// Exporta el nodo COMO SE VE en el render final (transforms de los
// ancestros INCLUIDAS): clona la pieza a la raíz de la página con su
// transform ABSOLUTA y exporta el clon. exportAsync del original solo
// aplica la transform PROPIA del nodo — una pieza que su grupo espejaba o
// rotaba salía al revés (visto: el logo espejado del grupo con flip).
async function rasterizarComoSeVe(nodo, marco, aviso) {
  var clon = null;
  try {
    clon = nodo.clone();
    figma.currentPage.appendChild(clon);
    clon.relativeTransform = nodo.absoluteTransform;
    return await rasterizar(nodo, marco, aviso, clon);
  } catch (e) {
    return await rasterizar(nodo, marco, aviso);
  } finally {
    if (clon) { try { clon.remove(); } catch (e2) { /* ya no está */ } }
  }
}

// La caja del RENDER (absoluteRenderBounds): incluye el grosor del borde,
// las sombras y el blur — lo que el PNG exportado contiene de verdad. Una
// LINE tiene boundingBox de alto CERO (la geometría) y con esa caja la capa
// rasterizada salía invisible: las rayitas y el «+» del carrito que faltaban.
function cajaRender(nodo, marco) {
  var b = nodo.absoluteRenderBounds || nodo.absoluteBoundingBox;
  var m = marco.absoluteBoundingBox;
  return {
    x: Math.round((b.x - m.x) * 100) / 100,
    y: Math.round((b.y - m.y) * 100) / 100,
    ancho: Math.max(Math.round(b.width * 100) / 100, 1),
    alto: Math.max(Math.round(b.height * 100) / 100, 1),
  };
}

async function rasterizar(nodo, marco, aviso, nodoExport) {
  var bytes = await (nodoExport || nodo).exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
  var c = cajaRender(nodo, marco);
  var mezcla = mezclaDe(nodo);
  var salida = {
    tipo: "imagen",
    nombre: nodo.name,
    x: c.x, y: c.y, ancho: c.ancho, alto: c.alto,
    opacidad: "opacity" in nodo && nodo.opacity < 1 ? nodo.opacity : undefined,
    mezcla: mezcla.mezcla,
    imagen: { dataUri: "data:image/png;base64," + figma.base64Encode(bytes) },
    aviso: aviso,
  };
  salida.aviso = conAviso(salida, mezcla.aviso);
  return salida;
}

function alineacionDe(nodo) {
  if (nodo.textAlignHorizontal === "LEFT") return "izquierda";
  if (nodo.textAlignHorizontal === "RIGHT") return "derecha";
  return "centro";
}

// Texto con estilos MIXTOS (dos fuentes en un título, un color por palabra):
// getStyledTextSegments lo parte en corridas uniformes y gana el estilo con
// más caracteres — el «cuerpo» del texto. Así el texto llega EDITABLE y
// animable por palabras/caracteres, en vez de volverse un sólido rasterizado.
function estiloDominante(nodo) {
  var segmentos;
  try {
    segmentos = nodo.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "letterSpacing", "lineHeight", "fills"]);
  } catch (e) {
    return null;
  }
  if (!segmentos || segmentos.length === 0) return null;
  var conteos = {};
  var mejor = null;
  for (var i = 0; i < segmentos.length; i++) {
    var s = segmentos[i];
    var pintura = pinturaSolida(s.fills);
    if (!pintura) continue;
    var clave = s.fontName.family + "|" + s.fontName.style + "|" + s.fontSize + "|" + s.fontWeight;
    conteos[clave] = (conteos[clave] || 0) + (s.end - s.start);
    if (!mejor || conteos[clave] > mejor.n) mejor = { n: conteos[clave], seg: s, pintura: pintura };
  }
  return mejor ? { seg: mejor.seg, pintura: mejor.pintura, tramos: segmentos.length } : null;
}

// Corridas de estilo DISTINTAS al dominante, con índices sobre los
// caracteres NO BLANCOS del contenido (así el re-wrap del editor, que sólo
// mueve espacios y saltos, no las corre). Cada tramo lleva únicamente los
// campos que difieren del estilo base de la capa.
function tramosDe(nodo, base) {
  var segmentos;
  try {
    segmentos = nodo.getStyledTextSegments(["fontName", "fontSize", "fontWeight", "fills"]);
  } catch (e) {
    return null;
  }
  if (!segmentos) return null;
  var tramos = [];
  var k = 0;
  for (var i = 0; i < segmentos.length; i++) {
    var s = segmentos[i];
    var cuenta = 0;
    for (var j = 0; j < s.characters.length; j++) {
      if (!/\s/.test(s.characters[j])) cuenta++;
    }
    if (cuenta === 0) continue; // sólo blancos: sin estilo propio
    var tramo = {};
    if (s.fontName !== figma.mixed && s.fontName.family !== base.familia) tramo.familia = s.fontName.family;
    if (s.fontWeight !== figma.mixed && s.fontWeight !== base.peso) tramo.peso = s.fontWeight;
    if (s.fontSize !== figma.mixed && Math.abs(s.fontSize - base.tamano) > 0.01) tramo.tamano = s.fontSize;
    var pintura = pinturaSolida(s.fills);
    if (pintura) {
      var color = colorDePintura(pintura);
      if (color !== base.color) tramo.color = color;
    }
    if (Object.keys(tramo).length > 0) {
      tramo.desde = k;
      tramo.hasta = k + cuenta;
      tramos.push(tramo);
    }
    k += cuenta;
  }
  return tramos.length ? tramos : null;
}

// Los cortes de línea REALES del wrap de la caja: la API no los expone como
// texto, pero getRangeBounds (Figma 2023+) da la caja de cada carácter —
// cuando el tope vertical salta, ahí arranca otra línea. Devuelve el
// contenido con los \n insertados (reemplazan los espacios del corte, así
// los índices de caracteres NO BLANCOS de los tramos no se corren), o null
// si la API no está o algo falla — y el editor cae a la estimación de
// siempre. Con cortes reales el editor no re-envuelve nada: fidelidad 1:1.
function contenidoConCortes(nodo) {
  if (typeof nodo.getRangeBounds !== "function") return null;
  var chars = nodo.characters;
  var salida = "";
  var topeLinea = null;
  var trasCorte = false; // los blancos pegados a un corte de wrap se descartan
  try {
    for (var i = 0; i < chars.length; i++) {
      var ch = chars[i];
      if (ch === "\n") {
        salida += ch;
        topeLinea = null;
        trasCorte = false;
        continue;
      }
      var b = nodo.getRangeBounds(i, i + 1);
      if (b && b.height > 0) {
        if (topeLinea === null) topeLinea = b.y;
        else if (b.y - topeLinea > b.height * 0.5) {
          salida = salida.replace(/[ \t]+$/, "");
          salida += "\n";
          topeLinea = b.y;
          trasCorte = true;
        }
      }
      if (trasCorte && (ch === " " || ch === "\t")) continue;
      trasCorte = false;
      salida += ch;
    }
  } catch (e) {
    return null;
  }
  return salida.indexOf("\n") >= 0 ? salida : null;
}

async function nodoAIR(nodo, marco, salida) {
  if (!nodo.visible) return;
  // Umbral PERCEPTIBLE: en Figma quedan micro-rotaciones accidentales de
  // edición (0.02°, invisibles) que antes mandaban grupos y textos enteros
  // al rasterizado — medio grado no se ve, y abre el camino editable.
  var rotado = "rotation" in nodo && Math.abs(nodo.rotation) > 0.5;

  if (nodo.type === "TEXT") {
    var pintura = pinturaSolida(nodo.fills);
    var nombreFuente = nodo.fontName;
    var tamano = nodo.fontSize;
    var peso = nodo.fontWeight;
    var espaciadoCrudo = nodo.letterSpacing;
    var alturaLinea = nodo.lineHeight;
    var avisoMixto = null;
    var esMixto = !pintura || tamano === figma.mixed || nombreFuente === figma.mixed ||
      peso === figma.mixed || espaciadoCrudo === figma.mixed;
    if (!rotado && esMixto) {
      var dominante = estiloDominante(nodo);
      if (dominante) {
        pintura = dominante.pintura;
        nombreFuente = dominante.seg.fontName;
        tamano = dominante.seg.fontSize;
        peso = dominante.seg.fontWeight;
        espaciadoCrudo = dominante.seg.letterSpacing;
        if (alturaLinea === figma.mixed) alturaLinea = dominante.seg.lineHeight;
        avisoMixto = "estilos mixtos (" + dominante.tramos + " tramos): quedó EDITABLE — base «" +
          nombreFuente.family + "» " + peso + " · " + tamano + "px, y los tramos con otra fuente/peso/tamaño/color viajan aparte";
      }
    }
    var simple =
      !rotado && pintura &&
      tamano !== figma.mixed && nombreFuente !== figma.mixed &&
      peso !== figma.mixed && espaciadoCrudo !== figma.mixed;
    if (!simple) {
      salida.push(await rasterizar(nodo, marco, rotado ? "texto rotado: se rasterizó" : "texto con estilos mixtos ilegibles: se rasterizó"));
      return;
    }
    var c = caja(nodo, marco);
    var mezclaTexto = mezclaDe(nodo);
    var espaciado = espaciadoCrudo.unit === "PERCENT"
      ? (tamano * espaciadoCrudo.value) / 100
      : espaciadoCrudo.value;
    var interlineado;
    if (alturaLinea !== figma.mixed && alturaLinea) {
      if (alturaLinea.unit === "PIXELS") interlineado = Math.round(alturaLinea.value * 100) / 100;
      else if (alturaLinea.unit === "PERCENT") interlineado = Math.round(tamano * alturaLinea.value) / 100;
    }

    // textCase es un ESTILO en Figma: los caracteres quedan como se tipearon
    // y el render los transforma. Acá se aplica al contenido, que es lo que
    // el motor pinta tal cual.
    // primero los cortes de línea REALES (getRangeBounds); si no hay API,
    // queda la estimación por geometría de siempre
    var cortesReales = contenidoConCortes(nodo);
    var contenido = cortesReales || nodo.characters;
    var avisoCaso = null;
    var caso = nodo.textCase === figma.mixed ? "MIXED" : (nodo.textCase || "ORIGINAL");
    if (caso === "UPPER") contenido = contenido.toUpperCase();
    else if (caso === "LOWER") contenido = contenido.toLowerCase();
    else if (caso === "TITLE") {
      contenido = contenido.replace(/\S+/g, function (p) {
        return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
      });
    } else if (caso === "MIXED") {
      avisoCaso = "mayúsculas/minúsculas con estilos mixtos: quedó el texto tal como se tipeó";
    } else if (caso.indexOf("SMALL_CAPS") === 0) {
      avisoCaso = "versalitas (small caps) no existen en canvas: quedó el texto tal como se tipeó";
    }

    // El wrap automático de la caja NO deja \n en characters: estimamos las
    // líneas renderizadas por geometría y el editor re-envuelve al importar
    // (acá no hay medición de texto; allá sí).
    var lh = interlineado || tamano * 1.15;
    var rbTexto = nodo.absoluteRenderBounds;
    var lineasEstimadas;
    if (cortesReales) {
      lineasEstimadas = contenido.split("\n").length;
    } else {
      // La TINTA no miente: si la caja es fija y más chica que el texto (un
      // display grande que desborda hacia abajo), el alto de la caja da un
      // conteo corto — el alto de la tinta renderizada cuenta las líneas
      // que Figma realmente pintó. Gana el mayor de los dos.
      var porCaja = Math.max(1, Math.round(nodo.height / lh));
      var porTinta = rbTexto && rbTexto.height > 0 ? Math.max(1, Math.round(rbTexto.height / lh)) : 1;
      lineasEstimadas = Math.max(porCaja, porTinta);
    }
    // diagnóstico visible en la vista previa del import: cuántas líneas se
    // detectaron y por qué método — si el número no coincide con Figma, el
    // problema está acá y no en el editor
    var avisoLineas = lineasEstimadas > 1
      ? lineasEstimadas + " líneas " + (cortesReales
          ? "(cortes reales de Figma)"
          : "(estimadas: caja " + Math.round(nodo.height) + "px, tinta " + (rbTexto ? Math.round(rbTexto.height) : 0) + "px, interlineado " + Math.round(lh) + "px)")
      : null;

    // lineHeight AUTO usa las métricas de la fuente, no un número: cuando la
    // caja abraza el contenido, alto ÷ líneas ES ese interlineado real — y de
    // él depende el anclaje vertical (Figma centra los glifos en la línea).
    // Con cortes reales el conteo es exacto, así que la misma fórmula vale
    // también para cajas fijas que la tinta llena casi por completo.
    var abrazaContenido = nodo.textAutoResize === "HEIGHT" || nodo.textAutoResize === "WIDTH_AND_HEIGHT";
    var tintaLlena = cortesReales && lineasEstimadas > 1 && rbTexto && nodo.height > 0 &&
      rbTexto.height / nodo.height > 0.8;
    if (interlineado === undefined && nodo.height > 0 && (abrazaContenido || tintaLlena)) {
      interlineado = Math.round((nodo.height / lineasEstimadas) * 100) / 100;
    }

    // Rich text: si el nodo tenía estilos mixtos, las corridas que difieren
    // del dominante viajan como tramos (el editor las pinta con su fuente).
    var tramosTexto = avisoMixto
      ? tramosDe(nodo, { familia: nombreFuente.family, peso: peso, tamano: tamano, color: colorDePintura(pintura) })
      : null;

    // La TINTA: dónde quedaron pintados los píxeles del texto en Figma
    // (absoluteRenderBounds). Su tope es el dato duro para el anclaje
    // vertical del editor — sin depender de modelos de métricas.
    var tintaY;
    var rb = nodo.absoluteRenderBounds;
    if (rb && marco.absoluteBoundingBox) {
      tintaY = Math.round((rb.y - marco.absoluteBoundingBox.y) * 100) / 100;
    }

    salida.push({
      tipo: "texto",
      nombre: nodo.name,
      x: c.x, y: c.y, ancho: c.ancho, alto: c.alto,
      opacidad: nodo.opacity < 1 ? nodo.opacity : undefined,
      mezcla: mezclaTexto.mezcla,
      aviso: conAviso({ aviso: conAviso({ aviso: conAviso({ aviso: mezclaTexto.aviso || undefined }, avisoCaso) || undefined }, avisoMixto) || undefined }, avisoLineas) || undefined,
      texto: {
        contenido: contenido,
        familia: nombreFuente.family,
        // el estilo EXACTO de la cara ("Bold", "Condensed Heavy"): AE busca
        // la fuente por familia+estilo, sin adivinar nombres PostScript
        estilo: nombreFuente.style || undefined,
        peso: peso,
        tamano: tamano,
        interletrado: Math.abs(espaciado) > 0.01 ? Math.round(espaciado * 100) / 100 : undefined,
        interlineado: interlineado,
        // se exporta cuando Figma renderizó MÁS líneas que las escritas: la
        // diferencia es wrap de la caja, y puede convivir con Enters de
        // autor (el caso «un Enter tipeado + el wrap parte otra línea»)
        lineasEstimadas: lineasEstimadas > contenido.split("\n").length ? lineasEstimadas : undefined,
        tintaY: tintaY,
        alineacion: alineacionDe(nodo),
        color: colorDePintura(pintura),
        tramos: tramosTexto || undefined,
      },
    });
    return;
  }

  // Vectores y líneas con stroke sólido y SIN fill → capa de trazo animable
  // con trim (el caso «líneas decorativas» de las referencias). Todo lo demás
  // vectorial sigue cayendo al rasterizado de siempre.
  if ((nodo.type === "VECTOR" || nodo.type === "LINE") && !rotado && !tieneEfectos(nodo)) {
    var sinFill = nodo.fills !== figma.mixed && (!nodo.fills || !nodo.fills.some(function (f) { return f.visible !== false; }));
    var borde = nodo.strokes !== figma.mixed && Array.isArray(nodo.strokes)
      ? nodo.strokes.filter(function (s) { return s.visible !== false; })
      : [];
    var pathVector = null;
    if (nodo.type === "LINE") {
      // LineNode no expone vectorPaths: es un segmento horizontal de su ancho
      pathVector = "M 0 0 L " + Math.round(nodo.width * 100) / 100 + " 0";
    } else if (nodo.vectorPaths && nodo.vectorPaths.length > 0) {
      pathVector = nodo.vectorPaths.map(function (p) { return p.data; }).join(" ");
    }
    if (sinFill && borde.length === 1 && borde[0].type === "SOLID" && typeof nodo.strokeWeight === "number" && pathVector) {
      var ct = caja(nodo, marco);
      var mezclaTrazo = mezclaDe(nodo);
      salida.push({
        tipo: "trazo",
        nombre: nodo.name,
        x: ct.x, y: ct.y, ancho: ct.ancho, alto: ct.alto,
        opacidad: nodo.opacity < 1 ? nodo.opacity : undefined,
        mezcla: mezclaTrazo.mezcla,
        aviso: mezclaTrazo.aviso || undefined,
        trazo: {
          path: pathVector,
          color: colorDePintura(borde[0]),
          grosor: Math.round(nodo.strokeWeight * 100) / 100,
          remate: nodo.strokeCap === "ROUND" ? "redondo" : "recto",
        },
      });
      return;
    }
  }

  // Vectores CON estilo sólido (estrella, polígono, path dibujado) → capa
  // «vector» con el path SVG real: se pinta nítido a cualquier escala y el
  // export a AE lo arma como shape EDITABLE. Nada de rasterizar. Lo que no
  // califica (gradiente, imagen, varios fills) sigue al rasterizado.
  if ((nodo.type === "VECTOR" || nodo.type === "STAR" || nodo.type === "POLYGON") && !rotado && !tieneEfectos(nodo)) {
    var datosV = vectorSolido(nodo);
    if (datosV) {
      empujarVector(nodo, marco, salida, datosV, null);
      return;
    }
    salida.push(await rasterizar(nodo, marco, "fill o borde no sólido (gradiente/imagen): se rasterizó a 2×"));
    return;
  }

  if ((nodo.type === "RECTANGLE" || nodo.type === "ELLIPSE") && !rotado && !tieneEfectos(nodo)) {
    var p = pinturaSolida(nodo.fills);
    var sinBorde = nodo.strokes === figma.mixed || !nodo.strokes || nodo.strokes.length === 0;
    if (p && sinBorde) {
      var cc = caja(nodo, marco);
      var mezclaForma = mezclaDe(nodo);
      salida.push({
        tipo: nodo.type === "RECTANGLE" ? "rect" : "elipse",
        nombre: nodo.name,
        x: cc.x, y: cc.y, ancho: cc.ancho, alto: cc.alto,
        opacidad: nodo.opacity < 1 ? nodo.opacity : undefined,
        mezcla: mezclaForma.mezcla,
        aviso: mezclaForma.aviso || undefined,
        forma: {
          color: colorDePintura(p),
          radio: nodo.type === "RECTANGLE" && typeof nodo.cornerRadius === "number" && nodo.cornerRadius > 0
            ? nodo.cornerRadius
            : undefined,
        },
      });
      return;
    }
    // con borde, esquinas mixtas o fill+borde: probar el camino VECTOR antes
    // de rendirse al bitmap — la geometría computada ya trae las esquinas
    var datosRE = vectorSolido(nodo);
    if (datosRE) {
      empujarVector(nodo, marco, salida, datosRE, null);
      return;
    }
    salida.push(await rasterizar(nodo, marco, "fill no sólido: se rasterizó a 2×"));
    return;
  }

  if (nodo.type === "FRAME" || nodo.type === "GROUP" || nodo.type === "COMPONENT" || nodo.type === "INSTANCE") {
    // Un grupo CON EFECTOS igual se abre en sus hijos — tres estrellas
    // dentro de un grupo tienen que llegar como TRES capas animables, no
    // como un solo bitmap — y el efecto del grupo queda avisado.
    // Un grupo ROTADO de verdad no puede abrir texto/formas nativas (los
    // hijos heredarían la rotación y saldrían derechos), pero SÍ puede
    // rasterizar CADA PIEZA por separado en su lugar: fiel al render y
    // animable por partes.
    // un hijo con isMask recorta a sus hermanos: ese render NO se puede
    // reproducir abriendo el grupo por piezas (la "máscara" saldría como
    // una capa opaca — la placa negra del logo). Entero y fiel.
    if ("children" in nodo && nodo.children.some(function (h) { return h.isMask === true; })) {
      salida.push(await rasterizarComoSeVe(nodo, marco,
        "grupo con MÁSCARA adentro: se rasterizó entero (una máscara no se abre por piezas)"));
      return;
    }
    if (rotado && "children" in nodo && nodo.children.length > 1) {
      var desdeRotado = salida.length;
      for (var r = 0; r < nodo.children.length; r++) {
        if (!nodo.children[r].visible) continue;
        salida.push(await rasterizarComoSeVe(nodo.children[r], marco, null));
      }
      for (var sr = desdeRotado; sr < salida.length; sr++) {
        salida[sr].subgrupo = nodo.name;
      }
      if (salida.length > desdeRotado) {
        salida[desdeRotado].aviso = conAviso(salida[desdeRotado],
          "grupo rotado «" + nodo.name + "»: sus piezas se rasterizaron POR SEPARADO (animables)");
      } else {
        salida.push(await rasterizar(nodo, marco, "grupo rotado sin piezas visibles: se rasterizó entero"));
      }
      return;
    }
    if (rotado) {
      salida.push(await rasterizar(nodo, marco, "grupo rotado: se rasterizó entero"));
      return;
    }
    var conEfectos = tieneEfectos(nodo);
    // el fondo sólido del frame entra como rect propio, después sus hijos
    var desdeSubgrupo = salida.length;
    if (nodo.type !== "GROUP") {
      var fondo = pinturaSolida(nodo.fills);
      if (fondo) {
        var cf = caja(nodo, marco);
        salida.push({
          tipo: "rect",
          nombre: nodo.name + " (fondo)",
          x: cf.x, y: cf.y, ancho: cf.ancho, alto: cf.alto,
          forma: {
            color: colorDePintura(fondo),
            radio: typeof nodo.cornerRadius === "number" && nodo.cornerRadius > 0 ? nodo.cornerRadius : undefined,
          },
        });
      }
    }
    for (var i = 0; i < nodo.children.length; i++) {
      await nodoAIR(nodo.children[i], marco, salida);
    }
    // SUBGRUPO: todo lo que este contenedor aportó queda marcado con su
    // nombre — el contenedor MÁS EXTERNO (debajo del frame) pisa a los de
    // adentro, así el logo entero es UN grupo aunque tenga grupos anidados.
    for (var s = desdeSubgrupo; s < salida.length; s++) {
      salida[s].subgrupo = nodo.name;
    }
    if (conEfectos && salida.length > desdeSubgrupo) {
      var primera = salida[desdeSubgrupo];
      primera.aviso = (primera.aviso ? primera.aviso + " | " : "") +
        "los efectos del grupo «" + nodo.name + "» no viajan: se importó por partes para poder animarlas";
    }
    return;
  }

  // Una BOOLEAN con estilo sólido viaja como VECTOR: Figma ya computó la
  // geometría combinada (fillGeometry) — llega nítida y animable como UNA
  // capa. Para animar sus PIEZAS por separado sigue valiendo desagruparla
  // en Figma (⌘⇧G); con gradiente/imagen cae al rasterizado con ese aviso.
  // Un nodo ROTADO con estilo sólido ya no se rasteriza: el path viaja en
  // coordenadas locales y la ROTACIÓN va aparte en la capa (el motor y AE
  // rotan alrededor del centro — el centro del bbox rotado ES el centro
  // del nodo). Con FLIP (espejado) no hay equivalente: sigue al raster.
  if ((nodo.type === "VECTOR" || nodo.type === "STAR" || nodo.type === "POLYGON" ||
       nodo.type === "RECTANGLE" || nodo.type === "ELLIPSE") &&
      rotado && !tieneFlip(nodo) && !tieneEfectos(nodo)) {
    var datosRot = vectorSolido(nodo);
    if (datosRot) {
      var br = nodo.absoluteBoundingBox;
      var mr = marco.absoluteBoundingBox;
      var cxr = br.x + br.width / 2 - mr.x;
      var cyr = br.y + br.height / 2 - mr.y;
      var mezclaR = mezclaDe(nodo);
      var avisosR = [datosRot.aviso, mezclaR.aviso].filter(function (a) { return a; }).join("; ");
      salida.push({
        tipo: "vector",
        nombre: nodo.name,
        x: Math.round((cxr - nodo.width / 2) * 100) / 100,
        y: Math.round((cyr - nodo.height / 2) * 100) / 100,
        ancho: Math.round(nodo.width * 100) / 100,
        alto: Math.round(nodo.height * 100) / 100,
        // Figma rota antihorario positivo; el motor y AE, horario positivo
        rotacion: Math.round(-nodo.rotation * 100) / 100,
        opacidad: "opacity" in nodo && nodo.opacity < 1 ? nodo.opacity : undefined,
        mezcla: mezclaR.mezcla,
        aviso: avisosR || undefined,
        vector: datosRot.vector,
      });
      return;
    }
    salida.push(await rasterizar(nodo, marco, "rotado y con fill o borde no sólido: se rasterizó a 2×"));
    return;
  }

  if (nodo.type === "BOOLEAN_OPERATION" && !rotado && !tieneEfectos(nodo)) {
    var datosB = vectorSolido(nodo);
    if (datosB) {
      empujarVector(nodo, marco, salida, datosB,
        "operación booleana: llegó como UN vector (para animar sus piezas, ⌘⇧G en Figma y re-exportá)");
      return;
    }
  }
  if (nodo.type === "BOOLEAN_OPERATION" && "children" in nodo && nodo.children.length > 1) {
    salida.push(await rasterizar(nodo, marco,
      "es una operacion booleana (" + nodo.children.length + " piezas) con estilo no sólido o rotada: se rasterizó entera — para animar sus piezas convertila en GRUPO en Figma (⌘⇧G) y re-exportá"));
    return;
  }
  // cualquier cosa nueva: rasterizar, nunca romper (degradación por-nodo).
  salida.push(await rasterizar(nodo, marco, "tipo " + nodo.type + ": se rasterizó a 2×"));
}

var CONTENEDORES = ["FRAME", "COMPONENT", "INSTANCE", "SECTION", "GROUP"];

async function marcoAIR(marco) {
  var nodos = [];
  for (var i = 0; i < marco.children.length; i++) {
    await nodoAIR(marco.children[i], marco, nodos);
  }
  var fondoMarco = pinturaSolida(marco.fills);
  var b = marco.absoluteBoundingBox;
  return {
    origen: "figma",
    version: 1,
    plugin: VERSION_PLUGIN,
    frame: {
      nombre: marco.name,
      ancho: marco.width,
      alto: marco.height,
      fondo: fondoMarco ? colorDePintura(fondoMarco) : "#ffffff",
      // posición ABSOLUTA en el canvas de Figma: el editor conserva la
      // disposición relativa cuando entran varias pantallas juntas
      x: b ? Math.round(b.x * 100) / 100 : undefined,
      y: b ? Math.round(b.y * 100) / 100 : undefined,
    },
    nodos: nodos,
  };
}

async function exportarSeleccion() {
  var seleccion = figma.currentPage.selection;
  if (seleccion.length === 0) {
    figma.notify("No hay nada seleccionado: hacé click en el/los frames de pantalla y volvé a correr el plugin");
    figma.closePlugin();
    return;
  }
  for (var s = 0; s < seleccion.length; s++) {
    if (CONTENEDORES.indexOf(seleccion[s].type) < 0) {
      figma.notify(
        "Seleccionaste un " + seleccion[s].type + " («" + seleccion[s].name + "»): subí un nivel (Esc) hasta los frames de pantalla",
      );
      figma.closePlugin();
      return;
    }
  }

  // Varias pantallas seleccionadas → un lote: entran todas al lienzo del
  // editor conservando su disposición relativa. El PRIMER frame que
  // seleccionaste define el tamaño del render.
  var pantallas = [];
  var totalCapas = 0;
  for (var m = 0; m < seleccion.length; m++) {
    var ir = await marcoAIR(seleccion[m]);
    pantallas.push(ir);
    totalCapas += ir.nodos.length;
  }
  var salidaFinal = pantallas.length === 1
    ? pantallas[0]
    : { origen: "figma", version: 1, plugin: VERSION_PLUGIN, pantallas: pantallas };
  var titulo = pantallas.length === 1
    ? "<b>" + pantallas[0].frame.nombre + "</b> — " + totalCapas + " capas listas."
    : "<b>" + pantallas.length + " pantallas</b> — " + totalCapas + " capas listas. La primera que seleccionaste define el tamaño del render.";
  titulo += ' <span style="color:#999">(plugin v' + VERSION_PLUGIN + ")</span>";

  var json = JSON.stringify(salidaFinal);
  var html =
    '<div style="font: 12px -apple-system, sans-serif; padding: 12px; color: #333">' +
    "<p>" + titulo + "</p>" +
    '<p>1. Copiá el JSON · 2. En el editor de motion: <b>Importar de Figma</b> · 3. Pegá.</p>' +
    '<textarea id="j" style="width:100%; height:150px; font: 10px monospace" readonly></textarea><br><br>' +
    '<button id="c" style="padding:8px 16px; cursor:pointer">Copiar JSON</button> <span id="ok"></span>' +
    "<script>" +
    'var j = document.getElementById("j");' +
    "onmessage = function (e) { j.value = e.data.pluginMessage; };" +
    'document.getElementById("c").onclick = function () {' +
    "  j.select(); document.execCommand('copy');" +
    '  document.getElementById("ok").textContent = "copiado ✓";' +
    "};" +
    "</script></div>";
  figma.showUI(html, { width: 440, height: 320 });
  figma.ui.postMessage(json);
}

exportarSeleccion();
