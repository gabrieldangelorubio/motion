/* -----------------------------------------------------------------------------
   Herramientas del agente de motion — el vocabulario de edición

   Cada tool es una operación INCREMENTAL sobre la composición (nunca
   regeneración total), construida sobre las ops puras de herramientas-puro.
   Este archivo no importa el SDK de Anthropic: es puro y se testea con
   node:test; el loop del agente (agente.ts, servidor) le pasa los tool_use.

   Defensas (research M4): los números del modelo se CLAMPEAN a rangos
   sanos; los ids inexistentes devuelven error legible (el modelo se
   corrige); después de cada op se validan invariantes y los problemas
   vuelven en el resultado — verificación semántica barata.
----------------------------------------------------------------------------- */

import { MEZCLAS, type Camara, type Capa, type CapaForma, type CapaTexto, type CapaTrazo, type CapaVector, type Composicion, type Keyframe, type MezclaCapa, type NombreEasing, type NombrePropiedad, type OrdenEscalonado, type Segmento, type TemblorCamara } from "@/lib/motion/modelo";
import { agregarCapa, editarCapa, quitarCapa, describir } from "@/lib/motion/herramientas-puro";
import { ordenarKeyframes } from "@/lib/motion/keyframes-puro";
import { CATEGORIAS, escalonadoSano, nombresPresets, PRESETS } from "@/lib/motion/presets-puro";
import { EASINGS } from "@/lib/motion/easings-puro";
import { validar } from "@/lib/motion/validar-puro";

export type ResultadoHerramienta = {
  comp: Composicion;
  /** texto que vuelve al modelo como tool_result */
  resultado: string;
  /** resumen corto para la UI (diff visible); ausente si la op falló */
  resumen?: string;
  esError?: boolean;
};

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const numero = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);

function easingValido(v: unknown): NombreEasing | undefined {
  return typeof v === "string" && v in EASINGS ? (v as NombreEasing) : undefined;
}

function ordenValido(v: unknown): OrdenEscalonado | undefined {
  return v === "inicio" || v === "fin" || v === "centro" || v === "bordes" || v === "azar" ? v : undefined;
}

function fallo(comp: Composicion, mensaje: string): ResultadoHerramienta {
  return { comp, resultado: `ERROR: ${mensaje}`, esError: true };
}

function exito(comp: Composicion, resumen: string): ResultadoHerramienta {
  const problemas = validar(comp);
  const cola = problemas.length
    ? `\nAVISOS de validación:\n${problemas.map((p) => `- ${p.mensaje}`).join("\n")}`
    : "";
  return { comp, resultado: `OK: ${resumen}${cola}\n\nEstado actual:\n${describir(comp)}`, resumen };
}

function segmentoDe(comp: Composicion, input: Record<string, unknown>, clase: "entrada" | "salida", capa?: Capa): Segmento | string {
  const preset = String(input.preset ?? "");
  if (!nombresPresets(clase).includes(preset)) {
    return `preset «${preset}» no existe; los de ${clase} son: ${nombresPresets(clase).join(", ")}`;
  }
  // capa dividida sin escalonado pedido = bloque entero (no se ve la
  // división): el default sano de su división; un 0 explícito sí manda
  const escalonadoDefault =
    capa?.tipo === "texto" && capa.division !== "ninguna" ? escalonadoSano(capa.division) : undefined;
  const seg: Segmento = {
    preset,
    en: clamp(numero(input.en, 0), 0, comp.duracion),
    duracion: clamp(numero(input.duracion, 700), 50, comp.duracion),
    easing: easingValido(input.easing),
    escalonado: input.escalonado === undefined ? escalonadoDefault : clamp(numero(input.escalonado, 0), 0, 500),
    ordenEscalonado: ordenValido(input.ordenEscalonado),
  };
  if (typeof input.params === "object" && input.params !== null) {
    const params: Record<string, number> = {};
    for (const [k, v] of Object.entries(input.params as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) params[k] = v;
    }
    seg.params = params;
  }
  return seg;
}

