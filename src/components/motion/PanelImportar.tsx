"use client";

/* -----------------------------------------------------------------------------
   Importar una pantalla de Figma — pegar el JSON del plugin

   Overlay bloqueante (telón + tarjeta sólida) con un textarea para pegar el
   IR que emite figma-plugin/. La validación es doble: el schema del IR acá
   y los invariantes de la composición al normalizar. Los avisos de
   conversión (qué se rasterizó y por qué) se muestran antes de confirmar —
   nunca degradación en silencio.
----------------------------------------------------------------------------- */

import { useState } from "react";
import type { ResultadoImport } from "@/lib/motion/figma-puro";
import { normalizarFigma, validarImportFigma } from "@/lib/motion/figma-puro";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";

export function PanelImportar({
  abierto,
  onCerrar,
  onImportar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onImportar: (resultado: ResultadoImport) => void;
}) {
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<ResultadoImport | null>(null);

  if (!abierto) return null;

  const analizar = (texto: string) => {
    setJson(texto);
    setError(null);
    setPrevia(null);
    if (!texto.trim()) return;
    try {
      const datos: unknown = JSON.parse(texto);
      if (!validarImportFigma(datos)) {
        setError(t("Esto no parece el JSON del plugin de Figma del módulo"));
        return;
      }
      setPrevia(normalizarFigma(datos));
    } catch {
      setError(t("El texto pegado no es un JSON válido"));
    }
  };

  const confirmar = () => {
    if (!previa) return;
    onImportar(previa);
    setJson("");
    setPrevia(null);
    onCerrar();
  };

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-(--telon-bg) p-6"
      onKeyDown={(e) => e.key === "Escape" && onCerrar()}
      onClick={(e) => e.target === e.currentTarget && onCerrar()}
    >
      <div className="w-full max-w-xl rounded-card border border-(--menu-border) bg-(--menu-solido-bg) p-5 shadow-(--menu-shadow)">
        <div className="mb-3 text-[15px] font-semibold text-foreground">{t("Importar pantalla de Figma")}</div>
        <Etiqueta className="mb-1">{t("JSON del plugin")}</Etiqueta>
        <textarea
          autoFocus
          value={json}
          onChange={(e) => analizar(e.target.value)}
          placeholder={t("Pegá acá el JSON que copiaste del plugin…")}
          spellCheck={false}
          className="h-36 w-full resize-none rounded-control bg-transparent p-2 font-mono text-xs text-foreground shadow-hueco outline-none"
        />
        {error && <div className="mt-2 text-xs text-peligro">{error}</div>}
        {previa && (
          <div className="mt-3">
            <div className="text-[13px] text-foreground">
              {t("«{nombre}» — {ancho}×{alto}, {n} capas", {
                nombre: previa.composicion.nombre,
                ancho: previa.composicion.ancho,
                alto: previa.composicion.alto,
                n: previa.composicion.capas.length,
              })}
            </div>
            {previa.avisos.length > 0 && (
              <ul className="mt-2 max-h-24 overflow-y-auto text-xs text-muted">
                {previa.avisos.map((aviso, i) => (
                  <li key={i}>· {aviso}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="boton inline-flex h-9 items-center rounded-control px-4 text-[13px] shadow-control hover:bg-ink/[0.06]"
          >
            {t("Cancelar")}
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!previa}
            className="boton rounded-control bg-acento px-4 py-2 text-sm font-semibold text-white hover:bg-acento/85 disabled:opacity-40"
          >
            {t("Importar")}
          </button>
        </div>
      </div>
    </div>
  );
}
