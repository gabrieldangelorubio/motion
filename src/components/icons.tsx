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
  // aplicar un efecto como ENTRADA: la flecha llega a la barra (el in)
  efectoIn: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M3 12h10M9 7.5l4.5 4.5L9 16.5" />
      <path d="M19.5 5v14" strokeWidth={2.2} />
    </svg>
  ),
  // aplicar como SALIDA: la flecha sale de la barra (el out)
  efectoOut: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M4.5 5v14" strokeWidth={2.2} />
      <path d="M9 12h10M14.5 7.5L19 12l-4.5 4.5" />
    </svg>
  ),
  // aplicar AMBAS: la flecha atraviesa la barra — entra y sale
  efectoAmbos: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M12 4.5v15" strokeWidth={2.2} />
      <path d="M1.5 12H8M5.5 9l3 3-3 3" />
      <path d="M15 12h6.5M18.5 9l3 3-3 3" />
    </svg>
  ),
  // división del texto al aplicar un efecto: por LETRAS (celdas sueltas)
  divisionLetras: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M4 8h3.6v8H4zM10.2 8h3.6v8h-3.6zM16.4 8H20v8h-3.6z" fill="currentColor" stroke="none" />
    </svg>
  ),
  // por PALABRAS (dos bloques)
  divisionPalabras: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M3 10h8.5v4H3zM14 10h7v4h-7z" fill="currentColor" stroke="none" />
    </svg>
  ),
  // por LÍNEAS (renglones)
  divisionLineas: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M4 7.5h16M4 12h16M4 16.5h12" />
    </svg>
  ),
  loop: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M4.5 12a7.5 7.5 0 0 1 12.9-5.2l2.1 2" />
      <path d="M19.5 4.2V9h-4.8" />
      <path d="M19.5 12a7.5 7.5 0 0 1-12.9 5.2l-2.1-2" />
      <path d="M4.5 19.8V15h4.8" />
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
  tipografia: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M5 19L11 5h2l6 14M7.5 14h9" />
    </svg>
  ),
  ia: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M12 3l1.8 4.8L18.5 9l-4.7 1.7L12 15l-1.8-4.3L5.5 9l4.7-1.2zM18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" />
    </svg>
  ),
  enviar: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M21 3L10 14M21 3l-7 18-3-8-8-3z" />
    </svg>
  ),
  subir: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M12 15V5m0 0L8 9m4-4l4 4M5 19h14" />
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
  biblioteca: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <rect x="3.5" y="3.5" width="7.2" height="7.2" rx="1.5" />
      <rect x="13.3" y="3.5" width="7.2" height="7.2" rx="1.5" />
      <rect x="3.5" y="13.3" width="7.2" height="7.2" rx="1.5" />
      <rect x="13.3" y="13.3" width="7.2" height="7.2" rx="1.5" />
    </svg>
  ),
  cerrar: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  basura: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M4.5 7h15M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7M7 7l.9 12.3h8.2L17 7M10 10.5v5.5M14 10.5v5.5" />
    </svg>
  ),
  centrarH: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M12 3v3.5M12 17.5V21M12 9.5v5" strokeDasharray="2 2.4" />
      <rect x="6.5" y="8" width="11" height="8" rx="1.5" />
    </svg>
  ),
  centrarV: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <path d="M3 12h3.5M17.5 12H21M9.5 12h5" strokeDasharray="2 2.4" />
      <rect x="8" y="6.5" width="8" height="11" rx="1.5" />
    </svg>
  ),
  camara: (p: IconoProps) => (
    <svg {...base(p)} aria-hidden>
      <rect x="3" y="7" width="13" height="10" rx="2" />
      <path d="M16 10.5l5-2.5v8l-5-2.5" />
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
