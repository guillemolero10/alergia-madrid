# Plan: AlergIA Madrid (DATAMAD 2026)

Fecha del plan: 15-nov-2026 (domingo). MVP publicado: 17-nov (margen el 18). Final: 26-nov (jueves), demo de 5 min.

## Objetivo
Web pública de riesgo respiratorio (bajo/medio/alto) para personas alérgicas y asmáticas en la Comunidad de Madrid: mapa en tiempo real (aire horario + viento + polen por temporada) y chat con IA que mueve el mapa y abre paneles. El riesgo sale de reglas; la IA solo explica y navega.
**Fuera de alcance:** alertas por correo o push, cuentas de usuario, modelo propio de predicción (se usa CAMS), app móvil nativa, red del Ayuntamiento de Madrid (opcional, tarea 25).

## Contexto técnico
- Proyecto nuevo: no hay código que imitar. Referencia declarada: `../recursos-ponente-DATAMAD2026/MCP/servidor.py` (cliente CKAN con `httpx` y `follow_redirects`). El repositorio del ponente no trae licencia: se declara el origen y se reescribe lo mínimo.
- Stack: pipeline en Python 3.12 + `httpx` (ejecutado con `uv`, que evita el fallo de SSL del python del sistema); web con Vite + React + TypeScript + MapLibre GL JS; chat en una función de Vercel (Node) con `@anthropic-ai/sdk`.
- Comandos: `uv run --project pipeline pytest` · `uv run --project pipeline python -m alergia.ejecutar --salida salida/` · `npm run dev` · `npm test` · `npm run build` · `vercel dev` (web + `/api/chat` en local).

### Comprobado hoy contra las fuentes (15-nov, con curl)
- Base de la API: `https://datos.comunidad.madrid/api/3/action/`. La ruta `/catalogo/api/3/action/` responde 307: hay que seguir redirecciones.
- `calidad_aire_datos_dia`: el DataStore devolvió `total: 0`, así que **se descarga el CSV**, no se usa `datastore_search`. 182 filas, solo el día en curso, 28 estaciones. Magnitudes: NO2 (8) y O3 (14) en 28 estaciones, PM10 (10) en 21, PM2,5 (9) en 15, SO2 (1) en 6, PM1 (11) en 2. Flags del día: `T` (provisional) y `N` (sin dato); `V` solo en el histórico. A las 12:52 la última hora con dato era `h11` y el fichero se había modificado a las 12:20.
- Formato de los CSV: separador `;`, UTF-8 con BOM, **coma decimal**, vacío = sin dato. Excepción: `captadores_polen.csv` va en **Latin-1** y con una cabecera con espacio final (`direccion_localidad `).
- `mediciones_polen`: 84.753 filas, del 31-dic-2025 al 12-nov-2026, 27 tipos (25 + «Otros» + «PNI»), 2.187 valores vacíos. Solo **10 captadores con datos en 2026** (LEGA no tiene); el último dato por captador va del 8 al 12 de noviembre.
- Pico de gramíneas de 2026: **19 de mayo** (media de 205 granos/m³ entre captadores). Es la fecha de demostración.
- Distancia captador → estación más cercana: Getafe 1,5 km, Alcalá 0,6, Alcobendas 0,7, Aranjuez 0,6, Coslada 2,0, Las Rozas 2,6, Villalba 2,6; los 3 de Madrid capital (ALER, AYTM, FACF) quedan a 7-11 km.
- Open-Meteo: admite varias coordenadas por llamada; `air-quality` devuelve polen de fechas pasadas (mayo de 2026: gramíneas hasta 42,6) y `archive-api` devuelve el viento histórico. Hoy todo el polen previsto es 0, salvo artemisa.

