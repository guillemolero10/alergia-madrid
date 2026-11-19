# T2: informe de pruebas (18-nov-2026, rama `donde-hace-falta`, sin commit)

## Línea base
- `npm test`: 21 archivos, **390 pasan, 5 skipped** (antes 366). Los 24 nuevos y los 5 skipped son de `src/lib/donde/t2-bordes.test.ts` (los skipped documentan T2-5).
- `npm run build`: OK.
- `uv run --project pipeline pytest`: **189 pasan** (igual que antes).
- Fallos de T1 (NaN): **corregidos**. `simular` con NaN/Infinity lanza `RangeError` y `optimo({n: NaN})` devuelve 1 punto.

## Defectos (de más a menos graves)

No hay bloqueantes. El recorrido P0 completo (pasos 1-6 de la «Prueba final», 4 y 5 en modo sin IA) funciona en escritorio y a 390 px, salvo el aire de hoy del paso 6, que es F7 (pendiente, no es un defecto).

### Importantes
**I-1. Referencia IMSERSO de centros de día incoherente con el registro.**
Pasos: `?servicio=centro_dia&radio=5000` y elegir «Media de España (IMSERSO)».
Esperado: cifra comparable. Obtenido: el panel pasa de 12.007 plazas que faltan (referencia 4,98 por cada 100) a 315 (1,06) y 407 (1,22). La referencia de la Comunidad (media del registro) es 4-5 veces la del IMSERSO, así que el selector da resultados que no son comparables. Ya anotado en el CLAUDE.md (posible inflado de plazas); Guillermo tiene que decidir antes de la demo. Origen: `panelDonde.ts` (`opcionesReferencia`, líneas ~99-113) y datos de `servicios/centro_dia.json`. Captura: ninguna (texto en el recorrido).

**I-2. «Ganan acceso» muy sensible al umbral; el modelo da cifras difíciles de defender.**
Pasos: `?servicio=residencia&radio=10000`, botón «¿Y dónde lo pondría el modelo?» sin zona.
Obtenido: «Cobeña, +8.506 mayores» con una residencia de 94 plazas (a 20 km, Navalcarnero +15.880), frente a los 10.689 plazas que «faltan» en toda la Comunidad. Pasa porque muchas secciones están justo por debajo de 4,11 y 0,1 plazas por cada 100 las cruzan. Pinto con 200 plazas: 2.072 y el modelo, en el mismo municipio, 4.290. El jurado puede preguntar por qué 94 plazas «sacan del déficit» a 8.506 personas. Sugerencia: añadir una frase al resultado («cuenta a quien cruza el umbral, aunque siga cerca de él») o mostrar también las plazas por 100 ganadas. Origen: `cobertura.ts` `simular`/`optimo` (rama de plazas). Captura: `t2-modelo-y-tuyo.png`, `t2-pinto-vs-modelo.png`.

### Menores
**M-1. «Reintentar» de los datos base no reintenta el servicio ni el geojson.**
Pasos: bloquear `/donde/*.json` (red caída), abrir la web, quitar el bloqueo, pulsar «Reintentar».
Obtenido: carga lo base, pero queda un segundo error «No se han podido cargar los centros de este servicio» (otro «Reintentar») y la etiqueta del mapa «No se han podido cargar los datos» no desaparece; las secciones no se pintan. Origen: `useDonde.ts` (`reintentarBase`). Capturas: `t2-err-offline-abort-reintento.png`.

**M-2. Si falla `secciones.geojson` no se avisa.**
Pasos: devolver 500 a `/donde/secciones.geojson`.
Obtenido: el panel funciona, el mapa se ve sin colorear y la leyenda sigue enseñando los colores, sin mensaje ni «Reintentar». Origen: `MapaDonde.tsx` (carga del geojson). Captura: `t2-err-geojson-500.png`.

**M-3. Sierra: la pregunta sugerida no filtra el ranking.**
Pasos: agente, «¿Qué municipios de la sierra están peor en centros de salud?».
Obtenido: el texto habla de la sierra, pero la URL queda en `?servicio=centro_salud&radio=2000` (sin zona), así que el ranking de la pantalla es el de toda la Comunidad y el mapa no se encuadra. Es lo documentado en I1 (zonas múltiples sin `zona`), pero la pantalla y el texto no coinciden. Origen: `herramientas.ts` (`mostrar_ranking`) / `accionesAgente.ts`. Captura: `t2-agente-chip-1.png`.

