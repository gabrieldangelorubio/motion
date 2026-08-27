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

import { useRef, useState } from "react";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";
import type { TurnoAgente } from "@/lib/motion/agente";

type Mensaje = TurnoAgente & { ops?: string[] };

export function PanelAgente({
  obtenerSnapshot,
  composicionId,
  onAplicar,
}: {
  obtenerSnapshot: () => string;
  composicionId: string;
  /** aplica la composición devuelta (el caller registra el undo) */
  onAplicar: (snapshot: string, ops: string[]) => void;
}) {
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
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
          const { transcribir } = await import("@/lib/motion/stt");
          const res = await transcribir(
            Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)),
            buffer.sampleRate,
            (f) => setOyendo(t("Bajando el modelo de voz… {p}%", { p: Math.round(f * 100) })),
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
      const res = await fetch("/api/motion/agente", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ composicionId, snapshot: obtenerSnapshot(), mensaje: pedido, historial }),
      });
      const datos = (await res.json()) as { respuesta?: string; snapshot?: string; ops?: string[]; error?: string };
      if (!res.ok || !datos.respuesta || !datos.snapshot) {
        setError(datos.error ?? t("El agente no pudo responder"));
        return;
      }
      if (datos.ops && datos.ops.length > 0) onAplicar(datos.snapshot, datos.ops);
      setMensajes((m) => [...m, { rol: "agente", texto: datos.respuesta!, ops: datos.ops }]);
      requestAnimationFrame(() => listaRef.current?.scrollTo({ top: 1e6 }));
    } catch {
      setError(t("No se pudo hablar con el agente (¿el servidor está corriendo?)"));
    } finally {
      setPensando(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-(--glass-border) bg-(--chrome-bg)">
      <div className="border-b border-(--glass-border) px-3 py-2 text-[13px] font-semibold text-foreground">
        {t("Director de motion")}
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
          </div>
        ))}
        {pensando && <div className="py-1 font-mono text-[11px] text-muted">{t("dirigiendo…")}</div>}
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