## 1. Estructura del repositorio
```
alergia-madrid/                     (rama main, repositorio público)
  PLAN.md  README.md  DATOS.md  LICENSE (MIT)  .gitignore  .env.example  vercel.json  package.json
  index.html  src/                  web: App.tsx, componentes/, lib/{datos,tipos,riesgo,perfil}.ts
  public/respaldo/                  copia de estado_actual.json y pronostico.json por si falla la red
  api/chat.ts  api/_lib/            herramientas.ts, lugares.ts, limites.ts, prompt.ts, validador.ts
  pipeline/pyproject.toml
  pipeline/alergia/                 config.py ckan.py aire.py polen.py openmeteo.py reglas.py ejecutar.py dias.py
  pipeline/estatico/                construir_lugares.py construir_umbrales.py construir_estadisticas.py
  pipeline/tests/                   pytest + recortes reales de los CSV en tests/datos/
  datos-estaticos/                  lugares.json umbrales.json estadisticas.json rejilla_viento.json
  docs/esquema/                     estado_actual.schema.json pronostico.schema.json
  mcp/servidor_alergia.py           opcional (tarea 24)
  .github/workflows/                datos.yml (cron), ci.yml (tests en cada push)
rama datos (huérfana; solo escribe el workflow)
  estado_actual.json  pronostico.json  cache/{aire_48h,meta}.json
  dias/indice.json  dias/AAAA-MM-DD/{estado.json,pronostico.json}
```
La web y la función leen los JSON de `https://raw.githubusercontent.com/<usuario>/alergia-madrid/datos/...` (CORS abierto, caché de 5 min). Motivo: `main` no se llena de un commit por hora, Vercel no redespliega con cada dato y el historial de datos queda público y auditable.

## 2. Modelo de datos
Identificadores de lugar: `est:<código de 8 cifras>`, `cap:<código>`, `mun:<INE de 5 cifras>`. Niveles: `sin_dato` < `bajo` < `medio` < `alto`. Las horas van en ISO 8601 con el desfase de Europe/Madrid y marcan el **final** de la hora medida.

### estado_actual.json (mismo esquema en `dias/<fecha>/estado.json`)
```json
{
  "version": 1,
  "generado": "2026-11-15T12:27:04+01:00",
  "modo": "tiempo_real",
  "fecha_referencia": "2026-11-15T11:00:00+01:00",
  "capas": {
    "aire":   {"ultimo_dato": "2026-11-15T11:00:00+01:00", "fuente": "ckan:calidad_aire_datos_dia", "estado": "ok"},
    "polen":  {"ultimo_dato": "2026-11-12", "fuente": "ckan:mediciones_polen", "estado": "ok"},
    "viento": {"ultimo_dato": "2026-11-15T12:00:00+01:00", "fuente": "open-meteo:forecast", "estado": "ok"}
  },
  "observaciones": [
    {"lugar": "est:28065014", "variable": "no2", "valor": 23, "unidad": "µg/m³",
     "hora": "2026-11-15T11:00:00+01:00", "fuente": "ckan:calidad_aire_datos_dia", "nivel": "bajo",
     "regla": "1h", "valor_regla": 23, "provisional": true, "serie": [18, 17, null, 23]},
    {"lugar": "cap:GETA", "variable": "polen_gramineas", "valor": 0, "unidad": "granos/m³",
     "hora": "2026-11-08", "fuente": "ckan:mediciones_polen", "nivel": "bajo", "regla": "diario", "valor_regla": 0}
  ],
  "riesgo": [
    {"lugar": "est:28065014", "nivel": "bajo", "nivel_aire": "bajo", "nivel_polen": "bajo",
     "peor_variable": "no2", "captador": "cap:GETA", "polen_antiguedad_dias": 7}
  ],
  "viento": [{"lat": 40.25, "lon": -3.75, "velocidad_kmh": 17.3, "direccion_grados": 239}]
}
```
- `modo`: `tiempo_real` o `historico`. `capas.*.estado`: `ok`, `antiguo` (dato fuera de plazo) o `error` (la fuente falló y se conserva lo anterior).
- `observaciones[]` es el formato común: `lugar`, `variable`, `valor`, `unidad`, `hora`, `fuente`, `nivel`. Se añaden `regla` (`1h`, `media24h` o `diario`), `valor_regla` (el valor que se comparó con el umbral), `provisional` (flag `T`) y `serie` (solo aire: 24 valores horarios, del más antiguo al más reciente, con `null` si falta).
- Variables: `no2`, `o3`, `pm10`, `pm25` y `polen_<tipo>` (25 tipos; «Otros» y «PNI» no se publican).
- `riesgo[]`: una entrada por estación. `nivel` = máximo de `nivel_aire` y `nivel_polen`. El polen viene del captador emparejado y solo cuenta si tiene 7 días o menos; si no, `nivel_polen` = `sin_dato`.
- Los umbrales se aplican **solo en el pipeline**. La web y el chat personalizan haciendo el máximo de los `nivel` ya calculados para las variables del perfil.