**M-4. Con el agente abierto, a 761-1100 px el mapa queda inservible.**
Pasos: 800×600 o 1024×700 con `?agente=1`.
Obtenido: el panel del agente (396 px) tapa casi todo el mapa de 370-594 px; en 1024 la Comunidad se ve diminuta en el borde izquierdo y MapLibre avisa «Map cannot fit within canvas». Esperado: hoja inferior también en tablet o panel más estrecho. Origen: `App.tsx` (`margen`, `esMovil` solo < 760 px) y `PanelAgente.css`. Capturas: `t2-ancho-800.png`, `t2-ancho-1024.png`.

**M-5. Móvil: el mapa y el agente quedan a ~1.300 px de la primera pantalla.**
Pasos: abrir a 390 px.
Obtenido: la primera pantalla no tiene mapa; el botón «Agente» está sobre el mapa (y=1.321) y `?agente=1` abre el panel fuera de vista. Con el agente abierto, el área de respuesta tiene unas 4 líneas de alto. Funciona, pero la demo en móvil depende de hacer scroll. Origen: `App.css` (orden en `.app` móvil). Capturas: `t2-m-completa.png`, `t2-m-agente-respuesta.png`.

**M-6. Esc no cierra la ventanita del mapa.**
Pasos: pasar el ratón o hacer clic en una sección y pulsar Esc. Obtenido: la ventanita sigue (solo se cierra al salir del mapa). Origen: `MapaDonde.tsx` (~línea 583 solo gestiona el modo «Coloca un centro»). Captura: `t2-ventanita-seccion.png`.

**M-7. «Empezar de nuevo» en el agente pierde el foco.**
Pasos: con teclado, Tab hasta «Empezar de nuevo» y Enter. Obtenido: el foco pasa a `body`. Esperado: al campo de pregunta. Origen: `PanelAgente.tsx` (reinicio).

**M-8. `simular` no termina con coordenadas finitas muy lejanas.**
Pasos (solo biblioteca): `simular(est, {lat: 89.9, lon: 179.9})` tarda ~13 s; con `1e6` o `1e300` no termina. La interfaz y las herramientas lo evitan (`coordenadasValidas`, `dentroDeLaComunidad`), así que hoy no es alcanzable. Origen: `geo.ts` `RejillaEspacial.masCercano` (búsqueda por anillos sin tope). Test: `t2-bordes.test.ts` (5 `skip`).

**M-9. Sin WebGL, «Coloca un centro» y «Colocar en el centro del mapa» siguen activos.**
Pasos: navegador sin WebGL. Obtenido: botones sin efecto visible, aunque el panel avisa de que no hay mapa. Origen: `TuDecides.tsx`. Captura: `t2-err-sin-webgl.png`.

**M-10. El agente sin IA responde a lo que no entiende con una herramienta.**
«cuanto cuesta construir un hospital» devuelve la ubicación óptima de un hospital (Guadalix) sin avisar de que no responde al coste. Origen: `intencion.ts`.

**M-11. Objetivos táctiles de 15-24 px de alto** en los `summary` («¿Cómo funciona?», «4. Dónde falta más», «Leyenda», «Ver la fuente»). Origen: `PanelServicio.css`, `Leyenda`.

### Cosméticos
- **C-1.** «Faltan unas 1 plazas» (singular) en la ventanita; mismo patrón en `plantillas.ts` y la ficha. Origen: `panelDonde.ts:216`.
- **C-2.** Numeración 1, 2, «Tú decides», 3, 4: «Tú decides» se intercala entre pasos numerados.
- **C-3.** `?sim=45,-3` (fuera de rango) se ignora bien, pero la URL no se normaliza (queda tal cual). Inofensivo.
- **C-4.** Un `warning` de MapLibre («cannot fit within canvas») aparece de forma intermitente con el agente abierto (ver M-4).
- **C-5.** Tarea larga de 638 ms en el hilo principal al calcular el óptimo de residencias de toda la Comunidad (con swiftshader; el cálculo va en el worker, probablemente es el repintado). 58 fps al arrastrar.

