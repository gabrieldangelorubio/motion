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
import { camaraEn } from "@/lib/motion/evaluar-puro";
import { estadoVivo } from "@/lib/motion/motor-gsap";
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
  /** encuadra el FRAME de render (0,0,ancho,alto) — para entrar a la vista cámara */
  encuadrarRender: () => void;
  /** encuadre actual del viewport en coordenadas de la composición (para el modo cámara) */
  vistaActual: () => { x: number; y: number; zoom: number } | null;
};

export const Lienzo = forwardRef<
  ControlLienzo,
  {
    obtenerComposicion: () => Composicion;
    obtenerSeleccionId: () => string | null;
    /** todas las capas seleccionadas (la primaria incluida) */
    obtenerSeleccionIds?: () => string[];
    obtenerMedia?: () => FuentesDeMedia;
    /** píxeles de render por píxel CSS del preview (0.5 = borrador, dpr = nítido). NO afecta el export. */
    obtenerCalidad?: () => number;
    /** tiempo actual de la composición (para resolver el encuadre de cámara en gestos) */
    obtenerTiempo?: () => number;
    /** mundo = canvas con el encuadre dibujado · camara = lo que ve la cámara
        (arrastrar ENCUADRA, con auto-key) · ambas = mundo + PiP de la cámara */
    obtenerVista?: () => "mundo" | "camara" | "ambas";
    /** avisa qué tecla de cámara quedó sostenida (X = posición, Z = zoom) — para el chip del Editor */
    onTeclaCamara?: (herramienta: "posicion" | "zoom" | null) => void;
    onSeleccionar: (id: string | null) => void;
    /** shift+click: suma o saca la capa de la selección múltiple */
    onAlternarSeleccion?: (id: string) => void;
    /** marquee: el rectángulo seleccionó estas capas */
    onSeleccionarVarias?: (ids: string[]) => void;
    onCheckpoint: () => void;
    onMoverCapa: (id: string, x: number, y: number) => void;
    /** posiciones absolutas para varias capas (drag de una pantalla entera) */
    onMoverCapas?: (posiciones: { id: string; x: number; y: number }[]) => void;
    /** arrastre del encuadre con la cámara seleccionada: centro nuevo en px del lienzo */
    onMoverCamara?: (x: number, y: number) => void;
    /** herramienta Z: zoom nuevo del encuadre (drag horizontal) */
    onZoomCamara?: (zoom: number) => void;
  }
