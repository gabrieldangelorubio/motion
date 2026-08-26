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
  return {
    tipo: "imagen",
    nombre: nodo.name,
    x: c.x, y: c.y, ancho: c.ancho, alto: c.alto,
    opacidad: "opacity" in nodo && nodo.opacity < 1 ? nodo.opacity : undefined,
    imagen: { dataUri: "data:image/png;base64," + figma.base64Encode(bytes) },
    aviso: aviso,
  };
}

function alineacionDe(nodo) {
  if (nodo.textAlignHorizontal === "LEFT") return "izquierda";
  if (nodo.textAlignHorizontal === "RIGHT") return "derecha";
  return "centro";
}

async function nodoAIR(nodo, marco, salida) {
  if (!nodo.visible) return;
  var rotado = "rotation" in nodo && Math.abs(nodo.rotation) > 0.01;

  if (nodo.type === "TEXT") {
    var pintura = pinturaSolida(nodo.fills);
    var simple =
      !rotado && pintura &&
      nodo.fontSize !== figma.mixed && nodo.fontName !== figma.mixed &&
      nodo.fontWeight !== figma.mixed && nodo.letterSpacing !== figma.mixed;
    if (!simple) {
      salida.push(await rasterizar(nodo, marco, rotado ? "texto rotado: se rasterizó" : "texto con estilos mixtos: se rasterizó"));
      return;
    }
    var c = caja(nodo, marco);
    var espaciado = nodo.letterSpacing.unit === "PERCENT"
      ? (nodo.fontSize * nodo.letterSpacing.value) / 100
      : nodo.letterSpacing.value;
    salida.push({
      tipo: "texto",
      nombre: nodo.name,
      x: c.x, y: c.y, ancho: c.ancho, alto: c.alto,
      opacidad: nodo.opacity < 1 ? nodo.opacity : undefined,
      texto: {
        contenido: nodo.characters,
        familia: nodo.fontName.family,
        peso: nodo.fontWeight,
        tamano: nodo.fontSize,
        interletrado: Math.abs(espaciado) > 0.01 ? Math.round(espaciado * 100) / 100 : undefined,
        alineacion: alineacionDe(nodo),
        color: colorDePintura(pintura),
      },
    });
    return;
  }

  if ((nodo.type === "RECTANGLE" || nodo.type === "ELLIPSE") && !rotado && !tieneEfectos(nodo)) {
    var p = pinturaSolida(nodo.fills);
    var sinBorde = nodo.strokes === figma.mixed || !nodo.strokes || nodo.strokes.length === 0;
    if (p && sinBorde) {
      var cc = caja(nodo, marco);
      salida.push({
        tipo: nodo.type === "RECTANGLE" ? "rect" : "elipse",
        nombre: nodo.name,
        x: cc.x, y: cc.y, ancho: cc.ancho, alto: cc.alto,
        opacidad: nodo.opacity < 1 ? nodo.opacity : undefined,
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

async function exportarSeleccion() {
  var seleccion = figma.currentPage.selection;
  if (seleccion.length !== 1 || (seleccion[0].type !== "FRAME" && seleccion[0].type !== "COMPONENT")) {
    figma.notify("Seleccioná UN frame (la pantalla) y volvé a correr el plugin");
    figma.closePlugin();
    return;
  }
  var marco = seleccion[0];
  var nodos = [];
  for (var i = 0; i < marco.children.length; i++) {
    await nodoAIR(marco.children[i], marco, nodos);
  }
  var fondoMarco = pinturaSolida(marco.fills);
  var ir = {
    origen: "figma",
    version: 1,
    frame: {
      nombre: marco.name,
      ancho: marco.width,
      alto: marco.height,
      fondo: fondoMarco ? colorDePintura(fondoMarco) : "#ffffff",
    },
    nodos: nodos,
  };
  var json = JSON.stringify(ir);
  var html =
    '<div style="font: 12px -apple-system, sans-serif; padding: 12px; color: #333">' +
    "<p><b>" + marco.name + "</b> — " + nodos.length + " capas listas.</p>" +
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