### pronostico.json (mismo esquema en `dias/<fecha>/pronostico.json`)
```json
{
  "version": 1,
  "generado": "2026-11-15T12:27:04+01:00",
  "modo": "tiempo_real",
  "fuentes": {"meteo": "open-meteo:forecast", "aire_polen": "open-meteo:air-quality (CAMS Europa)"},
  "escala_niveles": ["sin_dato", "bajo", "medio", "alto"],
  "horas": ["2026-11-15T13:00:00+01:00", "2026-11-15T14:00:00+01:00"],
  "unidades": {"no2": "µg/m³", "o3": "µg/m³", "pm10": "µg/m³", "pm25": "µg/m³", "polen_gramineas": "granos/m³",
               "viento_kmh": "km/h", "viento_dir": "°", "lluvia_mm": "mm", "temp_c": "°C"},
  "sin_pronostico": ["polen_cupresaceas", "polen_platano"],
  "zonas": [
    {"lugar": "est:28065014",
     "valores": {"no2": [21.0, 24.5], "polen_gramineas": [0, 0], "viento_kmh": [17.3, 15.1]},
     "niveles": {"no2": [1, 1], "polen_gramineas": [1, 1], "aire": [1, 1], "polen": [1, 1], "global": [1, 1]}}
  ]
}
```
- `horas` tiene 48 elementos (de la hora siguiente a `generado` en adelante) y todos los arrays de `valores` y `niveles` están alineados con él. Los niveles son índices de `escala_niveles`.
- `valores`: `no2`, `o3`, `pm10`, `pm25`, `polen_gramineas`, `polen_olivo`, `polen_abedul`, `polen_aliso`, `polen_artemisia`, `viento_kmh`, `viento_dir`, `lluvia_mm`, `temp_c`. `niveles` añade `aire`, `polen` y `global` (máximos).

### Ficheros estáticos (versionados en `main`, calculados una vez)
- `lugares.json`: `estaciones[]` {id, nombre, municipio, lat, lon, tipo, mide[], captador, dist_captador_km}; `captadores[]` {id, nombre, localidad, lat, lon, activo}; `municipios[]` {id, nombre, alias[], lat, lon, estacion, dist_estacion_km, captador, dist_captador_km, cobertura_aire: `buena` o `lejana` (más de 5 km)}.
- `umbrales.json`: cortes por variable con su fuente y la fecha de cálculo.
- `estadisticas.json`: por lugar, variable y mes: `media`, `p50`, `p90`, `max`, `periodo`.
- `rejilla_viento.json`: 42 puntos, cada 0,25° entre lat 39,90-41,15 y lon -4,55/-3,05.

### Reglas de riesgo (`pipeline/alergia/reglas.py`)
| Variable | Valor comparado | bajo | medio | alto |
|---|---|---|---|---|
| NO2 | hora | ≤ 90 | 91-120 | > 120 |
| O3 | hora | ≤ 100 | 101-130 | > 130 |
| PM10 | media móvil 24 h | ≤ 40 | 41-50 | > 50 |
| PM2,5 | media móvil 24 h | ≤ 20 | 21-25 | > 25 |
| Polen (por tipo) | valor diario | < P75 | P75-P90 | ≥ P90 |

- Aire: bandas del Índice Nacional de Calidad del Aire (Orden TEC/351/2019 y su actualización de 2020), agrupadas así: bajo = buena y razonablemente buena; medio = regular; alto = desfavorable o peor. Coincide con las recomendaciones oficiales para población sensible. **Las cifras son de memoria: la tarea 3 las contrasta con el BOE antes de versionarlas.** Las guías de la OMS de 2021 se muestran como línea de referencia en el gráfico, no como regla, porque son medias de 24 h u 8 h y no sirven hora a hora.
- La media móvil de PM exige 12 horas válidas o más; con menos, `sin_dato`. Para eso el pipeline guarda `cache/aire_48h.json`.
- Polen: percentiles por tipo sobre los días con valor mayor que 0 de 2010-2019, juntando todos los captadores. Se declara como aproximación propia. Referencia de 2026 para gramíneas: P75 = 12 y P90 = 65.
- Al polen previsto por CAMS se le aplican los mismos cortes. Es otra aproximación (modelo frente a captador) y se declara.

