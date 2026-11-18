# Plan: «¿Dónde hace falta?» (DATAMAD 2026)

Fecha: 18-nov-2026 (miércoles). Formulario de preselección: 20-nov (solo texto, ya redactado en `../resumen-formulario-inversion.md`, 97 palabras). **Demo funcionando: 25-nov.** Final: 26-nov (jueves, URJC Vicálvaro; entrega antes de las 14:00, 5 min + 5 min).
Este plan sustituye a `PLAN.md` en todo lo que no sea el aire. El pipeline del aire (`pipeline/alergia/`, `datos.yml`, rama `datos`) se queda tal cual.

## Objetivo
Una web con dos apartados que cruzan los registros oficiales de la Comunidad con la población por edad: **«¿Dónde hace falta?»** (para quien decide: mapa de déficit por servicio, ranking, «tú decides» frente a la ubicación óptima del modelo y un agente de IA que calcula y mueve el mapa) y **«Mi municipio»** (para el ciudadano: qué servicios tiene su municipio o distrito, cuáles le faltan frente a la media y cómo está hoy el aire).
**Fuera de alcance:** tiempos en transporte público (CRTM-LDA, extra posterior), distancia por carretera real, suelo disponible y coste de construcción, listas de espera, separar plazas públicas y privadas dentro de un centro, cuentas de usuario, app nativa, polen y «¿Salimos?» (solo queda el aire de hoy dentro de Mi municipio).

## Contexto técnico
- **Stack (sin cambios):** web con Vite 8 + React 19 + TypeScript + MapLibre 6 (estilo positron de OpenFreeMap con respaldo ráster); pipeline en Python 3.12 con `uv`; despliegue en Vercel (web + funciones en `api/`). Sin base de datos: todo son JSON estáticos en `public/donde/`.
- **Comandos:** `npm run dev` · `npm test` · `npm run build` · `uv run --project pipeline pytest` · `uv run --project pipeline python -m donde.construir --salida public/donde` (nuevo) · `uv run --project pipeline python -m donde.referencia` (nuevo) · `vercel dev` (web + `/api/agente` en local).
- **Patrones que hay que imitar:**
  - Pipeline estático: `pipeline/estatico/construir_colegios.py` (descarga del CKAN con `alergia.ckan`, UTM 25830 → WGS84 con `pyproj`, código de municipio de la Comunidad → INE con `municipio_comunidad_madrid`, JSON compacto y test con recorte real en `pipeline/tests/datos/`).
  - Mapa: `src/lib/estiloMapa.ts` (`cargarEstiloBase`, `PALETA_MAPA`, `ESTILO_RASTER`) y la interfaz `MapaRef.volarA` de `src/componentes/Mapa.tsx`.
  - Estado en la URL: `src/lib/vista.ts` (`vistaDeLaUrl`, `busquedaConVista`). Pestañas accesibles: `src/componentes/Pestanas.tsx`.
  - Aire de un lugar: `src/lib/evaluar.ts` (`evaluarLugar`), `src/lib/datos.ts` (`cargarEstado`, `cargarPronostico`, respaldo), `src/componentes/Respuesta.tsx` y `FranjaHoras.tsx`.
  - Búsqueda de lugares sin tildes: `src/lib/texto.ts` (`sinTildes`) y `alias` de `datos-estaticos/lugares.json`.
  - Cliente de IA con tope diario: `apps/meta-hackathon/dockclerk/src/lib/ai/client.ts` (función `chat`, proveedor `agent` de Baseten, precio 1,25 / 4,25 $ por millón de tokens) y `budget.ts` (usa Prisma: **aquí hay que sustituir el contador por uno en memoria**, ver la sección IA).
- **Antes de tocar código (bloqueante, decide Guillermo):** el trabajo de «¿Salimos?» está sin commit (último commit `24d3097`). La tarea F1 borra componentes. Hay que guardarlo antes: un commit local en una rama `salimos`, sin push, o una copia de la carpeta. Sin su permiso, F1 no empieza.

### Comprobado hoy (18-nov, con curl contra el CKAN)
- **Población 2025 por edad y municipio:** `poblacion_censada_por_edad_nacionalidad_y_sexo` (CC BY, censo anual del INE a 1 de enero, años 2021-2025, CSV `;` UTF-8 con BOM de 15,6 MB). 179 municipios + 11 «Zonas Estadísticas», tramos de 5 años (de «De 0-4 años» a «De 100 y más años»). Código de 4 cifras (INE de 3 cifras + dígito de control: `0014` = La Acebeda; `0796` = Madrid). Total de 2025: **7.113.886**; 65 años o más: **1.342.648**; 80 o más: **409.051** (cálculo propio sumando tramos).
- **Ojo:** `residentes_por_rango_edad` (el que se citaba) suma **6.507.184** habitantes, que parece la cifra del padrón de 2017. **No se usa para los totales.** Solo vale por su desglose de Madrid capital: 21 distritos y 128 barrios por edad.
- `municipio_comunidad_madrid` trae `nuts4_codigo` y `nuts4_nombre`, las 11 zonas estadísticas («Sur Metropolitano», 1.384.746 hab.; «Este Metropolitano»; «Sierra Norte»…). Es lo que resuelve «en el sur».
- `secciones_censales`: 4.417 secciones (2.443 en la capital); el CSV trae `seccion_codigo`, `distrito_codigo`, `municipio_codigo` y `superficie_km2`, y hay un SHP de 9 MB. **No trae población.**
- `barrios_municipio_madrid`: 128 barrios con superficie y densidad (población = superficie × densidad), sin geometría.
- `atencion_social_registro_centros`: 2.633 centros, 85 sin coordenadas. Personas mayores: 518 centros residenciales (57.890 plazas) y 553 centros de día (71.990 plazas, mediana de 63 por centro). Índice propio: **4,31 plazas de residencia por cada 100 personas de 65 años o más** en la Comunidad.
- `atencion_social_registro_centros` también trae `direccion_distrito` (distritos de la capital y nombres de otros municipios mezclados). No sirve como clave: el distrito se asigna por geometría.

