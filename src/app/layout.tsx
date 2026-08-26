/* -----------------------------------------------------------------------------
   ANDAMIAJE — layout raíz del repo aparte

   En diosa el shell (sidebar, sesión, tema, idioma) ya existe; acá sólo hace
   falta el esqueleto html/body y el script de tema sin flash (la clase
   `light` en <html>, igual que allá). No viaja en la integración.
----------------------------------------------------------------------------- */

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "motion · módulo externo de diosa",
};

const scriptTema = `try{if(localStorage.getItem("tema")==="claro")document.documentElement.classList.add("light")}catch(e){}`;

export default function LayoutRaiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
        {children}
      </body>
    </html>
  );
}
