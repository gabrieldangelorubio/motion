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
  | "desenfoque";

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
};

export type CapaTexto = CapaBase & {
  tipo: "texto";
  texto: string;
  fuente: { familia: string; tamano: number; peso: number; interletrado?: number };
  color: string;
  division: "ninguna" | "caracteres" | "palabras";
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

/** Referencia media por id del catálogo (nunca URL cruda — §10.2 del kit). */
export type CapaMedia = CapaBase & {
  tipo: "media";
  mediaId: string;
  ancho: number;
  alto: number;
  ajuste: "cubrir" | "contener";
};

export type Capa = CapaTexto | CapaForma | CapaMedia;

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
  borrados?: { id: string; v: number }[];
};

export type Actor = { id: string; rol: string; email: string };
