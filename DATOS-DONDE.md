# DATOS-DONDE: verificación D1 (18-nov-2026)

Todo lo de abajo está comprobado descargando los datos, no solo la ficha. Descargas en el scratchpad `.../scratchpad/d1/`; scripts `.../scratchpad/match.py` y `c.py`.

## Resumen

| Punto | Veredicto |
|---|---|
| 1. Población por sección con edad | **SÍ HAY.** INE, Censo anual de población 1-ene-2025, tabla 69213 (Madrid, secciones, sexo, edad quinquenal). 4.518 secciones, total 7.113.886 y 65+ = 1.342.648 (las cifras exactas del plan). **No se usa el SHP de la Comunidad** (es de 2021): casa solo el 95,88 % de la población 2025. Se usa el seccionado del INE 2025, que casa al **100 %**. Plan B no necesario. |
| 2. Madrid en 2030 (validación) | **SÍ.** La misma tabla trae 2021-2025 por sección y edad. Se puede proyectar con 2021-2023 y validar contra 2025. |
| 3. IMSERSO y Decreto 78/2017 | **IMSERSO verificado** (informe a 31-dic-2024 y a 31-dic-2023). **Decreto 78/2017 verificado**, pero no da ratios por población: solo se cita como obligación por tipo de local. |

## 1. Población por sección censal

### Fuente elegida: INE, Censo anual de población (1-ene-2021 a 1-ene-2025)
- Tabla **69213**: «Población por sexo y edad (grupos quinquenales)», secciones censales de la provincia 28 Madrid, periodos 2021, 2022, 2023, 2024 y 2025.
- Página de resultados: https://www.ine.es/dynt3/inebase/index.htm?padre=11555&capsel=11100 (secciones censales; la provincia de Madrid cuelga de `capsel=11154` > `capsel=11131`). Operación: Censo anual de población 2021-2025, última referencia 1-ene-2025, publicado 2-dic-2025.
- **Descarga directa usada (CSV, `;`, UTF-8 con BOM, 148 MB, 1,57 millones de filas):** https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69213.csv?nocab=1
  - ⚠ La API JSON de INE (`wstempus`) responde «No puede mostrarse por restricciones de volumen» para esta tabla: hay que usar el CSV.
  - Cuidado: en la lista de tablas del INE, la 69129 es Barcelona; Madrid es la **69213**.
