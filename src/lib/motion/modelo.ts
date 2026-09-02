/* -----------------------------------------------------------------------------
   Modelo de una composición de motion graphics

   El JSON que se guarda en `contenido` (jsonb) ES este modelo serializado.
   Nada acá importa React ni DOM: el modelo tiene que poder evaluarse en un
   test de node y en un worker de render por igual. La regla fundacional del
   módulo: cada frame es una función pura de (composición, t) — por eso las
   propiedades animadas son keyframes declarativos, nunca estado acumulado.
----------------------------------------------------------------------------- */

/** Nombres de easing del sistema. Parte del contrato del JSON: sólo se agregan.
    El catálogo cubre la escuela GSAP completa: las familias por intensidad
    (sine < quad < cubic < quart < quint < expo), circ, back, elastic
    («elastico»), bounce («pique») y steps («escalones»). */
export type NombreEasing =
  | "lineal"
  | "suave"
  | "seco"
  | "salidaSine"
  | "salidaQuad"
  | "salidaCubic"
  | "salidaQuart"
  | "salidaQuint"
  | "salidaExpo"
  | "salidaCirc"
  | "salidaBack"
  | "salidaElastico"
  | "salidaPique"
  | "entradaSine"
  | "entradaQuad"
  | "entradaCubic"
  | "entradaQuart"
  | "entradaQuint"
  | "entradaExpo"
  | "entradaCirc"
  | "entradaBack"
  | "entradaElastico"
  | "entradaPique"
  | "entradaSalidaSine"
  | "entradaSalidaQuad"
  | "entradaSalidaCubic"
  | "entradaSalidaQuart"
  | "entradaSalidaQuint"
  | "entradaSalidaExpo"
  | "entradaSalidaCirc"
  | "entradaSalidaBack"
  | "escalones"
  | "resorteSuave"
  | "resorteTenso"
  | "resorteRebote";

/** Un easing del sistema: nombre de la casa, o CUALQUIER spec de GSAP
    («back.out(3)», «elastic.out(1.2,0.4)», «steps(8)», un path SVG de
    CustomEase) — fork GSAP. El `(string & {})` conserva el autocompletado
    de los nombres de la casa sin cerrar la puerta al resto. */
export type EasingSpec = NombreEasing | (string & {});

export type Keyframe = {
  /** milisegundos desde el inicio de la composición */
  t: number;
  v: number;
  /** easing del TRAMO que sale de este keyframe (hacia el siguiente) */
  easing?: EasingSpec;
  /** hold: el valor se mantiene hasta el próximo keyframe, sin interpolar */
  hold?: boolean;
};

/** Propiedades animables de una capa. Sólo las que pintar() sabe aplicar. */
export type NombrePropiedad =
  | "x"
  | "y"
  | "escala"
  | "rotacion"
  | "opacidad"
  | "desenfoque"
  /** trim del trazo (capas tipo trazo), 0–1 como en AE */
  | "trazoInicio"
  | "trazoFin"
  /** CONTADOR (capas de texto): el valor interpolado y redondeado reemplaza
      la primera cifra del contenido — «STOCK:171» con pista 171→0 baja en
      vivo. En AE exporta como Slider + expression en el sourceText. */
  | "numero";

export type Pistas = Partial<Record<NombrePropiedad, Keyframe[]>>;

/** Orden en que los sub-elementos de un texto entran en el escalonado.
    Los `from` de GSAP: start/end/center/edges/random → inicio/fin/centro/
    bordes/azar (azar es un barajado DETERMINISTA: mismo texto, mismo orden). */
export type OrdenEscalonado = "inicio" | "fin" | "centro" | "bordes" | "azar";

export type Segmento = {
  preset: string;
  /** inicio del segmento, ms */
  en: number;
  duracion: number;
  easing?: EasingSpec;
  /** ms entre unidades (caracteres/palabras) si la capa se divide */
  escalonado?: number;
  ordenEscalonado?: OrdenEscalonado;
  /** parámetros propios del preset (distancia, desenfoque…) */
  params?: Record<string, number>;
};

/** Modos de mezcla que canvas 2D soporta nativo (mismo set que Figma salvo linear-burn/dodge). */
export type MezclaCapa =
  | "multiply" | "screen" | "overlay" | "darken" | "lighten"
  | "color-dodge" | "color-burn" | "hard-light" | "soft-light"
  | "difference" | "exclusion" | "hue" | "saturation" | "color" | "luminosity";

