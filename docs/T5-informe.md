# T5: prueba completa de la v3 (Empieza aquí, tono, OG, referencia IMSERSO)

Entorno: `vite preview` del build (puerto 5190), Chrome con WebGL por software, 1440x900, 820x1100 y 390x844 táctil. Scripts en `pruebas/t5/`, capturas `docs/capturas/t5-*.png`.

## Resumen
- SUITE: tsc OK · vitest 695/695 · pytest 214/214 · build OK. Línea base verde, sin fallos previos.
- Consola: 0 errores en todos los flujos (solo el 404 de `/api/agente` al usar el agente en `vite preview`, esperado fuera de Vercel).
- Sin scroll horizontal a 390, 820 y 1440.
- Tests nuevos: ninguno (los fallos son de texto y de datos; un test los dejaría en rojo).
- 0 bloqueantes · 3 importantes · 8 menores · 4 cosméticos.

Funciona bien: los 3 ejemplos en escritorio y móvil; recordado en localStorage; «Ocultar»/«Ver ejemplos»; localStorage bloqueado (sigue abierto, sin error); recarga (URL conserva Pinto, plegado); Pinto tras 2030 y 2030 tras Pinto (borra el pin); Mi municipio con foco en el buscador; alias Sanse/Fuenla/Alcala; OG 1200x630 con URL absoluta, favicon y apple-touch-icon (180x180) presentes en `dist/`.

## Importantes

**I-1. Un doble clic en «Una residencia en Pinto» deja el simulador en 2030**
Pasos: primera visita, doble clic (o dos taps) sobre el ejemplo Pinto. Obtenido: tras el primer clic el panel se pliega y el segundo clic cae sobre «2030 (proyección)»: URL `...&sim=...&plazas=94&anio=2030`, panel con 70 plazas y 74 % (en vez de 63 y 68 %). Con el ejemplo 2 («Madrid en 2030») el segundo clic cae sobre un título y no hace nada; con el 3 sobre un párrafo.
Origen: `EmpiezaAqui.tsx:84-87` (`cambiar(true)` pliega antes de que acabe el gesto). Arreglo: ignorar clics durante ~600 ms tras elegir (estado `ocupado`), o plegar con `setTimeout`/transición sin cambiar el layout al instante, o no plegar hasta que el resultado esté en pantalla.

**I-2. Municipios rurales con «el 100 % de los vecinos vive a más de 2 km» de un centro que sí tienen**
Pasos: Mi municipio → «San Martín de Valdeiglesias». Obtenido: «En San Martín de Valdeiglesias hay 1 centro de salud para 9.302 vecinos... El 100 % de los vecinos (9.302) vive a más de 2 km en línea recta de un centro de salud o consultorio», y lo mismo con farmacia («3 farmacias... 100 % a más de 1 km»). En la misma tarjeta pone «Bien dotado» y «Cumple». El agente lo propaga: «¿Qué municipios de la sierra están peor en centros de salud?» lista 5 municipios al 100,0 % (San Martín, Robledo de Chavela, Cadalso, Navalagamella, Bustarviejo).
Causa verificada: las 4 secciones del municipio (17-61 km2) tienen su punto interior a 2,8-3,8 km del centro (que está en el casco). Es el límite ya conocido del punto interior (F4), pero aquí produce una afirmación visible que se contradice a sí misma y es lo primero que un jurado de la sierra vería.
Origen: `fichaVista.ts:161` (frase del % lejos), `plantillas.ts:159`, datos `public/donde/secciones.json` (lat/lon). Propuesta: (a) en municipios con pocas secciones y área grande, no escribir la frase del porcentaje y poner «Cifra aproximada: las secciones de este municipio son muy grandes» (umbral: área media de sección > 5 km2 o <= 6 secciones); (b) o recolocar el punto de esas secciones en el núcleo poblado (IGN) en el pipeline; (c) en el agente, excluir del ranking los municipios afectados.

**I-3. Tono: la tarjeta de la ficha sigue diciendo «No llega» / «Aún no llega» y las preguntas sugeridas dicen «peor» y «le falta»**
Es lo que más contradice el cambio de tono pedido, y se ve en el primer clic de Mi municipio y del agente.
- `PanelMunicipio.tsx:387` sello «No llega» (y `fichaVista.ts:194-195` «Aún no llega.», que se lee en voz alta y sale en la frase: «Parla: un centro de salud por cada 27.602. Aún no llega.»). Además choca con el semáforo de la misma tarjeta: Parla centro de salud = «En la media» + «No llega». Propuesta: sello «Por encima del módulo» / «Dentro del módulo» (o «Margen respecto al módulo»), y frase «Parla: un centro de salud por cada 27.602 vecinos; el módulo orientativo es de 25.000 por zona de salud.»
- «Cumple» en residencias contradice la Metodología («comparaciones, no un mínimo legal»). Propuesta: «Por encima de la referencia» / «Por debajo de la referencia».
- `intencion.ts:24,300`: «¿Qué municipios de la sierra están peor en centros de salud?» → «¿Qué municipios de la sierra tendrían más ayuda de un centro de salud nuevo?» o «¿En qué municipios de la sierra ayudaría más un centro de salud?».
- `intencion.ts:26,300,436`: «¿Qué le falta a Parla?» → «¿Qué servicios tiene Parla?» (la respuesta ya empieza así). Mantener «falta» como sinónimo reconocido, solo cambiar el texto que se muestra.
- Respuesta del agente a «hola» y la sugerencia repiten «peor en farmacias» (`intencion.ts`).

