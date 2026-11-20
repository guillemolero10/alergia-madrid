# T6: página «Qué es» (`?vista=acerca`)

Fecha: 20-nov-2026. Chrome + swiftshader con Playwright (`pruebas/t6/*.mjs`), vite dev en :5173, 1440 px y 375 px. Capturas `docs/capturas/t6-*.png`.

## Suite
- `npx vitest run`: 714 pasan / 0 fallan (35 ficheros). `npx tsc -b --noEmit`: OK. `npm run build`: OK.
- Consola sin errores ni avisos propios en ninguna de las pruebas.

## Bloqueantes
Ninguno.

## Importantes
Ninguno.

## Menores

**M-1. Esc (y Atrás) no devuelven el foco al botón «Qué es» cuando la página se abrió desde la app.**
Pasos: 1. Abrir `/?servicio=farmacia&anio=2030`. 2. Pulsar «Qué es». 3. Pulsar Esc. 
Esperado: foco en el botón «Qué es». Obtenido: `document.activeElement` = `BODY` (6 de 6 intentos desde «¿Dónde?» y 4 de 4 desde «Mi municipio»). Con «Volver a la app» (arriba o al final) sí va al botón (12/12). Con Atrás del navegador tampoco hay foco gestionado (queda en BODY); eso es más discutible.
Causa probable: `cerrarAcerca` llama a `history.back()` y enfoca en un `requestAnimationFrame`, pero `popstate` llega después; mientras tanto `.app` sigue `inert` y `focus()` no tiene efecto. `src/App.tsx` (`cerrarAcerca`, ~línea 100). Idea: enfocar cuando `acercaAbierta` pase a false (useEffect) en vez de en el rAF.
Impacto: un usuario de teclado que cierra con Esc pierde su posición y tiene que tabular desde el principio.

**M-2. «Probar los ejemplos» con «Empieza aquí» plegado no lo despliega.**
Pasos: 1. Con `localStorage["donde:empieza-aqui"]="cerrado"` abrir `/?servicio=farmacia`. 2. «Qué es» → «Probar los ejemplos». 
Esperado (según el encargo: «Empieza aquí» a la vista): ver los 3 ejemplos. Obtenido: se vuelve a la pestaña y el foco va a «Ver ejemplos de un clic» (el botón de la tira plegada, 27 px de alto, visible arriba del todo); hay que pulsarlo otra vez. Con el bloque abierto funciona bien (foco en «Ocultar», visible). Capturas `t6-probar-plegado-esc.png` y `-mov.png`. Si la intención es solo «llevar al bloque», es correcto; si es «enseñar los ejemplos», debería desplegarse.

**M-3. Historial tras «Probar los ejemplos» desde «Mi municipio»: Atrás reabre «Qué es».**
Pasos: 1. `/?vista=municipio&lugar=mun:28106`. 2. «Qué es» → «Probar los ejemplos» (URL `?lugar=mun%3A28106`, pestaña «¿Dónde hace falta?»). 3. Atrás. 
Obtenido: vuelve a abrirse «Qué es» (`?vista=acerca&lugar=…`); otro Atrás lleva a «Mi municipio». Es coherente (se hizo pushState al cambiar de pestaña), no deja la historia rota, pero conviene saberlo. Igual con enlace directo: tras «Volver», Atrás reabre «Qué es» (comportamiento previsto por el diseño).

## Cosméticos
- **C-1.** En el índice (375 px y 1440 px) la segunda fila empieza con un punto «·» huérfano y «Qué es» queda con sangría distinta (`t6-mov-arriba.png`, `t6-esc-arriba.png`).
- **C-2.** En «Cifras de un vistazo» la tarjeta «179 municipios y 21 distritos de Madrid, en 11 zonas» mezcla cifras en tamaño grande dentro de una frase y queda desigual frente a las demás (`t6-esc-arriba.png`).
- **C-3.** Playwright (`getByRole`) cuenta 2 `h1` y el navegador real también tiene 2 en el DOM, pero el de la app está dentro de `.app[inert]` (comprobado: `inert=true`, su h1 y su `main` dentro de `[inert]`), así que para lector de pantalla solo hay 1 h1 y 1 main. Sin acción.