## Decisiones clave (cada una con su porqué)
1. **Unidad de demanda: la sección censal** (4.417, unas 1.600 personas cada una), con municipio, distrito de la capital y zona estadística como niveles de agregado. Con el municipio solo, colocar un centro en Alcalá daría «200.000 vecinos ganan acceso» de golpe, y el simulador no tendría sentido.
   - **Fuente de población por sección (se verifica en D1 antes de las 14:00 del 19-nov):**
     1. INE, población por sección censal del censo anual o del padrón continuo, a ser posible con edad.
     2. INE, Atlas de Distribución de Renta de los Hogares (ADRH), indicadores demográficos por sección (población, % de 65 o más, % de menores de 18).
     - Si la sección solo trae el total (o el total y el % de 65 o más), los demás grupos de edad se reparten con la estructura por edad de su municipio (censo de 2025). Se declara.
   - **Plan B, si D1 no encuentra nada utilizable:** demanda en 179 municipios + 21 distritos de la capital (200 puntos). El simulador se presenta como «a escala municipal» y se avisa en la pantalla.
   - **Limitación declarada:** la población de cada sección se coloca en un punto interior de su polígono (`point_on_surface`). En secciones rurales grandes (más de 5 km²) el error puede ser de varios kilómetros.
2. **Distancia en línea recta, no por carretera.** Es lo único que se puede recalcular al momento cuando el usuario coloca un punto en cualquier sitio: una matriz por carretera solo sirve para puntos precalculados y obliga a montar OSRM. Se declara en la pantalla («en línea recta; por carretera suele ser más») y en la metodología. Opcional (P2): medir el desvío real con 200 pares de OSRM y publicar la mediana carretera/recta como dato, sin usarla para corregir.
3. **Dos métricas, según el servicio:**
   - **Servicios sin plazas** (centro de salud o consultorio, hospital, farmacia, colegio, desfibrilador): distancia de cada sección al centro más cercano. Tiene déficit si está a más del radio `R`. Indicador: personas del grupo objetivo a más de `R`.
   - **Servicios con plazas** (residencia y centro de día de mayores): accesibilidad por área de captación flotante en dos pasos (2SFCA, Luo y Wang, 2003). Para cada centro j, `r_j = plazas_j / población objetivo a menos de d0`; para cada sección i, `A_i = 100 × Σ r_j` de los centros a menos de d0 = **«plazas a menos de d0 por cada 100 mayores»**. Hay déficit si `A_i` está por debajo de la media de la Comunidad. Con este método, la media ponderada por población coincide con plazas totales / población objetivo (4,31 en residencias). Por qué: las residencias atraen a gente de otros municipios, y el ratio municipal engaña (66 municipios no tienen plazas pero tienen una al lado). Además, añadir un centro solo suma `r_nuevo` a las secciones de su radio, así que se recalcula en O(N).
4. **«Ganan acceso»** = personas del grupo objetivo cuyas secciones pasan de déficit a sin déficit. Es la misma definición para el mapa, el ranking, el simulador, el óptimo y el agente.
5. **Óptimo: algoritmo voraz de máxima cobertura** (MCLP, Church y ReVelle, 1974). Candidatos: centroides de las secciones con población objetivo mayor que 0, filtrados por zona si se pide. En cada paso se elige el candidato que más vecinos hace ganar y se actualiza el déficit. Con n = 1 es exacto sobre los candidatos; con n > 1 garantiza al menos el 63 % del óptimo (1 − 1/e). Explicable en una frase y rápido.
6. **Un solo motor de cálculo en TypeScript** (`src/lib/donde/`, sin DOM ni `import.meta.env`): lo usan la web (dentro de un Web Worker para el óptimo) y la función `api/agente.ts`. El pipeline en Python solo prepara los datos. Así la web y el agente no pueden dar cifras distintas. Para comprobar el motor, el pipeline genera aparte, en Python, unas cifras de referencia (`referencia.json`) con las que se contrastan los tests de TypeScript.
7. **Proyección plana local** en TypeScript y en Python: `x = 6371008,8 · rad(lon) · cos(rad(40,42))`, `y = 6371008,8 · rad(lat)`, en metros. El error es menor del 1 % en toda la Comunidad, no hace falta `proj4` en la web y el clic del mapa (lat/lon) entra directo.
8. **Agente con dos modos.** Con IA: Muse Spark Open en Baseten, créditos del Meta Hackathon y tope diario. **Sin IA:** un intérprete de intenciones por palabras clave que llama a las mismas herramientas en el navegador. La demo del 26 no puede depender de una clave, de la wifi ni del *tool calling*.
9. **Mapa nuevo (`MapaDonde`) en lugar de adaptar `Mapa.tsx`**, que está atado al aire (estaciones, captadores, partículas). Se reaprovechan el estilo, la paleta, el respaldo ráster y `volarA`.
10. **Radios por defecto con criterio propio, declarado y ajustable** (3 opciones por servicio). No hay ninguna norma que fije distancias a estos servicios, salvo la referencia de 30 minutos del RD 137/1984 para la cabecera de la zona de salud.

## Referencias oficiales para los ratios
| Servicio | Referencia | Estado | Uso en la app |
|---|---|---|---|
| Farmacia | Ley 13/2022 de Ordenación y Atención Farmacéutica de la Comunidad de Madrid, art. 23.3: «módulo poblacional de 3.000 habitantes» para autorizar una oficina nueva (art. 23.4: otra más por cada fracción de más de 2.000; art. 23.6: 250 m entre farmacias). https://www.boe.es/eli/es-md/l/2022/12/21/13 | **Verificado hoy** en el BOE. La Ley 19/1998 está derogada | Línea de referencia: «más de 3.000 hab. por farmacia». Aviso: la ley aplica el módulo por zona farmacéutica, no por municipio |
| Centro de salud | RD 137/1984 de Estructuras Básicas de Salud, art. 1.2: una zona de salud «podrá oscilar entre 5.000 y 25.000 habitantes»; art. 1.3: cabecera a no más de 30 minutos «con los medios habituales de locomoción». https://www.boe.es/buscar/act.php?id=BOE-A-1984-2574 | **Verificado hoy** en el BOE | Línea de referencia: «más de 25.000 hab. por centro de salud». Los consultorios no cuentan para el ratio, sí para la distancia. Aviso: la norma es por zona, no por municipio |
| Residencia de mayores | IMSERSO, informe «Servicios sociales dirigidos a las personas mayores en España» (índice de cobertura de plazas residenciales por cada 100 mayores de 65, por comunidad autónoma) | **Por verificar en D1** (año, cifra de Madrid y de España, y si cuenta las mismas plazas) | Si se verifica: línea de referencia «media de España». La cifra de «5 plazas por cada 100 mayores de 65 (OMS)» que circula **no tiene un documento primario conocido: no se usa** |
| Centro de día | El mismo informe del IMSERSO (cobertura de centros de día) | Por verificar en D1 | Igual que la residencia |
| Hospital, colegio y desfibrilador | No hay ratio oficial verificable. Decreto 78/2017 de la Comunidad sobre desfibriladores (obligaciones por tipo de local, no por población): solo se cita si D1 lo confirma | Sin referencia | **Comparación con la media de la Comunidad y con municipios de tamaño parecido**, y se dice así en la pantalla |

