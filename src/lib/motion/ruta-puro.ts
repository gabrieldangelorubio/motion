/* -----------------------------------------------------------------------------
   Rutas SVG → bezier de After Effects (la pieza clave de «vectores de verdad»)

   El path de un Shape de AE es: vértices + tangentes de entrada/salida
   RELATIVAS a cada vértice + cerrado. Este módulo convierte el `d` de un
   path SVG (lo que Figma da en vectorPaths/fillGeometry) a ese formato,
   subpath por subpath. Con esto un vector de Figma llega a AE como shape
   layer EDITABLE — nada de rasterizar. (Técnica de referencia: AEUX, Apache
   2.0 — reescrita de cero acá: parser completo con relativos, S/T
   reflejados y cuadráticas elevadas a cúbicas, que al original le faltaban.)

   Números adentro, números afuera — testeable en node.
----------------------------------------------------------------------------- */

export type SubRutaAE = {
  /** vértices en las coordenadas del path (las de Figma: 0,0 = sup-izq) */
  puntos: [number, number][];
  /** tangente de ENTRADA de cada vértice, relativa al vértice (formato AE) */
  tanEntrada: [number, number][];
  /** tangente de SALIDA de cada vértice, relativa al vértice */
  tanSalida: [number, number][];
  cerrada: boolean;
};

type Punto = [number, number];

/** Parsea el `d` de un path SVG a subrutas con bezier absolutas.
    Soporta M/L/H/V/C/S/Q/T/Z (mayúsculas y minúsculas); las cuadráticas
    (Q/T) se ELEVAN a cúbicas exactas; un arco (A) degrada a línea recta
    hasta su punto final — Figma no emite arcos, pero degradar > romper. */
