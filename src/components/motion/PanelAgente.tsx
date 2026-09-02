"use client";

/* -----------------------------------------------------------------------------
   Panel del agente — dirigir la animación conversando

   Vive FIJO en la columna izquierda del editor (2/3 de abajo cuando está
   abierto; el botón «ia» del lienzo lo alterna con el panel de efectos, y
   el estado abierto vive en el Editor). El componente queda montado aunque
   esté oculto: el historial del chat no se pierde al alternar.

   El agente edita por ops incrementales en el servidor y devuelve la
   composición nueva: acá se aplica como UN paso de undo y se muestran las
   ops (el diff visible del research M4). El historial que viaja es sólo
   texto: el estado real va fresco en cada pedido, así el agente nunca
   trabaja sobre una composición vieja.
----------------------------------------------------------------------------- */

import { useRef, useState, useEffect } from "react";
import { costoUSD, formatearCosto, formatearTokens, type UsoTokens } from "@/lib/motion/costo-agente-puro";
import { esAprobado, mensajeDeRevision, tiemposDeRevision, type ImagenRevision } from "@/lib/motion/revision-puro";
import { auditarDireccion } from "@/lib/motion/auditoria-puro";
import { referenciaDeArchivo, type ReferenciaAdjunta } from "@/lib/motion/referencias";
import { deserializar } from "@/lib/motion/serializar-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import { Segmentado } from "@/components/ui/Segmentado";
import type { NivelDirector, TurnoAgente } from "@/lib/motion/agente";

type Mensaje = TurnoAgente & { ops?: string[]; meta?: string };

/** lo que devuelve el stream al cerrar */
type FinAgente = { respuesta?: string; snapshot?: string; ops?: string[]; error?: string; uso?: UsoTokens; modelo?: string };

