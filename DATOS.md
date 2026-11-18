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
| Mediciones de polen, histórico (`mediciones_polen_historico`) | P75/P90 2010-2019 (referencia y tipos sin umbral publicado) | https://datos.comunidad.madrid/catalogo/dataset/mediciones_polen_historico |
| Calidad del aire, datos del día (`calidad_aire_datos_dia`) y datos horarios desde 2005 (`calidad_aire_datos_historico`) | Estructura y convención horaria (fichero de descripción en el propio conjunto) | https://datos.comunidad.madrid/catalogo/dataset/calidad_aire_datos_dia · https://datos.comunidad.madrid/catalogo/dataset/calidad_aire_datos_historico |
| Open-Meteo (API de previsión), CC BY 4.0 | Viento actual en una rejilla de 42 puntos | https://open-meteo.com |
| Open-Meteo Air Quality API (CAMS Europa), CC BY 4.0. «Generated using Copernicus Atmosphere Monitoring Service information 2026» | Aire y polen previstos a 48 h (`pronostico.json`) | https://open-meteo.com/en/docs/air-quality-api |
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

## Umbrales de polen

Cada tipo tiene `medio_min` y `alto_min` en `umbrales.json` (granos/m³, valor diario): bajo < `medio_min` ≤ medio < `alto_min` ≤ alto. También guarda `metodo`, `fuente` y, como referencia, P75, P90 y días con valor > 0 (2010-2019). Hay tres métodos, por orden de prioridad (consultado el 15-nov-2026):

