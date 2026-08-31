/* -----------------------------------------------------------------------------
   La MÁSCARA del revelado viaja a AE — la parte PURA

   El motor recorta cada unidad a su caja de reposo (presets con `recorte`:
   revelar/ocultar y familia). En AE eso se reconstruye con una MASK real,
   con una regla de oro: la mask vive en el ESPACIO DE LA CAPA, así que el
   viaje del revelado no puede ir en la Position de la capa (la mask
   viajaría con él y no recortaría nada). Por eso:

   - TEXTO: el viaje va en el Text Animator (Position) y la mask queda
     quieta abajo. Un texto MULTILÍNEA se parte en UNA CAPA POR RENGLÓN —
     el idioma clásico del motionero — porque las masks de varios renglones
     en una sola capa se unen (modo Add) y un renglón viajando se vería a
     través de la caja del vecino.
   - FORMA/VECTOR/TRAZO: la mask es la caja de la capa (± margen del borde,
     el mismo rect de `recortarACaja`) y el viaje va en la Position del
     GRUPO de shapes (el transform propio del grupo): la capa y su mask no
     se mueven.
   - La VENTANA: como en el motor, la mask solo recorta mientras esconde
     algo (la entrada hasta que su última unidad terminó, la salida desde
     que arranca) — hold keys en el Mask Path; en reposo se agranda y no
     corta descendentes ni florituras.

   MEDIA con recorte queda ANOTADA en el comentario (pendiente): su encaje
   «cubrir» ya usa la mask del footage y componer las dos no es fiel barato.
----------------------------------------------------------------------------- */

import type { Capa, CapaTexto, Pistas, Segmento } from "@/lib/motion/modelo";
import { compilarSegmento } from "@/lib/motion/presets-puro";
import { delaysEscalonado } from "@/lib/motion/keyframes-puro";
import { altoUnidad } from "@/lib/motion/evaluar-puro";
import { contarUnidades } from "@/lib/motion/animadores-ae-puro";

export const esRecorte = (seg?: Segmento): boolean =>
  Boolean(seg && compilarSegmento(seg).recorte);

/** ¿La capa tiene un revelado con máscara TRADUCIBLE a AE? (media no:
    queda anotada en el comentario, como hasta ahora) */
export function tieneRecorteAE(capa: Capa): boolean {
  if (capa.oculta || capa.tipo === "media") return false;
  return esRecorte(capa.entrada) || esRecorte(capa.salida);
}

export type VentanaMascara = { t: number; caja: boolean };

/** Cuándo la mask RECORTA (caja) y cuándo se agranda (libre) — la ventana
    del motor: la entrada recorta hasta que su ÚLTIMA unidad terminó, la
    salida desde que arranca. Tiempos en ms; una lista de un solo punto es
    un valor estático. */
export function ventanasMascara(capa: Capa): VentanaMascara[] {
  const n = capa.tipo === "texto" ? contarUnidades(capa.texto, capa.division) : 1;
  const entrada = esRecorte(capa.entrada) ? capa.entrada : undefined;
  const salida = esRecorte(capa.salida) ? capa.salida : undefined;
  const finEntrada = entrada
    ? entrada.en + (entrada.escalonado ?? 0) * Math.max(0, n - 1) + entrada.duracion
    : null;
  const inicioSalida = salida ? salida.en : null;
  if (finEntrada !== null && inicioSalida !== null) {
    if (finEntrada >= inicioSalida) return [{ t: 0, caja: true }];
    return [
      { t: 0, caja: true },
      { t: finEntrada, caja: false },
      { t: inicioSalida, caja: true },
    ];
  }
  if (finEntrada !== null) return [{ t: 0, caja: true }, { t: finEntrada, caja: false }];
  if (inicioSalida !== null) return [{ t: 0, caja: false }, { t: inicioSalida, caja: true }];
  return [];
}

/** La caja del recorte de una capa NO texto, centrada en el ancla — el
    mismo rect de `recortarACaja` del motor (la caja de la capa más el
    margen del grosor del borde). */
