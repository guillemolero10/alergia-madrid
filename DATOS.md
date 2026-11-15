# Datos, umbrales y convenciones de AlergIA Madrid

Todo lo de este documento se verificó el 15-nov-2026 contra las fuentes originales. Los ficheros estáticos se regeneran con:

```
uv run --project pipeline python -m estatico.construir_lugares     # datos-estaticos/lugares.json + rejilla_viento.json
uv run --project pipeline python -m estatico.construir_umbrales    # datos-estaticos/umbrales.json
uv run --project pipeline pytest
```
Las descargas (unos 50 MB en total) van a `salida/cache/` (ignorada por git).

## Fuentes y licencias

Todos los conjuntos del portal de datos abiertos de la Comunidad de Madrid usados aquí llevan licencia **Creative Commons Attribution 4.0 (CC BY 4.0)**, según el campo `license_id` de la API CKAN (`cc-by`). Hay que citar la fuente: «Comunidad de Madrid, datos.comunidad.madrid».

| Conjunto | Uso | Enlace |
|---|---|---|
| Red de Calidad del Aire. Estaciones (`calidad_aire_estaciones`) | Estaciones, coordenadas y magnitudes que mide cada una | https://datos.comunidad.madrid/catalogo/dataset/calidad_aire_estaciones |
| Captadores de polen (`captadores_polen`) | Captadores, coordenadas y localidad | https://datos.comunidad.madrid/catalogo/dataset/captadores_polen |
| Mediciones de polen (`mediciones_polen`) | Qué captadores tienen datos en el año en curso | https://datos.comunidad.madrid/catalogo/dataset/mediciones_polen |
| Mediciones de polen, histórico (`mediciones_polen_historico`) | Percentiles 2010-2019 | https://datos.comunidad.madrid/catalogo/dataset/mediciones_polen_historico |
| Calidad del aire, datos del día (`calidad_aire_datos_dia`) y datos horarios desde 2005 (`calidad_aire_datos_historico`) | Estructura y convención horaria (fichero de descripción en el propio conjunto) | https://datos.comunidad.madrid/catalogo/dataset/calidad_aire_datos_dia · https://datos.comunidad.madrid/catalogo/dataset/calidad_aire_datos_historico |
| Open-Meteo (API de previsión), CC BY 4.0 | Viento actual en una rejilla de 42 puntos | https://open-meteo.com |
| Orden TEC/351/2019 y Resolución de 2-sep-2020 (cortes del aire) | Umbrales de NO2, O3, PM10 y PM2,5 | https://www.boe.es/eli/es/o/2019/03/18/tec351 · https://www.boe.es/diario_boe/txt.php?id=BOE-A-2020-10426 |

## Umbrales de aire (BOE)

Fuente: Índice Nacional de Calidad del Aire. La Orden TEC/351/2019 (BOE-A-2019-4494, 28-mar-2019) fue **modificada** por la Resolución de 2-sep-2020 de la Dirección General de Calidad y Evaluación Ambiental (BOE-A-2020-10426, 10-sep-2020), que sustituye todo el anexo. La orden sigue vigente (no derogada; la API del BOE solo lista esa modificación). Texto consultado en el BOE el 15-nov-2026. Valores en µg/m³.

| Variable | Valor comparado (BOE 2020) | Buena | Razonablemente buena | Regular | Desfavorable | Muy desfavorable | Extremadamente desfavorable |
|---|---|---|---|---|---|---|---|
| NO2 | media de la última hora | 0-40 | 41-90 | 91-120 | 121-230 | 231-340 | 341-1000 |
| O3 | **media móvil de 8 horas** | 0-50 | 51-100 | 101-130 | 131-240 | 241-380 | 381-800 |
| PM10 | media móvil de 24 h | 0-20 | 21-40 | 41-50 | 51-100 | 101-150 | 151-1200 |
| PM2,5 | media móvil de 24 h | 0-10 | 11-20 | 21-25 | 26-50 | 51-75 | 76-800 |

Agrupación para AlergIA (la del plan): **bajo** = buena + razonablemente buena; **medio** = regular; **alto** = desfavorable o peor. Cortes resultantes: NO2 90/120, O3 100/130, PM10 40/50, PM2,5 20/25. El BOE también incluye SO2 (no se usa) y dice que el índice final es el peor de los contaminantes.

Notas:
- El BOE da las bandas en enteros. AlergIA compara el valor (las medias, redondeadas a 1 decimal) con `valor <= corte`, así que 90,4 µg/m³ de NO2 ya cuenta como «medio»: criterio prudente para población sensible.
- **Diferencia con el plan:** las cifras del plan (de memoria) coinciden con el BOE, pero el O3 se compara con la **media móvil de 8 h**, no con el valor horario (en la Orden de 2019 sí era horario; la de 2020 lo cambió). `umbrales.json` lo recoge en `promedio`.
- El BOE 2020 permite completar con datos del modelo CAMS cuando falta una hora; AlergIA no lo hace (marca `sin_dato`).
- Valores por encima del máximo de la última banda se consideran erróneos según el BOE.
- El índice es de corto plazo y no sirve para comprobar el cumplimiento de la normativa (lo dice el propio anexo).

## Umbrales de polen (propios)

No existen umbrales oficiales en cifras para la Comunidad de Madrid. Se calculan **P75 y P90 por tipo polínico** sobre los días con valor > 0 de **2010-2019**, juntando todos los captadores (CSV anuales de `mediciones_polen_historico`; interpolación lineal; vacío = sin dato, se ignora). Nivel diario: bajo < P75 ≤ medio < P90 ≤ alto. Son 27 tipos; los cinco que usa el mapa:

