# T3: prueba tras los arreglos de R1 (18-nov, noche)

Rama `donde-hace-falta`, sin commit. Navegador: Chrome con WebGL por software (Playwright), 1366x850 y 390x844 (también 320 para Metodología). Capturas `docs/capturas/t3-*.png` (ignoradas por git). Scripts en `pruebas/t3/` (ignorada).

## 1. Suites

| Comando | Resultado |
|---|---|
| `npx vitest run` | 463 pasan (antes de añadir mis tests); 467 con `t3-cifras.test.ts` (4 nuevos) |
| `npx tsc --noEmit` | limpio |
| `npm run build` | OK |
| `cd pipeline && uv run pytest -q` | 214 pasan |

Tests nuevos: `src/lib/donde/t3-cifras.test.ts` (7.113.886 hab., 65+ 1.342.648, 4.518 secciones; DEA 10.551 registros que suman 13.680 equipos y máximo 2.200; faltan 10.689 plazas hoy y 16.280 en 2030; Retiro 179 puntos / 666 hab. por punto, Chamartín 405 / 365). El de privacidad (municipio y distrito antes y después de generalizar) necesita coordenadas exactas que no deben ir al repo, así que lo dejé fuera de `src/` (rompía `tsc` por no haber `@types/node`): `pruebas/t3/t3-privacidad.test.ts.txt`.

## 2. Datos

- `otros_sociales.json`: sin campo `nombres`; ninguna de las 2.633 denominaciones del CSV aparece en el JSON. 1.875 centros, 1.067 generalizados. Comparado con el CSV (`salida/cache/sociales.csv`, 2.375 con coordenadas): **0 sensibles conservan su coordenada exacta**, los 808 no sensibles la conservan. Sin correos, teléfonos ni NIF en ningún JSON de `public/donde/`.
- Municipio y distrito: con el motor TS (`municipioEn`, `distritoEn`) los 1.875 centros dan el mismo municipio y el mismo distrito con la coordenada exacta y con la publicada (0 diferencias), y el municipio coincide con el `mun` del pipeline. Por tanto los recuentos por municipio/distrito de `otrosSocialesDe` no cambian.
- `dea.json`: 10.551 registros, suma de `equipos` = 13.680, 6 puntos agrupados (2.200 / 573 / 192 / 73 / 65 / 32). El de 2.200 cae de verdad en Retiro (polígono del distrito). Ficha: Retiro 179 puntos, uno por 666 vecinos (la Comunidad 674, «En la media»); Chamartín 405, uno por 365 («Por encima»). Razonable.
- Reproducibilidad: regenerado el pipeline en una carpeta temporal, **los 11 ficheros de `public/donde/` salen byte a byte iguales** a los publicados. Las cifras clave se mantienen: 7.113.886, 1.342.648, 10.689 plazas con la media (10.048 con IMSERSO España, 11.737 con IMSERSO Madrid), 16.280 en 2030.
- Limitación: `public/donde/` no está en git, así que no hay versión «anterior» con la que comparar fichero a fichero; la comprobación de que el resto no cambió se apoya en la reproducibilidad, los hashes anotados en `DATOS-DONDE.md` y `t3-cifras`.

## 3. Navegador

- Metodología y fuentes (1366, 390, 320): abre y cierra con clic, Intro y Espacio; el foco pasa al primer enlace con Tab y es visible; sin desborde horizontal ni enlaces fuera de pantalla; consola limpia; convive abierta con «¿Cómo funciona?». 24 enlaces, todos `target=_blank` con `noreferrer`. HEAD/GET: **los 24 responden 200** (incluidos los de INE, IMSERSO, BOCM, IGN y GitHub; ninguno bloqueó al robot). Los 9 conjuntos del portal y la plantilla de `Metodologia.tsx` también 200.
- Simulador: los 6 servicios y sus radios, referencias `media / imserso_espana / imserso_madrid` (10.689 / 10.048 / 11.737 plazas; leyenda 4,11 / 4,05 / 4,21), «Hoy / 2030» en escritorio y móvil (16.280; rótulo de proyección; referencia fija), sin desbordes, consola limpia.
- Tú decides: Pinto 40,2420 / -3,7000 → «64 plazas menos de las que faltan» (con IMSERSO España 63, con Madrid 65); botón del modelo → Leganés 93,8 y «logra el 68 %»; con `zona=04` igual; clic en el mapa y «Colocar en el centro del mapa» funcionan.
- Agente (modo sin IA, `npm run dev` no tiene `/api`): las 4 sugeridas responden bien (Parla: «88 puntos con desfibrilador»). Con `?ref=imserso_espana` el texto dice «referencia: media de España del IMSERSO» y 4,05; con `imserso_madrid`, «media de Madrid del IMSERSO» y 4,21. En 2030 antepone el aviso de proyección.
- Mi municipio (Retiro, Chamartín, Getafe, Parla; escritorio y móvil): DEA, «Otros servicios sociales», aire (con fecha de la última medición, avisos de antigüedad, aviso de capital y la frase «Generated using Copernicus Atmosphere Monitoring Service information 2026» + enlace a Open-Meteo). Sin desborde ni errores. Los avisos de «sin actualizar desde hace 7 horas» son correctos (el cron no se ejecuta solo).
- La única línea de consola con el agente es el 404 de `/api/agente` en desarrollo (esperado: sin `/api`, cae al modo sin IA).

