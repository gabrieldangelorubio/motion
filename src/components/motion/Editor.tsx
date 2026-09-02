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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanalCamara, Capa, CapaMedia, CapaTexto, CapaVideo, Composicion, Keyframe, NombrePropiedad, Segmento, TemblorCamara } from "@/lib/motion/modelo";
import { PRESETS, escalonadoSano } from "@/lib/motion/presets-puro";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";
import { planDeLectura, contextoDeLectura } from "@/lib/motion/lectura-puro";
import {
  CAMARA_ID,
  agregarCapa,
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
  definirTemblorCamara,
  desplazarEnZ,
  desplazarTiempoCapas,
  estirarTiempoCapas,
} from "@/lib/motion/herramientas-puro";
import { camaraEn, sinCapasReferencia } from "@/lib/motion/evaluar-puro";
import { estadoVivo } from "@/lib/motion/motor-gsap";
import { FORMATOS, camaraParaLienzoNuevo, conFormato, encuadrarCamara, formatoDe } from "@/lib/motion/formato-puro";
import { esPlaca } from "@/lib/motion/estilo-puro";
// olvidarVideo queda para la migración al catálogo: borrar la capa NO borra
// el archivo local (el undo la puede traer de vuelta, como las fuentes)
import { cargarVideoGuardado, recordarVideo } from "@/lib/motion/video-guardado";
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
import type { ImagenRevision } from "@/lib/motion/revision-puro";
import { aplicarSensacion, descripcionSensacion, type Sensacion } from "@/lib/motion/sensacion-puro";
import { Deslizador } from "@/components/ui/Deslizador";
import { cajaMundoDeCapa } from "@/lib/motion/cajas-puro";
import { cargarComposicionAction, guardarComposicionAction } from "@/app/(app)/(modulos)/motion/acciones";
import { escenaDuplicada, escenaNueva, idDeEscena, quitarEscena, type EscenaInfo } from "@/lib/motion/escenas-puro";
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
import { AudioDeProyecto } from "@/components/motion/AudioDeProyecto";
import {
  cargarAudioGuardado,
  decodificarAudio,
  guardarRecorte,
  guardarTranscripcion,
  olvidarAudio,
  recordarAudio,
  type AudioDecodificado,
  type RecorteAudio as RecorteAudioTipo,
} from "@/lib/motion/audio-guardado";
import { RecorteAudio } from "@/components/motion/RecorteAudio";
import { EditarPalabras } from "@/components/motion/EditarPalabras";
import { moverPalabraLista, oracionesDePalabras, type Palabra } from "@/lib/motion/stt-puro";
import { cortesDeEscenas, duracionDesdeAudio, escenaEnPunto } from "@/lib/motion/audio-puro";
import { encajarMedia } from "@/lib/motion/media-puro";
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
  // el DETALLE de los avisos del último import de Figma (qué se rasterizó y
  // por qué): viaja con el toast «Importado con N avisos» — diagnóstico a
  // la vista, no un número mudo
  const [detalleImport, setDetalleImport] = useState<string[]>([]);
  // alto inicial generoso: con un par de pantallas importadas las filas ya
  // no entran en 240 (la agarradera lo ajusta entre 160 y 600)
  const [altoTimeline, setAltoTimeline] = useState(340);
  const [importarAbierto, setImportarAbierto] = useState(false);
  const [fuentesAbierto, setFuentesAbierto] = useState(false);
  // alto del chat de diosa en la barra derecha (agarradera, como el timeline)
  const [altoChat, setAltoChat] = useState(340);
  const redimenChatRef = useRef<{ y0: number; alto0: number } | null>(null);
  // ——— Escenas: proyecto → escenas → pantallas → capas. Cada escena es una
  // composición COMPLETA guardada por su propio id (mismo CAS); el registro
  // de cuáles componen el proyecto vive en localStorage hasta el catálogo.
  const [escenas, setEscenas] = useState<EscenaInfo[]>([{ id: composicionId, nombre: "Escena 1" }]);
  const [escenaActiva, setEscenaActiva] = useState(composicionId);
  const escenasRef = useRef<EscenaInfo[]>([{ id: composicionId, nombre: "Escena 1" }]);
  const escenaActivaRef = useRef(composicionId);
  useEffect(() => {
    escenasRef.current = escenas;
  }, [escenas]);
  useEffect(() => {
    escenaActivaRef.current = escenaActiva;
  }, [escenaActiva]);
  useEffect(() => {
    let vivo = true;
    // en microtask: el registro es un sistema externo (localStorage) y el
    // linter tiene razón en que el setState directo cascadea renders
    queueMicrotask(() => {
      if (!vivo) return;
      try {
        const crudas = localStorage.getItem(`motion-escenas:${composicionId}`);
        const lista = crudas ? (JSON.parse(crudas) as EscenaInfo[]) : null;
        if (lista?.length) setEscenas(lista);
      } catch {
        /* registro ilegible: arranca con la escena base */
      }
    });
    return () => {
      vivo = false;
    };
  }, [composicionId]);
  const persistirEscenas = useCallback((lista: EscenaInfo[]) => {
    setEscenas(lista);
    try {
      localStorage.setItem(`motion-escenas:${composicionId}`, JSON.stringify(lista));
    } catch {
      /* sin storage el registro vive esta sesión */
    }
  }, [composicionId]);
  // ——— Audio del proyecto: la voz en off / música que estructura las escenas.
  // UN audio por proyecto (IndexedDB, como las fuentes); el tiempo GLOBAL es
  // la concatenación de escenas y el preview reproduce el tramo que le toca
  // a la activa. La franja de forma de onda vive arriba del timeline.
  const [audio, setAudio] = useState<AudioDecodificado | null>(null);
  const [recortando, setRecortando] = useState(false);
  // offset del SEGMENTO en uso dentro del archivo (el reloj suma esto)
  const recorteDesdeRef = useRef(0);
  useEffect(() => {
    recorteDesdeRef.current = audio?.recorte?.desdeMs ?? 0;
  }, [audio]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const entradaAudioRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    let vivo = true;
    void cargarAudioGuardado(composicionId).then(async (registro) => {
      if (!registro || !vivo) return;
      const dec = await decodificarAudio(registro);
      if (dec && vivo) setAudio(dec);
    });
    return () => {
      vivo = false;
    };
  }, [composicionId]);
  useEffect(() => {
    if (!audio) return;
    const el = new Audio(audio.url);
    el.preload = "auto";
    // el archivo suena entero pero el proyecto usa un SEGMENTO: pasado su
    // fin, silencio (pausa) — el próximo play resincroniza
    if (audio.recorte) {
      const hastaS = audio.recorte.hastaMs / 1000;
      el.ontimeupdate = () => {
        if (el.currentTime >= hastaS) el.pause();
      };
    }
    audioElRef.current = el;
    return () => {
      el.pause();
      audioElRef.current = null;
    };
  }, [audio]);
  // cortes de escena en tiempo global: el registro trae las duraciones de
  // las no visitadas; la ACTIVA usa siempre la duración viva
  const cortes = useMemo(
    () =>
      cortesDeEscenas(
        escenas.map((e) => (e.id === escenaActiva ? { ...e, duracion: composicion.duracion } : e)),
      ),
    [escenas, escenaActiva, composicion.duracion],
  );
  const cortesRef = useRef(cortes);
  useEffect(() => {
    cortesRef.current = cortes;
  }, [cortes]);

  // los INICIOS de palabra de la transcripción que caen en la escena activa,
  // en tiempo LOCAL: el timeline los usa como imán al arrastrar keyframes y
  // spans — la animación se recuesta sobre la locución
  const tiemposDePalabras = useMemo(() => {
    const palabras = audio?.transcripcion?.palabras ?? [];
    if (palabras.length === 0) return [];
    const activa = cortes.find((c) => c.id === escenaActiva);
    const desde = activa?.desdeMs ?? 0;
    return palabras
      .map((p) => p.desdeMs - desde)
      .filter((ms) => ms >= 0 && ms <= composicion.duracion);
  }, [audio, cortes, escenaActiva, composicion.duracion]);

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
  /** Apunta el <audio> al punto global del playhead de la escena activa. */
  const sincronizarAudio = useCallback(() => {
    const el = audioElRef.current;
    if (!el) return;
    const corte = cortesRef.current.find((c) => c.id === escenaActivaRef.current);
    el.currentTime = (recorteDesdeRef.current + (corte?.desdeMs ?? 0) + tiempoRef.current) / 1000;
  }, []);

  // ——— VIDEO DE REFERENCIA: el archivo vive en IndexedDB (como el audio) y
  // acá se materializa en un <video> mudo cuyo currentTime esclaviza el
  // reloj del preview. pintar() solo dibuja el frame vivo. En otra máquina
  // el registro no está: placeholder + aviso, nunca romper. ———
  const videosRef = useRef(new Map<string, HTMLVideoElement | "cargando" | "falta">());
  const asegurarVideo = useCallback((videoId: string) => {
    if (videosRef.current.has(videoId)) return;
    videosRef.current.set(videoId, "cargando");
    void cargarVideoGuardado(videoId).then((registro) => {
      if (!registro) {
        videosRef.current.set(videoId, "falta");
        setAvisoGuardado(t("El video de referencia no está en este navegador: borrá la capa y subilo de nuevo"));
        return;
      }
      const el = document.createElement("video");
      el.muted = true;
      el.playsInline = true;
      el.preload = "auto";
      el.src = URL.createObjectURL(new Blob([registro.datos], { type: registro.tipo || "video/mp4" }));
      videosRef.current.set(videoId, el);
    });
  }, []);
  // al abrir (o cambiar de escena), los videos de las capas cargan solos
  useEffect(() => {
    for (const capa of composicion.capas) {
      if (capa.tipo === "video") asegurarVideo(capa.videoId);
    }
  }, [composicion, asegurarVideo]);
  // al desmontar el editor, los objectURL de los <video> se revocan (el
  // audio hace lo mismo en cada swap; acá el ciclo de vida es la sesión)
  useEffect(() => {
    const videos = videosRef.current;
    return () => {
      for (const el of videos.values()) {
        if (el instanceof HTMLVideoElement) {
          el.pause();
          URL.revokeObjectURL(el.src);
        }
      }
      videos.clear();
    };
  }, []);
  /** Esclaviza cada <video> al reloj: en play corrige deriva grande y lo
      mantiene andando (mudo); en pausa/scrub busca el frame exacto. */
  const sincronizarVideos = useCallback((tMs: number, enPlay: boolean) => {
    for (const capa of compRef.current.capas) {
      if (capa.tipo !== "video") continue;
      const el = videosRef.current.get(capa.videoId);
      if (!(el instanceof HTMLVideoElement) || el.readyState < 1) continue;
      let destino = ((capa.desde ?? 0) + tMs) / 1000;
      // pasado el final del archivo, clavado en el último frame
      if (Number.isFinite(el.duration)) destino = Math.min(destino, Math.max(0, el.duration - 0.001));
      const deriva = Math.abs(el.currentTime - destino);
      if (enPlay) {
        if (el.paused && deriva > 0.02) void el.play().catch(() => undefined);
        if (deriva > 0.18) el.currentTime = destino;
      } else {
        if (!el.paused) el.pause();
        if (deriva > 0.04 && !el.seeking) el.currentTime = destino;
      }
    }
  }, []);
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

  // Loop del preview: APAGADO por defecto — la escena se PARA en su último
  // frame al terminar (como un editor de video); el toggle ⟳ del transport
  // la hace dar la vuelta, y al dar la vuelta el audio vuelve a sonar.
  const [loop, setLoop] = useState(false);
  const loopRef = useRef(loop);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

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
        const dur = compRef.current.duracion;
        const avanzado = previo + dt;
        if (avanzado >= dur && !loopRef.current) {
          // fin de la escena, sin loop: clavado en el final y a pausa
          tiempoRef.current = dur;
          if (grabandoRef.current) detenerGrabacion();
          setReproduciendo(false);
        } else {
          tiempoRef.current = avanzado % dur;
          if (avanzado >= dur) {
            // la escena dio la vuelta: el audio vuelve al inicio de su tramo
            // y SE REANUDA (pudo haberse pausado al fin de su segmento)
            sincronizarAudio();
            const el = audioElRef.current;
            if (el && el.paused) void el.play().catch(() => undefined);
          }
          if (grabandoRef.current) {
            if (avanzado >= dur) {
              detenerGrabacion(); // la composición dio la vuelta: la toma terminó
            } else {
              const vista = lienzoRef.current?.vistaActual();
              if (vista) muestrasRef.current.push({ t: tiempoRef.current, ...vista });
            }
          }
        }
      }
      // el video de referencia sigue al reloj se venga de donde venga el
      // movimiento (play, scrub, cambio de escena): corrección por deriva
      sincronizarVideos(tiempoRef.current, reproduciendo && !document.hidden);
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
  }, [reproduciendo, detenerGrabacion, sincronizarAudio, sincronizarVideos]);

  // Play con el playhead clavado en el final = volver a empezar (sin esto,
  // tras parar al final, play pausaría al instante).
  const alternarPlay = useCallback(() => {
    setReproduciendo((r) => {
      if (!r && tiempoRef.current >= compRef.current.duracion - 1) {
        tiempoRef.current = 0;
        setTiempoUI(0);
      }
      return !r;
    });
  }, []);

  // El <audio> es ESCLAVO del reloj del preview: play arranca su tramo en el
  // punto global exacto, pausa lo frena. Con la escena activa cambiando, el
  // próximo play resincroniza solo.
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    if (reproduciendo) {
      sincronizarAudio();
      void el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [reproduciendo, audio, sincronizarAudio]);

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
      const res = await guardarComposicionAction(escenaActivaRef.current, serializar(composicion), revRef.current);
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
  }, [composicion, escenaActiva, snapshotInicial]);

  // ——— Escenas: guardar ya, montar, cambiar, crear ———
  // Cambiar de escena FLUSHEA el autosave de la actual (nada se pierde),
  // carga la otra y resetea lo transitorio: undo, selección, playhead.
  const guardarEscenaAhora = useCallback(async () => {
    if (timerGuardadoRef.current) {
      clearTimeout(timerGuardadoRef.current);
      timerGuardadoRef.current = null;
    }
    const res = await guardarComposicionAction(escenaActivaRef.current, serializar(compRef.current), revRef.current);
    if (res.ok) revRef.current = res.rev;
  }, []);

  const montarEscena = useCallback((comp: Composicion, id: string) => {
    setEscenaActiva(id);
    escenaActivaRef.current = id;
    revRef.current = comp.rev ?? 0;
    pasadoRef.current = [];
    futuroRef.current = [];
    fallosRef.current = 0;
    setComposicion(comp);
    setSeleccionId(null);
    setSeleccionIds([]);
    setSeleccionKf(null);
    setReproduciendo(false);
    tiempoRef.current = 0;
    setTiempoUI(0);
    setAvisoGuardado(null);
    requestAnimationFrame(() => lienzoRef.current?.encuadrar());
  }, []);

  const cambiarEscena = useCallback(async (id: string) => {
    if (id === escenaActivaRef.current) return;
    await guardarEscenaAhora();
    const cargada = await cargarComposicionAction(id);
    if (!cargada) {
      setAvisoGuardado(t("No se pudo cargar esa escena"));
      return;
    }
    montarEscena(deserializar(cargada.snapshot), id);
  }, [guardarEscenaAhora, montarEscena]);

  const crearEscena = useCallback(async (duplicar: boolean) => {
    await guardarEscenaAhora();
    // primer n libre: robusto aunque más adelante se borren escenas
    let n = escenasRef.current.length + 1;
    while (escenasRef.current.some((e) => e.id === idDeEscena(composicionId, n))) n++;
    const id = idDeEscena(composicionId, n);
    const nombre = `${t("Escena")} ${n}`;
    const comp = duplicar ? escenaDuplicada(compRef.current, nombre) : escenaNueva(compRef.current, nombre);
    const res = await guardarComposicionAction(id, serializar(comp), 0);
    if (!res.ok) {
      setAvisoGuardado(res.error);
      return;
    }
    persistirEscenas([...escenasRef.current, { id, nombre }]);
    montarEscena({ ...comp, rev: res.rev }, id);
  }, [composicionId, guardarEscenaAhora, montarEscena, persistirEscenas]);

  // ——— Borrar una escena: con confirmación INLINE (el chip pregunta) y
  // nunca la última. Si se va la activa, salta a la anterior sin guardar
  // lo que se está borrando. El documento queda en storage (el registro
  // del proyecto es la fuente de verdad de qué escenas lo componen).
  const [confirmandoBorrar, setConfirmandoBorrar] = useState<string | null>(null);
  useEffect(() => {
    if (!confirmandoBorrar) return;
    const timer = setTimeout(() => setConfirmandoBorrar(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmandoBorrar]);
  const borrarEscena = useCallback(async (id: string) => {
    const resultado = quitarEscena(escenasRef.current, id);
    if (!resultado) return;
    if (id !== escenaActivaRef.current) {
      persistirEscenas(resultado.restantes);
      return;
    }
    // la activa se va: cancelar su autosave pendiente (no guardarla) y
    // cargar el destino ANTES de tocar el registro — si falla, nada cambió
    if (timerGuardadoRef.current) {
      clearTimeout(timerGuardadoRef.current);
      timerGuardadoRef.current = null;
    }
    const cargada = await cargarComposicionAction(resultado.destino.id);
    if (!cargada) {
      setAvisoGuardado(t("No se pudo cargar la escena vecina: no se borró nada"));
      return;
    }
    persistirEscenas(resultado.restantes);
    montarEscena(deserializar(cargada.snapshot), resultado.destino.id);
  }, [persistirEscenas, montarEscena]);

  // Corre EN BLOQUE la animación de las capas seleccionadas (drag del
  // timeline con selección múltiple): deltas incrementales, snapeados al
  // frame por el caller; el checkpoint lo puso el gesto al cruzar el umbral.
  // Time-stretch grupal: el recuadro de la selección se estira desde un
  // borde y TODA la coreografía escala junta. El factor se aplica SIEMPRE
  // sobre la base congelada al arrancar el gesto (nada de acumulación).
  const estirarBaseRef = useRef<Composicion | null>(null);
  const iniciarEstirar = useCallback(() => {
    estirarBaseRef.current = structuredClone(compRef.current);
  }, []);
  const estirarSeleccionEnVivo = useCallback((pivote: number, factor: number) => {
    const base = estirarBaseRef.current;
    const ids = seleccionIdsRef.current;
    if (!base || ids.length < 2) return;
    setComposicion(estirarTiempoCapas(base, ids, pivote, factor));
  }, []);

  const desplazarSeleccionEnVivo = useCallback((dt: number) => {
    const ids = seleccionIdsRef.current.length
      ? seleccionIdsRef.current
      : seleccionRef.current && seleccionRef.current !== CAMARA_ID
        ? [seleccionRef.current]
        : [];
    if (!ids.length) return;
    setComposicion(desplazarTiempoCapas(compRef.current, ids, dt));
  }, []);

  // Duración de la escena: cuánto dura TODO lo que se renderiza de ella.
  const cambiarDuracion = useCallback((ms: number) => {
    const duracion = Math.min(120000, Math.max(500, Math.round(ms)));
    tiempoRef.current = Math.min(tiempoRef.current, duracion);
    setComposicion({ ...compRef.current, duracion });
  }, []);

  // El registro de escenas aprende la duración de la activa (los cortes del
  // audio la necesitan sin cargar cada escena). En microtask por el linter.
  useEffect(() => {
    let vivo = true;
    queueMicrotask(() => {
      if (!vivo) return;
      const actual = escenasRef.current.find((e) => e.id === escenaActivaRef.current);
      if (actual && actual.duracion !== composicion.duracion) {
        persistirEscenas(
          escenasRef.current.map((e) =>
            e.id === escenaActivaRef.current ? { ...e, duracion: composicion.duracion } : e,
          ),
        );
      }
    });
    return () => {
      vivo = false;
    };
  }, [composicion.duracion, persistirEscenas]);

  // ——— Audio del proyecto: saltar por la onda, cortar escenas, subir/quitar ———
  // Click en la franja: va a ese punto GLOBAL (cambia de escena si el punto
  // cae en otra) y deja el playhead en el tiempo local correspondiente.
  const saltarGlobal = useCallback(async (globalMs: number) => {
    const destino = escenaEnPunto(cortesRef.current, globalMs);
    if (!destino) return;
    if (destino.id !== escenaActivaRef.current) await cambiarEscena(destino.id);
    const ms = Math.min(destino.localMs, compRef.current.duracion);
    tiempoRef.current = ms;
    setTiempoUI(ms);
    sincronizarAudio();
    lienzoRef.current?.pintarAhora(ms);
  }, [cambiarEscena, sincronizarAudio]);

  // Soltar un corte sobre la onda: la escena que termina ahí pasa a durar
  // eso — separás la locución en segmentos escena por escena. La activa va
  // por el camino normal (undo incluido); una NO activa se edita en su
  // documento y el registro aprende la duración nueva.
  const cortarEscena = useCallback(async (id: string, ms: number) => {
    const duracion = Math.min(120000, Math.max(500, Math.round(ms)));
    if (id === escenaActivaRef.current) {
      registrar();
      cambiarDuracion(duracion);
      return;
    }
    const cargada = await cargarComposicionAction(id);
    if (!cargada) {
      setAvisoGuardado(t("No se pudo cargar esa escena para ajustarla"));
      return;
    }
    const comp = deserializar(cargada.snapshot);
    const res = await guardarComposicionAction(id, serializar({ ...comp, duracion }), comp.rev ?? 0);
    if (!res.ok) {
      setAvisoGuardado(res.error);
      return;
    }
    persistirEscenas(escenasRef.current.map((e) => (e.id === id ? { ...e, duracion } : e)));
  }, [registrar, cambiarDuracion, persistirEscenas]);

  const subirAudio = useCallback(async (archivo: File) => {
    const datos = await archivo.arrayBuffer();
    const registro = { proyecto: composicionId, nombre: archivo.name, tipo: archivo.type, datos };
    const dec = await decodificarAudio(registro);
    if (!dec) {
      setAvisoGuardado(t("Ese archivo no se pudo decodificar como audio"));
      return;
    }
    await recordarAudio(registro);
    setAudio((previo) => {
      if (previo) URL.revokeObjectURL(previo.url);
      return dec;
    });
    // primero elegís QUÉ PEDAZO de la locución va (el panel de recorte);
    // la duración de la escena vacía se fija al confirmar
    setRecortando(true);
  }, [composicionId]);

  // Aplica el segmento elegido (undefined = usar el archivo entero): se
  // guarda con el audio, se re-decodifica, y si la escena está VACÍA la
  // locución le marca el tempo (su largo + 10% de aire).
  const aplicarRecorte = useCallback(async (recorte: RecorteAudioTipo | undefined) => {
    setRecortando(false);
    await guardarRecorte(composicionId, recorte);
    const registro = await cargarAudioGuardado(composicionId);
    if (!registro) return;
    const dec = await decodificarAudio(registro);
    if (!dec) return;
    setAudio((previo) => {
      if (previo) URL.revokeObjectURL(previo.url);
      return dec;
    });
    if (compRef.current.capas.length === 0) {
      registrar();
      cambiarDuracion(duracionDesdeAudio(dec.duracionMs));
    }
  }, [composicionId, registrar, cambiarDuracion]);

  const quitarAudio = useCallback(() => {
    void olvidarAudio(composicionId);
    setAudio((previo) => {
      if (previo) URL.revokeObjectURL(previo.url);
      return null;
    });
  }, [composicionId]);

  // ——— Transcripción del audio del proyecto: Whisper LOCAL (nada sale de
  // la máquina). Las oraciones con timestamps quedan guardadas junto al
  // audio y pintadas sobre la forma de onda.
  const [transcribiendo, setTranscribiendo] = useState<string | null>(null);
  const transcribirAudio = useCallback(async () => {
    setTranscribiendo(t("Preparando…"));
    try {
      const registro = await cargarAudioGuardado(composicionId);
      if (!registro) return;
      const ctxAudio = new AudioContext();
      const buffer = await ctxAudio.decodeAudioData(registro.datos.slice(0));
      void ctxAudio.close().catch(() => undefined);
      // en WORKER: whisper masticando en el hilo principal congelaba la
      // página entera («Page Unresponsive») durante la transcripción
      const { transcribirConWorker } = await import("@/lib/motion/stt");
      setTranscribiendo(t("Transcribiendo…"));
      const recT = registro.recorte;
      const t0 = recT ? Math.max(0, Math.round((recT.desdeMs / 1000) * buffer.sampleRate)) : 0;
      const t1 = recT ? Math.min(buffer.length, Math.round((recT.hastaMs / 1000) * buffer.sampleRate)) : buffer.length;
      // slice (no subarray): al worker viaja SOLO el segmento copiado — un
      // subarray clonaría el buffer entero del archivo por cada canal
      const transcripcion = await transcribirConWorker(
        Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).slice(t0, Math.max(t0 + 1, t1))),
        buffer.sampleRate,
        (f) => setTranscribiendo(t("Bajando el modelo… {p}%", { p: Math.round(f * 100) })),
      );
      await guardarTranscripcion(composicionId, transcripcion);
      setAudio((previo) => (previo ? { ...previo, transcripcion } : previo));
    } catch (e) {
      setAvisoGuardado(e instanceof Error ? e.message : t("No se pudo transcribir el audio"));
    } finally {
      setTranscribiendo(null);
    }
  }, [composicionId]);

  // Corregir la transcripción se hace en el MODAL de palabras («Palabras» en
  // la franja): mover, borrar, renombrar y agregar con undo local. Al guardar,
  // la lista llega acá ya ordenada; las oraciones se recalculan de las
  // palabras y TODO persiste junto al audio — los imanes del timeline y la
  // locución que ve el agente se actualizan solos.
  const [editandoPalabras, setEditandoPalabras] = useState(false);
  // Ajuste RÁPIDO desde el carril (drag): mueve la palabra entera, REORDENA
  // por tiempo (cruzarla sobre otra no la deja inagarrable) y persiste.
  const moverPalabra = useCallback(
    (indice: number, desdeMs: number) => {
      setAudio((previo) => {
        const palabras = previo?.transcripcion?.palabras;
        if (!previo || !previo.transcripcion || !palabras?.[indice]) return previo;
        const transcripcion = { ...previo.transcripcion, palabras: moverPalabraLista(palabras, indice, desdeMs) };
        void guardarTranscripcion(composicionId, transcripcion);
        return { ...previo, transcripcion };
      });
    },
    [composicionId],
  );
  const guardarPalabras = useCallback(
    (palabras: Palabra[]) => {
      setEditandoPalabras(false);
      setAudio((previo) => {
        if (!previo) return previo;
        const oraciones = oracionesDePalabras(palabras);
        const transcripcion = {
          texto: oraciones.map((o) => o.texto).join(" "),
          oraciones,
          palabras,
        };
        void guardarTranscripcion(composicionId, transcripcion);
        return { ...previo, transcripcion };
      });
    },
    [composicionId],
  );

  // El PCM para el export: se decodifica del registro EN el momento (la UI
  // solo guarda picos). desdeMs global = inicio de la activa + rango local.
  const obtenerAudioExport = useCallback(async (todas: boolean, desdeMsLocal: number) => {
    const registro = await cargarAudioGuardado(composicionId);
    if (!registro) return null;
    try {
      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(registro.datos.slice(0));
      void ctx.close().catch(() => undefined);
      const rec = registro.recorte;
      const m0 = rec ? Math.max(0, Math.round((rec.desdeMs / 1000) * buffer.sampleRate)) : 0;
      const m1 = rec ? Math.min(buffer.length, Math.round((rec.hastaMs / 1000) * buffer.sampleRate)) : buffer.length;
      const canales = Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) =>
        buffer.getChannelData(i).subarray(m0, Math.max(m0 + 1, m1)),
      );
      const inicioActiva = todas
        ? 0
        : (cortesRef.current.find((c) => c.id === escenaActivaRef.current)?.desdeMs ?? 0);
      return { canales, sampleRate: buffer.sampleRate, desdeMs: inicioActiva + desdeMsLocal };
    } catch {
      return null; // audio indescifrable: el MP4 sale mudo, no roto
    }
  }, [composicionId]);


  // ——— Mutaciones ———
  // El checkpoint lo pone el CALLER al arrancar el gesto (drag que cruza el
  // umbral, foco de un campo): así un gesto entero es UN paso de undo y las
  // ediciones en vivo no inflan el historial.
  const editarEnVivo = useCallback((capaId: string, cambios: Partial<Capa>) => {
    const res = editarCapa(compRef.current, capaId, cambios);
    if (res.ok) setComposicion(res.valor);
  }, []);

  // ——— Media a mano: subir una imagen al lienzo, o REEMPLAZAR la de una
  // capa existente (cambiar la foto manteniendo posición, tamaño y
  // animación). Un solo input de archivo para los dos gestos: si hay una
  // capa marcada para reemplazo, el archivo va ahí; si no, capa nueva
  // centrada donde mira la cámara.
  const entradaMediaRef = useRef<HTMLInputElement | null>(null);
  const reemplazoMediaRef = useRef<string | null>(null);
  const subirImagen = useCallback(async (archivo: File) => {
    const capaId = reemplazoMediaRef.current;
    reemplazoMediaRef.current = null;
    const dataUri = await new Promise<string>((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onload = () => resolver(lector.result as string);
      lector.onerror = () => rechazar(lector.error);
      lector.readAsDataURL(archivo);
    });
    const imagen = new Image();
    const cargo = await new Promise<boolean>((resolver) => {
      imagen.onload = () => resolver(true);
      imagen.onerror = () => resolver(false);
      imagen.src = dataUri;
    });
    if (!cargo) {
      setAvisoGuardado(t("Ese archivo no se pudo leer como imagen"));
      return;
    }
    registrar();
    if (capaId) {
      // reemplazo: la caja y la animación quedan; solo cambia la tinta
      editarEnVivo(capaId, { mediaId: dataUri });
      return;
    }
    const comp = compRef.current;
    const { ancho, alto } = encajarMedia(imagen.naturalWidth, imagen.naturalHeight, comp.ancho, comp.alto);
    const vista = camaraEn(comp, tiempoRef.current);
    const capa: CapaMedia = {
      id: `media-${Date.now().toString(36)}`,
      nombre: archivo.name.replace(/\.[a-z0-9]+$/i, ""),
      tipo: "media",
      x: Math.round(vista.x),
      y: Math.round(vista.y),
      mediaId: dataUri,
      ancho,
      alto,
      ajuste: "cubrir",
    };
    const res = agregarCapa(comp, capa);
    if (res.ok) {
      setComposicion(res.valor);
      setSeleccionId(capa.id);
      setSeleccionIds([capa.id]);
    }
  }, [registrar, editarEnVivo]);
  const reemplazarMedia = useCallback((capaId: string) => {
    reemplazoMediaRef.current = capaId;
    entradaMediaRef.current?.click();
  }, []);

  // ——— VIDEO DE REFERENCIA: cae de FONDO (primero en el z-order), cubre el
  // frame y queda solo como guía del preview — jamás sale en un export. El
  // archivo entero va a IndexedDB (como el audio); al JSON solo el id. ———
  const entradaVideoRef = useRef<HTMLInputElement | null>(null);
  const subirVideo = useCallback(async (archivo: File) => {
    const datos = await archivo.arrayBuffer();
    const videoId = `video-${Date.now().toString(36)}`;
    const tipo = archivo.type || "video/mp4";
    const el = document.createElement("video");
    el.muted = true;
    el.playsInline = true;
    el.preload = "auto";
    el.src = URL.createObjectURL(new Blob([datos], { type: tipo }));
    const cargo = await new Promise<boolean>((resolver) => {
      el.onloadedmetadata = () => resolver(true);
      el.onerror = () => resolver(false);
    });
    if (!cargo) {
      URL.revokeObjectURL(el.src); // el blob huérfano no se queda vivo
      setAvisoGuardado(t("Ese archivo no se pudo leer como video"));
      return;
    }
    await recordarVideo({ videoId, nombre: archivo.name, tipo, datos });
    videosRef.current.set(videoId, el);
    registrar();
    const comp = compRef.current;
    const capa: CapaVideo = {
      id: videoId,
      nombre: archivo.name.replace(/\.[a-z0-9]+$/i, ""),
      tipo: "video",
      x: comp.ancho / 2,
      y: comp.alto / 2,
      ancho: comp.ancho,
      alto: comp.alto,
      ajuste: "cubrir",
      videoId,
      referencia: true,
      v: Date.now(),
    };
    setComposicion({ ...comp, capas: [capa, ...comp.capas] });
    setSeleccionId(capa.id);
    setSeleccionIds([capa.id]);
  }, [registrar]);

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

  // Alt-drag sobre una POSE de cámara: copia los keyframes de x/y/zoom de la
  // pose fuente en nuevoT — la pose original no se toca.
  const duplicarPoseCamaraEnVivo = useCallback((tFuente: number, nuevoT: number) => {
    const pose = poseCamaraEn(compRef.current, tFuente);
    if (Object.keys(pose).length === 0) return;
    setComposicion(agregarKeyframeCamara(compRef.current, nuevoT, pose));
    setSeleccionKf({ tipo: "camara", t: nuevoT });
  }, []);

  // Alt-drag sobre un keyframe: nace una COPIA (mismo valor, easing y hold)
  // en nuevoT y el gesto sigue arrastrándola; el original queda intacto.
  const duplicarKeyframeEnVivo = useCallback(
    (capaId: string, propiedad: NombrePropiedad, tFuente: number, nuevoT: number) => {
      const capa = compRef.current.capas.find((c) => c.id === capaId);
      const kf = capa?.pistas?.[propiedad]?.find((k) => k.t === tFuente);
      if (!kf) return;
      const res = ponerKeyframe(compRef.current, capaId, propiedad, { ...kf, t: nuevoT });
      if (res.ok) {
        setComposicion(res.valor);
        setSeleccionKf({ tipo: "capa", capaId, propiedad, t: nuevoT });
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
  // Aplica un PAR de la biblioteca según el modo de sus tres botones:
  // «entrada» pone el in, «salida» el out, «ambas» los dos de una (con UN
  // paso de undo). Cada mitad conserva el timing existente de esa clase.
  const aplicarPar = useCallback((par: { entrada?: string; salida?: string }, modo: "entrada" | "salida" | "ambas", division: "caracteres" | "palabras" | "lineas" | null = null) => {
    const id = seleccionRef.current;
    const nombreCorto = par.entrada ?? par.salida ?? "";
    if (!id || id === CAMARA_ID) {
      setAvisoGuardado(t("Seleccioná una capa para ponerle «{preset}»", { preset: nombreCorto }));
      return;
    }
    const comp = compRef.current;
    const capa = comp.capas.find((c) => c.id === id);
    if (!capa) return;

    // la división elegida en la biblioteca (letras/palabras/líneas) pisa la
    // de la capa; «» respeta la que está
    const divisionFinal = capa.tipo === "texto" && division ? division : capa.tipo === "texto" ? capa.division : "ninguna";
    const armarSegmento = (preset: string): Segmento | string => {
      const def = PRESETS[preset];
      if (!def) return t("no existe el preset «{preset}»", { preset });
      const compilado = def.compilar({});
      if ((compilado.pista.dTrazoInicio || compilado.pista.dTrazoFin) && capa.tipo !== "trazo") {
        return t("«{preset}» es un efecto de trazos: «{nombre}» es {tipo}", { preset, nombre: capa.nombre, tipo: capa.tipo });
      }
      if (compilado.tracking && capa.tipo !== "texto") {
        return t("«{preset}» es de tracking (letras): en una capa {tipo} no hace nada", { preset, tipo: capa.tipo });
      }
      const clase = def.clase;
      const previo = capa[clase];
      const seg: Segmento = previo
        ? { ...previo, preset }
        : clase === "entrada"
          ? { preset, en: 0, duracion: 700, easing: "salidaExpo", escalonado: capa.tipo === "texto" ? 40 : undefined }
          : { preset, en: Math.max(0, comp.duracion - 900), duracion: 600, easing: "entradaCubic", escalonado: capa.tipo === "texto" ? 25 : undefined };
      // una capa dividida sin escalonado se anima como bloque entero: si el
      // timing heredado no traía, le va el default sano de su división
      if (capa.tipo === "texto" && divisionFinal !== "ninguna" && !seg.escalonado) {
        seg.escalonado = escalonadoSano(divisionFinal);
      }
      return seg;
    };

    const presetes: { preset: string; clase: "entrada" | "salida" }[] = [];
    if ((modo === "entrada" || modo === "ambas") && par.entrada) presetes.push({ preset: par.entrada, clase: "entrada" });
    if ((modo === "salida" || modo === "ambas") && par.salida) presetes.push({ preset: par.salida, clase: "salida" });
    if (presetes.length === 0) return;

    const cambios: Partial<Capa> = {};
    if (capa.tipo === "texto" && division && capa.division !== division) {
      (cambios as { division?: typeof division }).division = division;
    }
    for (const { preset, clase } of presetes) {
      const seg = armarSegmento(preset);
      if (typeof seg === "string") {
        setAvisoGuardado(seg);
        return;
      }
      (cambios as Record<"entrada" | "salida", Segmento>)[clase] = seg;
    }
    registrar();
    editarEnVivo(id, cambios);
    setAvisoGuardado(
      modo === "ambas"
        ? t("«{nombre}» tiene entrada «{ein}» y salida «{eout}»", { nombre: capa.nombre, ein: par.entrada ?? "", eout: par.salida ?? "" })
        : t("«{preset}» puesto como {clase} de «{nombre}»", { preset: presetes[0].preset, clase: presetes[0].clase, nombre: capa.nombre }),
    );
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

  const definirTemblor = useCallback((temblor: TemblorCamara | undefined) => {
    setComposicion(definirTemblorCamara(compRef.current, temblor));
  }, []);

  const keyframeCamaraAhora = useCallback(() => {
    registrar();
    const vista = camaraEn(compRef.current, tiempoRef.current);
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
    videoDe: (videoId: string) => {
      const el = videosRef.current.get(videoId);
      if (el === undefined) {
        asegurarVideo(videoId);
        return null;
      }
      return el instanceof HTMLVideoElement && el.readyState >= 2 ? el : null;
    },
  }), [asegurarVideo]);

  // ——— SENSACIÓN de la pieza: la perilla snappy ↔ suave, arriba del chat.
  // Arrastrar = PREVIEW en vivo (el Lienzo lee por getter y repinta solo);
  // «Aplicar» = la transformación de verdad, como UN paso de undo. El
  // registro elegido viaja además al director en cada pedido. ———
  const [sensacion, setSensacion] = useState<Sensacion>(0);
  // espejo en ref para los getters (contexto del director): se actualiza
  // en el handler, nunca durante el render (regla react-hooks/refs)
  const sensacionRef = useRef<Sensacion>(0);
  const previewSensacionRef = useRef<Composicion | null>(null);
  const previsualizarSensacion = (s: Sensacion) => {
    setSensacion(s);
    sensacionRef.current = s;
    previewSensacionRef.current = Math.abs(s) < 0.02 ? null : aplicarSensacion(compRef.current, s);
  };
  const soltarSensacion = () => {
    // soltar el deslizador NO aplica: vuelve al estado real (probar ≠ comprometer)
    previewSensacionRef.current = null;
  };
  const aplicarSensacionAPieza = () => {
    const s = sensacionRef.current;
    previewSensacionRef.current = null;
    if (Math.abs(s) < 0.02) return;
    registrar();
    const marca = Math.max(0, ...compRef.current.capas.map((c) => c.v ?? 0)) + 1;
    setComposicion(aplicarSensacion(compRef.current, s, marca));
  };

  // ——— Frames para la REVISIÓN VISUAL del director: el motor es
  // determinista, así que pintar acá (cámara incluida, con la media ya
  // cacheada del preview) ES lo que ve el usuario. 768px de ancho: legible
  // para el modelo multimodal y barato en tokens. JPEG no tiene alfa: una
  // base oscura evita que un lienzo transparente viaje negro-misterio. ———
  const renderizarFramesRevision = useCallback(async (snapshot: string, tiempos: number[]): Promise<ImagenRevision[]> => {
    // el director revisa el RENDER REAL: sin el video de referencia, igual
    // que el export (la referencia es guía del humano, no de la pieza)
    const comp = sinCapasReferencia(deserializar(snapshot));
    const escala = 768 / comp.ancho;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(comp.ancho * escala);
    canvas.height = Math.round(comp.alto * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return [];
    const media = obtenerMedia();
    return tiempos.map((tiempo) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#17171b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(escala, 0, 0, escala, 0, 0);
      pintar(estadoVivo(comp, tiempo), ctx as unknown as Contexto2D, media, escala);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
      return { mime: "image/jpeg", datosBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
    });
  }, [obtenerMedia]);

  // LECTURA DE PANTALLA: el director VE el diseño en reposo antes de animar
  // — una imagen por pantalla (con su fondo), las páginas largas en tramos.
  // Mismo pintor que el render; lo que ve es lo que hay.
  const renderizarLectura = useCallback(async (snapshot: string): Promise<{ imagenes: ImagenRevision[]; contexto: string }> => {
    const comp = sinCapasReferencia(deserializar(snapshot));
    const plan = planDeLectura(comp);
    if (plan.length === 0) return { imagenes: [], contexto: "" };
    const media = obtenerMedia();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return { imagenes: [], contexto: "" };
    const imagenes: ImagenRevision[] = [];
    for (const tramo of plan) {
      canvas.width = Math.round(tramo.comp.ancho * tramo.escala);
      canvas.height = Math.round((tramo.yHasta - tramo.yDesde) * tramo.escala);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = tramo.comp.fondo || comp.fondo || "#17171b";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // la escena ya mira la placa entera con su cámara fija: el tramo es
      // un corrimiento vertical en px de render
      ctx.setTransform(tramo.escala, 0, 0, tramo.escala, 0, -tramo.yDesde * tramo.escala);
      pintar(estadoVivo(tramo.comp, 0), ctx as unknown as Contexto2D, media, tramo.escala);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
      imagenes.push({ mime: "image/jpeg", datosBase64: dataUrl.slice(dataUrl.indexOf(",") + 1) });
    }
    return { imagenes, contexto: contextoDeLectura(plan) };
  }, [obtenerMedia]);

  // GANCHO DE DESARROLLO (nunca en producción): el editor expone snapshot,
  // carga y lectura en window.__motion para el director externo (guiones
  // aplicados sin modelo desde un driver headless) y los smokes de Playwright.
  useEffect(() => {
    if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
    const w = window as unknown as { __motion?: unknown };
    w.__motion = {
      snapshot: () => serializar(compRef.current),
      cargar: (snapshot: string) => {
        registrar();
        setComposicion(deserializar(snapshot));
      },
      lectura: (snapshot?: string) => renderizarLectura(snapshot ?? serializar(compRef.current)),
      // frames del RENDER (lo que ve la cámara) en los ms pedidos: la
      // revisión visual del director externo
      frames: (tiempos: number[], snapshot?: string) => renderizarFramesRevision(snapshot ?? serializar(compRef.current), tiempos),
    };
    return () => {
      delete w.__motion;
    };
  }, [registrar, renderizarLectura, renderizarFramesRevision]);

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
    // el y original ya contaba las líneas EXPLÍCITAS del contenido: acá se
    // corrige sólo por las que el wrap agregó (el motor centra el bloque)
    const n0 = original.split("\n").length;
    const interlineado = capa.fuente.interlineado ?? capa.fuente.tamano * 1.15;
    return { texto, y: yOriginal + ((n - n0) / 2) * interlineado };
  }, []);

  const reajustarTextos = useCallback((comp: Composicion, reajustes: ResultadoImport["reajustes"]): Composicion => {
    reajustesRef.current = [];
    if (!reajustes.length) return comp;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return comp;
    const capas = comp.capas.map((c) => {
      const ajuste = reajustes.find((r) => r.capaId === c.id);
      // aplica sólo si al texto le FALTAN líneas (los \n explícitos de autor
      // cuentan: el wrap de la caja puede convivir con ellos)
      if (!ajuste || c.tipo !== "texto" || c.texto.split("\n").length >= ajuste.lineas) return c;
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
    // Paradigma canvas: el FORMATO del render es del proyecto (16:9, 9:16…)
    // y una pantalla importada NUNCA lo pisa — entra al lienzo como pantalla
    // y la cámara la encuadra adentro (una landing de 9000px de alto se ve a
    // lo ancho desde arriba). El lote conserva su disposición relativa de
    // Figma; sobre un lienzo con contenido, el lote ENTERO se suma a la
    // derecha. TODA pantalla entra por sumarAlLienzo, así queda agrupada con
    // su placa (arrastrás la placa = movés la pantalla entera).
    const actual = compRef.current;
    const seSuma = actual.capas.length > 0;
    // lienzo vacío: el frame presta su NOMBRE y su FONDO a la composición
    // (lo que se ve fuera de la placa); ancho/alto/fps quedan los del proyecto
    const primera = pantallas[0].resultado.composicion;
    let comp: Composicion = seSuma ? actual : { ...actual, nombre: primera.nombre, fondo: primera.fondo };
    const origenX = seSuma ? Math.ceil(bordeDerechoLienzo(actual) + 200) : 0;
    const reajustes: ResultadoImport["reajustes"] = [];
    const anclas: ResultadoImport["anclas"] = [];
    for (const pantalla of pantallas) {
      const paso = sumarAlLienzo(comp, pantalla.resultado, origenX + pantalla.dx, pantalla.dy);
      comp = paso.composicion;
      reajustes.push(...paso.reajustes);
      anclas.push(...paso.anclas);
    }
    if (!seSuma) {
      // la primera pantalla del proyecto: la cámara arranca encuadrándola
      // en el formato elegido — cámara NUEVA (los keyframes de un lienzo
      // vaciado no valen, y taparían la base en sus canales)
      const placa = comp.capas.find(esPlaca);
      if (placa && placa.tipo === "forma") {
        comp = { ...comp, camara: camaraParaLienzoNuevo(comp, { x: placa.x, y: placa.y, ancho: placa.ancho, alto: placa.alto }) };
      }
    }
    anclasRef.current = anclas.map((a) => ({ ...a }));
    const final = anclarTextos(reajustarTextos(medirTrazos(comp), reajustes));
    setComposicion(final);
    setSeleccionId(null);
    tiempoRef.current = 0;
    setTiempoUI(0);
    const avisos = pantallas.reduce((s, p) => s + p.resultado.avisos.length, 0);
    setDetalleImport(pantallas.flatMap((p) => p.resultado.avisos));
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

  // ——— FORMATO del render: decisión del proyecto (ver formato-puro) ———
  // SIN checkpoint propio: el caller lo pone UNA vez por gesto (onInicio del
  // campo al arrastrar, onCheckpoint del preset) — si no, cada pointermove
  // del arrastre de Ancho/Alto apilaba un paso de undo
  const cambiarFormato = useCallback((ancho: number, alto: number) => {
    const nueva = conFormato(compRef.current, ancho, alto);
    if (nueva.ancho === compRef.current.ancho && nueva.alto === compRef.current.alto) return;
    setComposicion(nueva);
    // el frame de render cambió de forma: que el viewport lo vuelva a mostrar
    requestAnimationFrame(() => lienzoRef.current?.encuadrar());
  }, []);

  // encuadra la PRIMERA pantalla del lienzo en el formato actual, con la
  // semántica auto-key de la cámara (base si no hay keyframes; keyframe en
  // el playhead si los hay) — así el encuadre siempre se ve
  const encuadrarPantalla = useCallback(() => {
    const comp = compRef.current;
    const placa = comp.capas.find(esPlaca);
    if (!placa || placa.tipo !== "forma") return;
    registrar();
    setComposicion(encuadrarCamara(comp, { x: placa.x, y: placa.y, ancho: placa.ancho, alto: placa.alto }, alFrameActual()));
    requestAnimationFrame(() => lienzoRef.current?.encuadrar());
  }, [registrar, alFrameActual]);

  // ⌘A: todas las capas reales (el video de referencia no es operable)
  const seleccionarTodas = useCallback(() => {
    const ids = compRef.current.capas.filter((c) => c.tipo !== "video").map((c) => c.id);
    if (!ids.length) return; // nada operable: no pisar la selección que haya
    setSeleccionIds(ids);
    setSeleccionId(ids[ids.length - 1]);
  }, []);

  // ⌘] / ⌘[: la selección sube o baja un escalón en el z-order (como AE)
  const moverSeleccionEnZ = useCallback((direccion: 1 | -1) => {
    const ids = seleccionIdsRef.current.length
      ? seleccionIdsRef.current
      : seleccionRef.current && seleccionRef.current !== CAMARA_ID
        ? [seleccionRef.current]
        : [];
    if (!ids.length) return;
    const nueva = desplazarEnZ(compRef.current, ids, direccion);
    if (nueva === compRef.current) return;
    registrar();
    setComposicion(nueva);
  }, [registrar]);

  // ——— Atajos (§8.1): un solo keydown, con el guard de inputs ———
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        if (enInput()) return;
        e.preventDefault();
        alternarPlay();
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
      } else if (meta && e.key === "a") {
        e.preventDefault();
        seleccionarTodas();
      } else if (meta && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        moverSeleccionEnZ(e.key === "]" ? 1 : -1);
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
  }, [deshacer, rehacer, saltarFrame, copiarKfSeleccionado, pegarKf, borrarKfSeleccionado, borrarSeleccionadas, alternarPlay, seleccionarTodas, moverSeleccionEnZ]);

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


  // El panel de Efectos es un TAB plegable (como la fila «Cámara»): el
  // estado sobrevive a recargar — plegado, el panel de capas gana el alto.
  const [efectosAbiertos, setEfectosAbiertos] = useState(() => {
    try {
      return typeof localStorage === "undefined" || localStorage.getItem("motion-efectos") !== "plegado";
    } catch {
      return true; // sin storage: queda abierto
    }
  });
  const alternarEfectos = useCallback(() => {
    setEfectosAbiertos((v) => {
      const nuevo = !v;
      try {
        localStorage.setItem("motion-efectos", nuevo ? "abierto" : "plegado");
      } catch {
        /* sin storage */
      }
      return nuevo;
    });
  }, []);

  const capaSeleccionada = composicion.capas.find((c) => c.id === seleccionId) ?? null;

  return (
    <div className="grid h-dvh grid-cols-[240px_1fr_300px] overflow-hidden">
      <div className="flex min-h-0 flex-col">
        <div className={efectosAbiertos ? "h-1/2 min-h-0" : "min-h-0 flex-1"}>
          <Capas
            composicion={composicion}
            seleccionId={seleccionId}
            seleccionIds={seleccionIds}
            onSeleccionar={seleccionar}
            onAlternarSeleccion={alternarSeleccion}
            onSeleccionarVarias={seleccionarVarias}
            onAlternarVisibilidad={alternarVisibilidad}
            onCheckpoint={registrar}
            onReordenarCapa={reordenarCapaEnVivo}
            onReordenarPantalla={reordenarPantallaEnVivo}
            onBorrarCapa={borrarCapa}
          />
        </div>
        <div className={`${efectosAbiertos ? "h-1/2 min-h-0" : "shrink-0"} border-r border-(--glass-border)`}>
          <PanelBiblioteca
            onAplicar={aplicarPar}
            tipoSeleccion={composicion.capas.find((c) => c.id === seleccionId)?.tipo ?? null}
            abierto={efectosAbiertos}
            onAlternar={alternarEfectos}
          />
        </div>
      </div>
      <div className="flex min-h-0 flex-col">
        <div className="relative min-h-0 flex-1">
          <Lienzo
            ref={lienzoRef}
            obtenerComposicion={() => previewSensacionRef.current ?? compRef.current}
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
          {/* barra de ESCENAS: el corte duro del proyecto — cada chip es una
              composición completa; + crea (mismo formato, lienzo vacío) y ⧉
              duplica la escena activa */}
          <div className="absolute left-3 top-3 z-10 flex max-w-[60%] flex-wrap items-center gap-1">
            {escenas.map((esc) => (
              <div
                key={esc.id}
                className={[
                  "flex h-7 items-center rounded-control shadow-control transition-colors",
                  esc.id === escenaActiva ? "bg-ink/[0.12]" : "hover:bg-ink/[0.06]",
                ].join(" ")}
              >
                <button
                  type="button"
                  onClick={() => void cambiarEscena(esc.id)}
                  aria-pressed={esc.id === escenaActiva}
                  className={[
                    "h-full pl-2.5 text-[12px]",
                    escenas.length > 1 ? "pr-1" : "pr-2.5",
                    esc.id === escenaActiva
                      ? "font-medium text-foreground"
                      : "text-foreground/60 hover:text-foreground/90",
                  ].join(" ")}
                >
                  {esc.nombre}
                </button>
                {escenas.length > 1 &&
                  (confirmandoBorrar === esc.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmandoBorrar(null);
                        void borrarEscena(esc.id);
                      }}
                      className="h-full rounded-r-control bg-peligro/15 px-2 text-[11px] font-medium text-peligro hover:bg-peligro/25"
                    >
                      {t("¿Borrar?")}
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={t("Borrar la escena {nombre}", { nombre: esc.nombre })}
                      title={t("Borrar esta escena (pide confirmar)")}
                      onClick={() => setConfirmandoBorrar(esc.id)}
                      className="h-full px-1.5 text-[13px] leading-none text-foreground/35 hover:text-peligro"
                    >
                      ×
                    </button>
                  ))}
              </div>
            ))}
            <ConPista pista={t("Escena nueva — mismo formato, lienzo vacío")}>
              <BotonIcono tam={28} etiqueta={t("Escena nueva")} onClick={() => void crearEscena(false)}>
                <span aria-hidden className="text-[16px] leading-none">+</span>
              </BotonIcono>
            </ConPista>
            <ConPista pista={t("Duplicar la escena activa")}>
              <BotonIcono tam={28} etiqueta={t("Duplicar la escena")} onClick={() => void crearEscena(true)}>
                <span aria-hidden className="text-[13px] leading-none">⧉</span>
              </BotonIcono>
            </ConPista>
            <ConPista pista={t("Audio del proyecto — subí la voz en off o la música: su forma de onda estructura las escenas")}>
              <BotonIcono
                tam={28}
                etiqueta={t("Audio del proyecto")}
                activo={Boolean(audio)}
                onClick={() => entradaAudioRef.current?.click()}
              >
                <span aria-hidden className="text-[13px] leading-none">♪</span>
              </BotonIcono>
            </ConPista>
            <input
              ref={entradaAudioRef}
              type="file"
              accept="audio/*,video/mp4,video/webm"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void subirAudio(archivo);
                e.target.value = "";
              }}
            />
          </div>
          {/* ESTADO VACÍO: recién abierto el módulo, el lienzo ofrece por
              dónde arrancar — la voz en off marca el tempo de la escena */}
          {composicion.capas.length === 0 && (
            <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center">
              <div className="pointer-events-auto w-80 rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-4 text-center shadow-(--menu-shadow)">
                <div className="text-[14px] font-semibold text-foreground">{t("Arranquemos esta escena")}</div>
                <p className="mt-1 text-[12px] leading-snug text-muted">
                  {audio
                    ? t("El audio ya está: traé el diseño de Figma o una imagen, o cortá la locución en escenas sobre la onda.")
                    : t("Subí la voz en off para marcar el tempo — la escena toma su largo solo — o arrancá por el diseño.")}
                </p>
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.02em] text-foreground/50">{t("Formato del render")}</div>
                  <Segmentado
                    etiquetaAria={t("Formato del render")}
                    valor={formatoDe(composicion)}
                    opciones={FORMATOS.map((f) => ({ valor: f.id, nombre: f.id }))}
                    onCambio={(v) => {
                      const f = FORMATOS.find((x) => x.id === v);
                      if (!f) return;
                      registrar();
                      cambiarFormato(f.ancho, f.alto);
                    }}
                  />
                </div>
                <div className="mt-3 flex flex-col gap-1.5">
                  {!audio && (
                    <button
                      type="button"
                      onClick={() => entradaAudioRef.current?.click()}
                      className="boton h-9 rounded-control bg-acento px-3 text-sm font-semibold text-white hover:bg-acento/85"
                    >
                      {t("Subir el audio / voz en off")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setImportarAbierto(true)}
                    className="flex h-8 items-center justify-center rounded-control px-2 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
                  >
                    {t("Importar la pantalla de Figma")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      reemplazoMediaRef.current = null;
                      entradaMediaRef.current?.click();
                    }}
                    className="flex h-8 items-center justify-center rounded-control px-2 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
                  >
                    {t("Subir una imagen")}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="absolute bottom-3 left-3 flex items-center gap-2">
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
            {/* la VERSIÓN corriendo (SHA corto del commit, next.config):
                «¿estoy en la build correcta?» se responde acá */}
            {process.env.NEXT_PUBLIC_MOTION_REV && (
              <ConPista pista={t("La versión que está corriendo (el commit del build)")}>
                <span className="select-text rounded-control px-1.5 py-1 font-mono text-[10px] leading-none text-foreground/40 shadow-control">
                  {process.env.NEXT_PUBLIC_MOTION_REV}
                </span>
              </ConPista>
            )}
          </div>
          <div className="absolute right-3 top-3 flex items-start gap-2">
            <ConPista pista={t("Importar pantalla de Figma")}>
              <BotonIcono tam={32} etiqueta={t("Importar pantalla de Figma")} onClick={() => setImportarAbierto(true)}>
                <Icono nombre="subir" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <ConPista pista={t("Subir una imagen al lienzo — cae como capa donde mira la cámara")}>
              <BotonIcono
                tam={32}
                etiqueta={t("Subir imagen")}
                onClick={() => {
                  reemplazoMediaRef.current = null;
                  entradaMediaRef.current?.click();
                }}
              >
                <Icono nombre="biblioteca" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <input
              ref={entradaMediaRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void subirImagen(archivo);
                e.target.value = "";
              }}
            />
            <ConPista pista={t("Video de referencia — de fondo, solo guía del preview: no sale en el export")}>
              <BotonIcono
                tam={32}
                etiqueta={t("Video de referencia")}
                onClick={() => entradaVideoRef.current?.click()}
              >
                <Icono nombre="pelicula" width={15} height={15} />
              </BotonIcono>
            </ConPista>
            <input
              ref={entradaVideoRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) void subirVideo(archivo);
                e.target.value = "";
              }}
            />
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
              obtenerAudioExport={obtenerAudioExport}
              contarEscenas={() => escenasRef.current.length}
              obtenerEscenas={async () => {
                await guardarEscenaAhora();
                const lista: Composicion[] = [];
                for (const esc of escenasRef.current) {
                  if (esc.id === escenaActivaRef.current) {
                    lista.push(compRef.current);
                    continue;
                  }
                  const cargada = await cargarComposicionAction(esc.id);
                  if (cargada) lista.push(deserializar(cargada.snapshot));
                }
                return lista;
              }}
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
          {avisoGuardado && (
            <div
              role="status"
              className="absolute left-1/2 top-3 max-w-xl -translate-x-1/2 rounded-control border border-peligro/30 bg-(--menu-solido-bg) px-3 py-1.5 text-xs text-foreground shadow-(--menu-shadow)"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">{avisoGuardado}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAvisoGuardado(null);
                    setDetalleImport([]);
                  }}
                  aria-label={t("Cerrar el aviso")}
                  className="shrink-0 text-foreground/50 hover:text-foreground"
                >
                  ×
                </button>
              </div>
              {avisoGuardado.includes("aviso") && detalleImport.length > 0 && (
                <ul className="mt-1.5 max-h-32 overflow-y-auto border-t border-(--panel-border) pt-1.5 text-[11px] leading-snug text-muted">
                  {detalleImport.map((aviso, i) => (
                    <li key={i}>· {aviso}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {audio && (
          <AudioDeProyecto
            audio={audio}
            cortes={cortes}
            escenaActiva={escenaActiva}
            tiempoMs={tiempoUI}
            onSaltar={(globalMs) => void saltarGlobal(globalMs)}
            onCortar={(id, ms) => void cortarEscena(id, ms)}
            onQuitar={quitarAudio}
            onRecortarAudio={() => setRecortando(true)}
            onTranscribir={() => void transcribirAudio()}
            onEditarPalabras={audio.transcripcion ? () => setEditandoPalabras(true) : undefined}
            onMoverPalabra={moverPalabra}
            transcribiendo={transcribiendo}
          />
        )}
        {audio && recortando && (
          <RecorteAudio
            audio={audio}
            onConfirmar={(desdeMs, hastaMs) => void aplicarRecorte({ desdeMs, hastaMs })}
            onUsarTodo={() => void aplicarRecorte(undefined)}
            onCerrar={() => setRecortando(false)}
          />
        )}
        {audio && editandoPalabras && (
          <EditarPalabras
            audio={audio}
            onGuardar={guardarPalabras}
            onCerrar={() => setEditandoPalabras(false)}
          />
        )}
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
          onDuracion={cambiarDuracion}
          onDesplazarSeleccion={desplazarSeleccionEnVivo}
          onInicioEstirar={iniciarEstirar}
          onEstirarSeleccion={estirarSeleccionEnVivo}
          onTogglePlay={alternarPlay}
          loop={loop}
          onLoop={() => setLoop((v) => !v)}
          onSaltarFrame={saltarFrame}
          onSeleccionar={seleccionar}
          onCheckpoint={registrar}
          onRetimarSegmento={retimarSegmento}
          onMoverKeyframe={moverKeyframeEnVivo}
          onDuplicarKeyframe={duplicarKeyframeEnVivo}
          onMoverPoseCamara={moverPoseCamaraEnVivo}
          onDuplicarPoseCamara={duplicarPoseCamaraEnVivo}
          seleccionKf={seleccionKf}
          onSeleccionarKf={setSeleccionKf}
          tiemposDeSnap={tiemposDePalabras}
        />
      </div>
      <div className="flex min-h-0 flex-col">
        {/* arriba la config de la capa (todo el resto); abajo, FIJO, el chat
            de diosa con su agarradera para cambiarle el alto */}
        <div className="min-h-0 flex-1 overflow-y-auto">
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
              onTemblor={definirTemblor}
              onFormato={cambiarFormato}
              onEncuadrarPantalla={encuadrarPantalla}
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
              onReemplazarMedia={reemplazarMedia}
            />
          )}
        </div>
        {conAgente && (
          <>
            <div
              role="separator"
              aria-label={t("Cambiar el alto del chat")}
              aria-orientation="horizontal"
              className="group relative h-1.5 shrink-0 cursor-ns-resize"
              onPointerDown={(e) => {
                redimenChatRef.current = { y0: e.clientY, alto0: altoChat };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const r = redimenChatRef.current;
                if (r) setAltoChat(Math.min(Math.round(window.innerHeight * 0.75), Math.max(160, r.alto0 - (e.clientY - r.y0))));
              }}
              onPointerUp={() => (redimenChatRef.current = null)}
            >
              <div className="absolute inset-x-0 top-0.5 mx-auto h-0.5 w-10 rounded-full bg-foreground/15 transition-colors duration-200 group-hover:bg-acento" />
            </div>
            {/* la SENSACIÓN vive arriba del chat: es el registro de la
                pieza, y el director lo respeta en cada pedido */}
            <div className="flex shrink-0 items-center gap-2 border-t border-(--glass-border) bg-(--chrome-bg) px-3 py-1.5">
              <span className="shrink-0 text-[11px] text-muted">{t("snappy")}</span>
              <Deslizador
                valor={sensacion}
                min={-1}
                max={1}
                etiqueta={t("Sensación de la pieza: snappy (izquierda) a suave (derecha) — arrastrá para previsualizar, Aplicar la esculpe")}
                onCambio={previsualizarSensacion}
                onSoltar={soltarSensacion}
              />
              <span className="shrink-0 text-[11px] text-muted">{t("suave")}</span>
              <button
                type="button"
                onClick={aplicarSensacionAPieza}
                disabled={Math.abs(sensacion) < 0.02}
                className="shrink-0 rounded-control px-2 py-0.5 text-[11px] text-foreground shadow-control hover:bg-ink/[0.06] disabled:opacity-30"
              >
                {t("Aplicar")}
              </button>
            </div>
            <div className="min-h-0 shrink-0" style={{ height: altoChat }}>
              <PanelAgente
                obtenerSnapshot={() => serializar(compRef.current)}
                obtenerContextoAudio={() => {
                  // la locución en tiempo LOCAL de la escena activa: el
                  // director sincroniza la animación con las palabras
                  const palabras = audio?.transcripcion?.palabras ?? [];
                  if (palabras.length === 0) return undefined;
                  const desde = cortesRef.current.find((c) => c.id === escenaActiva)?.desdeMs ?? 0;
                  const locales = palabras
                    .map((p) => ({ texto: p.texto, ms: Math.round(p.desdeMs - desde) }))
                    .filter((p) => p.ms >= 0 && p.ms <= compRef.current.duracion);
                  if (locales.length === 0) return undefined;
                  return locales.map((p) => `«${p.texto}» @ ${p.ms}ms`).join("\n");
                }}
                composicionId={escenaActiva}
                obtenerContextoEstilo={() => descripcionSensacion(sensacionRef.current) ?? undefined}
                renderizarFrames={renderizarFramesRevision}
                renderizarLectura={renderizarLectura}
                onAplicar={(snapshot) => {
                  registrar();
                  setComposicion(deserializar(snapshot));
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