| Tipo | P75 | P90 | Días con valor > 0 |
|---|---|---|---|
| Gramíneas | 11 | 41 | 25.926 |
| Olivo | 16 | 76 | 11.341 |
| Abedul | 2 | 5 | 2.953 |
| Aliso | 4 | 8 | 4.946 |
| Artemisia | 2 | 3 | 4.695 |

Comprobación: el 19-may-2026 (pico del año) la media de gramíneas entre captadores fue 204,8 granos/m³, muy por encima del P90 (41): nivel **alto**.

Limitaciones:
- Es una aproximación propia: relativa a la distribución histórica de Madrid, no a síntomas clínicos. Un día «alto» es de los 10 % más cargados del histórico del tipo, no un umbral médico.
- Se mezclan todos los captadores y toda la temporada; en tipos raros (abedul, corylus, artemisia) los cortes son valores enteros muy pequeños (2, 5...), así que el nivel es sensible a 1-2 granos.
- Los días con valor 0 se excluyen: el percentil describe «cuánto es mucho cuando hay polen».
- Aplicar estos cortes al polen previsto por CAMS (Open-Meteo) es otra aproximación (modelo frente a captador).
- Hasta junio el polen es diario; el resto del año es semanal con retraso de 2 a 6 días.
- Si se calculan sobre 2026 (otro criterio) salen P75 = 12 y P90 = 65 para gramíneas: es de donde venía la referencia del plan, que no corresponde al periodo 2010-2019.

## Convención horaria de los CSV de aire

Fuente: documento «Estructura de los archivos de Open Data» (PDF de descripción de `calidad_aire_datos_dia`, el mismo para el histórico): https://datos.comunidad.madrid/dataset/3dacd589-ecca-485c-81b9-a61606b7199f/resource/8336936d-6ef7-419e-ad6e-e5e86216bb92/download/descripcion-fichero-datos-de-contaminantes-v2.pdf

- El documento dice solo «h01 hace referencia a la 1 de la mañana, h02 a las 2 de la mañana…, hasta las 24 horas». **No indica la zona horaria ni si la hora marca el inicio o el final.**
- **Conclusión (deducida de los datos, no escrita en la documentación): `hNN` es la hora UTC y marca el final de la hora medida.** `h01` del día D es la medida entre D 00:00 y D 01:00 UTC; el día (`ano/mes/dia`) también es el día UTC. En Madrid, +1 h en invierno y +2 h en verano.
- Pruebas:
  1. Cambio de hora (2025, 8 estaciones de tráfico, días laborables): el pico de NO2 de la mañana, que sigue al reloj local, pasa de `h08` a `h07` justo al pasar a horario de verano (30-mar-2025), y de `h07` a `h08` en octubre (26-oct-2025). Con hora local seguiría en la misma columna. Test: `pipeline/tests/test_horas.py`.
  2. Final de hora y zona: el 15-nov-2026 el fichero del día tenía datos hasta `h11` con `last_modified` = 11:20 UTC (CKAN guarda UTC), y tras la actualización siguiente llegó hasta `h12` con `last_modified` = 12:20 UTC (13:20 en Madrid). Es decir, cada hora se publica unos 20 min después de que termine esa hora UTC: la columna es la hora UTC y marca el final. Con hora local (CET = UTC+1) `h12` ya habría estado publicada a las 12:20 de Madrid.
  3. El máximo de ozono cae entre `h14` y `h15` (13-15 UTC), 1-2 h después del mediodía solar de Madrid (~12:15 UTC).
- Limitación: las pruebas 2 y 3 son indicios (la 2 es una observación de un solo día); la conclusión descansa sobre todo en la 1 y en la 2. Conviene preguntar a la organización (madrid.datamad@urjc.es) si hay que citarlo como confirmado.
- Implementación: `alergia/horas.py` (`fin_de_hora_iso`) pasa `hNN` a ISO 8601 con el desfase de Madrid, p. ej. 2026-07-01 `h14` → `2026-07-01T16:00:00+02:00`. Una hora local del día D tiene así su `h24` en el día siguiente.

## Ficheros estáticos: decisiones

- **Formato de los CSV**: `;` como separador, coma decimal, vacío = sin dato. UTF-8 con BOM en las estaciones y el polen del año; **Latin-1** en `captadores_polen.csv` (cabecera `direccion_localidad ` con espacio final) y en los CSV anuales de polen 2010-2019. Las coordenadas de `calidad_aire_estaciones` mezclan coma y punto decimal (p. ej. `-3.9612` y `-3,868994444`).
- **Magnitudes por estación** (`mide`): salen de las columnas `estacion_analizador_*` del CSV. Arganda del Rey mide el ozono con el analizador `O3Q`; se cuenta como `o3`. El resultado coincide con el fichero del día: NO2 28, O3 28, PM10 21, PM2,5 15, SO2 6, PM1 2.
- **Captador de cada estación y municipio**: el captador **activo** más cercano (con datos en 2026) por distancia haversine. LEGA (Leganés) no tiene datos en 2026, así que no se asigna; Leganés cae en GETA (3,8 km).
- **Municipios**: los 28 con estación más Madrid (`mun:28079`, sin estación de la Comunidad). Para los 28, el punto del municipio es la coordenada de su estación (las fuentes no traen centroides), así que `dist_estacion_km` = 0. Madrid usa una coordenada aproximada del centro (Puerta del Sol, 40,4168, -3,7038) puesta a mano; su estación más cercana está a unos 9,4 km (Pozuelo de Alarcón), de ahí `cobertura_aire: lejana`.
- **Rejilla de viento**: 6 latitudes (39,90 a 41,15) × 7 longitudes (-4,55 a -3,05) cada 0,25° = 42 puntos exactos.