## 4. Textos

Buscado en `src/`: no queda ningún recuento de DEA como «desfibriladores» sin matiz en la web (todo es «puntos con desfibrilador»; la ficha de Parla dice «88 puntos»). Cifras fijas de `Metodologia.tsx` verificadas contra los datos: 18 residencias sin coordenadas (4,66 % de las plazas), 230 hogares y clubes con el 76,4 % de las plazas, 13.680 / 3.135 / 6 / 2.200 / 10.551. Hallazgos en la sección siguiente (F-1, F-2, F-5).

## 5. Git

`git status --porcelain | grep -E "capturas|pruebas"`: solo las 6 `docs/capturas/donde-hace-falta-*.png` (más las 14 ya seguidas, `git ls-files docs/capturas` = 14). `t3-*.png` y `pruebas/t3/` quedan ignorados.

## Hallazgos

Bloqueantes: ninguno.

### Importantes

**F-1. Metodología dice que todos los distritos de la capital usan la estación de Pozuelo; es falso.**
- Pasos: abrir «Metodología y fuentes», leer «Aire de hoy»; abrir `?vista=municipio&lugar=dis%3A2807903` (Retiro).
- Esperado: texto igual al comportamiento. Obtenido: Retiro usa Leganés (10 km), Chamartín Alcobendas (9,3 km); el cálculo (`fuenteAireDe`) elige la estación más cercana al centro del distrito y reparte entre 7 estaciones (Leganés 5, Coslada 5, Pozuelo 4, Alcobendas 2, Getafe 2, Rivas 2, Las Rozas 1). La ficha sí lo dice bien («Usamos la estación de Leganés, a 10 km»).
- Origen: `src/componentes/Metodologia.tsx` (viñeta «Aire de hoy»). El `CLAUDE.md` de la carpeta arrastra la misma frase.

**F-2. Dos cifras distintas de «error típico» de la proyección 2030.**
- Pasos: `?servicio=dea&anio=2030` (o cualquier servicio) y leer el rótulo del panel; comparar con «Qué límites tiene» en Metodología.
- Obtenido: el panel dice «error típico … por municipio: 3,3 % en mayores de 65 y 5,5 % en mayores de 75» (mediana del error por municipio) y Metodología dice «el error típico por municipio fue del 1,3 % … y del 1,8 %» (WAPE ponderado por población). Misma etiqueta, dos números.
- Origen: `PanelServicio.tsx:139` (`errorTipicoPct` usa `mediana`) frente a `Metodologia.tsx` (viñeta «2030 es una proyección»). Conviene usar una sola métrica y nombrarla («mediana» o «ponderado por población»).

### Menores

**F-3. El agente en 2030 pierde el año tras abrir una ficha.**
- Pasos: `?agente=1&servicio=residencia&anio=2030`; preguntar «¿Qué le falta a Parla?»; después «¿Dónde pondrías una residencia en el sur?».
- Obtenido: la primera respuesta dice 150.631 habitantes (proyección 2030) y salta a Mi municipio, cuya ficha muestra 138.012 (INE 2025) sin selector de año (la ficha ignora `anio`). La segunda respuesta ya sale con cifras de hoy sin aviso y la URL pierde `anio=2030` (el selector queda en «Hoy»). Con `ref=imserso_madrid` pasa igual (11.737 en vez del dato 2030).
- Esperado: o la ficha respeta 2030, o el agente avisa de que la ficha es de hoy y no cambia el año por su cuenta. Origen probable: `accionesAgente.ts` (`abrir_ficha`) y el estado de URL de la vista municipio.

