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
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import type { TurnoAgente } from "@/lib/motion/agente";

type Mensaje = TurnoAgente & { ops?: string[]; meta?: string };

export function PanelAgente({
  obtenerSnapshot,
  obtenerContextoAudio,
  composicionId,
  onAplicar,
}: {
  obtenerSnapshot: () => string;
  /** la locución de la escena (palabra@ms por línea) para que el director
      SINCRONICE la animación con la voz; undefined = sin transcripción */
  obtenerContextoAudio?: () => string | undefined;
  composicionId: string;
  /** aplica la composición devuelta (el caller registra el undo) */
  onAplicar: (snapshot: string, ops: string[]) => void;
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
  const listaRef = useRef<HTMLDivElement>(null);

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

  const enviar = async () => {
    const pedido = texto.trim();
    if (!pedido || pensando) return;
    setTexto("");
    setError(null);
    const historial = mensajes.map(({ rol, texto: tx }) => ({ rol, texto: tx }));
    setMensajes((m) => [...m, { rol: "usuario", texto: pedido }]);
    setPensando(true);
    try {
      const t0 = performance.now();
      const log: string[] = [`[+0.0s] pedido enviado (${pedido.length} chars)`];
      setProgreso(null);
      setTranscurrido(0);
      const res = await fetch("/api/motion/agente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          composicionId,
          snapshot: obtenerSnapshot(),
          mensaje: pedido,
          historial,
          contextoAudio: obtenerContextoAudio?.(),
        }),
      });
      // los errores tempranos (permisos, body) siguen llegando como JSON
      if (!res.ok || res.headers.get("content-type")?.includes("application/json")) {
        const datos = (await res.json().catch(() => ({}))) as { error?: string };
        setError(datos.error ?? t("El agente no pudo responder"));
        return;
      }
      if (!res.body) {
        setError(t("El agente no pudo responder"));
        return;
      }
      // NDJSON en vivo: {tipo:"paso"} por iteración, {tipo:"fin"} al final
      const lector = res.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      let fin: { respuesta?: string; snapshot?: string; ops?: string[]; error?: string; uso?: UsoTokens; modelo?: string } | null = null;
      let pasos = 0;
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        for (const linea of lineas) {
          if (!linea.trim()) continue;
          let evento: { tipo?: string; iteracion?: number; msModelo?: number; ops?: string[]; respuesta?: string; snapshot?: string; error?: string; uso?: UsoTokens; modelo?: string };
          try {
            evento = JSON.parse(linea);
          } catch {
            continue;
          }
          const ts = ((performance.now() - t0) / 1000).toFixed(1);
          if (evento.tipo === "paso") {
            pasos = evento.iteracion ?? pasos;
            const opsPaso = evento.ops ?? [];
            const tokensPaso = evento.uso ? ` · ${formatearTokens(evento.uso.entrada + evento.uso.salida + (evento.uso.cacheLectura ?? 0))}` : "";
            log.push(`[+${ts}s] paso ${evento.iteracion} · modelo ${(((evento.msModelo ?? 0)) / 1000).toFixed(1)}s${tokensPaso}${opsPaso.length ? ` · ${opsPaso.join(" | ")}` : " · respuesta final"}`);
            setProgreso({ paso: evento.iteracion ?? 0, ultimaOp: opsPaso[opsPaso.length - 1] ?? null });
          } else if (evento.tipo === "fin") {
            log.push(`[+${ts}s] fin${evento.error ? ` con ERROR: ${evento.error}` : ` (${evento.ops?.length ?? 0} ops)`}`);
            fin = evento;
          }
        }
      }
      setUltimoLog(log);
      if (!fin || fin.error || !fin.respuesta || !fin.snapshot) {
        setError(fin?.error ?? t("El agente no pudo responder"));
        return;
      }
      if (fin.ops && fin.ops.length > 0) onAplicar(fin.snapshot, fin.ops);
      // la META del pedido: pasos · tiempo · tokens · costo (si hay precio)
      let meta: string | undefined;
      if (fin.uso && fin.modelo) {
        const total = fin.uso.entrada + fin.uso.salida + (fin.uso.cacheLectura ?? 0) + (fin.uso.cacheEscritura ?? 0);
        const costo = costoUSD(fin.modelo, fin.uso);
        const seg = Math.round((performance.now() - t0) / 1000);
        meta = `${pasos} pasos · ${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")} · ${formatearTokens(total)} · ${
          costo !== null ? `~${formatearCosto(costo)}` : t("precio de {modelo} no cargado", { modelo: fin.modelo })
        } · ${fin.modelo}`;
        log.push(`TOTAL: ${meta}`);
      }
      setMensajes((m) => [...m, { rol: "agente", texto: fin!.respuesta!, ops: fin.ops, meta }]);
      requestAnimationFrame(() => listaRef.current?.scrollTo({ top: 1e6 }));
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
          placeholder={t("Qué animamos…")}
          rows={2}
          className="min-h-9 flex-1 resize-none rounded-control bg-transparent px-2 py-1.5 text-base text-foreground shadow-hueco outline-none"
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
        <BotonIcono tam={36} etiqueta={t("Enviar")} onClick={() => void enviar()} deshabilitado={pensando || !texto.trim()}>
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
