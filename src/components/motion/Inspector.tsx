"use client";

/* -----------------------------------------------------------------------------
   Inspector — las propiedades de la capa seleccionada

   Cada campo dispara UN checkpoint de undo por sesión de foco (CampoNumero
   `onInicio`) y edita por las ops puras vía el Editor. Los segmentos
   entrada/salida editan preset, timing, easing y escalonado; los tiempos se
   muestran en ms (dígitos: no pasan por el idioma, kit §2.6).
----------------------------------------------------------------------------- */

import { MEZCLAS, type Capa, type MezclaCapa, type NombreEasing, type OrdenEscalonado, type Segmento } from "@/lib/motion/modelo";
import { EASINGS } from "@/lib/motion/easings-puro";
import { nombresPresets } from "@/lib/motion/presets-puro";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { Desplegable } from "@/components/ui/Desplegable";

const OPCIONES_EASING = Object.keys(EASINGS).map((n) => ({ valor: n, nombre: n }));
const OPCIONES_ORDEN: { valor: OrdenEscalonado; nombre: string }[] = [
  { valor: "inicio", nombre: "desde el inicio" },
  { valor: "fin", nombre: "desde el fin" },
  { valor: "centro", nombre: "desde el centro" },
  { valor: "bordes", nombre: "desde los bordes" },
];

function SeccionSegmento({
  titulo,
  clase,
  segmento,
  duracionComposicion,
  onEditar,
  onCheckpoint,
}: {
  titulo: string;
  clase: "entrada" | "salida";
  segmento: Segmento;
  duracionComposicion: number;
  onEditar: (cambios: Partial<Segmento>) => void;
  onCheckpoint: () => void;
}) {
  const conCheckpoint = (cambios: Partial<Segmento>) => {
    onCheckpoint();
    onEditar(cambios);
  };
  return (
    <section className="border-t border-(--glass-border) px-3 py-3">
      <Etiqueta className="mb-2">{titulo}</Etiqueta>
      <div className="flex flex-col gap-2.5">
        <Desplegable
          etiqueta={t("Preset")}
          valor={segmento.preset}
          opciones={nombresPresets(clase).map((n) => ({ valor: n, nombre: n }))}
          onCambio={(preset) => conCheckpoint({ preset })}
        />
        <div className="grid grid-cols-2 gap-2">
          <CampoNumero
            etiqueta={t("Empieza")}
            valor={segmento.en}
            min={0}
            max={duracionComposicion}
            paso={50}
            sufijo="ms"
            onInicio={onCheckpoint}
            onCambio={(en) => onEditar({ en })}
          />
          <CampoNumero
            etiqueta={t("Dura")}
            valor={segmento.duracion}
            min={50}
            paso={50}
            sufijo="ms"
            onInicio={onCheckpoint}
            onCambio={(duracion) => onEditar({ duracion })}
          />
        </div>
        <Desplegable
          etiqueta={t("Easing")}
          valor={segmento.easing ?? "suave"}
          opciones={OPCIONES_EASING}
          onCambio={(easing) => conCheckpoint({ easing: easing as NombreEasing })}
        />
        <div className="grid grid-cols-2 gap-2">
          <CampoNumero
            etiqueta={t("Escalonado")}
            valor={segmento.escalonado ?? 0}
            min={0}
            paso={5}
            sufijo="ms"
            onInicio={onCheckpoint}
            onCambio={(escalonado) => onEditar({ escalonado })}
          />
          <Desplegable
            etiqueta={t("Orden")}
            valor={segmento.ordenEscalonado ?? "inicio"}
            opciones={OPCIONES_ORDEN}
            onCambio={(orden) => conCheckpoint({ ordenEscalonado: orden as OrdenEscalonado })}
          />
        </div>
      </div>
    </section>
  );
}

