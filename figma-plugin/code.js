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
var VERSION_PLUGIN = 18;

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

// v18: SOMBRAS. Una sombra exterior (DROP_SHADOW) ya no manda la pieza al
// raster ni se pierde al abrir un grupo: viaja en la capa como `sombra` y
// el motor la pinta (canvas shadow; AE, Drop Shadow). Con varias gana la de
// más radio. Las sombras interiores y los blurs siguen al raster.
function sombraDe(nodo) {
  if (!("effects" in nodo) || !nodo.effects) return null;
  var mejor = null;
  for (var i = 0; i < nodo.effects.length; i++) {
    var e = nodo.effects[i];
    if (e.visible === false || e.type !== "DROP_SHADOW") continue;
    if (!mejor || (e.radius || 0) > (mejor.radius || 0)) mejor = e;
  }
  if (!mejor) return null;
  var c = mejor.color || { r: 0, g: 0, b: 0, a: 0.25 };
  return {
    x: Math.round((mejor.offset ? mejor.offset.x : 0) * 100) / 100,
    y: Math.round((mejor.offset ? mejor.offset.y : 0) * 100) / 100,
    desenfoque: Math.round((mejor.radius || 0) * 100) / 100,
    color: "rgba(" + Math.round(c.r * 255) + ", " + Math.round(c.g * 255) + ", " + Math.round(c.b * 255) + ", " + Math.round((c.a === undefined ? 1 : c.a) * 100) / 100 + ")",
    difusion: mejor.spread ? Math.round(mejor.spread * 100) / 100 : undefined,
  };
}

// Varias sombras exteriores: viaja una sola (la de más radio) y se avisa.
function avisoSombras(nodo) {
  if (!("effects" in nodo) || !nodo.effects) return null;
  var n = nodo.effects.filter(function (e) { return e.visible !== false && e.type === "DROP_SHADOW"; }).length;
  return n > 1 ? "tiene " + n + " sombras: viajó la más amplia" : null;
}

// ¿Todos los efectos visibles son sombras exteriores? Entonces la pieza
// puede viajar nativa con su sombra.
function soloSombras(nodo) {
  if (!tieneEfectos(nodo)) return false;
  return nodo.effects.every(function (e) { return e.visible === false || e.type === "DROP_SHADOW"; });
}

// Efectos «de LOOK»: blur, ruido, textura, glass — cambian cómo se ve la
// pieza de una manera que abrir el grupo por partes no reproduce (el
// destello de un logo: líneas finas + blur del grupo). Las sombras NO
// entran acá: son decorativas y las piezas siguen animables sin ellas.
function tieneEfectosDeLook(nodo) {
  return "effects" in nodo && nodo.effects && nodo.effects.some(function (e) {
    return e.visible !== false && e.type !== "DROP_SHADOW" && e.type !== "INNER_SHADOW";
  });
}

// Un grupo con modo de fusión PROPIO (screen, plus lighter…) compone sus
// piezas ENTRE SÍ y después contra el fondo: por partes cada una se
// fusionaría sola — otro look. Entero, la mezcla viaja con el raster.
function tieneMezclaPropia(nodo) {
  var modo = "blendMode" in nodo ? nodo.blendMode : "NORMAL";
  return modo !== "NORMAL" && modo !== "PASS_THROUGH";
}

// Opacidad de grupo: por piezas cada hija se fundiría SOLA con el fondo —
// dos piezas superpuestas al 40% no dan lo mismo que el grupo al 40%.
function tieneOpacidadPropia(nodo) {
  return "opacity" in nodo && typeof nodo.opacity === "number" && nodo.opacity < 0.999;
}

