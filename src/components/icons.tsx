/* -----------------------------------------------------------------------------
   ANDAMIAJE — stub del registro de íconos de diosa (kit §6, anexo B)

   Los conceptos que usa el módulo (play, pausa, frame a frame, ojo, candado,
   basura) YA existen en el registro real: este archivo es un doble local con
   el mismo `base()` para que el repo aparte corra solo. En la integración se
   borra y los imports apuntan a src/components/icons.tsx de diosa. Ningún
   componente del módulo dibuja SVG inline: todo pasa por <Icono>.
----------------------------------------------------------------------------- */

import type { SVGProps } from "react";

type IconoProps = SVGProps<SVGSVGElement>;

function base(props: IconoProps) {
  return {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

const ICONOS = {
  play: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
    </svg>
  ),
  pausa: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth={2.2} />
    </svg>
  ),
  cuadroAtras: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M18 6l-7 6 7 6zM7 6v12" />
    </svg>
  ),
  cuadroAdelante: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M6 6l7 6-7 6zM17 6v12" />
    </svg>
  ),
  ojo: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  ojoTachado: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M4 4l16 16M9.9 5.9A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.1 3.9M6 7.5A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1 0 2-.2 2.9-.5" />
    </svg>
  ),
  candado: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  ),
  descargar: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M12 4v10m0 0l-4-4m4 4l4-4M5 19h14" />
    </svg>
  ),
  chevronAbajo: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  encuadrar: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    </svg>
  ),
} as const;

export type NombreIcono = keyof typeof ICONOS;

export function Icono({ nombre, ...props }: { nombre: NombreIcono } & IconoProps) {
  const Dibujo = ICONOS[nombre];
  return Dibujo ? <Dibujo {...props} /> : null;
}