Regla: ninguna cifra de referencia entra en la app sin la URL de la norma o del informe en `DATOS-DONDE.md`. Si no se puede verificar, se compara con la media y se dice.

## Servicios (catálogo `servicios.ts`, fuente única para la web y el agente)
| id | Nombre en la app | Fuente y filtro | Grupo objetivo | Métrica | Radio por defecto (opciones) | Plazas por defecto al simular |
|---|---|---|---|---|---|---|
| `centro_salud` | Centro de salud o consultorio | sanitarios: `centro_tipo` ∈ {«Centro de salud», «Consultorio de atención primaria»}; un registro por `centro_nro_registro` | total | distancia | 2 km (1 / 2 / 5) | - |
| `hospital` | Hospital general público | sanitarios: «Hospital general» con `dependecia_funcional` pública (los valores exactos los lista D3) | total | distancia | 15 km (10 / 15 / 25) | - |
| `residencia` | Residencia de mayores | sociales: sector «Personas mayores», tipo «CENTROS RESIDENCIALES» | 65 o más | plazas (2SFCA) | d0 = 10 km (5 / 10 / 20) | 94 (mediana) |
| `centro_dia` | Centro de día de mayores | sociales: «Personas mayores», «CENTROS DE DÍA» | 65 o más | plazas (2SFCA) | d0 = 5 km (3 / 5 / 10) | 63 (mediana) |
| `farmacia` | Farmacia | `oficinas_farmacia` (sin `TITULARES_NOMBRE`) | total | distancia | 1 km (0,5 / 1 / 2) | - |
| `colegio` | Colegio de Infantil y Primaria | `datos-estaticos/colegios.json` con etapas `I` o `P` y titularidad `pu` o `co` | 3 a 11 años (3/5 de 0-4 + 5-9 + 2/5 de 10-14, reparto uniforme dentro del tramo, declarado) | distancia | 1,5 km (1 / 1,5 / 3) | - |
| `dea` | Desfibrilador | `desfibriladores_externos_fuera_ambito_sanitario` | total | distancia | 500 m (300 / 500 / 1.000) | - |
| (solo lista) | Otros servicios sociales con plazas | sociales: resto de sectores (discapacidad, salud mental, infancia, sin hogar…) | - | ninguna | - | - |

«Otros servicios sociales» sale solo como lista y recuento en Mi municipio. No hay población objetivo fiable por municipio para la mayoría de esos sectores, y un déficit inventado restaría credibilidad.

## Modelo de datos (JSON en `public/donde/`, los escribe el pipeline y se versionan en `main`)
Todos llevan `version: 1`, `generado` (fecha), `fuentes` ({conjunto: URL + licencia}) y coordenadas en WGS84 con 5 decimales. Los arrays son por columnas para que pesen poco.

### `secciones.json` (< 600 kB)
```json
{"version":1,"generado":"2026-11-19","anio_poblacion":2025,"fuente_poblacion":"…","metodo_edades":"directo|estructura_municipal",
 "ids":["2800101001","…"], "mun":["mun:28001","…"], "distrito":[null,"dis:2807901","…"], "barrio":[null,"…"],
 "zona":["06","…"], "lat":[41.08685,…], "lon":[-3.62479,…], "area_km2":[21.86,…],
 "pob":{"total":[55,…],"3_11":[2,…],"65_mas":[20,…],"80_mas":[7,…]}}
```
- `ids` = código INE de 10 cifras (28 + municipio de 3 + distrito de 2 + sección de 3). `zona` = `nuts4_codigo`. `distrito` solo en la capital. `barrio` solo si se hace D5.
- Restricciones: la suma de `pob.total` = población del censo de 2025 ±0,5 %; ninguna población negativa; todos los arrays con la misma longitud.

### `secciones.geojson` (< 3 MB sin comprimir)
Polígonos simplificados (tolerancia de unos 20 m, `shapely.simplify` con `preserve_topology`) con la única propiedad `id`. MapLibre los usa con `promoteId: "id"` y `setFeatureState` para colorear sin recargar.

### `territorios.json`
- `municipios[]`: {id `mun:28xxx`, nombre, zona, tramo de tamaño, poblacion, lat, lon, bbox}.
- `distritos[]`: {id `dis:28079NN`, nombre, poblacion, lat, lon, bbox}.
- `zonas[]`: {codigo, nombre, alias[] (p. ej. «sur» → 04, «sudeste» → 08, «sudoeste» → 09, «sierra» → 06, 10, 11)}.
- `municipios_geo` / `distritos_geo`: contornos disueltos a partir de las secciones (mismo origen CC BY, sin depender del IGN).
- Tramos de tamaño (los del INE): `<2.000`, `2.000-10.000`, `10.001-50.000`, `50.001-100.000`, `>100.000`.

### `servicios/<id>.json` (uno por servicio; se cargan al elegirlo)
```json
{"version":1,"servicio":"residencia","generado":"…","fuente":"https://datos.comunidad.madrid/catalogo/dataset/atencion_social_registro_centros (CC BY 4.0)",
 "actualizado_fuente":"2026-11-15","descartados_sin_coordenadas":18,
 "ids":["…"],"nombres":["…"],"mun":["mun:28…"],"lat":[…],"lon":[…],"plazas":[94,…],"titularidad":["publica"|"privada"|"concertada"|null]}
```
`plazas` solo en los servicios con plazas. `servicios/otros_sociales.json` añade `sector` y `tipo`.
**Columnas prohibidas** (datos personales): `TITULARES_NOMBRE`, `contacto_telefono`, `contacto_correo`, `entidad_nif` y `NIF`. Las comprueba un test.

### `referencia.json` (lo genera `donde.referencia` en Python, con su propio código, sin usar el de TypeScript)
6 casos con su resultado:
1. personas a más de 2 km de un centro de salud en la Comunidad;
2. personas a más de 1 km de una farmacia;
3. mayores de 65 en secciones por debajo de la media de residencias (d0 = 10 km);
4. el óptimo voraz con n = 1 para una residencia de 94 plazas en la zona 04 (lat, lon, ganan);
5. lo que gana un centro de salud colocado en un punto fijo;
6. el ranking de los 5 primeros municipios en residencias.

Es el contraste de los tests de TypeScript.

### Lo que NO cambia
`datos-estaticos/lugares.json` (se sigue usando para el aire de Mi municipio), `umbrales.json`, `rejilla_viento.json`, `colegios.json` (fuente del servicio `colegio`), el esquema y la rama `datos`.

