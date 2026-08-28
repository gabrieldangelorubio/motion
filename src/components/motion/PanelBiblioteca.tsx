"use client";

/* -----------------------------------------------------------------------------
   Biblioteca de efectos — scrolleás, hacés hover y ves qué hace cada uno

   Organizada en FAMILIAS (pestañas): Textos, Gráficos y Trazos — cada demo
   corre sobre la clase de capa que le toca (el título, la estrella
   vectorial, la línea) con el MOTOR REAL: el preview es lo que el efecto
   hace de verdad. Seleccionar una capa salta solo a su familia — se acabó
   aplicar un efecto de texto a una gráfica «a ver si anda».

   Cada tarjeta es un PAR in/out: al pie van TRES botones iconográficos —
   entrada (→|), ambas (→|→) y salida (|→) — que aplican el preset que
   corresponde a la capa seleccionada. Un solo rAF por carta y sólo en
   hover: cien cartas quietas no cuestan nada.
----------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import {
  FAMILIAS,
  paresPorCategoria,
  plantillaDePar,
  reposoDePar,
  type FamiliaEfecto,
  type ParBiblioteca,
} from "@/lib/motion/biblioteca-puro";
import type { Capa } from "@/lib/motion/modelo";
import { estadoEn } from "@/lib/motion/evaluar-puro";
import { pintar, type Contexto2D } from "@/lib/motion/pintar";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { Segmentado } from "@/components/ui/Segmentado";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";

export type ModoAplicar = "entrada" | "salida" | "ambas";
export type DivisionAplicar = "caracteres" | "palabras" | "lineas";

function Tarjeta({
  par,
  familia,
  onAplicar,
}: {
  par: ParBiblioteca;
  familia: FamiliaEfecto;
  onAplicar: (par: ParBiblioteca, modo: ModoAplicar) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const plantillaRef = useRef<ReturnType<typeof plantillaDePar> | null>(null);
  if (plantillaRef.current == null) plantillaRef.current = plantillaDePar(par, familia);
  const reposo = reposoDePar(par);

  const pintarEn = (tiempo: number) => {
    const canvas = canvasRef.current;
    const plantilla = plantillaRef.current;
    if (!canvas || !plantilla) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const escala = canvas.width / plantilla.ancho;
    // tarjeta COMPACTA: el canvas es más bajo que el 16:9 de la plantilla —
    // se recorta centrado en vertical (la demo vive en el medio del frame)
    const recorteY = (plantilla.alto * escala - canvas.height) / 2;
    ctx.setTransform(escala, 0, 0, escala, 0, -recorteY);
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
      pintarEn((ahora - t0) % (plantillaRef.current?.duracion ?? 2600));
      rafRef.current = requestAnimationFrame(paso);
    };
    rafRef.current = requestAnimationFrame(paso);
  };

  const frenar = () => {
    cancelAnimationFrame(rafRef.current);
    pintarEn(reposo);
  };

  const botones: { modo: ModoAplicar; icono: "efectoIn" | "efectoAmbos" | "efectoOut"; etiqueta: string; habil: boolean }[] = [
    { modo: "entrada", icono: "efectoIn", etiqueta: t("Ponerlo de ENTRADA a la capa seleccionada"), habil: Boolean(par.entrada) },
    { modo: "ambas", icono: "efectoAmbos", etiqueta: t("Ponerle entrada Y salida a la capa seleccionada"), habil: Boolean(par.entrada && par.salida) },
    { modo: "salida", icono: "efectoOut", etiqueta: t("Ponerlo de SALIDA a la capa seleccionada"), habil: Boolean(par.salida) },
  ];

  return (
    <div
      onPointerEnter={arrancar}
      onPointerLeave={frenar}
      className="group/carta mb-2 w-full rounded-control p-1.5 shadow-control hover:bg-ink/[0.06]"
    >
      <canvas ref={canvasRef} width={240} height={84} className="block w-full rounded-[9px]" />
      <div className="mt-1.5 flex items-center gap-1 px-0.5">
        <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/85" title={par.salida && par.entrada ? `${par.entrada} / ${par.salida}` : undefined}>
          {par.id}
        </span>
        {botones.map((b) => (
          <span key={b.modo} className={b.habil ? "" : "pointer-events-none opacity-25"}>
            <BotonIcono
              tam={26}
              etiqueta={b.habil ? b.etiqueta : t("Este efecto no tiene esa mitad")}
              onClick={() => onAplicar(par, b.modo)}
            >
              <Icono nombre={b.icono} width={14} height={14} />
            </BotonIcono>
          </span>
        ))}
      </div>
    </div>
  );
}

export function PanelBiblioteca({
  onAplicar,
  tipoSeleccion = null,
  abierto = true,
  onAlternar,
}: {
  onAplicar: (par: ParBiblioteca, modo: ModoAplicar, division: DivisionAplicar | null) => void;
  /** tipo de la capa seleccionada en el editor: la biblioteca salta sola a
      la familia que le corresponde (texto → Textos, trazo → Trazos, el
      resto → Gráficos); null = no tocar */
  tipoSeleccion?: Capa["tipo"] | null;
  /** plegado, la biblioteca es solo su fila-tab (como «Cámara»); el estado
      lo guarda el Editor para que sobreviva a recargar */
  abierto?: boolean;
  onAlternar?: () => void;
}) {
  const [familia, setFamilia] = useState<FamiliaEfecto>("texto");
  // cómo dividir el TEXTO al aplicar: letras, palabras o líneas — siempre
  // una elegida (aplicar un efecto de texto FIJA esa división en la capa)
  const [division, setDivision] = useState<DivisionAplicar>("caracteres");
  // la selección del editor manda: elegir una gráfica abre «Gráficos», etc.
  // (ajuste DURANTE el render con guard — el patrón de React para estado
  // derivado de props, sin cascada de effects)
  const [ultimoTipo, setUltimoTipo] = useState<Capa["tipo"] | null>(tipoSeleccion);
  if (tipoSeleccion !== ultimoTipo) {
    setUltimoTipo(tipoSeleccion);
    if (tipoSeleccion) {
      setFamilia(tipoSeleccion === "texto" ? "texto" : tipoSeleccion === "trazo" ? "trazo" : "grafica");
    }
  }

  const secciones = paresPorCategoria(familia);

  return (
    <div className="flex h-full min-h-0 flex-col border-t border-(--glass-border) bg-(--chrome-bg)">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        className="flex w-full shrink-0 items-center gap-2 px-3 pb-1 pt-2.5 text-left hover:bg-ink/[0.04]"
      >
        <Icono nombre="biblioteca" width={14} height={14} className="shrink-0 text-foreground/60" />
        <span className="min-w-0 flex-1 text-[13px] font-semibold text-foreground">{t("Efectos")}</span>
        <Icono
          nombre="chevronAbajo"
          width={13}
          height={13}
          className={`shrink-0 text-foreground/50 transition-transform duration-200 ${abierto ? "" : "-rotate-90"}`}
        />
      </button>
      {abierto && (
        <>
          {/* flex-wrap: el panel es angosto (~240px) y pestañas + iconos de
              división no siempre entran juntos — sin wrap los iconos caían
              DEBAJO del lienzo, que les comía el click */}
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-1.5 pt-0.5">
            <Segmentado
              opciones={FAMILIAS.map((f) => ({ valor: f.id, nombre: t(f.nombre) }))}
              valor={familia}
              onCambio={(v) => setFamilia(v as FamiliaEfecto)}
              etiquetaAria={t("Familia de efectos")}
            />
            {familia === "texto" && (
              <div
                role="group"
                aria-label={t("División del texto al aplicar el efecto")}
                className="ml-auto flex shrink-0 items-center gap-0.5"
              >
                {([
                  { valor: "caracteres", icono: "divisionLetras", nombre: t("Dividir por LETRAS al aplicar") },
                  { valor: "palabras", icono: "divisionPalabras", nombre: t("Dividir por PALABRAS al aplicar") },
                  { valor: "lineas", icono: "divisionLineas", nombre: t("Dividir por LÍNEAS al aplicar") },
                ] as const).map((op) => (
                  <BotonIcono
                    key={op.valor}
                    tam={24}
                    etiqueta={op.nombre}
                    activo={division === op.valor}
                    onClick={() => setDivision(op.valor)}
                  >
                    <Icono nombre={op.icono} width={13} height={13} />
                  </BotonIcono>
                ))}
              </div>
            )}
          </div>
          <div className="px-3 pb-2 text-xs text-muted">
            {t("Hover para verlo · →| entrada · →|→ ambas · |→ salida, sobre la capa seleccionada.")}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
            {secciones.map(({ categoria, pares }) => (
              <div key={categoria.id}>
                <Etiqueta className="mb-1.5 mt-2 px-1">{t(categoria.nombre)}</Etiqueta>
                {pares.map((par) => (
                  <Tarjeta
                    key={`${familia}-${par.id}`}
                    par={par}
                    familia={familia}
                    onAplicar={(p, modo) => onAplicar(p, modo, familia === "texto" ? division : null)}
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
