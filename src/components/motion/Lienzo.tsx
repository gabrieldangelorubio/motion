"use client";

/* -----------------------------------------------------------------------------
   Lienzo del editor — canvas + cámara, al estilo de los otros dos lienzos

   La cámara NO vive en setState: vive en un ref y el loop del Editor pide
   pintar por frame (§8.3 del kit, «cómo hacen 60 fps»). El wheel es un
   listener nativo con passive:false: sin ⌘ panea, con ⌘ hace zoom AL
   CURSOR componiendo sobre la cámara objetivo. El chrome del canvas (fondo,
   marco) lee los tokens con getComputedStyle y se repinta al cambiar la
   clase de <html> (§3.5) — el próximo pintar del loop ya usa el color nuevo.
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
  type Camara,
} from "@/lib/motion/camara-puro";

export type ControlLienzo = {
  pintarAhora: (t: number) => void;
  encuadrar: () => void;
  escalaUno: () => void;
};

export const Lienzo = forwardRef<ControlLienzo, { obtenerComposicion: () => Composicion }>(
  function Lienzo({ obtenerComposicion }, ref) {
    const contRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const camRef = useRef<Camara>({ x: 0, y: 0, escala: 0.4 });
    const tokensRef = useRef({ chrome: "#18191e", linea: "rgba(255,255,255,0.14)" });
    const arrastreRef = useRef<{ px: number; py: number } | null>(null);

    const leerTokens = () => {
      const estilos = getComputedStyle(document.documentElement);
      tokensRef.current = {
        chrome: estilos.getPropertyValue("--chrome-bg").trim() || "#18191e",
        linea: "color-mix(in oklab, " + (estilos.getPropertyValue("--foreground").trim() || "#e8e8ee") + " 14%, transparent)",
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
          camRef.current = camaraConZoom(
            camRef.current,
            factor,
            e.clientX - rect.left,
            e.clientY - rect.top,
          );
        } else {
          const { dx, dy } = interpretarWheel(e);
          camRef.current = { ...camRef.current, x: camRef.current.x - dx, y: camRef.current.y - dy };
        }
      };
      cont.addEventListener("wheel", alRodar, { passive: false });
      return () => cont.removeEventListener("wheel", alRodar);
    }, []);

    return (
      <div ref={contRef} className="relative h-full w-full overflow-hidden" style={{ touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          onPointerDown={(e) => {
            arrastreRef.current = { px: e.clientX, py: e.clientY };
          }}
          onPointerMove={(e) => {
            const a = arrastreRef.current;
            if (!a) return;
            camRef.current = {
              ...camRef.current,
              x: camRef.current.x + (e.clientX - a.px),
              y: camRef.current.y + (e.clientY - a.py),
            };
            arrastreRef.current = { px: e.clientX, py: e.clientY };
          }}
          onPointerUp={() => (arrastreRef.current = null)}
          onPointerLeave={() => (arrastreRef.current = null)}
        />
      </div>
    );
  },
);
