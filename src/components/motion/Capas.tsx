"use client";

/* -----------------------------------------------------------------------------
   Panel de capas — agrupado por pantalla, con reorden por drag y borrado

   Las capas se agrupan por su pantalla (el frame del que vinieron en Figma):
   cabecera colapsable con el nombre del frame, y adentro el ÁRBOL de
   carpetas del archivo (`ruta` de cada capa, v19 del plugin) — el mismo
   orden, la misma anidación y los mismos nombres que en Figma. Arrastrar una fila vertical reordena el z-order EN SU
   contenedor (capas dentro de su pantalla, sueltas entre sueltas, pantallas
   entre pantallas), en vivo y con UN checkpoint por gesto (§8.3). Cada fila
   tiene ocultar y borrar; borrar la placa borra la pantalla completa. La
   visibilidad de hover se ve siempre con puntero grueso (coarse:).

   CONVENCIÓN VISUAL (como AE y Figma): la fila de ARRIBA tapa a la de abajo.
   En el modelo `capas[0]` es el fondo, así que el panel pinta el array AL
   REVÉS; el drag lo compensa negando `despues` (soltar visualmente abajo de
   una fila = quedar ANTES en el array).
----------------------------------------------------------------------------- */

import { useRef, useState } from "react";
import type { Capa, Composicion } from "@/lib/motion/modelo";
import { CAMARA_ID } from "@/lib/motion/herramientas-puro";
import { arbolDeCapas, idsDelArbol, contarCapas, type NodoArbol } from "@/lib/motion/arbol-capas-puro";
import { t } from "@/lib/i18n/stub";
import { Icono } from "@/components/icons";
import { BotonIcono } from "@/components/ui/BotonIcono";

const ETIQUETA_TIPO: Record<string, string> = {
  texto: "T",
  forma: "▢",
  media: "▣",
  trazo: "〜",
  video: "▶",
};

/** Contenedores de reorden: una pantalla (su id de grupo), sueltas, o cabeceras. */
const SUELTAS = "@sueltas";
const PANTALLAS = "@pantallas";

type Elemento =
  | { tipo: "capa"; capa: Capa }
  | { tipo: "pantalla"; placa: Capa; miembros: Capa[] };

function elementosDe(comp: Composicion): Elemento[] {
  const vistos = new Set<string>();
  const placas = new Set(comp.capas.filter((c) => c.grupo === c.id).map((c) => c.id));
  const salida: Elemento[] = [];
  for (const capa of comp.capas) {
    if (vistos.has(capa.id)) continue;
    if (capa.grupo && placas.has(capa.grupo)) {
      const placa = comp.capas.find((c) => c.id === capa.grupo)!;
      const miembros = comp.capas.filter((c) => c.grupo === capa.grupo);
      for (const m of miembros) vistos.add(m.id);
      salida.push({ tipo: "pantalla", placa, miembros });
    } else {
      vistos.add(capa.id);
      salida.push({ tipo: "capa", capa });
    }
  }
  return salida;
}

