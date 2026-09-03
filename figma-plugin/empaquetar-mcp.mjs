/* -----------------------------------------------------------------------------
   Empaquetar el exportador para correrlo por `use_figma` (Figma MCP)

   Gabriel (2026-09-03): «¿por qué no usamos el MCP directamente para no
   estar trayendo un JSON todo el tiempo?». `use_figma` ejecuta código de la
   Plugin API dentro del archivo, así que puede correr ESTE exportador y
   devolver el JSON sin copy/paste, con la misma fidelidad (getRangeBounds,
   recortes, sombras). Restricciones del tool: 50 000 caracteres de código,
   sin figma.ui/notify/closePlugin, el resultado sale por `return`.

   Uso: node figma-plugin/empaquetar-mcp.mjs <nodeId> [--sin-rasters] > salida.js
   El script resultante se pega en el parámetro `code` de use_figma.
----------------------------------------------------------------------------- */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [nodeId, ...flags] = process.argv.slice(2);
if (!nodeId) {
  console.error("uso: empaquetar-mcp.mjs <nodeId p.ej. 39:20515> [--sin-rasters] | --rasters <id,id,…>");
  process.exit(2);
}
// FASE 2: un script chico (no el exportador) que devuelve los PNG 2× de una
// lista de nodos como { figmaId: base64 }. Se pide por lotes: la respuesta
// de use_figma tiene tope, el exportador entero no entra en cada llamada.
if (nodeId === "--rasters") {
  const ids = (flags[0] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) {
    console.error("--rasters necesita ids separados por coma");
    process.exit(2);
  }
  process.stdout.write(`const ids = ${JSON.stringify(ids)};
const salida = {};
for (const id of ids) {
  try {
    const n = await figma.getNodeByIdAsync(id);
    if (!n) { salida[id] = null; continue; }
    const bytes = await n.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: 2 } });
    salida[id] = figma.base64Encode(bytes);
  } catch (e) {
    salida[id] = null; // un nodo que falla no tira el lote: queda pendiente
  }
}
return salida;
`);
  process.exit(0);
}
const sinRasters = flags.includes("--sin-rasters");
const fuente = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "code.js"), "utf8");

// sin comentarios de bloque ni líneas de comentario (el código usa // solo
// al inicio de línea; ninguna cadena contiene «/*»)
let cuerpo = fuente.replace(/\/\*[\s\S]*?\*\//g, "");
// también los comentarios de FIN de línea, solo cuando el «//» no está
// dentro de una cadena (cuenta de comillas pares antes del //)
const sinComentarioFinal = (l) => {
  let i = l.indexOf("//");
  while (i >= 0) {
    const antes = l.slice(0, i);
    const dobles = (antes.match(/"/g) || []).length;
    const simples = (antes.match(/'/g) || []).length;
    if (dobles % 2 === 0 && simples % 2 === 0) return antes.replace(/\s+$/, "");
    i = l.indexOf("//", i + 2);
  }
  return l;
};
cuerpo = cuerpo
  .split("\n")
  .map((l) => sinComentarioFinal(l.replace(/^\s*\/\/.*$/, "")))
  .filter((l) => l.trim() !== "")
  .join("\n");
// la UI del plugin (exportarSeleccion + showUI) no corre en use_figma
const corte = cuerpo.indexOf("async function exportarSeleccion");
if (corte < 0) throw new Error("no encontré exportarSeleccion");
cuerpo = cuerpo.slice(0, corte);
if (/figma\.(ui|showUI|notify|closePlugin)/.test(cuerpo)) throw new Error("quedó UI en el cuerpo");

// fase «sin rasters»: la estructura sola (los bytes se piden aparte)
if (sinRasters) {
  cuerpo = cuerpo.replace(
    'imagen: { dataUri: "data:image/png;base64," + figma.base64Encode(bytes) },',
    'imagen: { pendiente: true, figmaId: nodo.id },',
  );
  cuerpo = cuerpo.replace(/await ([^\n]*?)\.exportAsync\(/g, "await __exportar($1, ");
  cuerpo =
    // los PNG se saltean (vuelven vacíos); el SVG de los textos sigue saliendo (cortes de línea)
    "var __SIN_RASTERS = true;\nasync function __exportar(n, o) { return o && o.format === \"PNG\" ? new Uint8Array(0) : n.exportAsync(o); }\n" + cuerpo;
}

const entrada = `
var __nodo = await figma.getNodeByIdAsync(${JSON.stringify(nodeId)});
if (!__nodo) return { error: "no existe el nodo ${nodeId}" };
if (CONTENEDORES.indexOf(__nodo.type) < 0) return { error: "el nodo es " + __nodo.type + ", no un frame de pantalla" };
var __pagina = __nodo.parent;
while (__pagina && __pagina.type !== "PAGE") __pagina = __pagina.parent;
if (__pagina && figma.currentPage.id !== __pagina.id) await figma.setCurrentPageAsync(__pagina);
var __ir = await marcoAIR(__nodo);
return __ir;
`;
const salida = cuerpo + entrada;
if (salida.length > 50000) {
  console.error(`el código mide ${salida.length} caracteres: use_figma acepta 50 000`);
  process.exit(1);
}
process.stdout.write(salida);
