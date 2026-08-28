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
import type { CanalCamara, Capa, CapaMedia, CapaTexto, Composicion, Keyframe, NombrePropiedad, Segmento, TemblorCamara } from "@/lib/motion/modelo";
import { PRESETS, escalonadoSano } from "@/lib/motion/presets-puro";
import { deserializar, serializar } from "@/lib/motion/serializar-puro";
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
  desplazarTiempoCapas,
  estirarTiempoCapas,
} from "@/lib/motion/herramientas-puro";
import { camaraEn } from "@/lib/motion/evaluar-puro";
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
        // la escena dio la vuelta: el audio vuelve al inicio de su tramo
        if (tiempoRef.current < previo) sincronizarAudio();
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
  }, [reproduciendo, detenerGrabacion, sincronizarAudio]);

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
      const { transcribir } = await import("@/lib/motion/stt");
      setTranscribiendo(t("Transcribiendo…"));
      const recT = registro.recorte;
      const t0 = recT ? Math.max(0, Math.round((recT.desdeMs / 1000) * buffer.sampleRate)) : 0;
      const t1 = recT ? Math.min(buffer.length, Math.round((recT.hastaMs / 1000) * buffer.sampleRate)) : buffer.length;
      const transcripcion = await transcribir(
        Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i).subarray(t0, Math.max(t0 + 1, t1))),
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

  // Corregir a mano DÓNDE cae una palabra de la transcripción (whisper a
  // veces la corre): se mueve entera (misma duración) y PERSISTE junto al
  // audio — los imanes del timeline se actualizan solos.
  const moverPalabra = useCallback(
    (indice: number, desdeMs: number) => {
      setAudio((previo) => {
        const palabras = previo?.transcripcion?.palabras;
        if (!previo || !previo.transcripcion || !palabras?.[indice]) return previo;
        const p = palabras[indice];
        const dur = p.hastaMs - p.desdeMs;
        const nuevas = palabras.map((x, i) => (i === indice ? { ...x, desdeMs, hastaMs: desdeMs + dur } : x));
        const transcripcion = { ...previo.transcripcion, palabras: nuevas };
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
          <PanelBiblioteca onAplicar={aplicarEfecto} abierto={efectosAbiertos} onAlternar={alternarEfectos} />
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
              className="absolute left-1/2 top-3 -translate-x-1/2 rounded-control border border-peligro/30 bg-(--menu-solido-bg) px-3 py-1.5 text-xs text-foreground shadow-(--menu-shadow)"
            >
              {avisoGuardado}
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
          onTogglePlay={() => setReproduciendo((r) => !r)}
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
            <div className="min-h-0 shrink-0" style={{ height: altoChat }}>
              <PanelAgente
                obtenerSnapshot={() => serializar(compRef.current)}
                composicionId={escenaActiva}
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
