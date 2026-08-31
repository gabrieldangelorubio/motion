# motion — módulo externo de diosa

Módulo de motion graphics para case studies, desarrollado **fuera del repo**
de diosa según el kit para desarrolladores externos
(`docs/kit-diosa-2026-08-26.md`, sello `main=9a8e79ce`). Mismo stack, misma
estructura de carpetas, mismas convenciones: la integración es un `cp -R`.

## Correr

```bash
npm install
npm run dev        # → http://localhost:3000/motion
npm test           # 310 tests puros (node:test + tsx, sin base)
npx tsc --noEmit && npx eslint src tests
```

## Qué mirar primero

- **`ENTREGA.md`** — qué hace, qué no, qué falta cablear, números medidos.
- **`docs/modulos/motion/README.md`** — el Norte, el modelo de datos y las
  decisiones de diseño del módulo.
- **`docs/modulos/motion/BLUEPRINT.md`** — el plan de producto completo
  (Figma → editor con IA → export video/AE, referencias, automatización) y
  los siete informes de research en `docs/modulos/motion/research/`.
- **`src/lib/motion/`** — el motor puro: `estadoEn(comp, t)` +
  `pintar(estado, ctx)`; ahí está el 70 % del valor.

`_andamiaje/` no viaja (prototipos y soporte del repo aparte).