## Comprobado y correcto
1. **Apertura** (botón «Qué es», 1440 y 375 px): página visible, foco en el h1; `.app` `inert=true`; en 40 Tab el foco nunca cae en la app (solo sale al navegador). Sin scroll horizontal (scrollWidth = ancho de ventana, ningún elemento sobrepasa el borde, incluidas la tabla, tarjetas y URLs). Contraste: «Probar los ejemplos» blanco sobre #1d4f7c (alto), «Volver» #1f2328 sobre #fffdf8.
2. **Cierre**: «Volver» arriba, «Volver» al final y Esc vuelven a la pestaña previa conservando todo (`?servicio=farmacia&radio=1000&anio=2030&sim=…`; desde «Mi municipio» `?vista=municipio&lugar=mun:28106`). Ciclos Atrás/Adelante x3 sin romper nada; `inert` se quita al volver; la longitud del historial no crece al abrir/cerrar 6 veces. Foco al botón: OK salvo M-1.
3. **Enlace directo** `/?vista=acerca&servicio=residencia`: abre la página; «Volver» deja `?servicio=residencia&radio=10000` (sin `vista`) y foco en «Qué es»; Esc igual; «Probar» conserva `anio=2030`.
4. **Probar los ejemplos** (bloque abierto): lleva a «¿Dónde?», «Empieza aquí» visible y foco en su botón «Ocultar»; también desde «Mi municipio». Plegado: ver M-2.
5. **Índice**: las 7 entradas desplazan a su sección, `location.hash` vacío, URL y historial sin cambios, el h2 recibe el foco y la barra sticky (61 px) no lo tapa (en 1440 y 375). 
6. **Cifras** frente a `public/donde/`: 421 centros de salud, 25 hospitales, 500 residencias, 2.954 farmacias, 1.620 colegios, 10.551 DEA = nº de `ids` de cada JSON. 4.518 secciones, 7.113.886 hab., 1.342.648 de 65+ coinciden con el resumen del proyecto. Error de 2030: 1,3 % / 1,8 % ponderado y 3,3 % / 5,5 % típico = `validacion.municipio.{65_mas,75_mas}.modelo.{wape,mediana}` de `secciones_2030.json`. Fechas «Copiado el»: 18-nov (centros de salud, DEA, base), 18-nov con «actualizado en la fuente» 15-nov (residencias y otros sociales), 16-nov (farmacias), 5-may (colegios) = `generado`/`actualizado_fuente` de cada JSON. Ningún «Cargando…» queda.
7. **Coherencia**: referencia por defecto IMSERSO España 4,05 (= `UMBRAL_DEFICIT_POR_DEFECTO`); radios de la tabla = `SERVICIOS[*].radios`; «más de 700» (714) y «más de 200» (214 pytest). En el texto de la página no aparecen «déficit», «faltan», «peor» ni «carencia». Los 14 enlaces antiguos de la Metodología siguen presentes tras pasar a `fuentes.ts` (ahora 25, incluidos los 9 conjuntos del portal); los 9 conjuntos, INE, nota de prensa del INE, DATOS-DONDE.md, el repo y la demo responden 200.
8. **Accesibilidad**: `role="dialog"`, `aria-modal`, `aria-labelledby` al h1, secciones con `aria-labelledby`, `nav` con `aria-label`, tabla con `caption` y `scope`, íconos `aria-hidden`.
9. Suite, tipos y build en verde (arriba).

## Veredicto
Apto para commit: 0 bloqueantes, 0 importantes. Recomendable arreglar M-1 (Esc y foco) antes del 26; M-2/M-3 según criterio.
