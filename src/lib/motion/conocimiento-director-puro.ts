/* -----------------------------------------------------------------------------
   CONOCIMIENTO DEL DIRECTOR — las lecciones que se van guardando

   Gabriel (2026-09-03): «que el conocimiento que vamos guardando quede
   para todos los agentes al momento de guionar». Un solo lugar, con fecha
   y pieza, que entra en el SISTEMA del director (modo iterativo y modo
   guion, los tres proveedores: Claude, Gemini, OpenRouter). Las referencias
   largas con pasos viven en GUION_REFERENCIA (solo modo guion); acá va lo
   que se aprendió, corto y con su porqué, para que cualquier modelo razone
   igual sobre una pantalla nueva.

   Cómo se agrega una lección: una entrada más en LECCIONES con la pieza
   que la enseñó. Nada más que tocar: el bloque se arma solo.
----------------------------------------------------------------------------- */

export type Leccion = {
  /** cuándo se aprendió */
  cuando: string;
  /** la pieza real que la enseñó */
  pieza: string;
  /** la lección, en imperativo, con el porqué */
  leccion: string;
};

export const LECCIONES: Leccion[] = [
  {
    cuando: "2026-09-02",
    pieza: "lemlist (landing 1440 en render 1920)",
    leccion:
      "El centro de la cámara es el centro de la PANTALLA (x 720 para una pantalla de 1440 que empieza en 0), nunca el del render (960). Antes de fijar un encuadre, calculá lo visible (ancho/zoom × alto/zoom alrededor del centro) y verificá que todo lo que entra en esa escena cae adentro: el logo del hero quedó cortado por no hacerlo.",
  },
  {
    cuando: "2026-09-02",
    pieza: "lemlist (barras «without AI / with AI»)",
    leccion: "Una barra de uso o de progreso CARGA de izquierda a derecha: preset cargar (recortado a su caja), nunca un fade ni un slide.",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook (manifesto, editado por Gemini)",
    leccion:
      "Un raster (capa media) no es texto: no se divide en palabras ni se le cambia la tipografía. Se anima ENTERO con el preset más cercano y se le dice al usuario que lo exporte como texto desde Figma. JAMÁS se quita una capa del diseño para recrearla: se pierde el diseño.",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook (Fable vs Kimi; el usuario prefirió la versión que «navega»)",
    leccion:
      "LA CÁMARA NUNCA ESTÁ MUERTA: en cada escena, hold con push-in lento (+3 a +6 % de zoom, entradaSalidaSine), viaje de ~1 s a la siguiente con entradaSalidaCubic, y flotar suave encima. Un hold con zoom constante se lee como «estático, una cosa detrás de otra».",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook (tres ENCUADRE CORTA en la versión de Kimi)",
    leccion:
      "El zoom de cada escena sale de la CAJA DEL CONTENIDO (tope del título → borde inferior del elemento más bajo, chips y tarjetas laterales incluidos): zoom = min(ancho_render/ancho_pantalla, alto_render/(alto_contenido × 1.05)), centro y = medio de esa caja. Con 840 px de contenido en 1080 el zoom baja a 1.20 aunque la página pida 1.33.",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook",
    leccion:
      "Los elementos entran MIENTRAS la cámara llega: el título arranca 200–400 ms antes de que el viaje termine y lo demás encadena con solapes de 150–400 ms. Esperar a que la cámara se asiente para empezar es lo que se siente lento.",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook",
    leccion:
      "Duraciones por rol: protagonistas 900–1100 ms con salidaExpo o salidaQuint (una tarjeta SUBE y asienta con subirDesenfocado, un título raster llega con acercarDesenfocado); secundarios 500–700 ms cubic (avatares con pop back.out(1.5), chips con subir); micro 250–450 ms sine (bordes, fondos). Un pop de 450 ms en una tarjeta grande la hace liviana; un fade en una tarjeta es pereza.",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook",
    leccion:
      "Cada entrada tiene DIRECCIÓN y cuenta algo: notificaciones que entran alternando de lado con un asentamiento de escala 0.96 → 1; tarjetas laterales desde SU lado con ±4° que se corrigen; barras que CARGAN en cascada (130–160 ms) y su borde 600 ms después; una pila que entra en remolino y sigue meciéndose; barras caídas que CAEN una tras otra.",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook (Kimi olvidó las dos tarjetas laterales del plan)",
    leccion: "Ninguna capa del diseño se queda sin entrada. Antes de cerrar, recorré el estado capa por capa: tarjetas laterales, chips, bordes, avatares.",
  },
  {
    cuando: "2026-09-03",
    pieza: "logbook (cuatro pasos fallidos de Fable, una ronda perdida de Kimi)",
    leccion:
      "Los nombres de presets y herramientas son EXACTOS y son los del catálogo del estado: «elevarDesenfocado» no existe (es subirDesenfocado), «definar_camara» no existe (es definir_camara). Un nombre inventado es un paso perdido.",
  },
];

/** El bloque que entra en el SISTEMA del director, para todos los modelos y
    los dos modos. Corto: una línea por lección, con la pieza que la enseñó. */
export function bloqueDeLecciones(lecciones: Leccion[] = LECCIONES): string {
  const lineas = lecciones.map((l) => `- [${l.pieza}] ${l.leccion}`);
  return `# LECCIONES APRENDIDAS (de piezas reales dirigidas y revisadas con el usuario; valen para dirigir y para guionar, y se cumplen)\n${lineas.join("\n")}`;
}