## Motor de cálculo (`src/lib/donde/`, TypeScript puro)
| Archivo | Exporta |
|---|---|
| `tipos.ts` | `ServicioId`, `Secciones`, `Centros`, `Territorios`, `EstadoServicio`, `Accion` |
| `servicios.ts` | Catálogo de la tabla de servicios (nombre, sinónimos para el intérprete, grupo, métrica, radios, plazas por defecto, referencia oficial con URL o `null`) |
| `geo.ts` | `proyectar(lat, lon): [x, y]`, `distancia2`, `RejillaEspacial` (celdas de 1 km; `vecinos(x, y, r)`) |
| `cobertura.ts` | `calcularEstado(servicio, secciones, centros, {radio_m}) → EstadoServicio` = `{valor: Float64Array` (metros o A_i), `deficit: Uint8Array, umbral, totalObjetivo, totalDeficit}`; `simular(estado, {lat, lon, plazas?}) → {ganan, secciones: number[], municipio, distancia_media_antes/despues?}`; `optimo(estado, {n: 1-3, zona?, municipio?, plazas?}) → {puntos: [{lat, lon, seccion, municipio, ganan, acumulado}], deficitAntes, deficitDespues}` |
| `agregados.ts` | `ranking(estado, {nivel: "municipio"|"distrito", zona?, orden: "pct"|"personas", limite}) → filas`; `fichaLugar(lugarId, estados) → {servicios: [{id, n, ratio, media_comunidad, mediana_tramo, pct_deficit, comparacion: "por_debajo"|"en_la_media"|"por_encima", referencia?}], faltan: ServicioId[]}`. Comparación: por debajo si es menor de 0,8 × la referencia del grupo; por encima si es mayor de 1,2× (criterio propio, declarado) |
| `lugares.ts` | `resolverLugar(texto) → {tipo: "municipio"|"distrito"|"zona", id, nombre, lat, lon, bbox} | {sugerencias}` (con `sinTildes` y alias) |
| `herramientas.ts` | Las 5 herramientas del agente como funciones puras (ver IA); las usan `api/agente.ts` y el modo sin IA |
| `intencion.ts` | Intérprete del modo sin IA: texto → lista de llamadas a herramientas + plantilla de respuesta |
| `cargar.ts` | `cargarDatosWeb()` (fetch a `/donde/…`) y `cargarDatosNode(dir)` (fs); devuelven el mismo objeto |

- **Rendimiento (objetivos, con test):** `calcularEstado` del desfibrilador (13.680 centros × 4.417 secciones con rejilla) en menos de 300 ms; `simular` en menos de 10 ms (O(N) sobre las secciones del radio); `optimo` con n = 3 para el hospital (el peor caso, radio de 15 km) en menos de 800 ms en Node. En la web, `optimo` va en `src/workers/optimo.worker.ts` para no bloquear el mapa.
- **2SFCA al simular:** `r_nuevo = plazas / población objetivo a menos de d0 del punto` (incluida la sección del propio punto); se suma `100 × r_nuevo` a `A_i` de esas secciones y se recalcula el déficit. El umbral (la media de la Comunidad) se mantiene fijo en el estado actual: así «ganan» se compara siempre contra la misma vara.

## Contrato API
### `POST /api/agente` (función de Vercel, Node, `maxDuration` de 30 s)
- **Auth:** ninguna (datos públicos). Límites: 10 preguntas por IP y día (mapa en memoria, orientativo), tope global de gasto diario e interruptor.
- **Petición:**
```json
{"mensajes":[{"rol":"usuario"|"asistente","texto":"¿Dónde pondrías una residencia en el sur?"}],
 "contexto":{"vista":"donde"|"municipio","servicio":"residencia"|null,"radio_m":10000|null,"lugar":"mun:28065"|null}}
```
- **Respuesta 200:**
```json
{"texto":"…","acciones":[Accion],"pasos":[{"herramienta":"ubicacion_optima","entrada":{…},"resumen":"1 punto en Parla, +2.140 mayores"}],
 "modo":"ia","restantes":7}
```
- **`Accion`** (la web las ejecuta en orden):
  - `{"tipo":"elegir_servicio","servicio":"residencia","radio_m":10000}`
  - `{"tipo":"mover_mapa","lat":40.24,"lon":-3.77,"zoom":11,"lugar":"mun:28106"}` (o `"bbox":[…]`)
  - `{"tipo":"marcar_puntos","servicio":"residencia","origen":"optimo"|"simulacion","puntos":[{"lat":…,"lon":…,"etiqueta":"Opción 1","ganan":2140}]}`
  - `{"tipo":"mostrar_ranking","servicio":"residencia","zona":"04","nivel":"municipio","filas":[…]}` (filas rellenadas por el servidor)
  - `{"tipo":"abrir_ficha","lugar":"mun:28065"}` (cambia a Mi municipio)
- **Errores:**
  - 400 `{"error":"peticion"}`: sin mensajes, más de 12 mensajes, un texto de más de 500 caracteres o un servicio desconocido.
  - 429 `{"error":"limite","reinicio":"ISO"}`.
  - 503 `{"error":"agente_no_disponible","motivo":"sin_clave"|"apagado"|"presupuesto"|"proveedor"}`: **la web pasa sola al modo sin IA y repite la pregunta en local.**
  - 504 `{"error":"tiempo"}`: más de 25 s (la web también pasa al modo sin IA).
- Tipos de petición, respuesta y `Accion` en `src/lib/donde/tipos.ts`, compartidos por la web y la función. Validación a mano (sin zod, para no añadir dependencias), con tests.

No hay más endpoints: todos los datos son estáticos y se sirven desde `public/donde/`.

## IA
- **Dónde:** solo en el agente del apartado «¿Dónde hace falta?» (y el botón «Pregúntale» de Mi municipio). Los números salen siempre del motor determinista.
- **Por qué no bastan las reglas:** el usuario pregunta en lenguaje libre («¿y si en vez de en Parla la pongo en Pinto?», «¿qué pueblo de la sierra está peor en centros de salud?», «compara Getafe y Leganés») y quiere una explicación, no una tabla. El intérprete sin IA solo cubre 4 patrones; la IA encadena herramientas y explica el porqué.
- **Modelo:** Muse Spark Open en Baseten (`https://inference.baseten.co/v1`, API compatible con OpenAI). Id por variable `BASETEN_MODEL` con el valor por defecto `meta-models/muse-spark-open` (no el id `[HACKATHON]…-1026` de DockClerk, que puede desaparecer). `reasoning_effort: "low"` y `max_tokens` 1.500 (Muse siempre razona; con poco margen devuelve la respuesta vacía). Son datos públicos y no personales, así que no hay problema de privacidad.
  - **Alternativa si el *tool calling* falla en I2:** Claude Haiku (necesita una clave de console.anthropic.com, que el Plan Pro no cubre; decide Guillermo). Si no, se queda solo el modo sin IA.
