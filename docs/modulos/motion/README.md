## Norte (goles)

- **Para qué:** que el 100 % del motion de un case study de AdiosAdios
  (títulos y texto animado, media enmarcada, cámara, texturas) se produzca en
  diosa — dirigido por Diosa, afinado a mano, y exportado como video o hacia
  After Effects para el pulido final.
- **En el sistema:** una herramienta más dentro de un proyecto — lee y
  escribe el catálogo de media, sus composiciones cuelgan del proyecto, y el
  asistente la opera por tools sobre el motor puro.
- **Cómo se ve logrado:** un case real sale entero del módulo sin After
  Effects para el 80 % de los planos; el 20 % restante sale por el export a
  AE con capas y keyframes editables; el preview reproduce a 60 fps con 20
  capas medidas.

## Dónde vive el código

```
src/lib/motion/          el motor (TS puro, sin React/DOM/DB — el 70 % del valor)
  modelo.ts              tipos: Composicion, Capa, Keyframe, Segmento, Actor
  easings-puro.ts        curvas con nombre (bezier + resortes en forma cerrada) y velocidad
  keyframes-puro.ts      interpolar(keyframes, t), holds, escalonados
  presets-puro.ts        presets entrada/salida → pistas relativas (presets encima, tracks debajo)
  evaluar-puro.ts        estadoEn(comp, t): el árbol resuelto de un instante
  pintar.ts              pintar(estado, ctx) determinista (preview y render usan la misma)
  serializar-puro.ts     JSON versionado + migrar()
  validar-puro.ts        invariantes como datos
  fusionar-puro.ts       merge por elemento con lápidas (guardado concurrente §2.4)
  camara-puro.ts         la matemática de cámara de los lienzos de diosa (se reemplaza al integrar)
  herramientas-puro.ts   ops puras (crear/agregar/editar/mover/describir) — futuras tools de Diosa
  consultas.ts           capa de datos (gate único exigirEdicion + CAS; almacén andamiaje)
  demo.ts                composición demo (andamiaje hasta el cable a la base)
src/components/motion/   Editor, Lienzo, LineaDeTiempo, Capas (client)
src/app/(app)/(modulos)/motion/   page + acciones
tests/motion/            49 tests puros + fixture completo
```

## El modelo de datos

Una composición es JSON versionado (`version: 1`, `migrar()` desde el día
uno): lienzo (ancho/alto/fps/duración/fondo) + capas ordenadas (el orden es
el z-order). Cada capa: tipo (`texto` | `forma` | `media`), base estática
(x/y/escala/rotación/opacidad), `entrada`/`salida` (presets con escalonado),
`pistas` crudas de keyframes que pisan la base, `motionBlur` (intensidad) y
`v` (timestamp para el merge). Media referencia por id de catálogo, nunca
URL. Se guarda entera en `contenido` (jsonb) con `rev` adentro (CAS).

## Decisiones de diseño, con su porqué

1. **Frame = función pura de (composición, t).** `estadoEn` + `pintar` no
   acumulan estado ni miran el reloj: scrub exacto, replay idéntico, y el
   render a video es «seek + pintar + encode» sin re-arquitectura. Es el
   patrón §10.1 del kit y la condición para que las tools de Diosa sean
   verificables.
2. **Presets encima, tracks debajo.** El usuario (y el asistente) hablan en
   presets («subir con resorte, escalonado del centro»); un preset compila a
   pistas relativas y siempre se puede bajar al keyframe crudo. Contrato de
   identidad: toda entrada termina en offset cero, toda salida parte de ahí
   — cualquier combinación es válida.
3. **El motion blur no se keyframea: se sintetiza.** Deriva de la velocidad
   real del easing (derivada numérica × distancia del preset); el usuario
   controla una intensidad 0–2. Los presets que animan desenfoque propio lo
   declaran y el motor no superpone. En canvas 2D el blur es isotrópico
   (aproximación); el blur direccional fino queda para el render con
   supersampling temporal (backlog).
4. **El easing vive en el tramo y hay holds** — la semántica que comparten
   After Effects y Lottie, para que el export a AE mapee sin sorpresas.
5. **Espacio = play/pausa** (convención de editor de video), no mano: en un
   editor de motion el gesto más frecuente es reproducir. La mano queda en
   el drag del lienzo (hoy cualquier drag panea; cambia cuando llegue la
   selección de elementos).
6. **Merge por elemento con lápidas** copiado de los dos lienzos: gana el
   `v` más alto por capa, los borrados son lápidas explícitas, el orden lo
   decide el snapshot con la edición más reciente.
7. **Reloj propio con rAF y tiempo en un ref**: un frame de reproducción no
   re-renderiza React (§9); la UI se entera a ~8 Hz. Pestaña oculta = pausa.

## Límites conocidos

- Texto de una sola línea, con el stack del sistema (sin `FontFace` todavía).
- El blur por unidad en CPU (headless sin GPU) empuja el p95 — medido y
  anotado en `ENTREGA.md`; plan en el backlog.
- Sin edición de keyframes en la UI (el motor ya lo soporta por ops).
- La cámara del lienzo no está easeada (objetivo = visible); al integrar se
  hereda el loop eased de `lib/canvas`.

El estado (hecho/pendiente) vive en `ENTREGA.md` y `backlog.md`, no acá.
El diseño de producto de largo plazo (Figma → editor → AE, referencias,
automatización) está en `BLUEPRINT.md` y los `research/*.md` de esta carpeta.