## 3. Pipeline, fuente por fuente
Workflow `datos.yml`: `cron: "27 * * * *"` + `workflow_dispatch`, `concurrency` para no solaparse, `permissions: contents: write`. Hace checkout de `main` y de `datos` (en `salida/`), ejecuta `alergia.ejecutar`, valida contra `docs/esquema/` y hace commit en `datos` solo si algo cambió.

| Fuente | Endpoint | Transformación | Frecuencia | Si falla |
|---|---|---|---|---|
| Aire del día | `resource_show?id=ee75d31c-8042-4067-bbd7-739bb3eb8059` para leer `last_modified` y `url`; después se descarga el CSV | Código de estación = provincia + municipio (3 cifras) + estación (3 cifras). Se filtran las magnitudes 8, 9, 10 y 14. Se pasa de ancho a largo (`hNN`/`vNN`) y se conservan `V` y `T`. Se fusiona con `cache/aire_48h.json` y se calculan `serie`, la media de 24 h y el nivel | Cada hora; se salta si `last_modified` no cambió | Se conservan las observaciones anteriores y `capas.aire.estado` = `error`. Con más de 3 h de retraso, `antiguo` |
| Polen del año | Recurso `1f2c4851-b69b-4daa-85ae-89f56cabc67d` (CSV de 3,4 MB) | Último día con dato por captador; vacío = sin dato; tipo → `polen_<slug>` según la tabla de `config.py`; nivel por percentil | Cada hora, pero solo descarga si cambió `last_modified` | Se conserva lo anterior. Con más de 7 días, `antiguo` y deja de contar en el riesgo |
| Viento actual | `api.open-meteo.com/v1/forecast?latitude=…&longitude=…&current=wind_speed_10m,wind_direction_10m&timezone=Europe/Madrid` (42 puntos en una llamada) | Lista `viento[]` | Cada hora | Se conserva lo anterior; la web oculta las flechas si tienen más de 2 h |
| Pronóstico meteo | Misma API, 28 coordenadas de estación, `hourly=wind_speed_10m,wind_direction_10m,precipitation,temperature_2m&forecast_days=3` | Se recortan 48 h desde la hora siguiente | Cada hora | No se reescribe `pronostico.json` |
| Pronóstico de aire y polen | `air-quality-api.open-meteo.com/v1/air-quality`, 28 coordenadas, `hourly=pm10,pm2_5,nitrogen_dioxide,ozone,grass_pollen,olive_pollen,birch_pollen,alder_pollen,mugwort_pollen&forecast_days=3` | Mismo recorte; media móvil de PM; niveles | Cada hora | Igual que el anterior |
| Días históricos (`dias.py`) | Aire: `calidad_aire_datos_historico`, recurso `c28fc923-0591-4787-a133-17711249bfd5` (2026.csv, 8 MB). Polen: el mismo CSV del año. Viento: `archive-api.open-meteo.com/v1/archive`. Pronóstico: `air-quality` con `start_date` y `end_date` | Foto del día a las 14:00 con el esquema normal y `modo: historico`; añade la fecha a `dias/indice.json` | A mano (`workflow_dispatch` con la fecha) | Se aborta sin escribir |
| Estáticos (`pipeline/estatico/`) | `calidad_aire_estaciones` (`c05f6436-…`), `captadores_polen` (`763f86ed-…`), `mediciones_polen_historico` 2010-2019 (un CSV por año), `calidad_aire_datos_historico` 2021-2025 | Emparejamiento por distancia haversine, percentiles y estadísticas mensuales | Una vez; se versiona el resultado | Se corrige a mano |

Reglas generales: 2 reintentos con espera; cada fuente va en su propio `try`; **nunca se publica un JSON que no valide ni uno con menos capas que el anterior**; si fallan todas las fuentes, el workflow termina en rojo y GitHub avisa por correo. Consumo de Open-Meteo: unas 100 ubicaciones por hora, unas 2.400 al día (límite gratuito: 10.000).