## Comprobado y funciona
- Los 7 servicios × 3 radios: cifras y URL. Residencias: 10.689 / 10.048 / 11.737 plazas (media, IMSERSO España, IMSERSO Madrid). Ranking: orden, zonas (01, 04, 06), distritos, «distritos solo en Madrid», clic en fila → el mapa vuela (escritorio y móvil). Zonas sin déficit: mensaje «nadie está a más de 15 km…».
- URLs directas y no válidas (servicio, radio, zona, ref, orden, nivel, sim, plazas, vista, lugar, HTML en `lugar`): vuelven a valores por defecto sin errores ni XSS.
- Tú decides: Pinto residencia 94 plazas +1.078 y centro de salud +2.363; plazas 25/94/200 (+259/+1.078/+2.072); modelo con `?zona=04` → Parla +1.581 y «68 % del óptimo»; clic fuera de la Comunidad («Fuera de la Comunidad de Madrid», sigue en modo colocar); Esc cancela; arrastre con ratón, con dedo (CDP) y teclado; Borrar; Quitar el modelo; recálculo al cambiar plazas, radio y referencia; ida y vuelta de servicio limpia `sim`; atrás restaura el estado.
- Agente sin IA: 4 sugeridas, variantes, ruido, `<script>`, 900 caracteres, «hola»; ejecuta mapa, ranking, pines y abre la ficha; distintivo «Modo sin IA» con el aviso; teclado (Enter abre y enfoca, Esc cierra y devuelve el foco), `role=log` con `aria-live`, `?agente=1`, límite de 500 caracteres.
- `/api/agente` simulado con 429, 503 (apagado, presupuesto, sin clave), 504, 500 HTML, sin red, 200 basura → modo sin IA con el aviso correcto y una sola llamada por fallo. 200 válido → «IA» y contador. Acciones raras o inválidas se rechazan con «No he podido aplicar…»; texto con HTML no se interpreta.
- Mi municipio: Fuenla, Alcala, Sanse, San Sebastián, Centro, Madrid, ambiguos («a», «san»), vacío, sin resultados y `<b>`; fichas de Parla, Getafe, Madrid, Acebeda, distritos Centro y Barajas con 7 semáforos; «Ver en el simulador» (servicio, radio y nivel; atrás vuelve a la ficha); lugar recordado al recargar; id no válido → «No conozco ese lugar».
- Errores de carga: 404/500/JSON malformado/sin red en territorios, secciones y servicios (mensaje y Reintentar); lenta (esqueleto y «Calculando…»); sin WebGL (aviso de respaldo); sin teselas → raster; `?base=raster`.
- Consola: sin errores salvo los 404 esperados de `/api/agente` con vite. Sin desbordes horizontales en 320, 390, 760, 761, 800, 1024, 1366 y 1920 px. Foco visible (outline 2 px) y orden de Tab lógico.
- Rendimiento (Chrome swiftshader): cambio de servicio 100-170 ms; radio 20-100 ms; óptimo hospital/DEA/farmacia 50-100 ms; residencias de toda la Comunidad 1,3-1,6 s (worker); ~58 fps al arrastrar.
- Motor: 29 tests nuevos de bordes y herramientas hostiles (plazas Infinity/negativas, n raros, zonas inexistentes, entradas nulas): terminan y no dan NaN.

## Pendiente conocido (no son defectos)
F7 (aire de hoy en Mi municipio: `data-hueco="aire-hoy"` vacío), D7 (Madrid en 2030), I2 (API real del agente).

## Archivos `t2-*` que sobran
- Capturas de la T2 anterior, ya reemplazadas: `t2-agente-chip-0.png`, `t2-colocar-clic.png`, `t2-fuera-comunidad.png`, `t2-modelo-parla.png`, `t2-modelo-y-tuyo.png` (esta se conserva por I-2), `t2-movil-*.png`, `t2-pinto-residencia.png`, `t2-ranking-fila.png`, `t2-zona-01/04/06.png` si no se quieren como evidencia.
- Capturas redundantes de estados de error: `t2-err-*-reintento.png` (salvo `offline-abort`) y `t2-api-*.png` / `t2-api2-*.png` (salvo `429`).
- Scripts: `pruebas/t2/e2.mjs`, `explora.mjs`, `r14.mjs`, `r15.mjs`, `r19.mjs` (exploratorios). Se pueden conservar `lib.mjs` y `r1-r13`, `r16-r18`, `r20-r22` como pruebas reproducibles.
- Se conserva el test `src/lib/donde/t2-bordes.test.ts`.