export function PanelAgente({
  obtenerSnapshot,
  obtenerContextoAudio,
  obtenerContextoEstilo,
  composicionId,
  onAplicar,
  renderizarFrames,
  renderizarLectura,
}: {
  obtenerSnapshot: () => string;
  /** la locución de la escena (palabra@ms por línea) para que el director
      SINCRONICE la animación con la voz; undefined = sin transcripción */
  obtenerContextoAudio?: () => string | undefined;
  /** el registro de la pieza (la perilla de sensación): el director dirige
      en ese carácter; undefined = neutro */
  obtenerContextoEstilo?: () => string | undefined;
  composicionId: string;
  /** aplica la composición devuelta (el caller registra el undo) */
  onAplicar: (snapshot: string, ops: string[]) => void;
  /** renderiza frames del snapshot con el motor real (el Editor los pinta
      con su media): habilita la REVISIÓN VISUAL automática del director */
  renderizarFrames?: (snapshot: string, tiempos: number[]) => Promise<ImagenRevision[]>;
  /** renderiza el DISEÑO en reposo, una imagen por pantalla (+ tramos), con
      el texto que las conecta a sus pantallaId: la LECTURA DE PANTALLA que
      el director mira antes de animar */
  renderizarLectura?: (snapshot: string) => Promise<{ imagenes: ImagenRevision[]; contexto: string }>;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  // progreso EN VIVO del stream (paso y última op) + reloj + log con tiempos
  const [progreso, setProgreso] = useState<{ paso: number; ultimaOp: string | null } | null>(null);
  const [transcurrido, setTranscurrido] = useState(0);
  const [ultimoLog, setUltimoLog] = useState<string[]>([]);
  useEffect(() => {
    if (!pensando) return;
    const t0 = Date.now();
    const reloj = setInterval(() => setTranscurrido(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(reloj);
  }, [pensando]);
  const [error, setError] = useState<string | null>(null);
  // revisión visual automática: al terminar, el director mira frames del
  // render y se corrige (prendida por defecto; el ojo del header la apaga)
  const [autoRevision, setAutoRevision] = useState(true);
  // nivel del director: «rapido» = el modelo económico del entorno (Flash),
  // «fino» = Opus para el planteo creativo — la revisión visual y las
  // correcciones siguen yendo al barato aunque el planteo sea fino
  const [nivel, setNivel] = useState<NivelDirector>("rapido");
  // gasto ACUMULADO de la sesión (direcciones + revisiones, todos los
  // modelos): en memoria a propósito — sin localStorage de estado (§2.10);
  // se reinicia al recargar, como un taxímetro de la sentada
  const [gasto, setGasto] = useState(0);
  const registrarGasto = (fin: FinAgente) => {
    if (!fin.uso || !fin.modelo) return;
    const costo = costoUSD(fin.modelo, fin.uso);
    if (costo !== null) setGasto((g) => g + costo);
  };
  const listaRef = useRef<HTMLDivElement>(null);

  // ——— REFERENCIA adjunta al chat: «que se mueva como esto» — un video (o
  // imagen) que el director MIRA. El archivo se muestrea ACÁ (frames JPEG
  // chicos, referencias.ts): al server nunca viaja el video entero. Se
  // consume con el próximo pedido; el × la saca antes de enviar. ———
  const [referencia, setReferencia] = useState<ReferenciaAdjunta | null>(null);
  const [leyendoReferencia, setLeyendoReferencia] = useState(false);
  const entradaReferenciaRef = useRef<HTMLInputElement | null>(null);
  const adjuntarReferencia = async (archivo: File) => {
    setError(null);
    setLeyendoReferencia(true);
    try {
      const ref = await referenciaDeArchivo(archivo);
      if (!ref) {
        setError(t("Esa referencia no se pudo leer como video o imagen"));
        return;
      }
      setReferencia(ref);
    } finally {
      setLeyendoReferencia(false);
    }
  };

  // ——— Voz al chat: apretás el mic, hablás el pedido, Whisper LOCAL lo
  // pasa a texto y queda en el input (lo revisás antes de enviar) ———
  const grabadorRef = useRef<MediaRecorder | null>(null);
  const [grabando, setGrabando] = useState(false);
  const [oyendo, setOyendo] = useState<string | null>(null);
  const alternarMic = async () => {
    if (grabadorRef.current) {
      grabadorRef.current.stop(); // el onstop hace el resto
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const grabador = new MediaRecorder(stream);
      const trozos: BlobPart[] = [];
      grabador.ondataavailable = (e) => trozos.push(e.data);
      grabador.onstop = async () => {
        stream.getTracks().forEach((pista) => pista.stop());
        grabadorRef.current = null;
        setGrabando(false);
        setOyendo(t("Transcribiendo…"));
        try {
          const datos = await new Blob(trozos).arrayBuffer();
          const ctxAudio = new AudioContext();
          const buffer = await ctxAudio.decodeAudioData(datos);
          void ctxAudio.close().catch(() => undefined);
          const { transcribirConWorker } = await import("@/lib/motion/stt");
          // el dictado del chat es EN CASTELLANO: forzarlo evita que la
          // autodetección (pensada para la voz en off, que puede venir en
          // inglés) traduzca el pedido — visto con un clip corto
          const res = await transcribirConWorker(
            Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
            buffer.sampleRate,
            (f) => setOyendo(t("Bajando el modelo de voz… {p}%", { p: Math.round(f * 100) })),
            undefined,
            "spanish",
          );
          if (res.texto) setTexto((previo) => (previo ? previo + " " : "") + res.texto);
        } catch (e) {
          setError(e instanceof Error ? e.message : t("No se pudo transcribir la voz"));
        } finally {
          setOyendo(null);
        }
      };
      grabador.start();
      grabadorRef.current = grabador;
      setGrabando(true);
    } catch {
      setError(t("No hay micrófono disponible (o el permiso está bloqueado)"));
    }
  };

  // ——— un round-trip al agente (stream NDJSON): lo usa el pedido del
  // usuario Y cada ronda de la revisión visual ———
  const pedirAlAgente = async (
    cuerpo: Record<string, unknown>,
    log: string[],
    t0: number,
  ): Promise<{ fin: FinAgente | null; pasos: number }> => {
    const res = await fetch("/api/motion/agente", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    // los errores tempranos (permisos, body) siguen llegando como JSON
    if (!res.ok || res.headers.get("content-type")?.includes("application/json")) {
      const datos = (await res.json().catch(() => ({}))) as { error?: string };
      return { fin: { error: datos.error ?? t("El agente no pudo responder") }, pasos: 0 };
    }
    if (!res.body) return { fin: null, pasos: 0 };
    // NDJSON en vivo: {tipo:"paso"} por iteración, {tipo:"fin"} al final
    const lector = res.body.getReader();
    const dec = new TextDecoder();
    let resto = "";
    let fin: FinAgente | null = null;
    let pasos = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      resto += dec.decode(value, { stream: true });
      const lineas = resto.split("\n");
      resto = lineas.pop() ?? "";
      for (const linea of lineas) {
        if (!linea.trim()) continue;
        let evento: FinAgente & { tipo?: string; iteracion?: number; msModelo?: number; ms?: number; resumen?: string; texto?: string };
        try {
          evento = JSON.parse(linea);
        } catch {
          continue;
        }
        const ts = ((performance.now() - t0) / 1000).toFixed(1);
        if (evento.tipo === "analisis") {
          // el ANALISTA (Gemini) vio el video de la referencia completo
          // antes de que el director arranque — su costo va al taxímetro
          if (evento.error) {
            log.push(`[+${ts}s] analista de referencia: ${evento.error}`);
          } else {
            const tokens = evento.uso ? formatearTokens(evento.uso.entrada + evento.uso.salida) : "";
            log.push(`[+${ts}s] analista de referencia (${evento.modelo}): vio el video completo en ${(((evento.ms ?? 0)) / 1000).toFixed(1)}s · ${tokens}`);
            if (evento.resumen) log.push(`  lectura: «${evento.resumen}…»`);
            if (evento.modelo && evento.uso) {
              const costo = costoUSD(evento.modelo, evento.uso);
              if (costo !== null) setGasto((g) => g + costo);
            }
            setProgreso({ paso: 0, ultimaOp: t("el analista leyó la referencia — dirigiendo…") });
          }
        } else if (evento.tipo === "paso") {
          pasos = evento.iteracion ?? pasos;
          const opsPaso = evento.ops ?? [];
          // el razonamiento a la vista: «¿pensó o no pensó?» se responde acá
          const tokensPaso = evento.uso
            ? ` · ${formatearTokens(evento.uso.entrada + evento.uso.salida + (evento.uso.cacheLectura ?? 0))}${
                evento.uso.pensamiento ? ` (pensó ${formatearTokens(evento.uso.pensamiento)})` : ""
              }`
            : "";
          log.push(`[+${ts}s] paso ${evento.iteracion} · modelo ${(((evento.msModelo ?? 0)) / 1000).toFixed(1)}s${tokensPaso}${opsPaso.length ? ` · ${opsPaso.join(" | ")}` : " · respuesta final"}`);
          // el guion (o cualquier texto junto a las herramientas) se lee acá
          if (evento.texto) log.push(`  guion: ${evento.texto.replace(/\s+/g, " ").slice(0, 1200)}`);
          setProgreso({ paso: evento.iteracion ?? 0, ultimaOp: opsPaso[opsPaso.length - 1] ?? null });
        } else if (evento.tipo === "fin") {
          log.push(`[+${ts}s] fin${evento.error ? ` con ERROR: ${evento.error}` : ` (${evento.ops?.length ?? 0} ops)`}`);
          fin = evento;
        }
      }
    }
    return { fin, pasos };
  };

  // la META de un round-trip: pasos · tiempo · tokens · costo (si hay precio)
  const metaDe = (fin: FinAgente, pasos: number, t0: number): string | undefined => {
    if (!fin.uso || !fin.modelo) return undefined;
    const total = fin.uso.entrada + fin.uso.salida + (fin.uso.cacheLectura ?? 0) + (fin.uso.cacheEscritura ?? 0);
    const costo = costoUSD(fin.modelo, fin.uso);
    const seg = Math.round((performance.now() - t0) / 1000);
    const penso = fin.uso.pensamiento ? ` · ${t("pensó")} ${formatearTokens(fin.uso.pensamiento)}` : "";
    return `${pasos} pasos · ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")} · ${formatearTokens(total)}${penso} · ${
      costo !== null ? `~${formatearCosto(costo)}` : t("precio de {modelo} no cargado", { modelo: fin.modelo })
    } · ${fin.modelo}`;
  };

  const enviar = async () => {
    const pedido = texto.trim();
    // con la extracción de frames EN CURSO no se manda: el pedido saldría
    // sin la referencia que el usuario cree que lleva
    if (!pedido || pensando || leyendoReferencia) return;
    setTexto("");
    setError(null);
    // el historial que viaja: turnos consecutivos del mismo rol se FUNDEN
    // (la revisión visual agrega turnos de agente seguidos, y las APIs
    // exigen user/assistant alternados)
    const historial: TurnoAgente[] = [];
    for (const m of mensajes) {
      const ultimo = historial[historial.length - 1];
      if (ultimo && ultimo.rol === m.rol) ultimo.texto += `\n${m.texto}`;
      else historial.push({ rol: m.rol, texto: m.texto });
    }
    // la referencia adjunta viaja con ESTE pedido (frames + su contexto) y
    // el turno visible lo dice — el historial de texto conserva la marca
    const refDelPedido = referencia;
    const marcaRef = refDelPedido
      ? `\n(referencia adjunta: «${refDelPedido.meta.nombre}», ${refDelPedido.imagenes.length} ${refDelPedido.meta.tipo === "video" ? "frames" : "imagen"})`
      : "";
    setMensajes((m) => [...m, { rol: "usuario", texto: pedido + marcaRef }]);
    setPensando(true);
    try {
      const t0 = performance.now();
      const log: string[] = [`[+0.0s] pedido: «${pedido.slice(0, 200)}»${refDelPedido ? ` + referencia «${refDelPedido.meta.nombre}» (${refDelPedido.imagenes.length} imgs${refDelPedido.archivo ? " + video para el analista" : ""})` : ""}`];
      setProgreso(refDelPedido?.archivo ? { paso: 0, ultimaOp: t("el analista está viendo el video de la referencia…") } : null);
      setTranscurrido(0);
      const snapshot = obtenerSnapshot();
      // LECTURA DE PANTALLA: el diseño en reposo viaja con el pedido — el
      // director lo mira y escribe el guion antes de animar. Si el render
      // falla, el pedido sale igual (sin imágenes: degradar, no romper).
      let lectura: { imagenes: ImagenRevision[]; contexto: string } = { imagenes: [], contexto: "" };
      try {
        lectura = (await renderizarLectura?.(snapshot)) ?? lectura;
      } catch {
        lectura = { imagenes: [], contexto: "" };
      }
      if (lectura.imagenes.length > 0) {
        const pantallas = new Set(lectura.contexto.match(/pantallaId [^)]+\)/g) ?? []).size;
        log.push(`[+${((performance.now() - t0) / 1000).toFixed(1)}s] lectura de pantalla: ${lectura.imagenes.length} imagen(es) de ${pantallas} pantalla(s)`);
      }
      const imagenesRef = refDelPedido?.imagenes ?? [];
      const { fin, pasos } = await pedirAlAgente(
        {
          composicionId,
          snapshot,
          mensaje: pedido,
          historial,
          contextoAudio: obtenerContextoAudio?.(),
          contextoEstilo: obtenerContextoEstilo?.(),
          nivel,
          imagenes: [...lectura.imagenes, ...imagenesRef],
          // el bloque de lectura viene sin la línea de referencia (el editor
          // no sabe si hay una): se agrega acá, donde sí se sabe
          contextoLectura: lectura.contexto
            ? lectura.contexto +
              (imagenesRef.length ? `\nLas ${imagenesRef.length} imágenes que siguen NO son el diseño: son la REFERENCIA ADJUNTA (ver su bloque).` : "")
            : undefined,
          contextoReferencias: refDelPedido?.contexto,
          // el video ENTERO para el analista (si entró en el límite inline)
          videoReferencia: refDelPedido?.archivo
            ? { ...refDelPedido.archivo, nombre: refDelPedido.meta.nombre, duracionMs: refDelPedido.meta.duracionMs }
            : undefined,
        },
        log,
        t0,
      );
      setUltimoLog(log);
      if (!fin || fin.error || !fin.respuesta || !fin.snapshot) {
        setError(fin?.error ?? t("El agente no pudo responder"));
        return;
      }
      // consumida: el próximo pedido arranca limpio (si falló, queda puesta
      // para reintentar sin re-adjuntar)
      if (refDelPedido) setReferencia(null);
      if (fin.ops && fin.ops.length > 0) onAplicar(fin.snapshot, fin.ops);
      registrarGasto(fin);
      const meta = metaDe(fin, pasos, t0);
      if (meta) log.push(`TOTAL: ${meta}`);
      setMensajes((m) => [...m, { rol: "agente", texto: fin.respuesta!, ops: fin.ops, meta }]);
      requestAnimationFrame(() => listaRef.current?.scrollTo({ top: 1e6 }));

      // ——— REVISIÓN VISUAL AUTOMÁTICA: el director MIRA frames del render
      // real y se corrige antes de darte el resultado (máx. 2 rondas) ———
      if (autoRevision && renderizarFrames && (fin.ops?.length ?? 0) > 0) {
        let snapshotVivo = fin.snapshot;
        let historialVivo: TurnoAgente[] = [
          ...historial,
          { rol: "usuario", texto: pedido + marcaRef },
          { rol: "agente", texto: fin.respuesta },
        ];
        for (let ronda = 1; ronda <= 2; ronda++) {
          let tiempos: number[] = [];
          let frames: ImagenRevision[] = [];
          // la regla de oro MEDIDA (auditoria-puro): viaja con los frames
          // como hechos que el director tiene que corregir antes de aprobar
          let auditoria: string[] = [];
          try {
            const compViva = deserializar(snapshotVivo);
            tiempos = tiemposDeRevision(compViva);
            auditoria = auditarDireccion(compViva);
            frames = await renderizarFrames(snapshotVivo, tiempos);
          } catch {
            break; // sin frames no hay revisión — el resultado ya está aplicado
          }
          if (frames.length === 0) break;
          const ts = ((performance.now() - t0) / 1000).toFixed(1);
          log.push(`[+${ts}s] revisión ${ronda}: mirando ${frames.length} frames (${tiempos.map((x) => `${x}ms`).join(", ")})`);
          if (auditoria.length > 0) {
            log.push(`[+${ts}s] auditoría de dirección: ${auditoria.length} hallazgo(s)`);
            for (const h of auditoria) log.push(`  · ${h}`);
          }
          setProgreso({ paso: 0, ultimaOp: t("revisión visual {n}: mirando el render…", { n: ronda }) });
          // la revisión NO manda nivel: mirar frames y hacer retoques es
          // tarea del modelo barato, aunque el planteo haya sido fino
          const { fin: finR, pasos: pasosR } = await pedirAlAgente(
            { composicionId, snapshot: snapshotVivo, mensaje: mensajeDeRevision(tiempos, auditoria), historial: historialVivo, imagenes: frames },
            log,
            t0,
          );
          if (!finR || finR.error || !finR.respuesta || !finR.snapshot) {
            log.push(`revisión ${ronda}: ERROR ${finR?.error ?? ""}`);
            break;
          }
          registrarGasto(finR);
          const aprobado = esAprobado(finR.respuesta);
          if (finR.ops && finR.ops.length > 0) {
            onAplicar(finR.snapshot, finR.ops);
            snapshotVivo = finR.snapshot;
          }
          log.push(aprobado ? `revisión ${ronda}: APROBADO` : `revisión ${ronda}: corrigió ${finR.ops?.length ?? 0} ops`);
          const metaR = metaDe(finR, pasosR, t0);
          setMensajes((m) => [
            ...m,
            {
              rol: "agente",
              texto: aprobado
                ? t("✓ Revisión visual: miré frames del render y quedó como lo dirigí.")
                : finR.respuesta!,
              ops: finR.ops,
              meta: metaR ? `${t("revisión visual")} · ${metaR}` : undefined,
            },
          ]);
          historialVivo = [
            ...historialVivo,
            { rol: "usuario", texto: "(revisión visual automática: frames del render adjuntos)" },
            { rol: "agente", texto: finR.respuesta },
          ];
          requestAnimationFrame(() => listaRef.current?.scrollTo({ top: 1e6 }));
          if (aprobado || (finR.ops?.length ?? 0) === 0) break;
        }
      }
      setUltimoLog([...log]);
    } catch {
      setError(t("No se pudo hablar con el agente (¿el servidor está corriendo?)"));
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-(--glass-border) bg-(--chrome-bg)">
      <div className="flex items-center border-b border-(--glass-border) px-3 py-2">
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">{t("Director de motion")}</span>
        {gasto > 0 && (
          <span
            className="mr-1.5 shrink-0 cursor-default font-mono text-[10px] text-foreground/50"
            title={t("Gastado con el director en esta sesión (direcciones + revisiones; se reinicia al recargar)")}
          >
            Σ {formatearCosto(gasto)}
          </span>
        )}
        <span className="mr-1.5 shrink-0">
          <Segmentado
            opciones={[
              { valor: "rapido", nombre: t("rápido") },
              { valor: "fino", nombre: t("fino") },
            ]}
            valor={nivel}
            onCambio={(v) => setNivel(v as NivelDirector)}
            etiquetaAria={t("Nivel del director: rápido (Flash, barato) o fino (Opus, criterio)")}
          />
        </span>
        {renderizarFrames && (
          <span className="mr-1 shrink-0">
            <BotonIcono
              tam={24}
              etiqueta={
                autoRevision
                  ? t("Revisión visual automática PRENDIDA: al terminar, el director mira frames del render y se corrige (tocá para apagarla)")
                  : t("Revisión visual automática apagada (tocá para prenderla)")
              }
              activo={autoRevision}
              onClick={() => setAutoRevision((v) => !v)}
            >
              <Icono nombre={autoRevision ? "ojo" : "ojoTachado"} width={13} height={13} />
            </BotonIcono>
          </span>
        )}
        {ultimoLog.length > 0 && (
          <button
            type="button"
            onClick={() => void navigator.clipboard?.writeText(ultimoLog.join("\n")).catch(() => undefined)}
            title={t("Copia el log del último pedido (pasos, tiempos y ops) para pegarlo donde haga falta")}
            className="shrink-0 rounded-control px-1.5 py-0.5 font-mono text-[10px] text-foreground/50 hover:bg-ink/[0.06] hover:text-foreground"
          >
            {t("copiar log")}
          </button>
        )}
      </div>
      <div ref={listaRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {mensajes.length === 0 && (
          <p className="py-2 text-xs text-muted">
            {t("Pedime la animación: «animá esta pantalla con una entrada editorial sobria», «el título con más energía, tipo back.out», «hacé que la tarjeta recorra hacia la derecha con un hold»…")}
          </p>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={["mb-2 text-[13px] leading-relaxed", m.rol === "usuario" ? "text-foreground" : "text-foreground/85"].join(" ")}>
            <span className="mr-1 font-mono text-[10px] uppercase text-foreground/40">
              {m.rol === "usuario" ? t("vos") : t("agente")}
            </span>
            <span className="whitespace-pre-wrap">{m.texto}</span>
            {m.ops && m.ops.length > 0 && (
              <ul className="mt-1 border-l-2 border-acento/60 pl-2 text-[11px] text-muted">
                {m.ops.map((op, j) => (
                  <li key={j}>· {op}</li>
                ))}
              </ul>
            )}
            {m.meta && (
              <div className="mt-1 font-mono text-[10px] text-foreground/40">{m.meta}</div>
            )}
          </div>
        ))}
        {pensando && (
          <div className="py-1 font-mono text-[11px] text-muted">
            {t("dirigiendo…")} {progreso ? t("paso {n}", { n: progreso.paso }) : ""} · {Math.floor(transcurrido / 60)}:{String(transcurrido % 60).padStart(2, "0")}
            {progreso?.ultimaOp && <div className="truncate text-[10px] text-foreground/40">{progreso.ultimaOp}</div>}
          </div>
        )}
        {error && <div role="alert" className="py-1 text-xs text-peligro">{error}</div>}
      </div>
      {(referencia || leyendoReferencia) && (
        <div className="flex items-center gap-2 border-t border-(--glass-border) px-3 py-1.5">
          <Icono nombre="adjuntar" width={12} height={12} className="shrink-0 text-foreground/50" />
          {referencia ? (
            <>
              <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/70">
                {referencia.meta.nombre}
                <span className="ml-1.5 font-mono text-[10px] text-foreground/40">
                  {referencia.meta.tipo === "video"
                    ? t.plural(referencia.imagenes.length, "{n} frame", "{n} frames")
                    : t("imagen")}
                </span>
              </span>
              <span className="shrink-0 text-[10px] text-muted">{t("viaja con el próximo pedido")}</span>
              <BotonIcono tam={20} etiqueta={t("Quitar la referencia")} onClick={() => setReferencia(null)}>
                <Icono nombre="cerrar" width={11} height={11} />
              </BotonIcono>
            </>
          ) : (
            <span role="status" className="text-[11px] text-muted">{t("Leyendo la referencia…")}</span>
          )}
        </div>
      )}
      <div className="flex items-end gap-2 border-t border-(--glass-border) p-2">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          placeholder={referencia ? t("Qué tomamos de la referencia…") : t("Qué animamos…")}
          rows={2}
          className="min-h-9 flex-1 resize-none rounded-control bg-transparent px-2 py-1.5 text-base text-foreground shadow-hueco outline-none"
        />
        <BotonIcono
          tam={36}
          etiqueta={t("Adjuntar una referencia (video o imagen): el director la mira y trae ese movimiento a tu pieza")}
          activo={Boolean(referencia)}
          onClick={() => entradaReferenciaRef.current?.click()}
          deshabilitado={leyendoReferencia || pensando}
        >
          <Icono nombre="adjuntar" width={15} height={15} />
        </BotonIcono>
        <input
          ref={entradaReferenciaRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,image/*"
          className="hidden"
          onChange={(e) => {
            const archivo = e.target.files?.[0];
            if (archivo) void adjuntarReferencia(archivo);
            e.target.value = "";
          }}
        />
        <BotonIcono
          tam={36}
          etiqueta={grabando ? t("Terminar de hablar") : t("Hablar el pedido")}
          activo={grabando}
          onClick={() => void alternarMic()}
          deshabilitado={oyendo !== null}
        >
          <span aria-hidden className={grabando ? "text-[14px] leading-none text-peligro" : "text-[14px] leading-none"}>
            {grabando ? "■" : "⏺"}
          </span>
        </BotonIcono>
        <BotonIcono tam={36} etiqueta={t("Enviar")} onClick={() => void enviar()} deshabilitado={pensando || leyendoReferencia || !texto.trim()}>
          <Icono nombre="enviar" width={16} height={16} />
        </BotonIcono>
      </div>
      {oyendo && (
        <div role="status" className="border-t border-(--glass-border) px-3 py-1 font-mono text-[11px] text-muted">
          {oyendo}
        </div>
      )}
    </div>
  );
}