export function Capas({
  composicion,
  seleccionId,
  seleccionIds = [],
  onSeleccionar,
  onAlternarSeleccion,
  onSeleccionarVarias,
  onAlternarVisibilidad,
  onCheckpoint,
  onReordenarCapa,
  onReordenarPantalla,
  onBorrarCapa,
}: {
  composicion: Composicion;
  seleccionId: string | null;
  /** selección múltiple (la primaria incluida) para resaltar todas */
  seleccionIds?: string[];
  onSeleccionar: (id: string) => void;
  /** shift+click en una fila: entra/sale de la selección múltiple */
  onAlternarSeleccion?: (id: string) => void;
  /** click en la cabecera de un SUBGRUPO: selecciona todas sus capas */
  onSeleccionarVarias?: (ids: string[]) => void;
  onAlternarVisibilidad: (id: string) => void;
  onCheckpoint: () => void;
  /** mover capaId para quedar antes/después de referenciaId (mismo contenedor) */
  onReordenarCapa: (capaId: string, referenciaId: string, despues: boolean) => void;
  /** mover la pantalla entera antes/después de otra pantalla */
  onReordenarPantalla: (grupo: string, grupoDestino: string, despues: boolean) => void;
  /** borrar una capa (la placa borra su pantalla completa) */
  onBorrarCapa: (capaId: string) => void;
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const gestoRef = useRef<{ id: string; cont: string; selId: string; y0: number; activo: boolean } | null>(null);

  const alternarGrupo = (grupo: string) =>
    setAbiertos((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(grupo)) nuevo.delete(grupo);
      else nuevo.add(grupo);
      return nuevo;
    });

  // Drag vertical con listeners en window (§8.3): reordena EN VIVO contra la
  // fila bajo el puntero (mismo contenedor); un click seco selecciona.
  const iniciarFila = (e: React.PointerEvent, id: string, cont: string, selId: string) => {
    // sin esto el browser arranca una SELECCIÓN DE TEXTO sobre los nombres
    // mientras arrastrás la fila — el drag se vuelve un enchastre visual
    e.preventDefault();
    const gesto = { id, cont, selId, y0: e.clientY, activo: false };
    gestoRef.current = gesto;
    const alMover = (ev: PointerEvent) => {
      if (!gesto.activo) {
        if (Math.abs(ev.clientY - gesto.y0) < 5) return;
        gesto.activo = true;
        onCheckpoint(); // un gesto de reorden = UN paso de undo
      }
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest?.(
        "[data-fila-id]",
      ) as HTMLElement | null;
      if (!el) return;
      const otroId = el.dataset.filaId!;
      if (otroId === gesto.id || el.dataset.filaCont !== gesto.cont) return;
      const r = el.getBoundingClientRect();
      // display invertido: la mitad de abajo de la fila = ANTES en el array
      const despues = !(ev.clientY > r.top + r.height / 2);
      if (gesto.cont === PANTALLAS) onReordenarPantalla(gesto.id, otroId, despues);
      else onReordenarCapa(gesto.id, otroId, despues);
    };
    const alSoltar = (ev: PointerEvent) => {
      if (!gesto.activo) {
        if (ev.shiftKey && onAlternarSeleccion) onAlternarSeleccion(gesto.selId);
        else onSeleccionar(gesto.selId);
      }
      gestoRef.current = null;
      window.removeEventListener("pointermove", alMover);
      window.removeEventListener("pointerup", alSoltar);
    };
    window.addEventListener("pointermove", alMover);
    window.addEventListener("pointerup", alSoltar);
  };

  const fila = (capa: Capa, cont: string, sangria: boolean, nivel = 0) => {
    const activa = seleccionId === capa.id || seleccionIds.includes(capa.id);
    const esPlaca = capa.grupo === capa.id;
    // el video de referencia vive CLAVADO al fondo: ni se arrastra ni es
    // blanco de drop (sin data-fila-id no existe para el reorden) — solo
    // se selecciona con click, para ver su sección del inspector
    const esVideo = capa.tipo === "video";
    return (
      <div
        key={capa.id}
        data-fila-id={esVideo ? undefined : capa.id}
        data-fila-cont={esVideo ? undefined : cont}
        onPointerDown={esVideo ? undefined : (e) => iniciarFila(e, capa.id, cont, capa.id)}
        onClick={
          esVideo
            ? (e) => (e.shiftKey && onAlternarSeleccion ? onAlternarSeleccion(capa.id) : onSeleccionar(capa.id))
            : undefined
        }
        style={sangria ? { paddingLeft: 24 + Math.min(nivel, 6) * 10 } : undefined}
        className={[
          "group/fila relative mb-0.5 flex h-8 touch-none items-center gap-2 rounded-control pr-1",
          esVideo ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
          sangria ? "" : "pl-2.5",
          activa ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
        ].join(" ")}
      >
        <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", activa ? "bg-acento" : "bg-transparent"].join(" ")} />
        <span className="w-4 shrink-0 text-center font-mono text-[11px] text-foreground/40" aria-hidden>
          {ETIQUETA_TIPO[capa.tipo] ?? "?"}
        </span>
        <span
          className={[
            "min-w-0 flex-1 truncate text-left text-[13px]",
            activa ? "text-foreground" : "text-foreground/75",
            capa.oculta ? "opacity-45" : "",
          ].join(" ")}
        >
          {capa.nombre}
        </span>
        {capa.tipo === "video" && (
          <span
            className="shrink-0 rounded-full bg-ink/[0.08] px-1.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-foreground/50"
            aria-label={t("Video de referencia: solo guía, no sale en el export")}
          >
            {t("REF")}
          </span>
        )}
        {capa.bloqueada && <Icono nombre="candado" width={13} height={13} className="shrink-0 text-foreground/40" />}
        <span
          className="flex opacity-0 group-hover/fila:opacity-100 coarse:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <BotonIcono
            tam={26}
            tono="peligro"
            etiqueta={
              esPlaca
                ? t("Borrar la pantalla completa de «{nombre}»", { nombre: capa.nombre })
                : t("Borrar «{nombre}»", { nombre: capa.nombre })
            }
            onClick={() => onBorrarCapa(capa.id)}
          >
            <Icono nombre="basura" width={13} height={13} />
          </BotonIcono>
          <BotonIcono
            tam={26}
            etiqueta={capa.oculta ? t("Mostrar «{nombre}»", { nombre: capa.nombre }) : t("Ocultar «{nombre}»", { nombre: capa.nombre })}
            onClick={() => onAlternarVisibilidad(capa.id)}
          >
            <Icono nombre={capa.oculta ? "ojoTachado" : "ojo"} width={13} height={13} />
          </BotonIcono>
        </span>
      </div>
    );
  };

  // frente arriba: el array va fondo→frente, el panel lo pinta al revés
  const elementos = elementosDe(composicion).reverse();
  const seleccionada = composicion.capas.find((c) => c.id === seleccionId);

  // ——— ÁRBOL DE FIGMA adentro de una pantalla: las carpetas del archivo
  // (`ruta` de cada capa) plegables a cualquier profundidad, en el mismo
  // orden de z. Click en la cabecera de una carpeta selecciona todo lo que
  // tiene adentro (para mover/animar en bloque); las capas siguen sueltas
  // en el modelo. Una carpeta con la selección adentro se abre sola.
  // el gesto manual MANDA: una carpeta que contiene la selección se abre
  // sola, pero si la plegás a mano queda plegada (antes no se podía)
  const [plegadoManual, setPlegadoManual] = useState<Map<string, boolean>>(new Map());
  const alternarCarpeta = (id: string, abiertoAhora: boolean) =>
    setPlegadoManual((prev) => {
      const nuevo = new Map(prev);
      nuevo.set(id, !abiertoAhora);
      return nuevo;
    });
  const pintarNodo = (nodo: NodoArbol, cont: string, nivel: number): React.ReactNode => {
    if (nodo.tipo === "capa") return fila(nodo.capa, cont, true, nivel);
    const ids = idsDelArbol(nodo);
    const manual = plegadoManual.get(nodo.id);
    const abierto = manual !== undefined ? manual : ids.includes(seleccionId ?? "");
    const alguna = ids.some((id) => id === seleccionId || seleccionIds.includes(id));
    const sangria = 16 + Math.min(nivel, 6) * 10;
    return (
      <div key={nodo.id}>
        <div
          role="button"
          tabIndex={0}
          title={nodo.ruta}
          aria-label={t("Carpeta «{nombre}»: seleccionar sus {n} capas", { nombre: nodo.nombre, n: ids.length })}
          onClick={() => onSeleccionarVarias?.(ids)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSeleccionarVarias?.(ids);
            }
          }}
          style={{ paddingLeft: sangria }}
          className={[
            "group/fila relative mb-0.5 flex h-8 cursor-pointer touch-none items-center gap-1 rounded-control pr-1",
            alguna ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
          ].join(" ")}
        >
          <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", alguna ? "bg-acento" : "bg-transparent"].join(" ")} />
          <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <BotonIcono
              tam={22}
              activo={abierto}
              etiqueta={abierto ? t("Plegar «{nombre}»", { nombre: nodo.nombre }) : t("Desplegar «{nombre}»", { nombre: nodo.nombre })}
              onClick={() => alternarCarpeta(nodo.id, abierto)}
            >
              <Icono nombre="chevronAbajo" width={11} height={11} className={abierto ? "" : "-rotate-90"} />
            </BotonIcono>
          </span>
          <span className={["min-w-0 flex-1 truncate text-left text-[12px]", alguna ? "text-foreground" : "text-foreground/70"].join(" ")}>
            {nodo.nombre}
          </span>
          <span className="shrink-0 pr-1 font-mono text-[10px] tabular-nums text-foreground/40">{contarCapas(nodo)}</span>
        </div>
        {abierto && nodo.hijos.map((h) => pintarNodo(h, cont, nivel + 1))}
      </div>
    );
  };
  // frente arriba: el array de la pantalla va fondo→frente, el árbol se
  // arma sobre la lista invertida para que el panel lea como Figma
  const filasConSubgrupos = (miembros: Capa[], cont: string) =>
    arbolDeCapas([...miembros].reverse()).map((n) => pintarNodo(n, cont, 0));

  return (
    <aside className="flex h-full select-none flex-col border-r border-(--glass-border) bg-(--chrome-bg)">
      <div className="px-3 pt-3 pb-2 text-[11px] font-medium uppercase tracking-[0.02em] text-foreground/50">
        {t.plural(composicion.capas.length, "{n} capa", "{n} capas")}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {elementos.map((el) => {
          if (el.tipo === "capa") return fila(el.capa, SUELTAS, false);
          const grupo = el.placa.id;
          const nombre = el.placa.nombre.replace(/ \(fondo\)$/, "");
          const abierta = abiertos.has(grupo) || seleccionada?.grupo === grupo;
          const activa = seleccionId === grupo;
          return (
            <div key={grupo}>
              <div
                data-fila-id={grupo}
                data-fila-cont={PANTALLAS}
                onPointerDown={(e) => iniciarFila(e, grupo, PANTALLAS, grupo)}
                className={[
                  "group/fila relative mb-0.5 flex h-8 cursor-grab touch-none items-center gap-1 rounded-control pl-1 pr-1 active:cursor-grabbing",
                  activa ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
                ].join(" ")}
              >
                <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", activa ? "bg-acento" : "bg-transparent"].join(" ")} />
                <span onPointerDown={(e) => e.stopPropagation()}>
                  <BotonIcono
                    tam={22}
                    activo={abierta}
                    etiqueta={abierta ? t("Cerrar «{nombre}»", { nombre }) : t("Abrir «{nombre}»", { nombre })}
                    onClick={() => alternarGrupo(grupo)}
                  >
                    <Icono
                      nombre="chevronAbajo"
                      width={12}
                      height={12}
                      className={abierta ? "" : "-rotate-90"}
                    />
                  </BotonIcono>
                </span>
                <span
                  className={[
                    "min-w-0 flex-1 truncate text-left text-[13px] font-medium",
                    activa ? "text-foreground" : "text-foreground/80",
                  ].join(" ")}
                >
                  {nombre}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground/40">
                  {el.miembros.length}
                </span>
                <span
                  className="flex opacity-0 group-hover/fila:opacity-100 coarse:opacity-100"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <BotonIcono
                    tam={26}
                    tono="peligro"
                    etiqueta={t("Borrar la pantalla «{nombre}» completa", { nombre })}
                    onClick={() => onBorrarCapa(grupo)}
                  >
                    <Icono nombre="basura" width={13} height={13} />
                  </BotonIcono>
                </span>
              </div>
              {abierta && filasConSubgrupos(el.miembros, grupo)}
            </div>
          );
        })}
      </div>

      {/* la cámara vive abajo, como otra capa: el render es lo que ella ve */}
      {(() => {
        const activa = seleccionId === CAMARA_ID;
        const kfs = (["x", "y", "zoom"] as const).reduce(
          (n, canal) => n + (composicion.camara?.pistas[canal]?.length ?? 0),
          0,
        );
        return (
          <div className="shrink-0 border-t border-(--glass-border) px-2 py-2">
            <div
              className={[
                "relative flex h-8 items-center gap-2 rounded-control pl-2.5 pr-2",
                activa ? "bg-ink/[0.08]" : "hover:bg-ink/[0.04]",
              ].join(" ")}
            >
              <span className={["absolute inset-y-1 left-0 w-0.5 rounded-full", activa ? "bg-acento" : "bg-transparent"].join(" ")} />
              <span className="grid w-4 shrink-0 place-items-center text-foreground/40" aria-hidden>
                <Icono nombre="camara" width={13} height={13} />
              </span>
              <button
                type="button"
                onClick={() => onSeleccionar(CAMARA_ID)}
                className={[
                  "min-w-0 flex-1 truncate text-left text-[13px]",
                  activa ? "text-foreground" : "text-foreground/75",
                ].join(" ")}
              >
                {t("Cámara")}
              </button>
              {kfs > 0 && (
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-foreground/40">
                  {t.plural(kfs, "{n} kf", "{n} kf")}
                </span>
              )}
            </div>
          </div>
        );
      })()}
    </aside>
  );
}