/** Ejecuta un tool_use del agente. Devuelve la composición nueva (o la misma si falló). */
export function ejecutarHerramienta(
  comp: Composicion,
  nombre: string,
  entrada: unknown,
  ahora = 0,
): ResultadoHerramienta {
  const input = (typeof entrada === "object" && entrada !== null ? entrada : {}) as Record<string, unknown>;
  const capaDe = (id: unknown) => comp.capas.find((c) => c.id === id);
  const marca = ahora || Math.max(0, ...comp.capas.map((c) => c.v ?? 0)) + 1;

  switch (nombre) {
    case "ver_composicion":
      return { comp, resultado: describir(comp) };

    case "ajustar_composicion": {
      const nueva: Composicion = {
        ...comp,
        duracion: input.duracion === undefined ? comp.duracion : clamp(numero(input.duracion, comp.duracion), 500, 120000),
        fondo: typeof input.fondo === "string" ? input.fondo : comp.fondo,
        nombre: typeof input.nombre === "string" ? input.nombre : comp.nombre,
      };
      return exito(nueva, "composición ajustada");
    }

    case "agregar_capa_texto": {
      const id = String(input.id ?? `capa-${comp.capas.length + 1}`);
      const capa: CapaTexto = {
        id,
        nombre: String(input.nombre ?? id),
        tipo: "texto",
        texto: String(input.texto ?? ""),
        fuente: {
          familia: typeof input.familia === "string" ? input.familia : "-apple-system, 'Segoe UI', Roboto, sans-serif",
          tamano: clamp(numero(input.tamano, 60), 8, 600),
          peso: clamp(numero(input.peso, 600), 100, 900),
        },
        color: String(input.color ?? "#e8e8ee"),
        division: input.division === "caracteres" || input.division === "palabras" || input.division === "lineas" ? input.division : "ninguna",
        alineacion: input.alineacion === "izquierda" || input.alineacion === "derecha" ? input.alineacion : "centro",
        x: clamp(numero(input.x, comp.ancho / 2), -comp.ancho, comp.ancho * 2),
        y: clamp(numero(input.y, comp.alto / 2), -comp.alto, comp.alto * 2),
      };
      const res = agregarCapa(comp, capa, marca);
      return res.ok ? exito(res.valor, `capa de texto «${capa.nombre}» agregada`) : fallo(comp, res.error);
    }

    case "agregar_capa_forma": {
      const id = String(input.id ?? `capa-${comp.capas.length + 1}`);
      const capa: CapaForma = {
        id,
        nombre: String(input.nombre ?? id),
        tipo: "forma",
        forma: input.forma === "elipse" ? "elipse" : input.forma === "linea" ? "linea" : "rectangulo",
        ancho: clamp(numero(input.ancho, 200), 1, comp.ancho * 2),
        alto: clamp(numero(input.alto, 200), 1, comp.alto * 2),
        color: String(input.color ?? "#33333c"),
        radio: input.radio === undefined ? undefined : clamp(numero(input.radio, 0), 0, 500),
        x: clamp(numero(input.x, comp.ancho / 2), -comp.ancho, comp.ancho * 2),
        y: clamp(numero(input.y, comp.alto / 2), -comp.alto, comp.alto * 2),
      };
      const res = agregarCapa(comp, capa, marca);
      return res.ok ? exito(res.valor, `forma «${capa.nombre}» agregada`) : fallo(comp, res.error);
    }

    case "editar_capa": {
      const capa = capaDe(input.capaId);
      if (!capa) return fallo(comp, `no hay ninguna capa «${String(input.capaId)}»; ids: ${comp.capas.map((c) => c.id).join(", ")}`);
      const cambios: Partial<Capa> = {};
      if (input.x !== undefined) cambios.x = clamp(numero(input.x, capa.x), -comp.ancho, comp.ancho * 2);
      if (input.y !== undefined) cambios.y = clamp(numero(input.y, capa.y), -comp.alto, comp.alto * 2);
      if (input.escala !== undefined) cambios.escala = clamp(numero(input.escala, 1), 0.01, 20);
      if (input.rotacion !== undefined) cambios.rotacion = clamp(numero(input.rotacion, 0), -360, 360);
      if (input.opacidad !== undefined) cambios.opacidad = clamp(numero(input.opacidad, 1), 0, 1);
      if (input.motionBlur !== undefined) cambios.motionBlur = clamp(numero(input.motionBlur, 0), 0, 2);
      if (input.mezcla !== undefined) {
        if (input.mezcla === "normal" || input.mezcla === "") cambios.mezcla = undefined;
        else if ((MEZCLAS as string[]).includes(String(input.mezcla))) cambios.mezcla = input.mezcla as MezclaCapa;
        else return fallo(comp, `mezcla «${String(input.mezcla)}» no existe; usá normal o ${MEZCLAS.join(", ")}`);
      }
      if (typeof input.nombre === "string") cambios.nombre = input.nombre;
      if (capa.tipo === "texto") {
        const extra = cambios as Partial<CapaTexto>;
        if (typeof input.texto === "string") {
          extra.texto = input.texto;
          // los tramos se indexan por carácter NO BLANCO: mover espacios o
          // saltos de línea no los invalida; cambiar la tinta sí
          const mismaTinta = input.texto.replace(/\s+/g, "") === capa.texto.replace(/\s+/g, "");
          if (capa.tramos && !mismaTinta) extra.tramos = undefined;
        }
        if (typeof input.color === "string") extra.color = input.color;
        if (input.division === "ninguna" || input.division === "caracteres" || input.division === "palabras" || input.division === "lineas") {
          extra.division = input.division;
          // activar una división en segmentos sin escalonado: default sano,
          // si no la edición no se ve (todas las unidades se mueven juntas)
          if (input.division !== "ninguna") {
            if (capa.entrada && !capa.entrada.escalonado)
              extra.entrada = { ...capa.entrada, escalonado: escalonadoSano(input.division) };
            if (capa.salida && !capa.salida.escalonado)
              extra.salida = { ...capa.salida, escalonado: escalonadoSano(input.division) };
          }
        }
        if (input.tamano !== undefined || input.peso !== undefined) {
          extra.fuente = {
            ...capa.fuente,
            tamano: input.tamano === undefined ? capa.fuente.tamano : clamp(numero(input.tamano, capa.fuente.tamano), 8, 600),
            peso: input.peso === undefined ? capa.fuente.peso : clamp(numero(input.peso, capa.fuente.peso), 100, 900),
          };
        }
      } else if (capa.tipo === "forma" && typeof input.color === "string") {
        (cambios as Partial<CapaForma>).color = input.color;
      } else if (capa.tipo === "vector") {
        // «color» en un vector edita el RELLENO (lo que se ve); grosor, el borde
        const extra = cambios as Partial<CapaVector>;
        if (typeof input.color === "string") {
          if (capa.relleno || !capa.trazoColor) extra.relleno = input.color;
          else extra.trazoColor = input.color;
        }
        if (input.grosor !== undefined && capa.trazoGrosor) {
          extra.trazoGrosor = clamp(numero(input.grosor, capa.trazoGrosor), 0.5, 200);
        }
      } else if (capa.tipo === "trazo") {
        const extra = cambios as Partial<CapaTrazo>;
        if (typeof input.color === "string") extra.color = input.color;
        if (input.grosor !== undefined) extra.grosor = clamp(numero(input.grosor, capa.grosor), 0.5, 200);
        if (input.trazoInicio !== undefined) extra.trazoInicio = clamp(numero(input.trazoInicio, 0), 0, 1);
        if (input.trazoFin !== undefined) extra.trazoFin = clamp(numero(input.trazoFin, 1), 0, 1);
      }
      if (Object.keys(cambios).length === 0) return fallo(comp, "no vino ningún cambio aplicable");
      const res = editarCapa(comp, capa.id, cambios, marca);
      return res.ok ? exito(res.valor, `«${capa.nombre}» editada (${Object.keys(cambios).join(", ")})`) : fallo(comp, res.error);
    }

    case "definir_entrada":
    case "definir_salida": {
      const clase = nombre === "definir_entrada" ? "entrada" : "salida";
      const capa = capaDe(input.capaId);
      if (!capa) return fallo(comp, `no hay ninguna capa «${String(input.capaId)}»; ids: ${comp.capas.map((c) => c.id).join(", ")}`);
      const seg = segmentoDe(comp, input, clase, capa);
      if (typeof seg === "string") return fallo(comp, seg);
      const res = editarCapa(comp, capa.id, { [clase]: seg }, marca);
      return res.ok
        ? exito(res.valor, `${clase} de «${capa.nombre}»: ${seg.preset} @${seg.en}ms ×${seg.duracion}ms${seg.escalonado ? ` esc ${seg.escalonado}ms` : ""}`)
        : fallo(comp, res.error);
    }

    case "quitar_segmento": {
      const capa = capaDe(input.capaId);
      if (!capa) return fallo(comp, `no hay ninguna capa «${String(input.capaId)}»`);
      const cual = input.cual === "salida" ? "salida" : "entrada";
      const res = editarCapa(comp, capa.id, { [cual]: undefined }, marca);
      return res.ok ? exito(res.valor, `${cual} de «${capa.nombre}» quitada`) : fallo(comp, res.error);
    }

    case "definir_pista": {
      const capa = capaDe(input.capaId);
      if (!capa) return fallo(comp, `no hay ninguna capa «${String(input.capaId)}»`);
      const propiedad = String(input.propiedad) as NombrePropiedad;
      if (!["x", "y", "escala", "rotacion", "opacidad", "desenfoque", "trazoInicio", "trazoFin"].includes(propiedad)) {
        return fallo(comp, `propiedad «${propiedad}» no animable; usá x, y, escala, rotacion, opacidad, desenfoque, trazoInicio o trazoFin`);
      }
      const esTrim = propiedad === "trazoInicio" || propiedad === "trazoFin";
      if (esTrim && capa.tipo !== "trazo") {
        return fallo(comp, `«${capa.nombre}» es ${capa.tipo}: trazoInicio/trazoFin sólo existen en capas de trazo`);
      }
      if (!Array.isArray(input.keyframes) || input.keyframes.length === 0) {
        return fallo(comp, "keyframes tiene que ser una lista no vacía de {t, v, easing?, hold?}");
      }
      const keyframes: Keyframe[] = ordenarKeyframes(
        (input.keyframes as Record<string, unknown>[]).map((k) => ({
          t: clamp(numero(k.t, 0), 0, comp.duracion),
          v: esTrim ? clamp(numero(k.v, 0), 0, 1) : numero(k.v, 0),
          easing: easingValido(k.easing),
          hold: k.hold === true || undefined,
        })),
      );
      const res = editarCapa(comp, capa.id, { pistas: { ...capa.pistas, [propiedad]: keyframes } }, marca);
      return res.ok ? exito(res.valor, `pista ${propiedad} de «${capa.nombre}»: ${keyframes.length} keyframes`) : fallo(comp, res.error);
    }

    case "quitar_capa": {
      const capa = capaDe(input.capaId);
      if (!capa) return fallo(comp, `no hay ninguna capa «${String(input.capaId)}»`);
      const res = quitarCapa(comp, capa.id, marca);
      return res.ok ? exito(res.valor, `capa «${capa.nombre}» quitada`) : fallo(comp, res.error);
    }

    case "definir_camara": {
      const pistas: Camara["pistas"] = {};
      const canales = [
        { canal: "x" as const, min: -comp.ancho, max: comp.ancho * 2 },
        { canal: "y" as const, min: -comp.alto, max: comp.alto * 2 },
        { canal: "zoom" as const, min: 0.1, max: 10 },
      ];
      for (const { canal, min, max } of canales) {
        const cruda = input[canal];
        if (cruda === undefined) continue;
        if (!Array.isArray(cruda) || cruda.length === 0) {
          return fallo(comp, `${canal} tiene que ser una lista no vacía de {t, v, easing?}`);
        }
        pistas[canal] = ordenarKeyframes(
          (cruda as Record<string, unknown>[]).map((k) => ({
            t: clamp(numero(k.t, 0), 0, comp.duracion),
            v: clamp(numero(k.v, canal === "zoom" ? 1 : 0), min, max),
            easing: easingValido(k.easing),
          })),
        );
      }
      let base: Camara["base"];
      if (typeof input.base === "object" && input.base !== null) {
        const b = input.base as Record<string, unknown>;
        base = {};
        if (b.x !== undefined) base.x = clamp(numero(b.x, comp.ancho / 2), -comp.ancho, comp.ancho * 2);
        if (b.y !== undefined) base.y = clamp(numero(b.y, comp.alto / 2), -comp.alto, comp.alto * 2);
        if (b.zoom !== undefined) base.zoom = clamp(numero(b.zoom, 1), 0.1, 10);
      }
      // temblor procedural: constante, ENCIMA de los keyframes, sin tocarlos
      let temblor: TemblorCamara | undefined;
      if (typeof input.temblor === "object" && input.temblor !== null) {
        const tb = input.temblor as Record<string, unknown>;
        const preset = tb.preset === "handheld" || tb.preset === "flotar" || tb.preset === "nervioso" ? tb.preset : null;
        if (!preset) return fallo(comp, "temblor.preset tiene que ser handheld, flotar o nervioso");
        temblor = {
          preset,
          intensidad: tb.intensidad === undefined ? undefined : clamp(numero(tb.intensidad, 1), 0, 3),
          velocidad: tb.velocidad === undefined ? undefined : clamp(numero(tb.velocidad, 1), 0.1, 4),
        };
      } else if (input.temblor === "ninguno") {
        temblor = undefined;
      } else if (input.temblor === undefined) {
        temblor = comp.camara?.temblor; // no vino: se conserva el que había
      }
      if (!pistas.x && !pistas.y && !pistas.zoom && !base && !temblor) {
        return fallo(comp, "definí al menos un canal de cámara (x, y o zoom), una base o un temblor");
      }
      const resumen = `cámara: ${(["x", "y", "zoom"] as const)
        .filter((c) => pistas[c])
        .map((c) => `${c} ${pistas[c]!.length} kf`)
        .join(", ") || "base fija"}${temblor ? ` + temblor ${temblor.preset}` : ""}`;
      return exito({ ...comp, camara: { base, pistas, temblor } }, resumen);
    }

    case "quitar_camara":
      if (!comp.camara) return fallo(comp, "la composición no tiene cámara");
      return exito({ ...comp, camara: undefined }, "cámara quitada — plano fijo");

    case "reordenar_capas": {
      if (!Array.isArray(input.orden)) return fallo(comp, "orden tiene que ser la lista completa de ids, de fondo a frente");
      const orden = input.orden.map(String);
      const idsActuales = comp.capas.map((c) => c.id).sort();
      if (JSON.stringify([...orden].sort()) !== JSON.stringify(idsActuales)) {
        return fallo(comp, `orden tiene que contener exactamente los ids actuales: ${idsActuales.join(", ")}`);
      }
      const porId = new Map(comp.capas.map((c) => [c.id, c]));
      return exito({ ...comp, capas: orden.map((id) => porId.get(id)!) }, "z-order actualizado");
    }

    default:
      return fallo(comp, `herramienta desconocida «${nombre}»`);
  }
}

