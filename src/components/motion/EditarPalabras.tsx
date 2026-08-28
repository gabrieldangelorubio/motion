"use client";

/* -----------------------------------------------------------------------------
   Editor de PALABRAS de la transcripción — corregir la locución con lugar

   Whisper acierta casi siempre, pero cuando le pifia hay que poder arreglarlo
   CÓMODO: este modal (desde «Palabras» en la franja) muestra la onda del
   segmento en uso con las palabras como CHIPS grandes abajo.
   - arrastrar un chip = corregir DÓNDE cae (la lista se reordena sola:
     ninguna palabra queda inagarrable)
   - click = seleccionar y llevar el cursor de escucha ahí
   - doble click en un chip = renombrarlo · la × (o Supr) lo borra
   - doble click en la onda (o «+ Palabra») = agregar una que whisper se olvidó
   - Ctrl/Cmd+Z deshace TODO lo anterior (undo local del modal): acá no se
     pierde nada para siempre
   Teclado PROPIO (capture): espacio escucha desde el cursor sin tocar el
   editor de atrás; Escape cancela. Nada persiste hasta «Guardar».
----------------------------------------------------------------------------- */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AudioDecodificado } from "@/lib/motion/audio-guardado";
import {
  agregarPalabraLista,
  moverPalabraLista,
  renombrarPalabraLista,
  type Palabra,
} from "@/lib/motion/stt-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";

const ALTO = 80;
/** carril de chips: dos filas alternadas para que las palabras densas respiren */
const ALTO_CARRIL = 56;
/** duración nominal de una palabra agregada a mano (es un hito: solo importa el in) */
const DUR_NUEVA_MS = 250;

function Tiempo({ ms }: { ms: number }) {
  const s = ms / 1000;
  return <span className="font-mono text-[11px] tabular-nums text-foreground/70">{s.toFixed(2)}s</span>;
}