// Para el aviso: QUÉ tiene el grupo, exacto — así el diagnóstico de un look
// que no viajó se lee en el import, sin adivinar.
function detalleDeLook(nodo) {
  var partes = [];
  if ("effects" in nodo && nodo.effects) {
    nodo.effects.forEach(function (e) {
      if (e.visible === false) return;
      partes.push(e.type + (typeof e.radius === "number" ? " " + Math.round(e.radius) + "px" : ""));
    });
  }
  if (tieneMezclaPropia(nodo)) partes.push("mezcla " + nodo.blendMode);
  if (tieneOpacidadPropia(nodo)) partes.push("opacidad " + Math.round(nodo.opacity * 100) + "%");
  return partes.join(", ");
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

// v17: esquinas DISTINTAS (cornerRadius «mixed»): las cuatro en orden
// canvas (sup izq, sup der, inf der, inf izq) y la mayor como radio único.
// Las mitades de cápsula y el círculo del logo de Figma llegaban cuadrados.
function esquinasDe(nodo) {
  if (typeof nodo.cornerRadius === "number") return nodo.cornerRadius > 0 ? { radio: nodo.cornerRadius } : {};
  if (nodo.cornerRadius !== figma.mixed) return {};
  var r = [nodo.topLeftRadius || 0, nodo.topRightRadius || 0, nodo.bottomRightRadius || 0, nodo.bottomLeftRadius || 0]
    .map(function (v) { return Math.round(v * 100) / 100; });
  var mayor = Math.max.apply(null, r);
  return mayor > 0 ? { radio: mayor, radios: r } : {};
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
function empujarVector(nodo, marco, salida, datos, avisoExtra, sombra) {
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
    sombra: sombra || undefined,
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
// v16: EN SU LUGAR. El export del ORIGINAL respeta lo que lo rodea: el
// recorte de sus padres (clipsContent) y las máscaras hermanas; el clon en
// la raíz de la página no tenía nada de eso, y en diagram.com las piezas
// con opacidad o blur llegaban ENTERAS desbordando su tarjeta (Gabriel:
// «siento que tiene unas máscaras que no está tomando»). Para que los
// píxeles salgan PUROS (opacidad y mezcla viajan en la capa, no horneadas)
// se neutralizan en el original SOLO durante el export y se restauran
// siempre. Si el nodo no se deja tocar (instancia trabada), cae al clon.
async function rasterizarComoSeVe(nodo, marco, aviso) {
  var opacidad = null;
  var mezcla = null;
  try {
    if ("opacity" in nodo && typeof nodo.opacity === "number" && nodo.opacity < 1) { opacidad = nodo.opacity; nodo.opacity = 1; }
    if ("blendMode" in nodo && nodo.blendMode !== "NORMAL" && nodo.blendMode !== "PASS_THROUGH") { mezcla = nodo.blendMode; nodo.blendMode = "NORMAL"; }
  } catch (e0) {
    restaurarLook(nodo, opacidad, mezcla);
    return await rasterizarPorClon(nodo, marco, aviso);
  }
  var bytes;
  try {
    bytes = await nodo.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
  } finally {
    restaurarLook(nodo, opacidad, mezcla);
  }
  return salidaRaster(nodo, marco, aviso, bytes, cajaRender(nodo, marco));
}

function restaurarLook(nodo, opacidad, mezcla) {
  try { if (opacidad !== null) nodo.opacity = opacidad; } catch (e1) { /* no editable */ }
  try { if (mezcla !== null) nodo.blendMode = mezcla; } catch (e2) { /* no editable */ }
}

// El clon en la raíz de la página (v14): píxeles puros pero SIN el recorte
// de los padres ni las máscaras hermanas. Solo como fallback.
async function rasterizarPorClon(nodo, marco, aviso) {
  var clon = null;
  try {
    clon = nodo.clone();
    figma.currentPage.appendChild(clon);
    clon.relativeTransform = nodo.absoluteTransform;
    try { if ("opacity" in clon) clon.opacity = 1; } catch (e1) { /* no editable */ }
    try { if ("blendMode" in clon) clon.blendMode = "NORMAL"; } catch (e2) { /* no editable */ }
    return await rasterizar(nodo, marco, aviso, clon);
  } catch (e) {
    return await rasterizar(nodo, marco, aviso, null, true);
  } finally {
    if (clon) { try { clon.remove(); } catch (e2) { /* ya no está */ } }
  }
}

// Los nombres de los padres hasta el marco: para encontrar en Figma la capa
// que llegó mal sin adivinar («Frame 95245 / Card / Group 12»).
function rutaDe(nodo, marco) {
  if (nodo.id === marco.id) return undefined;
  var partes = [];
  var p = nodo.parent;
  for (var i = 0; p && p.id !== marco.id && i < 12; i++) {
    partes.unshift(p.name);
    p = p.parent;
  }
  return partes.join(" / ") || undefined;
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

// v14: exportAsync del ORIGINAL hornea su opacidad y su mezcla en los
// píxeles, y la capa las lleva OTRA vez (opacidad/mezcla abajo): una hoja
// al 50 % llegaba al 25 %. Toda hoja con look propio pasa por el clon con
// píxeles puros; `sinClon` es solo el fallback de rasterizarComoSeVe.
async function rasterizar(nodo, marco, aviso, nodoExport, sinClon) {
  if (!nodoExport && !sinClon && (tieneOpacidadPropia(nodo) || tieneMezclaPropia(nodo))) {
    return await rasterizarComoSeVe(nodo, marco, aviso);
  }
  var bytes = await (nodoExport || nodo).exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
  // v15: la caja sale del nodo que SE EXPORTA. El clon en la raíz de la
  // página no tiene los recortes de sus padres (clipsContent) ni sus máscaras:
  // sus píxeles pueden ser más grandes que la caja del original, y en el
  // editor eso se veía como la pieza AGRANDADA y recortada (las «Section» de
  // diagram.com). Si las dos cajas difieren, el aviso lo dice.
  var c = cajaRender(nodoExport || nodo, marco);
  if (nodoExport) {
    var co = cajaRender(nodo, marco);
    if (Math.abs(co.ancho - c.ancho) > 2 || Math.abs(co.alto - c.alto) > 2) {
      aviso = conAviso({ aviso: aviso }, "sus píxeles miden " + Math.round(c.ancho) + "×" + Math.round(c.alto) +
        " pero en su lugar del diseño se ve " + Math.round(co.ancho) + "×" + Math.round(co.alto) +
        " (un padre lo recorta): se importó completo");
    }
  }
  return salidaRaster(nodo, marco, aviso, bytes, c);
}

function salidaRaster(nodo, marco, aviso, bytes, c) {
  var mezcla = mezclaDe(nodo);
  var salida = {
    tipo: "imagen",
    nombre: nodo.name,
    x: c.x, y: c.y, ancho: c.ancho, alto: c.alto,
    opacidad: "opacity" in nodo && nodo.opacity < 1 ? nodo.opacity : undefined,
    mezcla: mezcla.mezcla,
    imagen: { dataUri: "data:image/png;base64," + figma.base64Encode(bytes) },
    aviso: aviso,
    ruta: rutaDe(nodo, marco),
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
// v18: devuelve también las LÍNEAS REALES que Figma pintó (tope distinto =
// línea nueva), haya wrap o no. logbook.so: los títulos tienen sombra, y
// la caja de render (absoluteRenderBounds) crece con ella — «It all began
// with a "full"» (1 línea) medía 106 px y se estimaba en 2, el editor
// forzaba el salto y se pisaba con el texto de abajo. Con la API de rangos
// no hay que estimar nada.
function contenidoConCortes(nodo) {
  if (typeof nodo.getRangeBounds !== "function") return { contenido: null, lineas: null };
  var chars = nodo.characters;
  var salida = "";
  var topeLinea = null;
  var lineas = 0;
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
        if (topeLinea === null) {
          topeLinea = b.y;
          lineas++;
        } else if (b.y - topeLinea > b.height * 0.5) {
          salida = salida.replace(/[ \t]+$/, "");
          salida += "\n";
          topeLinea = b.y;
          lineas++;
          trasCorte = true;
        }
      }
      if (trasCorte && (ch === " " || ch === "\t")) continue;
      trasCorte = false;
      salida += ch;
    }
  } catch (e) {
    return { contenido: null, lineas: null };
  }
  return { contenido: salida.indexOf("\n") >= 0 ? salida : null, lineas: lineas > 0 ? lineas : null };
}

// v17: RECORTE DEL PADRE. Un frame con «clip content» recorta a sus hijos;
// abrirlo por piezas perdía eso: los cuadrados del logo de Figma de
// diagram.com empezaban 34 px fuera de su tarjeta, y nueve «Section» de
// fondo seguían enteras por debajo de la página. Ahora la caja del recorte
// (intersección de todos los padres que recortan, en px del frame) baja
// por la recursión: lo que queda ENTERO afuera no se importa (aviso
// suelto), lo que sobresale viaja con `recorte` y el motor lo recorta.
var AVISOS_SUELTOS = [];

// v18: DIAGNÓSTICO. Una línea por nodo visitado —también los ocultos— con
// cuántas capas dejó en el JSON. Gabriel (logbook.so): «no importó varias
// imágenes, checkeá todo lo que tendría que haber puesto y lo que no
// pudo»: con esto el JSON mismo cuenta qué vio el plugin y qué decidió.
var DIAGNOSTICO = [];

function interseccion(a, b) {
  if (!a) return b;
  if (!b) return a;
  var x1 = Math.max(a.x, b.x);
  var y1 = Math.max(a.y, b.y);
  var x2 = Math.min(a.x + a.ancho, b.x + b.ancho);
  var y2 = Math.min(a.y + a.alto, b.y + b.alto);
  return { x: x1, y: y1, ancho: Math.max(0, x2 - x1), alto: Math.max(0, y2 - y1) };
}

// separados de verdad (una LINE de alto 0 dentro del recorte NO está afuera)
function fueraDe(c, r) {
  return c.x + c.ancho < r.x || c.x > r.x + r.ancho || c.y + c.alto < r.y || c.y > r.y + r.alto;
}

// la caja que se PINTA: una capa rotada (vector/trazo con rotacion aparte)
// lleva su caja sin rotar, y girada ocupa más — el AABB de la rotación
function cajaPintada(n) {
  if (!n.rotacion) return n;
  var a = (n.rotacion * Math.PI) / 180;
  var w = Math.abs(n.ancho * Math.cos(a)) + Math.abs(n.alto * Math.sin(a));
  var h = Math.abs(n.ancho * Math.sin(a)) + Math.abs(n.alto * Math.cos(a));
  return { x: n.x + n.ancho / 2 - w / 2, y: n.y + n.alto / 2 - h / 2, ancho: w, alto: h };
}

function dentroDe(n, r) {
  var c = cajaPintada(n);
  return c.x >= r.x - 0.5 && c.y >= r.y - 0.5 && c.x + c.ancho <= r.x + r.ancho + 0.5 && c.y + c.alto <= r.y + r.alto + 0.5;
}

async function nodoAIR(nodo, marco, salida, recorte) {
  var etiqueta = "«" + nodo.name + "» " + nodo.type +
    ("opacity" in nodo && typeof nodo.opacity === "number" && nodo.opacity < 1 ? " op " + Math.round(nodo.opacity * 100) + "%" : "") +
    ("children" in nodo && nodo.children ? " (" + nodo.children.length + " hijos)" : "");
  if (!nodo.visible) {
    DIAGNOSTICO.push("oculto en Figma: " + etiqueta);
    return;
  }
  if (recorte && nodo.absoluteBoundingBox && fueraDe(caja(nodo, marco), recorte)) {
    AVISOS_SUELTOS.push("«" + nodo.name + "» queda ENTERO fuera del recorte de su padre (clip content): no se importó");
    DIAGNOSTICO.push("fuera del recorte: " + etiqueta);
    return;
  }
  var desde = salida.length;
  await nodoAIRInterno(nodo, marco, salida, recorte);
  var nuevas = salida.length - desde;
  DIAGNOSTICO.push((nuevas === 0 ? "SIN capas: " : nuevas + " capa(s): ") + etiqueta +
    (nuevas === 1 ? " → " + salida[desde].tipo : ""));
  if (!recorte) return;
  for (var k = desde; k < salida.length; k++) {
    // el recorte más cercano (el de adentro) ya quedó puesto por la
    // recursión; acá solo se marca lo que sobresale y no lo tenía
    if (!salida[k].recorte && !dentroDe(salida[k], recorte)) {
      salida[k].recorte = {
        x: Math.round(recorte.x * 100) / 100, y: Math.round(recorte.y * 100) / 100,
        ancho: Math.round(recorte.ancho * 100) / 100, alto: Math.round(recorte.alto * 100) / 100,
      };
    }
  }
}

async function nodoAIRInterno(nodo, marco, salida, recorte) {
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
    var rangos = contenidoConCortes(nodo);
    var cortesReales = rangos.contenido;
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
    // con sombra o blur la caja de render crece: no sirve para contar
    // líneas ni para el tope de tinta
    var conEfectosTexto = tieneEfectos(nodo);
    var lineasEstimadas;
    if (rangos.lineas) {
      // una línea vacía (Enter tipeado sin texto) no tiene glifos que medir:
      // las reales nunca son menos que los Enter + 1
      lineasEstimadas = Math.max(rangos.lineas, contenido.split("\n").length);
    } else if (cortesReales) {
      lineasEstimadas = contenido.split("\n").length;
    } else {
      // La TINTA no miente (sin efectos): si la caja es fija y más chica que
      // el texto (un display grande que desborda hacia abajo), el alto de la
      // caja da un conteo corto — el alto de la tinta renderizada cuenta las
      // líneas que Figma realmente pintó. Gana el mayor de los dos.
      var porCaja = Math.max(1, Math.round(nodo.height / lh));
      var porTinta = !conEfectosTexto && rbTexto && rbTexto.height > 0 ? Math.max(1, Math.round(rbTexto.height / lh)) : 1;
      lineasEstimadas = Math.max(porCaja, porTinta);
    }
    // diagnóstico visible en la vista previa del import: cuántas líneas se
    // detectaron y por qué método — si el número no coincide con Figma, el
    // problema está acá y no en el editor
    var avisoLineas = lineasEstimadas > 1
      ? lineasEstimadas + " líneas " + (rangos.lineas || cortesReales
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
    if (rb && marco.absoluteBoundingBox && !conEfectosTexto) {
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

  // TODO LO SOLO-BORDE es un TRAZO dibujable con trim: vectores, líneas,
  // rects/elipses contorno, estrellas, polígonos y booleans — ROTADOS
  // incluidos (el path viaja sin rotar y la rotación va aparte, como los
  // vectores rotados de la v8). Antes solo VECTOR/LINE derechos entraban
  // acá y los contornos caían a capa vector: «trazar» los rechazaba y el
  // director no podía dibujarlos (visto en la ronda de Gabriel). Con FLIP
  // no hay equivalente: sigue el camino de siempre.
  if ((nodo.type === "VECTOR" || nodo.type === "LINE" || nodo.type === "RECTANGLE" ||
       nodo.type === "ELLIPSE" || nodo.type === "STAR" || nodo.type === "POLYGON" ||
       nodo.type === "BOOLEAN_OPERATION") && !tieneFlip(nodo) && !tieneEfectos(nodo)) {
    var sinFill = nodo.fills !== figma.mixed && (!nodo.fills || !nodo.fills.some(function (f) { return f.visible !== false; }));
    var borde = nodo.strokes !== figma.mixed && Array.isArray(nodo.strokes)
      ? nodo.strokes.filter(function (s) { return s.visible !== false; })
      : [];
    var pathVector = null;
    if (nodo.type === "LINE") {
      // LineNode no expone vectorPaths: es un segmento horizontal de su ancho
      pathVector = "M 0 0 L " + Math.round(nodo.width * 100) / 100 + " 0";
    } else if (nodo.fillGeometry && nodo.fillGeometry.length > 0) {
      // el CONTORNO computado (esquinas redondeadas, booleans resueltas):
      // para un rect/elipse sin fill es la línea central del borde
      pathVector = nodo.fillGeometry.map(function (p) { return p.data; }).join(" ");
    } else if (nodo.vectorPaths && nodo.vectorPaths.length > 0) {
      pathVector = nodo.vectorPaths.map(function (p) { return p.data; }).join(" ");
    }
    if (sinFill && borde.length === 1 && borde[0].type === "SOLID" && typeof nodo.strokeWeight === "number" && pathVector) {
      var mezclaTrazo = mezclaDe(nodo);
      var ct;
      if (rotado) {
        // caja SIN rotar centrada en el centro del bbox rotado (misma
        // cuenta que los vectores rotados); Figma rota antihorario positivo
        var bt = nodo.absoluteBoundingBox;
        var mt = marco.absoluteBoundingBox;
        ct = {
          x: Math.round((bt.x + bt.width / 2 - mt.x - nodo.width / 2) * 100) / 100,
          y: Math.round((bt.y + bt.height / 2 - mt.y - nodo.height / 2) * 100) / 100,
          ancho: Math.round(nodo.width * 100) / 100,
          alto: Math.round(nodo.height * 100) / 100,
        };
      } else {
        ct = caja(nodo, marco);
      }
      salida.push({
        tipo: "trazo",
        nombre: nodo.name,
        x: ct.x, y: ct.y, ancho: ct.ancho, alto: ct.alto,
        rotacion: rotado ? Math.round(-nodo.rotation * 100) / 100 : undefined,
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
  if ((nodo.type === "VECTOR" || nodo.type === "STAR" || nodo.type === "POLYGON") && !rotado && (!tieneEfectos(nodo) || soloSombras(nodo))) {
    var datosV = vectorSolido(nodo);
    if (datosV) {
      empujarVector(nodo, marco, salida, datosV, null, sombraDe(nodo));
      return;
    }
    salida.push(await rasterizar(nodo, marco, "fill o borde no sólido (gradiente/imagen): se rasterizó a 2×"));
    return;
  }

  if ((nodo.type === "RECTANGLE" || nodo.type === "ELLIPSE") && !rotado && (!tieneEfectos(nodo) || soloSombras(nodo))) {
    var p = pinturaSolida(nodo.fills);
    var sinBorde = nodo.strokes === figma.mixed || !nodo.strokes || nodo.strokes.length === 0;
    var sombraRE = sombraDe(nodo);
    if (p && sinBorde) {
      var cc = caja(nodo, marco);
      var mezclaForma = mezclaDe(nodo);
      salida.push({
        tipo: nodo.type === "RECTANGLE" ? "rect" : "elipse",
        nombre: nodo.name,
        x: cc.x, y: cc.y, ancho: cc.ancho, alto: cc.alto,
        opacidad: nodo.opacity < 1 ? nodo.opacity : undefined,
        mezcla: mezclaForma.mezcla,
        aviso: conAviso({ aviso: mezclaForma.aviso || undefined }, avisoSombras(nodo)) || undefined,
        forma: Object.assign({ color: colorDePintura(p) }, nodo.type === "RECTANGLE" ? esquinasDe(nodo) : {}),
        sombra: sombraRE || undefined,
      });
      return;
    }
    // con borde, esquinas mixtas o fill+borde: probar el camino VECTOR antes
    // de rendirse al bitmap — la geometría computada ya trae las esquinas
    var datosRE = vectorSolido(nodo);
    if (datosRE) {
      empujarVector(nodo, marco, salida, datosRE, null, sombraRE);
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
    // v12: un contenedor con efectos de LOOK (blur, ruido, textura, glass) o
    // con mezcla propia se rasteriza ENTERO como se ve. v14: este chequeo va
    // ANTES de los de rotación — un grupo rotado con look propio caía en el
    // camino «rotado» y exportaba el ORIGINAL (opacidad horneada en el PNG y
    // otra vez en la capa: doble fade) o sus piezas sueltas (look del grupo
    // perdido). Ahora rasterizarComoSeVe lo cubre igual, rotado o no.
    // Abrirlo por piezas perdía justamente lo que lo hace verse así (visto:
    // el destello del logo de lemlist, líneas finas + blur del grupo, llegaba
    // como rayitas crudas). Para animar sus partes: desagrupar y re-exportar.
    if (tieneEfectosDeLook(nodo) || tieneMezclaPropia(nodo) || tieneOpacidadPropia(nodo)) {
      salida.push(await rasterizarComoSeVe(nodo, marco,
        "grupo «" + nodo.name + "» con look propio (" + detalleDeLook(nodo) +
        "): se rasterizó ENTERO para conservarlo — desagrupalo en Figma si querés animar sus partes"));
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
    // el fondo sólido del frame entra como rect propio, después sus hijos;
    // la SOMBRA del frame va en ese fondo (es lo que Figma sombrea: la
    // silueta del frame) — con fondo transparente no hay silueta y se avisa
    var desdeSubgrupo = salida.length;
    var sombraFrame = null;
    if (nodo.type !== "GROUP") {
      var fondo = pinturaSolida(nodo.fills);
      if (fondo) {
        var cf = caja(nodo, marco);
        var opFondo = fondo.opacity === undefined ? 1 : fondo.opacity;
        sombraFrame = opFondo > 0.01 ? sombraDe(nodo) : null;
        salida.push({
          tipo: "rect",
          nombre: nodo.name + " (fondo)",
          x: cf.x, y: cf.y, ancho: cf.ancho, alto: cf.alto,
          forma: Object.assign({ color: colorDePintura(fondo) }, esquinasDe(nodo)),
          sombra: sombraFrame || undefined,
          aviso: (sombraFrame && avisoSombras(nodo)) || undefined,
        });
      }
    }
    // un frame con «clip content» recorta a sus hijos (los grupos no recortan)
    var recorteHijos = nodo.type !== "GROUP" && nodo.clipsContent === true ? interseccion(recorte, caja(nodo, marco)) : recorte;
    for (var i = 0; i < nodo.children.length; i++) {
      await nodoAIR(nodo.children[i], marco, salida, recorteHijos);
    }
    // SUBGRUPO: todo lo que este contenedor aportó queda marcado con su
    // nombre — el contenedor MÁS EXTERNO (debajo del frame) pisa a los de
    // adentro, así el logo entero es UN grupo aunque tenga grupos anidados.
    for (var s = desdeSubgrupo; s < salida.length; s++) {
      salida[s].subgrupo = nodo.name;
    }
    // la sombra viajó en el fondo → nada que avisar; sin fondo (o con
    // otros efectos) sigue el aviso de siempre
    if (conEfectos && salida.length > desdeSubgrupo && !(sombraFrame && soloSombras(nodo))) {
      var primera = salida[desdeSubgrupo];
      primera.aviso = (primera.aviso ? primera.aviso + " | " : "") +
        (sombraFrame ? "los efectos del grupo «" : "las sombras del grupo «") + nodo.name + "» no viajan: se importó por partes para poder animarlas";
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
  AVISOS_SUELTOS = [];
  DIAGNOSTICO = [];
  var recorteMarco = marco.clipsContent === true ? { x: 0, y: 0, ancho: marco.width, alto: marco.height } : null;
  for (var i = 0; i < marco.children.length; i++) {
    await nodoAIR(marco.children[i], marco, nodos, recorteMarco);
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
    avisos: AVISOS_SUELTOS.slice(),
    diagnostico: DIAGNOSTICO.slice(),
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
    '<button id="c" style="padding:8px 16px; cursor:pointer">Copiar JSON</button> ' +
    '<button id="d" style="padding:8px 16px; cursor:pointer">Descargar JSON</button> <span id="ok"></span>' +
    "<script>" +
    'var j = document.getElementById("j");' +
    "onmessage = function (e) { j.value = e.data.pluginMessage; };" +
    'document.getElementById("c").onclick = function () {' +
    "  j.select(); document.execCommand('copy');" +
    '  document.getElementById("ok").textContent = "copiado ✓";' +
    "};" +
    // el archivo tal cual (JSON puro, no RTF): para mandarlo al director
    // externo sin pasar por el portapapeles ni por TextEdit
    'document.getElementById("d").onclick = function () {' +
    "  var nombre = 'pantalla';" +
    "  try { nombre = (JSON.parse(j.value).frame.nombre || nombre).replace(/[^a-z0-9._-]+/gi, '-'); } catch (e) {}" +
    "  var a = document.createElement('a');" +
    "  a.href = URL.createObjectURL(new Blob([j.value], { type: 'application/json' }));" +
    "  a.download = nombre + '.json'; document.body.appendChild(a); a.click(); document.body.removeChild(a);" +
    '  document.getElementById("ok").textContent = "descargado ✓";' +
    "};" +
    "</script></div>";
  figma.showUI(html, { width: 440, height: 320 });
  figma.ui.postMessage(json);
}

exportarSeleccion();
