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

import { MEZCLAS, type Camara, type Capa, type CapaForma, type CapaMedia, type CapaTexto, type CapaTrazo, type CapaVector, type Composicion, type Keyframe, type EasingSpec, type MezclaCapa, type NombrePropiedad, type OrdenEscalonado, type Segmento, type TemblorCamara } from "@/lib/motion/modelo";
import { agregarCapa, editarCapa, quitarCapa, describir } from "@/lib/motion/herramientas-puro";
import { ordenarKeyframes } from "@/lib/motion/keyframes-puro";
import { CATEGORIAS, escalonadoSano, nombresPresets, PRESETS } from "@/lib/motion/presets-puro";
import { EASINGS, esEasingConocido } from "@/lib/motion/easings-puro";
import { derivarPantalla } from "@/lib/motion/derivar-puro";
import { describirEstilo, esPlaca, estiloDePieza } from "@/lib/motion/estilo-puro";
import { cajaAproximada } from "@/lib/motion/auditoria-puro";
import { camaraDeEncuadres, type TramoDeEscena } from "@/lib/motion/encuadres-puro";
import { conFormato } from "@/lib/motion/formato-puro";
import { EASINGS_GSAP_DESTACADOS } from "@/lib/motion/easings-gsap";
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

function easingValido(v: unknown): EasingSpec | undefined {
  if (typeof v !== "string") return undefined;
  // fork GSAP: además de los nombres de la casa, cualquier spec de GSAP
  // que parsee de verdad («back.out(3)», «steps(8)», un path SVG)
  return esEasingConocido(v) ? v : undefined;
}

function ordenValido(v: unknown): OrdenEscalonado | undefined {
  return v === "inicio" || v === "fin" || v === "centro" || v === "bordes" || v === "azar" ? v : undefined;
}

/** La PRIMERA aparición de `letras` en el texto, como rango [desde, hasta)
    sobre los caracteres NO BLANCOS (la indexación de tramos/deformaciones).
    Exacta primero, sin mayúsculas después («la o» encuentra la O). */
export function rangoDeLetras(texto: string, letras: string): [number, number] | null {
  const limpiar = (s: string) => s.replace(/\s+/g, "");
  const pajar = limpiar(texto);
  const aguja = limpiar(letras);
  if (!aguja) return null;
  let i = pajar.indexOf(aguja);
  if (i < 0) i = pajar.toLowerCase().indexOf(aguja.toLowerCase());
  if (i < 0) return null;
  return [i, i + aguja.length];
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
  // los presets de TRAZOS animan el trim del recorrido: en cualquier otra
  // capa la op «funcionaba» sin efecto visible — el modelo creía haber
  // animado y en pantalla no pasaba nada (visto con vectores de Figma)
  if (PRESETS[preset].categoria === "trazos" && capa && capa.tipo !== "trazo") {
    return `«${preset}» es un preset de TRAZOS (anima el trim del recorrido) y «${capa.nombre}» es una capa de ${capa.tipo}: no tendría ningún efecto visible. Para que una capa de ${capa.tipo} «se dibuje» o entre con carácter usá revelar (máscara), crecer, aparecer o desenfocar.`;
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
/** Distancia de edición (Levenshtein) acotada: alcanza para typos de una o
    dos letras sin confundir herramientas distintas. */
export function herramientaMasCercana(nombre: string, conocidas: string[]): string | null {
  const distancia = (a: string, b: string): number => {
    const fila: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let previa = fila[0];
      fila[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = fila[j];
        fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previa + (a[i - 1] === b[j - 1] ? 0 : 1));
        previa = temp;
      }
    }
    return fila[b.length];
  };
  const limpio = nombre.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const puntajes = conocidas.map((c) => ({ n: c, d: distancia(limpio, c) })).filter((x) => x.d <= 2).sort((a, b) => a.d - b.d);
  if (puntajes.length === 0) return null;
  // el candidato tiene que ser ÚNICO a su distancia: si dos empatan, no se adivina
  if (puntajes.length > 1 && puntajes[1].d === puntajes[0].d) return null;
  // y nunca se «corrige» hacia una herramienta destructiva (quitar_capa está
  // a distancia 2 de editar_capa): si lo más cercano es destructivo, nada
  if (puntajes[0].n.startsWith("quitar_")) return null;
  return puntajes[0].n;
}

/** Una capa «del diseño» es una placa o una capa que vive en una pantalla
    (grupo = id de una placa): lo que importó el usuario. El director las
    anima y las edita, pero no las borra para recrearlas. */