export function cajaMascara(capa: Capa): { x1: number; y1: number; x2: number; y2: number } | null {
  if (capa.tipo === "texto" || capa.tipo === "media") return null;
  const margen =
    capa.tipo === "trazo" ? capa.grosor / 2
    : capa.tipo === "vector" ? (capa.trazoGrosor ?? 0) / 2
    : 0;
  return {
    x1: -capa.ancho / 2 - margen,
    y1: -capa.alto / 2 - margen,
    x2: capa.ancho / 2 + margen,
    y2: capa.alto / 2 + margen,
  };
}

/** La geometría del recorte de un renglón de texto, relativa a la BASELINE
    (que es el y=0 de una capa de texto de AE): el mismo rect que pinta el
    motor — generoso a los costados, y en vertical el glifo completo (nunca
    menos que 1.2× el cuerpo). El ancho lo mide el script en AE con
    sourceRectAtTime, con la fuente real ya fijada. */
export function mascaraTexto(capa: CapaTexto): { padX: number; arriba: number; alto: number } {
  const tamano = capa.fuente.tamano;
  return { padX: tamano * 0.25, arriba: -tamano * 0.85, alto: altoUnidad(capa) };
}

/** Los instantes (ms) para MEDIR el ancho del renglón en AE — momentos de
    reposo: después de que la entrada terminó (los animators ya no corren
    nada), antes de la salida; sin entrada, el 0 sirve (una salida todavía
    no desplazó nada). Con CONTADOR («pistas.numero») el texto sigue
    cambiando después de esa medición: si la salida vuelve a recortar, se
    mide también en su arranque y el script se queda con la UNIÓN — el
    motor re-mide cada frame, acá con dos instantes alcanza para que la
    caja nunca quede angosta. */
export function instantesMedicion(capa: CapaTexto): number[] {
  const n = contarUnidades(capa.texto, capa.division);
  const reposo = capa.entrada
    ? capa.entrada.en + (capa.entrada.escalonado ?? 0) * Math.max(0, n - 1) + capa.entrada.duracion + 1
    : 0;
  const lista = [reposo];
  if (capa.pistas?.numero?.length && capa.salida && esRecorte(capa.salida)) {
    lista.push(capa.salida.en);
  }
  return lista;
}

/** La pseudo-capa con SOLO los segmentos de recorte, parada en el origen:
    horneada da el viaje puro del revelado (dx=0, dy del preset) — las
    claves de Position para el transform del GRUPO de shapes. */
export function soloRecorte(capa: Capa): Capa {
  return {
    ...capa,
    x: 0,
    y: 0,
    escala: 1,
    rotacion: 0,
    opacidad: 1,
    motionBlur: 0,
    pistas: undefined,
    entrada: esRecorte(capa.entrada) ? capa.entrada : undefined,
    salida: esRecorte(capa.salida) ? capa.salida : undefined,
  };
}

/** La capa sin sus segmentos de recorte (que viajaron por el grupo o el
    animator): lo que queda sigue el camino de siempre. */
export function sinRecorte<C extends Capa>(capa: C): C {
  return {
    ...capa,
    entrada: esRecorte(capa.entrada) ? undefined : capa.entrada,
    salida: esRecorte(capa.salida) ? undefined : capa.salida,
  };
}

export type LineaAE = { capa: CapaTexto; desplazarY: number };

const tintaDe = (s: string) => s.replace(/\s/g, "").length;

