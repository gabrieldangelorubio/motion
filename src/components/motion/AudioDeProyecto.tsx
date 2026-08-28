"use client";

/* -----------------------------------------------------------------------------
   Franja de audio del proyecto — la voz en off estructurando las escenas

   Vive arriba de la línea de tiempo, a lo ancho, en DOS carriles:
   - la FORMA DE ONDA (canvas): lo ya reproducido en acento, lo que falta en
     tinta apagada — el progreso se lee de un vistazo; encima los CORTES de
     escena (arrastrables) y el playhead.
   - la TRANSCRIPCIÓN (HTML, separada abajo): cada PALABRA posicionada donde
     cae en el tiempo, clickeable — click = saltar el playhead ahí, la base
     para ubicar keyframes sobre la locución. Una transcripción vieja sin
     palabras degrada a bloques por oración.
   El eje X es el tiempo GLOBAL del proyecto (las escenas concatenadas, el
   mismo orden del export).
----------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioDecodificado } from "@/lib/motion/audio-guardado";
import { duracionTotal, type CorteEscena } from "@/lib/motion/audio-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";

const ALTO = 36;
const UMBRAL_CORTE_PX = 6;

export function AudioDeProyecto({
  audio,
  cortes,
  escenaActiva,
  tiempoMs,
  onSaltar,
  onCortar,
  onQuitar,
  onRecortarAudio,
  onTranscribir,
  onEditarPalabras,
  onMoverPalabra,
  transcribiendo = null,
}: {
  audio: AudioDecodificado;
  cortes: CorteEscena[];
  escenaActiva: string;
  /** tiempo local del playhead en la escena activa */
  tiempoMs: number;
  onSaltar: (globalMs: number) => void;
  /** la escena `id` pasa a durar `duracionMs` (soltar el corte) */
  onCortar: (id: string, duracionMs: number) => void;
  onQuitar: () => void;
  /** reabre el panel de recorte (elegir otro segmento del archivo) */
  onRecortarAudio?: () => void;
  /** corre Whisper local sobre el audio del proyecto */
  onTranscribir?: () => void;
  /** abre el MODAL de palabras (mover, borrar, renombrar, agregar, con
      undo): la edición completa vive ahí */
  onEditarPalabras?: () => void;
  /** ajuste RÁPIDO sin abrir el modal: arrastrar una palabra en el carril
      la corre entera (el caller reordena y persiste); click seco = saltar */
  onMoverPalabra?: (indice: number, desdeMs: number) => void;
  /** estado del STT en curso (null = quieto) */
  transcribiendo?: string | null;
}) {
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  // corte en drag: índice del corte (la escena que TERMINA ahí) + posición viva
  const [arrastre, setArrastre] = useState<{ indice: number; globalMs: number } | null>(null);
  const arrastreRef = useRef<typeof arrastre>(null);
  useEffect(() => {
    arrastreRef.current = arrastre;
  }, [arrastre]);

  const totalEscenas = duracionTotal(cortes);
  const total = Math.max(totalEscenas, audio.duracionMs, 1);

  const activa = cortes.find((c) => c.id === escenaActiva);
  const globalPlayhead = (activa?.desdeMs ?? 0) + tiempoMs;

  // ——— pintar la onda: progreso en acento + cortes + playhead ———
  useEffect(() => {
    const lienzo = lienzoRef.current;
    const marco = marcoRef.current;
    if (!lienzo || !marco) return;
    const ancho = marco.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    lienzo.width = Math.round(ancho * dpr);
    lienzo.height = Math.round(ALTO * dpr);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ancho, ALTO);

    const estilos = getComputedStyle(marco);
    const tinta = estilos.color;
    const acento = estilos.getPropertyValue("--acento").trim() || "#5b8cff";

    // la onda ocupa el tramo del audio dentro del total global; lo YA
    // reproducido va en acento — el progreso se lee sin buscar el playhead
    const anchoOnda = (audio.duracionMs / total) * ancho;
    const xPlay = (Math.min(globalPlayhead, total) / total) * ancho;
    const picos = audio.picos;
    const centro = ALTO / 2 + 3; // deja aire arriba para los nombres de escena
    const pasos = Math.max(1, Math.floor(anchoOnda));
    for (let x = 0; x < pasos; x++) {
      const pico = picos[Math.min(picos.length - 1, Math.floor((x / anchoOnda) * picos.length))] ?? 0;
      // piso de 1px: el silencio se ve como línea — las PAUSAS de la locución
      const alto = Math.max(1, pico * (ALTO - 14));
      const reproducido = x <= xPlay;
      ctx.fillStyle = reproducido ? acento : tinta;
      ctx.globalAlpha = reproducido ? 0.8 : 0.3;
      ctx.fillRect(x, centro - alto / 2, 1, alto);
    }
    ctx.globalAlpha = 1;

    // cortes de escena (el arrastrado se pinta en su posición viva)
    const vivo = arrastre;
    for (let i = 0; i < cortes.length; i++) {
      const fin = cortes[i].desdeMs + cortes[i].duracionMs;
      const globalCorte = vivo && vivo.indice === i ? vivo.globalMs : fin;
      const x = (globalCorte / total) * ancho;
      const esUltimo = i === cortes.length - 1;
      ctx.strokeStyle = acento;
      ctx.globalAlpha = esUltimo ? 0.4 : 0.85;
      ctx.lineWidth = vivo && vivo.indice === i ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 2);
      ctx.lineTo(x, ALTO);
      ctx.stroke();
      // manijita: el corte se agarra
      ctx.fillStyle = acento;
      ctx.fillRect(x - 2, 2, 5, 3);
    }
    ctx.globalAlpha = 1;

    // nombre de cada escena al inicio de su tramo, en el aire de arriba
    ctx.fillStyle = tinta;
    ctx.globalAlpha = 0.5;
    ctx.font = "600 8px ui-sans-serif, system-ui, sans-serif";
    for (const corte of cortes) {
      const x = (corte.desdeMs / total) * ancho;
      ctx.fillText(corte.nombre.toUpperCase(), x + 5, 8);
    }
    ctx.globalAlpha = 1;

    // playhead: línea con cabeza — el cursor manda sobre todo
    ctx.strokeStyle = acento;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(xPlay, 0);
    ctx.lineTo(xPlay, ALTO);
    ctx.stroke();
    ctx.fillStyle = acento;
    ctx.beginPath();
    ctx.moveTo(xPlay - 3.5, 0);
    ctx.lineTo(xPlay + 3.5, 0);
    ctx.lineTo(xPlay, 5);
    ctx.closePath();
    ctx.fill();
  }, [audio, cortes, total, globalPlayhead, arrastre]);

  const globalDeEvento = useCallback(
    (e: { clientX: number }) => {
      const marco = marcoRef.current;
      if (!marco) return 0;
      const caja = marco.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - caja.left) / caja.width));
      return f * total;
    },
    [total],
  );

  const alBajar = useCallback(
    (e: React.PointerEvent) => {
      const marco = marcoRef.current;
      if (!marco) return;
      const caja = marco.getBoundingClientRect();
      // ¿agarró un corte? (el del final del proyecto no se arrastra si es el
      // último Y el audio no llega más lejos — igual se permite: alarga)
      const porPx = caja.width / total;
      let indice = -1;
      for (let i = 0; i < cortes.length; i++) {
        const x = (cortes[i].desdeMs + cortes[i].duracionMs) * porPx;
        if (Math.abs(e.clientX - caja.left - x) <= UMBRAL_CORTE_PX) {
          indice = i;
          break;
        }
      }
      if (indice >= 0) {
        e.currentTarget.setPointerCapture(e.pointerId);
        setArrastre({ indice, globalMs: cortes[indice].desdeMs + cortes[indice].duracionMs });
        return;
      }
      onSaltar(globalDeEvento(e));
    },
    [cortes, total, globalDeEvento, onSaltar],
  );

  const alMover = useCallback(
    (e: React.PointerEvent) => {
      const vivo = arrastreRef.current;
      if (!vivo) return;
      const corte = cortes[vivo.indice];
      // el corte no puede cruzar el inicio de su escena (mínimo 500ms)
      const minimo = corte.desdeMs + 500;
      setArrastre({ indice: vivo.indice, globalMs: Math.max(minimo, globalDeEvento(e)) });
    },
    [cortes, globalDeEvento],
  );

  const alSoltar = useCallback(() => {
    const vivo = arrastreRef.current;
    if (!vivo) return;
    const corte = cortes[vivo.indice];
    setArrastre(null);
    onCortar(corte.id, Math.round(vivo.globalMs - corte.desdeMs));
  }, [cortes, onCortar]);

  // ——— el carril de transcripción: palabras (o oraciones) en su tiempo ———
  const palabras = audio.transcripcion?.palabras ?? [];
  const oraciones = audio.transcripcion?.oraciones ?? [];
  const esPalabras = palabras.length > 0;
  const unidades = esPalabras ? palabras : oraciones;
  const conCarril = unidades.length > 0;

  const saltarPorFondo = useCallback(
    (e: React.PointerEvent) => {
      // el fondo del carril también scrubbea; las palabras ya saltan solas
      if ((e.target as HTMLElement).closest("button")) return;
      onSaltar(globalDeEvento(e));
    },
    [globalDeEvento, onSaltar],
  );

  // drag RÁPIDO de una palabra en el carril (el ajuste fino y el resto de
  // la edición viven en el modal «Palabras»): el ajuste vivo se pinta acá;
  // al soltar, el caller reordena y persiste. Click seco = saltar ahí.
  const [ajuste, setAjuste] = useState<{ indice: number; desdeMs: number } | null>(null);
  const dragPalabraRef = useRef<{ indice: number; x0: number; desde0: number; movido: boolean } | null>(null);
  const bajarEnPalabra = (e: React.PointerEvent, indice: number, u: { desdeMs: number }) => {
    if (!esPalabras || !onMoverPalabra) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragPalabraRef.current = { indice, x0: e.clientX, desde0: u.desdeMs, movido: false };
  };
  const moverEnPalabra = (e: React.PointerEvent) => {
    const drag = dragPalabraRef.current;
    const caja = marcoRef.current?.getBoundingClientRect();
    if (!drag || !caja) return;
    const dx = e.clientX - drag.x0;
    if (!drag.movido && Math.abs(dx) < 3) return;
    drag.movido = true;
    setAjuste({ indice: drag.indice, desdeMs: Math.max(0, drag.desde0 + dx * (total / caja.width)) });
  };
  const soltarEnPalabra = (u: { desdeMs: number }) => {
    const drag = dragPalabraRef.current;
    dragPalabraRef.current = null;
    if (!drag) return;
    const vivo = ajuste;
    setAjuste(null);
    if (drag.movido) {
      if (vivo && vivo.indice === drag.indice) onMoverPalabra?.(drag.indice, Math.round(vivo.desdeMs));
    } else {
      onSaltar(u.desdeMs);
    }
  };

  return (
    <div className="border-b border-(--panel-border) bg-(--panel-bg)">
      <div className="flex items-stretch gap-3 px-3 pt-1.5">
        {/* onda y carril APILADOS en la misma columna: comparten ancho, así
            cada palabra cae EXACTAMENTE debajo de su lugar en la onda */}
        <div className="min-w-0 flex-1">
          <div
            ref={marcoRef}
            role="slider"
            aria-label={t("Audio del proyecto: {nombre}", { nombre: audio.nombre })}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={Math.round(globalPlayhead)}
            className="relative cursor-crosshair select-none touch-none"
            style={{ height: ALTO }}
            onPointerDown={alBajar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerCancel={() => setArrastre(null)}
          >
            <canvas ref={lienzoRef} className="absolute inset-0 h-full w-full" />
          </div>
          {conCarril && (
            <div
              className="relative mb-1 mt-0.5 h-[18px] select-none overflow-hidden border-t border-(--panel-border)"
              aria-label={t("Transcripción: click en una palabra salta ahí")}
              onPointerDown={saltarPorFondo}
            >
              {unidades.map((u, i) => {
                // cada palabra es un HITO de entrada (el «in» de la frase, sin
                // caja de duración): el elemento se extiende hasta la próxima
                // palabra solo para que el texto tenga dónde vivir sin pisarse.
                // Click = saltar ahí; arrastrar = ajuste rápido (el caller
                // reordena: cruzarla sobre otra no la deja inagarrable); lo
                // demás (borrar, renombrar, agregar, undo) vive en «Palabras».
                const enAjuste = ajuste?.indice === i;
                const desdeVivo = enAjuste ? ajuste.desdeMs : u.desdeMs;
                const siguienteDesde = i + 1 < unidades.length ? unidades[i + 1].desdeMs : total;
                const sonando = globalPlayhead >= desdeVivo && globalPlayhead < (esPalabras ? siguienteDesde : desdeVivo + (u.hastaMs - u.desdeMs));
                return (
                  <button
                    key={`${u.texto}-${i}`}
                    type="button"
                    onPointerDown={(e) => bajarEnPalabra(e, i, u)}
                    onPointerMove={moverEnPalabra}
                    onPointerUp={() => soltarEnPalabra(u)}
                    onPointerCancel={() => {
                      dragPalabraRef.current = null;
                      setAjuste(null);
                    }}
                    onClick={esPalabras && onMoverPalabra ? undefined : () => onSaltar(u.desdeMs)}
                    title={
                      esPalabras && onMoverPalabra
                        ? t("«{p}» · {s}s — click salta ahí; arrastrá para corregir dónde cae", { p: u.texto, s: (desdeVivo / 1000).toFixed(2) })
                        : `${u.texto} · ${(u.desdeMs / 1000).toFixed(2)}s`
                    }
                    style={{
                      left: `${(desdeVivo / total) * 100}%`,
                      width: `${Math.max(0.2, ((esPalabras ? Math.max(siguienteDesde - desdeVivo, 120) : u.hastaMs - u.desdeMs) / total) * 100)}%`,
                    }}
                    className={[
                      "absolute inset-y-0 overflow-hidden px-0.5 text-left text-[9px] leading-[17px] whitespace-nowrap",
                      esPalabras ? "border-l border-acento/40" : "border-l border-(--panel-border)",
                      enAjuste ? "z-10 bg-acento/20 text-acento" : sonando ? "text-acento" : "text-foreground/55 hover:bg-ink/[0.06] hover:text-foreground",
                      esPalabras && onMoverPalabra ? "cursor-grab active:cursor-grabbing" : "",
                    ].join(" ")}
                  >
                    {u.texto}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end justify-center gap-1">
          <span className="max-w-44 truncate text-[10px] text-foreground/60" title={audio.nombre}>
            ♪ {audio.nombre}
          </span>
          <div className="flex items-center gap-0.5">
            {onRecortarAudio && (
              <button
                type="button"
                onClick={onRecortarAudio}
                title={t("Elegir otro segmento del archivo (el proyecto usa solo ese pedazo)")}
                className="flex h-5 items-center rounded-control px-1.5 text-[10px] text-foreground/50 hover:bg-ink/[0.06] hover:text-foreground"
              >
                {t("Recortar")}
              </button>
            )}
            {onEditarPalabras && (
              <button
                type="button"
                onClick={onEditarPalabras}
                title={t("Corregir la transcripción: mover, borrar, renombrar o agregar palabras (con deshacer)")}
                className="flex h-5 items-center rounded-control px-1.5 text-[10px] text-foreground/50 hover:bg-ink/[0.06] hover:text-foreground"
              >
                {t("Palabras")}
              </button>
            )}
            {onTranscribir && (
              <button
                type="button"
                onClick={onTranscribir}
                disabled={transcribiendo !== null}
                title={t("Whisper local, idioma autodetectado: cada palabra con su tiempo, clickeable para ubicar keyframes — nada sale de tu máquina")}
                className="flex h-5 items-center rounded-control px-1.5 text-[10px] text-acento hover:bg-acento/10 disabled:opacity-60"
              >
                {transcribiendo ?? (audio.transcripcion ? t("Re-transcribir") : t("Transcribir"))}
              </button>
            )}
            <button
              type="button"
              onClick={onQuitar}
              className="flex h-5 items-center gap-1 rounded-control px-1.5 text-[10px] text-foreground/50 hover:bg-ink/[0.06] hover:text-peligro"
              aria-label={t("Quitar el audio del proyecto")}
            >
              <Icono nombre="cerrar" width={9} height={9} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