export function esCapaDelDiseno(comp: Composicion, capa: Capa): boolean {
  if (esPlaca(capa)) return true;
  return !!capa.grupo && comp.capas.some((p) => p.id === capa.grupo && esPlaca(p));
}

/** Propiedades que solo existen en texto: pedirlas sobre un raster o una
    forma es el síntoma de «quiero animar esto como texto». */
const SOLO_TEXTO = ["texto", "division", "familia", "tamano", "peso", "interlineado", "interletrado", "alineacion"] as const;

export function ejecutarHerramienta(
  comp: Composicion,
  nombre: string,
  entrada: unknown,
  ahora = 0,
): ResultadoHerramienta {
  const input = (typeof entrada === "object" && entrada !== null ? entrada : {}) as Record<string, unknown>;
  const capaDe = (id: unknown) => comp.capas.find((c) => c.id === id);
  const marca = ahora || Math.max(0, ...comp.capas.map((c) => c.v ?? 0)) + 1;

  // Un TYPO en el nombre («definar_camara») le costó a Kimi una ronda entera
  // (17 min) por un paso que era correcto. Si el nombre no existe pero está a
  // una o dos letras de uno que sí, se aplica ese y el resultado lo dice.
  const conocidas: string[] = DEFINICIONES_HERRAMIENTAS.map((d) => d.name as string);
  if (!conocidas.includes(nombre)) {
    const cerca = herramientaMasCercana(nombre, conocidas);
    if (cerca) {
      const r = ejecutarHerramienta(comp, cerca, entrada, ahora);
      return { ...r, resultado: `(la herramienta «${nombre}» no existe: apliqué «${cerca}»)\n${r.resultado}` };
    }
  }

  // el VIDEO DE REFERENCIA no se opera: cualquier herramienta que lo apunte
  // se rechaza con guía — es el fondo del preview, no una pieza de la pieza
  const objetivo = capaDe(input.capaId);
  if (objetivo?.tipo === "video") {
    return fallo(
      comp,
      `«${objetivo.nombre}» es un VIDEO DE REFERENCIA: solo guía del preview — no se anima, no se edita y no sale en el export. Componé las gráficas encima.`,
    );
  }

  switch (nombre) {
    case "ver_composicion": {
      const estilo = describirEstilo(estiloDePieza(comp));
      return { comp, resultado: estilo ? `${describir(comp)}\n\n${estilo}` : describir(comp) };
    }

    case "derivar_pantalla": {
      const reemplazosCrudos = Array.isArray(input.reemplazos) ? input.reemplazos : [];
      const reemplazos = reemplazosCrudos
        .filter((r): r is { capaId: string; texto: string } =>
          typeof r === "object" && r !== null && typeof (r as Record<string, unknown>).capaId === "string" && typeof (r as Record<string, unknown>).texto === "string",
        )
        .map((r) => ({ capaId: r.capaId, texto: r.texto }));
      if (reemplazos.length !== reemplazosCrudos.length) {
        return fallo(comp, "cada reemplazo es {capaId, texto} con ambos strings");
      }
      const res = derivarPantalla(
        comp,
        String(input.pantallaId ?? ""),
        {
          nombre: typeof input.nombre === "string" ? input.nombre : undefined,
          reemplazos,
          desdeMs: input.desdeMs === undefined ? undefined : clamp(numero(input.desdeMs, 0), 0, comp.duracion * 4),
        },
        marca,
      );
      if (!res.ok) return fallo(comp, res.error);
      const mapa = Object.entries(res.valor.renombres).map(([de, a]) => `${de}→${a}`).join(", ");
      return exito(
        res.valor.composicion,
        `pantalla derivada «${res.valor.pantallaId}» (${reemplazos.length} texto${reemplazos.length === 1 ? "" : "s"} reemplazado${reemplazos.length === 1 ? "" : "s"}, animación heredada${
          input.desdeMs ? `, corrida ${input.desdeMs}ms` : ""
        }). Ids nuevos: ${mapa}`,
      );
    }

    case "ajustar_composicion": {
      const nueva: Composicion = {
        ...comp,
        duracion: input.duracion === undefined ? comp.duracion : clamp(numero(input.duracion, comp.duracion), 500, 120000),
        fondo: typeof input.fondo === "string" ? input.fondo : comp.fondo,
        nombre: typeof input.nombre === "string" ? input.nombre : comp.nombre,
        // look stop-motion: 0 (o null) lo apaga y vuelve el movimiento suave
        fpsAnimacion:
          input.fpsAnimacion === undefined
            ? comp.fpsAnimacion
            : input.fpsAnimacion === null || numero(input.fpsAnimacion, 0) <= 0
              ? undefined
              : clamp(Math.round(numero(input.fpsAnimacion, 12)), 2, 60),
      };
      const conTamano =
        input.ancho !== undefined || input.alto !== undefined
          ? conFormato(nueva, numero(input.ancho, nueva.ancho), numero(input.alto, nueva.alto))
          : nueva;
      const cambioFormato = conTamano.ancho !== comp.ancho || conTamano.alto !== comp.alto;
      return exito(conTamano, `composición ajustada${nueva.fpsAnimacion !== comp.fpsAnimacion ? ` (animación a ${nueva.fpsAnimacion ?? "fps suaves"}${nueva.fpsAnimacion ? "fps" : ""})` : ""}${cambioFormato ? ` (formato ${conTamano.ancho}×${conTamano.alto})` : ""}`);
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

    case "transformar_texto": {
      const capa = capaDe(input.capaId);
      if (!capa) return fallo(comp, `no hay ninguna capa «${String(input.capaId)}»; ids: ${comp.capas.map((c) => c.id).join(", ")}`);
      if (capa.tipo !== "texto") return fallo(comp, `«${capa.nombre}» es ${capa.tipo}: transformar_texto solo cambia capas de TEXTO`);
      const textoNuevo = String(input.texto ?? "").trim();
      if (!textoNuevo) return fallo(comp, "falta el texto nuevo");
      const en = clamp(numero(input.en, 0), 0, comp.duracion);
      const dur = clamp(numero(input.duracion, 350), 100, 2000);
      // si el original está TODO en mayúsculas, el nuevo también (un CTA
      // no cambia de caja al transformarse)
      const textoFinal =
        /[A-ZÁÉÍÓÚÑ]/.test(capa.texto) && !/[a-záéíóúñ]/.test(capa.texto)
          ? textoNuevo.toUpperCase()
          : textoNuevo;
      // un texto MÁS LARGO desborda la caja del botón: el tamaño del clon se
      // achica por el cociente de caracteres visibles (nunca se agranda)
      const largoDe = (t2: string) => t2.replace(/\s/g, "").length || 1;
      const factorTamano = Math.min(1, largoDe(capa.texto) / largoDe(textoFinal));
      const tamanoClon = Math.round(capa.fuente.tamano * factorTamano * 10) / 10;
      // el CLON hereda TODO el estilo (tipografía, tamaño, color, alineación,
      // división) — los tramos no viajan (indexan caracteres del texto viejo)
      let idClon = `${capa.id}-swap`;
      let nClon = 2;
      while (comp.capas.some((c) => c.id === idClon)) idClon = `${capa.id}-swap${nClon++}`;
      const escal = capa.division !== "ninguna" ? { escalonado: escalonadoSano(capa.division) } : {};
      const clon: CapaTexto = {
        ...capa,
        id: idClon,
        nombre: `${capa.nombre} → ${textoFinal}`,
        texto: textoFinal,
        fuente: { ...capa.fuente, tamano: tamanoClon },
        tramos: undefined,
        pistas: undefined,
        v: undefined,
        entrada: { preset: "revelar", en, duracion: dur, easing: "salidaExpo", ...escal },
        salida: undefined,
      };
      const conSalida = editarCapa(comp, capa.id, {
        salida: { preset: "ocultarSubir", en, duracion: dur, easing: "entradaCubic", ...escal },
      }, marca);
      if (!conSalida.ok) return fallo(comp, conSalida.error);
      const agregada = agregarCapa(conSalida.valor, clon, marca);
      if (!agregada.ok) return fallo(comp, agregada.error);
      // el clon va JUSTO ENCIMA de la original (mismo lugar visual del stack)
      const sinClon = agregada.valor.capas.filter((c) => c.id !== idClon);
      const idx = sinClon.findIndex((c) => c.id === capa.id);
      sinClon.splice(idx + 1, 0, agregada.valor.capas.find((c) => c.id === idClon)!);
      return exito(
        { ...agregada.valor, capas: sinClon },
        `«${capa.nombre}» se transforma en «${textoFinal}» @${en}ms (estilo clonado${
          factorTamano < 1 ? `, tamaño ${capa.fuente.tamano}→${tamanoClon}px para no desbordar` : ""
        })`,
      );
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
      if (typeof input.oculta === "boolean") cambios.oculta = input.oculta || undefined;
      const pedidoDeTexto = SOLO_TEXTO.filter((k) => input[k] !== undefined);
      if (capa.tipo !== "texto" && pedidoDeTexto.length > 0) {
        // Gemini, con «hacé que entren palabra por palabra» sobre un raster:
        // editar_capa {division} falló seco («no vino ningún cambio
        // aplicable»), y su salida fue borrar la capa y recrearla como texto
        // plano — el diseño perdido. La causa tiene que ser legible.
        const que = capa.tipo === "media" ? "un RASTER (media) importado de Figma" : `una capa de tipo ${capa.tipo}`;
        return fallo(
          comp,
          `«${capa.nombre}» es ${que}: no es texto, no se puede dividir en palabras ni cambiarle la tipografía (${pedidoDeTexto.join(", ")}). ` +
            "Animala ENTERA con el preset que más se acerque (subirDesenfocado, desenfocarEntrada, revelar, o una pista de opacidad/desenfoque) y decí en tu resumen que para animarla palabra por palabra hay que exportarla como TEXTO desde Figma. " +
            "JAMÁS la quites para recrearla con agregar_capa_texto: se pierde el diseño. No se aplicó ningún cambio de este llamado: repetilo sin esas propiedades.",
        );
      }
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
        if (
          input.tamano !== undefined || input.peso !== undefined || typeof input.familia === "string" ||
          input.interlineado !== undefined || input.interletrado !== undefined
        ) {
          extra.fuente = {
            ...capa.fuente,
            tamano: input.tamano === undefined ? capa.fuente.tamano : clamp(numero(input.tamano, capa.fuente.tamano), 8, 600),
            peso: input.peso === undefined ? capa.fuente.peso : clamp(numero(input.peso, capa.fuente.peso), 100, 900),
            // cambiar de familia invalida el estilo exacto de la cara anterior
            ...(typeof input.familia === "string" && input.familia.trim()
              ? { familia: input.familia.trim(), estilo: undefined }
              : {}),
            ...(input.interlineado !== undefined
              ? { interlineado: clamp(numero(input.interlineado, capa.fuente.tamano * 1.15), 4, 2000) }
              : {}),
            ...(input.interletrado !== undefined
              ? { interletrado: clamp(numero(input.interletrado, 0), -200, 400) }
              : {}),
          };
        }
        if (input.alineacion === "izquierda" || input.alineacion === "centro" || input.alineacion === "derecha") {
          extra.alineacion = input.alineacion;
        }
      } else if (capa.tipo === "forma") {
        const extra = cambios as Partial<CapaForma>;
        if (typeof input.color === "string") extra.color = input.color;
        if (input.ancho !== undefined) extra.ancho = clamp(numero(input.ancho, capa.ancho), 1, comp.ancho * 4);
        if (input.alto !== undefined) extra.alto = clamp(numero(input.alto, capa.alto), 1, comp.alto * 4);
        if (input.radio !== undefined) extra.radio = clamp(numero(input.radio, capa.radio ?? 0), 0, 2000);
      } else if (capa.tipo === "media") {
        const extra = cambios as Partial<CapaMedia>;
        if (input.ancho !== undefined) extra.ancho = clamp(numero(input.ancho, capa.ancho), 1, comp.ancho * 4);
        if (input.alto !== undefined) extra.alto = clamp(numero(input.alto, capa.alto), 1, comp.alto * 4);
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

    case "estirar_letras": {
      const capa = capaDe(input.capaId);
      if (!capa) return fallo(comp, `no hay ninguna capa «${String(input.capaId)}»; ids: ${comp.capas.map((c) => c.id).join(", ")}`);
      if (capa.tipo !== "texto") {
        return fallo(comp, `«${capa.nombre}» es ${capa.tipo}: estirar_letras trabaja sobre capas de TEXTO. Para deformar un vector/logo entero usá editar_capa con escala (uniforme por ahora).`);
      }
      if (input.quitar === true) {
        const res = editarCapa(comp, capa.id, { deformaciones: undefined } as Partial<CapaTexto>, marca);
        return res.ok ? exito(res.valor, `estirados de «${capa.nombre}» quitados`) : fallo(comp, res.error);
      }
      const rango =
        typeof input.letras === "string" && input.letras
          ? rangoDeLetras(capa.texto, input.letras)
          : input.desde !== undefined && input.hasta !== undefined
            ? ([clamp(Math.round(numero(input.desde, 0)), 0, 9999), clamp(Math.round(numero(input.hasta, 0)), 0, 9999)] as [number, number])
            : null;
      if (!rango || rango[1] <= rango[0]) {
        return fallo(comp, `no encontré «${String(input.letras ?? "")}» en «${capa.texto}» (pasá letras, o desde/hasta sobre los caracteres sin espacios)`);
      }
      const escalaX = clamp(numero(input.escalaX, 1), 0.2, 8);
      const escalaY = clamp(numero(input.escalaY, 1), 0.2, 8);
      if (escalaX === 1 && escalaY === 1) return fallo(comp, "sin escalaX ni escalaY distintos de 1 no hay estirado que aplicar");
      // un estirado nuevo sobre el mismo rango REEMPLAZA al viejo
      const quedan = (capa.deformaciones ?? []).filter((d) => d.hasta <= rango[0] || d.desde >= rango[1]);
      const deformaciones = [
        ...quedan,
        { desde: rango[0], hasta: rango[1], escalaX: escalaX !== 1 ? escalaX : undefined, escalaY: escalaY !== 1 ? escalaY : undefined },
      ].sort((a, b) => a.desde - b.desde);
      const res = editarCapa(comp, capa.id, { deformaciones } as Partial<CapaTexto>, marca);
      return res.ok
        ? exito(res.valor, `letras ${rango[0]}-${rango[1]} de «${capa.nombre}» estiradas ×${escalaX}${escalaY !== escalaX ? `/${escalaY}` : ""}`)
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
      if (!["x", "y", "escala", "rotacion", "opacidad", "desenfoque", "trazoInicio", "trazoFin", "numero"].includes(propiedad)) {
        return fallo(comp, `propiedad «${propiedad}» no animable; usá x, y, escala, rotacion, opacidad, desenfoque, trazoInicio, trazoFin o numero`);
      }
      const esTrim = propiedad === "trazoInicio" || propiedad === "trazoFin";
      if (esTrim && capa.tipo !== "trazo") {
        return fallo(comp, `«${capa.nombre}» es ${capa.tipo}: trazoInicio/trazoFin sólo existen en capas de trazo`);
      }
      if (propiedad === "numero" && (capa.tipo !== "texto" || !/\d/.test(capa.texto))) {
        return fallo(comp, `«${capa.nombre}» no es un texto con una cifra: la pista «numero» reemplaza la PRIMERA cifra del contenido (ej «STOCK:171»)`);
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
      if (esCapaDelDiseno(comp, capa)) {
        // el diseño es del usuario: una capa importada no se borra para
        // «reemplazarla» (lo hizo Gemini con dos rasters del manifesto).
        // Si el usuario pidió sacarla, se oculta: es reversible.
        return fallo(
          comp,
          `«${capa.nombre}» es parte del diseño importado (pantalla «${capa.grupo ?? capa.id}»): el director no quita capas del diseño. ` +
            "Si querías cambiar cómo se anima, editá o animá ESA capa. Si es un raster y necesitás texto, decile al usuario que lo exporte como texto desde Figma. " +
            "Si el usuario pidió explícitamente sacarla, ocultala con editar_capa {oculta: true}.",
        );
      }
      const res = quitarCapa(comp, capa.id, marca);
      return res.ok ? exito(res.valor, `capa «${capa.nombre}» quitada`) : fallo(comp, res.error);
    }

    case "recorrer_encuadres": {
      const crudos = Array.isArray(input.tramos) ? (input.tramos as Record<string, unknown>[]) : [];
      const tramos: TramoDeEscena[] = crudos.map((t) => ({
        escena: typeof t.escena === "string" ? t.escena : numero(t.escena, 1),
        desde: numero(t.desde, 0),
        hasta: numero(t.hasta, comp.duracion),
      }));
      let temblorR: TemblorCamara | undefined;
      if (typeof input.temblor === "object" && input.temblor !== null) {
        const tb = input.temblor as Record<string, unknown>;
        if (tb.preset === "handheld" || tb.preset === "flotar" || tb.preset === "nervioso") {
          temblorR = { preset: tb.preset, intensidad: clamp(numero(tb.intensidad, 1), 0, 3), velocidad: clamp(numero(tb.velocidad, 1), 0.1, 4) };
        }
      }
      const res = camaraDeEncuadres(comp, tramos, {
        viajeMs: input.viajeMs === undefined ? undefined : numero(input.viajeMs, 1100),
        easing: easingValido(input.easing),
        temblor: temblorR,
      });
      if (!res.ok) return fallo(comp, res.error);
      const n = (res.camara.pistas.x?.length ?? 0);
      return exito({ ...comp, camara: res.camara }, `cámara por encuadres marcados: ${tramos.length} escenas, ${n} keyframes por canal${temblorR ? ` + temblor ${temblorR.preset}` : ""}`);
    }

    case "definir_camara": {
      const pistas: Camara["pistas"] = {};
      // el rango de la cámara es el del LIENZO (todas las pantallas, con un
      // render de aire alrededor), no el del render: con el clamp al doble
      // del render una landing de 3229 px no se podía encuadrar debajo de
      // y = 2160 y los viajes del director quedaban cortos en silencio
      const lienzo = rangoDelLienzo(comp);
      const canales = [
        { canal: "x" as const, min: lienzo.minX, max: lienzo.maxX },
        { canal: "y" as const, min: lienzo.minY, max: lienzo.maxY },
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
        if (b.x !== undefined) base.x = clamp(numero(b.x, comp.ancho / 2), lienzo.minX, lienzo.maxX);
        if (b.y !== undefined) base.y = clamp(numero(b.y, comp.alto / 2), lienzo.minY, lienzo.maxY);
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
      // el VIDEO DE REFERENCIA queda CLAVADO al fondo: el guard global no
      // alcanza (acá viaja una lista, no un capaId) y el reorden es la vía
      // por la que el director podría taparlo todo — se acepta el orden con
      // o sin sus ids, pero su posición no se negocia
      const referencia = comp.capas.filter((c) => c.tipo === "video");
      const idsReferencia = new Set(referencia.map((c) => c.id));
      const orden = input.orden.map(String).filter((id) => !idsReferencia.has(id));
      const idsActuales = comp.capas.filter((c) => c.tipo !== "video").map((c) => c.id).sort();
      if (JSON.stringify([...orden].sort()) !== JSON.stringify(idsActuales)) {
        return fallo(comp, `orden tiene que contener exactamente los ids actuales: ${idsActuales.join(", ")}`);
      }
      const porId = new Map(comp.capas.map((c) => [c.id, c]));
      return exito(
        { ...comp, capas: [...referencia, ...orden.map((id) => porId.get(id)!)] },
        `z-order actualizado${referencia.length ? " (el video de referencia sigue al fondo)" : ""}`,
      );
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
  easing: { type: "string", description: `uno de: ${Object.keys(EASINGS).join(", ")} — o CUALQUIER ease de GSAP: back.out(N) con el overshoot a medida, elastic.out(amp,periodo), bounce.out, steps(N), o una curva custom como path SVG (M0,0 C...)` },
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
    description: "Cambia duración total (ms), color de fondo, nombre, FORMATO del render (ancho/alto en px: 1920×1080 = 16:9, 1080×1920 = 9:16, 1080×1080 = 1:1 — es del proyecto, las pantallas del lienzo no cambian, la cámara encuadra) o fpsAnimacion de la composición. fpsAnimacion = look STOP-MOTION/dibujado a mano: cuantiza TODO el movimiento a esa grilla (12 = animar «en doses», 8 = más marcado); 0 lo apaga y vuelve el movimiento suave.",
    input_schema: {
      type: "object",
      properties: {
        duracion: { type: "number" },
        ancho: { type: "number", description: "ancho del render en px" },
        alto: { type: "number", description: "alto del render en px" },
        fondo: { type: "string", description: "color CSS, ej #0c0c11" },
        nombre: { type: "string" },
        fpsAnimacion: { type: "number", description: "fps del MOVIMIENTO (2-60; 12 = stop-motion clásico); 0 = apagar" },
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
    name: "transformar_texto",
    description: "El SWAP de texto de agencia (BUY NOW → SOLD OUT): clona la capa original con TODO su estilo (tipografía, tamaño, color, alineación, división), le pone el texto nuevo, y arma el intercambio completo — salida ocultarSubir en la original + entrada revelar en el clon, sincronizadas en «en». USALA SIEMPRE que un texto deba convertirse en otro: NUNCA agregues una capa de texto nueva para reemplazar una existente (pierde la tipografía). El «presionado» previo (pop de escala) agregalo aparte con definir_pista escala en la capa original.",
    input_schema: {
      type: "object",
      properties: {
        capaId: { type: "string", description: "la capa de texto original" },
        texto: { type: "string", description: "el texto nuevo (SOLD OUT)" },
        en: { type: "number", description: "ms donde ocurre el cambio" },
        duracion: { type: "number", description: "ms del cruce (default 350)" },
      },
      required: ["capaId", "texto", "en"],
    },
  },
  {
    name: "editar_capa",
    description: "Edita propiedades base de una capa existente: posición, escala (1 = 100%), rotación, opacidad (0-1), motionBlur (0-2), mezcla (normal, multiply, screen, overlay…), nombre, oculta (true la saca del render sin borrarla); en texto también texto (\\n = salto de línea), color, familia, tamano, peso, interlineado, interletrado, alineacion, division; en formas color, ancho, alto, radio; en media ancho, alto; en trazos color, grosor y el trim base trazoInicio/trazoFin (0-1). Es también tu herramienta de DISEÑO: respetá el ESTILO DE LA PIEZA.",
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
        oculta: { type: "boolean" },
        texto: { type: "string" },
        color: { type: "string" },
        tamano: { type: "number" },
        peso: { type: "number" },
        division: { type: "string", enum: ["ninguna", "caracteres", "palabras", "lineas"] },
        familia: { type: "string", description: "familia tipográfica (texto)" },
        interlineado: { type: "number", description: "alto de línea en px (texto)" },
        interletrado: { type: "number", description: "tracking en px (texto)" },
        alineacion: { type: "string", enum: ["izquierda", "centro", "derecha"] },
        ancho: { type: "number", description: "px (formas y media)" },
        alto: { type: "number", description: "px (formas y media)" },
        radio: { type: "number", description: "radio de esquinas en px (formas)" },
        grosor: { type: "number", description: "grosor del trazo en px (capas de trazo)" },
        trazoInicio: { type: "number", description: "trim base 0-1 (capas de trazo)" },
        trazoFin: { type: "number", description: "trim base 0-1 (capas de trazo)" },
      },
      additionalProperties: false,
      required: ["capaId"],
    },
  },
  {
    name: "derivar_pantalla",
    description: "DISEÑO: arma una PANTALLA NUEVA a partir de una existente, con el mismo estilo — clona la placa y todas sus capas al lado de la última pantalla del lienzo conservando estructura, tipografías, colores Y la animación (entradas/salidas/keyframes), y reemplaza los textos que le pases (un texto más largo achica el cuerpo para encajar; mayúsculas se respetan). pantallaId es el id de la PLACA (la capa «… (fondo)» marcada PLACA en el estado). Devuelve los ids nuevos (original→nuevo) para seguir editando lo derivado. desdeMs corre toda la animación de la nueva para que suceda después.",
    input_schema: {
      type: "object",
      properties: {
        pantallaId: { type: "string", description: "id de la placa de la pantalla de origen" },
        nombre: { type: "string", description: "nombre de la pantalla nueva" },
        reemplazos: {
          type: "array",
          description: "textos nuevos por capa de la pantalla ORIGINAL",
          items: {
            type: "object",
            properties: { capaId: { type: "string" }, texto: { type: "string" } },
            required: ["capaId", "texto"],
            additionalProperties: false,
          },
        },
        desdeMs: { type: "number", description: "ms que se corre la animación de la pantalla nueva (0 = misma línea de tiempo que la original)" },
      },
      additionalProperties: false,
      required: ["pantallaId"],
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
    name: "estirar_letras",
    description:
      "Estira LETRAS PUNTUALES de una capa de texto con escala no uniforme (la O ancha de un logo: escalaX 2 la duplica a lo ancho y empuja a las demás; escalaY estira hacia arriba desde la baseline). `letras` busca la PRIMERA aparición («O», «NOG»); alternativamente desde/hasta sobre los caracteres sin espacios. quitar=true borra todos los estirados de la capa.",
    input_schema: {
      type: "object",
      properties: {
        capaId: { type: "string" },
        letras: { type: "string", description: "la letra o subcadena a estirar (primera aparición, sin distinguir mayúsculas)" },
        desde: { type: "number" },
        hasta: { type: "number" },
        escalaX: { type: "number", description: "1 = normal, 2 = doble de ancho (0.2-8)" },
        escalaY: { type: "number", description: "1 = normal, 1.5 = 50% más alta (0.2-8)" },
        quitar: { type: "boolean" },
      },
      additionalProperties: false,
      required: ["capaId"],
    },
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
    description: "Define la pista COMPLETA de keyframes de una propiedad (reemplaza la anterior). Valores ABSOLUTOS que pisan la base: x/y en px, escala 1=100%, rotacion en grados, opacidad 0-1, desenfoque en px, numero = CONTADOR (en capas de texto con una cifra: el valor interpolado y redondeado reemplaza la PRIMERA cifra del contenido — «STOCK:171» con keyframes 171→0 baja en vivo; usalo con division ninguna y easing salidaExpo). El easing va en el keyframe de SALIDA del tramo; hold congela hasta el siguiente.",
    input_schema: {
      type: "object",
      properties: {
        capaId: { type: "string" },
        propiedad: { type: "string", enum: ["x", "y", "escala", "rotacion", "opacidad", "desenfoque", "trazoInicio", "trazoFin", "numero"] },
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
    description: "Elimina una capa que VOS agregaste. Las capas del diseño importado (placas y las capas de cada pantalla) no se quitan nunca: para sacar una del render usá editar_capa {oculta: true}; para cambiar cómo se anima, animá esa misma capa.",
    input_schema: {
      type: "object",
      properties: { capaId: { type: "string" } },
      additionalProperties: false,
      required: ["capaId"],
    },
  },
  {
    name: "recorrer_encuadres",
    description: "Construye la cámara ENTERA a partir de los ENCUADRES MARCADOS por el usuario (ver «ENCUADRES MARCADOS» en el estado): en cada tramo la cámara se queda quieta en esa escena y viaja a la siguiente durante viajeMs antes de que empiece, con el easing dado. Vos decidís los TIEMPOS de cada escena; la geometría (centro, zoom) ya está marcada. Si el estado trae encuadres marcados, la cámara se define SIEMPRE con esto y nunca con definir_camara.",
    input_schema: {
      type: "object",
      properties: {
        tramos: {
          type: "array",
          items: {
            type: "object",
            properties: {
              escena: { type: "number", description: "número de escena (1 = la primera marcada)" },
              desde: { type: "number", description: "ms en que la cámara ya está en esa escena" },
              hasta: { type: "number", description: "ms hasta el que se queda (el viaje a la siguiente arranca viajeMs antes de su desde)" },
            },
            required: ["escena", "desde", "hasta"],
            additionalProperties: false,
          },
        },
        viajeMs: { type: "number", description: "duración de cada viaje entre escenas (default 1100)" },
        easing: { type: "string", description: "easing de los viajes (default entradaSalidaCubic)" },
        temblor: { type: "object", properties: { preset: { type: "string", enum: ["handheld", "flotar", "nervioso"] }, intensidad: { type: "number" }, velocidad: { type: "number" } }, additionalProperties: false },
      },
      required: ["tramos"],
      additionalProperties: false,
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

/** Hasta dónde puede ir el centro de la cámara: la caja de TODO lo que hay
    en el lienzo (placas con su tamaño, capas por su ancla) más un render de
    aire por lado — y nunca menos que el render mismo. */
export function rangoDelLienzo(comp: Composicion): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = 0, minY = 0, maxX = comp.ancho, maxY = comp.alto;
  for (const c of comp.capas) {
    const caja = cajaAproximada(c);
    minX = Math.min(minX, caja.x1); maxX = Math.max(maxX, caja.x2);
    minY = Math.min(minY, caja.y1); maxY = Math.max(maxY, caja.y2);
  }
  return { minX: minX - comp.ancho, maxX: maxX + comp.ancho, minY: minY - comp.alto, maxY: maxY + comp.alto };
}

export function catalogoParaPrompt(): string {
  const porCategoria = CATEGORIAS.map((cat) => {
    const nombres = Object.entries(PRESETS)
      .filter(([, def]) => def.categoria === cat.id)
      .map(([nombre, def]) => `${nombre} (${def.clase})`)
      .join(", ");
    return `- ${cat.nombre}: ${nombres}`;
  }).join("\n");
  return `Presets disponibles, por categoría:\n${porCategoria}\n\nEasings disponibles: ${Object.keys(EASINGS).join(", ")} — y ADEMAS cualquier ease de GSAP como string: back.out(N), elastic.out(amp,periodo), bounce.out/in, steps(N), expo.inOut, o una curva custom como path SVG. Destacados: ${EASINGS_GSAP_DESTACADOS.join(", ")}`;
}
