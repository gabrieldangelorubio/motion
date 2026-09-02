/* CLI: aplica un GUION (JSON de pasos con las herramientas del director) a un
   snapshot de composición, sin modelo. Escribe el snapshot dirigido, imprime el
   informe paso a paso y la auditoría de dirección.

     node --import tsx _andamiaje/director-externo/aplicar-guion.ts \
       <snapshot.json> <guion.json> <salida.snapshot.json>

   También sirve solo para LEER: con un único argumento imprime el estado que
   ve el director (describir + estilo) y la auditoría.
     node --import tsx _andamiaje/director-externo/aplicar-guion.ts <snapshot.json>
*/
import { readFileSync, writeFileSync } from "node:fs";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";
import { describir } from "@/lib/motion/herramientas-puro";
import { describirEstilo, estiloDePieza } from "@/lib/motion/estilo-puro";
import { auditarDireccion } from "@/lib/motion/auditoria-puro";
import { aplicarGuion, validarGuion } from "@/lib/motion/guion-puro";

const [snapshotPath, guionPath, salidaPath] = process.argv.slice(2);
if (!snapshotPath) {
  console.error("uso: aplicar-guion.ts <snapshot.json> [<guion.json> <salida.snapshot.json>]");
  process.exit(2);
}
const comp = deserializar(readFileSync(snapshotPath, "utf8"));

if (!guionPath) {
  console.log(describir(comp));
  console.log();
  console.log(describirEstilo(estiloDePieza(comp)));
  console.log();
  const h = auditarDireccion(comp);
  console.log(h.length ? `AUDITORÍA:\n- ${h.join("\n- ")}` : "AUDITORÍA: sin hallazgos");
  process.exit(0);
}

const pasos = validarGuion(JSON.parse(readFileSync(guionPath, "utf8")));
if (typeof pasos === "string") {
  console.error(`guion inválido: ${pasos}`);
  process.exit(1);
}
const { comp: dirigida, informe, errores } = aplicarGuion(comp, pasos);
console.log(informe.join("\n"));
console.log(`\n${pasos.length} pasos · ${errores} error(es)`);
const h = auditarDireccion(dirigida);
console.log(h.length ? `\nAUDITORÍA:\n- ${h.join("\n- ")}` : "\nAUDITORÍA: sin hallazgos");
writeFileSync(salidaPath ?? snapshotPath.replace(/\.json$/, ".dirigido.json"), serializar(dirigida));
process.exit(errores > 0 ? 3 : 0);