1. **`oficial_palinocam` (15 tipos).** Umbrales vigentes de la Red PALINOCAM (Comunidad de Madrid), calculados como percentiles de las series 2010-2019 de todas las estaciones. Fuente: Tabla 15 de «Informe de resultados del polen atmosférico medido en el centro del municipio de Madrid» (Ayuntamiento de Madrid, nov-2025, p. 26): https://airedemadrid.madrid.es/UnidadesDescentralizadas/Sostenibilidad/CalidadAire/Portal/02_Actuaciones/02%20Ficheros/Informe_Analisis_Polen_Noviembre_2025.pdf . Medio = P95 (P90 en cupresáceas, gramíneas y quercus); alto = P97 (P95 en esos tres); el nivel «muy alto» (P99) de la Red se agrupa en `alto`. Son aerobiológicos (percentiles), no clínicos; la Red lo dice expresamente. La web de la Comunidad (https://www.comunidad.madrid/servicios/salud/polen) y los informes técnicos anuales de PALINOCAM no publican cifras de corte.
2. **`clinico_rea` (6 tipos sin umbral PALINOCAM).** Categorías de la Red Española de Aerobiología (REA, «Manual de Calidad y Gestión»), que son umbrales de concentración para que un porcentaje bajo, medio o alto de la población sensible tenga síntomas. No he podido abrir el manual original; los valores salen de dos documentos oficiales que lo reproducen: Informe de polen 2004-2019 del Gobierno Vasco (https://www.euskadi.eus/contenidos/informacion/informes_polen/eu_def/adjuntos/Informe-polen-2004-2019.pdf, abedul, aliso, aligustre, castaño y corylus: 1-30 / 31-50 / > 50) y la página del Ayuntamiento de Zaragoza (https://www.zaragoza.es/sede/servicio/informacion-polen/, artemisa con gramíneas, llantén y cenizo: 1-25 / 26-50 / > 50). Se guardan como mínimos enteros (31 y 51; 26 y 51).
3. **`percentil_con_suelo` (6 tipos: compuestas, ericáceas, eucalipto, sauces, «otros», PNI).** P75/P90 de 2010-2019 (días con valor > 0, todos los captadores) pero con un **suelo absoluto propio**: `medio_min = max(P75, 10)`, `alto_min = max(P90, 30)`. **Es criterio propio de AlergIA, no de ninguna autoridad.** El 10 coincide con el corte «medio» publicado más bajo de PALINOCAM para herbáceas (urticáceas 10; amarantos 8, romazas 9) y el 30 con el corte «alto» REA más bajo (urticáceas > 30). Garantiza que 1-3 granos nunca den medio o alto. Estos tipos no los usa el mapa principal.

| Tipo | Método | medio ≥ | alto ≥ | (P75 / P90 antiguos) |
|---|---|---|---|---|
| Gramíneas | PALINOCAM | 26 | 53 | 11 / 41 |
| Olivo | PALINOCAM | 34 | 74 | 16 / 76 |
| Cupresáceas | PALINOCAM | 59 | 171 | 20 / 100 |
| Plátano de paseo | PALINOCAM | 81 | 248 | 35 / 321 |
| Artemisia | REA | 26 | 51 | 2 / 3 |
| Abedul | REA | 31 | 51 | 2 / 5 |
| Aliso | REA | 31 | 51 | 4 / 8 |

Comprobación: el 19-may-2026 (pico del año) la media de gramíneas entre captadores fue 204,8 granos/m³, muy por encima de 53: nivel **alto**, y todos los captadores salen medio o alto. Con los datos del 15-nov-2026 ninguna estación sale en medio o alto por 2-3 granos (máximo observado: 19 granos de cupresáceas, bajo).

Limitaciones:
- Los cortes PALINOCAM están calculados sobre la serie de la Red, no son umbrales de síntomas. Los REA son de ámbito nacional y la propia REA recomienda umbrales locales cuando se pueda.
- PALINOCAM y REA difieren en algunos tipos (REA: olivo, cupresáceas y plátano 51 / 201; gramíneas 26 / 51). Donde hay PALINOCAM se usa este, por ser el de la Red que emite los datos; la referencia REA queda en `referencia_rea`.
- Los valores pueden venir con decimales (p. ej. 3,5); los cortes REA se guardan como mínimos enteros (> 50 = 51), así que 50,5 cuenta como medio y 30,5 como bajo (la REA diría «> 50 = alto»; la diferencia solo afecta a valores con decimales entre 50 y 51).
- Aplicar estos cortes al polen previsto por CAMS (Open-Meteo) es otra aproximación (modelo frente a captador).
- Hasta junio el polen es diario; el resto del año es semanal con retraso de 2 a 6 días.
- Hasta el 15-nov se usaban P75/P90 propios (gramíneas 11 / 41; artemisia 2 / 3): daban «medio» con 2 granos, clínicamente absurdo. Se descartó.

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
- **Municipios (179, tarea 16)**: los 28 con estación, Madrid (`mun:28079`) y 150 más, hasta los 179 de la Comunidad. Los 28 y Madrid no cambian (mismo id, punto y asignación). Para los 28, el punto es la coordenada de su estación (`dist_estacion_km` = 0). Madrid usa una coordenada aproximada del centro (Puerta del Sol, 40,4168, -3,7038) puesta a mano; su estación más cercana está a unos 9,4 km (Pozuelo de Alarcón), de ahí `cobertura_aire: lejana`.
  - **Fuentes de los 150 nuevos**: la lista de códigos INE sale del CKAN, conjunto `municipio_comunidad_madrid` (https://datos.comunidad.madrid/catalogo/dataset/municipio_comunidad_madrid, CC BY 4.0; el CSV trae el código de 6 cifras con dígito de control y se usan las 5 primeras). El CKAN de la Comunidad no tiene coordenadas de municipios, así que nombre y punto salen del IGN (API OGC https://api-features.ign.es, consultada el 16-nov-2026): `administrativeunit` (INSPIRE, nombre oficial con tildes; INE = últimas 5 cifras de `nationalcode`) y `nuc` (núcleos de población del INE/IGN, con habitantes). **Licencia**: condiciones de uso del IGN/CNIG (https://www.ign.es/resources/licencia/Condiciones_licenciaUso_IGN.pdf), que se describen como compatibles con CC BY 4.0; atribución «© Instituto Geográfico Nacional de España». No pude leer el PDF desde el entorno, así que conviene comprobarlo antes de la entrega.
  - **Punto del municipio** = el del núcleo de población con más habitantes (no el centroide del polígono: en municipios de sierra o con varios núcleos el centroide cae lejos de donde vive la gente). Queda registrado, con el núcleo elegido y sus habitantes, en `datos-estaticos/municipios_fuente.csv` (lo genera `uv run python -m estatico.extraer_municipios`; el constructor lo lee sin red). El IGN añade 2 unidades especiales (53057 Los Baldíos, 53058 El Redegüelo) que no están en la lista de la Comunidad y se descartan.
  - **Asignación**: estación de aire = la más cercana de las 28 (haversine) con `dist_estacion_km`; captador = el activo más cercano con `dist_captador_km`; zona de pronóstico = la de su estación (no se guarda: `zonaDe(pronostico, municipio.estacion)`). Los alias llevan el nombre sin tildes, la forma sin artículo («alamo», «acebeda») y las partes de los nombres con guion («alalpardo»); la web busca por «empieza por o contiene», así que «san lorenzo» encuentra San Lorenzo de El Escorial.
  - **Cobertura**: se mantiene el umbral de 5 km que ya usaba la web (`UMBRAL_LEJANA_KM`): ≤ 5 km `buena`, > 5 km `lejana` (la ficha avisa de que el aire es orientativo). Con 10 km, Madrid (9,4 km) pasaría a `buena` y cambiaría su aviso. Resultado de los 150 nuevos: mediana de distancia a estación 10,4 km, máximo 26,7 km (Somosierra), 80 a más de 10 km, 139 a más de 5 km. Captador: mediana 21,6 km, máximo 63,9 km, 125 a más de 10 km (solo hay 10 captadores activos y ninguno en el sur-este ni en la sierra norte): el aviso de polen lejano de la web ya contempla esta distancia.
- **Rejilla de viento**: 6 latitudes (39,90 a 41,15) × 7 longitudes (-4,55 a -3,05) cada 0,25° = 42 puntos exactos.

## Colegios (`datos-estaticos/colegios.json`)

- **Fuente**: CKAN de la Comunidad, conjunto `centros_educativos` (https://datos.comunidad.madrid/catalogo/dataset/centros_educativos, CC BY 4.0), CSV `;` en UTF-8 con BOM (descargado el 16-nov-2026, 7.757 filas). Se genera con `uv run python -m estatico.construir_colegios` (estaciones y captadores salen de `lugares.json`, sin red salvo el CSV de centros, que se cachea en `salida/cache/`).
- **Filtro** (7.757 filas → **1.910 centros**): 3.851 `BAJA`/`INACTIVO`/etc. descartadas (quedan 3.906 en `ALTA`); de las `ALTA`, 1.961 de tipo excluido, 25 centros extranjeros que no son colegios y 10 sin coordenadas. 0 cayeron fuera de la Comunidad.
  - **Incluidos** (`TIPO_ABRV`, recuento en ALTA con coordenadas): `CP INF-PRI` 717, `CP INF-PRI-SEC` 93, `CP PRI` 1 (públicos, tipo `CEIP`/`CEIPS`); `IES` 344; `CP EE` 26 y `CPR EE` 42 (educación especial, `CEE`); `CPR INF-PRI-SEC` 448, `CPR INF-PRI` 41, `CPR INF` 62, `CPR PRI-SEC` 26, `CPR PRI` 4, `CPR INF-SEC` 1, `CPR ES` 30, `CREI` 1 (privados y concertados, `COL`); `CIMELPR PRSEC` 1 y `CIMPR SEC` 1 (conservatorio integrado con primaria/secundaria, `CIM`); `CEXTRAN ESP` (centros docentes extranjeros en España, `EXT`): 95 en ALTA, quedan 72.
  - **Excluidos** (solo se listan los mayores; el resto, ~1.200, son 0–3 años, adultos, música/danza/arte, idiomas, deportivas, equipos de orientación, formación y administrativos): `EIPR` 680 y `EEI` 362 + `EEI-CN` 129 + `ZNAS.CN.` 35 (escuelas infantiles 0–3: no tienen educación física ni recreo escolar), `CPR FPE` 235 y `CP IFP`/`CP FPE` 9 (FP: no hay campo que diga si tienen alumnado menor de edad, así que se excluyen todos), `CEPA`/`CPRIEPA`/`E.M.EPA`/`CEPA.EP` (adultos) 89, `E MUN.MUSICA`/`E MUN. MUS-DANZA`/`CAU*`/`CPROF*`/`CSU*` (música, danza, arte, deportivas) ~280, `EOI`/`EXEOI` 35 (idiomas), `EOEP*` 68, `CET` 11 (centros educativo-terapéuticos, en hospitales), `A. HOSP.*` 4, `CF EMPLEO`/`CFA`/`CTIF`/`UFIL`/`ISMIE`/`CREACIM` 25, `UNIVERSIDAD`, `EST ADMI`, `C. DOC. MILITAR`.
  - **Centros extranjeros**: el CSV no trae etapa. Se descartan por nombre 25 que no son colegios (guarderías «Nursery/Nido/Maternelle», escuelas de negocio, academias; regex `NO_COLEGIO_EXT`). Quedan colegios como el Alemán, el Británico o el American School, pero puede colarse alguno dudoso (la lista está a la vista en `NO_COLEGIO_EXT`).
  - **Etapas** (`e`): derivadas del tipo (I infantil, P primaria, S secundaria/bachillerato, E especial); no vienen en el CSV, así que `IES` = `S` aunque algunos no tengan bachillerato.
- **Resultado**: CEIP 718, COL 613 (462 concertados, 150 privados, 1 público), IES 344, CEIPS 93, EXT 72, CEE 68, CIM 2. Titularidad: público 1.184, concertado 502, privado 224 (los `PÚBLICO-TITULARIDAD PRIVADA` solo aparecen en tipos excluidos).
- **Datum**: `UTM_X`/`UTM_Y` son **ETRS89 / UTM 30N (EPSG:25830)**. Comprobado con centros reales: Hastings School (Madrid) cae a 23 m del punto de OpenStreetMap con 25830 y a 255 m con ED50 (EPSG:23030); el Colegio Alemán de Madrid, a ~125 m del centro del campus con 25830 y ~310 m con ED50. Conversión a WGS84 con `pyproj` (ETRS89 y WGS84 difieren centímetros). Hay un test que fija el caso.
- **Municipio**: `CDMUNI` (3 cifras de la Comunidad) → `mun:<INE>` con el CSV `municipio_comunidad_madrid` (INE de 6 cifras con dígito de control, se usan 5). Todos los centros finales tienen municipio de los 179.
- **Asignación**: estación de aire más cercana de las 28 (`ea`, `de` km) y captador **activo** más cercano (`ca`, `dc` km), por haversine, igual que en los municipios. Mediana a estación 5,3 km (máx. 20,4; 982 centros a más de 5 km, 174 a más de 10 km); mediana al captador 4,8 km (máx. 57,6; 916 a más de 5 km, 358 a más de 10 km).
- **Nombres**: la fuente viene en mayúsculas y casi siempre sin tildes; se pasa a título (preposiciones en minúscula, siglas y romanos en mayúscula) pero **no se pueden restaurar las tildes** («Jose de Espronceda»). En los extranjeros se quita la nacionalidad entre paréntesis final.
- **Tamaño**: 322 kB sin comprimir (un centro por línea, claves cortas explicadas en el campo `claves`); no hace falta partirlo.
