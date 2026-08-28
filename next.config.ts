import type { NextConfig } from "next";

const config: NextConfig = {
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