export function Inspector({
  capa,
  duracionComposicion,
  onEditar,
  onCheckpoint,
}: {
  capa: Capa | null;
  duracionComposicion: number;
  onEditar: (capaId: string, cambios: Partial<Capa>) => void;
  onCheckpoint: () => void;
}) {
  if (!capa) {
    return (
      <aside className="flex h-full flex-col border-l border-(--glass-border) bg-(--chrome-bg)">
        <div className="px-4 py-6 text-[13px] text-muted">{t("Seleccioná una capa para editar sus propiedades")}</div>
      </aside>
    );
  }

  const editar = (cambios: Partial<Capa>) => onEditar(capa.id, cambios);
  const editarSegmento = (clave: "entrada" | "salida", cambios: Partial<Segmento>) => {
    const seg = capa[clave];
    if (seg) editar({ [clave]: { ...seg, ...cambios } });
  };

  return (
    <aside className="flex h-full flex-col overflow-y-auto border-l border-(--glass-border) bg-(--chrome-bg)">
      <div className="px-3 pt-3 pb-2">
        <Etiqueta>{t("Capa")}</Etiqueta>
        <div className="mt-0.5 truncate text-[14px] font-medium text-foreground">{capa.nombre}</div>
      </div>

      <section className="border-t border-(--glass-border) px-3 py-3">
        <Etiqueta className="mb-2">{t("Transformación")}</Etiqueta>
        <div className="grid grid-cols-2 gap-2">
          <CampoNumero etiqueta="X" valor={capa.x} paso={10} sufijo="px" onInicio={onCheckpoint} onCambio={(x) => editar({ x })} />
          <CampoNumero etiqueta="Y" valor={capa.y} paso={10} sufijo="px" onInicio={onCheckpoint} onCambio={(y) => editar({ y })} />
          <CampoNumero
            etiqueta={t("Escala")}
            valor={(capa.escala ?? 1) * 100}
            min={1}
            paso={5}
            sufijo="%"
            onInicio={onCheckpoint}
            onCambio={(v) => editar({ escala: v / 100 })}
          />
          <CampoNumero
            etiqueta={t("Rotación")}
            valor={capa.rotacion ?? 0}
            paso={1}
            sufijo="°"
            onInicio={onCheckpoint}
            onCambio={(rotacion) => editar({ rotacion })}
          />
          <CampoNumero
            etiqueta={t("Opacidad")}
            valor={(capa.opacidad ?? 1) * 100}
            min={0}
            max={100}
            paso={5}
            sufijo="%"
            onInicio={onCheckpoint}
            onCambio={(v) => editar({ opacidad: v / 100 })}
          />
          <CampoNumero
            etiqueta={t("Motion blur")}
            valor={capa.motionBlur ?? 0}
            min={0}
            max={2}
            paso={0.1}
            sufijo="×"
            onInicio={onCheckpoint}
            onCambio={(motionBlur) => editar({ motionBlur })}
          />
        </div>
        <div className="mt-2.5">
          <Desplegable
            etiqueta={t("Mezcla")}
            valor={capa.mezcla ?? ""}
            opciones={[{ valor: "", nombre: t("normal") }, ...MEZCLAS.map((m) => ({ valor: m, nombre: m }))]}
            onCambio={(v) => {
              onCheckpoint();
              editar({ mezcla: (v || undefined) as MezclaCapa | undefined });
            }}
          />
        </div>
      </section>

      {capa.tipo === "texto" && (
        <section className="border-t border-(--glass-border) px-3 py-3">
          <Etiqueta className="mb-2">{t("Texto")}</Etiqueta>
          <div className="flex flex-col gap-2.5">
            <label className="block">
              <Etiqueta className="mb-1">{t("Contenido")}</Etiqueta>
              <textarea
                value={capa.texto}
                rows={Math.min(5, capa.texto.split("\n").length)}
                onFocus={onCheckpoint}
                onChange={(e) => editar({ texto: e.target.value })}
                className="w-full resize-y rounded-control bg-transparent px-2 py-1.5 text-base text-foreground shadow-hueco outline-none"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <CampoNumero
                etiqueta={t("Tamaño")}
                valor={capa.fuente.tamano}
                min={4}
                paso={4}
                sufijo="px"
                onInicio={onCheckpoint}
                onCambio={(tamano) => editar({ fuente: { ...capa.fuente, tamano } })}
              />
              <CampoNumero
                etiqueta={t("Peso")}
                valor={capa.fuente.peso}
                min={100}
                max={900}
                paso={100}
                onInicio={onCheckpoint}
                onCambio={(peso) => editar({ fuente: { ...capa.fuente, peso } })}
              />
            </div>
            {capa.texto.includes("\n") && (
              <CampoNumero
                etiqueta={t("Interlineado")}
                valor={capa.fuente.interlineado ?? Math.round(capa.fuente.tamano * 1.15)}
                min={4}
                paso={2}
                sufijo="px"
                onInicio={onCheckpoint}
                onCambio={(interlineado) => editar({ fuente: { ...capa.fuente, interlineado } })}
              />
            )}
            <Desplegable
              etiqueta={t("División")}
              valor={capa.division}
              opciones={[
                { valor: "ninguna", nombre: t("sin dividir") },
                { valor: "caracteres", nombre: t("por caracteres") },
                { valor: "palabras", nombre: t("por palabras") },
                { valor: "lineas", nombre: t("por líneas") },
              ]}
              onCambio={(division) => {
                onCheckpoint();
                editar({ division: division as "ninguna" | "caracteres" | "palabras" | "lineas" });
              }}
            />
          </div>
        </section>
      )}

      {capa.tipo === "trazo" && (
        <section className="border-t border-(--glass-border) px-3 py-3">
          <Etiqueta className="mb-2">{t("Trazo")}</Etiqueta>
          <div className="grid grid-cols-2 gap-2">
            <CampoNumero
              etiqueta={t("Grosor")}
              valor={capa.grosor}
              min={0.5}
              paso={0.5}
              sufijo="px"
              onInicio={onCheckpoint}
              onCambio={(grosor) => editar({ grosor })}
            />
            <div />
            <CampoNumero
              etiqueta={t("Inicio")}
              valor={Math.round((capa.trazoInicio ?? 0) * 100)}
              min={0}
              max={100}
              paso={5}
              sufijo="%"
              onInicio={onCheckpoint}
              onCambio={(v) => editar({ trazoInicio: v / 100 })}
            />
            <CampoNumero
              etiqueta={t("Fin")}
              valor={Math.round((capa.trazoFin ?? 1) * 100)}
              min={0}
              max={100}
              paso={5}
              sufijo="%"
              onInicio={onCheckpoint}
              onCambio={(v) => editar({ trazoFin: v / 100 })}
            />
          </div>
        </section>
      )}

      {capa.entrada && (
        <SeccionSegmento
          titulo={t("Entrada")}
          clase="entrada"
          segmento={capa.entrada}
          duracionComposicion={duracionComposicion}
          onEditar={(c) => editarSegmento("entrada", c)}
          onCheckpoint={onCheckpoint}
        />
      )}
      {capa.salida && (
        <SeccionSegmento
          titulo={t("Salida")}
          clase="salida"
          segmento={capa.salida}
          duracionComposicion={duracionComposicion}
          onEditar={(c) => editarSegmento("salida", c)}
          onCheckpoint={onCheckpoint}
        />
      )}
    </aside>
  );
}