- **Herramientas** (esquema JSON en `herramientas.ts`; `servicio` es un enum de los 7 ids; `zona` es texto libre que se resuelve con `resolverLugar`):

| Herramienta | Entrada | Salida (resumida) | Acciones que añade el servidor |
|---|---|---|---|
| `ranking_deficit` | `servicio`, `zona?`, `nivel?` (`municipio`/`distrito`), `orden?` (`pct`/`personas`), `limite?` 1-10 | `{criterio, umbral, filas: [{lugar, nombre, objetivo, en_deficit, pct, ratio?, media_comunidad}], fuente, fecha_datos}` | `elegir_servicio`, `mostrar_ranking`, `mover_mapa` (bbox de la zona) |
| `ubicacion_optima` | `servicio`, `zona?`, `n?` 1-3, `plazas?` | `{puntos: [{lat, lon, municipio, ganan, acumulado}], deficit_antes, deficit_despues, criterio}` | `elegir_servicio`, `marcar_puntos` (`optimo`), `mover_mapa` |
| `simular_centro` | `servicio`, `lugar?` (texto) o `lat`+`lon`, `plazas?` | `{ganan, municipio, comparado_con_optimo: {ganan_optimo, pct}}` (el óptimo se calcula en la misma zona estadística) | `marcar_puntos` (`simulacion`), `mover_mapa` |
| `ficha_municipio` | `lugar` | `{nombre, poblacion, servicios: […], faltan: […], aire_hoy?: {nivel, hora}}` | `abrir_ficha` |
| `mover_mapa` | `lugar` | `{ok, nombre}` | `mover_mapa` |

- **Bucle:** 5 vueltas como máximo; el servidor ejecuta las herramientas y acumula las acciones. El prompt de sistema fija lo siguiente: el papel (analista de servicios públicos que no opina de política y explica el criterio y sus límites: línea recta, plazas autorizadas, punto por sección), la fecha de los datos, el contexto de la pantalla, la norma de no escribir cifras que no vengan de una herramienta y el tono en español claro.
- **Validador** (`api/_lib/validador.ts`): cada número del `texto` (sin contar horas, años y las cifras que escribió el usuario) tiene que aparecer en los resultados de las herramientas de ese turno, con redondeo de ±1 y en formato español («2.140», «4,3»). Si no aparece, el texto se sustituye por una plantilla generada con los resultados. **La IA nunca escribe filas de tabla ni coordenadas.**
- **Tope de gasto:** el `budget.ts` de DockClerk depende de Prisma, así que en `api/_lib/presupuesto.ts` va un contador diario **en memoria** (por instancia; la limitación se declara) con `AI_DAILY_BUDGET_USD` (3 $ por defecto; 0 lo apaga) y el coste calculado con `usage` × precio. Además: `AGENTE_ACTIVO=0` apaga el agente; 10 preguntas por IP y día. El freno de fondo son los créditos prepagados de Baseten: **Guillermo tiene que comprobar en app.baseten.co si, al acabarse, se cobra a la tarjeta** y el saldo que queda. Opcional, si quiere un contador global: Upstash Redis gratis desde Vercel Marketplace.
- **Coste estimado (sin verificar; I2 lo mide):** unas 3 llamadas por pregunta × 5.000 tokens de entrada + 1.500 de salida con el razonamiento ≈ 0,025 $ por pregunta. 100 preguntas al día ≈ 2,5 $. Los 100 $ de Baseten dan para unas 4.000 preguntas.
- **Clave:** una nueva para este proyecto, creada por Guillermo en Baseten, que pega él en `.env.local` y en las variables de Vercel (`BASETEN_API_KEY`, `BASETEN_MODEL`, `AI_DAILY_BUDGET_USD`, `AGENTE_ACTIVO`). `.env.example` solo lleva los nombres. No se copia la de DockClerk.
- **Modo sin IA** (`intencion.ts`; funciona en el navegador, sin red ni clave):
  - **Servicio** por sinónimos: «residencia», «geriátrico», «centro de mayores»; «centro de salud», «ambulatorio», «consultorio», «médico»; «farmacia»; «colegio», «escuela»; «desfibrilador», «DEA»; «hospital»; «centro de día».
  - **Lugar o zona** con `resolverLugar` (sur, norte, este, oeste, sierra, capital o el nombre de un municipio o distrito).
  - **Intención:** «dónde pondrías / pon / falta» → `ubicacion_optima`; «qué municipios / peor / ranking» → `ranking_deficit`; «y si la pongo en X» → `simular_centro`; «mi municipio / qué tiene X» → `ficha_municipio`.
  - Si no entiende: «Prueba con: …» y las 4 preguntas sugeridas.
  - La respuesta lleva la etiqueta «Modo sin IA: respuesta calculada con reglas».
- **Revisión humana:** la IA no decide nada; propone y enseña el cálculo («pasos»), y el usuario ve el punto en el mapa y puede moverlo. Cada respuesta enseña sus pasos («He consultado: …»).
- **MCP (opcional, P2):** `mcp/servidor_donde.ts` con las mismas 5 herramientas para Claude Desktop, inspirado en el `servidor.py` del ponente (declarado). Suma poco a la nota; solo si sobra tiempo.

## Pantallas y flujo
Cabecera: «¿Dónde hace falta?» + «Comunidad de Madrid», pestañas **¿Dónde hace falta?** | **Mi municipio**, enlace a «Metodología y fuentes». Estado en la URL: `?vista=donde&servicio=residencia&radio=10000&zona=04&sim=40.24,-3.77` y `?vista=municipio&lugar=mun:28065`. Así cualquier pantalla de la demo se abre con un enlace.

### Apartado 1: «¿Dónde hace falta?»
- **Panel izquierdo** (en móvil, hoja inferior):
  1. Selector de servicio: 7 botones con icono; por defecto, `residencia`.
  2. Radio (3 opciones) con la frase del criterio («a más de 2 km en línea recta»).
  3. **Cifra grande:** «412.300 personas (5,8 %) viven a más de 2 km de un centro de salud». Para los servicios con plazas: «X mayores viven en zonas con menos plazas que la media (4,3 por cada 100)».
  4. Referencia oficial, si la hay, con enlace.
  5. Ranking de los 10 primeros municipios (o distritos), con filtro de zona y orden por % o por personas; al pulsar una fila, el mapa vuela allí.
- **Mapa:**
  - secciones coloreadas por la intensidad del déficit (población objetivo en déficit / km², en 4 clases, con la paleta clara de `PALETA_MAPA`; sin déficit, crema neutro; sin población, transparente);
  - centros existentes como puntos;
  - contornos de los municipios;
  - al pasar por encima de una sección: municipio, población objetivo y distancia o plazas.
