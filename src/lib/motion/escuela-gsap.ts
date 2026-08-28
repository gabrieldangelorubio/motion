/* -----------------------------------------------------------------------------
   La ESCUELA GSAP del agente director — su memoria de oficio

   Destilado de la documentación de GSAP v3 (Eases, Staggers, Position
   Parameter, Keyframes, SplitText) traducido al vocabulario de ESTE motor:
   el agente piensa como un motionero formado en GSAP y ejecuta con nuestras
   herramientas. Es texto de prompt puro (sin código de GSAP: el motor es
   propio y determinista) — se edita acá y el agente lo aprende solo.
----------------------------------------------------------------------------- */

export const ESCUELA_GSAP = `# Tu escuela: GSAP (el oficio completo, ejecutado en este motor)

## 1. Easing — «possibly the most important part of motion design»
El easing es LA herramienta de personalidad. Antes de tocar duraciones o distancias, elegí bien la curva.

Las TRES direcciones y cuándo va cada una:
- **salida*** (los .out de GSAP): arrancan rápido y frenan suave — como una pelota que rueda hasta detenerse. LA DIRECCIÓN DEFAULT para ENTRADAS de elementos y para todo lo que responde al espectador: se siente reactivo porque el movimiento ya está a full cuando lo ves.
- **entrada*** (los .in): arrancan lento y aceleran — como un objeto pesado cayendo. Para SALIDAS de elementos (el que se va "cae" fuera de escena, acelerando) y anticipaciones.
- **entradaSalida*** (los .inOut): aceleran y frenan — como un auto que arranca y estaciona. Para TRASLADOS entre dos puntos visibles y para la CÁMARA (paneos, zooms): un movimiento de cámara con salidaExpo se siente golpeado; con entradaSalidaCubic/Quart respira.

La escalera de intensidad (de más sutil a más dramático), igual que power1→power4→expo de GSAP:
sine < quad (power1) < cubic (power2) < quart (power3) < quint (power4) < expo.
- **Sine**: casi lineal, elegante, para micro-movimientos y fades largos.
- **Quad/Cubic**: el pan de cada día, movimiento natural sin llamar la atención.
- **Quart/Quint**: enérgico, editorial, para títulos protagonistas.
- **Expo**: dramático, llega "de un latigazo" y clava suave. El favorito para entradas de hero.
- **Circ**: mecánico/preciso, frena en seco al final del arco — buen sabor para UI técnica y HUDs.
- **Back** (overshoot bezier): se pasa un toque y vuelve — intención y carácter sin caos. entradaSalidaBack para traslados con personalidad.
- **salidaElastico / entradaElastico** (elastic de GSAP, amplitud 1, período 0.3): oscila varias veces alrededor del destino — juguetón, cartoon, logos con chispa. Con MODERACIÓN: un elástico por escena.
- **salidaPique / entradaPique** (bounce de GSAP): pique de pelota contra el piso, rebotes que decaen — físico y simpático. salidaPique para caídas que rebotan al aterrizar; entradaPique casi nunca (anticipación rara).
- **resorteSuave/Tenso/Rebote**: nuestros resortes con física real (EDO amortiguada) — parecidos al elástico pero más orgánicos; premium con rebote.
- **escalones** (steps(10) de GSAP): 10 saltos secos sin interpolar — stop-motion, contadores, glitch retro.
- **suave** es nuestro default de la casa (Material standard); **seco** es un snap agresivo; **lineal** SOLO para rotaciones continuas, contadores y movimiento "mecánico a propósito" — en cualquier otra cosa se ve muerto.

Regla de dirección: entradas con salida* (o elastico/resorte si el tono lo pide), salidas de escena con entrada* y MÁS RÁPIDAS que las entradas (~60-70% de la duración), cámara y traslados con entradaSalida*.

## 2. Staggers — la coreografía de los conjuntos
Nuestro «escalonado» es el stagger.each de GSAP: milisegundos ENTRE unidades (caracteres/palabras/líneas de un texto dividido). Recetas:
- Receta "amount" (repartir un tiempo TOTAL, como stagger.amount): escalonado = total ÷ (n − 1). Ej: 12 letras en 400ms total → escalonado ≈ 36ms. Usala cuando importa CUÁNDO TERMINA el conjunto (sincronizar con un beat del audio).
- Valores que funcionan: 20-50ms por carácter (35 es el sweet spot), 60-120ms por palabra, 120-180ms por línea. Menos de 15ms por carácter se ve como un bloque; más de 60ms se hace lento.
- **ordenEscalonado** = el from de GSAP: "inicio" (start), "fin" (end, para salidas que se deshacen hacia atrás), "centro" (center: irradia desde el medio — logos y títulos centrados AMAN esto), "bordes" (edges: las puntas primero, el centro último), "azar" (random: orgánico, para estrellas, partículas, grillas de elementos sueltos — es determinista, mismo texto mismo orden).
- Un stagger NO es solo para texto: varias capas hermanas (3 estrellas, 5 tarjetas) se escalonan A MANO dando a cada una el mismo preset con «en» corridos por un paso fijo (30-80ms). Desde el centro: la del medio primero. Al azar: desordená los «en» vos.
- El stagger le da vida a lo que sería un bloque: si un conjunto entra "todo junto y muerto", la respuesta casi siempre es división + escalonado, no más duración.

## 3. El position parameter — solapar es dirigir
En GSAP la coreografía vive en el position parameter del timeline ("-=0.3", "<", ">"). Acá el tiempo es ABSOLUTO: cada segmento tiene su «en» (ms). Traducción operativa:
- "<" (arrancar JUNTO con el anterior) → mismo «en» que la capa anterior.
- ">" (arrancar cuando TERMINA el anterior) → en = en_anterior + duracion_anterior.
- "-=X" (solapar) → en = fin_del_anterior − X. LA REGLA DE ORO: elementos relacionados se solapan 30-50% de la duración del anterior — la siguiente capa arranca cuando la anterior hizo ~60% de su viaje. Nada se siente peor que una secuencia "uno-termina-recién-ahí-empieza-el-otro".
- "+=X" (aire) → en = fin_del_anterior + X. Los gaps son BEATS: usalos a propósito (el logo respira 200ms antes del claim), no por descuido.
- Porcentajes de GSAP ("-=25%") → calculá sobre la duración del segmento que estás ubicando.
- Labels → pensá la escena en MOMENTOS con nombre (impacto, revelación, cierre) y colgá varios «en» del mismo número: sincronía = mismo instante, no casualidad.
- La secuencia editorial clásica: fondo → protagonista → secundarios → detalles, cada uno pisando el final del anterior. El clímax (logo, título) puede romper la cadena y entrar SOLO, con aire antes y después.

## 4. Keyframes multi-paso — el sub-timeline dentro de una capa
Lo que GSAP hace con keyframes ({y: [0, 80, -10, 30, 0]}) acá es definir_pista con keyframes crudos: valores ABSOLUTOS con t en ms y el easing DEL TRAMO en el keyframe de SALIDA.
- Wiggle/impacto: 4-6 keyframes de x o rotación alternando signo con amplitud decayendo (±12, ∓8, ±4, 0), tramos de 60-90ms, easing entradaSalidaSine cada uno.
- Sobrepaso manual: [destino+8%, destino] con salidaCubic al final — un back a medida.
- hold congela el valor hasta el próximo keyframe: pasos secos, cambios de estado, glitch (combiná con escalones).
- easeEach de GSAP = poné el MISMO easing en cada tramo; el ease global de GSAP no existe acá: pensá tramo por tramo.
- Los keyframes crudos PISAN la base y conviven con presets (se suman los offsets): para trayectorias largas usá pista; para entrar/salir usá presets.

## 5. SplitText — texto que respira
division: "caracteres" | "palabras" | "lineas" = SplitText types. Los presets revelar/revelarCaer/ocultar/ocultarSubir ya traen LA MÁSCARA automática (el mask/overflow-clip de SplitText): cada unidad se mueve DENTRO de su renglón — no hay que crear máscaras.
- El hero reveal clásico: division lineas + revelar, escalonado 120-160ms, salidaQuart/salidaExpo, 700-900ms.
- El título letra-por-letra: division caracteres + subir o revelar, escalonado 25-40ms desde "inicio" o "centro".
- La salida espejo: mismo split, preset opuesto (ocultar/ocultarSubir), ordenEscalonado "fin" — se deshace hacia atrás, en el 60-70% del tiempo de la entrada.
- Divisiones largas (párrafos): palabras o líneas, nunca caracteres (mareo).

## 6. Recetario de la casa (pedidos frecuentes → ejecución exacta)
- **Hero title premium**: division lineas + revelar (escalonado 140, salidaQuint, 800ms) · claim después con "-=300" en fade sutil (aparecer, salidaSine, 500ms) · fondo ya presente o entrando 200ms antes que todo.
- **Logo con chispa**: escalar desde 0.6 con salidaElastico 900ms, o pop (que ya trae overshoot en la pista) con salidaCubic · si el logo es un subgrupo de letras, escalonado 40ms desde "centro".
- **Caída física**: caer con salidaPique 700-900ms (rebota al aterrizar) · sombra/eco opcional con una forma que escala al impacto.
- **Stagger de estrellas/partículas**: mismas capas, mismo preset (pop o escalar), «en» corridos 50-80ms, orden al azar (a mano entre capas, ordenEscalonado "azar" dentro de un texto).
- **Cámara que descubre** («la cámara va hacia atrás y te descubre la escena»): definir_camara — zoom alto sobre el protagonista al inicio, keyframe a zoom 1 (o menos) con entradaSalidaQuart 1200-1800ms. La cámara SIEMPRE con entradaSalida*, nunca expo seco.
- **Paneo entre pantallas**: definir_camara x/y de centro a centro con entradaSalidaCubic, 900-1400ms según distancia; zoom constante o con leve valle (alejarse 10% en el medio del viaje = sensación de vuelo).
- **Contador/typewriter/glitch**: escalones + hold en pistas crudas; para typewriter: division caracteres + aparecer con escalonado 45-70ms y easing lineal (sin fade: duracion cortísima, 80ms).
- **UI técnica/HUD**: salidaCirc y seco, duraciones cortas (300-450ms), trazos con trazar/borrar, nada de elásticos.
- **Énfasis sin entrada** (algo YA visible que llama la atención): pista de escala [1, 1.06, 1] con entradaSalidaSine 400ms, o rotación ±2° — micro, nunca un preset entero.
- **Cierre de escena**: TODO sale más rápido de lo que entró, con entrada* y orden "fin"; el protagonista sale ÚLTIMO (o queda y la cámara lo abandona).

## 7. Los errores del principiante (evitalos siempre)
- Todo con el mismo easing y la misma duración → plano. Variá: protagonista expo/quint, secundarios cubic, micro sine.
- Todo secuencial o todo junto → solapá 30-50% (regla del punto 3).
- Elástico/pique/resorte en TODAS las capas → circo. Uno por escena, en el protagonista.
- Movimientos largos sin motionBlur ni curva marcada → flotan sin peso. motionBlur 0.5-1 en viajes largos y rápidos.
- Animar la capa para simular cámara → JAMÁS (regla dura de cámara).
- Duraciones eternas: si dudás, 15% más corto. El ojo agradece.`;
