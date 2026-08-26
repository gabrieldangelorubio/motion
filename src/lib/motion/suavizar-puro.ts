/* -----------------------------------------------------------------------------
   suavizarGrabacion — de una grabación de cámara cruda a keyframes editables

   El modo cámara graba lo que el usuario hace con el viewport (~15 muestras
   por segundo de centro y zoom). Eso crudo tiembla: la mano no es una grúa.
   Acá se convierte en pistas de keyframes en dos pasos, ambos puros:

   1. media móvil (~350 ms de ventana): mata el temblor y las micro-pausas,
      conservando la intención del gesto (a dónde fue, cuán rápido);
   2. reducción de keyframes (Ramer–Douglas–Peucker por canal, desviación
      vertical): de cientos de muestras quedan los puntos donde la curva
      realmente cambia — y esos puntos son los que el usuario después edita.

   Los tramos quedan LINEALES a propósito: la suavidad ya está en la media
   móvil, y un easing con frenada en cada keyframe haría «bombear» un paneo
   continuo. La tolerancia garantiza que la polilínea no se aparta de la
   curva suave más que unos px: los vértices no se perciben.
----------------------------------------------------------------------------- */

import type { Camara, Keyframe } from "@/lib/motion/modelo";

export type MuestraCamara = { t: number; x: number; y: number; zoom: number };

export type OpcionesSuavizado = {
  /** ventana de la media móvil, ms */
  ventanaMs?: number;
  /** desviación máxima admitida al reducir x/y, px del lienzo */
  toleranciaPx?: number;
  /** desviación máxima admitida al reducir el zoom */
  toleranciaZoom?: number;
};

function mediaMovil(muestras: MuestraCamara[], ventanaMs: number): MuestraCamara[] {
  const medio = ventanaMs / 2;
  const suaves = muestras.map((m) => {
    let x = 0, y = 0, zoom = 0, n = 0;
    for (const otra of muestras) {
      if (Math.abs(otra.t - m.t) > medio) continue;
      x += otra.x; y += otra.y; zoom += otra.zoom; n++;
    }
    return { t: m.t, x: x / n, y: y / n, zoom: zoom / n };
  });
  // En los bordes la ventana es asimétrica y la media se sesga hacia adentro:
  // los extremos quedan CRUDOS — la toma arranca y termina exactamente donde
  // el usuario encuadró, que es lo que más se nota.
  suaves[0] = { ...muestras[0] };
  suaves[suaves.length - 1] = { ...muestras[muestras.length - 1] };
  return suaves;
}

/** RDP con desviación VERTICAL (serie temporal): índices de los puntos que quedan. */
function reducir(puntos: { t: number; v: number }[], tolerancia: number): number[] {
  const conservar = new Set<number>([0, puntos.length - 1]);
  const paso = (desde: number, hasta: number) => {
    if (hasta - desde < 2) return;
    const a = puntos[desde];
    const b = puntos[hasta];
    let peor = -1;
    let peorDesvio = tolerancia;
    for (let i = desde + 1; i < hasta; i++) {
      const p = puntos[i];
      const f = b.t === a.t ? 0 : (p.t - a.t) / (b.t - a.t);
      const desvio = Math.abs(p.v - (a.v + (b.v - a.v) * f));
      if (desvio > peorDesvio) {
        peorDesvio = desvio;
        peor = i;
      }
    }
    if (peor >= 0) {
      conservar.add(peor);
      paso(desde, peor);
      paso(peor, hasta);
    }
  };
  paso(0, puntos.length - 1);
  return [...conservar].sort((a, b) => a - b);
}

function aPista(muestras: MuestraCamara[], canal: "x" | "y" | "zoom", tolerancia: number): Keyframe[] {
  const puntos = muestras.map((m) => ({ t: Math.round(m.t), v: m[canal] }));
  const indices = reducir(puntos, tolerancia);
  const redondeo = canal === "zoom" ? 1000 : 10;
  return indices.map((i) => ({
    t: puntos[i].t,
    v: Math.round(puntos[i].v * redondeo) / redondeo,
  }));
}

/**
 * Grabación cruda → cámara con pistas de keyframes. Devuelve null si no hay
 * material suficiente (menos de 2 muestras: no hay movimiento que suavizar).
 * Si un canal quedó constante (dentro de la tolerancia) su pista se omite:
 * grabar sólo un zoom no ensucia x/y con keyframes redundantes.
 */
export function suavizarGrabacion(
  muestras: MuestraCamara[],
  opts: OpcionesSuavizado = {},
): Camara | null {
  if (muestras.length < 2) return null;
  const ordenadas = [...muestras].sort((a, b) => a.t - b.t);
  const suaves = mediaMovil(ordenadas, opts.ventanaMs ?? 350);

  const pistas: Camara["pistas"] = {};
  const canales: { canal: "x" | "y" | "zoom"; tolerancia: number }[] = [
    { canal: "x", tolerancia: opts.toleranciaPx ?? 4 },
    { canal: "y", tolerancia: opts.toleranciaPx ?? 4 },
    { canal: "zoom", tolerancia: opts.toleranciaZoom ?? 0.01 },
  ];
  for (const { canal, tolerancia } of canales) {
    const pista = aPista(suaves, canal, tolerancia);
    const constante = pista.every((k) => Math.abs(k.v - pista[0].v) <= tolerancia);
    if (!constante) pistas[canal] = pista;
  }
  if (!pistas.x && !pistas.y && !pistas.zoom) return null;
  return { pistas };
}
