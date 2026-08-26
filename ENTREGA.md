# ENTREGA — módulo motion (estado al 2026-08-26)

> Contrato: `docs/kit-diosa-2026-08-26.md` (copia del kit recibido, sello `main=9a8e79ce`).

## Qué hace (hoy)

Motor puro de motion graphics (`lib/motion`): composición JSON versionada →
`estadoEn(comp, t)` → `pintar(estado, ctx)` determinista sobre canvas 2D.
Presets de entrada/salida con escalonado por caracteres/palabras, easings con
nombre (incl. resortes), pistas crudas de keyframes con hold, motion blur
sintetizado desde la velocidad del easing, merge por elemento con lápidas
para guardado concurrente, y operaciones puras listas para tools de Diosa.
Encima, el editor: page `/motion` con lienzo (cámara pan/zoom al cursor con
las constantes de la casa), línea de tiempo **redimensionable** (agarradera
superior) con scrub, transport, y **edición por drag** de spans de
entrada/salida y keyframes (snap al frame, un checkpoint de undo por gesto),
**inspector de propiedades** (transformación, texto, presets con easing y
escalonado — cada campo con checkpoint por sesión de foco), **selección y
drag de capas EN el lienzo** (hit-test con rotación y escala, umbral 4px,
Shift = eje dominante, ⌘ = sin snapping, capas bloqueadas seleccionables
pero no movibles) con **snapping azul** (algoritmo canónico de 3 imanes por
eje, un ganador por eje, el frame como imán, guías a 1px constante), panel
de capas, undo por snapshots, autosave con CAS.

## Qué NO hace (con motivo)

- **Render a video**: decidido con ustedes antes de construirlo (kit §10.3).
  El camino elegido en el diseño es WebCodecs + `mp4-muxer` (ya en deps de
  diosa); el motor ya es frame-determinista así que entra sin re-arquitectura.
- **Texto multilínea y fuentes cargadas**: hoy una capa de texto es una línea
  con el stack del sistema; `FontFace` + licencias es un P1 declarado.
- **Audio**: no hay pista de audio en esta versión.
- **Selección múltiple en el lienzo** (shift-click, marquee, Alt-duplica):
  la selección y el drag simples ya están; lo múltiple es P1.
- **Permisos reales**: `exigirEdicion(actor, composicionId)` es el único
  punto de entrada de mutación, listo para cablear (§2.3).

## Dependencias nuevas

**Ninguna.** El módulo usa el stack del kit tal cual (Next 16.2.9, React
19.2.4, TS estricto, Tailwind v4, tsx). Cero librerías de animación, canvas
o UI.

## Variables de entorno

**Ninguna.**

## Migración (SQL aditivo) + fragmento de schema

⚠️ No aplicada a ninguna base. Los nombres de las tablas referenciadas
(`user`, proyecto) se ajustan a los reales al integrar.

```sql
CREATE TABLE IF NOT EXISTS "motion_composicion" (
  "id"           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "ownerId"      text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "proyectoId"   text REFERENCES "proyecto"("id") ON DELETE SET NULL,
  "nombre"       text NOT NULL,
  "contenido"    jsonb NOT NULL,          -- la composición serializada; rev ADENTRO (contenido->>'rev')
  "thumbnailUrl" text,
  "renderId"     text,                    -- id en el catálogo de media del último render
  "createdAt"    timestamp NOT NULL DEFAULT now(),
  "updatedAt"    timestamp NOT NULL DEFAULT now(),
  "createdBy"    text REFERENCES "user"("id") ON DELETE SET NULL,
  "updatedBy"    text REFERENCES "user"("id") ON DELETE SET NULL
);
```

```ts
export const motionComposicion = pgTable("motion_composicion", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ownerId: text("ownerId").notNull().references(() => user.id, { onDelete: "cascade" }),
  proyectoId: text("proyectoId").references(() => proyecto.id, { onDelete: "set null" }),
  nombre: text("nombre").notNull(),
  contenido: jsonb("contenido").notNull(),
  thumbnailUrl: text("thumbnailUrl"),
  renderId: text("renderId"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow().$onUpdate(() => new Date()),
  createdBy: text("createdBy").references(() => user.id, { onDelete: "set null" }),
  updatedBy: text("updatedBy").references(() => user.id, { onDelete: "set null" }),
});
```

El `UPDATE` del guardado es condicional por rev, como los otros dos lienzos:
`WHERE id = :id AND coalesce((contenido->>'rev')::int, 0) = :baseRev`; ante
0 filas, fusionar con `fusionarComposiciones` (pura) y reintentar una vez.