/* ——— Definiciones para el API (JSON Schema; strict donde el shape es cerrado) ——— */

const PROPS_SEGMENTO = {
  capaId: { type: "string", description: "id de la capa (de ver_composicion)" },
  preset: { type: "string", description: "nombre del preset" },
  en: { type: "number", description: "ms donde empieza" },
  duracion: { type: "number", description: "ms que dura" },
  easing: { type: "string", description: `uno de: ${Object.keys(EASINGS).join(", ")}` },
  escalonado: { type: "number", description: "ms entre unidades si la capa está dividida (0 = sin escalonado)" },
  ordenEscalonado: { type: "string", enum: ["inicio", "fin", "centro", "bordes", "azar"] },
  params: { type: "object", description: "parámetros del preset, ej {distancia: 140}" },
} as const;

export const DEFINICIONES_HERRAMIENTAS = [
  {
    name: "ver_composicion",
    description: "Devuelve el estado actual de la composición: lienzo, capas con sus ids, segmentos y pistas. Usala si perdiste el hilo del estado.",
    input_schema: { type: "object", properties: {}, additionalProperties: false, required: [] },
  },
  {
    name: "ajustar_composicion",
    description: "Cambia duración total (ms), color de fondo o nombre de la composición.",
    input_schema: {
      type: "object",
      properties: {
        duracion: { type: "number" },
        fondo: { type: "string", description: "color CSS, ej #0c0c11" },
        nombre: { type: "string" },
      },
      additionalProperties: false,
      required: [],
    },
  },
  {
    name: "agregar_capa_texto",
    description: "Agrega una capa de texto. x,y = ancla en px del lienzo (con alineación centro, x es el centro del texto). división caracteres/palabras habilita escalonados por unidad.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        nombre: { type: "string" },
        texto: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        tamano: { type: "number" },
        peso: { type: "number", description: "100-900" },
        color: { type: "string" },
        familia: { type: "string" },
        division: { type: "string", enum: ["ninguna", "caracteres", "palabras", "lineas"] },
        alineacion: { type: "string", enum: ["izquierda", "centro", "derecha"] },
      },
      additionalProperties: false,
      required: ["texto"],
    },
  },
  {
    name: "agregar_capa_forma",
    description: "Agrega un rectángulo, elipse o línea. x,y = centro de la forma.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        nombre: { type: "string" },
        forma: { type: "string", enum: ["rectangulo", "elipse", "linea"] },
        x: { type: "number" },
        y: { type: "number" },
        ancho: { type: "number" },
        alto: { type: "number" },
        color: { type: "string" },
        radio: { type: "number", description: "radio de esquinas (rectángulo)" },
      },
      additionalProperties: false,
      required: [],
    },
  },
  {
    name: "editar_capa",
    description: "Edita propiedades base de una capa existente: posición, escala (1 = 100%), rotación, opacidad (0-1), motionBlur (0-2), mezcla (normal, multiply, screen, overlay…), nombre; en texto también texto (\\n = salto de línea), color, tamano, peso, division; en trazos color, grosor y el trim base trazoInicio/trazoFin (0-1).",
    input_schema: {
      type: "object",
      properties: {
        capaId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        escala: { type: "number" },
        rotacion: { type: "number" },
        opacidad: { type: "number" },
        motionBlur: { type: "number" },
        mezcla: { type: "string", description: "normal | multiply | screen | overlay | darken | lighten | color-dodge | color-burn | hard-light | soft-light | difference | exclusion | hue | saturation | color | luminosity" },
        nombre: { type: "string" },
        texto: { type: "string" },
        color: { type: "string" },
        tamano: { type: "number" },
        peso: { type: "number" },
        division: { type: "string", enum: ["ninguna", "caracteres", "palabras", "lineas"] },
        grosor: { type: "number", description: "grosor del trazo en px (capas de trazo)" },
        trazoInicio: { type: "number", description: "trim base 0-1 (capas de trazo)" },
        trazoFin: { type: "number", description: "trim base 0-1 (capas de trazo)" },
      },
      additionalProperties: false,
      required: ["capaId"],
    },
  },
  {
    name: "definir_entrada",
    description: `Define CÓMO ENTRA una capa. Presets de entrada: ${nombresPresets("entrada").join(", ")}. El contrato: toda entrada termina en identidad.`,
    input_schema: { type: "object", properties: PROPS_SEGMENTO, additionalProperties: false, required: ["capaId", "preset", "en", "duracion"] },
  },
  {
    name: "definir_salida",
    description: `Define CÓMO SALE una capa. Presets de salida: ${nombresPresets("salida").join(", ")}.`,
    input_schema: { type: "object", properties: PROPS_SEGMENTO, additionalProperties: false, required: ["capaId", "preset", "en", "duracion"] },
  },
  {
    name: "quitar_segmento",
    description: "Quita la entrada o la salida de una capa.",
    input_schema: {
      type: "object",
      properties: { capaId: { type: "string" }, cual: { type: "string", enum: ["entrada", "salida"] } },
      additionalProperties: false,
      required: ["capaId", "cual"],
    },
  },
  {
    name: "definir_pista",
    description: "Define la pista COMPLETA de keyframes de una propiedad (reemplaza la anterior). Valores ABSOLUTOS que pisan la base: x/y en px, escala 1=100%, rotacion en grados, opacidad 0-1, desenfoque en px. El easing va en el keyframe de SALIDA del tramo; hold congela hasta el siguiente.",
    input_schema: {
      type: "object",
      properties: {
        capaId: { type: "string" },
        propiedad: { type: "string", enum: ["x", "y", "escala", "rotacion", "opacidad", "desenfoque", "trazoInicio", "trazoFin"] },
        keyframes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              t: { type: "number" },
              v: { type: "number" },
              easing: { type: "string" },
              hold: { type: "boolean" },
            },
            additionalProperties: false,
            required: ["t", "v"],
          },
        },
      },
      additionalProperties: false,
      required: ["capaId", "propiedad", "keyframes"],
    },
  },
  {
    name: "quitar_capa",
    description: "Elimina una capa de la composición.",
    input_schema: {
      type: "object",
      properties: { capaId: { type: "string" } },
      additionalProperties: false,
      required: ["capaId"],
    },
  },
  {
    name: "definir_camara",
    description: "Define la cámara de la composición (reemplaza la anterior). El render ES lo que ve la cámara: keyframes de x/y (centro del encuadre, px del lienzo) y zoom (1 = el frame entero, 2 = acercado al doble); `base` es el encuadre sin animar de los canales sin keyframes. Para viajar entre pantallas del lienzo y para paneos/zooms cinematográficos; el easing va en el keyframe de salida del tramo. `temblor` suma un handheld/drift procedural constante que NO toca los keyframes.",
    input_schema: {
      type: "object",
      properties: {
        x: { type: "array", items: { type: "object", properties: { t: { type: "number" }, v: { type: "number" }, easing: { type: "string" } }, additionalProperties: false, required: ["t", "v"] } },
        y: { type: "array", items: { type: "object", properties: { t: { type: "number" }, v: { type: "number" }, easing: { type: "string" } }, additionalProperties: false, required: ["t", "v"] } },
        zoom: { type: "array", items: { type: "object", properties: { t: { type: "number" }, v: { type: "number" }, easing: { type: "string" } }, additionalProperties: false, required: ["t", "v"] } },
        base: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, zoom: { type: "number" } }, additionalProperties: false, required: [] },
        temblor: {
          description: "Movimiento CONSTANTE encima de los keyframes (wiggle/handheld), nunca los toca. Objeto {preset, intensidad?, velocidad?} o \"ninguno\" para sacarlo; omitido conserva el que había.",
          anyOf: [
            {
              type: "object",
              properties: {
                preset: { type: "string", enum: ["handheld", "flotar", "nervioso"] },
                intensidad: { type: "number", description: "multiplicador 0-3 (1 = el del preset)" },
                velocidad: { type: "number", description: "multiplicador 0.1-4 (1 = la del preset)" },
              },
              additionalProperties: false,
              required: ["preset"],
            },
            { type: "string", enum: ["ninguno"] },
          ],
        },
      },
      additionalProperties: false,
      required: [],
    },
  },
  {
    name: "quitar_camara",
    description: "Quita el movimiento de cámara: la composición vuelve a plano fijo.",
    input_schema: { type: "object", properties: {}, additionalProperties: false, required: [] },
  },
  {
    name: "reordenar_capas",
    description: "Redefine el z-order con la lista COMPLETA de ids, de fondo a frente.",
    input_schema: {
      type: "object",
      properties: { orden: { type: "array", items: { type: "string" } } },
      additionalProperties: false,
      required: ["orden"],
    },
  },
] as const;

/* ——— Conocimiento del sistema para el prompt (generado del código, no a mano) ——— */

export function catalogoParaPrompt(): string {
  const porCategoria = CATEGORIAS.map((cat) => {
    const nombres = Object.entries(PRESETS)
      .filter(([, def]) => def.categoria === cat.id)
      .map(([nombre, def]) => `${nombre} (${def.clase})`)
      .join(", ");
    return `- ${cat.nombre}: ${nombres}`;
  }).join("\n");
  return `Presets disponibles, por categoría:\n${porCategoria}\n\nEasings disponibles: ${Object.keys(EASINGS).join(", ")}`;
}