## 4. Chat
### Contrato `POST /api/chat`
- Petición: `{"mensajes": [{"rol": "usuario"|"asistente", "texto": "…"}], "perfil": {"alergias": ["polen_gramineas"], "asma": true, "municipio": "mun:28065"} | null, "fecha": "2026-05-19" | null}`. `fecha` solo admite valores de `dias/indice.json` y hace que las herramientas lean ese día.
- Respuesta 200: `{"texto": "…", "acciones": [Accion], "restantes": 7}`.
- `Accion` = `{"tipo": "mover_mapa", "lugar": "mun:28065", "nombre": "Getafe", "lat": 40.31, "lon": -3.73, "zoom": 11}` o `{"tipo": "mostrar_panel", "formato": "tabla"|"grafico", "titulo": "…", "columnas": ["hora", "nivel", "…"], "filas": [[…]], "fuente": "…", "ultimo_dato": "…"}`.
- Errores: 400 (sin mensajes, texto de más de 500 caracteres, más de 12 mensajes o fecha no válida) · 429 `{"error": "limite", "reinicio": "…"}` · 503 `{"error": "chat_no_disponible"}` (sin clave, `CHAT_ACTIVO=0` o fallo del proveedor) · 504 (más de 25 s).

### Herramientas (se ejecutan en la función, sobre los JSON)
| Herramienta | Entrada | Salida |
|---|---|---|
| `riesgo_actual` | `lugar: string` | `{encontrado, lugar: {id, nombre}, hora, nivel, nivel_aire, nivel_polen, variables: [{variable, valor, unidad, nivel, hora, fuente}], estacion: {nombre, dist_km}, captador: {nombre, dist_km, ultimo_dato}, avisos: []}`. Si no se encuentra: `{encontrado: false, sugerencias: []}` |
| `pronostico` | `lugar`, `desde: "ahora"|"manana"` (por defecto `ahora`), `horas: 1-48` (24), `variables?: string[]` | `{lugar, horas: [{hora, nivel, valores: {}, niveles: {}}], resumen: {nivel_max, hora_pico, variable_pico}, fuente, sin_pronostico: [], avisos: []}` |
| `estadisticas` | `lugar`, `variable` | `{lugar, variable, valor_actual, unidad, mes, media_mes, p50_mes, p90_mes, periodo, comparacion: "por_debajo"|"habitual"|"por_encima"}` |
| `mover_mapa` | `lugar` | `{ok, nombre}`; añade una `Accion` con las coordenadas resueltas en el servidor |
| `mostrar_panel` | `formato: "tabla"|"grafico"`, `contenido: "pronostico"|"riesgo_actual"|"estadisticas"`, `lugar`, `variables?`, `desde?`, `horas?` | `{ok, filas: n}`; **el servidor rellena las filas** llamando a la función de datos |

- `lugar` es texto libre. `lugares.ts` lo normaliza (minúsculas, sin tildes, alias) y lo busca en `lugares.json`; la IA no inventa coordenadas.
- La IA nunca escribe los números del panel: solo indica qué mostrar. `validador.ts` comprueba además que toda cifra del `texto` aparezca en los resultados de las herramientas de ese turno; si no, sustituye el texto por «Te lo muestro en el panel». (Revisión: el validador ignora horas y fechas, como «antes de las 10» o «19 de mayo», y las cifras que escribió el usuario, para no tapar respuestas correctas).
- **DECISIÓN 15-nov (sustituye a la línea siguiente): el chat usa los créditos del Meta Hackathon vía Baseten, con el modelo abierto Muse Spark Open** (`meta-models/muse-spark-open`, API compatible con OpenAI, `https://inference.baseten.co/v1`). Así no cuesta dinero y suma en «tecnologías abiertas». Se reutiliza, declarándolo, el cliente y el tope de gasto diario de `apps/meta-hackathon/dockclerk/src/lib/ai/{client,budget}.ts` (`AI_DAILY_BUDGET_USD`). No se usa la API de Meta directa, porque el perfil incluye datos de salud (alergias, asma). Hay que comprobar en la tarea 9 que el modelo hace bien el tool calling; si falla, la alternativa es Claude Haiku. Ver las reglas de créditos en el `CLAUDE.md` de la raíz. Tareas visuales del frontend (mapa, estilo, animaciones): se pueden lanzar con el modelo Fable mientras sea gratis (hasta el 19-nov).
- (Anterior) Modelo: **Claude Haiku 5.5** (`claude-haiku-5-5`, el Haiku actual; corregido en la revisión, el plan decía 4.5): barato y fiable con herramientas. **Antes de la tarea 9, cargar la skill `claude-api` para confirmar el id, los precios y el uso de prompt caching del prompt de sistema y las herramientas** (reduce el coste por pregunta). Bucle manual de 5 vueltas como máximo y `max_tokens` 700. El prompt de sistema fija el papel (explica, no diagnostica ni receta), la fecha de hoy o la simulada, el perfil y la norma de citar la fecha del dato.
- Por qué IA y no solo reglas: la IA interpreta la pregunta y decide qué enseñar. El riesgo es determinista y la app funciona con el chat apagado.
- Coste: unos 7.000 tokens de entrada y 500 de salida por pregunta; la cifra de alrededor de 0,01 USD es una estimación sin verificar (se confirma en la tarea 9). Límites: 10 preguntas por visitante y día (contador en `localStorage` + mapa por IP en memoria; es orientativo) y tope global diario en memoria. **El freno real es el límite de gasto mensual en la consola (15 USD)**, más el interruptor `CHAT_ACTIVO`. Clave en las variables de entorno de Vercel y en `.env.local`; `.env.example` solo lleva los nombres.
- Reutilización declarada: `pipeline/alergia/ckan.py` parte del cliente del ponente. `mcp/servidor_alergia.py` (opcional) expone las tres herramientas de datos para Claude Desktop. La web no usa MCP en ejecución, porque un proceso Python dentro de la función no aporta nada.