## Tests y sabotajes

- `npm test` → `node --import tsx --test tests/motion/*.test.ts` — **60
  tests, 0 fallos**, sin base ni secretos. Fixture completo en
  `tests/motion/fixtures/composicion-ejemplo.json`.
- **Sabotajes vistos en rojo** (§2.5): (1) `interpolar` ignorando el easing
  del tramo → falló exactamente «el easing del tramo lo declara el keyframe
  de SALIDA»; (2) gate del motion blur apagado en `evaluar-puro` → falló
  exactamente «el motion blur sintetizado es >0 durante el movimiento…» (que
  además lleva su control positivo); (3) regla de un-solo-ganador del
  snapping invertida → falló exactamente «UN solo ganador por eje — gana la
  distancia mínima». Restaurados, 60/60 verdes.

## Qué necesita cablearse de su lado

1. `exigirEdicion` + `actorDeSesion` → permisos/sesión reales (§2.3).
2. `consultas.ts`: reemplazar el Map en memoria por `motion_composicion`
   (las firmas y el protocolo CAS+merge quedan).
3. La page: gate `puedeVerModulo("motion")` + carga desde la base (hoy abre
   la demo).
4. Registro del módulo en `src/modules.ts` e ítem de navegación.
5. `t()`: swap del stub por el real + zona `motion.ts` del diccionario.
6. Íconos: fusionar los conceptos usados (todos ya existen en el registro);
   `src/components/icons.tsx` local es andamiaje y se borra.
7. Dobles de `ui/` (`BotonIcono`, `ConPista`) → piezas reales, mismo uso.
8. Capas media: resolver `mediaId` contra el catálogo (el motor recibe un
   `imagenDe(mediaId)` inyectado; hoy pinta placeholder).

## Qué probé a ojo

- Chrome (Chromium 140, Linux) en **claro y oscuro**: chrome de UI cambia
  con los tokens, el lienzo repinta el fondo al cambiar la clase de `<html>`
  (MutationObserver §3.5). El contenido de la composición no cambia con el
  tema (es contenido).
- **Teléfono** (390×844 emulado): la vista no desborda horizontalmente; el
  lienzo se ve y panea; el editor completo es de escritorio (precedente
  AdiosJam: en teléfono, visor) — captura en la entrega.
- Scrub frame a frame, espacio para play/pausa, ⌘0 / ⇧1, flechas, undo con
  ⌘Z (visibilidad, drags de spans y keyframes verificados con capturas
  antes/después: dos gestos, dos pasos de undo).
- Timeline redimensionable con la agarradera; drag de span de entrada y de
  un keyframe con snap al frame, verificados en Chromium.
- No probado: Safari/Firefox, iOS real, `prefers-reduced-motion` a ojo (la
  UI usa las clases del kit que ya lo respetan; el preview reproduce igual
  por regla §4.1).

## Números medidos

- **Preview** (demo: 3 capas, texto dividido en 6+5 unidades, blur activo),
  build de producción, Chromium headless **sin GPU** (swiftshader):
  p50 **16,7 ms** (60 fps), p95 100 ms, jank 18,9 %. El p95 alto es el
  `ctx.filter: blur(…)` por unidad en CPU: en headless sin GPU el blur no
  compositea. Backlog P1: cachear el pintado desenfocado por capa. Falta
  medir con GPU real (el kit reporta la misma divergencia en sus curvas).
- **Peso de la page `/motion`**: build estático limpio; First Load JS de la
  ruta según `next build`: ~121 kB compartidos + el chunk propio (ver
  `next build`). Nada del motor entra al shell compartido (imports sólo
  desde la page/componentes del módulo).

## Checklist §2.10

- [x] `npx tsc --noEmit` → 0 errores (strict)
- [x] `npx eslint src tests` → 0 errores
- [x] tests en verde con dos sabotajes vistos en rojo
- [x] sin controles nativos fuera de `ui/` · sin SVG inline en
      `components/motion` · sin hex en el JSX del módulo (los colores del
      canvas leen tokens; los de capas son contenido)
- [x] todo texto de UI en castellano y envuelto en `t()`
- [x] sin `localStorage` de estado (sólo la clase de tema, patrón de la casa)
- [x] ningún `"use client"` importa valores de `consultas.ts`
      (la frontera es el server action)
- [x] sin `title=` nativo · sin `z-index` ≥ 9000
- [x] probado en claro y oscuro, escritorio y teléfono emulado
- [x] README del módulo arranca con «## Norte (goles)»
