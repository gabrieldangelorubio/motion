/* -----------------------------------------------------------------------------
   Fusionar la ESTRUCTURA (fase 1 de use_figma, --sin-rasters) con los
   RASTERS (fase 2, lotes de {figmaId: base64}) en un export completo

   Uso: node fusionar-rasters.mjs <estructura.json> <salida.json> <rasters-1.json> [rasters-2.json …]

   Cada raster pendiente lleva imagen.figmaId; cada lote es un objeto
   { "39:20524": "<base64 PNG>", … } tal como lo devuelve el script de
   `empaquetar-mcp.mjs --rasters`. Lo que quede pendiente se lista al final
   (y el archivo no se acepta en la bandeja hasta completarlo).
----------------------------------------------------------------------------- */
import { readFileSync, writeFileSync } from "node:fs";

const [estructuraPath, salidaPath, ...lotes] = process.argv.slice(2);
if (!estructuraPath || !salidaPath) {
  console.error("uso: fusionar-rasters.mjs <estructura.json> <salida.json> <rasters-1.json> [más lotes…]");
  process.exit(2);
}
const datos = JSON.parse(readFileSync(estructuraPath, "utf8"));
const rasters = {};
for (const lote of lotes) Object.assign(rasters, JSON.parse(readFileSync(lote, "utf8")));

const pantallas = Array.isArray(datos.pantallas) ? datos.pantallas : [datos];
let fusionados = 0;
const pendientes = [];
for (const pantalla of pantallas) {
  for (const nodo of pantalla.nodos ?? []) {
    if (!nodo.imagen || !nodo.imagen.pendiente) continue;
    const b64 = rasters[nodo.imagen.figmaId];
    if (typeof b64 === "string" && b64.length > 0) {
      nodo.imagen = { dataUri: "data:image/png;base64," + b64 };
      fusionados++;
    } else {
      pendientes.push(`${nodo.nombre} (${nodo.imagen.figmaId})`);
    }
  }
}
writeFileSync(salidaPath, JSON.stringify(datos));
console.log(`${fusionados} raster(s) fusionados → ${salidaPath}`);
if (pendientes.length) {
  console.log(`quedan ${pendientes.length} pendientes:\n  ${pendientes.join("\n  ")}`);
  process.exit(1);
}