## Menores

**M-1. Porcentajes y redondeos que se pisan (Pinto)**: panel «El 67 % de sus 94 plazas llega a zonas con margen de mejora» (63,4/94) junto a «Tu ubicación logra el 68 % del óptimo» (63,4/93,8). Dos cifras casi iguales con significados distintos y vecinas. Con 2030 las dos son 74 %. Además el titular dice «63» y la barra «63,4»; «94» y «93,8»; «70» y «69,9». Propuesta: titular con un decimal cuando haya barra («63,4 plazas más cubiertas»), y cambiar la frase a «De sus 94 plazas, 63,4 llegan a zonas con margen de mejora (la mayoría)» o quitar el 67 %. Origen: `tuDecides.ts:163`, `TuDecides.tsx` (titular). El agente dice «cubre 93,8 plazas más (el 99 % de sus 94 plazas...)»: el «99 %» tampoco coincide con nada del panel.
**M-2. «Comunidad entera por encima de la referencia pero el 78 % de los mayores en zonas con margen de mejora»**: «55.195 plazas... 4,1 por cada 100» (4,11) junto a «referencia 4,05» y «1.051.231 mayores (78,3 %) viven en zonas por debajo». Un lector pensará que es contradictorio. Propuesta de frase tras la cifra: «En conjunto la Comunidad supera la referencia, pero las plazas no están repartidas por igual.» Origen: `PanelServicio.tsx` bloque cifra.
**M-3. Ficha de residencia: «Cumple» y «habría sitio para unas 3 plazas más»** (Parla: 5,08 por 100, «Bien dotado», «Cumple» y «Para llegar a la media de España... unas 3 plazas más»). Propuesta: no mostrar la línea de plazas cuando la tarjeta supere la referencia, o añadir «(en las zonas de Parla que aún no la alcanzan)». Origen: `fichaVista.ts:180`.
**M-4. Texto «En ningún servicio de los siete sale por debajo...»**: hay 6 servicios (los centros de día salieron). `PanelMunicipio.tsx:264`. Cambiar por «de los seis» o mejor, «En ningún servicio sale por debajo...».
**M-5. «Media de la Comunidad, con la de hoy»** (etiqueta en 2030) es torpe: `panelDonde.ts:131`. Propuesta: «Media de la Comunidad (la de hoy)».
**M-6. Nota 2030 con «déficit»** visible fuera de la Metodología: «...el déficit desaparecería por definición» (`PanelServicio.tsx:306`). Propuesta: «si se recalculara con la población de 2030, la referencia subiría y la comparación perdería sentido».
**M-7. Aire de hoy desactualizado en el momento de la prueba (20:30)**: todas las fichas muestran «Sin actualizar desde hace 6 horas... hasta las 14:00» y «La previsión se calculó hace 5 horas». El aviso funciona, pero con dos avisos amarillos seguidos es lo primero que ve el jurado en Mi municipio. Es el cron de `datos.yml` sin ejecución automática: lanzarlo a mano justo antes de publicar y antes de la demo.
**M-8. Teclado: tras elegir un ejemplo con Enter el foco cae en `body`** (el botón se desmonta al plegar), y el lector de pantalla no anuncia nada. `EmpiezaAqui.tsx:84-90`. Mover el foco a `.empieza__abrir` o al bloque de resultado. Además `aria-controls` del botón «Ver ejemplos de un clic» apunta a un id que no existe mientras está plegado (`EmpiezaAqui.tsx:61`); quitarlo en ese estado.

## Cosméticos
- C-1. Buscador: con «zzzz» no hay mensaje de «sin resultados» (solo la ayuda genérica). `BuscadorLugar.tsx`.
- C-2. Al abrir una ficha por el ejemplo, el título del municipio se queda con un anillo de foco grueso rectangular (captura `t5-c1-esc-sanse.png`).
- C-3. Tras Pinto desde Mi municipio la URL conserva `lugar=mun:...` aunque no se vea (`...?lugar=mun%3A28058&servicio=residencia...`).
- C-4. Favicon solo SVG (sin .ico/PNG 32): algunos rastreadores y Safari antiguo no lo toman. Y el OG enseña «4,1 por cada 100 mayores» fija mientras la referencia de la web es 4,05 (coherente pero conviene entenderlo, ver M-2).

