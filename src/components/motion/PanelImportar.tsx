"use client";

/* -----------------------------------------------------------------------------
   Importar una pantalla de Figma — pegar el JSON del plugin

   Overlay bloqueante (telón + tarjeta sólida) con un textarea para pegar el
   IR que emite figma-plugin/. La validación es doble: el schema del IR acá
   y los invariantes de la composición al normalizar. Los avisos de
   conversión (qué se rasterizó y por qué) se muestran antes de confirmar —
   nunca degradación en silencio.
----------------------------------------------------------------------------- */

import { useEffect, useRef, useState } from "react";
import type { ImportFigma, ResultadoImport } from "@/lib/motion/figma-puro";
import { describirPeso, type EntradaBandeja } from "@/lib/motion/bandeja-puro";
import { normalizarFigma, offsetsDeLote, pantallasDeImport, avisoDePluginViejo } from "@/lib/motion/figma-puro";
import { t } from "@/lib/i18n/stub";
import { Etiqueta } from "@/components/ui/Etiqueta";

/** Una pantalla normalizada + dónde va respecto de la primera del lote. */
export type PantallaImportada = { resultado: ResultadoImport; dx: number; dy: number };

export function PanelImportar({
  abierto,
  onCerrar,
  onImportar,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onImportar: (pantallas: PantallaImportada[]) => void;
}) {
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previa, setPrevia] = useState<PantallaImportada[] | null>(null);
  // BANDEJA DE ENTRADA: lo que dejaron por /api/motion/bandeja (el agente
  // que corrió use_figma, un script): se lista al abrir y se refresca cada
  // 5 s mientras el panel está abierto; traer una entrada la pasa por el
  // MISMO analizar() que el pegado
  const [bandeja, setBandeja] = useState<EntradaBandeja[]>([]);
  const [trayendo, setTrayendo] = useState<string | null>(null);
  // lo ya traído en este panel: el poll no lo revive aunque el servidor
  // todavía lo liste (respuesta vieja en vuelo, DELETE que no llegó)
  const consumidas = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    const leer = async () => {
      try {
        const r = await fetch("/api/motion/bandeja", { cache: "no-store" });
        const d = (await r.json()) as { ok?: boolean; entradas?: EntradaBandeja[] };
        if (vivo && d.ok && Array.isArray(d.entradas)) setBandeja(d.entradas.filter((e) => !consumidas.current.has(e.id)));
      } catch {
        /* sin servidor: la bandeja queda vacía */
      }
    };
    void leer();
    const reloj = setInterval(() => void leer(), 5000);
    return () => {
      vivo = false;
      clearInterval(reloj);
    };
  }, [abierto]);

  if (!abierto) return null;

  const traerDeBandeja = async (entrada: EntradaBandeja) => {
    setTrayendo(entrada.id);
    try {
      // GET ?id es un PEEK: la entrada sigue en el servidor hasta que acá se
      // analizó bien; si algo falla en el medio, no se pierde
      const r = await fetch(`/api/motion/bandeja?id=${encodeURIComponent(entrada.id)}`, { cache: "no-store" });
      if (!r.ok) {
        setError(t("Esa entrada ya no está en la bandeja"));
        consumidas.current.add(entrada.id);
        setBandeja((lista) => lista.filter((e) => e.id !== entrada.id));
        return;
      }
      const texto = await r.text();
      if (!analizar(texto)) return; // el error ya está en pantalla; la entrada queda para reintentar
      consumidas.current.add(entrada.id);
      setBandeja((lista) => lista.filter((e) => e.id !== entrada.id));
      void fetch(`/api/motion/bandeja?id=${encodeURIComponent(entrada.id)}`, { method: "DELETE" }).catch(() => {});
    } catch {
      setError(t("No se pudo traer la entrada de la bandeja"));
    } finally {
      setTrayendo(null);
    }
  };

  /** Devuelve true si el texto dio una previa importable. */
  const analizar = (texto: string): boolean => {
    setJson(texto);
    setError(null);
    setPrevia(null);
    if (!texto.trim()) return false;
    try {
      const datos: unknown = JSON.parse(texto);
      const pantallas: ImportFigma[] | null = pantallasDeImport(datos);
      if (!pantallas) {
        setError(t("Esto no parece el JSON del plugin de Figma del módulo"));
        return false;
      }
      const offsets = offsetsDeLote(pantallas);
      const nueva = pantallas.map((p, i) => ({ resultado: normalizarFigma(p), ...offsets[i] }));
      // el sello del plugin: un JSON exportado con code.js viejo lo dice ACÁ
      // (la causa clásica de «el fix del plugin no anda»)
      const viejo = avisoDePluginViejo(datos);
      if (viejo && nueva.length > 0) nueva[0].resultado.avisos.unshift(viejo);
      setPrevia(nueva);
      return true;
    } catch {
      setError(t("El texto pegado no es un JSON válido"));
      return false;
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
        {bandeja.length > 0 && (
          <div className="mb-3" data-testid="bandeja-entrada">
            <Etiqueta className="mb-1">{t("Bandeja de entrada")}</Etiqueta>
            <ul className="max-h-28 overflow-y-auto rounded-control shadow-hueco">
              {bandeja.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-xs text-foreground">
                  <span className="truncate">
                    «{e.nombre}» · {describirPeso(e.caracteres)}
                    {e.origen ? ` · ${e.origen}` : ""}
                  </span>
                  <button
                    type="button"
                    disabled={trayendo !== null}
                    onClick={() => void traerDeBandeja(e)}
                    className="boton shrink-0 rounded-control px-2 py-1 text-[12px] shadow-control hover:bg-ink/[0.06] disabled:opacity-40"
                  >
                    {trayendo === e.id ? t("Trayendo…") : t("Traer")}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
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
              {previa.length === 1
                ? t("«{nombre}» — {ancho}×{alto}, {n} capas", {
                    nombre: previa[0].resultado.composicion.nombre,
                    ancho: previa[0].resultado.composicion.ancho,
                    alto: previa[0].resultado.composicion.alto,
                    n: previa[0].resultado.composicion.capas.length,
                  })
                : t("{p} pantallas ({nombres}) — {n} capas; conservan su disposición de Figma", {
                    p: previa.length,
                    nombres: previa.map((x) => `«${x.resultado.composicion.nombre}»`).join(", "),
                    n: previa.reduce((s, x) => s + x.resultado.composicion.capas.length, 0),
                  })}
            </div>
            {previa.some((p) => p.resultado.avisos.length > 0) && (
              <ul className="mt-2 max-h-24 overflow-y-auto text-xs text-muted">
                {previa.flatMap((p, j) =>
                  p.resultado.avisos.map((aviso, i) => <li key={`${j}-${i}`}>· {aviso}</li>),
                )}
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