export function subrutasDeSvg(d: string): SubRutaAE[] {
  const crudos = tokenizar(d);
  const subrutas: SubRutaAE[] = [];

  // estado del subpath en curso: puntos absolutos + CONTROLES absolutos
  let pts: Punto[] = [];
  let ctrlIn: (Punto | null)[] = [];  // control del tramo que LLEGA al vértice
  let ctrlOut: (Punto | null)[] = []; // control del tramo que SALE del vértice
  let actual: Punto = [0, 0];
  let inicio: Punto = [0, 0];
  // reflejos de S (cúbica) y T (cuadrática)
  let ultimoCtrlC: Punto | null = null;
  let ultimoCtrlQ: Punto | null = null;

  const cerrarSubruta = (cerrada: boolean) => {
    if (pts.length === 0) return;
    // Z con el último punto clavado sobre el primero: fusionar — el vértice
    // inicial hereda la tangente de entrada del duplicado (AE cierra solo)
    if (cerrada && pts.length > 1) {
      const primero = pts[0];
      const ultimo = pts[pts.length - 1];
      if (Math.abs(primero[0] - ultimo[0]) < 1e-6 && Math.abs(primero[1] - ultimo[1]) < 1e-6) {
        ctrlIn[0] = ctrlIn[pts.length - 1];
        pts.pop();
        ctrlIn.pop();
        ctrlOut.pop();
      }
    }
    // un solo punto no dibuja nada (y es lo que deja un path basura): afuera
    if (pts.length > 1) {
      subrutas.push({
        puntos: pts.map((p) => [p[0], p[1]]),
        tanEntrada: pts.map((p, i) => relativa(ctrlIn[i], p)),
        tanSalida: pts.map((p, i) => relativa(ctrlOut[i], p)),
        cerrada,
      });
    }
    pts = [];
    ctrlIn = [];
    ctrlOut = [];
  };

  let i = 0;
  let comando = "";
  while (i < crudos.length) {
    const t = crudos[i];
    if (typeof t === "string") {
      comando = t;
      i++;
      // Z no consume números
      if (comando === "Z" || comando === "z") {
        cerrarSubruta(true);
        actual = [inicio[0], inicio[1]];
        ultimoCtrlC = ultimoCtrlQ = null;
        continue;
      }
    } else if (comando === "") {
      // números antes de todo comando: path inválido — devolver lo parseado
      break;
    } else if (comando === "M") {
      comando = "L"; // pares extra tras un moveto son lineto implícitos
    } else if (comando === "m") {
      comando = "l";
    }

    const rel = comando === comando.toLowerCase();
    const base: Punto = rel ? actual : [0, 0];
    const n = (): number => {
      const v = crudos[i++];
      return typeof v === "number" ? v : 0;
    };
    const punto = (): Punto => [base[0] + n(), base[1] + n()];
    // un comando de dibujo sin moveto previo es un path inválido: se ignora
    // (los números igual se consumen para no desincronizar el parseo)
    const empujar = (p: Punto, cIn: Punto | null) => {
      if (pts.length === 0) return;
      pts.push(p);
      ctrlIn.push(cIn);
      ctrlOut.push(null);
    };

    switch (comando.toUpperCase()) {
      case "M": {
        cerrarSubruta(false);
        actual = punto();
        inicio = [actual[0], actual[1]];
        pts.push(actual);
        ctrlIn.push(null);
        ctrlOut.push(null);
        ultimoCtrlC = ultimoCtrlQ = null;
        break;
      }
      case "L": {
        actual = punto();
        empujar(actual, null);
        ultimoCtrlC = ultimoCtrlQ = null;
        break;
      }
      case "H": {
        actual = [base[0] + n(), actual[1]];
        empujar(actual, null);
        ultimoCtrlC = ultimoCtrlQ = null;
        break;
      }
      case "V": {
        actual = [actual[0], base[1] + n()];
        empujar(actual, null);
        ultimoCtrlC = ultimoCtrlQ = null;
        break;
      }
      case "C": {
        const c1 = punto();
        const c2 = punto();
        const p = punto();
        if (ctrlOut.length > 0) ctrlOut[ctrlOut.length - 1] = c1;
        empujar(p, c2);
        actual = p;
        ultimoCtrlC = c2;
        ultimoCtrlQ = null;
        break;
      }
      case "S": {
        // el primer control es el REFLEJO del último control cúbico sobre el
        // punto actual; sin cúbica previa, el punto actual mismo
        const c1: Punto = ultimoCtrlC
          ? [2 * actual[0] - ultimoCtrlC[0], 2 * actual[1] - ultimoCtrlC[1]]
          : [actual[0], actual[1]];
        const c2 = punto();
        const p = punto();
        if (ctrlOut.length > 0) ctrlOut[ctrlOut.length - 1] = c1;
        empujar(p, c2);
        actual = p;
        ultimoCtrlC = c2;
        ultimoCtrlQ = null;
        break;
      }
      case "Q":
      case "T": {
        // cuadrática → cúbica EXACTA: c1 = P0 + ⅔(Q−P0), c2 = P1 + ⅔(Q−P1)
        let q: Punto;
        if (comando.toUpperCase() === "Q") {
          q = punto();
        } else {
          q = ultimoCtrlQ
            ? [2 * actual[0] - ultimoCtrlQ[0], 2 * actual[1] - ultimoCtrlQ[1]]
            : [actual[0], actual[1]];
        }
        const p = punto();
        const c1: Punto = [actual[0] + (2 / 3) * (q[0] - actual[0]), actual[1] + (2 / 3) * (q[1] - actual[1])];
        const c2: Punto = [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])];
        if (ctrlOut.length > 0) ctrlOut[ctrlOut.length - 1] = c1;
        empujar(p, c2);
        actual = p;
        ultimoCtrlQ = q;
        ultimoCtrlC = null;
        break;
      }
      case "A": {
        // 7 parámetros; los 2 últimos son el punto final. Degradar a línea.
        n(); n(); n(); n(); n();
        actual = punto();
        empujar(actual, null);
        ultimoCtrlC = ultimoCtrlQ = null;
        break;
      }
      default: {
        // comando desconocido: saltear el número y seguir — degradar
        i++;
      }
    }
  }
  cerrarSubruta(false);
  return subrutas;
}

function relativa(ctrl: Punto | null, punto: Punto): Punto {
  return ctrl ? [ctrl[0] - punto[0], ctrl[1] - punto[1]] : [0, 0];
}

/** Tokens del `d`: comandos como string, números como number (con notación
    científica, signos pegados y comas — «5-3» son dos números). */
function tokenizar(d: string): (string | number)[] {
  const tokens: (string | number)[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    if (m[1]) tokens.push(m[1]);
    else tokens.push(parseFloat(m[2]));
  }
  return tokens;
}

/** Corre TODOS los vértices de las subrutas por un offset (p.ej. −ancho/2,
    −alto/2 para centrarlas en el ancla de la capa). Puro: devuelve copias. */
export function desplazarSubrutas(subrutas: SubRutaAE[], dx: number, dy: number): SubRutaAE[] {
  return subrutas.map((s) => ({
    ...s,
    puntos: s.puntos.map(([x, y]) => [x + dx, y + dy] as [number, number]),
    tanEntrada: s.tanEntrada.map((t) => [...t] as [number, number]),
    tanSalida: s.tanSalida.map((t) => [...t] as [number, number]),
  }));
}