/**
 * Un texto con revelado, partido en UNA CAPA POR RENGLÓN para AE (con un
 * solo renglón devuelve la misma capa, lista igual). Cada línea sale con:
 * - su texto y su `desplazarY` (el corrimiento del ancla al centro del
 *   bloque, como el desplazarY del export);
 * - división «ninguna» NORMALIZADA a «lineas»: el viaje tiene que ir en el
 *   animator (no en la Position de la capa) para que la mask quede quieta —
 *   y con un renglón por capa son equivalentes exactos;
 * - el TIMING corrido: para división «lineas» cada capa lleva el delay
 *   EXACTO de su renglón (orden inicio/fin/centro/bordes/azar incluidos —
 *   acá no hay selector que degrade) y escalonado 0; para caracteres/
 *   palabras, el `en` corre por las unidades de los renglones previos y el
 *   escalonado sigue vivo adentro del animator de la línea;
 * - tramos y deformaciones RE-INDEXADOS al renglón (índices sobre tinta);
 * - la pista «numero» solo en el renglón que lleva la primera cifra.
 * Renglones vacíos no generan capa (no hay nada que pintar).
 */
export function capasPorLinea(capa: CapaTexto): LineaAE[] {
  const lineas = capa.texto.split("\n");
  const interlineado = capa.fuente.interlineado ?? capa.fuente.tamano * 1.15;
  const division = capa.division === "ninguna" ? "lineas" : capa.division;
  if (lineas.length === 1) return [{ capa: { ...capa, division }, desplazarY: 0 }];

  const delaysDe = (seg: Segmento | undefined): number[] | null => {
    if (!seg) return null;
    if (capa.division === "ninguna") return lineas.map(() => 0);
    if (capa.division === "lineas") {
      return delaysEscalonado(lineas.length, seg.escalonado ?? 0, seg.ordenEscalonado ?? "inicio");
    }
    return null; // caracteres/palabras: corre por unidades previas
  };
  const delaysEntrada = delaysDe(capa.entrada);
  const delaysSalida = delaysDe(capa.salida);
  const indiceCifra = capa.texto.search(/\d/);

  const resultado: LineaAE[] = [];
  let unidadesPrevias = 0; // caracteres o palabras de los renglones previos
  let tintaPrevia = 0; // caracteres no blancos (los índices de tramos/deformaciones)
  let caracteresPrevios = 0; // en el string entero (para ubicar la cifra)
  for (let i = 0; i < lineas.length; i++) {
    const texto = lineas[i];
    const tinta = tintaDe(texto);
    const corrimiento = (seg: Segmento, delays: number[] | null): Segmento =>
      delays
        ? { ...seg, en: seg.en + delays[i], escalonado: 0, ordenEscalonado: undefined }
        : { ...seg, en: seg.en + unidadesPrevias * (seg.escalonado ?? 0) };
    const reindexar = <R extends { desde: number; hasta: number }>(rangos: R[] | undefined): R[] | undefined => {
      const propios = (rangos ?? [])
        .map((r) => ({
          ...r,
          desde: Math.max(0, r.desde - tintaPrevia),
          hasta: Math.min(tinta, r.hasta - tintaPrevia),
        }))
        .filter((r) => r.hasta > r.desde);
      return propios.length ? propios : undefined;
    };
    const llevaCifra = indiceCifra >= caracteresPrevios && indiceCifra < caracteresPrevios + texto.length;
    let pistas: Pistas | undefined = capa.pistas;
    if (pistas?.numero && !llevaCifra) {
      pistas = { ...pistas };
      delete pistas.numero;
    }
    if (texto.trim() !== "") {
      resultado.push({
        capa: {
          ...capa,
          id: `${capa.id}.l${i + 1}`,
          nombre: `${capa.nombre} . linea ${i + 1}`,
          texto,
          division,
          entrada: capa.entrada ? corrimiento(capa.entrada, delaysEntrada) : undefined,
          salida: capa.salida ? corrimiento(capa.salida, delaysSalida) : undefined,
          tramos: reindexar(capa.tramos),
          deformaciones: reindexar(capa.deformaciones),
          pistas,
        },
        desplazarY: ((lineas.length - 1) / 2 - i) * interlineado,
      });
    }
    unidadesPrevias += division === "lineas" ? 1 : contarUnidades(texto, division);
    tintaPrevia += tinta;
    caracteresPrevios += texto.length + 1; // el \n
  }
  return resultado;
}
