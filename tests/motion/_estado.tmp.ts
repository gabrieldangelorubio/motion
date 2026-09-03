import { readFileSync, writeFileSync } from "node:fs";
import { deserializar } from "@/lib/motion/serializar-puro";
import { describir } from "@/lib/motion/herramientas-puro";
const S = "/tmp/claude-0/-home-user-motion/52841da2-cb99-5f42-87d4-f87a601f54ae/scratchpad/logbook";
const comp = deserializar(readFileSync(`${S}/trabajo20/comp.json`, "utf8"));
writeFileSync(`${S}/trabajo20/estado.txt`, describir(comp));
console.log("capas", comp.capas.length, "lienzo", comp.ancho, comp.alto, "duracion", comp.duracion);
