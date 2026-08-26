/* -----------------------------------------------------------------------------
   ANDAMIAJE — composición demo para el repo aparte

   En diosa la page carga la composición desde la base (motion_composicion,
   patrón §2.4 del kit). Hasta que ese cable exista, la page abre esta demo,
   que ejercita texto dividido, escalonados, pistas crudas con hold, resortes
   y motion blur — la misma que valida el fixture de tests.
----------------------------------------------------------------------------- */

import type { Composicion } from "@/lib/motion/modelo";

export const COMPOSICION_DEMO: Composicion = {
  version: 1,
  rev: 0,
  nombre: "demo del módulo",
  ancho: 1920,
  alto: 1080,
  fps: 30,
  duracion: 5000,
  fondo: "#0c0c11",
  capas: [
    {
      id: "placa",
      nombre: "Placa",
      tipo: "forma",
      forma: "rectangulo",
      ancho: 640,
      alto: 360,
      radio: 16,
      color: "#33333c",
      x: 480,
      y: 420,
      rotacion: -4,
      entrada: { preset: "escalar", en: 200, duracion: 700, easing: "resorteTenso" },
      pistas: {
        x: [
          { t: 1200, v: 480, easing: "entradaSalidaCubic" },
          { t: 3000, v: 1360 },
          { t: 3500, v: 1360, hold: true },
          { t: 4300, v: 1560 },
        ],
        opacidad: [
          { t: 4300, v: 1 },
          { t: 4800, v: 0 },
        ],
      },
    },
    {
      id: "titulo",
      nombre: "Título",
      tipo: "texto",
      texto: "MOTION",
      fuente: { familia: "-apple-system, 'Segoe UI', Roboto, sans-serif", tamano: 220, peso: 900, interletrado: -4 },
      color: "#e8e8ee",
      division: "caracteres",
      x: 960,
      y: 600,
      motionBlur: 0.8,
      entrada: {
        preset: "subir",
        en: 600,
        duracion: 950,
        easing: "salidaExpo",
        escalonado: 45,
        ordenEscalonado: "centro",
        params: { distancia: 140 },
      },
      salida: { preset: "elevarDesenfocado", en: 4000, duracion: 700, easing: "entradaExpo", escalonado: 25 },
    },
    {
      id: "bajada",
      nombre: "Bajada",
      tipo: "texto",
      texto: "el motor puro\npintando en canvas",
      fuente: { familia: "-apple-system, 'Segoe UI', Roboto, sans-serif", tamano: 34, peso: 400, interlineado: 44 },
      color: "#84848c",
      division: "lineas",
      x: 960,
      y: 740,
      entrada: { preset: "revelar", en: 1500, duracion: 700, easing: "salidaQuart", escalonado: 120 },
      salida: { preset: "ocultar", en: 4100, duracion: 500, easing: "entradaCubic", escalonado: 80 },
    },
    {
      id: "subrayado",
      nombre: "Subrayado",
      tipo: "trazo",
      path: "M 0 3 L 560 3",
      ancho: 560,
      alto: 6,
      color: "#0005ff",
      grosor: 6,
      largo: 560,
      remate: "redondo",
      x: 960,
      y: 830,
      entrada: { preset: "trazar", en: 1900, duracion: 700, easing: "salidaExpo" },
      salida: { preset: "borrar", en: 4100, duracion: 500, easing: "entradaCubic" },
    },
  ],
};