- **Tú decides:**
  - botón «Coloca un centro»; el siguiente clic pone un marcador arrastrable;
  - panel de resultado en vivo (con 100 ms de retardo): «**+2.140 mayores** ganan acceso»;
  - botón «¿Y dónde lo pondría el modelo?»: segundo marcador y «el modelo consigue +3.050; tu ubicación logra el **70 %** del óptimo»;
  - las secciones que ganan se resaltan;
  - para los servicios con plazas, un control de plazas (de 25 a 200);
  - botón «Borrar».
- **Agente:** panel plegable a la derecha.
  - 4 preguntas sugeridas: «¿Dónde pondrías una residencia en el sur?», «¿Qué municipios de la sierra están peor en centros de salud?», «¿Y si la pongo en Pinto?», «¿Qué le falta a Parla?»;
  - mensajes, indicador de «calculando…» y lista de pasos;
  - distintivo «IA» o «Sin IA»;
  - contador de preguntas restantes.
- **Estados:**
  - carga: esqueleto del mapa y del panel (se reaprovecha `EsqueletoMapa`);
  - error al cargar `/donde/*.json`: mensaje y «Reintentar» (al ser del mismo origen, no hace falta respaldo);
  - servicio sin déficit en la zona: «En Sierra Norte nadie está a más de 2 km de una farmacia»;
  - clic fuera de la Comunidad: «Fuera de la Comunidad de Madrid»;
  - el óptimo está calculando: espera dentro del botón;
  - agente con 429/503/504: pasa al modo sin IA con un aviso.

### Apartado 2: «Mi municipio»
- **Buscador** (municipio o distrito de la capital; barrio solo si se hace D5) con sugerencias. Se recuerda en `localStorage` (se reaprovecha el patrón de `src/lib/perfil.ts`).
- **Ficha:**
  - nombre, población, zona y tramo de tamaño;
  - **una fila por servicio**: cuántos hay, el ratio (hab. por centro o plazas por cada 100 mayores), el % de vecinos en déficit y un semáforo frente a la media de la Comunidad y la mediana de su tramo de tamaño; cuando hay norma («Ley 13/2022: 1 farmacia por cada 3.000 hab.»), su referencia;
  - **«Lo que más le falta»**: los 2 servicios con más brecha relativa, cada uno con «Ver en el simulador», que abre el apartado 1 con ese servicio y el mapa encuadrado;
  - **«Otros servicios sociales»**: recuento por sector, sin semáforo.
- **Aire de hoy:** un bloque compacto con `evaluarLugar` + `Respuesta` en versión reducida (veredicto del aire para la población general, hora del dato y franja de 24 h con `FranjaHoras`). Para Madrid capital se mantiene el aviso de cobertura lejana. Si la capa está antigua, aviso ámbar con la hora (el cron no es horario: ver Riesgos).
- **Minimapa** del municipio con sus centros (la misma instancia de `MapaDonde` en modo ficha).
- **Estados:** sin lugar elegido (buscador + 3 ejemplos), lugar no encontrado (sugerencias) y aire no disponible (el bloque se oculta con una nota; la ficha sigue).

### Qué se reaprovecha y qué se quita del frontend
| Se queda | Se adapta | Se quita (con sus tests y su CSS) |
|---|---|---|
| `lib/datos.ts`, `evaluar.ts`, `riesgo.ts`, `umbrales.ts`, `formato.ts`, `texto.ts`, `tipos.ts`, `useMedia.ts`, `franja.ts`, `estiloMapa.ts`, `EsqueletoMapa`, `Iconos`, `estilos/base.css`, fuentes Newsreader y Public Sans | `App.tsx` (2 vistas nuevas), `vista.ts` (`"donde" | "municipio"` + parámetros), `Pestanas`, `Respuesta` y `FranjaHoras` (versión compacta para la ficha), `Leyenda` (clases de déficit), `perfil.ts` (solo el lugar), `index.html` (título y descripción), `package.json` (nombre y descripción) | `Colegios`, `Casos` y `casosTexto`, `BandaHistorica`, `SelectorFecha`, `SiAquiNo`, `SelectorPerfil`, `PanelLugar`, `SelloCapas`, `Marcadores`, `Minigrafica`, `particulasViento`, `Mapa` (lo sustituye `MapaDonde`), `lib/{casos,colegios,dias,vecinos,nivelPerfil,ficha,viento,pruebas}.ts`, `public/dias/` |

En el pipeline no se borra nada: `dias.py` y `construir_colegios.py` siguen sirviendo y forman parte de la historia del proyecto.

## Tareas
P0 = imprescindible para la demo del 25 · P1 = muy recomendable · P2 = opcional. Un agente cada vez, en este orden.

