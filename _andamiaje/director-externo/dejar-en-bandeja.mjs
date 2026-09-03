/* -----------------------------------------------------------------------------
   Dejar un JSON del plugin en la BANDEJA del módulo (sin copy/paste)

   Uso: node _andamiaje/director-externo/dejar-en-bandeja.mjs <export.json>
        [--url http://localhost:3000] [--origen use_figma|cli|plugin] [--nombre …]

   El editor lo lista en «Importar de Figma → Bandeja de entrada» y lo trae
   con un clic. Es el último tramo del import por MCP: use_figma corre el
   exportador, el agente fusiona estructura + rasters (fusionar-rasters.mjs)
   y lo deja acá.
----------------------------------------------------------------------------- */
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
if (!archivo) {
  console.error("uso: dejar-en-bandeja.mjs <export.json> [--url http://localhost:3000] [--origen cli] [--nombre …]");
  process.exit(2);
}
const opcion = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const url = opcion("url", "http://localhost:3000").replace(/\/$/, "");
const origen = opcion("origen", "cli");
const nombre = opcion("nombre", undefined);

const json = readFileSync(archivo, "utf8");
let datos;
try {
  datos = JSON.parse(json);
} catch (e) {
  console.error(`${basename(archivo)} no es JSON válido: ${e.message}`);
  process.exit(1);
}
const pendientes = Array.isArray(datos.nodos) ? datos.nodos.filter((n) => n.imagen && n.imagen.pendiente).length : 0;
if (pendientes > 0) {
  console.error(`${basename(archivo)} tiene ${pendientes} raster(s) pendientes: fusioná primero con fusionar-rasters.mjs`);
  process.exit(1);
}
const respuesta = await fetch(`${url}/api/motion/bandeja`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ origen, nombre, json }),
});
const cuerpo = await respuesta.json().catch(() => ({}));
if (!respuesta.ok || !cuerpo.ok) {
  console.error(`la bandeja rechazó el JSON (${respuesta.status}): ${cuerpo.error ?? "sin detalle"}`);
  process.exit(1);
}
console.log(`en la bandeja: «${cuerpo.entrada.nombre}» (${(json.length / 1e6).toFixed(1)} MB, id ${cuerpo.entrada.id}) → abrí «Importar de Figma» en el editor`);
