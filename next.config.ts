import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// La VERSIÓN visible en el editor (esquina inferior izquierda): el SHA corto
// del commit, para saber de un vistazo QUÉ build está corriendo — «¿estoy en
// la versión correcta?» se responde mirando el chip, no adivinando. Se
// calcula al levantar dev o al hacer build (reiniciar el dev server tras un
// checkout); sin git (el cp -R de la integración) queda vacío y el chip no
// se muestra.
let rev = "";
try {
  rev = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .trim();
} catch {
  /* sin repo: sin chip */
}

const config: NextConfig = {
  env: {
    NEXT_PUBLIC_MOTION_REV: rev,
  },
  experimental: {
    serverActions: {
      // El autosave manda el SNAPSHOT completo de la composición por server
      // action, y con las capas rasterizadas de Figma (PNG 2× en base64)
      // una escena real pisa fácil el 1MB default («Body exceeded 1 MB
      // limit» y el guardado al server se caía en silencio).
      bodySizeLimit: "50mb",
    },
  },
  // la raíz explícita: sin esto Turbopack sale a buscar lockfiles hacia
  // arriba y puede elegir uno ajeno (p.ej. un package-lock perdido en ~)
  turbopack: {
    root: process.cwd(),
  },
};

export default config;
