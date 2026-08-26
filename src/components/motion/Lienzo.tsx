"use client";

/* -----------------------------------------------------------------------------
   Lienzo del editor — canvas + cámara + selección y drag con snapping

   La cámara NO vive en setState: vive en un ref y el loop del Editor pide
   pintar por frame (§8.3 del kit). Wheel nativo con passive:false: sin ⌘
   panea, con ⌘ zoom AL CURSOR sobre la cámara objetivo. Un drag que arranca
   SOBRE una capa la mueve (umbral 4px → checkpoint de undo, un gesto = un
   paso; Shift = eje dominante; ⌘ = sin snapping); sobre el vacío, panea, y
   un click seco deselecciona. El snapping usa el algoritmo canónico
   (snap-puro) con umbral 8px de pantalla y guías azules a 1px constante.
   El chrome del canvas lee los tokens y se repinta al cambiar el tema (§3.5).
----------------------------------------------------------------------------- */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Composicion } from "@/lib/motion/modelo";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { pintar, type Contexto2D, type FuentesDeMedia } from "@/lib/motion/pintar";
import {
  camaraConZoom,
  camaraQueEncuadra,
  interpretarWheel,
  esRuedaDiscreta,
  factorDeRueda,
  factorDePinch,
  pantallaAMundo,
  type Camara,
} from "@/lib/motion/camara-puro";
import { cajaLocalDeCapa, cajaMundoDeCapa, capaEnPunto, type MedirTexto } from "@/lib/motion/cajas-puro";
import { snapArrastre, type Guia } from "@/lib/motion/snap-puro";
import { CAMARA_ID } from "@/lib/motion/herramientas-puro";

const UMBRAL_DRAG_CAPA = 4; // px de pantalla, como el AdiosJam
const UMBRAL_SNAP = 8; // px de pantalla (÷ escala al aplicar)

export type ControlLienzo = {
  pintarAhora: (t: number) => void;
  encuadrar: () => void;
  escalaUno: () => void;
  /** encuadre actual del viewport en coordenadas de la composición (para el modo cámara) */
  vistaActual: () => { x: number; y: number; zoom: number } | null;
};

export const Lienzo = forwardRef<
  ControlLienzo,
  {
    obtenerComposicion: () => Composicion;
    obtenerSeleccionId: () => string | null;
    obtenerMedia?: () => FuentesDeMedia;
    /** píxeles de render por píxel CSS del preview (0.5 = borrador, dpr = nítido). NO afecta el export. */
    obtenerCalidad?: () => number;
    /** tiempo actual de la composición (para resolver el encuadre de cámara en gestos) */
    obtenerTiempo?: () => number;
    onSeleccionar: (id: string | null) => void;
    onCheckpoint: () => void;
    onMoverCapa: (id: string, x: number, y: number) => void;
    /** arrastre del encuadre con la cámara seleccionada: centro nuevo en px del lienzo */
    onMoverCamara?: (x: number, y: number) => void;
  }
