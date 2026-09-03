# Comparativa — logbook.so dirigida por Fable y por Kimi K3 (2026-09-03)

Mismo import (plugin v20, 89 capas), mismo brief de Gabriel: «video
profesional de SaaS, muy premium, con muchas animaciones secundarias; la
cámara sigue la historia paso a paso; todo suave y con ease». Gabriel:
«me gusta MUCHO más lo que hiciste vos… lo de Kimi era muy estático, una
cosa detrás de otra; el tuyo navega ese mundo, entiende mejor el motion».

## Los números

| | Fable (guion externo) | Kimi K3 (modo guion, pensamiento alto) |
|---|---|---|
| Tiempo | ~8 min de escritura + 3 correcciones de encuadre | 17:01 (1013 s la primera llamada) |
| Costo | — | 0,46 USD, 79k tokens, 14k de razonamiento |
| Pasos | 105, 0 errores | 99 ops en 2 rondas; 1 ronda perdida por «definar_camara» |
| Auditoría final | sin hallazgos | 3 ENCUADRE CORTA (chips del plan, kanban de la caída) |
| Duración | 28 s | 32 s |

## Qué hizo distinto Fable (y ahora está en el conocimiento común)

1. **Cámara viva.** Kimi: zoom 1.333 fijo en todos los holds, salvo 1.2 en
   la pila y 1.15 en las nubes; hold = dos keyframes iguales. Fable:
   push-in de +3 a +6 % en cada hold con entradaSalidaSine, tilt en el hero
   hacia el garabato, viajes de 1 s con entradaSalidaCubic, flotar 0.35.
   Es la diferencia que Gabriel describe como «estático» vs «navega».
2. **Zoom por contenido, no por página.** Kimi encuadró «la página a lo
   ancho» (1.333 → 810 px visibles) y por eso cortó los chips «Good for
   me!»/«Solid plan» (y 1862–2001) y el kanban de la caída. Fable midió la
   caja del contenido (título → elemento más bajo, 840 px) y bajó a
   1.20–1.24 en esas escenas. Regla: zoom = min(ancho_render/ancho_pantalla,
   alto_render/(alto_contenido × 1.05)).
3. **Solapes.** Kimi arranca cada escena cuando la cámara ya llegó
   («heading cuando la cámara llega, viaje 5000→6000, heading 6100») y
   encadena con 100–150 ms. Fable arranca el título 200–400 ms antes de
   que el viaje termine y solapa 150–400 ms.
4. **Duraciones y easings por rol.** Kimi: entradas de 400–550 ms casi
   todas (pop, aparecer, subir), la tarjeta del Gantt con `aparecer` de
   500 ms (un fade). Fable: protagonistas 900–1100 ms salidaExpo/Quint
   (subirDesenfocado distancia 60), secundarios 500–700 cubic, micro sine.
5. **Entradas con dirección.** Kimi: las cuatro notificaciones hacen pop
   en su lugar. Fable: entran alternando de lado (distancia 140) con
   asentamiento de escala 0.96 → 1; las tarjetas laterales llegan desde su
   lado con rotación que se corrige.
6. **Nada sin entrada.** Kimi no animó las dos tarjetas laterales del plan
   (div.framer-1gjac07 / ef4xmd): quedaron clavadas mientras todo se
   armaba.
7. **Títulos.** Kimi: revelar por líneas (120–130 ms). Fable: palabra por
   palabra con subirDesenfocado (60–80 ms), y línea a línea solo en el
   veredicto final, más grave.

## Lo que Kimi hizo bien (y se conserva)

Leyó los elementos con criterio (logo → wordmark por caracteres → Beta;
avatar protagonista al final), puso secundarias (rotación del título,
respiración de la píldora y de la pila, barras caídas con giro), usó
`cargar` + `trazar` para barra y borde, y un solo elástico (`golpe`) en la
pila. El razonamiento por paso es sólido; el problema es la cámara y el
tempo.

## Qué se cambió en el sistema

- `GUION_REFERENCIA`: segunda referencia (logbook) con las siete
  decisiones de arriba y sus números.
- `MODO_GUION`: zoom por caja de contenido, push-in en todo hold, solapes
  con la llegada de la cámara, recorrer el estado capa por capa.
- `ejecutarHerramienta`: un typo de una o dos letras en el nombre de la
  herramienta se corrige solo y el resultado lo dice (la ronda que perdió
  Kimi).
- Costo: Kimi en «alto» tarda 17 min; para guiones, «medio».