export const MEZCLAS: MezclaCapa[] = [
  "multiply", "screen", "overlay", "darken", "lighten",
  "color-dodge", "color-burn", "hard-light", "soft-light",
  "difference", "exclusion", "hue", "saturation", "color", "luminosity",
];

export type CapaBase = {
  id: string;
  nombre: string;
  /** posición del ancla de la capa en px del lienzo de la composición */
  x: number;
  y: number;
  rotacion?: number;
  escala?: number;
  opacidad?: number;
  bloqueada?: boolean;
  oculta?: boolean;
  /** timestamp de última edición — lo usa el merge por elemento (§2.4 del kit) */
  v?: number;
  entrada?: Segmento;
  salida?: Segmento;
  /** pistas crudas de keyframes; se aplican ENCIMA de los presets */
  pistas?: Pistas;
  /** intensidad 0–2 del motion blur sintetizado por velocidad */
  motionBlur?: number;
  /** modo de mezcla con lo que hay debajo; ausente = normal */
  mezcla?: MezclaCapa;
  /** pantalla a la que pertenece la capa (id de su placa de fondo): el
      grupo liviano del lienzo multi-pantalla — arrastrar la placa mueve
      la pantalla entera, borrarla la borra completa */
  grupo?: string;
  /** SUBGRUPO dentro de la pantalla (un grupo de Figma: el logo con cada
      letra en su vector): las capas siguen sueltas para animar, pero el
      timeline las pliega en UNA fila y el export a AE las precompone */
  subgrupo?: string;
  subgrupoNombre?: string;
};

/** Corrida de estilo dentro del texto de una capa (rich text de Figma: dos
    tipografías en un título, un color por palabra). Los índices cuentan
    CARACTERES NO BLANCOS (0-based, `hasta` exclusivo): así sobreviven al
    re-wrap del import, que sólo mueve espacios y saltos de línea. Cada campo
    ausente hereda el estilo base de la capa. */
export type TramoTexto = {
  desde: number;
  hasta: number;
  familia?: string;
  peso?: number;
  tamano?: number;
  color?: string;
};

export type CapaTexto = CapaBase & {
  tipo: "texto";
  /** puede tener \n: el motor pinta multilínea con interlineado */
  texto: string;
  fuente: {
    familia: string;
    tamano: number;
    peso: number;
    interletrado?: number;
    /** alto de línea en px; ausente = tamano × 1.15 */
    interlineado?: number;
    /** el ESTILO exacto de la cara como lo nombra la fuente («Bold»,
        «Condensed Heavy») — viene de Figma; el export AE busca la cara
        por familia+estilo antes de adivinar nombres PostScript */
    estilo?: string;
  };
  /** estirados por letra (la O ancha de un logo): rangos sobre los
      caracteres NO BLANCOS (la convención de los tramos) con escala
      no uniforme — el ancho de la letra estirada empuja a las demás */
  deformaciones?: { desde: number; hasta: number; escalaX?: number; escalaY?: number }[];
  color: string;
  /** corridas de estilo (rich text); editar el CONTENIDO del texto las
      descarta — quedan indexadas a otros caracteres (degradar, no romper) */
  tramos?: TramoTexto[];
  division: "ninguna" | "caracteres" | "palabras" | "lineas";
  alineacion?: "izquierda" | "centro" | "derecha";
};

export type CapaForma = CapaBase & {
  tipo: "forma";
  forma: "rectangulo" | "elipse" | "linea";
  ancho: number;
  alto: number;
  color: string;
  radio?: number;
};

/** Trazo vectorial (línea/path de Figma): se anima con trim como en AE. */
export type CapaTrazo = CapaBase & {
  tipo: "trazo";
  /** path SVG en coordenadas locales del nodo (0,0 = esquina sup-izq) */
  path: string;
  ancho: number;
  alto: number;
  color: string;
  grosor: number;
  /** largo total del path en px — lo mide el editor al importar (SVG getTotalLength) */
  largo: number;
  /** trim base 0–1; los presets trazar/retraer animan sobre esto */
  trazoInicio?: number;
  trazoFin?: number;
  remate?: "redondo" | "recto";
};