| # | Agente | Tarea | Prio. | Depende de | Aceptación |
|---|---|---|---|---|---|
| 0 | Guillermo | Permiso para guardar «¿Salimos?» (commit local en la rama `salimos` sin push, o copia de la carpeta). Enviar el formulario con `resumen-formulario-inversion.md` | P0 | - | `git branch` muestra `salimos` con los cambios de hoy, o existe la copia; formulario enviado antes del 20-nov |
| D1 | datos | **Verificar la población por sección** (INE: censo anual o padrón por sección con edad; si no, los indicadores demográficos del ADRH). Elegir la geometría del mismo año (SHP de la Comunidad o contornos del INE). Verificar la referencia del IMSERSO (residencia y centro de día) y el Decreto 78/2017. Lista de valores de `dependecia_funcional` de los hospitales. Escribir `DATOS-DONDE.md`. **Corte: 19-nov a las 14:00**; si no hay población por sección, se aplica el plan B | P0 | - | `DATOS-DONDE.md` con URL, licencia, año y nº de secciones de cada fuente; los códigos casan con la geometría en ≥ 99 % de la población; cada referencia, «verificada (URL + cita)» o «descartada» |
| D2 | datos | `pipeline/donde/secciones.py` + `territorios.py` → `secciones.json`, `secciones.geojson` y `territorios.json`. Dependencias nuevas: `pyshp` y `shapely` | P0 | D1 | `pytest` en verde. Suma de `pob.total` = 7.113.886 ±0,5 %; `pob.65_mas` = 1.342.648 ±1 %; 4.417 secciones (o las del año elegido); 179 municipios y 21 distritos; geojson < 3 MB; «Parla» con zona 04 |
| D3 | datos | `pipeline/donde/servicios.py` → `servicios/<id>.json` × 7 + `otros_sociales.json` | P0 | D2 | Recuentos en el informe y en un test: centro de salud + consultorio = 429 menos los que no tengan coordenadas; residencias 518 (≤ 18 sin coordenadas) y 57.890 plazas ±1 %; centros de día 553 y 71.990 plazas ±1 %; farmacias 2.954-2.958; desfibriladores 13.680 menos los que no tengan coordenadas; cada centro cae dentro de la Comunidad. `grep -riE "titular|nif|telefono|correo" public/donde/` sin resultados |
| D4 | datos | `pipeline/donde/referencia.py`: implementación independiente en Python (proyección local, distancia, 2SFCA, voraz con n = 1) → `pipeline/donde/referencia.json` con los 6 casos | P0 | D3 | `uv run --project pipeline python -m donde.referencia` escribe los 6 casos; un test de pytest comprueba que el caso 4 cae en un municipio de la zona 04 |
| F1 | frontend | Limpieza: quitar lo de la tabla, vistas `donde` y `municipio` en `vista.ts`, cabecera y pestañas nuevas, título | P0 | 0 | `npm run build` y `npm test` en verde; `git grep -nE "Colegios|Casos|SelectorFecha|SiAquiNo" src/` vacío; la URL `?vista=municipio` abre la pestaña 2 |
| F2 | frontend | Motor `src/lib/donde/` (`tipos`, `servicios`, `geo`, `cobertura`, `agregados`, `lugares`, `cargar`) con tests de vitest contra `referencia.json` y de rendimiento | P0 | D4, F1 | Los 6 casos coinciden con Python (personas ±0,5 %; el óptimo, en la misma sección o con un `ganan` igual ±1 %); `calcularEstado("dea")` < 300 ms, `simular` < 10 ms y `optimo` del hospital con n = 3 < 800 ms en `npm test` |
| T1 | tester | Prueba del bloque de datos y del motor (D2-F2): cifras, columnas personales y casos límite (punto fuera de la Comunidad, zona sin déficit, plazas = 0) | P0 | F2 | Informe sin fallos bloqueantes |
| F3 | frontend | `MapaDonde` (secciones con `feature-state`, centros, contornos y tooltip), panel de servicio + radio + cifra grande + referencia + ranking con filtro de zona y estado en la URL | P0 | F2 | Al cambiar de servicio, el mapa se repinta en < 1 s; el ranking de residencias coincide con el caso 6; `?servicio=farmacia&radio=1000` abre así; funciona con `?base=raster` |
| F4 | frontend | Tú decides: marcador arrastrable, resultado en vivo, control de plazas, óptimo en un Web Worker, comparación en % y secciones resaltadas | P0 | F3 | Colocar una residencia en el punto del caso 5 da la cifra de `referencia.json`; el botón del modelo pinta el punto del caso 4; el mapa no se congela al calcular (> 30 fps en el perfil de Chrome) |
| I1 | ia | `herramientas.ts` (las 5 herramientas, puras) + `intencion.ts` (modo sin IA) con 12 frases de prueba | P0 | F2 | `npm test`: las 4 preguntas sugeridas y 8 variantes («geriátrico en el sur», «ambulatorio sierra»…) producen la herramienta y la entrada esperadas; «residencia en el sur» devuelve el punto del caso 4 |
| F5 | frontend | Panel del agente (mensajes, sugeridas, pasos, distintivo y ejecución de `Accion`) que llama a `/api/agente` y pasa al modo sin IA si recibe 503/504 o no hay red | P0 | I1, F4 | Sin `/api` (`npm run dev`), «¿Dónde pondrías una residencia en el sur?» mueve el mapa, pinta el punto y responde con «Modo sin IA» en < 1 s |
| F6 | frontend | Mi municipio: buscador, ficha con semáforos y referencias, «lo que más le falta» → simulador, otros servicios sociales y minimapa | P0 | F3 | Getafe, Parla, La Acebeda y «Centro» (distrito) se resuelven y muestran los 7 servicios; «Ver en el simulador» abre el apartado 1 con el servicio y el encuadre |
| T2 | tester | Recorrido completo del P0 en escritorio y a 390 px, estados de error y modo sin IA | P0 | F5, F6 | Informe con los defectos priorizados; ninguno bloqueante sin resolver |
| I2 | ia | `api/agente.ts` + `api/_lib/{proveedor,presupuesto,validador,prompt}.ts` (cliente adaptado de DockClerk, declarado en el README). Prueba de humo con 3 preguntas reales; medir el coste por pregunta | P1 | I1, clave de Baseten | `vercel dev` + el `curl` de la prueba final devuelve `marcar_puntos` con el punto del caso 4; con `AGENTE_ACTIVO=0`, 503 `apagado`; sin clave, 503 `sin_clave`; el coste medio por pregunta queda anotado en `DATOS-DONDE.md` |
| I3 | ia | 12 preguntas de evaluación con el proveedor simulado (herramienta correcta y ninguna cifra fuera de los resultados) + script `scripts/evaluar-agente.ts` contra el modelo real | P1 | I2 | `npm test` pasa las 12; el script real acierta 10 de 12 o más (si no, decidir Haiku o el modo sin IA) |
| F7 | frontend | Aire de hoy en Mi municipio (compacto, con su hora y aviso de antigüedad) | P1 | F6 | Getafe muestra el veredicto y la hora del dato; Madrid, el aviso de cobertura; sin red, la copia de respaldo con su fecha |
| R1 | revisor | Revisión antes del primer push: secretos, columnas personales, licencias y atribuciones (CC BY, INE, CAMS, OpenFreeMap/OSM, código del ponente y de DockClerk), límites de gasto, textos de criterio | P0 | T2 (e I2 si está) | `git grep -nE "sk-|API_KEY=."` vacío; README y Metodología citan cada conjunto con su enlace; veredicto APTO |
| P1 | deploy | **Solo con el permiso de Guillermo:** push, Vercel (variables, `git.deploymentEnabled` para que la rama `datos` no despliegue), `vercel.json` con `includeFiles: "public/donde/**"` para la función. Opcional: renombrar el repositorio a `donde-hace-falta` y actualizar `URL_ESTADO` | P0 | R1 | La URL pública responde 200; `curl` a `/api/agente` responde (200 o 503 con el motivo) |
| P2 | deploy | README reproducible (del clon a `public/donde/` en 3 comandos), `DATOS-DONDE.md` completo, Metodología en la web, capturas | P0 | P1 | Otra persona regenera `public/donde/` y obtiene los mismos recuentos |
| T3 | tester | Ensayo cronometrado de la demo (con IA, sin IA y sin wifi) | P0 | P2 | Demo en menos de 5 min; con el wifi cortado, el modo sin IA responde las 4 sugeridas |
| D5 | datos | Barrios de la capital: geometría de datos.madrid.es (comprobar la licencia) + asignación de las secciones por punto en polígono; población de `barrios_municipio_madrid` | P2 | D2 | 128 barrios; la suma de la capital cuadra ±1 %; licencia anotada. Si no se puede, se queda en distritos |
| D6 | datos | Capa de renta por sección (ADRH del INE) para el filtro «déficit en barrios de renta baja» | P2 | D2 | Renta en ≥ 95 % de las secciones; licencia anotada |
| I4 | ia | Servidor MCP con las 5 herramientas (declarado sobre el `servidor.py` del ponente) | P2 | I2 | Claude Desktop lo arranca y `ubicacion_optima` responde |

