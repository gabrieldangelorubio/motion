"use client";

/* -----------------------------------------------------------------------------
   Editor — el shell del módulo: lienzo + línea de tiempo + capas

   El reloj es propio (rAF, no setInterval) y el tiempo vive en un REF: un
   frame de reproducción no re-renderiza React (§9); el estado de React se
   entera a ~8 Hz para el timecode y al pausar. Undo por snapshots
   (structuredClone, tope 120): registrar() ANTES de cada mutación; un gesto
   es UN paso. Autosave con debounce + CAS: si el server devuelve una
   composición fusionada (otra pestaña editó), se rebasa el estado local.
   Con la pestaña oculta, el reloj pausa (§10.3).
----------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CanalCamara, Capa, CapaTexto, Composicion, Keyframe, NombrePropiedad, Segmento } from "@/lib/motion/modelo";
import { PRESETS, escalonadoSano } from "@/lib/motion/presets-puro";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";
import {
  CAMARA_ID,
  agregarKeyframeCamara,
  borrarGrupo,
  editarCapa,
  fijarValorCamara,
  moverCapas,
  moverCapasJuntoA,
  moverKeyframe,
  moverPoseCamara,
  ponerKeyframe,
  poseCamaraEn,
  quitarCapa,
  quitarKeyframe,
  quitarPoseCamara,
} from "@/lib/motion/herramientas-puro";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { cajaMundoDeCapa } from "@/lib/motion/cajas-puro";
import { guardarComposicionAction } from "@/app/(app)/(modulos)/motion/acciones";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { ConPista } from "@/components/ui/ConPista";
import { Lienzo, type ControlLienzo } from "@/components/motion/Lienzo";
import { LineaDeTiempo, type SeleccionKeyframe } from "@/components/motion/LineaDeTiempo";
import { Capas } from "@/components/motion/Capas";
import { Inspector } from "@/components/motion/Inspector";
import { InspectorCamara } from "@/components/motion/InspectorCamara";
import { ExportarVideo } from "@/components/motion/ExportarVideo";
import { PanelImportar, type PantallaImportada } from "@/components/motion/PanelImportar";
import { PanelBiblioteca } from "@/components/motion/PanelBiblioteca";
import { PanelAgente } from "@/components/motion/PanelAgente";
import { PanelFuentes } from "@/components/motion/PanelFuentes";
import { Segmentado } from "@/components/ui/Segmentado";
import { familiasDeComposicion, familiaDisponible } from "@/lib/motion/fuentes-puro";
import { cargarFuentesRecordadas } from "@/lib/motion/fuentes-guardadas";
import { suavizarGrabacion, type MuestraCamara } from "@/lib/motion/suavizar-puro";
import { baselineAproximada, envolverEnLineas, sumarAlLienzo, type ResultadoImport } from "@/lib/motion/figma-puro";
import type { FuentesDeMedia } from "@/lib/motion/pintar";

const TOPE_UNDO = 120;
const DEBOUNCE_GUARDADO = 1500;
const MAX_FALLOS = 5;

function enInput(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
}

export function Editor({
  snapshotInicial,
  composicionId,
  entregarExport,
  conAgente = true,
}: {
  snapshotInicial: string;
  composicionId: string;
  /** canal de entrega del MP4 exportado; default: descarga del browser */
  entregarExport?: (blob: Blob, nombre: string) => void | Promise<void>;
  /** la demo estática no tiene backend: apaga el panel del agente */
  conAgente?: boolean;
}) {
  const [composicion, setComposicion] = useState<Composicion>(() => deserializar(snapshotInicial));
  // arranca PARADO en 0: apretás play (o Space) cuando querés ver la toma
  const [reproduciendo, setReproduciendo] = useState(false);
  const [tiempoUI, setTiempoUI] = useState(0);
  const [seleccionId, setSeleccionId] = useState<string | null>(null);
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);
  // alto inicial generoso: con un par de pantallas importadas las filas ya
  // no entran en 240 (la agarradera lo ajusta entre 160 y 600)
  const [altoTimeline, setAltoTimeline] = useState(340);
  const [importarAbierto, setImportarAbierto] = useState(false);
  const [fuentesAbierto, setFuentesAbierto] = useState(false);
  // vista del lienzo: "mundo" = el canvas con el encuadre dibujado;
  // "camara" = lo que ve la cámara (arrastrar ENCUADRA, con auto-key);
  // "ambas" = el mundo con el outline moviéndose + PiP de la cámara.
  const [vista, setVista] = useState<"mundo" | "camara" | "ambas">("mundo");
  const vistaRef = useRef<"mundo" | "camara" | "ambas">("mundo");
  useEffect(() => {
    vistaRef.current = vista;
  }, [vista]);
  // calidad del preview (Half/Quarter de AE): borrador para armar rápido,
  // nítido para revisar. El export SIEMPRE sale a resolución completa.
  const [calidad, setCalidad] = useState<"baja" | "media" | "alta">("media");
  const calidadRef = useRef(1);
  useEffect(() => {
    calidadRef.current = calidad === "baja" ? 0.5 : calidad === "media" ? 1 : window.devicePixelRatio || 2;
  }, [calidad]);

  const compRef = useRef(composicion);
  const seleccionRef = useRef(seleccionId);
  useEffect(() => {
    compRef.current = composicion;
  }, [composicion]);
  useEffect(() => {
    seleccionRef.current = seleccionId;
  }, [seleccionId]);
  // selección múltiple: la primaria (seleccionId) siempre está adentro
  const [seleccionIds, setSeleccionIds] = useState<string[]>([]);
  const seleccionIdsRef = useRef<string[]>([]);
  useEffect(() => {
    seleccionIdsRef.current = seleccionIds;
  }, [seleccionIds]);
  const tiempoRef = useRef(0);
  const lienzoRef = useRef<ControlLienzo>(null);
  // ——— Modo cámara: grabar el gesto del viewport y suavizarlo a keyframes ———
  const [grabandoCamara, setGrabandoCamara] = useState(false);
  const grabandoRef = useRef(false);
  const muestrasRef = useRef<MuestraCamara[]>([]);

  // ——— Keyframe seleccionado en la timeline + portapapeles de keyframes ———
  const [seleccionKf, setSeleccionKf] = useState<SeleccionKeyframe | null>(null);
  const seleccionKfRef = useRef<SeleccionKeyframe | null>(null);
  useEffect(() => {
    seleccionKfRef.current = seleccionKf;
  }, [seleccionKf]);
  const portapapelesRef = useRef<
    | { tipo: "capa"; capaId: string; propiedad: NombrePropiedad; v: number; easing?: Keyframe["easing"]; hold?: boolean }
    | { tipo: "camara"; pose: ReturnType<typeof poseCamaraEn> }
    | null
  >(null);

  // ——— Herramienta del modo cámara (estilo AE): mantenés X y el mouse mueve
  // la cámara; mantenés Z y el mouse vertical hace zoom. null = ninguna
  // sostenida (el gesto vive en el Lienzo; acá sólo se refleja en el chip).
  const [herramientaCamara, setHerramientaCamara] = useState<"posicion" | "zoom" | null>(null);
  const pasadoRef = useRef<Composicion[]>([]);
  const futuroRef = useRef<Composicion[]>([]);
  const revRef = useRef(composicion.rev ?? 0);
  const fallosRef = useRef(0);
  const timerGuardadoRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al terminar la toma (botón o fin de la composición): la grabación cruda
  // pasa por suavizarGrabacion y queda como pistas de cámara editables. El
  // checkpoint de undo se puso al ARRANCAR la toma: grabar es UN paso.
  const detenerGrabacion = useCallback(() => {
    if (!grabandoRef.current) return;
    grabandoRef.current = false;
    setGrabandoCamara(false);
    const camara = suavizarGrabacion(muestrasRef.current) ?? undefined;
    muestrasRef.current = [];
    setComposicion({ ...compRef.current, camara });
    // rebobinar y encuadrar: la toma se revisa de una, desde afuera
    tiempoRef.current = 0;
    setTiempoUI(0);
    setReproduciendo(true);
    requestAnimationFrame(() => lienzoRef.current?.encuadrar());
  }, []);

  // ——— Reloj: un solo rAF que avanza, pinta y avisa a React a baja frecuencia ———
  useEffect(() => {
    let vivo = true;
    let anterior = performance.now();
    let ultimoAvisoUI = 0;
    const paso = (ahora: number) => {
      if (!vivo) return;
      const dt = ahora - anterior;
      anterior = ahora;
      if (reproduciendo && !document.hidden) {
        const previo = tiempoRef.current;
        tiempoRef.current = (tiempoRef.current + dt) % compRef.current.duracion;
        if (grabandoRef.current) {
          if (tiempoRef.current < previo) {
            detenerGrabacion(); // la composición dio la vuelta: la toma terminó
          } else {
            const vista = lienzoRef.current?.vistaActual();
            if (vista) muestrasRef.current.push({ t: tiempoRef.current, ...vista });
          }
        }
      }
      lienzoRef.current?.pintarAhora(tiempoRef.current);
      if (ahora - ultimoAvisoUI > 125) {
        ultimoAvisoUI = ahora;
        setTiempoUI(tiempoRef.current);
      }
      requestAnimationFrame(paso);
    };
    const id = requestAnimationFrame(paso);
    return () => {
      vivo = false;
      cancelAnimationFrame(id);
    };
  }, [reproduciendo, detenerGrabacion]);

  // ——— Undo por snapshots ———
  const registrar = useCallback(() => {
    pasadoRef.current.push(structuredClone(compRef.current));
    if (pasadoRef.current.length > TOPE_UNDO) pasadoRef.current.shift();
    futuroRef.current = [];
  }, []);

  const deshacer = useCallback(() => {
    const previa = pasadoRef.current.pop();
    if (!previa) return;
    futuroRef.current.push(structuredClone(compRef.current));
    setComposicion(previa);
  }, []);

  const rehacer = useCallback(() => {
    const siguiente = futuroRef.current.pop();
    if (!siguiente) return;
    pasadoRef.current.push(structuredClone(compRef.current));
    setComposicion(siguiente);
  }, []);

  // ——— Autosave: debounce + CAS + rebase ante fusión ———
  useEffect(() => {
    if (serializar(composicion) === snapshotInicial) return;
    if (timerGuardadoRef.current) clearTimeout(timerGuardadoRef.current);
    if (fallosRef.current >= MAX_FALLOS) return;
    timerGuardadoRef.current = setTimeout(async () => {
      const res = await guardarComposicionAction(composicionId, serializar(composicion), revRef.current);
      if (!res.ok) {
        fallosRef.current += 1;
        setAvisoGuardado(
          fallosRef.current >= MAX_FALLOS
            ? t("El guardado automático se apagó tras varios fallos: {error}", { error: res.error })
            : res.error,
        );
        return;
      }
      fallosRef.current = 0;
      revRef.current = res.rev;
      if (res.fusionada) {
        setComposicion(deserializar(res.fusionada));
        setAvisoGuardado(t("Otra pestaña editó esta composición: se fusionaron los cambios"));
      } else {
        setAvisoGuardado(null);
      }
    }, DEBOUNCE_GUARDADO);
    return () => {
      if (timerGuardadoRef.current) clearTimeout(timerGuardadoRef.current);
    };
  }, [composicion, composicionId, snapshotInicial]);

  // ——— Mutaciones ———
  // El checkpoint lo pone el CALLER al arrancar el gesto (drag que cruza el
  // umbral, foco de un campo): así un gesto entero es UN paso de undo y las
  // ediciones en vivo no inflan el historial.
  const editarEnVivo = useCallback((capaId: string, cambios: Partial<Capa>) => {
    const res = editarCapa(compRef.current, capaId, cambios);
    if (res.ok) setComposicion(res.valor);
  }, []);

  const retimarSegmento = useCallback((capaId: string, clave: "entrada" | "salida", nuevoEn: number, nuevaDuracion?: number) => {
    const capa = compRef.current.capas.find((c) => c.id === capaId);
    const seg = capa?.[clave];
    if (!seg) return;
    editarEnVivo(capaId, { [clave]: { ...seg, en: nuevoEn, duracion: nuevaDuracion ?? seg.duracion } });
  }, [editarEnVivo]);

  const moverKeyframeEnVivo = useCallback(
    (capaId: string, propiedad: NombrePropiedad, tActual: number, nuevoT: number) => {
      const res = moverKeyframe(compRef.current, capaId, propiedad, tActual, nuevoT);
      if (res.ok) {
        setComposicion(res.valor);
        const sel = seleccionKfRef.current;
        if (sel?.tipo === "capa" && sel.capaId === capaId && sel.propiedad === propiedad && sel.t === tActual) {
          setSeleccionKf({ tipo: "capa", capaId, propiedad, t: nuevoT });
        }
      }
    },
    [],
  );

  const alternarVisibilidad = useCallback((capaId: string) => {
    registrar();
    const capa = compRef.current.capas.find((c) => c.id === capaId);
    editarEnVivo(capaId, { oculta: !capa?.oculta });
  }, [registrar, editarEnVivo]);

  // drag de una pantalla entera: posiciones absolutas, sin acumulación
  const moverCapasEnVivo = useCallback((posiciones: { id: string; x: number; y: number }[]) => {
    setComposicion(moverCapas(compRef.current, posiciones));
  }, []);

  const borrarPantalla = useCallback((grupo: string) => {
    registrar();
    const res = borrarGrupo(compRef.current, grupo);
    if (res.ok) {
      setComposicion(res.valor);
      setSeleccionId(null);
    }
  }, [registrar]);

  // borrar una capa desde el panel (o con Supr): la placa borra su pantalla
  const borrarCapa = useCallback((capaId: string) => {
    const capa = compRef.current.capas.find((c) => c.id === capaId);
    if (!capa) return;
    if (capa.grupo === capa.id) {
      borrarPantalla(capa.grupo);
      return;
    }
    registrar();
    const res = quitarCapa(compRef.current, capaId);
    if (res.ok) {
      setComposicion(res.valor);
      if (seleccionRef.current === capaId) setSeleccionId(null);
    }
  }, [registrar, borrarPantalla]);

  // Aplicar un efecto de la biblioteca a la capa seleccionada: reemplaza la
  // entrada o la salida (según la clase del preset) CONSERVANDO el timing del
  // segmento existente — recambiás el efecto, no la coreografía.
  const aplicarEfecto = useCallback((preset: string) => {
    const def = PRESETS[preset];
    const id = seleccionRef.current;
    if (!def) return;
    if (!id || id === CAMARA_ID) {
      setAvisoGuardado(t("Seleccioná una capa para ponerle «{preset}»", { preset }));
      return;
    }
    const comp = compRef.current;
    const capa = comp.capas.find((c) => c.id === id);
    if (!capa) return;
    const compilado = def.compilar({});
    if ((compilado.pista.dTrazoInicio || compilado.pista.dTrazoFin) && capa.tipo !== "trazo") {
      setAvisoGuardado(t("«{preset}» es un efecto de trazos: «{nombre}» es {tipo}", { preset, nombre: capa.nombre, tipo: capa.tipo }));
      return;
    }
    registrar();
    const clase = def.clase;
    const previo = capa[clase];
    const seg: Segmento = previo
      ? { ...previo, preset }
      : clase === "entrada"
        ? { preset, en: 0, duracion: 700, easing: "salidaExpo", escalonado: capa.tipo === "texto" ? 40 : undefined }
        : { preset, en: Math.max(0, comp.duracion - 900), duracion: 600, easing: "entradaCubic", escalonado: capa.tipo === "texto" ? 25 : undefined };
    // una capa dividida sin escalonado se anima como bloque entero: si el
    // timing heredado no traía, le va el default sano de su división
    if (capa.tipo === "texto" && capa.division !== "ninguna" && !seg.escalonado) {
      seg.escalonado = escalonadoSano(capa.division);
    }
    editarEnVivo(id, { [clase]: seg });
    setAvisoGuardado(t("«{preset}» puesto como {clase} de «{nombre}»", { preset, clase, nombre: capa.nombre }));
  }, [registrar, editarEnVivo]);

  // reorden del z-order desde el panel de capas, en vivo durante el drag
  const reordenarCapaEnVivo = useCallback((capaId: string, referenciaId: string, despues: boolean) => {
    const res = moverCapasJuntoA(compRef.current, [capaId], referenciaId, despues);
    if (res.ok && res.valor.capas.some((c, i) => c !== compRef.current.capas[i])) {
      setComposicion(res.valor);
    }
  }, []);

  const reordenarPantallaEnVivo = useCallback((grupo: string, grupoDestino: string, despues: boolean) => {
    const comp = compRef.current;
    const ids = comp.capas.filter((c) => c.grupo === grupo).map((c) => c.id);
    const destino = comp.capas.filter((c) => c.grupo === grupoDestino);
    if (!ids.length || !destino.length) return;
    const referencia = despues ? destino[destino.length - 1].id : destino[0].id;
    const res = moverCapasJuntoA(comp, ids, referencia, despues);
    if (res.ok && res.valor.capas.some((c, i) => c !== comp.capas[i])) {
      setComposicion(res.valor);
    }
  }, []);

  const alternarGrabacion = useCallback(() => {
    if (grabandoRef.current) {
      detenerGrabacion();
      return;
    }
    setVista("mundo"); // se graba encuadrando el MUNDO con el viewport
    registrar();
    // la cámara previa se saca ANTES de grabar: si no, el usuario encuadraría
    // sobre un lienzo que ya se mueve solo y la toma saldría doble
    setComposicion({ ...compRef.current, camara: undefined });
    muestrasRef.current = [];
    grabandoRef.current = true;
    setGrabandoCamara(true);
    tiempoRef.current = 0;
    setTiempoUI(0);
    setReproduciendo(true);
  }, [registrar, detenerGrabacion]);

  const quitarCamara = useCallback(() => {
    registrar();
    setComposicion({ ...compRef.current, camara: undefined });
  }, [registrar]);

  // ——— La cámara como capa: auto-key y keyframes desde la UI ———
  const alFrameActual = useCallback(() => {
    const cuadro = 1000 / compRef.current.fps;
    return Math.round(tiempoRef.current / cuadro) * cuadro;
  }, []);

  const fijarCamara = useCallback((canal: CanalCamara, v: number) => {
    setComposicion(fijarValorCamara(compRef.current, canal, alFrameActual(), v));
  }, [alFrameActual]);

  // Los gestos del ENCUADRE en el lienzo son auto-key estilo AE: dejan
  // keyframe en el playhead, siempre. Te movés en la timeline, arrastrás,
  // y la animación va quedando sola.
  const moverCamaraEnVivo = useCallback((x: number, y: number) => {
    setComposicion(agregarKeyframeCamara(compRef.current, alFrameActual(), { x, y }));
  }, [alFrameActual]);

  const zoomCamaraEnVivo = useCallback((zoom: number) => {
    setComposicion(agregarKeyframeCamara(compRef.current, alFrameActual(), { zoom }));
  }, [alFrameActual]);

  const keyframeCamaraAhora = useCallback(() => {
    registrar();
    const vista = estadoEn(compRef.current, tiempoRef.current).camara;
    setComposicion(agregarKeyframeCamara(compRef.current, alFrameActual(), vista));
  }, [registrar, alFrameActual]);

  const tomarVistaCamara = useCallback(() => {
    const vista = lienzoRef.current?.vistaActual();
    if (!vista) return;
    registrar();
    const comp = compRef.current;
    const p = comp.camara?.pistas;
    const hayKeyframes = !!(p?.x?.length || p?.y?.length || p?.zoom?.length);
    setComposicion(
      hayKeyframes
        ? agregarKeyframeCamara(comp, alFrameActual(), vista)
        : { ...comp, camara: { ...(comp.camara ?? { pistas: {} }), base: { ...vista } } },
    );
  }, [registrar, alFrameActual]);

  // Centrar lo seleccionado: una capa se centra por su CAJA (el ancla puede
  // no ser el centro visual) respecto de su pantalla si pertenece a una, o
  // del frame de render si no; una placa centra su pantalla ENTERA respecto
  // del frame; la cámara centra el encuadre (con su auto-key de siempre).
  const centrarSeleccion = useCallback((eje: "x" | "y") => {
    const comp = compRef.current;
    const id = seleccionRef.current;
    if (!id) return;
    if (id === CAMARA_ID) {
      registrar();
      setComposicion(fijarValorCamara(comp, eje, alFrameActual(), eje === "x" ? comp.ancho / 2 : comp.alto / 2));
      return;
    }
    const capa = comp.capas.find((c) => c.id === id);
    if (!capa || capa.bloqueada) return;
    registrar();
    if (capa.grupo === capa.id) {
      const destino = eje === "x" ? comp.ancho / 2 : comp.alto / 2;
      const d = destino - (eje === "x" ? capa.x : capa.y);
      const miembros = comp.capas.filter((c) => c.grupo === capa.grupo);
      setComposicion(moverCapas(comp, miembros.map((m) => ({
        id: m.id,
        x: m.x + (eje === "x" ? d : 0),
        y: m.y + (eje === "y" ? d : 0),
      }))));
      return;
    }
    const ctx = document.createElement("canvas").getContext("2d");
    const medir = (texto: string, font: string) => {
      if (!ctx) return 0;
      ctx.font = font;
      return ctx.measureText(texto).width;
    };
    const placa = capa.grupo ? comp.capas.find((c) => c.id === capa.grupo) : null;
    const destino = eje === "x"
      ? (placa ? placa.x : comp.ancho / 2)
      : (placa ? placa.y : comp.alto / 2);
    const caja = cajaMundoDeCapa(capa, medir);
    const delta = destino - (eje === "x" ? caja.x + caja.w / 2 : caja.y + caja.h / 2);
    editarEnVivo(capa.id, eje === "x" ? { x: capa.x + delta } : { y: capa.y + delta });
  }, [registrar, alFrameActual, editarEnVivo]);

  const moverPoseCamaraEnVivo = useCallback((tActual: number, nuevoT: number) => {
    const res = moverPoseCamara(compRef.current, tActual, nuevoT);
    if (res.ok) {
      setComposicion(res.valor);
      const sel = seleccionKfRef.current;
      if (sel?.tipo === "camara" && sel.t === tActual) setSeleccionKf({ tipo: "camara", t: nuevoT });
    }
  }, []);

  // ——— Keyframes: borrar, copiar y pegar (capas y poses de cámara) ———
  const borrarKfSeleccionado = useCallback(() => {
    const sel = seleccionKfRef.current;
    if (!sel) return;
    registrar();
    const res = sel.tipo === "capa"
      ? quitarKeyframe(compRef.current, sel.capaId, sel.propiedad, sel.t)
      : quitarPoseCamara(compRef.current, sel.t);
    if (res.ok) {
      setComposicion(res.valor);
      setSeleccionKf(null);
    }
  }, [registrar]);

  const copiarKfSeleccionado = useCallback(() => {
    const sel = seleccionKfRef.current;
    if (!sel) return;
    if (sel.tipo === "capa") {
      const capa = compRef.current.capas.find((c) => c.id === sel.capaId);
      const kf = capa?.pistas?.[sel.propiedad]?.find((k) => k.t === sel.t);
      if (!kf) return;
      portapapelesRef.current = { tipo: "capa", capaId: sel.capaId, propiedad: sel.propiedad, v: kf.v, easing: kf.easing, hold: kf.hold };
    } else {
      const pose = poseCamaraEn(compRef.current, sel.t);
      if (!Object.keys(pose).length) return;
      portapapelesRef.current = { tipo: "camara", pose };
    }
  }, []);

  const pegarKf = useCallback(() => {
    const copiado = portapapelesRef.current;
    if (!copiado) return;
    const t = alFrameActual();
    registrar();
    if (copiado.tipo === "capa") {
      const res = ponerKeyframe(compRef.current, copiado.capaId, copiado.propiedad, {
        t,
        v: copiado.v,
        easing: copiado.easing,
        hold: copiado.hold,
      });
      if (res.ok) {
        setComposicion(res.valor);
        setSeleccionKf({ tipo: "capa", capaId: copiado.capaId, propiedad: copiado.propiedad, t });
      } else {
        setAvisoGuardado(res.error);
      }
    } else {
      setComposicion(agregarKeyframeCamara(compRef.current, t, copiado.pose));
      setSeleccionKf({ tipo: "camara", t });
    }
  }, [registrar, alFrameActual]);

  // ——— Media: resolución de imágenes (data URIs del import de Figma) ———
  // El motor no sabe de red: recibe un resolver. Las imágenes se cargan
  // perezosas la primera vez que pintar() las pide; el loop del preview
  // las pinta apenas terminan de cargar.
  const imagenesRef = useRef(new Map<string, HTMLImageElement | "cargando">());
  const obtenerMedia = useCallback((): FuentesDeMedia => ({
    imagenDe: (mediaId: string) => {
      const conocida = imagenesRef.current.get(mediaId);
      if (conocida === "cargando") return null;
      if (conocida) return conocida;
      if (!mediaId.startsWith("data:")) return null; // ids de catálogo: los resuelve diosa
      imagenesRef.current.set(mediaId, "cargando");
      const imagen = new Image();
      imagen.onload = () => imagenesRef.current.set(mediaId, imagen);
      imagen.src = mediaId;
      return null;
    },
  }), []);

  // El largo real de un path sólo lo sabe el DOM de SVG (getTotalLength):
  // se mide UNA vez al importar y queda guardado en la capa — el motor puro
  // y el export nunca tocan el DOM. Si algo falla, largo 0 = trazo completo.
  const medirTrazos = useCallback((comp: Composicion): Composicion => {
    if (!comp.capas.some((c) => c.tipo === "trazo" && c.largo === 0)) return comp;
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    svg.style.pointerEvents = "none";
    document.body.appendChild(svg);
    try {
      const capas = comp.capas.map((c) => {
        if (c.tipo !== "trazo" || c.largo > 0) return c;
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", c.path);
        svg.appendChild(path);
        return { ...c, largo: Math.round(path.getTotalLength() * 100) / 100 };
      });
      return { ...comp, capas };
    } catch {
      return comp;
    } finally {
      svg.remove();
    }
  }, []);

  // Los textos que en Figma quebraban por el wrap de la caja llegan en una
  // sola línea (la API no expone los cortes): acá se re-envuelven midiendo
  // al ancho de la caja — y el conteo de líneas que Figma renderizó manda si
  // las métricas difieren. El ancla baja media altura de bloque por línea
  // extra (el motor centra el bloque en el ancla). El 2% de tolerancia
  // absorbe la diferencia de métricas entre Figma y canvas.
  const reajustesRef = useRef<
    { capaId: string; anchoCaja: number; lineas: number; original: string; yOriginal: number; aplicado: string }[]
  >([]);

  const envolverCapaTexto = useCallback((capa: CapaTexto, anchoCaja: number, lineas: number, original: string, yOriginal: number, ctx: CanvasRenderingContext2D) => {
    ctx.font = `${capa.fuente.peso} ${capa.fuente.tamano}px ${capa.fuente.familia}`;
    const interletrado = capa.fuente.interletrado ?? 0;
    const medir = (t: string) => ctx.measureText(t).width + interletrado * Math.max(0, t.length - 1);
    const texto = envolverEnLineas(original, anchoCaja * 1.02, medir, lineas);
    const n = texto.split("\n").length;
    const interlineado = capa.fuente.interlineado ?? capa.fuente.tamano * 1.15;
    return { texto, y: yOriginal + ((n - 1) / 2) * interlineado };
  }, []);

  const reajustarTextos = useCallback((comp: Composicion, reajustes: ResultadoImport["reajustes"]): Composicion => {
    reajustesRef.current = [];
    if (!reajustes.length) return comp;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return comp;
    const capas = comp.capas.map((c) => {
      const ajuste = reajustes.find((r) => r.capaId === c.id);
      if (!ajuste || c.tipo !== "texto" || c.texto.includes("\n")) return c;
      const { texto, y } = envolverCapaTexto(c, ajuste.anchoCaja, ajuste.lineas, c.texto, c.y, ctx);
      if (texto === c.texto) return c;
      reajustesRef.current.push({ ...ajuste, original: c.texto, yOriginal: c.y, aplicado: texto });
      return { ...c, texto, y };
    });
    return { ...comp, capas };
  }, [envolverCapaTexto]);

  // Anclaje vertical fiel a Figma. El dato duro es la TINTA: dónde quedaron
  // pintados los píxeles en Figma (tintaY, del absoluteRenderBounds). La
  // baseline exacta sale de tintaY + el ascenso de tinta del MISMO texto
  // medido acá (actualBoundingBoxAscent) — geometría contra geometría, sin
  // modelos de métricas. Sin tinta, degrada al centrado en la caja de línea
  // con las métricas de la fuente (fontBoundingBox). Se recalcula al
  // importar y de nuevo al cargar la tipografía real; sólo toca capas cuya
  // y sigue siendo la que pusimos nosotros (si el usuario la movió, es suya).
  const anclasRef = useRef<{ capaId: string; topCaja: number; tintaY?: number; yAplicada?: number }[]>([]);

  const anclarTextos = useCallback((comp: Composicion): Composicion => {
    if (!anclasRef.current.length) return comp;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return comp;
    const capas = comp.capas.map((c) => {
      const ancla = anclasRef.current.find((a) => a.capaId === c.id);
      if (!ancla || c.tipo !== "texto") return c;
      if (ancla.yAplicada !== undefined && Math.abs(c.y - ancla.yAplicada) > 0.01) return c;
      const { tamano, peso, familia } = c.fuente;
      const interlineado = c.fuente.interlineado ?? tamano * 1.15;
      ctx.font = `${peso} ${tamano}px ${familia}`;

      const primeraLinea = c.texto.split("\n")[0];
      const tinta = ancla.tintaY !== undefined && primeraLinea.trim() !== ""
        ? ctx.measureText(primeraLinea).actualBoundingBoxAscent
        : undefined;

      let baseline: number;
      if (ancla.tintaY !== undefined && tinta !== undefined && Number.isFinite(tinta) && tinta > 0) {
        // baseline absoluta = tope de tinta de Figma + ascenso de tinta local
        baseline = ancla.tintaY - ancla.topCaja + tinta;
      } else {
        const m = ctx.measureText("Híg");
        const ascenso = m.fontBoundingBoxAscent ?? 0;
        const descenso = m.fontBoundingBoxDescent ?? 0;
        const cuerpo = ascenso + descenso;
        baseline = cuerpo > 0 && cuerpo < interlineado * 3
          ? (interlineado - cuerpo) / 2 + ascenso
          : baselineAproximada(tamano, c.fuente.interlineado);
      }
      const n = c.texto.split("\n").length;
      const y = ancla.topCaja + baseline + ((n - 1) / 2) * interlineado;
      ancla.yAplicada = y;
      if (Math.abs(y - c.y) < 0.01) return c;
      return { ...c, y };
    });
    return { ...comp, capas };
  }, []);

  // El panel de fuentes se abre solo tras un import con familias faltantes:
  // al cerrarlo, la fuente REAL ya está cargada y el wrap se recalcula con
  // sus métricas verdaderas — sólo en capas que el usuario no tocó.
  const reaplicarReajustes = useCallback(() => {
    if (!reajustesRef.current.length && !anclasRef.current.length) return;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    const capas = compRef.current.capas.map((c) => {
      const p = reajustesRef.current.find((r) => r.capaId === c.id);
      if (!p || c.tipo !== "texto" || c.texto !== p.aplicado) return c;
      const { texto, y } = envolverCapaTexto(c, p.anchoCaja, p.lineas, p.original, p.yOriginal, ctx);
      if (texto === c.texto) return c;
      p.aplicado = texto;
      return { ...c, texto, y };
    });
    const final = anclarTextos({ ...compRef.current, capas });
    const cambio = final.capas.some((c, i) => c !== compRef.current.capas[i]);
    if (cambio) {
      registrar();
      setComposicion(final);
    }
  }, [envolverCapaTexto, anclarTextos, registrar]);

  // Fuentes recordadas (IndexedDB): lo que el usuario ya cargó alguna vez se
  // levanta solo al abrir el editor — y los textos anclados con métricas del
  // fallback se re-anclan. El tick fuerza el re-render que actualiza el
  // contador de faltantes (se calcula por render).
  const [, setTickFuentes] = useState(0);
  const fuentesRecargadasRef = useRef(false);
  useEffect(() => {
    if (fuentesRecargadasRef.current) return;
    fuentesRecargadasRef.current = true;
    void cargarFuentesRecordadas().then((familias) => {
      if (!familias.length) return;
      reaplicarReajustes();
      setTickFuentes((n) => n + 1);
    });
  }, [reaplicarReajustes]);

  // Borde derecho del contenido actual: ahí se suma la próxima pantalla.
  const bordeDerechoLienzo = useCallback((comp: Composicion): number => {
    const ctx = document.createElement("canvas").getContext("2d");
    const medir = (texto: string, font: string) => {
      if (!ctx) return 0;
      ctx.font = font;
      return ctx.measureText(texto).width;
    };
    let max = comp.ancho;
    for (const capa of comp.capas) {
      if (capa.oculta) continue;
      const caja = cajaMundoDeCapa(capa, medir);
      max = Math.max(max, caja.x + caja.w);
    }
    return max;
  }, []);

  const importarDeFigma = useCallback((pantallas: PantallaImportada[]) => {
    if (!pantallas.length) return;
    registrar();
    // Paradigma canvas: la primera pantalla del lote define el frame de
    // render (si el lienzo está vacío) y las demás conservan su disposición
    // relativa de Figma; sobre un lienzo con contenido, el lote ENTERO se
    // suma a la derecha. TODA pantalla entra por sumarAlLienzo, así queda
    // agrupada con su placa (arrastrás la placa = movés la pantalla entera).
    const actual = compRef.current;
    const seSuma = actual.capas.length > 0;
    let comp: Composicion = seSuma ? actual : { ...pantallas[0].resultado.composicion, capas: [] };
    const origenX = seSuma ? Math.ceil(bordeDerechoLienzo(actual) + 200) : 0;
    const reajustes: ResultadoImport["reajustes"] = [];
    const anclas: ResultadoImport["anclas"] = [];
    for (const pantalla of pantallas) {
      const paso = sumarAlLienzo(comp, pantalla.resultado, origenX + pantalla.dx, pantalla.dy);
      comp = paso.composicion;
      reajustes.push(...paso.reajustes);
      anclas.push(...paso.anclas);
    }
    anclasRef.current = anclas.map((a) => ({ ...a }));
    const final = anclarTextos(reajustarTextos(medirTrazos(comp), reajustes));
    setComposicion(final);
    setSeleccionId(null);
    tiempoRef.current = 0;
    setTiempoUI(0);
    const avisos = pantallas.reduce((s, p) => s + p.resultado.avisos.length, 0);
    setAvisoGuardado(
      seSuma
        ? t.plural(pantallas.length, "{n} pantalla sumada al lienzo, a la derecha de lo existente", "{n} pantallas sumadas al lienzo, a la derecha de lo existente")
        : avisos
          ? t.plural(avisos, "Importado con {n} aviso de conversión", "Importado con {n} avisos de conversión")
          : pantallas.length > 1
            ? t("{n} pantallas importadas con su disposición de Figma", { n: pantallas.length })
            : null,
    );
    requestAnimationFrame(() => lienzoRef.current?.encuadrar());
    // si la pantalla usa tipografías que este browser no tiene, primero se
    // prueban las RECORDADAS (ya cargadas otra vez acá); el panel se abre
    // sólo si sigue faltando algo — nunca sustituir en silencio
    const faltantes = familiasDeComposicion(final).some(({ familia, pesos }) =>
      pesos.some((peso) => !familiaDisponible(familia, peso)),
    );
    if (faltantes) {
      void cargarFuentesRecordadas().then((cargadas) => {
        if (cargadas.length) reaplicarReajustes();
        const sigueFaltando = familiasDeComposicion(compRef.current).some(({ familia, pesos }) =>
          pesos.some((peso) => !familiaDisponible(familia, peso)),
        );
        if (sigueFaltando) setFuentesAbierto(true);
        else setTickFuentes((n) => n + 1);
      });
    }
  }, [registrar, medirTrazos, reajustarTextos, anclarTextos, bordeDerechoLienzo, reaplicarReajustes]);

  const familiasFaltantes = familiasDeComposicion(composicion).filter(({ familia, pesos }) =>
    pesos.some((peso) => !familiaDisponible(familia, peso)),
  ).length;

  // ——— Transport ———
  const saltarFrame = useCallback((dir: 1 | -1) => {
    setReproduciendo(false);
    const paso = 1000 / compRef.current.fps;
    tiempoRef.current = Math.min(compRef.current.duracion, Math.max(0, tiempoRef.current + dir * paso));
    setTiempoUI(tiempoRef.current);
  }, []);

  const escrub = useCallback((ms: number) => {
    setReproduciendo(false);
    tiempoRef.current = ms;
    setTiempoUI(ms);
  }, []);


  // Supr con selección: borra TODAS las capas elegidas (la placa, su pantalla)
  const borrarSeleccionadas = useCallback(() => {
    const ids = seleccionIdsRef.current.length
      ? seleccionIdsRef.current
      : seleccionRef.current && seleccionRef.current !== CAMARA_ID
        ? [seleccionRef.current]
        : [];
    if (!ids.length) return;
    registrar();
    let comp = compRef.current;
    for (const id of ids) {
      const capa = comp.capas.find((c) => c.id === id);
      if (!capa) continue;
      const res = capa.grupo === capa.id ? borrarGrupo(comp, capa.grupo) : quitarCapa(comp, id);
      if (res.ok) comp = res.valor;
    }
    setComposicion(comp);
    setSeleccionIds([]);
    setSeleccionId(null);
  }, [registrar]);

  // ——— Atajos (§8.1): un solo keydown, con el guard de inputs ———
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (enInput()) return;
        e.preventDefault();
        setReproduciendo((r) => !r);
        return;
      }
      if (enInput()) return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) rehacer();
        else deshacer();
      } else if (meta && e.key === "c" && seleccionKfRef.current) {
        e.preventDefault();
        copiarKfSeleccionado();
      } else if (meta && e.key === "v" && portapapelesRef.current) {
        e.preventDefault();
        pegarKf();
      } else if (meta && e.key === "0") {
        e.preventDefault();
        lienzoRef.current?.escalaUno();
      } else if ((e.key === "Delete" || e.key === "Backspace") && seleccionKfRef.current) {
        e.preventDefault();
        borrarKfSeleccionado();
      } else if ((e.key === "Delete" || e.key === "Backspace") && (seleccionIdsRef.current.length || (seleccionRef.current && seleccionRef.current !== CAMARA_ID))) {
        e.preventDefault();
        borrarSeleccionadas();
      } else if (e.shiftKey && e.key === "!") {
        e.preventDefault();
        lienzoRef.current?.encuadrar();
      } else if (e.key === "ArrowLeft") {
        saltarFrame(-1);
      } else if (e.key === "ArrowRight") {
        saltarFrame(1);
      } else if (e.key === "Escape") {
        if (seleccionKfRef.current) setSeleccionKf(null);
        else setSeleccionId(null);
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [deshacer, rehacer, saltarFrame, copiarKfSeleccionado, pegarKf, borrarKfSeleccionado, borrarSeleccionadas]);

  // Selección con las consecuencias juntas: al cambiar de capa, un keyframe
  // elegido de OTRA capa se suelta (borrar/copiar operan sobre lo que se ve
  // elegido); una tecla de cámara sostenida se suelta con la selección.
  const seleccionar = useCallback((id: string | null) => {
    setHerramientaCamara(null);
    setSeleccionKf((sel) => {
      if (!sel) return sel;
      const pertenece = sel.tipo === "camara" ? id === CAMARA_ID : id === sel.capaId;
      return pertenece ? sel : null;
    });
    setSeleccionId(id);
    setSeleccionIds(id && id !== CAMARA_ID ? [id] : []);
  }, []);

  // shift+click: la capa entra o sale de la selección múltiple
  const alternarSeleccion = useCallback((id: string) => {
    const actual = seleccionIdsRef.current;
    const base = actual.length
      ? actual
      : seleccionRef.current && seleccionRef.current !== CAMARA_ID
        ? [seleccionRef.current]
        : [];
    const nueva = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    setSeleccionIds(nueva);
    setSeleccionId(nueva[nueva.length - 1] ?? null);
  }, []);

  const seleccionarVarias = useCallback((ids: string[]) => {
    setSeleccionIds(ids);
    setSeleccionId(ids[ids.length - 1] ?? null);
    setSeleccionKf(null);
  }, []);


  const capaSeleccionada = composicion.capas.find((c) => c.id === seleccionId) ?? null;

  return (
    <div className="grid h-dvh grid-cols-[240px_1fr_300px] overflow-hidden">
      <div className="flex min-h-0 flex-col">
        <div className="h-1/2 min-h-0">
          <Capas
            composicion={composicion}
            seleccionId={seleccionId}
            seleccionIds={seleccionIds}
            onSeleccionar={seleccionar}
            onAlternarSeleccion={alternarSeleccion}
            onAlternarVisibilidad={alternarVisibilidad}
            onCheckpoint={registrar}
            onReordenarCapa={reordenarCapaEnVivo}
            onReordenarPantalla={reordenarPantallaEnVivo}
            onBorrarCapa={borrarCapa}
          />
        </div>
        <div className="h-1/2 min-h-0 border-r border-(--glass-border)">
          <PanelBiblioteca onAplicar={aplicarEfecto} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          <Lienzo
            ref={lienzoRef}
            obtenerComposicion={() => compRef.current}
            obtenerSeleccionId={() => seleccionRef.current}
            obtenerSeleccionIds={() => seleccionIdsRef.current}
            obtenerMedia={obtenerMedia}
            obtenerCalidad={() => calidadRef.current}
            obtenerTiempo={() => tiempoRef.current}
            obtenerVista={() => vistaRef.current}
            onTeclaCamara={setHerramientaCamara}
            onSeleccionar={seleccionar}
            onAlternarSeleccion={alternarSeleccion}
            onSeleccionarVarias={seleccionarVarias}
            onCheckpoint={registrar}
            onMoverCapa={(id, x, y) => editarEnVivo(id, { x, y })}
            onMoverCapas={moverCapasEnVivo}
            onMoverCamara={moverCamaraEnVivo}
            onZoomCamara={zoomCamaraEnVivo}
          />
          {(seleccionId === CAMARA_ID || vista === "camara") && !grabandoCamara && (
            <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-control border border-(--glass-border) bg-(--menu-solido-bg) px-3 py-1.5 text-xs text-foreground/80 shadow-(--menu-shadow)">
              {herramientaCamara === "zoom"
                ? t("Cámara · ZOOM (Z sostenida) — mové el mouse arriba/abajo: entra y sale · deja keyframe en el playhead")
                : herramientaCamara === "posicion"
                  ? t("Cámara · POSICIÓN (X sostenida) — la cámara sigue al mouse · deja keyframe en el playhead")
                  : t("Cámara — mantené X y mové el mouse: posición · mantené Z y mové vertical: zoom · cada gesto deja keyframe en el playhead")}
            </div>
          )}
          <div className={["absolute bottom-3 flex items-center gap-2", conAgente ? "left-14" : "left-3"].join(" ")}>
            <ConPista pista={t("Calidad del preview — el export siempre sale a resolución completa")}>
              <Segmentado
                etiquetaAria={t("Calidad del preview")}
                valor={calidad}
                onCambio={(v) => setCalidad(v as "baja" | "media" | "alta")}
                opciones={[
                  { valor: "baja", nombre: "½" },
                  { valor: "media", nombre: "1×" },
                  { valor: "alta", nombre: t("Máx") },
                ]}
              />
            </ConPista>
            <ConPista pista={t("Mundo: el lienzo con el encuadre. Cámara: lo que sale en el render — arrastrá para encuadrar. Ambas: el mundo + la cámara en miniatura")}>
              <Segmentado
                etiquetaAria={t("Vista del lienzo")}
                valor={vista}
                onCambio={(v) => {
                  const nueva = v as "mundo" | "camara" | "ambas";
                  setVista(nueva);
                  if (nueva === "camara") seleccionar(CAMARA_ID);
                  requestAnimationFrame(() =>
                    nueva === "camara" ? lienzoRef.current?.encuadrarRender() : lienzoRef.current?.encuadrar(),
                  );
                }}
                opciones={[
                  { valor: "mundo", nombre: t("Mundo") },
                  { valor: "camara", nombre: t("Cámara") },
                  { valor: "ambas", nombre: t("Ambas") },
                ]}
              />
            </ConPista>
          </div>
          <div className="absolute right-3 top-3 flex items-start gap-2">
            <ConPista pista={t("Importar pantalla de Figma")}>
              <BotonIcono tam={32} etiqueta={t("Importar pantalla de Figma")} onClick={() => setImportarAbierto(true)}>
                <Icono nombre="subir" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <div className="relative">
              <ConPista pista={familiasFaltantes > 0 ? t.plural(familiasFaltantes, "Tipografías ({n} faltante)", "Tipografías ({n} faltantes)") : t("Tipografías")}>
                <BotonIcono tam={32} etiqueta={t("Tipografías")} onClick={() => setFuentesAbierto(true)}>
                  <Icono nombre="tipografia" width={15} height={15} />
                </BotonIcono>
              </ConPista>
              {familiasFaltantes > 0 && (
                <span className="pointer-events-none absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-peligro font-mono text-[10px] font-semibold text-white">
                  {familiasFaltantes}
                </span>
              )}
            </div>
            <ConPista
              pista={t("Modo cámara — pausa y activa los controles: mantené X y el mouse mueve la cámara, mantené Z y el mouse vertical hace zoom; movete por el timeline y cada gesto deja un keyframe")}
            >
              <BotonIcono
                tam={32}
                activo={seleccionId === CAMARA_ID}
                etiqueta={t("Modo cámara")}
                onClick={() => {
                  setReproduciendo(false);
                  seleccionar(seleccionId === CAMARA_ID ? null : CAMARA_ID);
                }}
              >
                <Icono nombre="camara" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <ConPista pista={t("Centrar horizontal — la capa en su pantalla (o el frame); la placa centra su pantalla; la cámara, el encuadre")}>
              <BotonIcono tam={32} etiqueta={t("Centrar horizontal")} deshabilitado={!seleccionId} onClick={() => centrarSeleccion("x")}>
                <Icono nombre="centrarH" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <ConPista pista={t("Centrar vertical")}>
              <BotonIcono tam={32} etiqueta={t("Centrar vertical")} deshabilitado={!seleccionId} onClick={() => centrarSeleccion("y")}>
                <Icono nombre="centrarV" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            {composicion.camara && !grabandoCamara && (
              <ConPista pista={t("Quitar el movimiento de cámara grabado")}>
                <BotonIcono tam={32} tono="peligro" etiqueta={t("Quitar cámara")} onClick={quitarCamara}>
                  <Icono nombre="ojoTachado" width={15} height={15} />
                </BotonIcono>
              </ConPista>
            )}
            <ConPista pista={t("Encuadrar todo (⇧1)")}>
              <BotonIcono tam={32} etiqueta={t("Encuadrar todo")} onClick={() => lienzoRef.current?.encuadrar()}>
                <Icono nombre="encuadrar" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <ExportarVideo
              obtenerComposicion={() => compRef.current}
              obtenerMedia={obtenerMedia}
              onPausar={() => setReproduciendo(false)}
              entregar={entregarExport}
            />
          </div>
          <PanelImportar
            abierto={importarAbierto}
            onCerrar={() => setImportarAbierto(false)}
            onImportar={importarDeFigma}
          />
          <PanelFuentes
            abierto={fuentesAbierto}
            onCerrar={() => {
              setFuentesAbierto(false);
              reaplicarReajustes();
            }}
            composicion={composicion}
          />
          {conAgente && (
            <PanelAgente
              obtenerSnapshot={() => serializar(compRef.current)}
              composicionId={composicionId}
              onAplicar={(snapshot) => {
                registrar();
                setComposicion(deserializar(snapshot));
              }}
            />
          )}
          {avisoGuardado && (
            <div
              role="status"
              className="absolute left-1/2 top-3 -translate-x-1/2 rounded-control border border-peligro/30 bg-(--menu-solido-bg) px-3 py-1.5 text-xs text-foreground shadow-(--menu-shadow)"
            >
              {avisoGuardado}
            </div>
          )}
        </div>
        <LineaDeTiempo
          composicion={composicion}
          tiempo={tiempoUI}
          reproduciendo={reproduciendo}
          seleccionId={seleccionId}
          seleccionIds={seleccionIds}
          onSeleccionarVarias={seleccionarVarias}
          onAlternarSeleccion={alternarSeleccion}
          alto={altoTimeline}
          onAlto={setAltoTimeline}
          onScrub={escrub}
          onTogglePlay={() => setReproduciendo((r) => !r)}
          onSaltarFrame={saltarFrame}
          onSeleccionar={seleccionar}
          onCheckpoint={registrar}
          onRetimarSegmento={retimarSegmento}
          onMoverKeyframe={moverKeyframeEnVivo}
          onMoverPoseCamara={moverPoseCamaraEnVivo}
          seleccionKf={seleccionKf}
          onSeleccionarKf={setSeleccionKf}
        />
      </div>
      <div className="min-h-0">
        {seleccionId === CAMARA_ID ? (
          <InspectorCamara
            composicion={composicion}
            tiempo={tiempoUI}
            grabando={grabandoCamara}
            onFijar={fijarCamara}
            onKeyframe={keyframeCamaraAhora}
            onTomarVista={tomarVistaCamara}
            onGrabar={alternarGrabacion}
            onQuitar={quitarCamara}
            onCheckpoint={registrar}
          />
        ) : (
          <Inspector
            capa={capaSeleccionada}
            duracionComposicion={composicion.duracion}
            capasDelGrupo={
              capaSeleccionada?.grupo
                ? composicion.capas.filter((c) => c.grupo === capaSeleccionada.grupo).length
                : 0
            }
            onEditar={editarEnVivo}
            onBorrarPantalla={borrarPantalla}
            onCheckpoint={registrar}
          />
        )}
      </div>
    </div>
  );
}