## 5. Pantallas y componentes
Una sola pantalla: mapa a pantalla completa, barra superior, panel lateral derecho (en móvil, hoja inferior) y chat plegable.
| Componente | Qué hace |
|---|---|
| `Mapa` | MapLibre con el estilo «positron» de OpenFreeMap (sin clave) y un estilo ráster de OSM como respaldo. Círculos de estación coloreados por `riesgo.nivel`, rombos de captador, flechas de viento giradas por `direccion_grados` y con tamaño según la velocidad. Expone `volarA(lat, lon, zoom)` |
| `SelloCapas` | Tres interruptores (aire, polen, viento), cada uno con «último dato: …» y un aviso ámbar si `estado` no es `ok` |
| `SelectorFecha` | «Ahora» + fechas de `dias/indice.json`. En modo histórico aparece una banda fija: «Datos del 19-may-2026» |
| `PanelLugar` | Al pulsar un lugar: semáforo global, lista de variables con valor, nivel y hora, gráfica de la `serie` de 24 h, distancia a la estación y al captador y avisos de cobertura |
| `PanelResultado` | Dibuja la `Accion` `mostrar_panel`: `TablaPronostico` (una fila por hora con su semáforo) o `GraficoBarras` (SVG propio, sin librería) |
| `Chat` | Mensajes, 3 preguntas sugeridas, indicador «consultando datos…», contador de preguntas restantes y ejecución de las `acciones` |
| `Perfil` | Alergias (tipos de polen), asma y municipio en `localStorage`. Recalcula el riesgo personal y lo envía al chat |
| `Leyenda` y `Metodologia` | Qué significa cada nivel, umbrales, fuentes con licencia y limitaciones (Madrid capital, percentiles propios, polen de CAMS) |

Estados: carga (esqueleto del mapa); sin red o JSON inválido (usa `public/respaldo/` y avisa «datos de respaldo del …»); capa antigua (aviso ámbar); chat con 503 o 429 (mensaje claro y el mapa sigue funcionando); lugar no encontrado (muestra las sugerencias).

