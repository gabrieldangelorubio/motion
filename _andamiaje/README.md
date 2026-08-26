# _andamiaje — NO viaja en la integración

Lo que está acá es soporte del repo aparte y prototipos previos; no se copia
a diosa (kit §2.1).

- `studio-v0/` + `escenas-v0/`: el prototipo F0 (motor WAAPI sobre DOM, 22
  presets, escenas JSON). Superseded por el motor puro de `src/lib/motion`
  siguiendo la §10 del kit; queda como referencia para portar presets
  (backlog P2) y por las decisiones documentadas en
  `docs/modulos/motion/research/`.

Andamiaje que vive DENTRO de `src/` (marcado con «ANDAMIAJE» en su
docblock, se reemplaza por la pieza real al integrar):

- `src/lib/i18n/stub.ts` (traductor stub, misma interfaz que el real)
- `src/components/icons.tsx` (doble local del registro de íconos)
- `src/components/ui/BotonIcono.tsx` · `ConPista.tsx` (dobles de piezas)
- `src/lib/motion/demo.ts` (composición demo hasta el cable a la base)
- `src/app/layout.tsx` (shell mínimo) · el almacén en memoria de
  `src/lib/motion/consultas.ts`