export function EditarPalabras({
  audio,
  onGuardar,
  onCerrar,
}: {
  audio: AudioDecodificado;
  /** la lista final (ya ordenada por tiempo, en ms del SEGMENTO en uso) */
  onGuardar: (palabras: Palabra[]) => void;
  /** salir sin tocar nada */
  onCerrar: () => void;
}) {
  const dur = Math.max(1, audio.duracionMs);
  // el <audio> toca el ARCHIVO entero: el recorte se compensa con offset
  const offset = audio.recorte?.desdeMs ?? 0;

  const [palabras, setPalabras] = useState<Palabra[]>(audio.transcripcion?.palabras ?? []);
  const [historial, setHistorial] = useState<Palabra[][]>([]);
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [editando, setEditando] = useState<{ indice: number; texto: string } | null>(null);
  const [cursor, setCursor] = useState(0);
  const [sonando, setSonando] = useState(false);
  // drag vivo de un chip (se pinta acá; se comete al soltar)
  const [ajuste, setAjuste] = useState<{ indice: number; desdeMs: number } | null>(null);

  const marcoRef = useRef<HTMLDivElement>(null);
  const lienzoRef = useRef<HTMLCanvasElement>(null);
  const reproductorRef = useRef<HTMLAudioElement | null>(null);
  const dragRef = useRef<{ indice: number; x0: number; desde0: number; movido: boolean } | null>(null);

  // refs espejo para el teclado (listener estable con estado vivo)
  const palabrasRef = useRef(palabras);
  const historialRef = useRef(historial);
  const seleccionRef = useRef(seleccion);
  const editandoRef = useRef(editando);
  const cursorRef = useRef(cursor);
  const onCerrarRef = useRef(onCerrar);
  useEffect(() => {
    palabrasRef.current = palabras;
    historialRef.current = historial;
    seleccionRef.current = seleccion;
    editandoRef.current = editando;
    cursorRef.current = cursor;
    onCerrarRef.current = onCerrar;
  }, [palabras, historial, seleccion, editando, cursor, onCerrar]);

  /** guarda el estado actual en el historial ANTES de una mutación */
  const empujarHistorial = useCallback(() => {
    setHistorial((h) => [...h.slice(-99), palabrasRef.current]);
  }, []);

  const deshacer = useCallback(() => {
    const h = historialRef.current;
    if (h.length === 0) return;
    const previo = h[h.length - 1];
    setHistorial(h.slice(0, -1));
    setPalabras(previo);
    setSeleccion(null);
    setEditando(null);
  }, []);

  // ——— reproductor propio, esclavo del cursor (offset = inicio del recorte) ———
  useEffect(() => {
    const el = new Audio(audio.url);
    el.preload = "auto";
    el.ontimeupdate = () => {
      const ms = el.currentTime * 1000 - offset;
      setCursor(ms);
      if (ms >= dur) {
        el.pause();
        setSonando(false);
      }
    };
    el.onended = () => setSonando(false);
    reproductorRef.current = el;
    return () => {
      el.pause();
      reproductorRef.current = null;
    };
  }, [audio.url, offset, dur]);

  const alternarPlay = useCallback(() => {
    const el = reproductorRef.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      setSonando(false);
      return;
    }
    const inicio = Math.min(Math.max(cursorRef.current, 0), dur - 50);
    el.currentTime = (offset + inicio) / 1000;
    setCursor(inicio);
    void el.play().catch(() => undefined);
    setSonando(true);
  }, [dur, offset]);

  const escrub = useCallback(
    (ms: number) => {
      const limpio = Math.min(dur, Math.max(0, ms));
      setCursor(limpio);
      const el = reproductorRef.current;
      if (el) el.currentTime = (offset + limpio) / 1000;
    },
    [dur, offset],
  );

  const borrarPalabra = useCallback(
    (indice: number) => {
      if (!palabrasRef.current[indice]) return;
      empujarHistorial();
      setPalabras((prev) => prev.filter((_, i) => i !== indice));
      setSeleccion(null);
      setEditando(null);
    },
    [empujarHistorial],
  );

  const agregarEn = useCallback(
    (ms: number) => {
      const desde = Math.min(Math.max(0, Math.round(ms)), dur - DUR_NUEVA_MS);
      empujarHistorial();
      const nueva: Palabra = { texto: t("palabra"), desdeMs: desde, hastaMs: desde + DUR_NUEVA_MS };
      const nuevas = agregarPalabraLista(palabrasRef.current, nueva);
      const indice = nuevas.findIndex((p) => p.desdeMs === desde && p.texto === nueva.texto);
      setPalabras(nuevas);
      setSeleccion(indice >= 0 ? indice : null);
      // recién nacida = directo a renombrar (para eso se agregó)
      if (indice >= 0) setEditando({ indice, texto: "" });
    },
    [dur, empujarHistorial],
  );

  const confirmarRename = useCallback(() => {
    const ed = editandoRef.current;
    setEditando(null);
    if (!ed) return;
    const actual = palabrasRef.current[ed.indice];
    if (!actual || actual.texto === ed.texto.trim() || !ed.texto.trim()) return;
    empujarHistorial();
    setPalabras((prev) => renombrarPalabraLista(prev, ed.indice, ed.texto));
  }, [empujarHistorial]);

  // ——— teclado del modal: mientras está abierto, EL MODAL manda ———
  // espacio = escuchar desde el cursor · Supr = borrar la seleccionada ·
  // Ctrl/Cmd+Z = deshacer · Escape = cancelar. Renombrando, las teclas van
  // al input (solo Enter/Escape se manejan acá).
  useEffect(() => {
    const alTecla = (e: KeyboardEvent) => {
      if (editandoRef.current) {
        // que nada llegue al editor de atrás; el input escribe por defecto
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          setEditando(null);
        } else if (e.key === "Enter") {
          e.preventDefault();
          confirmarRename();
        }
        return;
      }
      const tecla = e.key.toLowerCase();
      const esUndo = (e.metaKey || e.ctrlKey) && tecla === "z" && !e.shiftKey;
      if (!esUndo && (e.metaKey || e.ctrlKey || e.altKey)) return;
      if (!esUndo && ![" ", "escape", "delete", "backspace"].includes(tecla)) return;
      e.preventDefault();
      e.stopPropagation();
      if (esUndo) deshacer();
      else if (e.key === " ") alternarPlay();
      else if (tecla === "escape") {
        reproductorRef.current?.pause();
        onCerrarRef.current();
      } else if (seleccionRef.current != null) borrarPalabra(seleccionRef.current);
    };
    window.addEventListener("keydown", alTecla, { capture: true });
    return () => window.removeEventListener("keydown", alTecla, { capture: true });
  }, [alternarPlay, deshacer, borrarPalabra, confirmarRename]);

  // ——— la onda del SEGMENTO + ticks de palabra + cursor ———
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
    const picos = audio.picos;
    const centro = ALTO / 2 + 3;
    for (let x = 0; x < ancho; x++) {
      const pico = picos[Math.min(picos.length - 1, Math.floor((x / ancho) * picos.length))] ?? 0;
      const alto = Math.max(1, pico * (ALTO - 16));
      ctx.fillStyle = tinta;
      ctx.globalAlpha = 0.45;
      ctx.fillRect(x, centro - alto / 2, 1, alto);
    }
    // el «in» de cada palabra, como tick arriba (el ajustado sigue al drag)
    ctx.globalAlpha = 1;
    ctx.fillStyle = acento;
    palabras.forEach((p, i) => {
      const desde = ajuste?.indice === i ? ajuste.desdeMs : p.desdeMs;
      const x = (desde / dur) * ancho;
      ctx.globalAlpha = ajuste?.indice === i ? 1 : 0.55;
      ctx.fillRect(x, 0, 1.5, 7);
    });
    ctx.globalAlpha = 1;
    // cursor de escucha
    const xc = (Math.min(cursor, dur) / dur) * ancho;
    ctx.strokeStyle = tinta;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(xc, 0);
    ctx.lineTo(xc, ALTO);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }, [audio, palabras, ajuste, cursor, dur]);

  const msDeEvento = useCallback(
    (clientX: number) => {
      const caja = marcoRef.current?.getBoundingClientRect();
      if (!caja) return 0;
      return Math.min(1, Math.max(0, (clientX - caja.left) / caja.width)) * dur;
    },
    [dur],
  );

  // la onda: click/arrastre = scrub · doble click = palabra nueva ahí
  const scrubRef = useRef(false);
  const alBajarOnda = (e: React.PointerEvent) => {
    scrubRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    escrub(msDeEvento(e.clientX));
  };
  const alMoverOnda = (e: React.PointerEvent) => {
    if (scrubRef.current) escrub(msDeEvento(e.clientX));
  };

  // ——— chips: drag corrige el lugar; click selecciona; doble click renombra ———
  const bajarEnChip = (e: React.PointerEvent, indice: number, p: Palabra) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { indice, x0: e.clientX, desde0: p.desdeMs, movido: false };
  };
  const moverEnChip = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const caja = marcoRef.current?.getBoundingClientRect();
    if (!drag || !caja) return;
    const dx = e.clientX - drag.x0;
    if (!drag.movido && Math.abs(dx) < 3) return;
    drag.movido = true;
    const nuevo = Math.min(dur, Math.max(0, drag.desde0 + dx * (dur / caja.width)));
    setAjuste({ indice: drag.indice, desdeMs: nuevo });
  };
  const soltarEnChip = (p: Palabra) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const vivo = ajuste;
    setAjuste(null);
    if (drag.movido && vivo && vivo.indice === drag.indice) {
      const desde = Math.max(0, Math.round(vivo.desdeMs));
      empujarHistorial();
      const nuevas = moverPalabraLista(palabrasRef.current, drag.indice, desde);
      setPalabras(nuevas);
      const movida = nuevas.findIndex((x) => x.desdeMs === desde && x.texto === p.texto);
      setSeleccion(movida >= 0 ? movida : null);
    } else {
      setSeleccion(drag.indice);
      escrub(p.desdeMs);
    }
  };

  const cerrar = () => {
    reproductorRef.current?.pause();
    onCerrar();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6">
      <div className="relative w-full max-w-3xl rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-4 shadow-(--menu-shadow)">
        <div className="absolute right-2 top-2">
          <BotonIcono tam={28} etiqueta={t("Salir sin guardar")} onClick={cerrar}>
            <Icono nombre="cerrar" width={13} height={13} />
          </BotonIcono>
        </div>
        <div className="text-[15px] font-semibold text-foreground">{t("Corregí las palabras")}</div>
        <p className="mt-1 pr-8 text-[12px] leading-snug text-muted">
          {t("Arrastrá una palabra para corregir dónde cae · doble click la renombra · × (o Supr) la borra · doble click en la onda agrega una donde whisper se la olvidó. Ctrl+Z deshace; nada queda hasta Guardar.")}
        </p>
        <div
          ref={marcoRef}
          role="slider"
          aria-label={t("Onda del segmento: click = escuchar desde ahí; doble click = agregar palabra")}
          aria-valuemin={0}
          aria-valuemax={dur}
          aria-valuenow={Math.round(cursor)}
          className="relative mt-3 cursor-crosshair touch-none select-none"
          style={{ height: ALTO }}
          onPointerDown={alBajarOnda}
          onPointerMove={alMoverOnda}
          onPointerUp={() => (scrubRef.current = false)}
          onPointerCancel={() => (scrubRef.current = false)}
          onDoubleClick={(e) => agregarEn(msDeEvento(e.clientX))}
        >
          <canvas ref={lienzoRef} className="absolute inset-0 h-full w-full" />
        </div>
        <div
          className="relative mt-1 select-none border-t border-(--panel-border)"
          style={{ height: ALTO_CARRIL }}
          aria-label={t("Palabras de la transcripción, cada una donde cae en el audio")}
        >
          {palabras.map((p, i) => {
            const enAjuste = ajuste?.indice === i;
            const desdeVivo = enAjuste ? ajuste.desdeMs : p.desdeMs;
            const elegida = seleccion === i;
            const siguienteDesde = i + 1 < palabras.length ? palabras[i + 1].desdeMs : dur;
            const sonandoChip = cursor >= desdeVivo && cursor < (i + 1 < palabras.length ? siguienteDesde : dur);
            return (
              <button
                key={`${p.texto}-${p.desdeMs}-${i}`}
                type="button"
                onPointerDown={(e) => bajarEnChip(e, i, p)}
                onPointerMove={moverEnChip}
                onPointerUp={() => soltarEnChip(p)}
                onPointerCancel={() => {
                  dragRef.current = null;
                  setAjuste(null);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setSeleccion(i);
                  setEditando({ indice: i, texto: p.texto });
                }}
                title={t("«{p}» @ {s}s — arrastrá para moverla · doble click renombra · × borra", {
                  p: p.texto,
                  s: (desdeVivo / 1000).toFixed(2),
                })}
                style={{
                  left: `${(desdeVivo / dur) * 100}%`,
                  width: `max(${Math.max(0.4, ((siguienteDesde - desdeVivo) / dur) * 100)}%, 40px)`,
                  top: i % 2 === 0 ? 0 : "50%",
                  height: "50%",
                }}
                className={[
                  "group/chip absolute overflow-hidden border-l-2 px-1 text-left text-[11px] leading-[26px] whitespace-nowrap",
                  "cursor-grab active:cursor-grabbing",
                  enAjuste
                    ? "z-20 border-acento bg-acento/25 text-acento"
                    : elegida
                      ? "z-10 border-acento bg-acento/15 text-acento"
                      : sonandoChip
                        ? "border-acento/60 text-acento hover:z-10"
                        : "border-acento/35 text-foreground/65 hover:z-10 hover:bg-ink/[0.06] hover:text-foreground",
                ].join(" ")}
              >
                {p.texto}
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={t("Borrar la palabra «{p}»", { p: p.texto })}
                  onPointerDown={(e) => e.stopPropagation()}
                  onPointerUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    borrarPalabra(i);
                  }}
                  className="ml-1 hidden px-0.5 text-[12px] text-foreground/40 hover:text-peligro group-hover/chip:inline"
                >
                  ×
                </span>
              </button>
            );
          })}
          {palabras.length === 0 && (
            <p className="px-1 pt-2 text-[11px] text-muted">
              {t("Sin palabras todavía: doble click en la onda (o «+ Palabra») para marcar la primera.")}
            </p>
          )}
          {editando && palabras[editando.indice] && (
            <input
              autoFocus
              value={editando.texto}
              placeholder={palabras[editando.indice].texto}
              aria-label={t("Nuevo texto de la palabra")}
              onChange={(e) => setEditando({ indice: editando.indice, texto: e.target.value })}
              onBlur={confirmarRename}
              style={{
                left: `min(${(palabras[editando.indice].desdeMs / dur) * 100}%, calc(100% - 120px))`,
                top: editando.indice % 2 === 0 ? 0 : "50%",
              }}
              className="absolute z-30 h-[26px] w-[116px] rounded-control border border-acento bg-(--menu-solido-bg) px-1.5 text-[11px] text-foreground outline-none"
            />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BotonIcono
              tam={30}
              etiqueta={sonando ? t("Pausar la escucha (espacio)") : t("Escuchar desde el cursor (espacio)")}
              onClick={alternarPlay}
            >
              <Icono nombre={sonando ? "pausa" : "play"} width={13} height={13} />
            </BotonIcono>
            <Tiempo ms={Math.max(0, cursor)} />
            <button
              type="button"
              onClick={() => agregarEn(cursorRef.current)}
              className="flex h-8 items-center rounded-control px-2.5 text-[12px] text-acento shadow-control hover:bg-acento/10"
            >
              {t("+ Palabra en el cursor")}
            </button>
            {historial.length > 0 && (
              <button
                type="button"
                onClick={deshacer}
                className="flex h-8 items-center rounded-control px-2.5 text-[12px] text-foreground/70 hover:bg-ink/[0.06]"
              >
                {t("Deshacer (Ctrl+Z)")}
              </button>
            )}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cerrar}
              className="flex h-8 items-center rounded-control px-3 text-[12px] text-foreground/80 shadow-control hover:bg-ink/[0.06]"
            >
              {t("Cancelar")}
            </button>
            <button
              type="button"
              onClick={() => {
                reproductorRef.current?.pause();
                onGuardar(palabras);
              }}
              className="boton flex h-8 items-center rounded-control bg-acento px-3 text-[12px] font-semibold text-white hover:bg-acento/85"
            >
              {t("Guardar")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