## 6. Tareas (en orden)
| # | Agente | Tarea | Depende de | Aceptación |
|---|---|---|---|---|
| 1 | deploy | `git init`, repositorio público, LICENSE MIT, `.gitignore` con `.env*`, rama huérfana `datos` | - | `gh repo view --json visibility` devuelve PUBLIC; `git ls-remote --heads origin datos` devuelve la rama |
| 2 | datos | `construir_lugares.py` → `lugares.json` y `rejilla_viento.json`. MVP: 28 municipios con estación + Madrid | 1 | 28 estaciones y 11 captadores; Getafe → `est:28065014` y `cap:GETA`; Madrid con `cobertura_aire: lejana` |
| 3 | datos | `umbrales.json`: ICA contrastado con el BOE y percentiles de polen 2010-2019. Confirmar en la descripción del conjunto si `h01` es hora local o UTC | 1 | Tabla y fuentes en `DATOS.md`; gramíneas del 19-may-2026 sale `alto`; convención horaria anotada y con test |
| 4 | backend | `ckan.py`, `aire.py`, `reglas.py`, viento, esquemas JSON y tests con recortes reales (BOM, coma decimal, flags `N`) | 2, 3 | `pytest` en verde; `alergia.ejecutar` genera un `estado_actual.json` que valida, con más de 80 observaciones de aire |
| 5 | backend | `polen.py` y pronóstico (`openmeteo.py`) → `pronostico.json` | 4 | Valida el esquema; 28 zonas × 48 horas; el polen de `cap:GETA` lleva su fecha |
| 6 | backend | `datos.yml` (cron, publicación en `datos`, política de fallos) | 4, 5 | 3 ejecuciones seguidas en verde; `curl` al raw devuelve `capas.aire.ultimo_dato` de hace menos de 3 h |
| 7 | frontend | `Mapa`, `SelloCapas`, `PanelLugar`, `Leyenda`, lectura de JSON con respaldo | 4 | `npm run build` sin errores; se ven 28 estaciones, flechas y la fecha de cada capa; funciona sin `/api` |
| 8 | deploy | Proyecto en Vercel, variables de entorno, rama `datos` sin despliegues (`git.deploymentEnabled`), `ci.yml` | 7 | URL pública que responde 200; un commit en `datos` no dispara despliegue |
| 9 | ia | `api/chat.ts` con `riesgo_actual`, `pronostico`, `mover_mapa`, `mostrar_panel` (tabla), prompt y límites | 5 | El `curl` de la prueba final devuelve `mover_mapa` a `mun:28065` y una tabla de 24 filas; con `CHAT_ACTIVO=0` responde 503 |
| 10 | frontend | `Chat` y `PanelResultado` (tabla); ejecuta las acciones | 7, 9 | La pregunta estrella mueve el mapa y abre la tabla en menos de 8 s |
| 11 | backend | `dias.py` con el 19-may-2026 e `indice.json` | 5 | `dias/2026-05-19/estado.json` valida y trae gramíneas en `alto` |
| 12 | frontend | `SelectorFecha` y banda de modo histórico; envía `fecha` al chat | 10, 11 | Al elegir el 19 de mayo cambian los colores y el chat responde con datos de ese día |
| 13 | tester | Pruebas del MVP: pipeline, contrato del chat, recorrido en escritorio y a 390 px | 6, 10, 12 | Informe sin fallos bloqueantes; lista de defectos priorizada |
| 14 | revisor | Revisión antes de publicar: secretos, licencias, atribuciones, límites de coste | 13 | `git grep -nE "sk-ant|API_KEY=."` sin resultados; README cita las fuentes y el código reutilizado |
| 15 | deploy | Publicar el MVP y anotar la URL en el `CLAUDE.md` del concurso | 14 | **Hito MVP (17-nov)**: la URL cumple la prueba final, pasos 1-4 |
| 16 | datos | `estadisticas.json` (polen 2010-2019, aire 2021-2025) y los 179 municipios en `lugares.json` | 15 | `estadisticas("Getafe", "no2")` devuelve la media del mes; «Chinchón» se resuelve |
| 17 | ia | `estadisticas`, panel `grafico`, `validador.ts` y 15 preguntas de evaluación con resultado esperado | 16 | `npm test` pasa las 15: herramienta correcta y ninguna cifra fuera de los resultados |
| 18 | frontend | `Perfil`, `GraficoBarras`, `Metodologia`, repaso de móvil y de estados de error | 15 | El riesgo personal cambia con el perfil; sin red se ve el respaldo |
| 19 | backend | 4 fechas más (cupresáceas, plátano, olivo y un episodio de O3) y congelado diario automático | 15 | `indice.json` con 5 fechas o más, todas validan |
| 20 | deploy | README reproducible (del clon a los datos en 3 comandos), `DATOS.md` completo y capturas | 17, 18, 19 | Otra persona ejecuta el pipeline en local siguiendo el README |
| 21 | tester | Pruebas completas y ensayo cronometrado de la demo, también con el chat apagado | 20 | Recorrido final sin fallos; demo en menos de 5 min |
| 22 | revisor | Revisión final y etiqueta `v1.0` | 21 | **Hito final (24-nov)**: congelado de código; después solo correcciones |
| 23 | deploy | Vídeo de respaldo de 90 s y ejecución manual del workflow la mañana del 26 | 22 | Vídeo guardado en local; datos con menos de 2 h a las 9:00 |
| 24 | ia | Opcional: `mcp/servidor_alergia.py` para Claude Desktop | 17 | `uv run` arranca y `riesgo_actual("Getafe")` responde |
| 25 | datos | Opcional: red del Ayuntamiento de Madrid (datos.madrid.es) como fuente añadida | 19 | Madrid deja de tener cobertura `lejana`; licencia comprobada |