- Columnas: `Provincias; Municipios; Secciones; Sexo; Edad; Periodo; Total`. Las filas de sección traen `Secciones` = «2800101001 Acebeda, La sección 01001» (código INE de 10 cifras = 28 + municipio 3 + distrito 2 + sección 3). Las filas con `Secciones` vacío son totales de municipio (179) y de provincia.
- Sexo: Total, Hombres, Mujeres. Edad: Todas las edades + 20 grupos quinquenales (0-4 ... 95-99) + 100 y más. **Edades exactas disponibles: 0-14 y 65 o más.** 0-17 no se puede sacar exacto (el grupo 15-19 cruza los 18): usar 0-14 («población infantil») o 0-19, o repartir 15-19 por 3/5 (se declara). Para 65+ es exacto.
- Valores vacíos (`""`) = la sección no existe ese año. En 2025 hay 4.518 secciones con dato; todas con total y desglose por edad (0 valores enmascarados, mínimo 69 habitantes, mediana 1.479, máximo 4.489).
- **Licencia:** CC BY 4.0 según el Aviso legal del INE (https://ine.es/dyngs/AYU/index.htm?cid=125: «la licencia general de la información estadística es Creative Commons Reconocimiento 4.0», citar fuente y no sugerir aval del INE). Nota: el pie de las páginas de INEbase dice «CC BY-SA 4.0» pero enlaza al texto de CC BY 4.0; se cita CC BY 4.0 y se atribuye al INE. No usar datos como si el INE los avalase.

### Cifras comprobadas (2025, suma de secciones)
- Total **7.113.886** (coincide con el total de la provincia en la propia tabla y con lo esperado por D2).
- 65 o más (65-69 ... 100+): **1.342.648** (coincide con lo esperado por D2).
- 0-14: 943.976.
- 4.518 secciones y 179 municipios (el plan decía 4.417: **cambiarlo a 4.518**).

### Geometría: no usar el SHP de la Comunidad para 2025
| Geometría | Secciones | Población 2025 que casa | Veredicto |
|---|---|---|---|
| Comunidad `secciones_censales` (SHP/CSV, CC BY, ficha modificada 7-feb-2025; recurso actualizado 3-jun-2024) https://datos.comunidad.madrid/dataset/secciones_censales | 4.417 | **6.821.099 de 7.113.886 = 95,88 %** (4.366 de 4.518 secciones; faltan 152; 1 sección del SHP ya no existe: 00502009) | **Descartada para 2025.** Es el seccionado de 2021 (casa el 99,96 % de la población de 2021: 4.417/4.417) |
| **INE seccionado 2025 (SHP, ETRS89 UTM 30N), 60 MB, CC BY 4.0** https://www.ine.es/prodyser/cartografia/seccionado_2025.zip (`SECC_CE_20250101`, 36.554 secciones de España, 4.518 en Madrid) | 4.518 | **7.113.886 = 100 %** (4.518 de 4.518, 0 sin geometría, 0 sobrantes) | **ELEGIDA.** Campos: `CUSEC` (10 cifras), `CUMUN`, `CSEC`, `CDIS`, `CMUN`, `CPRO`, `CUDIS`, `NMUN`, `CNUT*` |
- Las 150-152 secciones nuevas de 2025 están sobre todo en Madrid capital (53 municipio 079), Torrejón, Alcalá, etc.; suman 292.787 personas (4,1 %). Cartografía histórica de INE por año: `seccionado_2024.zip`, `seccionado_2021.zip` (existen, comprobado con HEAD). Servicio OGC API Features del INE (capa actual «Secciones_2026»): https://www.ine.es/geoserver/ogc/features/v1/collections
- Con el CSV de la Comunidad, el código de sección tiene 8 cifras (municipio 3 + distrito 2 + sección 3) = `CUSEC[2:]`. El CSV viene en **latin-1 con la Ñ rota** («GRIÐON», «COBE/A»): otra razón para no usarlo.
- **Consecuencia para el plan:** `secciones.json` pasa a tener 4.518 secciones. Nombres de municipio: del INE (`NMUN`) o de `municipio_comunidad_madrid`. Distritos de la capital: `CUDIS` (28079xx). Zona estadística: por municipio, como ya estaba. Superficie: calcularla de la geometría. La Comunidad deja de aportar geometría de secciones (se puede decir «Censo anual de población y cartografía de secciones del INE»; el uso de datos de la Comunidad queda en los servicios, municipios, y el catálogo).
- Aviso: el seccionado del INE hay que atribuirlo («Fuente: INE») y es CC BY 4.0 según su página de datos abiertos (https://ine.es/dyngs/DAB/index.htm?cid=1389, con la inconsistencia CC BY-SA/CC BY del pie).

### Alternativa comprobada (por si se quiere renta o un respaldo): ADRH del INE
- Atlas de distribución de renta de los hogares, tabla «Indicadores demográficos» de Madrid = **31105** (API `https://servicios.ine.es/wstempus/js/ES/DATOS_TABLA/31105?nult=8&tip=A`, 37 MB, funciona). Traen por sección, distrito y municipio: Población, % menores de 18, % de 65 y más, edad media, tamaño del hogar, % hogares unipersonales, % población española; años 2017-2024.
- 4.586 secciones en el ADRH 2017-2024. En 2024: población 6.995.318 y 65+ ≈ 1.294.555; 49 secciones sin valor de edad (secreto estadístico). Los códigos de 2017 casan al 100 % con el SHP de la Comunidad, el de 2024 solo al 95,85 %.
- Ventaja: da **% menores de 18 exacto**. Inconveniente: su último año es 2024, no 2025. Para la renta por sección (tarea D6) sirve la tabla «Indicadores de renta media y mediana» (misma serie de tablas del ADRH, operación 353; D6 la verificará).
- Se descarta como fuente principal porque el Censo anual 2025 es más reciente y trae el grupo de edad completo.

### Qué usar para cada grupo objetivo (propuesta)
- 65 o más: Censo anual 2025 (exacto).
- 75 o más (si se quiere): 75-79 + 80-84 + 85-89 + 90-94 + 95-99 + 100+ (exacto).
- Niños: 0-14 del Censo (exacto) o 0-17 del ADRH 2024 (aplicado como % sobre la población 2025, se declara). Recomendado: 0-14 en el mapa («población de 0 a 14 años») y no mezclar fuentes.
- Si el plan quiere ceñirse a «población total, 65+ y 0-17»: el 0-17 es el único que obliga a una aproximación. No hace falta repartir con la estructura del municipio porque la sección trae los grupos quinquenales.

## 2. «Madrid en 2030»: validación con años pasados

- **Hay población por sección con edad de 2021, 2022, 2023, 2024 y 2025 en la misma tabla** (69213). Con 2021-2023 se proyecta y se compara con 2025 (backtest de 2 años de horizonte, o 2021 → 2025 con 4 años).
- Totales de la Comunidad (suma de secciones): 2021 = 6.726.640; 2024 = 7.009.268; 2025 = 7.113.886. 65+: 2021 = 1.210.699; 2025 = 1.342.648. 0-14: 2021 = 991.680; 2025 = 943.976.
- Secciones comparables (mismo código en 2021 y 2025): 4.369 de las 4.417 de 2021, con 6.690.233 personas (99,5 % de 2021). Las 48 secciones de 2021 que cambian de código (divisiones o fusiones) se comparan a nivel de municipio.
- Datos de municipio de 2021-2025 también salen de la misma tabla (179 municipios) y de la API del INE.
- También hay padrón/ADRH por sección 2017-2024 (tabla 31105) si se quiere una serie más larga (2017-2024) para ajustar tendencias.
- Aviso metodológico: el Censo anual es una estadística de síntesis administrativa; entre años hay revisiones. Declararlo.
- ~~Pendiente: proyección y backtest~~ Hecho en **D7** (al final de este fichero).

## 3. Referencias oficiales

### IMSERSO, plazas de residencia y centro de día por 100 mayores: **VERIFICADA**
Informe oficial «Servicios Sociales dirigidos a Personas Mayores 2024. Informe a 31 de diciembre de 2024».
- PDF (65 págs.): https://imserso.es/documents/20123/10902543/inf_ssppmmesp2024.pdf/1432577e-5e36-5d7c-83d1-24864192dc99
- Definición literal (pág. del resumen de residencias y de centros de día): «(1) Índice de cobertura: (nº de plazas/población>=65) *100.»
- Población≥65 usada por el IMSERSO: 01/01/2025 (Madrid 1.344.034; España 10.180.492).

| Servicio | Madrid (plazas; índice) | España | Año |
|---|---|---|---|
| Atención residencial (centros residenciales + viviendas para mayores) | 56.592 plazas; **4,21** (centros residenciales 4,13; viviendas 0,08) | **4,05** (centros residenciales 3,95) | a 31-dic-2024 |
| Centros de día | 16.393 plazas; **1,22** | **1,06** | a 31-dic-2024 |

- Edición anterior (informe a 31-dic-2023, https://imserso.es/documents/20123/8735791/inf_ssppmmesp2023.pdf/634ffac5-32f2-f7b3-3c4a-fc43179676de): Madrid residencial 56.486 plazas, 4,46 (centros residenciales 4,37); España 4,20. Centros de día: Madrid 16.072, 1,27; España 1,10. (Población≥65 a 01/01/2023, Madrid 1.266.538.)
- Cuenta plazas que declara cada comunidad (por eso es una referencia, no un estándar): hay notas de cobertura incompleta en algunas comunidades (Andalucía, Navarra, Bizkaia, Gipuzkoa en usuarios de viviendas para mayores). No se ha comprobado que los 56.592 coincidan plaza a plaza con las plazas del registro de la Comunidad que usa el plan (el plan usa ~2.633 centros sociales y media de 4,31); el cociente del plan 4,31 y el 4,21 del IMSERSO son del mismo orden. **Uso recomendado:** línea de referencia «media de España 4,05 plazas por 100 mayores (IMSERSO, dic-2024)» y «Madrid 4,21»; declarar que el recuento es el del IMSERSO y no el nuestro.
- La cifra «5 por 100 mayores (OMS)» sigue **sin fuente primaria: descartada**. Una asociación sectorial (Directoras y Gerentes) usa 5 como criterio propio, no es del IMSERSO ni de la OMS. No usar.

### Decreto 78/2017 de la Comunidad de Madrid: **VERIFICADO (con matiz)**
- BOCM nº 219, 14-sep-2017, pág. 8 y ss.: «DECRETO 78/2017, de 12 de septiembre, del Consejo de Gobierno, por el que se regula la instalación y utilización de desfibriladores externos fuera del ámbito sanitario y se crea su Registro.» https://www.bocm.es/boletin/CM_Orden_BOCM/2017/09/14/BOCM-20170914-1.PDF
- Artículo 3 («Espacios obligados a disponer de desfibrilador»): «Quedarán obligados a disponer de al menos un desfibrilador en condiciones aptas de funcionamiento y listo para su uso inmediato los siguientes espacios o lugares: ... h) Los centros educativos. ... j) Los centros residenciales de mayores que dispongan de, al menos, 200 plazas de residentes.» (también grandes comercios > 2.500 m², aeropuertos, estaciones con ≥ 5.000 personas/día, centros deportivos con ≥ 500 usuarios/día, hoteles con > 100 plazas, centros de trabajo con > 250 trabajadores, etc.).
- **Matiz:** es una obligación por tipo de local, no por población ni por distancia. Sirve para decir «los colegios están obligados a tener uno», pero no es un ratio de cobertura. Se cita así en la pantalla. (No se ha comprobado si el texto tiene modificaciones posteriores.)
- Registro de desfibriladores: art. 8 del decreto; la Comunidad informó de 8.449 activos en 2022 (nota de prensa, no verificada aquí).

## 4. Valores de `dependecia_funcional` de los hospitales (extra de D1)
Dataset `centros_servicios_establecimientos_sanitarios` (CKAN, CC BY, CSV `;` UTF-8 con BOM, 7,9 MB): https://datos.comunidad.madrid/dataset/d8a0a444-adf5-4c04-8999-0eac3de52cb7/resource/2948b4da-8b39-42b7-b667-779a5284f39d/download/centros_servicios_establecimientos_sanitarios.csv
- El CSV tiene una fila por **oferta asistencial** (46.204 filas); hay 15.919 centros únicos (`centro_nro_registro`). **Hay que deduplicar por `centro_nro_registro`** antes de contar. Columna con la errata: `dependecia_funcional` (y `dependecia_patrimonial`).
- Valores de `dependecia_funcional` en el fichero (filas): Privado No Benéfico (37.404), Servicios o Institutos de Salud de las CC.AA (5.269), Municipio (705), vacío (682), Mutua de Accidentes de Trabajo (613), Privado Benéfico (Iglesia) (545), Otros CESS Públicos de dependencia Autonómica (335), Otros CESS Públicos de dependencia estatal (248), Otro Privado Benéfico (143), Otros CESS Públicos (139), Administración Penitenciaria (46), Privado Benéfico (Cruz Roja) (39), Instituto de Salud Carlos III (18), Otra dependencia funcional (16), Ministerio de Defensa (2).
- **«Hospital general» (centros únicos): 60**, todos con coordenadas (UTM). Por dependencia funcional: **Servicios o Institutos de Salud de las CC.AA = 25** (patrimonial «Servicio Madrileño de Salud»; estos son los públicos); Privado No Benéfico = 31; Privado Benéfico (Iglesia) = 4. Los 25 públicos: Alcalá de Henares, Alcorcón, Aranjuez, Arganda del Rey, Collado Villalba, Coslada, Fuenlabrada, Getafe, Leganés, Madrid (9), Majadahonda, Móstoles (2), Parla, San Lorenzo de El Escorial, San Sebastián de los Reyes, Torrejón de Ardoz, Valdemoro.
- **Regla recomendada para el filtro `hospital`:** `centro_tipo == "Hospital general"` y `dependecia_funcional == "Servicios o Institutos de Salud de las CC.AA"` (25 centros). Aviso: algunos hospitales de gestión concertada o PPP (p. ej. los de Torrejón o Rey Juan Carlos) pueden figurar como «Privado No Benéfico» y quedan fuera; se declara. Revisar a mano si se quieren incluir los 4 «Privado Benéfico (Iglesia)» (no son públicos).
- Otros tipos: Centro de salud: 276 únicos (269 con dependencia «Servicios o Institutos de Salud de las CC.AA» y patrimonial SERMAS; 7 casos mixtos), Consultorio de atención primaria: 153 únicos (149 SERMAS).

## Pendiente
1. Descargar el SHP del INE 2025 solo para Madrid y comprobar proyección (ETRS89 UTM 30N) y `point_on_surface` en D2. Ya se comprobó que los 4.518 `CUSEC` casan con los datos; falta la geometría en sí (leído solo el `.dbf`).
2. Proyección 2030 y backtest 2021→2025 (modelo).
3. Decidir con Guillermo si 0-14 o 0-17 (aproximado) para los niños.
4. Actualizar `PLAN-DONDE-HACE-FALTA.md`: 4.518 secciones (no 4.417), geometría INE 2025, fuente `69213`, nombres de la CKAN y valores de `dependecia_funcional`.
5. Confirmar licencia del seccionado INE (inconsistencia CC BY / CC BY-SA en el pie de la web).

Descarga realizada sin aviso previo: tabla 69213 (148 MB) y seccionado INE 2025 (60 MB) y una tabla de Barcelona (136 MB, 69129, por error al localizar Madrid). Todo en el scratchpad, fuera del repositorio.

---

# D2 y D3: resultado (18-nov-2026)

Se regenera con `uv run --project pipeline python -m donde.construir --salida public/donde` (descarga una vez, a `salida/cache/`, fuera de git: censo INE 148 MB, seccionado INE 60 MB y unos 12 MB del CKAN; tarda unos 4 s con la caché). Intermedios en `salida/donde/` (no van a `public/`): `poblacion_serie_2021_2025.npz` (para D7), `secciones_utm.json` (geometría original en UTM, para asignar centros) e `informe.json`.

## Ficheros de `public/donde/`
| Fichero | Tamaño | Contenido |
|---|---|---|
| `secciones.json` | 375 kB | 4.518 secciones; `ids` (CUSEC de 10 cifras), `mun`, `distrito` (solo capital), `zona`, `lat`/`lon` (punto interior, `representative_point` de la geometría original), `area_km2`, `pob` = `total`, `0_14`, `3_16`, `65_mas`, `75_mas` |
| `secciones.geojson` | 2,58 MB | Polígonos con solo la propiedad `id`. Simplificados con `coverage_simplify` (20 m): las fronteras compartidas se simplifican igual en las dos vecinas, así que no aparecen huecos ni solapes; coordenadas en WGS84 con 5 decimales (`set_precision`). 0 geometrías inválidas |
| `territorios.json` | 854 kB | 179 municipios y 21 distritos (nombre, población, punto, bbox `[oeste,sur,este,norte]`), 11 zonas con alias, `tramos_tamano`, y contornos disueltos `municipios_geo` y `distritos_geo` |
| `servicios/*.json` | 1,5 MB `dea`, 250 kB `farmacia`, 204 kB `otros_sociales`, el resto < 100 kB | Un fichero por servicio, con arrays por columnas |

## Cifras (2025)
- Población total **7.113.886**, 65+ **1.342.648**, 0-14 **943.976**, 75+ 676.914, 3-16 (estimada) 996.144. Coinciden con las cifras de D1. 4.518 secciones, mínimo de 69 habitantes.
- Parla: zona 04 (Sur Metropolitano). Población de La Acebeda 70; Madrid 3.477.497.
- **Distritos de Madrid**: los nombres están escritos a mano (el INE solo da el código). Verificado: las 1.249 residencias y centros sociales de la capital con coordenadas caen, por punto en polígono, en el distrito cuyo nombre trae su campo `direccion_distrito` (100 %; el registro escribe «San Blas» donde ponemos «San Blas-Canillejas»).
- **3-16 es una estimación.** El INE solo da tramos de 5 años: 3-16 = 3/5 de «0-4» (3 y 4 años) + «5-9» + «10-14» + 2/5 de «15-19» (15 y 16 años), suponiendo una distribución uniforme dentro de cada tramo. Es una aproximación razonable en secciones grandes y puede errar en secciones con pocos niños o con una residencia o colegio mayor. Se redondea a entero por sección. **Guillermo debe revisarla** (alternativa exacta: 0-14).
- Serie 2021-2025: 4.518 secciones en 2025, 4.480 en 2024, 4.479 en 2023, 4.432 en 2022 y 4.417 en 2021 (la unión de ids es lo que guarda el `.npz`; `-1` = la sección no existe ese año; matriz `[sección, año, 21 tramos]`, sexo total).

## Servicios
| Servicio | En el registro | Con coordenadas | Sin coordenadas | Notas |
|---|---|---|---|---|
| `centro_salud` (centro de salud + consultorio) | 429 | 421 | 8 | deduplicado por `centro_nro_registro` (276 + 153) |
| `hospital` | 25 | 25 | 0 | «Hospital general» con funcional «Servicios o Institutos de Salud de las CC.AA» |
| `residencia` | 518 | 500 | 18 | plazas: 55.195 con coordenadas + 2.695 sin = **57.890** |
| ~~`centro_dia`~~ | 553 | 523 | 30 | **Ya no es un servicio (18-nov, tarde)**: ver «Cambios del 18-nov (tarde)». Sus 553 centros van a `otros_sociales` |
| `farmacia` | 2.958 | 2.954 | 4 | |
| `colegio` | ~~1.264~~ **1.620** (de 1.910) | 1.620 | 0 | Infantil, Primaria o Secundaria (ESO), públicos o concertados (18-nov, tarde: antes solo Infantil/Primaria) |
| `dea` | 13.680 | 13.680 | 0 | |
| `otros_sociales` | ~~1.562~~ **2.115** | ~~1.352~~ **1.875** | ~~210~~ **240** | resto de sectores, 1 «CENTROS DE REHABILITACIÓN» de mayores y (desde el 18-nov tarde) los 553 centros de día de mayores |
- Los «sin coordenadas» son campos vacíos o el valor «RESERVADO» (direcciones protegidas, p. ej. casas de acogida). **Las 18 residencias sin coordenadas suman el 4,7 % de las plazas.** Se excluyen del mapa, pero el JSON guarda `descartados_sin_coordenadas` y `plazas_descartadas_sin_coordenadas`, y la media de plazas por cada 100 mayores calculada solo con las que tienen coordenadas queda algo por debajo de la real. Hay que decirlo en la Metodología.
- Todos los centros caen dentro de una sección o a menos de 200 m (`descartados_fuera_comunidad` = 0 en todos).
- **El municipio de cada centro es el del polígono donde cae el punto**, no el del registro. Los 201 DEA con municipio de registro distinto (171 a más de 300 m, mediana de 7 km) tienen coordenadas o municipio mal registrados; no se corrigen. 1.202 DEA no traen municipio.
- Los registros sanitarios y de farmacia **no traen nombre del centro**: `nombres` es «Tipo: vía número (municipio)». Los hospitales no tienen nombre propio en la fuente.
- Un `codigo_dea` (2018-1614) está repetido en dos filas con distinta ubicación: se conservan ambas (la segunda con sufijo `#2`).
- Titularidad (solo informativa): sociales = «propia de gestión» → pública; «con plazas concertadas» → concertada; el resto → privada. Sanitarios: funcional SERMAS → pública. DEA: `tipo_titularidad`. Colegios: `pu`/`co`. Farmacia: no se publica.
- **Datos personales:** cada registro se construye con una lista blanca de campos: no se copian titulares, NIF, teléfonos, correos, ubicación libre del DEA ni entidad. Test: `pipeline/tests/test_donde_servicios.py` y `test_donde_salidas.py`. El `grep -riE "titular|nif|telefono|correo"` literal del plan **no** puede quedar vacío: coincide con la clave `titularidad` (7 ficheros, es la propiedad del centro, no de personas), con «Beniferri» y con «uniforme»; el test comprueba nombres de columna y direcciones de correo.

## Licencias a citar
INE (censo anual y seccionado): CC BY 4.0, «Fuente: INE» (pie de las páginas de INEbase dice CC BY-SA 4.0 y enlaza al texto de CC BY; punto 5 de «Pendiente» sigue abierto). Comunidad de Madrid (sanitarios, sociales, farmacias, DEA, centros educativos, municipios): CC BY 4.0. Nombres y punto de cada municipio: `datos-estaticos/lugares.json` y `territorios.json` (IGN/CNIG, **CC-BY 4.0** verificada el 18-nov, Orden FOM/2807/2015; atribución exacta en la sección «R1» de abajo y en `DATOS.md`).

---

# D7: «Madrid en 2030» (18-nov-2026)

## Resultado en una línea
**Publicar, con límites declarados.** Para mayores de 65 y de 75 años el modelo gana por mucho a las dos referencias ingenuas (error medio ponderado por población 1,3 % y 1,8 % frente a 4,7-9,8 % y 8,2-11,8 %; en un municipio típico, mediana 3,3 % y 5,5 %). Para niños de 0-14 gana con claridad; para 3-16 años (estimado) solo de forma modesta. **Para el total de habitantes NO es mejor que «crecimiento uniforme»** (queda empatado): se dice sin rodeos.

## Fuente oficial (verificada)
- Conjunto `proyecciones_poblacion_por_sexo` del CKAN de la Comunidad: https://datos.comunidad.madrid/catalogo/dataset/proyecciones_poblacion_por_sexo. Licencia **cc-by** (campo `license_id` de la API; el pipeline falla si cambia). Ficha: «Población a 1 de enero», fuente «Proyecciones de Población. INE», fecha de actualización 24-06-2026, ámbito toda la Comunidad (sin municipios).
- CSV (97 kB, `;`, UTF-8 con BOM): columnas `Año; Concepto; Tipo territorio; Código territorio; Territorio; Sexo; Valor; Unidad; Estado dato`. 16 años (**2026-2041**), 22 conceptos (21 tramos de edad de 5 años, el último «100 años y más», y el total) × 3 sexos (Total, Hombres, Mujeres; se usa Total). **No trae 2025.**
- Origen en el INE: Proyecciones de Población 2026-2076 (escenario central, nota de prensa del 17-jun-2026, https://ine.es/dyngs/Prensa/PROP20262076.htm; metodología https://ine.es/metodologia/t20/meto_propob_2026_2076.pdf). El INE las llama escenarios, no predicciones. Resultado de la Comunidad: +14,4 % de 2026 a 2041 (lo comprobé con el CSV: 7.169.262 -> 8.204.833).
- **2030 es a 1 de enero de 2030** (misma referencia que el censo anual, 1 de enero). Total publicado 7.582.868; la suma de los 21 tramos es **7.582.867** (redondeo del INE: otros años difieren hasta en 2). Se cuadra con los tramos; la diferencia de 1 persona se declara.
- Copia del CSV usada en los tests: `pipeline/tests/datos/proyecciones_oficial.csv` (si el INE actualiza la serie, los tests avisarán).

## Método (`pipeline/donde/proyeccion.py`)
1. **Cohortes.** De 2025 a 2030 son exactamente 5 años, así que cada tramo de 5 años pasa **entero** al siguiente (sin suponer nada dentro del tramo). Los 0-4 de 2030 salen de los nacimientos de hoy (0-4 / 5 por año). El tramo 100+ es abierto.
2. **Calibración por tramo.** Cada columna (tramo de edad) se multiplica por un factor único para que la suma de las 4.518 secciones sea exactamente la oficial de 2030. Esto absorbe mortalidad y migración **de la Comunidad** (factores entre 0,17 en 100+ y 1,27 en 25-29). Luego se redondea con el método del resto mayor para que cada tramo cuadre en enteros.
3. **Garantía:** el total, 0-14, 65+ y 75+ de la Comunidad coinciden exactamente con la oficial (7.582.867 / 891.974 / 1.531.180 / 758.334; test). 3-16 es estimado como en 2025.
4. **Tendencia 2021-2025 (probada, NO adoptada).** Se probó mantener, amortiguada (λ = 0,5 o 1, y con peso de sección κ), la parte del crecimiento de cada municipio y sección que las cohortes no explican, aplicada solo a menores de 65. No es una mejora clara: con 2 años de entrenamiento baja el WAPE municipal del total de 1,23 a 1,01 % (2023 -> 2025), pero con 1 año de entrenamiento lo sube de 0,70 a 0,73 % (2022 -> 2023; y en una prueba exploratoria con 1 año de entrenamiento para proyectar 3, de 1,81 a 2,00 %), y no toca a los mayores. Se deja a 0 (`LAMBDA_MUN = KAPPA_SEC = 0`) y el backtest la sigue midiendo (`tendencia` en `proyeccion_backtest.json`). En pruebas exploratorias (no incluidas en el código) tampoco ayudó repartir los nacimientos según los padres de 25-44 años (0-14 peor: 4,1 % frente a 2,5 %), ni repartir el exceso de la calibración por tamaño de sección en vez de por cohorte (mejora el total 0,4 puntos y **empeora los mayores 2-4 veces**).

## Validación (obligatoria, hecha)
**Esquema.** Se aplica exactamente el mismo código (`proyectar`) desde un año pasado y se compara con lo observado en el Censo anual del INE (tabla 69213, serie por sección de 2021 a 2025). La calibración usa la estructura por edad **observada** de la Comunidad en el año final, como si fuera una proyección oficial perfecta. Escenario principal: **2021 -> 2025 (4 años)**.
**Referencias ingenuas.** (a) «Igual que hoy»: cada sección conserva su población. (b) «Crecimiento uniforme»: todas las secciones crecen igual que la Comunidad; versión por total (un factor) y por edad (un factor por tramo, la más exigente, usa la estructura oficial pero no hace envejecer).
**Niveles.** Municipio (179), distrito censal (246; es inmune a que una sección se divida) y sección (4.369 con el mismo código en 2021 y 2025). En sección, las que conservan el código pierden población si se divide otra: eso penaliza igual a todos y **sube el WAPE del total a ~9 % para todos los métodos**; por eso en sección se mira sobre todo la mediana. Las 473 secciones «estables» (su municipio no ha tocado secciones) son pocas, rurales y solo el 12 % de la población: se guardan en el JSON como `seccion_estable`, pero no sirven de prueba principal.

Error de cada método, en el formato **WAPE / mediana del error relativo** (WAPE = error absoluto total / total observado; mediana por unidad). Escenario 2021 -> 2025:

**Municipios (179)**
| Grupo | **Modelo** | Igual que hoy | Crec. uniforme (total) | Crec. uniforme (por edad) |
|---|---|---|---|---|
| Total | 1,9 % / 2,5 % | 5,6 % / 6,5 % | **1,5 %** / 2,7 % | 1,6 % / 3,2 % |
| 0-14 | **2,5 % / 5,2 %** | 5,7 % / 7,1 % | 11,3 % / 11,6 % | 3,8 % / 6,0 % |
| 3-16 (estimado) | **2,3 % / 4,7 %** | 2,9 % / 5,7 % | 7,8 % / 8,0 % | 3,3 % / 5,1 % |
| 65+ | **1,3 % / 3,3 %** | 9,8 % / 15,8 % | 4,7 % / 10,9 % | 5,7 % / 7,3 % |
| 75+ | **1,8 % / 5,5 %** | 11,8 % / 16,2 % | 8,2 % / 12,7 % | 9,5 % / 9,2 % |

**Distritos censales (246)**
| Grupo | **Modelo** | Igual que hoy | Crec. uniforme (total) | Crec. uniforme (por edad) |
|---|---|---|---|---|
| Total | 2,7 % / 2,7 % | 5,7 % / 6,1 % | 2,9 % / 3,0 % | 3,2 % / 3,5 % |
| 0-14 | **4,6 % / 5,1 %** | 6,5 % / 6,7 % | 11,6 % / 11,5 % | 5,0 % / 5,6 % |
| 3-16 (estimado) | 4,1 % / 4,6 % | 4,7 % / 5,3 % | 8,1 % / 8,0 % | 4,8 % / 5,2 % |
| 65+ | **1,9 % / 2,5 %** | 9,8 % / 14,9 % | 6,2 % / 10,0 % | 6,3 % / 7,0 % |
| 75+ | **2,7 % / 4,5 %** | 12,2 % / 16,2 % | 10,5 % / 12,2 % | 10,2 % / 9,7 % |

**Secciones censales (4.369 comparables)**
| Grupo | **Modelo** | Igual que hoy | Crec. uniforme (total) | Crec. uniforme (por edad) |
|---|---|---|---|---|
| Total | 8,9 % / 4,5 % | 8,5 % / 4,1 % | 8,7 % / 4,8 % | 8,9 % / 5,1 % |
| 0-14 | 16,8 % / 9,5 % | 19,7 % / 10,8 % | 23,4 % / 13,7 % | 18,1 % / 10,1 % |
| 3-16 (estimado) | 15,2 % / 8,2 % | 17,0 % / 9,2 % | 19,9 % / 11,3 % | 16,8 % / 9,1 % |
| 65+ | **5,9 % / 3,6 %** | 12,0 % / 8,8 % | 10,6 % / 8,2 % | 11,2 % / 9,6 % |
| 75+ | **7,6 % / 5,3 %** | 17,2 % / 15,4 % | 15,9 % / 14,4 % | 15,7 % / 14,5 % |

**Lectura honesta**
- **Mayores (65+ y 75+): ganador claro en los tres niveles.** El error es 3,5-7,5 veces menor que el de las referencias en municipio y la mitad o menos en sección. Es lo esperable: los mayores de 2030 ya viven aquí (en 2030, el 75+ son los 70+ de hoy) y casi no cambian de municipio.
- **0-14: gana con claridad.** **3-16: gana poco** (en municipio 2,3 % frente a 2,9 % de «igual que hoy»; en distrito 4,1 % frente a 4,7 %): es un grupo casi plano y estimado, no vendas precisión aquí.
- **Total: sin ventaja.** En municipio el total es peor que el crecimiento uniforme (1,9 % frente a 1,5 %; mediana 2,5 % frente a 2,7 %, equivalente); en distrito, empate; en sección todos fallan igual. El crecimiento de población lo mueven la vivienda nueva y la migración, que el modelo no ve. Para quien use el total (DEA, farmacias, centros de salud, hospitales) la proyección **no es peor** que la referencia, pero tampoco mejor.
- **Distribución del error del modelo (2021 -> 2025):** mediana por municipio de 2,5 % (total), 3,3 % (65+), 5,5 % (75+); percentil 80 de 6,2 %, 7,6 % y 11,0 %. Por tamaño de municipio, mediana del 65+: 1,4 % (más de 50.000 hab.), 3,3 % (10.000-50.000), 2,7 % (2.000-10.000) y **6,6 % (menos de 2.000)**: los pueblos pequeños tienen mucho más error. Por sección, p80 del 65+ de 8,2 % y del 75+ de 11,8 %; sesgo del 65+ +0,9 %.
- **Peores casos en municipios** (total, sin los diminutos): Villalbilla -12 % (crece por vivienda nueva que el modelo no ve), Fuenlabrada +8 % (el modelo le da más crecimiento del real), Navalagamella, Carabaña y Aldea del Fresno entre -8 y -7 %.
- **Horizonte.** Error del modelo por municipio (WAPE) del 65+ según los años: 0,3 % (1), 0,6 % (2), 0,8 % (3), 1,3 % (4); del 75+: 0,6 / 0,8 / 1,2 / 1,8 %; del total: 0,5 / 1,2 / 1,8 / 1,9 %. Crece unos 0,3-0,5 puntos por año; a 5 años se espera algo más (**extrapolación, no medida**: ~1,6-2 % en 65+ y ~2,3-2,8 % en 75+).
- **Sensibilidad a la proyección oficial.** El backtest usa el total «oficial» perfecto. Si la proyección oficial se desvía un ±2 % en todas las edades, el WAPE municipal del 65+ pasa de 1,3 % a 2,0-2,6 % y el del 75+ de 1,8 % a 2,3-3,1 %: el error de la Comunidad se suma casi tal cual al del reparto. No se ha usado ninguna medida de incertidumbre regional del escenario central (la fuente no la trae).

**Diferencia con el horizonte real (2025 -> 2030).** (1) El backtest es de 4 años, no 5; no existen más datos (la serie empieza en 2021). (2) Con 4 años los tramos no se desplazan enteros y hay que suponer una distribución uniforme de edades dentro del tramo (aprox. 1/5), lo que perjudica al backtest; a 5 años esa suposición desaparece, así que el error de los mayores puede ser algo menor de lo medido. (3) Pero 5 años acumulan más migración y vivienda nueva, y el error de los menores y del total puede ser algo mayor. (4) El backtest usa la oficial perfecta (ver sensibilidad). Por eso las cifras del texto son «error típico de lo medido a 4 años», no una garantía.

## Limitaciones (para la Metodología y el jurado)
- **Escenario, no predicción.** El total y la estructura por edad son el escenario central del INE (publicado el 17-jun-2026), que incluye supuestos de migración. Los servicios siguen siendo los de hoy: el mapa de 2030 responde «con los centros que hay, ¿dónde faltará?», no «con los que se abrirán».
- **El reparto por sección es un modelo** (no una fuente oficial): los mayores envejecen donde ya viven; no se modela vivienda nueva, ni cierres, ni cambios de barrio. **Las secciones de barrios nuevos o en desarrollo (p. ej. donde crece la población) quedarán infraestimadas**; no hay secciones de 2030 y las 4.518 son las de 2025. Municipios de menos de 2.000 habitantes: error típico 2-3 veces mayor.
- La mortalidad y la migración de cada tramo se suponen iguales en toda la Comunidad (un factor por edad): no se modelan diferencias entre barrios.
- Solo sexo «Total» (no se usa Hombres/Mujeres).
- El censo anual de 2025 y la proyección de 2026 no son exactamente comparables (2025: 7.113.886; 2026 proyectado: 7.169.262, +0,8 % cuando el último año observado creció +1,5 %): el escenario del INE asume algo menos de crecimiento reciente. No se corrige, solo se calibra a 2030.
- Se pierde 1 persona frente al total publicado del INE (7.582.867 frente a 7.582.868), y las cifras de 3-16, redondeadas por sección, suman unas 30 personas menos (943.357) que la fórmula aplicada a los tramos oficiales (943.384).
- 3-16 sigue siendo una estimación (3/5 de 0-4 + 5-9 + 10-14 + 2/5 de 15-19).

## Frase para la Metodología
«Las cifras de 2030 parten del escenario central de las Proyecciones de Población del INE (2026-2076) publicadas en el portal de datos abiertos de la Comunidad de Madrid (CC BY 4.0): el total de la Comunidad y su estructura por tramos de edad son oficiales y coinciden exactamente. El reparto por sección censal es un modelo propio: cada tramo de edad del Censo anual de 2025 pasa al siguiente en cinco años y se ajusta a la cifra oficial. Lo hemos probado aplicando el mismo método de 2021 a 2025: en mayores de 65 años el error medio ponderado por población de los municipios fue del 1,3 % (en un municipio típico, la mediana, 3,3 %), frente al 5-10 % de suponer que todo sigue igual o crece por igual; para el total de habitantes no mejora el crecimiento uniforme, y no modela vivienda nueva ni barrios en desarrollo, donde la población real puede superar nuestra cifra. Es una proyección, no una predicción.»

## Cifras para la presentación
Oficiales (Comunidad, no dependen del modelo):
1. **Los mayores de 65 pasan de 1.342.648 a 1.531.180 en 2030: +188.532 (+14,0 %)**; los de 75 o más, de 676.914 a 758.334 (+81.420, +12,0 %).
2. **Habrá 52.000 niños menos** (0-14: de 943.976 a 891.974, -5,5 %) y 469.000 habitantes más (+6,6 %).
3. **Solo para mantener la media de hoy** (4,31 plazas de residencia por cada 100 mayores, con las 57.890 plazas del registro): **+8.129 plazas**, unas **73 residencias de tamaño medio** (111,8 plazas). Con la referencia de la web (4,11, solo plazas con coordenadas), +7.750.

Del modelo (cada una con su error típico; el 75+ se apoya sobre gente que ya vive aquí, por eso es la más robusta):
4. **En Fuenlabrada los mayores de 75 pasarán de 11.396 a 18.507 (+62 %)**; en Madrid capital solo +4 % (16.485 más, la mayor subida absoluta). Mejorada del Campo +50 %, Arroyomolinos +47 %, Rivas-Vaciamadrid +46 %, Parla +44 %. **En 62 de los 179 municipios los mayores de 75 crecerán más de un 20 %.** Otros extremos: Móstoles +7.853 y Parla +3.362 en 75+. Rivas-Vaciamadrid, Meco, Daganzo de Arriba, Loeches y Nuevo Baztán crecen 35-41 % en 65+. (Error típico del 75+ por municipio: mediana 5,5 %, p80 11 % medidos a 4 años; en municipios pequeños, más.)
- No usar como cifra de portada algo del **total** de un municipio o sección (el modelo no gana a la referencia).

## Salida para la web
**`public/donde/secciones_2030.json`** (98 kB, 39 kB comprimido; se regenera con `python -m donde.construir`, que llama a `proyeccion.main`). Decisión: fichero aparte y no una columna más en `secciones.json`, para que quien no use el selector no cargue nada extra.
- `pob`: los mismos 5 arrays (`total`, `0_14`, `3_16`, `65_mas`, `75_mas`), enteros, 4.518 valores, **en el mismo orden que `ids` de `secciones.json`** (`n` y `ids_sha1` = sha1 de los ids unidos por `\n`, para comprobarlo).
- `comunidad` (2025 y 2030, los 5 grupos), `fuente_oficial`, `metodo`, `metodo_edades`, `total_tramos_vs_publicado`, `fecha_referencia` y `validacion` (errores del modelo y de las 3 referencias: WAPE, mediana y p80, en municipio, distrito, sección y sección estable).
- Intermedios (fuera de `public/`, en `salida/donde/`): `proyeccion_backtest.json` (todo el backtest: horizontes, tendencia, sensibilidad, tamaños, peores municipios) y `proyeccion_cifras.json`.

**Para el selector «Hoy / 2030» el frontend tiene que:**
1. Cargar `secciones_2030.json` solo al elegir 2030, comprobar `n === 4518` y construir `Secciones` con `pob = d.pob` y `anio_poblacion = 2030` (el resto: ids, mun, zona, lat, lon, geometría y **servicios, no cambian**). El motor (`agregados.ts`) agrega siempre desde `pob`, así que ranking, déficit, simulador y óptimo se recalculan solos.
2. Ojo con la referencia de residencias y centros de día: en 2030 hay que **mantener fijo el valor de hoy** (media 4,11; IMSERSO 4,05 / 4,21, ya son constantes) y NO recalcular «media de la Comunidad» con la población de 2030, porque entonces el déficit desaparecería por definición. Etiquetarlo: «con la media de hoy».
3. `territorios.json` trae la población de 2025 de municipios y distritos (`poblacion`, `tramo`): si la interfaz la muestra con el selector en 2030, recalcularla sumando `pob.total` por `mun`/`distrito`.
4. Rotular la vista: «Proyección a 1-ene-2030 (INE, escenario central) · el reparto por sección es un modelo», con el error del 65+ y 75+ (medio ponderado por población 1,3 % y 1,8 %; en un municipio típico, 3,3 % y 5,5 %: es la frase única `fraseErrorProyeccion`, también usada en Metodología) y el aviso de los barrios nuevos. Conviene que la cifra de portada del selector sea el 65+/75+ y las residencias/centros de día; para el resto de servicios, enseñar la vista pero sin cifras de «faltan N».
5. La caché del navegador: nombre fijo, 39 kB comprimidos; no hace falta versionado.

## Reproducir
`uv run --project pipeline python -m donde.construir --salida public/donde` (misma ejecución de siempre; ahora también descarga el CSV de 97 kB a `salida/cache/proyecciones_poblacion.csv` y escribe `secciones_2030.json`). Solo la proyección: `python -c "from donde import proyeccion; ..."` o `proyeccion.main(salida)` con la serie ya generada. Se comprobó que dos ejecuciones dan los mismos ficheros (mismo hash en todos los ficheros de `public/donde/`, incluido `secciones_2030.json`). Tests: `pipeline/tests/test_donde_proyeccion.py` (12 tests: parseo de la fuente, tramos que cuadran exactamente con la oficial, sin negativos ni NaN, 4.518 secciones y mismo orden, backtest sintético reproducible, y que la validación publicada se recalcula igual y sigue ganando a las referencias en mayores y 0-14).

---

# Cambios del 18-nov (tarde): colegios con ESO, centros de día fuera y métrica «plazas que faltan»

Se regenera con los mismos comandos de siempre. `secciones.json`, `secciones.geojson`, `territorios.json` y `secciones_2030.json` quedan **idénticos byte a byte** (mismo hash que antes); cambian `servicios/colegio.json`, `servicios/otros_sociales.json`, desaparece `servicios/centro_dia.json` y se rehace `pipeline/donde/referencia.json`. 208 pytest (había 201).

## 1. Colegios: ahora con ESO (3-16 años)
- **Fuente:** `centros_educativos` (CKAN, CC BY 4.0). **No hay un campo «imparte ESO»**: la etapa se deduce del tipo de centro (`TIPO_ABRV`), como ya hacía `datos-estaticos/colegios.json` (`e` = etapas I, P, S, E). Entran los centros en alta con coordenadas, de titularidad **pública o concertada**, con alguna de las etapas `I`, `P` o `S` (S = Secundaria, que en los tipos de la fuente incluye ESO y/o Bachillerato). Quedan fuera educación especial (`E`), FP, escuelas infantiles de 0-3 (EEI/EIPR) y los privados sin concierto (como antes; si Guillermo quiere incluirlos, es `TITULARIDAD_COLEGIO` en `pipeline/donde/servicios.py`).
- **Sin duplicados:** `colegios.json` ya trae un centro por código; `centros_colegios` además descarta códigos repetidos. Un centro con Primaria y ESO cuenta 1 vez (los 93 CEIPS públicos y los 384 colegios concertados de Infantil-Primaria-Secundaria ya estaban dentro).
- **Recuento:** 1.264 -> **1.620** (+356, todos de «solo secundaria»): 344 IES públicos + 1 centro integrado público de música y secundaria + 11 centros concertados de solo secundaria (`CPR ES`). Por titularidad: 1.158 públicos y 462 concertados. Sin centros sin coordenadas ni fuera de la Comunidad.
- **Contraste con la estadística oficial** (cursos 2024-25; CKAN, CC BY, conjuntos `1903453` y `1903456`): centros públicos con ESO = 348 (nuestros 344 IES + algún otro); privados concertados con ESO = 400 (nuestros 406: 384 + 11 + 11 con Primaria o Secundaria). Cuadra al ±2 %.
- **Aviso (para la Metodología, no bloqueante):** (a) algún IES de solo Bachillerato o FP (nocturnos) cuenta como «con ESO» (hasta 4 de diferencia en los públicos); la fuente no permite separarlo. (b) La estadística oficial da 348 centros públicos con ESO, pero nuestros 93 `CP INF-PRI-SEC` + 344 IES son 437 candidatos: la etiqueta «Secundaria» de los CEIPS es ambigua. **No afecta a los cálculos**, porque esos 93 ya estaban por Infantil/Primaria. (c) El servicio sigue sin separar etapas: un chico de 14 años cuenta como servido por un colegio de solo Primaria cercano (el motor mide distancia al centro más cercano de cualquier etapa).
- **Efecto en el déficit** (personas de 3-16, estimado, a más de R m del centro más cercano): R = 1.000 m: 152.458 -> 140.375 (15,3 % -> 14,1 %); **R = 1.500 m (por defecto): 99.392 (9,98 %) -> 95.786 (9,62 %)**; R = 3.000 m: 24.887 -> 23.138. Secciones en déficit a 1.500 m: 317 -> 304.

## 2. Centros de día: fuera del catálogo de servicios
- **Decisión de Guillermo (18-nov).** Pasan a «Otros servicios sociales»: `servicios/centro_dia.json` **ya no se genera** (el pipeline lo borra si existe), `SERVICIOS = [centro_salud, hospital, residencia, farmacia, colegio, dea]` y solo `residencia` tiene plazas (`CON_PLAZAS`). Los 553 centros (523 con coordenadas; 30 sin) salen en `otros_sociales.json` con `sector = "Personas mayores"`, `tipo = "CENTROS DE DÍA"` y un campo nuevo **`subtipo`**; así el recuento por sector de la ficha sigue contándolos (`Personas mayores`: 1 -> 524 centros en el fichero). `referencia.json` nunca usó centros de día, así que no cambia por esto.
- **Motivo, con cifras (para la Metodología).** El registro daba **71.990 plazas autorizadas** (66.846 con coordenadas) = **5,36 por 100 mayores de 65** (4,98 solo con coordenadas), frente al **1,22 de Madrid y el 1,06 de España** del IMSERSO (16.393 plazas en Madrid a 31-dic-2024). Causa encontrada: **230 de los 553 centros (54.999 plazas, el 76 %) son subtipo «HOGARES Y CLUBES»** (hogares y clubes de mayores, centros sociales de convivencia, no atención de día). Los 323 de subtipo «CENTROS DE DÍA: OTROS» suman **16.991 plazas = 1,27 por 100 mayores, muy cerca de las 16.393 del IMSERSO (+3,6 %)**. Es decir, el registro estaba bien, la clasificación por tipo no. **Si Guillermo cambia de opinión**, bastaría reponer el servicio filtrando `subtipo == "CENTROS DE DÍA: OTROS"` (323 centros).
- Los 553 son solo del sector «Personas mayores»; hay además 171 centros de día de otros sectores (discapacidad, salud mental, infancia...) que ya estaban en `otros_sociales`.
- El campo `subtipo` es una categoría del registro (no personal). La ficha debe tenerlo en cuenta al contar «centros de día»: **230 de los 523 con coordenadas son clubes de mayores**.

## 3. Residencias: métrica «reduce en N las plazas que faltan»
- **Definición (en `pipeline/donde/referencia.py` y la web debe copiarla exacta):** `F(A) = Σ_i objetivo_i · max(0, U − A_i) / 100` con `objetivo` = mayores de 65, `A_i` = plazas por 100 mayores (2SFCA, d0 = 10 km) y `U` = umbral **fijo** (no se recalcula con el centro nuevo). `N = F(antes) − F(después)`, donde `después` suma `100·r_nuevo` a `A_i` de las secciones a ≤ d0 del punto (`r_nuevo = plazas / mayores a ≤ d0 del punto`). Es la misma agregación que `plazasQueFaltan` / `plazasFaltanSeccion` de `src/lib/donde/cobertura.ts` (la cifra «faltan 10.689 plazas»: 10.688,80 con la media 4,1109; 10.048,11 con IMSERSO España 4,05; 11.737,23 con IMSERSO Madrid 4,21; 3.834,04 con la mediana ponderada 3,3645).
- **N ≤ plazas siempre (demostrado y comprobado).** Cada sección cubierta baja como mucho `objetivo_i · r_nuevo` y esas bajadas suman `plazas` (sin `max(...)` la suma sería exactamente `plazas`). Comprobado con los datos reales, tomando **cada una de las 4.518 secciones como punto**, 3 tamaños (25, 94 y 200 plazas) y 3 umbrales: mínimo 0, máximo = plazas exactos; N = plazas exacto en unas 630 secciones (14 %) (todas con todo su radio por debajo del umbral por un margen mayor que `100·r_nuevo`). El test `test_n_menor_o_igual_que_las_plazas_...` lo vigila. No hace falta ninguna corrección de agregación.
- **Lectura honesta:** con esta métrica, N/plazas es el «% de las plazas que cae en zonas que de verdad las necesitan». En las zonas muy deficitarias N llega al tope (= plazas) y **se vuelve poco discriminante**: el óptimo de la Comunidad es un empate de unas 630 secciones, sobre todo de Madrid capital. Por eso el desempate es: (1) N redondeado a 1e-6, (2) **más plazas que faltan dentro del radio del candidato** (también a 1e-6: «donde más hace falta»), (3) la sección que aparece antes en `secciones.json`. Sin (2), el óptimo de la Comunidad sería la primera sección del tope, sin sentido.
- **Casos nuevos** (94 plazas, d0 = 10 km, umbral = media de hoy 4,1109):

| Caso | Antes (métrica «mayores que ganan acceso») | Ahora (N, plazas que faltan que se reducen) |
|---|---|---|
| Pinto 40,2420 / -3,7000 | +1.078 mayores | **N = 64,15 de 94 plazas** (68,2 %); mejoran 222 secciones; faltan 10.688,80 -> 10.624,65 |
| Óptimo del sur (zona 04) | Parla, sección 2810601065, +1.581 (empate con Pinto) | **Leganés, sección 2807405017 (40,34272 / -3,74237): N = 93,82** (99,8 % de las plazas); mejoran 1.582 secciones. 2.ª-4.ª: 93,817 / 93,815 / 93,815 (todas Leganés) |
| % del óptimo de Pinto | 68,2 % | **68,4 %** (64,15 / 93,82) |
| Óptimo de toda la Comunidad | no calculado | **Madrid, sección 2807913014 (40,37746 / -3,68014): N = 94,00** (tope); mejoran 2.259 secciones; ~630 secciones empatan en el tope |
| Cobeña (ejemplo del absurdo) | +8.506 mayores | N = 27,28 de 94 plazas (46 secciones mejoran) |
| Voraz n = 3, zona 04 | no calculado | Leganés 2807405017 (93,82) -> Getafe 2806504029 (93,78) -> Leganés 2807405003 (93,77); acumulado 281,37 |
| Voraz n = 3, Comunidad | no calculado | Madrid 2807913014, 2807913028 y 2807913026 (94 + 94 + 94 = 282) |

  Con el umbral IMSERSO España (4,05) el óptimo del sur es Getafe 2806504029 (93,78) y Pinto logra N = 63,39 (67,6 %); con IMSERSO Madrid (4,21) es Leganés 2807405017 (93,93) y Pinto 64,63 (68,8 %); con la mediana (3,3645), Getafe 2806504039 (90,52) y Pinto 55,20 (61,0 %). Todo en `referencia.json` (`por_referencia`).
- **Ranking por plazas que faltan** (caso 6, nuevo): Madrid 5.864,08; Leganés 900,05; Móstoles 880,90; Getafe 702,59; Alcorcón 585,50 (en la zona 04: Leganés, Móstoles, Getafe, Alcorcón y Fuenlabrada 376,26).
- **Servicios por distancia: no cambian** (siguen siendo «personas que ganan acceso»; casos 1, 2 y el centro de salud del caso 5 idénticos a antes).

## 4. `referencia.json`: claves para el motor de TypeScript
`version: 2`. Cambios respecto a la versión 1:
- `caso3`: nuevas `umbrales` (`media`, `mediana`, `imserso_espana`, `imserso_madrid`) y `plazas_faltan` (F con cada una). `personas` y el resto no cambian.
- `caso4` (zona 04) y **`caso4b` (toda la Comunidad)**: desaparecen `ganan`, `deficit_antes` y `deficit_despues`; aparecen `reduce_faltan` (N), `secciones_que_mejoran`, `faltan_antes`, `faltan_despues`, `pct_del_maximo_posible` (= 100·N/plazas), `zona_candidatos` (`"04"` / `null`; `zona` es ahora la de la sección elegida), `referencia`, `umbral`, `alternativas` (2.ª-4.ª con su N) y **`por_referencia`** (el óptimo con cada uno de los 4 umbrales).
- `caso5.residencia`: desaparecen `ganan`, `secciones_que_ganan`, `deficit_*`; aparecen `reduce_faltan`, `secciones_que_mejoran`, `faltan_antes`, `faltan_despues`, `pct_del_maximo_posible`, `pct_del_optimo_zona_04` y `por_referencia` (lo mismo para los 4 umbrales). `caso5.centro_salud` no cambia.
- `caso6`: nuevas `por_plazas_faltan` y `zona_04_por_plazas_faltan` (`lugar`, `nombre`, `objetivo`, `plazas_faltan`; orden: plazas_faltan descendente y `lugar`). `por_pct`, `por_personas` y `zona_04_por_personas` no cambian.
- **`caso7` (nuevo):** voraz n = 3 con 94 plazas y la media: `zona_04` y `comunidad`, cada uno con 3 pasos (`seccion`, `lat`, `lon`, `reduce_faltan`, `acumulado`). Regla: tras cada centro se suma `100·r_nuevo` a `A` en su radio, **una sección ya elegida no se repite**, y se para si N redondeado a 1e-6 es 0.

**Para que TypeScript case exactamente:** (1) `plazasFaltan` por sección = `objetivo · max(0, umbral − A)/100`, con el umbral fijo del modo elegido; (2) N = suma sobre las secciones del radio de `objetivo · (max(0, U−A) − max(0, U−A−100·r_nuevo))/100`; (3) el óptimo ordena por N (redondeo a 1e-6), luego por plazas que faltan dentro del radio del candidato (redondeo a 1e-6), luego por índice; (4) `optimo` con `n > 1` excluye las secciones ya elegidas y para si N ≤ 0; (5) tolerancia en el contraste: N con `1e-5` absoluto, secciones iguales (o una alternativa con el mismo N); (6) `simular` con plazas debe devolver `reduce` (N) además de `rNuevo`; `ganan` queda solo para servicios por distancia.


---

# R1 (18-nov-2026): privacidad, DEA apilados y licencia del IGN

Cambios hechos tras la revisión R1. Regenerado con `uv run --project pipeline python -m donde.construir --salida public/donde` (con la caché). Solo cambian `servicios/otros_sociales.json` y `servicios/dea.json`; el resto de ficheros de `public/donde/` sale byte a byte igual, y las cifras clave no se mueven (7.113.886 hab., 65+ 1.342.648, 4.518 secciones, residencias: faltan 10.689 plazas con la media, 2030: 16.280; `referencia.json` y el fixture del cruce TS-Python salen idénticos).

## I1. Centros sociales sensibles
- **Problema:** `otros_sociales.json` publicaba el nombre y la coordenada exacta de centros como casas de acogida de mujeres maltratadas, de menores, pisos tutelados... La web solo cuenta centros por sector (`otrosSocialesDe`) y usa lat/lon para saber el municipio o distrito.
- **Qué se hizo (`pipeline/donde/servicios.py`):**
  1. `otros_sociales.json` **ya no lleva la columna `nombres`**. `validarCentros` (`src/lib/donde/cargar.ts`) la rellena con vacíos si falta (test: `src/lib/donde/cargar.test.ts`).
  2. Los centros **sensibles** pasan de su coordenada exacta al **punto interior de su sección censal** (el mismo `representative_point` que publica `secciones.json`): el municipio y el distrito siguen siendo exactos porque una sección pertenece a un solo distrito. El JSON lo declara (`ubicacion_generalizada`: 1.067 de 1.875 centros, y `ubicacion_generalizada_nota`). La posición puede moverse hasta unos 7 km en secciones rurales muy grandes (nunca de municipio).
- **Criterio (prudente, `es_sensible`):** se generaliza si el centro es de tipo «CENTROS DE ACOGIDA» o «CENTROS RESIDENCIALES», o de subtipo «PISOS TUTELADOS», «VIVIENDAS COMUNITARIAS» u «OTRAS RESIDENCIAS», o de sector Mujer, Presos y ex reclusos, Refugiados y asilados, Personas sin hogar, Inmigración, Infancia, Adolescencia, Familia, Colectivos en situación de necesidad u Otros grupos en situación de necesidad (cubre adicciones, que el registro agrupa en «otros grupos»). Revisadas todas las combinaciones sector/tipo/subtipo del registro. Siguen con coordenada exacta (y sin nombre) los centros de día, ocupacionales y de rehabilitación de mayores, discapacidad y enfermedad mental, y los hogares y clubes de mayores.
- **Residencias de mayores (`residencia.json`):** conservan nombre y ubicación exacta (son centros públicos de atención al público y el modelo de plazas necesita su punto). Entre ellas hay 17 pisos tutelados o viviendas comunitarias de mayores (10 son apartamentos de 2 plazas de un mismo operador): decisión abierta para Guillermo si quiere generalizarlos también (cambiaría ligeramente las cifras de plazas por distancia).
- **Test:** `pipeline/tests/test_donde_salidas.py::test_otros_sociales_sin_nombres_y_sensibles_con_punto_de_seccion` (sin nombres; todo centro sensible está exactamente en el punto de una sección y en su municipio) y 4 tests unitarios en `test_donde_servicios.py`.
- **T3 (F-4), 18-nov:** los `ids` de `otros_sociales.json` pasan a ser opacos (`s0001`…). Con el número de registro se podía buscar en el CKAN la dirección exacta de un centro generalizado. La web solo los usa para contar. Queda un resto, que se acepta porque el registro ya es público: 114 centros sensibles comparten coordenada con otro centro que sí se publica exacto.

## I2. DEA apilados
- **Problema:** 2.200 DEA tienen la misma coordenada (40,40012, -3,67523; «CALLE del Cerro de la Plata 4», Retiro) y 573 + 192 están en dos puntos de Chamartín. Son equipos móviles dados de alta en una sede, no desfibriladores fijos en ese sitio. En «Mi municipio», Retiro salía con 50 habitantes por DEA.
- **Distribución de DEA por punto exacto** (8.992 puntos): 8.188 puntos con 1, 544 con 2, 123 con 3, 57 con 4, y una cola que decae despacio (de 26 a 5 DEA: 53 puntos con más de 5; 28 con más de 10; 12 con más de 20), hasta un salto claro: 32, 65, 73, 192, 573 y 2.200.
- **Umbral: más de 30 DEA en el mismo punto** (`UMBRAL_DEA_APILADOS`). Por debajo la cola (26, 26, 23, 23, 22, 21... en centros de trabajo de más de 250 personas, aeropuerto o estadios) es plausible como equipos fijos de una gran instalación; por encima (32 en adelante, hasta 2.200) no. Con 20 en vez de 30 solo se agruparían 6 puntos más (141 equipos): conclusión idéntica.
- **Qué se hizo (`agrupar_apilados`):** 6 puntos agrupados en 6 registros (3.135 equipos). `dea.json` pasa de 13.680 a **10.551 registros**; guarda `equipos` (cuántos hay en cada registro; suma 13.680) y `dea_apilados` (umbral, puntos, equipos agrupados, registros antes/después y la lista de los 6 grupos con su municipio y coordenada).
- **Efecto:** la cobertura por distancia no cambia (el punto sigue ahí). Habitantes por DEA: Retiro 50 -> 666 (la mediana de los 21 distritos es 600; rango 231-1.794), Chamartín 126 -> 365. Total de la Comunidad: 7.113.886 / 13.680 = 520 antes; 674 después con los registros agrupados.
- **Test:** `test_dea_apilados_agrupados_y_declarados` y `test_agrupar_apilados_por_encima_del_umbral`. `referencia.json` y `cruce.fixture.json` no usan DEA: no cambian (comprobado regenerándolos y comparando byte a byte).

## I4. Licencia del IGN (nombres y puntos de municipios)
Leído el texto de la licencia (PDF, en español e inglés): **CC-BY 4.0** (Orden FOM/2807/2015; uso «libre y gratuito, siempre que se mencione el origen y propiedad de los datos»). Fuente de los datos: API OGC del IGN (`administrativeunit` y `nuc`), cuyo metadato enlaza a esa licencia. Como los puntos y nombres los tratamos nosotros, es una **obra derivada**: la licencia exige anteponer «Obra derivada de».
- **Frase de atribución a mostrar** (visible junto a los datos, legible, en créditos/pie del mapa): «**Obra derivada de Núcleos de población y Unidades administrativas (IGN-INE, 2025) CC-BY 4.0 ign.es**», con enlace a https://www.ign.es. Fórmula general de la licencia: «Obra derivada de <identificador> <fecha> CC-BY 4.0 <atribución de productores>». Forma abreviada solo por espacio: «CC-BY 4.0 ign.es 2025».
- El identificador y la fecha exactos están en la tabla del Sistema Cartográfico Nacional (https://www.scne.es/productos.php); no se pudo consultar (requiere JavaScript). Dudas: consulta@cnig.es.

## Texto corto para la Metodología (cómo debe salir en la web)
- **Servicios sociales (I1):** «Los centros de acogida, pisos tutelados, viviendas comunitarias y otros servicios para personas en situación vulnerable (mujeres víctimas de violencia, menores, personas sin hogar, refugiadas...) no se muestran con su dirección ni su nombre: solo los contamos por municipio y distrito, y su punto en el mapa es el centro de su sección censal. Las residencias de mayores sí aparecen con su ubicación, porque son servicios abiertos al público.»
- **Desfibriladores (I2):** «En el registro de la Comunidad hay 13.680 desfibriladores, pero 3.135 están dados de alta en solo 6 direcciones (2.200 en una calle de Retiro): son equipos móviles registrados en una sede. Para que no distorsionen los ratios, contamos cada una de esas 6 direcciones como un solo punto (10.551 puntos en total). La cobertura por distancia no cambia.»
- **Licencia del IGN:** «Obra derivada de Núcleos de población y Unidades administrativas (IGN-INE, 2025) CC-BY 4.0 ign.es».

## Agente con IA: coste real medido (20-nov-2026)
Prueba de humo en local (`npm run dev`) con la API de Meta (`muse-spark-1.3`, `reasoning_effort: low`, prompt `agente-v3`), 3 preguntas, las 3 en modo IA y con validación `ok`:

| Pregunta | Herramientas | Llamadas al modelo | Tokens entrada / salida (razonamiento) | Coste | Tiempo |
|---|---|---|---|---|---|
| ¿Dónde pondrías una residencia en el sur? | `ubicacion_optima` | 2 | 4.643 / 1.205 (977) | 0,0109 $ | 17,5 s |
| ¿Qué le falta a Fuenlabrada? | `ficha_municipio`, `mover_mapa` | 2 | 5.778 / 1.458 (1.166) | 0,0134 $ | 15,6 s |
| ¿Y si pongo un centro de salud en Pinto…? | `simular_centro` | 2 | 4.643 / 865 (636) | 0,0095 $ | 10,8 s |

**Media: 0,011 $ por pregunta** (lo estimado en I2 era ≈ 0,01 $). Con el tope de 3 $/día caben unas 270 preguntas; con los 150 $ de créditos de Meta, unas 13.000. Precio usado: 1,25 / 4,25 $ por millón de tokens (dev.meta.ai). Tiempo de 11 a 20 s por respuesta (I3: 11,6 s de media y 19,5 s de máximo; límite del turno, 26 s). Alguna respuesta aislada pasa del límite y sale con la plantilla sin IA.
