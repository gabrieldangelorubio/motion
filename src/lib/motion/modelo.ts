/* -----------------------------------------------------------------------------
   Modelo de una composición de motion graphics

   El JSON que se guarda en `contenido` (jsonb) ES este modelo serializado.
   Nada acá importa React ni DOM: el modelo tiene que poder evaluarse en un
   test de node y en un worker de render por igual. La regla fundacional del
   módulo: cada frame es una función pura de (composición, t) — por eso las
   propiedades animadas son keyframes declarativos, nunca estado acumulado.
----------------------------------------------------------------------------- */

/** Nombres de easing del sistema. Parte del contrato del JSON: sólo se agregan. */
export type NombreEasing =
  | "lineal"
  | "suave"
  | "seco"
  | "salidaQuad"
  | "salidaCubic"
  | "salidaQuart"
  | "salidaExpo"
  | "salidaBack"
  | "entradaQuad"
  | "entradaCubic"
  | "entradaExpo"
  | "entradaBack"
  | "entradaSalidaCubic"
  | "entradaSalidaExpo"
  | "resorteSuave"
  | "resorteTenso"
  | "resorteRebote";

export type Keyframe = {
  /** milisegundos desde el inicio de la composición */
  t: number;
  v: number;
  /** easing del TRAMO que sale de este keyframe (hacia el siguiente) */
  easing?: NombreEasing;
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
  | "trazoFin";

export type Pistas = Partial<Record<NombrePropiedad, Keyframe[]>>;

/** Orden en que los sub-elementos de un texto entran en el escalonado. */
export type OrdenEscalonado = "inicio" | "fin" | "centro" | "bordes";

export type Segmento = {
  preset: string;
  /** inicio del segmento, ms */
  en: number;
  duracion: number;
  easing?: NombreEasing;
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
  };
  color: string;
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

/** Referencia media por id del catálogo (nunca URL cruda — §10.2 del kit). */
export type CapaMedia = CapaBase & {
  tipo: "media";
  mediaId: string;
  ancho: number;
  alto: number;
  ajuste: "cubrir" | "contener";
};

export type Capa = CapaTexto | CapaForma | CapaMedia | CapaTrazo;

/** Cámara de la composición: el render ES lo que ella ve. Keyframes de centro
    (x, y en px del lienzo) y zoom (1 = el frame entero); `base` es el estado
    sin animar de cada canal — las pistas lo pisan, igual que en una capa. */
export type Camara = {
  base?: { x?: number; y?: number; zoom?: number };
  pistas: { x?: Keyframe[]; y?: Keyframe[]; zoom?: Keyframe[] };
};

export type CanalCamara = "x" | "y" | "zoom";

export type Composicion = {
  version: 1;
  /** revisión para el CAS del guardado (§2.4 del kit) */
  rev?: number;
  nombre: string;
  ancho: number;
  alto: number;
  fps: number;
  /** duración total, ms */
  duracion: number;
  fondo: string;
  capas: Capa[];
  /** movimiento de cámara; ausente = plano fijo */
  camara?: Camara;
  borrados?: { id: string; v: number }[];
};

export type Actor = { id: string; rol: string; email: string };