### Calendario
| Día | Trabajo | Hito |
|---|---|---|
| Mié 18 (noche) | 0 (permiso y formulario), arranque de D1 | Formulario enviado (o el 19) |
| Jue 19 | D1 (corte a las 14:00), D2, D3 | Datos en `public/donde/` |
| Vie 20 | D4, F1, F2, T1 | **Plazo del formulario.** Motor contrastado con Python |
| Sáb 21 | F3, F4 | Apartado 1 jugable en local |
| Dom 22 | I1, F5, F6 | Las dos pestañas y el modo sin IA |
| Lun 23 | T2, I2 (si hay clave), F7 | P0 completo en local |
| Mar 24 | I3, R1, P1, P2 | **Publicado** (con permiso) y congelado de funciones |
| Mié 25 | T3, 4 diapositivas + 1 captura, vídeo de respaldo de 90 s | **Demo que funciona** |
| Jue 26 | `workflow_dispatch` de `datos.yml` a las 8:00 y demo | Final |

Si el 22 a las 20:00 el apartado 1 no está completo, se recorta en este orden: F7 → I2/I3 (queda solo el modo sin IA) → el selector de radio (radio fijo) → los servicios hospital y desfibrilador.

## Riesgos y decisiones
| Riesgo | Mitigación |
|---|---|
| No hay población por sección utilizable o los códigos no casan con la geometría | Corte a las 14:00 del 19-nov y plan B a escala municipio + distrito, avisado en la pantalla |
| Perder el trabajo sin commit de «¿Salimos?» al limpiar | Tarea 0 antes de F1 |
| Línea recta en la sierra (puertos, embalses) | Declarado; radio ajustable; opcional, la mediana del desvío por carretera (P2) |
| Radios elegidos a ojo | Criterio propio, visible en la pantalla y con 3 opciones; las únicas cifras normativas son las verificadas (Ley 13/2022 y RD 137/1984) |
| Plazas autorizadas ≠ plazas públicas o libres; residencias privadas | Declarado; filtro de titularidad solo informativo (el registro no separa plazas concertadas dentro de un centro) |
| Desfibriladores en locales privados con horario | Declarado en el tooltip del servicio |
| El intérprete sin IA no entiende una pregunta del jurado | Preguntas sugeridas visibles; con IA cubre el resto; en la demo se usan las sugeridas |
| Muse Spark Open falla con el *tool calling* o el id desaparece | I2 lo comprueba el día 23; alternativa: Haiku (con clave de pago) o el modo sin IA |
| Gasto: el contador en memoria es por instancia | Tope bajo (3 $/día), `AGENTE_ACTIVO`, límite por IP, créditos prepagados (Guillermo confirma si al acabarse se cobra a la tarjeta) |
| El cron de `datos.yml` no es horario (ejecuciones del 16 al 18-nov separadas de 6 a 10 h) | La hora del dato siempre visible; ejecución manual la mañana del 26; opcional, un disparador externo |
| La IA inventa una cifra | Validador + paneles rellenados por el servidor + 12 preguntas de evaluación |
| El mapa va lento en móvil (4.417 polígonos + 13.680 puntos) | Geometría simplificada, `feature-state` en lugar de regenerar el GeoJSON y el óptimo en un Worker; los desfibriladores se pintan solo a partir del zoom 11 |
| «Ya existe algo parecido» (visores de la Comunidad en idem.comunidad.madrid) | Los visores enseñan dónde están los centros; nadie deja simular uno nuevo frente al óptimo ni preguntárselo a un agente. Conviene que `datos` dedique 20 min a buscar competencia el día 19 |
| Nombre del repositorio («alergia-madrid») | Renombrarlo en P1 (GitHub redirige; actualizar `URL_ESTADO` y `URL_PRONOSTICO`) |
| Puntuación | Usa 9 conjuntos de la Comunidad (sanitarios, sociales, farmacias, desfibriladores, colegios, censo por edad, secciones, municipios y aire); todo reproducible con `uv` y tests; código previo declarado (ponente y DockClerk) |

No hace falta `/plan-eng-review` para la arquitectura: es estática, sin base de datos y reaprovecha lo que ya hay. **Sí conviene que el revisor mire con lupa la definición de «ganan acceso» en el 2SFCA (F2)**: es la cifra que se va a enseñar al jurado.

## Prueba final
1. `uv run --project pipeline python -m donde.construir --salida public/donde && uv run --project pipeline python -m donde.referencia` → los recuentos de D2/D3 y los 6 casos; `npm test` en verde (incluido el contraste con Python).
2. Abrir la URL → la pestaña «¿Dónde hace falta?» con las residencias: mapa de secciones coloreado, la cifra de mayores por debajo de la media (4,3 plazas por cada 100) y el ranking del sur con Parla o Fuenlabrada arriba (lo que diga el caso 6).
3. «Coloca un centro» en Pinto → «+N mayores ganan acceso»; «¿Y dónde lo pondría el modelo?» → segundo punto y «tu ubicación logra el X % del óptimo». Arrastrar el marcador cambia la cifra al momento.
4. En el agente, «¿Dónde pondrías una residencia en el sur?» → el mapa vuela al sur, pinta el punto del caso 4 y explica el criterio, con distintivo «IA» y los pasos.
   `curl -s -X POST https://<app>.vercel.app/api/agente -H 'content-type: application/json' -d '{"mensajes":[{"rol":"usuario","texto":"¿Dónde pondrías una residencia en el sur?"}],"contexto":{"vista":"donde"}}' | jq '[.acciones[].tipo, .modo]'` → incluye `marcar_puntos` y `"ia"`.
5. Poner `AGENTE_ACTIVO=0` (o cortar el wifi) y repetir → la misma respuesta numérica con «Modo sin IA».
6. «Mi municipio» → Parla: 7 servicios con semáforo, «lo que más le falta» y, al pulsar «Ver en el simulador», vuelta al apartado 1 encuadrado en Parla. Bloque de aire de hoy con la hora del dato.
7. Clonar en limpio y seguir el README → regenera `public/donde/` con los mismos recuentos.