**F-4. La ubicación exacta de un centro sensible puede inferirse por otro centro no sensible en la misma dirección, y los `ids` son números de registro.**
- Comprobado con el CSV: 114 centros sensibles comparten coordenada exacta con otro centro del registro que sí se publica con su punto exacto (13 son «Infancia», «Infancia y Adolescencia» o «Refugiados y asilados»). Además `ids` de `otros_sociales.json` son los `numero_registro` (p. ej. `C0169`), que permiten buscar el centro en el CKAN abierto con su dirección. No es una fuga de dato nuevo (el registro ya es público) pero le quita fuerza a la generalización.
- Si se quiere reforzar: sustituir los `ids` de los sensibles por un índice y/o generalizar también a los no sensibles que comparten punto con uno sensible. Decisión de Guillermo; no se tocó.
- Origen: `pipeline/donde/servicios.py` (`preparar`, `a_json`).

**F-5. Textos de la ficha y el agente mezclan «frente a la media / municipios de su tamaño» con una referencia distinta.**
- Pasos: `?agente=1&servicio=residencia&ref=imserso_espana` y preguntar «¿Qué le falta a Retiro?» (o a Getafe).
- Obtenido: «Lo que más le falta frente a la media de la Comunidad es: residencias de mayores (… menos de 4,05 plazas … referencia: media de España del IMSERSO)». La frase `comparaCon` está fija y el paréntesis dice otra cosa. En la ficha (`?vista=municipio&…&ref=imserso_espana`) la tarjeta resumen dice «la Comunidad tiene 4,1. Faltarían unas 270 plazas» (las 270 son contra 4,05) y «Cómo se lee» sigue diciendo que la referencia es la mediana o la media de la Comunidad. El detalle de la tarjeta sí nombra la referencia correcta.
- Origen: `plantillas.ts:154` (`comparaCon`), `PanelMunicipio.tsx:317`, tarjeta resumen en `fichaVista.ts`.

**F-6. Las capturas que irán al repo están desactualizadas.**
- `docs/capturas/donde-hace-falta-municipio.png` enseña «En Parla hay 88 desfibriladores» (ahora «88 puntos con desfibrilador») y `donde-hace-falta-agente.png` muestra una atribución del mapa sin la línea del IGN (ya la lleva). Rehacerlas antes de publicar el README (las otras 4 no las revisé una a una).

**F-7. La atribución del mapa queda tapada en parte.**
- Escritorio 1366x850, `?servicio=residencia`: la leyenda tapa el borde de la primera línea («OpenFreeMap © OpenMapTiles Data from OpenStreetMap»). En «Mi municipio» el rótulo «Puntos: centro de salud… Contorno: …» del minimapa cubre el inicio de la atribución, incluida la parte del IGN («ign.es») en parte de los casos. En móvil la atribución va plegada tras el botón ⓘ (correcto).
- Origen: `MapaDonde.css` / posición de `.leyenda-donde` y del rótulo del minimapa.

**F-8. «¿Dónde faltan más plazas de residencia?» se contesta con una ubicación óptima, no con un ranking.**
- Pasos: agente sin IA, esa pregunta. Obtenido: «El mejor sitio para una residencia … en la Comunidad de Madrid es Madrid (sección 2807913028)». Esperado: ranking de municipios. «¿Y en 2030?» tampoco se entiende (honesto). Origen: `intencion.ts`.

### Cosméticos

- `fuente_nombre` sin tildes en los JSON y en la web («atencion social», «ambito sanitario») y fecha «actualizado el 2026-11-18» en formato ISO (`servicios.py`, `FUENTES`).
- Con `ref=media` el enlace «Ver la fuente» de la referencia apunta al CKAN de residencias, el mismo que el de abajo («Comunidad de Madrid, registro…»): enlace repetido.
- «Otros servicios sociales» enseña por distrito o municipio recuentos con plazas de sectores delicados (Retiro: «Mujer · 2 centros · 5 plazas», Getafe: «Refugiados y asilados · 1 centro · 168 plazas»). Es dato del registro público y va agregado; solo aviso por si se quiere ocultar celdas con menos de 3 centros.
- En desarrollo (`npm run dev`) sale 1 error 404 en consola por `/api/agente`, esperado.

## Veredicto

Los arreglos de R1 funcionan: privacidad de los centros sensibles (0 coordenadas exactas, sin nombres, mismo municipio y distrito en los 1.875), DEA agrupados (13.680 equipos, ratios razonables), referencias coherentes en el agente y el simulador, Metodología completa con todos los enlaces vivos, sin errores de consola ni desbordes en 1366, 390 y 320. Suites verdes. Quedan 2 importantes de texto (F-1, F-2) que conviene corregir antes de publicar porque son afirmaciones falsas o contradictorias a la vista del jurado, y 6 menores.
