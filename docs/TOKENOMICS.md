# Tokenomics — política de modelos y agentes

Objetivo: máxima calidad de dirección con mínimo gasto de tokens del modelo
principal. El modelo caro piensa; los baratos leen, buscan y convierten.

## Reparto de roles

| Tarea | Quién | Por qué |
|---|---|---|
| Arquitectura, decisiones de diseño, síntesis final | Fable (principal) | Criterio y contexto completo del proyecto |
| Deep research web (fuentes, empresas, técnicas) | Agentes Sonnet en background | Juicio medio, mucho volumen de lectura |
| Scraping/listado de presets, chequeos de licencia, inventarios | Agentes Haiku | Mecánico, alto volumen, cero criterio de diseño |
| Conversión mecánica de keyframes externos al contrato propio | Haiku con spec estricta | Transformación determinística con reglas claras |
| Review adversarial de un cambio grande | Sonnet | Barato y suficiente para encontrar bugs obvios |
| Smoke tests / capturas | Scripts (Playwright), no LLM | Cero tokens |

## Reglas operativas

1. **Los agentes corren en background y en paralelo**; el principal nunca
   espera bloqueado ni relee sus transcripts crudos — solo el resumen final.
2. **Todo dump largo (repos, docs, HTML) lo digiere un agente** y devuelve
   síntesis estructurada. El principal no abre páginas web salvo necesidad
   puntual.
3. **Prompts de agente = contrato de salida explícito** (formato, campos,
   ranking). Un agente sin formato de salida definido gasta el doble.
4. **Verificación por script antes que por modelo**: si un test o captura de
   pantalla puede responder "¿funciona?", no se pregunta a un LLM.
5. Presupuesto orientativo por sesión de trabajo: research ≈ 3 agentes
   (~60–90k tokens c/u en modelos baratos), principal reservado para diseño,
   código crítico y síntesis.

## Registro de esta sesión (referencia)

- 3 agentes de research en paralelo (1 Haiku, 2 Sonnet) — fuentes de
  templates, análisis de empresas, técnicas CSS avanzadas.
- Fable: arquitectura del engine, código del runtime, docs y síntesis.