## Vista previa del enlace (`dist/index.html`)
OK: `og:image` y `twitter:image` absolutas (`https://donde-hace-falta.vercel.app/og.jpg`), JPEG 1200x630 (140 kB), título, descripción, `og:locale es_ES`, `twitter:card summary_large_image`, alt, canonical, `apple-touch-icon` 180x180. **Riesgo de publicación:** la URL sale del valor por defecto de `vite.config.ts` (`donde-hace-falta.vercel.app`) porque `.vercel/` no está enlazado y `VITE_URL_PUBLICA` no está en el entorno del build. Si Vercel asigna otro dominio, canonical y OG apuntarán a una URL que no existe y la vista previa saldrá sin imagen. Poner `VITE_URL_PUBLICA` en las variables de Vercel antes del build y comprobar con un enlace pegado en WhatsApp o con el depurador de Facebook/LinkedIn.

## Textos revisados
Recorridos 438 textos únicos (6 servicios x hoy/2030, 3 referencias, 3 órdenes, 5 fichas, Metodología, ¿Cómo funciona?, agente, noscript, meta). Aparte de lo anterior, el resto del lenguaje es coherente («margen de mejora», «plazas por cubrir», «ayudaría más»). «Déficit» solo aparece en M-6 fuera de la Metodología; la Metodología usa «las plazas de residencia que faltan» sin explicarlo (aceptable). La ventanita del mapa no se pudo abrir con un clic en coordenadas fijas; no revisada.

## Veredicto
Publicable tras arreglar I-1 (5 minutos) y I-3 (solo textos); I-2 es el que más puede dañar la credibilidad (ficha de la sierra) y conviene al menos suavizar la frase. El resto puede esperar.

## Arreglos (frontend, tras T5)

- **I-1**: `bloquearClics` (`EmpiezaAqui.tsx`) traga los clics 700 ms tras elegir un ejemplo, así que el segundo clic de un doble clic ya no cae sobre «2030». Comprobado con Playwright (`dblclick` en Pinto: URL sin `anio`) y con un test.
- **I-2**: sin tocar el motor ni el pipeline. `agregar()` calcula el área media de sus secciones (`area_km2`, que ya estaba en `secciones.json`). Si un servicio por distancia tiene un centro dentro del territorio, hay vecinos «lejos» y el área media supera 5 km², la fila de la ficha y del ranking sale con `aproximada: true`. La ficha ya no escribe «el X % vive a más de R»: dice que tiene el centro dentro y que la cifra sería aproximada. El ranking de la web pone «aprox.» y una nota. El ranking y la ficha del agente llevan «(aprox.)» y un aviso. Límite añadido a la Metodología. No cambia ningún número del motor ni de `referencia.json`.
- **I-3**: sello «Cumple»/«No llega» → «Dentro del módulo»/«Por encima del módulo» (centros de salud, hospital…) y «Por encima/Por debajo de la referencia» (residencias); el sello «no» ya no es rojo. «Qué dice la norma» → «Frente a la referencia». Preguntas sugeridas: «¿En qué municipios de la sierra ayudaría más un centro de salud?» y «¿Qué servicios tiene Parla?» (nuevas palabras de ranking: ayudaría, beneficiaría; tests).
- **M-1**: titulares con un decimal (63,4 plazas más cubiertas, igual que la barra). «el 67 % de sus 94 plazas llega…» → «63,4 de sus 94 plazas llegan a zonas con margen de mejora» (en el agente y los resúmenes, igual).
- **M-2**: frase «En conjunto la Comunidad supera la referencia, pero las plazas no están repartidas por igual…» y 2 decimales (4,11).
- **M-3**: «En las zonas de X que aún no llegan a la referencia habría sitio para N plazas más». **M-4**: sin «siete». **M-5**: «Media de la Comunidad (la de hoy)». **M-6**: nota 2030 sin «déficit».
- **M-8**: el foco pasa a «Ver ejemplos de un clic»; `aria-controls` solo cuando el bloque está desplegado. **C-1**: «Sin resultados para…» en el buscador. **C-2**: sin anillo en el título programático de la ficha. **C-3**: `lugar=` fuera de la URL al ir a Pinto o 2030. **C-4**: `favicon-32.png`; `og.jpg` regenerado (ya dice 4,11).
- Extra: la etiqueta del «Modelo» va a la izquierda del pin y la de «Tu centro» a la derecha.
- M-7 queda para el despliegue (lanzar `datos.yml` a mano).

## Arreglos de R3

- Ranking de distancia (`pct`/`personas`): las filas `aproximada` van detrás de las demás; ninguna de las 10 primeras lo es (test para centro de salud, farmacia, colegio y DEA). En la web y en el agente, esas filas no llevan % ni «N de N»: «tiene centro dentro; cifra no fiable (secciones censales muy grandes)».
- Sugerida n.º 2: «¿En qué municipios de la sierra ayudaría más un hospital?».
- `servidor/prompts/agente-v3.ts` (v2 queda de historial; `PROMPT_VERSION = "agente-v3"`): tono de ayuda para decidir y regla de filas aproximadas. El validador (`numerosPermitidos`) ya no permite citar `pct`, `en_deficit`, `objetivo`… de una fila aproximada (test).
- `textoFicha`: no lista residencias con 0 plazas por cubrir.
- `index.html` sin el marcador en el comentario; README: radio «según el servicio, de 300 m a 25 km».
