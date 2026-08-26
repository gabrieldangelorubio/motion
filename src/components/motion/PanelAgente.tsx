"use client";

/* -----------------------------------------------------------------------------
   Panel del agente — dirigir la animación conversando

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
import { ConPista } from "@/components/ui/ConPista";
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
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);

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
    <>
      <div className="absolute bottom-3 left-3 z-20">
        <ConPista pista={t("Dirigir con el agente")}>
          <BotonIcono tam={36} etiqueta={t("Dirigir con el agente")} activo={abierto} onClick={() => setAbierto((a) => !a)}>
            <Icono nombre="ia" width={17} height={17} />
          </BotonIcono>
        </ConPista>
      </div>

      {abierto && (
        <div className="absolute bottom-14 left-3 z-20 flex max-h-[70%] w-[360px] flex-col rounded-card border border-(--menu-border) bg-(--menu-solido-bg) shadow-(--menu-shadow)">
          <div className="border-b border-(--glass-border) px-3 py-2 text-[13px] font-semibold text-foreground">
            {t("Director de motion")}
          </div>
          <div ref={listaRef} className="min-h-24 flex-1 overflow-y-auto px-3 py-2">
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
            <BotonIcono tam={36} etiqueta={t("Enviar")} onClick={() => void enviar()} deshabilitado={pensando || !texto.trim()}>
              <Icono nombre="enviar" width={16} height={16} />
            </BotonIcono>
          </div>
        </div>
      )}
    </>
  );
}
