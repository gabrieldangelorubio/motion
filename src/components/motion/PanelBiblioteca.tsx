"use client";

/* -----------------------------------------------------------------------------
   Biblioteca de efectos — scrolleás, hacés hover y ves qué hace cada uno

   Cada carta tiene un mini canvas donde corre el MOTOR REAL sobre la
   plantilla del efecto (biblioteca-puro): en reposo muestra un frame quieto,
   y con el mouse arriba (o foco de teclado) el bucle arranca. Tocarla aplica
   el efecto a la capa seleccionada (reemplaza la entrada o la salida según
   la clase del preset, conservando el timing existente — eso lo decide el
   Editor). Un solo rAF por carta y sólo mientras está en hover: cien cartas
   quietas no cuestan nada.
----------------------------------------------------------------------------- */

import { useEffect, useRef } from "react";
import {
  efectosPorCategoria,
  plantillaDeEfecto,
  reposoDeEfecto,
  type EfectoBiblioteca,
} from "@/lib/motion/biblioteca-puro";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";

function Tarjeta({ efecto, onAplicar }: { efecto: EfectoBiblioteca; onAplicar: (nombre: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const plantillaRef = useRef<ReturnType<typeof plantillaDeEfecto> | null>(null);
  if (plantillaRef.current == null) plantillaRef.current = plantillaDeEfecto(efecto.nombre);
  const reposo = reposoDeEfecto(efecto.clase);

  const pintarEn = (tiempo: number) => {
    const canvas = canvasRef.current;
    const plantilla = plantillaRef.current;
    if (!canvas || !plantilla) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const escala = canvas.width / plantilla.ancho;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
    pintar(estadoEn(plantilla, tiempo), ctx as unknown as Contexto2D);
  };

  useEffect(() => {
    pintarEn(reposo);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const arrancar = () => {
    cancelAnimationFrame(rafRef.current);
    const t0 = performance.now();
    const paso = (ahora: number) => {
      pintarEn((ahora - t0) % (plantillaRef.current?.duracion ?? 1900));
      rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);
  };

  const frenar = () => {
    cancelAnimationFrame(rafRef.current);
    pintarEn(reposo);
  };

  return (
    <button
      type="button"
      onClick={() => onAplicar(efecto.nombre)}
      onPointerEnter={arrancar}
      onPointerLeave={frenar}
      onFocus={arrancar}
      onBlur={frenar}
      aria-label={t("Aplicar el efecto «{nombre}» a la capa seleccionada", { nombre: efecto.nombre })}
      className="boton group/carta mb-2 w-full rounded-control p-1.5 text-left shadow-control hover:bg-ink/[0.06]"
    >
      <canvas ref={canvasRef} width={240} height={135} className="block w-full rounded-[9px]" />
      <div className="mt-1.5 flex items-center gap-1.5 px-1">
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/85">{efecto.nombre}</span>
        {efecto.esDeTrazo && (
          <span className="shrink-0 font-mono text-[10px] text-foreground/40" aria-hidden>〜</span>
        )}
        <span
          className={[
            "shrink-0 rounded-full px-1.5 font-mono text-[9px] uppercase leading-4",
            efecto.clase === "entrada" ? "bg-acento/15 text-acento" : "bg-ink/[0.1] text-foreground/55",
          ].join(" ")}
        >
          {efecto.clase === "entrada" ? t("in") : t("out")}
        </span>
      </div>
    </button>
  );
}

export function PanelBiblioteca({
  onCerrar,
  onAplicar,
}: {
  onCerrar: () => void;
  onAplicar: (nombre: string) => void;
}) {
  const secciones = efectosPorCategoria();

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-(--glass-border) bg-(--chrome-bg)">
      <div className="flex items-center gap-2 px-3 pb-1 pt-2.5">
        <div className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">{t("Efectos")}</div>
        <BotonIcono tam={26} etiqueta={t("Cerrar la biblioteca")} onClick={onCerrar}>
          <Icono nombre="cerrar" width={13} height={13} />
        </BotonIcono>
      </div>
      <div className="px-3 pb-2 text-xs text-muted">
        {t("Hover para verlo; click se lo pone a la capa seleccionada.")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {secciones.map(({ categoria, efectos }) => (
          <div key={categoria.id}>
            <Etiqueta className="mb-1.5 mt-2 px-1">{t(categoria.nombre)}</Etiqueta>
            {efectos.map((efecto) => (
              <Tarjeta key={efecto.nombre} efecto={efecto} onAplicar={onAplicar} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
