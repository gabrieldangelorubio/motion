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

async function rasterizar(nodo, marco, aviso) {
  var bytes = await nodo.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
  var c = caja(nodo, marco);
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

async function nodoAIR(nodo, marco, salida) {
  if (!nodo.visible) return;
  var rotado = "rotation" in nodo && Math.abs(nodo.rotation) > 0.01;

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
        avisoMixto = "estilos mixtos (" + dominante.tramos + " tramos): quedó EDITABLE con el estilo dominante — «" +
          nombreFuente.family + "» " + peso + " · " + tamano + "px; los tramos con otra fuente/color pierden su dibujo";
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
    var contenido = nodo.characters;
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
    var lineasEstimadas = Math.max(1, Math.round(nodo.height / lh));

    // lineHeight AUTO usa las métricas de la fuente, no un número: cuando la
    // caja abraza el contenido, alto ÷ líneas ES ese interlineado real — y de
    // él depende el anclaje vertical (Figma centra los glifos en la línea).
    var abrazaContenido = nodo.textAutoResize === "HEIGHT" || nodo.textAutoResize === "WIDTH_AND_HEIGHT";
    if (interlineado === undefined && abrazaContenido && nodo.height > 0) {
      interlineado = Math.round((nodo.height / lineasEstimadas) * 100) / 100;
    }

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
      aviso: conAviso({ aviso: conAviso({ aviso: mezclaTexto.aviso || undefined }, avisoCaso) || undefined }, avisoMixto) || undefined,
      texto: {
        contenido: contenido,
        familia: nombreFuente.family,
        peso: peso,
        tamano: tamano,
        interletrado: Math.abs(espaciado) > 0.01 ? Math.round(espaciado * 100) / 100 : undefined,
        interlineado: interlineado,
        lineasEstimadas: lineasEstimadas > 1 && contenido.indexOf("\n") < 0 ? lineasEstimadas : undefined,
        tintaY: tintaY,
        alineacion: alineacionDe(nodo),
        color: colorDePintura(pintura),
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
    salida.push(await rasterizar(nodo, marco, "fill no sólido o con borde: se rasterizó a 2×"));
    return;
  }

  if (nodo.type === "FRAME" || nodo.type === "GROUP" || nodo.type === "COMPONENT" || nodo.type === "INSTANCE") {
    if (rotado || tieneEfectos(nodo) || ("clipsContent" in nodo && nodo.clipsContent === false && nodo.type !== "GROUP" && false)) {
      salida.push(await rasterizar(nodo, marco, rotado ? "grupo rotado: se rasterizó entero" : "grupo con efectos: se rasterizó entero"));
      return;
    }
    // el fondo sólido del frame entra como rect propio, después sus hijos
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
    return;
  }

  // VECTOR, BOOLEAN_OPERATION, STAR, LINE, POLYGON, o cualquier cosa nueva:
  // rasterizar, nunca romper (mismo espíritu que el default que degrada).
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
    : { origen: "figma", version: 1, pantallas: pantallas };
  var titulo = pantallas.length === 1
    ? "<b>" + pantallas[0].frame.nombre + "</b> — " + totalCapas + " capas listas."
    : "<b>" + pantallas.length + " pantallas</b> — " + totalCapas + " capas listas. La primera que seleccionaste define el tamaño del render.";

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