/** Vector REAL de Figma (estrella, polígono, path dibujado, boolean ya
    combinada): el path SVG viaja tal cual — el motor lo pinta con Path2D y
    el export a AE lo convierte a shape editable (nada se rasteriza). */
export type CapaVector = CapaBase & {
  tipo: "vector";
  /** path SVG en coordenadas locales del nodo (0,0 = esquina sup-izq) */
  path: string;
  ancho: number;
  alto: number;
  /** color del relleno; ausente = sin relleno (solo borde) */
  relleno?: string;
  /** regla de relleno del path; ausente = nonzero (la de Figma) */
  reglaRelleno?: "nonzero" | "evenodd";
  /** borde encima del relleno; ausentes = sin borde */
  trazoColor?: string;
  trazoGrosor?: number;
  remate?: "redondo" | "recto";
};

/** Referencia media por id del catálogo (nunca URL cruda — §10.2 del kit). */
export type CapaMedia = CapaBase & {
  tipo: "media";
  mediaId: string;
  ancho: number;
  alto: number;
  ajuste: "cubrir" | "contener";
};

/** VIDEO DE REFERENCIA: el video real que la pieza acompaña, de fondo en el
    preview para componer las gráficas ENCIMA. Es SOLO guía — nunca sale en
    ningún export (MP4, secuencia PNG, .jsx de AE): el montaje final se hace
    allá, con las gráficas en alfa sobre el video verdadero. El archivo vive
    en el navegador (IndexedDB, como el audio del proyecto); al JSON viaja
    únicamente el `videoId`. El director no la opera. */
export type CapaVideo = CapaBase & {
  tipo: "video";
  /** id del archivo en el almacén local del navegador */
  videoId: string;
  ancho: number;
  alto: number;
  ajuste: "cubrir" | "contener";
  /** offset dentro del archivo: el ms del video que suena en el t=0 de la escena */
  desde?: number;
  referencia: true;
};

export type Capa = CapaTexto | CapaForma | CapaMedia | CapaTrazo | CapaVector | CapaVideo;

/** Cámara de la composición: el render ES lo que ella ve. Keyframes de centro
    (x, y en px del lienzo) y zoom (1 = el frame entero); `base` es el estado
    sin animar de cada canal — las pistas lo pisan, igual que en una capa. */
/** Temblor procedural de cámara: movimiento CONSTANTE encima de los
    keyframes, sin tocarlos — el wiggle de AE. Determinista (mismo t, mismo
    encuadre): el export sigue siendo reproducible. */
export type TemblorCamara = {
  preset: "handheld" | "flotar" | "nervioso";
  /** multiplicador de amplitud del preset (1 = tal cual, 0 = apagado) */
  intensidad?: number;
  /** multiplicador de velocidad del preset (1 = tal cual) */
  velocidad?: number;
  /** cambia la «toma»: otra semilla, otro recorrido */
  semilla?: number;
};

export type Camara = {
  base?: { x?: number; y?: number; zoom?: number };
  pistas: { x?: Keyframe[]; y?: Keyframe[]; zoom?: Keyframe[] };
  temblor?: TemblorCamara;
};

export type CanalCamara = "x" | "y" | "zoom";

/** Una ESCENA marcada por el usuario: un encuadre (centro + zoom) con
    nombre, en orden. El director recorre estos encuadres; la geometría de la
    cámara la pone la persona, los tiempos los pone el guion. */
export type Encuadre = { id: string; nombre: string; x: number; y: number; zoom: number };

export type Composicion = {
  version: 1;
  /** revisión para el CAS del guardado (§2.4 del kit) */
  rev?: number;
  nombre: string;
  ancho: number;
  alto: number;
  fps: number;
  /** fps DE LA ANIMACIÓN, para el look stop-motion/dibujado a mano: el
      tiempo se cuantiza a esta grilla (12 = animar «en doses» de un render
      a 24). Ausente = movimiento suave a los fps del render. */
  fpsAnimacion?: number;
  /** duración total, ms */
  duracion: number;
  fondo: string;
  capas: Capa[];
  /** movimiento de cámara; ausente = plano fijo */
  camara?: Camara;
  /** escenas marcadas en el inspector de cámara, en orden (opcional) */
  encuadres?: Encuadre[];
  borrados?: { id: string; v: number }[];
};

export type Actor = { id: string; rol: string; email: string };