>(function Lienzo({ obtenerComposicion, obtenerSeleccionId, obtenerMedia, obtenerCalidad, obtenerTiempo, onSeleccionar, onCheckpoint, onMoverCapa, onMoverCamara }, ref) {
  const contRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camara>({ x: 0, y: 0, escala: 0.4 });
  const tokensRef = useRef({ chrome: "#18191e", linea: "rgba(255,255,255,0.14)", acento: "#0005ff" });
  const panRef = useRef<{ px: number; py: number; movio: boolean } | null>(null);
  const guiasRef = useRef<Guia[]>([]);
  const medidorRef = useRef<CanvasRenderingContext2D | null>(null);

  const medir: MedirTexto = (texto, font) => {
    if (!medidorRef.current) {
      medidorRef.current = document.createElement("canvas").getContext("2d");
    }
    const m = medidorRef.current;
    if (!m) return 0;
    m.font = font;
    return m.measureText(texto).width;
  };

  const leerTokens = () => {
    const estilos = getComputedStyle(document.documentElement);
    tokensRef.current = {
      chrome: estilos.getPropertyValue("--chrome-bg").trim() || "#18191e",
      linea: "color-mix(in oklab, " + (estilos.getPropertyValue("--foreground").trim() || "#e8e8ee") + " 14%, transparent)",
      acento: estilos.getPropertyValue("--acento").trim() || "#0005ff",
    };
  };

  const pintarAhora = (t: number) => {
    const canvas = canvasRef.current;
    const cont = contRef.current;
    if (!canvas || !cont) return;
    // calidad de preview al estilo Half/Quarter de AE: menos píxeles de
    // render, mismo tamaño CSS (el browser re-escala). El export no pasa
    // por acá: siempre sale a la resolución completa de la composición.
    const factor = obtenerCalidad?.() ?? (window.devicePixelRatio || 1);
    const ancho = cont.clientWidth;
    const alto = cont.clientHeight;
    if (canvas.width !== Math.round(ancho * factor) || canvas.height !== Math.round(alto * factor)) {
      canvas.width = Math.round(ancho * factor);
      canvas.height = Math.round(alto * factor);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const comp = obtenerComposicion();
    const cam = camRef.current;

    ctx.setTransform(factor, 0, 0, factor, 0, 0);
    ctx.fillStyle = tokensRef.current.chrome;
    ctx.fillRect(0, 0, ancho, alto);
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.escala, cam.escala);
    // El lienzo muestra el MUNDO: acá la cámara de la composición no
    // transforma (el export sí la aplica). En su lugar se dibuja el
    // ENCUADRE — el render es exactamente lo que cae adentro.
    const estado = estadoEn(comp, t);
    pintar(
      { ...estado, camara: { x: comp.ancho / 2, y: comp.alto / 2, zoom: 1 } },
      ctx as unknown as Contexto2D,
      obtenerMedia?.() ?? {},
    );

    const vista = estado.camara;
    const vw = comp.ancho / vista.zoom;
    const vh = comp.alto / vista.zoom;
    const camaraSeleccionada = obtenerSeleccionId() === CAMARA_ID;
    ctx.strokeStyle = camaraSeleccionada ? tokensRef.current.acento : tokensRef.current.linea;
    ctx.lineWidth = (camaraSeleccionada ? 2 : 1) / cam.escala;
    ctx.strokeRect(vista.x - vw / 2, vista.y - vh / 2, vw, vh);

    // marco de selección: borde azul de 2px constantes, rotando con la capa (§3.1)
    const seleccionId = obtenerSeleccionId();
    const capa = seleccionId ? comp.capas.find((c) => c.id === seleccionId) : null;
    if (capa && !capa.oculta) {
      const caja = cajaLocalDeCapa(capa, medir);
      const escalaCapa = capa.escala ?? 1;
      ctx.save();
      ctx.translate(capa.x, capa.y);
      if (capa.rotacion) ctx.rotate((capa.rotacion * Math.PI) / 180);
      if (escalaCapa !== 1) ctx.scale(escalaCapa, escalaCapa);
      ctx.strokeStyle = tokensRef.current.acento;
      ctx.lineWidth = 2 / (cam.escala * escalaCapa);
      ctx.strokeRect(caja.x, caja.y, caja.w, caja.h);
      ctx.restore();
    }

    // guías de snapping: línea azul a 1px constante, a lo largo del frame
    if (guiasRef.current.length) {
      ctx.strokeStyle = tokensRef.current.acento;
      ctx.lineWidth = 1 / cam.escala;
      for (const guia of guiasRef.current) {
        ctx.beginPath();
        if (guia.eje === "x") {
          ctx.moveTo(guia.pos, -80);
          ctx.lineTo(guia.pos, comp.alto + 80);
        } else {
          ctx.moveTo(-80, guia.pos);
          ctx.lineTo(comp.ancho + 80, guia.pos);
        }
        ctx.stroke();
      }
    }
  };

  const encuadrar = () => {
    const cont = contRef.current;
    if (!cont) return;
    const comp = obtenerComposicion();
    // encuadra TODO el contenido del canvas (las pantallas pueden vivir
    // fuera del frame de render), no sólo el rectángulo de la composición
    let x0 = 0, y0 = 0, x1 = comp.ancho, y1 = comp.alto;
    for (const capa of comp.capas) {
      if (capa.oculta) continue;
      const caja = cajaMundoDeCapa(capa, medir);
      x0 = Math.min(x0, caja.x);
      y0 = Math.min(y0, caja.y);
      x1 = Math.max(x1, caja.x + caja.w);
      y1 = Math.max(y1, caja.y + caja.h);
    }
    camRef.current = camaraQueEncuadra(
      { x: x0, y: y0, w: x1 - x0, h: y1 - y0 },
      { left: 0, top: 0, width: cont.clientWidth, height: cont.clientHeight },
      { margen: 60 },
    );
  };

  useImperativeHandle(ref, () => ({
    pintarAhora,
    encuadrar,
    escalaUno: () => {
      const cont = contRef.current;
      if (!cont) return;
      const comp = obtenerComposicion();
      camRef.current = {
        escala: 1,
        x: (cont.clientWidth - comp.ancho) / 2,
        y: (cont.clientHeight - comp.alto) / 2,
      };
    },
    vistaActual: () => {
      const cont = contRef.current;
      if (!cont || cont.clientWidth === 0) return null;
      const cam = camRef.current;
      const comp = obtenerComposicion();
      return {
        // centro del viewport llevado a coordenadas del lienzo de la composición
        x: (cont.clientWidth / 2 - cam.x) / cam.escala,
        y: (cont.clientHeight / 2 - cam.y) / cam.escala,
        // zoom 1 = el ancho de la composición ocupa exactamente el viewport
        zoom: (comp.ancho * cam.escala) / cont.clientWidth,
      };
    },
  }));

  useEffect(() => {
    leerTokens();
    encuadrar();
    const observador = new MutationObserver(leerTokens);
    observador.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observador.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    const alRodar = (e: WheelEvent) => {
      e.preventDefault();
      const rect = cont.getBoundingClientRect();
      if (e.metaKey || e.ctrlKey) {
        const factor = esRuedaDiscreta(e.deltaY)
          ? factorDeRueda(e.deltaY < 0 ? 1 : -1)
          : factorDePinch(e.deltaY);
        camRef.current = camaraConZoom(camRef.current, factor, e.clientX - rect.left, e.clientY - rect.top);
      } else {
        const { dx, dy } = interpretarWheel(e);
        camRef.current = { ...camRef.current, x: camRef.current.x - dx, y: camRef.current.y - dy };
      }
    };
    cont.addEventListener("wheel", alRodar, { passive: false });
    return () => cont.removeEventListener("wheel", alRodar);
  }, []);

  const alBajarPuntero = (e: React.PointerEvent) => {
    const cont = contRef.current;
    if (!cont) return;
    const rect = cont.getBoundingClientRect();
    const comp = obtenerComposicion();

    // Con la cámara seleccionada, arrastrar mueve el ENCUADRE (con auto-key
    // arriba, en el Editor); un click seco vuelve a la selección normal.
    if (obtenerSeleccionId() === CAMARA_ID && onMoverCamara) {
      const vistaCam = estadoEn(comp, obtenerTiempo?.() ?? 0).camara;
      const gestoCam = { x0: e.clientX, y0: e.clientY, camX0: vistaCam.x, camY0: vistaCam.y, activo: false };
      const alMoverCam = (ev: PointerEvent) => {
        const dxP = ev.clientX - gestoCam.x0;
        const dyP = ev.clientY - gestoCam.y0;
        if (!gestoCam.activo) {
          if (Math.abs(dxP) + Math.abs(dyP) < UMBRAL_DRAG_CAPA) return;
          gestoCam.activo = true;
          onCheckpoint();
        }
        const esc = camRef.current.escala;
        onMoverCamara(gestoCam.camX0 + dxP / esc, gestoCam.camY0 + dyP / esc);
      };
      const alSoltarCam = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", alMoverCam);
        window.removeEventListener("pointerup", alSoltarCam);
        if (!gestoCam.activo) {
          const punto = pantallaAMundo(ev.clientX, ev.clientY, rect, camRef.current);
          const capa = capaEnPunto(comp.capas, medir, punto.x, punto.y);
          onSeleccionar(capa ? capa.id : null);
        }
      };
      window.addEventListener("pointermove", alMoverCam);
      window.addEventListener("pointerup", alSoltarCam);
      return;
    }

    const punto = pantallaAMundo(e.clientX, e.clientY, rect, camRef.current);
    const capa = capaEnPunto(comp.capas, medir, punto.x, punto.y);

    if (!capa) {
      // vacío: pan; un click seco deselecciona al soltar
      panRef.current = { px: e.clientX, py: e.clientY, movio: false };
      const alMover = (ev: PointerEvent) => {
        const p = panRef.current;
        if (!p) return;
        if (Math.abs(ev.clientX - p.px) + Math.abs(ev.clientY - p.py) > 2) p.movio = true;
        camRef.current = {
          ...camRef.current,
          x: camRef.current.x + (ev.clientX - p.px),
          y: camRef.current.y + (ev.clientY - p.py),
        };
        panRef.current = { px: ev.clientX, py: ev.clientY, movio: p.movio };
      };
      const alSoltar = () => {
        if (panRef.current && !panRef.current.movio) onSeleccionar(null);
        panRef.current = null;
        window.removeEventListener("pointermove", alMover);
        window.removeEventListener("pointerup", alSoltar);
      };
      window.addEventListener("pointermove", alMover);
      window.addEventListener("pointerup", alSoltar);
      return;
    }

    onSeleccionar(capa.id);
    if (capa.bloqueada) return; // seleccionable, no movible (§8.3)

    const gesto = { x0: e.clientX, y0: e.clientY, capaX0: capa.x, capaY0: capa.y, activo: false };
    const alMover = (ev: PointerEvent) => {
      const dxP = ev.clientX - gesto.x0;
      const dyP = ev.clientY - gesto.y0;
      if (!gesto.activo) {
        if (Math.abs(dxP) + Math.abs(dyP) < UMBRAL_DRAG_CAPA) return;
        gesto.activo = true;
        onCheckpoint(); // el checkpoint recién al cruzar el umbral (§8.3)
      }
      const escala = camRef.current.escala;
      let dx = dxP / escala;
      let dy = dyP / escala;
      if (ev.shiftKey) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let nx = gesto.capaX0 + dx;
      let ny = gesto.capaY0 + dy;

      if (!ev.metaKey && !ev.ctrlKey) {
        const compAhora = obtenerComposicion();
        const capaAhora = compAhora.capas.find((c) => c.id === capa.id);
        if (capaAhora) {
          const movida = cajaMundoDeCapa({ ...capaAhora, x: nx, y: ny }, medir);
          const otras = compAhora.capas
            .filter((c) => c.id !== capa.id && !c.oculta)
            .map((c) => cajaMundoDeCapa(c, medir));
          // el frame de la composición también es un imán
          otras.push({ x: 0, y: 0, w: compAhora.ancho, h: compAhora.alto });
          const snap = snapArrastre(movida, otras, UMBRAL_SNAP / escala);
          nx += snap.dx;
          ny += snap.dy;
          guiasRef.current = snap.guias;
        }
      } else {
        guiasRef.current = [];
      }
      onMoverCapa(capa.id, nx, ny);
    };
    const alSoltar = () => {
      guiasRef.current = [];
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
  };

  return (
    <div ref={contRef} className="relative h-full w-full overflow-hidden" style={{ touchAction: "none" }}>
      <canvas ref={canvasRef} className="block h-full w-full" onPointerDown={alBajarPuntero} />
    </div>
  );
});