## 7. Hitos
- **15-nov:** tareas 1-4. **16-nov:** 5-8. **17-nov:** 9-15 y MVP publicado. **18-nov:** margen y enlace listo para el formulario (el plazo acaba el 20).
- **19 a 23-nov:** 16-20. **24-nov:** 21-22 y congelado. **25-nov:** ensayo, vídeo y diapositivas. **26-nov:** tarea 23 y demo.
- Si el 17 a mediodía el chat no funciona, se publica el mapa con el selector de fecha y el chat entra el 18. El mapa nunca espera al chat.

## 8. Riesgos y decisiones
| Riesgo | Mitigación |
|---|---|
| El cron de GitHub Actions se retrasa o se salta ejecuciones | Fecha del dato siempre visible; `workflow_dispatch` antes de la demo; respaldo empaquetado en la web |
| El 26 de noviembre el polen está a 0 y el mapa sale casi todo verde | Selector de fecha con el 19 de mayo; el guion de la demo enseña primero «ahora» y después mayo |
| El DataStore de CKAN devuelve 0 filas o cambia el formato | Se descarga el CSV, se valida el esquema y no se publica nada roto; tests con recortes reales |
| Convención horaria de `h01..h24` sin confirmar | Tarea 3; hasta entonces se supone hora local |
| Cifras del ICA sin contrastar | Tarea 3, que bloquea la 4 |
| Gasto o abuso del chat | Límite de gasto en la consola, `CHAT_ACTIVO`, topes por petición y Haiku |
| La IA da una cifra inventada | Paneles rellenados por el servidor, validador numérico y 15 preguntas de evaluación |
| Cae OpenFreeMap, Open-Meteo o la wifi de la sala | Estilo ráster de respaldo, capas independientes, vídeo de 90 s y datos móviles |
| Madrid capital queda mal cubierta (estaciones a 7-11 km) | Se declara en `Metodologia` y en el panel; la tarea 25 es opcional |
| El repositorio del ponente no tiene licencia | Reutilización mínima y declarada; consultar al ponente |
| Cuenta para la puntuación | README con fuentes y licencias (CC BY 4.0), uso de IA declarado y desarrollo entre el 7 y el 26 de noviembre |

Decisiones: (1) rama `datos` + raw en lugar de commits en `main`; (2) un solo proyecto de Vercel para la web y `/api/chat`, en vez de Pages + Vercel, para tener un solo despliegue y un solo dominio; (3) umbrales solo en Python; (4) pronóstico de CAMS, sin modelo propio; (5) chat sin streaming en el MVP; (6) sin base de datos. No hace falta `/plan-eng-review`: la arquitectura es pequeña y ya venía decidida.

## Prueba final
1. `curl -s https://raw.githubusercontent.com/<usuario>/alergia-madrid/datos/estado_actual.json | jq '.capas'` → las tres capas en `ok` y el aire con menos de 3 h.
2. Abrir la URL: 28 estaciones coloreadas, flechas de viento y fecha visible en cada capa. Al pulsar Getafe se abre el panel con sus variables y la gráfica.
3. Poner `CHAT_ACTIVO=0`: el mapa y los paneles siguen funcionando y el chat avisa de que no está disponible. Volver a activarlo.
4. `curl -s -X POST https://<app>.vercel.app/api/chat -H 'content-type: application/json' -d '{"mensajes":[{"rol":"usuario","texto":"Soy alérgico a gramíneas, ¿cómo estará Getafe mañana?"}],"fecha":"2026-05-19"}' | jq '.acciones[].tipo'` → `mover_mapa` y `mostrar_panel`. En la web, el mapa vuela a Getafe y sale la tabla hora a hora con semáforo.
5. Repetir la pregunta en «Ahora»: responde con el polen a 0, la fecha del último dato del captador y el riesgo por aire.
6. Clonar el repositorio en limpio y seguir el README: `uv run --project pipeline python -m alergia.ejecutar --salida salida/` genera los dos JSON válidos.
