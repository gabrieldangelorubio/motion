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
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
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

const UMBRAL_DRAG_CAPA = 4; // px de pantalla, como el AdiosJam
const UMBRAL_SNAP = 8; // px de pantalla (÷ escala al aplicar)

export type ControlLienzo = {
  pintarAhora: (t: number) => void;
  encuadrar: () => void;
  escalaUno: () => void;
};

export const Lienzo = forwardRef<
  ControlLienzo,
  {
    obtenerComposicion: () => Composicion;
    obtenerSeleccionId: () => string | null;
    onSeleccionar: (id: string | null) => void;
    onCheckpoint: () => void;
    onMoverCapa: (id: string, x: number, y: number) => void;
  }
>(function Lienzo({ obtenerComposicion, obtenerSeleccionId, onSeleccionar, onCheckpoint, onMoverCapa }, ref) {
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
    const dpr = window.devicePixelRatio || 1;
    const ancho = cont.clientWidth;
    const alto = cont.clientHeight;
    if (canvas.width !== ancho * dpr || canvas.height !== alto * dpr) {
      canvas.width = ancho * dpr;
      canvas.height = alto * dpr;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const comp = obtenerComposicion();
    const cam = camRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = tokensRef.current.chrome;
    ctx.fillRect(0, 0, ancho, alto);
    ctx.translate(cam.x, cam.y);
    ctx.scale(cam.escala, cam.escala);
    pintar(estadoEn(comp, t), ctx as unknown as Contexto2D);

    // marco del frame, a 1px constante en pantalla
    ctx.strokeStyle = tokensRef.current.linea;
    ctx.lineWidth = 1 / cam.escala;
    ctx.strokeRect(0, 0, comp.ancho, comp.alto);

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
    camRef.current = camaraQueEncuadra(
      { x: 0, y: 0, w: comp.ancho, h: comp.alto },
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