>(function Lienzo({ obtenerComposicion, obtenerSeleccionId, obtenerSeleccionIds, obtenerMedia, obtenerCalidad, obtenerTiempo, obtenerVista, onTeclaCamara, onSeleccionar, onAlternarSeleccion, onSeleccionarVarias, onCheckpoint, onMoverCapa, onMoverCapas, onMoverCamara, onZoomCamara }, ref) {
  const contRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<Camara>({ x: 0, y: 0, escala: 0.4 });
  const tokensRef = useRef({ chrome: "#18191e", linea: "rgba(255,255,255,0.14)", acento: "#0005ff" });
  const guiasRef = useRef<Guia[]>([]);
  const marqueeRef = useRef<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
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
    const estado = estadoVivo(comp, t);
    const vistaModo = obtenerVista?.() ?? "mundo";

    // Vista cámara: el preview del RENDER — la transformación de cámara se
    // aplica y todo se recorta al frame, igual que en el export. Acá también
    // se ENCUADRA: arrastrar mueve la cámara (auto-key arriba, en el Editor).
    if (vistaModo === "camara") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, comp.ancho, comp.alto);
      ctx.clip();
      pintar(estado, ctx as unknown as Contexto2D, obtenerMedia?.() ?? {});
      ctx.restore();
      ctx.strokeStyle = tokensRef.current.linea;
      ctx.lineWidth = 1 / cam.escala;
      ctx.strokeRect(0, 0, comp.ancho, comp.alto);
      return;
    }

    // El lienzo muestra el MUNDO: acá la cámara de la composición no
    // transforma (el export sí la aplica). En su lugar se dibuja el
    // ENCUADRE — el render es exactamente lo que cae adentro.
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

    // marco de selección: borde azul de 2px constantes, rotando con la capa
    // (§3.1); con selección múltiple, un marco por capa elegida
    const seleccionId = obtenerSeleccionId();
    const idsSeleccion = obtenerSeleccionIds?.() ?? (seleccionId ? [seleccionId] : []);
    for (const id of idsSeleccion) {
      const capa = comp.capas.find((c) => c.id === id);
      if (!capa || capa.oculta) continue;
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

    // marquee de selección múltiple: rectángulo acento con velo suave
    const marquee = marqueeRef.current;
    if (marquee) {
      const mx = Math.min(marquee.x0, marquee.x1);
      const my = Math.min(marquee.y0, marquee.y1);
      const mw = Math.abs(marquee.x1 - marquee.x0);
      const mh = Math.abs(marquee.y1 - marquee.y0);
      ctx.save();
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = tokensRef.current.acento;
      ctx.fillRect(mx, my, mw, mh);
      ctx.restore();
      ctx.strokeStyle = tokensRef.current.acento;
      ctx.lineWidth = 1 / cam.escala;
      ctx.strokeRect(mx, my, mw, mh);
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

    // Vista «ambas»: además del mundo con su encuadre, un PiP con LO QUE VE
    // la cámara, abajo a la derecha, en espacio de pantalla (el viewport no
    // lo mueve). El mismo pintar() del export, en chiquito.
    if (vistaModo === "ambas") {
      ctx.setTransform(factor, 0, 0, factor, 0, 0);
      const margen = 12;
      const pipW = Math.max(180, ancho * 0.26);
      const pipH = pipW * (comp.alto / comp.ancho);
      const px = ancho - pipW - margen;
      const py = alto - pipH - margen;
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pipW, pipH);
      ctx.clip();
      ctx.translate(px, py);
      const s = pipW / comp.ancho;
      ctx.scale(s, s);
      pintar(estado, ctx as unknown as Contexto2D, obtenerMedia?.() ?? {});
      ctx.restore();
      ctx.strokeStyle = tokensRef.current.acento;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pipW - 1, pipH - 1);
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
    encuadrarRender: () => {
      const cont = contRef.current;
      if (!cont) return;
      const comp = obtenerComposicion();
      camRef.current = camaraQueEncuadra(
        { x: 0, y: 0, w: comp.ancho, h: comp.alto },
        { left: 0, top: 0, width: cont.clientWidth, height: cont.clientHeight },
        { margen: 40 },
      );
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

  // ——— Teclas de cámara SOSTENIDAS (estilo AE): mientras mantenés X, el
  // mouse mueve la cámara sin apretar ningún botón; mientras mantenés Z,
  // mover el mouse en vertical la hace entrar (arriba) y salir (abajo).
  // Soltás la tecla y el gesto termina. Cada movimiento pasa por
  // onMoverCamara/onZoomCamara, que arriba dejan keyframe en el playhead.
  const sostenidaRef = useRef<{
    tecla: "x" | "z";
    tiene: boolean; // ya vimos la primera posición del mouse (origen)
    ultX: number;
    ultY: number;
    camX: number;
    camY: number;
    zoom: number;
    activo: boolean; // hubo movimiento real → checkpoint hecho
  } | null>(null);

  useEffect(() => {
    const enInput = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const alApretar = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key !== "x" && e.key !== "z") return;
      if (enInput()) return;
      const modoCamara = obtenerSeleccionId() === CAMARA_ID || (obtenerVista?.() ?? "mundo") === "camara";
      if (!modoCamara || !onMoverCamara) return;
      const cam = camaraEn(obtenerComposicion(), obtenerTiempo?.() ?? 0);
      sostenidaRef.current = { tecla: e.key, tiene: false, ultX: 0, ultY: 0, camX: cam.x, camY: cam.y, zoom: cam.zoom, activo: false };
      onTeclaCamara?.(e.key === "z" ? "zoom" : "posicion");
    };
    const alMoverMouse = (e: MouseEvent) => {
      const s = sostenidaRef.current;
      if (!s) return;
      if (!s.tiene) {
        s.tiene = true;
        s.ultX = e.clientX;
        s.ultY = e.clientY;
        return;
      }
      const dx = e.clientX - s.ultX;
      const dy = e.clientY - s.ultY;
      s.ultX = e.clientX;
      s.ultY = e.clientY;
      if (!dx && !dy) return;
      if (!s.activo) {
        s.activo = true;
        onCheckpoint(); // el gesto entero (apretar→soltar) es UN paso de undo
      }
      if (s.tecla === "z") {
        s.zoom = Math.min(10, Math.max(0.1, s.zoom * Math.exp(-dy * 0.004)));
        onZoomCamara?.(s.zoom);
        return;
      }
      // la cámara SIGUE al mouse: el delta de pantalla llevado a mundo (en
      // la vista cámara el mundo se ve escalado además por el zoom actual)
      const esc = camRef.current.escala * ((obtenerVista?.() ?? "mundo") === "camara" ? s.zoom : 1);
      s.camX += dx / esc;
      s.camY += dy / esc;
      onMoverCamara?.(s.camX, s.camY);
    };
    const soltar = () => {
      if (!sostenidaRef.current) return;
      sostenidaRef.current = null;
      onTeclaCamara?.(null);
    };
    const alSoltarTecla = (e: KeyboardEvent) => {
      if (sostenidaRef.current && e.key === sostenidaRef.current.tecla) soltar();
    };
    window.addEventListener("keydown", alApretar);
    window.addEventListener("keyup", alSoltarTecla);
    window.addEventListener("mousemove", alMoverMouse);
    window.addEventListener("blur", soltar);
    return () => {
      window.removeEventListener("keydown", alApretar);
      window.removeEventListener("keyup", alSoltarTecla);
      window.removeEventListener("mousemove", alMoverMouse);
      window.removeEventListener("blur", soltar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMoverCamara, onZoomCamara, onCheckpoint, onTeclaCamara]);

  const alBajarPuntero = (e: React.PointerEvent) => {
    // con una tecla de cámara sostenida el mouse YA está moviendo la cámara:
    // un drag encima duplicaría el gesto
    if (sostenidaRef.current) return;
    const cont = contRef.current;
    if (!cont) return;
    const rect = cont.getBoundingClientRect();
    const comp = obtenerComposicion();

    // En vista cámara arrastrar ENCUADRA: movés la imagen como quien acomoda
    // una foto (el contenido sigue al puntero, la cámara va al revés).
    // Auto-key arriba, como todo gesto.
    if ((obtenerVista?.() ?? "mundo") === "camara") {
      if (!onMoverCamara) return;
      const vistaCam = camaraEn(comp, obtenerTiempo?.() ?? 0);
      const gestoVista = { x0: e.clientX, y0: e.clientY, camX0: vistaCam.x, camY0: vistaCam.y, zoom0: vistaCam.zoom, activo: false };
      const alMoverVista = (ev: PointerEvent) => {
        const dxP = ev.clientX - gestoVista.x0;
        const dyP = ev.clientY - gestoVista.y0;
        if (!gestoVista.activo) {
          if (Math.abs(dxP) + Math.abs(dyP) < UMBRAL_DRAG_CAPA) return;
          gestoVista.activo = true;
          onCheckpoint();
        }
        // en la vista, el mundo está escalado por (viewport × zoom de cámara)
        const esc = camRef.current.escala * gestoVista.zoom0;
        onMoverCamara(gestoVista.camX0 - dxP / esc, gestoVista.camY0 - dyP / esc);
      };
      const alSoltarVista = () => {
        window.removeEventListener("pointermove", alMoverVista);
        window.removeEventListener("pointerup", alSoltarVista);
      };
      window.addEventListener("pointermove", alMoverVista);
      window.addEventListener("pointerup", alSoltarVista);
      return;
    }

    // Con la cámara seleccionada, arrastrar mueve el ENCUADRE (con auto-key
    // arriba, en el Editor); un click seco vuelve a la selección normal.
    if (obtenerSeleccionId() === CAMARA_ID && onMoverCamara) {
      const vistaCam = camaraEn(comp, obtenerTiempo?.() ?? 0);
      const gestoCam = { x0: e.clientX, y0: e.clientY, camX0: vistaCam.x, camY0: vistaCam.y, zoom0: vistaCam.zoom, activo: false };
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

    // MARQUEE de selección múltiple: arrastrás y el rectángulo elige; un
    // click seco hace lo que diga el caller (deseleccionar o elegir la placa)
    const iniciarMarquee = (alClickSeco: () => void) => {
      const origen = { x: e.clientX, y: e.clientY, movio: false };
      const alMover = (ev: PointerEvent) => {
        if (Math.abs(ev.clientX - origen.x) + Math.abs(ev.clientY - origen.y) > 3) origen.movio = true;
        if (!origen.movio) return;
        const hasta = pantallaAMundo(ev.clientX, ev.clientY, rect, camRef.current);
        marqueeRef.current = { x0: punto.x, y0: punto.y, x1: hasta.x, y1: hasta.y };
      };
      const alSoltar = () => {
        window.removeEventListener("pointermove", alMover);
        window.removeEventListener("pointerup", alSoltar);
        const marquee = marqueeRef.current;
        marqueeRef.current = null;
        if (!origen.movio || !marquee) {
          alClickSeco();
          return;
        }
        const mx0 = Math.min(marquee.x0, marquee.x1);
        const my0 = Math.min(marquee.y0, marquee.y1);
        const mx1 = Math.max(marquee.x0, marquee.x1);
        const my1 = Math.max(marquee.y0, marquee.y1);
        const compAhora = obtenerComposicion();
        const ids = compAhora.capas
          .filter((c) => {
            if (c.oculta) return false;
            const caja = cajaMundoDeCapa(c, medir);
            // una PLACA (la manija de su pantalla) entra sólo si el marquee
            // la encierra ENTERA: un marquee adentro del frame selecciona
            // las capas, no la pantalla (borrar la placa borra la pantalla)
            if (c.grupo === c.id)
              return caja.x >= mx0 && caja.y >= my0 && caja.x + caja.w <= mx1 && caja.y + caja.h <= my1;
            return caja.x < mx1 && caja.x + caja.w > mx0 && caja.y < my1 && caja.y + caja.h > my0;
          })
          .map((c) => c.id);
        if (ids.length && onSeleccionarVarias) onSeleccionarVarias(ids);
        else alClickSeco();
      };
      window.addEventListener("pointermove", alMover);
      window.addEventListener("pointerup", alSoltar);
    };

    if (!capa) {
      // vacío: marquee (el pan queda en la rueda); click seco deselecciona
      iniciarMarquee(() => onSeleccionar(null));
      return;
    }

    // shift+click sobre una capa: entra o sale de la selección múltiple
    if (e.shiftKey && onAlternarSeleccion) {
      onAlternarSeleccion(capa.id);
      return;
    }

    // sobre la PLACA de una pantalla que NO está seleccionada, arrastrar
    // también hace marquee: seleccionás varias capas ADENTRO del frame sin
    // mover la pantalla (la pantalla se mueve arrastrando la placa ya
    // elegida); el click seco elige la placa como siempre
    if (
      capa.grupo === capa.id &&
      obtenerSeleccionId() !== capa.id &&
      !(obtenerSeleccionIds?.() ?? []).includes(capa.id)
    ) {
      iniciarMarquee(() => onSeleccionar(capa.id));
      return;
    }

    // arrastre con selección MÚLTIPLE que incluye a la capa agarrada: se
    // mueven todas juntas (posiciones absolutas desde los orígenes)
    const idsMulti = obtenerSeleccionIds?.() ?? [];
    if (idsMulti.length > 1 && idsMulti.includes(capa.id) && onMoverCapas && !capa.bloqueada) {
      const miembros = comp.capas
        .filter((c) => idsMulti.includes(c.id) && !c.bloqueada)
        .map((c) => ({ id: c.id, x0: c.x, y0: c.y }));
      const gestoMulti = { x0: e.clientX, y0: e.clientY, activo: false };
      const alMoverMulti = (ev: PointerEvent) => {
        const dxP = ev.clientX - gestoMulti.x0;
        const dyP = ev.clientY - gestoMulti.y0;
        if (!gestoMulti.activo) {
          if (Math.abs(dxP) + Math.abs(dyP) < UMBRAL_DRAG_CAPA) return;
          gestoMulti.activo = true;
          onCheckpoint();
        }
        const escala = camRef.current.escala;
        let dx = dxP / escala;
        let dy = dyP / escala;
        if (ev.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        onMoverCapas(miembros.map((m) => ({ id: m.id, x: m.x0 + dx, y: m.y0 + dy })));
      };
      const alSoltarMulti = () => {
        window.removeEventListener("pointermove", alMoverMulti);
        window.removeEventListener("pointerup", alSoltarMulti);
        // click seco sobre una ya seleccionada: colapsa a esa sola
        if (!gestoMulti.activo) onSeleccionar(capa.id);
      };
      window.addEventListener("pointermove", alMoverMulti);
      window.addEventListener("pointerup", alSoltarMulti);
      return;
    }

    onSeleccionar(capa.id);
    if (capa.bloqueada) return; // seleccionable, no movible (§8.3)

    // La placa de fondo es la manija de su pantalla: arrastrarla mueve el
    // grupo ENTERO (posiciones absolutas desde los orígenes, sin acumular
    // error). El snap usa la caja de la placa contra lo que no es del grupo.
    if (capa.grupo && capa.grupo === capa.id && onMoverCapas) {
      const miembros = comp.capas
        .filter((c) => c.grupo === capa.grupo)
        .map((c) => ({ id: c.id, x0: c.x, y0: c.y }));
      const gestoGrupo = { x0: e.clientX, y0: e.clientY, activo: false };
      const alMoverGrupo = (ev: PointerEvent) => {
        const dxP = ev.clientX - gestoGrupo.x0;
        const dyP = ev.clientY - gestoGrupo.y0;
        if (!gestoGrupo.activo) {
          if (Math.abs(dxP) + Math.abs(dyP) < UMBRAL_DRAG_CAPA) return;
          gestoGrupo.activo = true;
          onCheckpoint();
        }
        const escala = camRef.current.escala;
        let dx = dxP / escala;
        let dy = dyP / escala;
        if (ev.shiftKey) {
          if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        if (!ev.metaKey && !ev.ctrlKey) {
          const compAhora = obtenerComposicion();
          const movida = cajaMundoDeCapa({ ...capa, x: capa.x + dx, y: capa.y + dy }, medir);
          const otras = compAhora.capas
            .filter((c) => c.grupo !== capa.grupo && !c.oculta)
            .map((c) => cajaMundoDeCapa(c, medir));
          otras.push({ x: 0, y: 0, w: compAhora.ancho, h: compAhora.alto });
          const snap = snapArrastre(movida, otras, UMBRAL_SNAP / escala);
          dx += snap.dx;
          dy += snap.dy;
          guiasRef.current = snap.guias;
        } else {
          guiasRef.current = [];
        }
        onMoverCapas(miembros.map((m) => ({ id: m.id, x: m.x0 + dx, y: m.y0 + dy })));
      };
      const alSoltarGrupo = () => {
        guiasRef.current = [];
        window.removeEventListener("pointermove", alMoverGrupo);
        window.removeEventListener("pointerup", alSoltarGrupo);
      };
      window.addEventListener("pointermove", alMoverGrupo);
      window.addEventListener("pointerup", alSoltarGrupo);
      return;
    }

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
