# I2: el agente con IA (`POST /api/agente`)

Estado: **hecho, probado con el proveedor simulado y con el modelo real** (prueba de humo e I3: 12/12, `docs/I3-informe.md`). **20-nov: proveedor por defecto = API de Meta** (`muse-spark-1.3`, clave `META_API_KEY`); Baseten queda como alternativa (`AGENTE_PROVEEDOR=baseten`), porque la cuenta de Baseten del hackathon quedó «en revisión».

## Qué hace
La web llama a `POST /api/agente` con la conversación y lo que hay en pantalla (servicio, radio, año 2025/2030, referencia de plazas, zona, lugar). El servidor:
1. Responde **503** limpio (y la web pasa al «Modo sin IA») si `AGENTE_ACTIVO` no es `1`, si falta la clave del proveedor (`META_API_KEY` o `BASETEN_API_KEY`) o si se ha superado el tope de gasto del día.
2. Valida la petición (400 si algo no cuadra) y aplica el límite por visitante (429).
3. Pregunta a **Muse Spark en la API de Meta** (o a Muse Spark Open en Baseten, si se elige) con 5 herramientas (las del motor de `src/lib/donde/herramientas.ts`, las mismas del modo sin IA). Bucle de hasta 5 vueltas, 3 herramientas por vuelta, 6 en total, 26 s de tiempo (`TIEMPO_TURNO_MS`).
4. Valida el texto final (ver «Validador» abajo): cada cifra tiene que salir de los resultados de las herramientas de esta petición, de lo que escribió el usuario o del contexto de la pantalla; sin enlaces, código ni HTML. Si no pasa, responde con la plantilla del modo reglas (`modo: "reglas"`, mismas acciones y pasos) y `motivo: "revisada"`; la web lo etiqueta «Modo sin IA (respuesta revisada)» y explica que el texto del agente se descartó.
5. Devuelve `{texto, acciones, pasos, modo, restantes, motivo?}` (`motivo` solo con `"revisada"`), el contrato de `src/lib/donde/tipos.ts` que ya entiende la web.

Archivos: `servidor/agente.ts` (lógica), `proveedor.ts` (cliente del modelo), `presupuesto.ts` (tope y límite), `validador.ts`, `datos.ts` (carga de `public/donde/`), `prompts/agente-v4.ts` (prompt de sistema versionado; las anteriores quedan como historial), `vista-modelo.ts` (cómo ve el modelo los resultados), `vercel.ts` (adaptador), `vite.ts` (solo desarrollo). `api/agente.js` es el empaquetado de todo eso en un solo archivo (`npm run build:api`; `npm run build` lo regenera): Vercel lo ejecuta tal cual y no depende de cómo resuelva los imports del motor.

## Qué tiene que hacer Guillermo
1. En [dev.meta.ai](https://dev.meta.ai) crear **una clave nueva solo para este proyecto** (`donde-hace-falta`; no copiar la de DockClerk) y poner el **tope de gasto en Billing** (5 $): al acabarse los créditos cobra a la tarjeta.
2. En `.env.local` (raíz de `alergia-madrid/`, no se sube):
   ```
   META_API_KEY=<la clave nueva>
   AGENTE_ACTIVO=1
   AI_DAILY_BUDGET_USD=3
   AGENTE_LIMITE_IP_DIA=50
   ```
   Elección del proveedor: sin `AGENTE_PROVEEDOR`, Meta si hay `META_API_KEY` y, si no, Baseten si hay `BASETEN_API_KEY`; `AGENTE_PROVEEDOR=meta|baseten` fuerza uno (si falta su clave, no se pasa al otro). Opcionales de Meta: `META_MODEL` (por defecto `muse-spark-1.3`) y `META_API_BASE_URL` (por defecto `https://api.meta.ai/v1`). Opcionales de Baseten: `BASETEN_API_KEY`, `BASETEN_MODEL` (por defecto `meta-models/muse-spark-open`; comprobar en Baseten que el id sigue existiendo), `BASETEN_BASE_URL` (por defecto `https://inference.baseten.co/v1`; solo para pruebas con un servidor falso) y `AGENTE_LIMITE_IP_DIA` (por defecto 10 preguntas con IA por visitante y día; **entero >= 1**: `0` o un valor no válido NO apaga el límite, vuelve a 10 y el arranque lo avisa en el log; para la demo del 26 conviene subirlo, p. ej. 50).
3. Al publicar (solo con su visto bueno): las mismas variables en Vercel → Settings → Environment Variables (Production). Sin ellas, el agente responde 503 y la web funciona en modo sin IA.

## Cómo probarlo
- **`npm run dev`** (el más simple): con la clave (`META_API_KEY` o `BASETEN_API_KEY`) y `AGENTE_ACTIVO=1` en `.env.local`, Vite monta `/api/agente` (arranca diciendo «agente de IA: activo»). Sin esas variables, `/api` no existe y la web usa el modo sin IA, como antes. Pregunta en el panel del agente; la consola de Vite muestra una línea por pregunta (herramientas, tokens, coste y ms; nunca el texto).
- **`vercel dev`** (opcional, prueba la función empaquetada tal como irá a producción; necesita la CLI de Vercel y enlazar el proyecto, que es una acción de cuenta: no se ha hecho).
- **`curl`** contra cualquiera de los dos (el plan lo usa como prueba final):
  ```
  curl -s -X POST http://localhost:5173/api/agente -H 'content-type: application/json' \
    -d '{"mensajes":[{"rol":"usuario","texto":"¿Dónde pondrías una residencia en el sur?"}],"contexto":{"vista":"donde","servicio":null,"radio_m":null,"lugar":null}}' \
    | jq '[.acciones[].tipo, .modo]'
  ```
  Debe incluir `marcar_puntos` y `"ia"` (con los datos actuales, el punto es Leganés, 93,8 de 94 plazas, el caso 4 de `referencia.json`).
- Con `AGENTE_ACTIVO=0`: 503 `apagado`; sin clave: 503 `sin_clave`; la web responde igual con «Modo sin IA».
- Tests: `npx vitest run servidor` (con `fetch` simulado: herramientas y acciones correctas en las 4 preguntas sugeridas, cifra inventada, enlaces, tope de gasto también en concurrencia, sin clave, respuesta vacía, 429/500 del proveedor, timeout, 400, límite por IP, inyección de prompt, carga de datos; `t4-*` son los de la prueba T4).

## Decisiones
- **Reglas primero, IA solo donde hace falta:** el modo sin IA cubre 4 patrones; la IA entiende preguntas libres («¿y si en vez de en Parla la pongo en Pinto?», «compara…») y explica el porqué. Los números siempre los pone el motor.
- **Modelo:** Muse Spark `muse-spark-1.3` en la API de Meta (por defecto) o Muse Spark Open en Baseten (créditos del Meta Hackathon en los dos, 1,25 / 4,25 $ por millón de tokens de entrada y salida; confirmado en terceros: Baseten lista además 0,15 $ por millón de entrada en caché). `reasoning_effort: "low"` y `max_tokens` = 1.500 + 2.500 de margen para el razonamiento (Muse siempre razona; con poco margen devuelve vacío). Una respuesta vacía se reintenta una vez con más margen.
- **Si el tool calling de Muse fallara** en la prueba real: alternativa Claude Haiku (clave de console.anthropic.com, de pago; lo decide Guillermo) o quedarse solo con el modo sin IA. `proveedor.ts` es el único sitio que habría que tocar.
- **Datos en la función:** se leen de `public/donde/` con `fs` (incluidos con `vercel.json`: `includeFiles`, sin el GeoJSON de 2,5 MB). Arranque en frío: `secciones.json` + `territorios.json` (1,2 MB, ~40 ms); cada servicio al pedirlo; `secciones_2030.json` solo con 2030. Medido con el empaquetado: primera pregunta completa 115 ms (con proveedor simulado), siguientes 15-40 ms.
- **Contexto de la pantalla:** se amplió `ContextoAgente` con `anio`, `referencia` y `zona` (opcionales; `useAgente.ts` los envía). Así el agente calcula con 2030 y con la referencia que ve el usuario.
- **Seguridad:** el modelo solo puede llamar a 5 herramientas con argumentos validados (enum de servicios, textos ≤ 100 caracteres); **no ve coordenadas ni puede escribirlas**: en el esquema que se le manda `simular_centro` solo admite `lugar` (nombre), sin `lat`/`lon` (la web las conserva para el «Tú decides», que no pasa por el modelo), y si una llamada trae `lat` o `lon` el servidor la rechaza con un error (T4-9); el texto con enlaces, código o HTML se descarta; los mensajes del usuario van solo con rol `user` y el historial que llega al modelo se recorta a 6; cuerpo ≤ 20.000 caracteres, ≤ 12 mensajes de ≤ 500; no se registra el texto de preguntas ni respuestas ni la IP (el contador por visitante guarda un hash en memoria solo durante el día).
- **El historial lo manda el cliente:** los turnos «asistente» que llegan en la petición se pasan al modelo como contexto, pero **sus cifras no cuentan como verificadas** (T4-10): solo valen las de herramientas ejecutadas en esta petición, las que escribió el usuario y las del contexto (radio y año). Quien quiera «repetir» una cifra de un turno anterior obliga al modelo a volver a llamar a la herramienta.
- **Presupuesto (T4-11):** antes de CADA llamada al proveedor el servidor reserva 0,03 $ (una llamada cara: ~6.000 tokens de entrada + 4.000 de salida) y los cambia por el coste real al recibir la respuesta; si la llamada falla, la reserva se suelta sin gasto. La comprobación es «gastado + reservado ≥ tope → 503 `presupuesto`», así el tope corta también con peticiones simultáneas: con el tope de 0,1 $ y 40 preguntas a la vez pasan 4, no 40 (test). El exceso máximo sobre el tope es una llamada más lo que el coste real supere a la reserva. Con el tope de 3 $, una ráfaga de 100 llamadas en vuelo llena el tope solo con reservas.
- **Límite conocido:** el contador de gasto y el de preguntas por visitante son **en memoria, por instancia** (la base de DockClerk era Prisma; aquí no hay base de datos). Con varias instancias o tras un arranque en frío el tope real puede ser algo mayor que 3 $ (cada instancia tiene su contador; la reserva solo protege dentro de una). **El freno de verdad es el tope de gasto de la organización en el panel de Baseten (app.baseten.co): ponerlo en unos 3-5 $ antes de la demo** y los créditos prepagados. Si hiciera falta un contador global: Upstash Redis desde Vercel Marketplace.
- **Contador por visitante (T4-12):** se guarda un hash por IP y día; al llegar a 5.000 visitantes distintos se expulsa solo al más antiguo (los que preguntan últimamente son los últimos en salir), ya no se vacía todo. Quien tenga miles de IPs puede reiniciar su cupo expulsando a otros, pero el tope de gasto sigue valiendo.

## Validador de cifras (`servidor/validador.ts`)
La IA propone y explica; los números los pone el motor. Cada número del texto del modelo se comprueba así:
- **Dónde se busca:** salidas de las herramientas de esta petición (con km por metros y % por fracciones), texto del usuario y contexto (radio, año). Se leen los formatos españoles: `1.581`, `1 581` (espacio normal, duro o fino), `4,11`, `78 %`, `1.581.000`; horas y marcadores de lista (`1)`) se ignoran. Lo que va entre «» **también se comprueba** (T4-1): un nombre con número («Residencia 12 de Octubre») pasa porque sale de la herramienta.
- **Precisión escrita:** una cifra vale si es el valor de la herramienta redondeado a los decimales con que está escrita: `94` y `93,8` por 93,82, pero `95` y `93` no; un entero exacto solo vale por sí mismo (T4-3: se quitó el ±1 que dejaba pasar `1.580` y `1.582` por 1.581). Excepción: «99 %» vale para un 99,5-99,99 (la propia app nunca escribe «100 %» si no es exacto).
- **Abreviaturas:** `1,3 millones`, `11 mil` valen si redondean una cifra de las herramientas con los decimales escritos (1.342.648 → `1,3 millones`; 10.689 → `11 mil` pero no `10 mil`) (T4-6).
- **Años (T4-2):** `2025` y `2030` se ignoran solo con contexto de año («en 2030», «año 2025», «(2030)», «de 2025») y si no van seguidos de un sustantivo contado; `Faltan 2024 plazas` se comprueba como cualquier cifra.
- **Constantes del método (T4-6):** 65 y 75 («mayores de 65», «75 años»), 3 a 16 años, 5 años de tramo, «6 servicios», «por cada 100» y los radios de los servicios en m/km valen **solo con su contexto**; 75 sin «años» o «mayores de» es una cifra inventada. 0 y 1 valen siempre (residual aceptado).
- **Letras (T4-4):** se rechazan los números con letras por encima de «diez» (once…, veinte, treinta…, cien, doscientos…, docenas, decenas, centenares) y «mil / miles / millón / millones» sin dígito delante. El prompt (v2) exige cifras en dígitos tal cual salen de la herramienta. Residual: «uno… diez» en letra no se comprueban.
- **Enormes (T4-8):** un número que no cabe en un `number` se rechaza.
- **Enlaces (T4-5):** se rechaza cualquier `palabra.dominio` en minúsculas (`bit.ly`, `gob.madrid`, `ejemplo.dev`), TLD conocidos en mayúsculas, `mailto:`, `ftp:`, `tel:`, `//`, `www.`, `@`, código y HTML. Un efecto secundario aceptado: «p.ej.» sin espacios se descarta (cae a la plantilla, que es segura).
- Si algo no pasa, la web recibe la plantilla de reglas con `motivo: "revisada"`. Medido: las plantillas de reglas de las 4 preguntas sugeridas × año 2025/2030 × 4 referencias pasan el validador, es decir, un texto del modelo que cuente lo mismo con las mismas cifras sale con la etiqueta «IA».
- **Alias de municipios** («Sanse», «Fuenla»…): van dentro de `api/agente.js` (72 kB de `datos-estaticos/lugares.json`).

## Cuánto cuesta por pregunta (estimación, SIN medir con el modelo real)
Tamaños medidos con el empaquetado: prompt de sistema 2,3 kB + esquemas de las herramientas ≈ 4,7 kB (≈ 2.000 tokens por llamada); resultados de herramienta de 0,7 a 4 kB (200-1.200 tokens). Una pregunta típica son 2 llamadas al modelo:

| | entrada | salida (con razonamiento) | coste |
|---|---|---|---|
| Típica (1 herramienta) | ~4.500-5.500 | ~700-1.500 | **≈ 0,01 $** |
| Cara (3 herramientas, 5 vueltas) | ~15.000 | ~4.000 | ≈ 0,04 $ |

Con el tope de 3 $/día caben unas 250-300 preguntas típicas; con los créditos de Meta (150 $), unas 13.000. (El plan estimaba 0,025 $; esta cuenta sale por debajo porque el resultado de las herramientas es corto.) **Medido con el modelo real (I3, 20-nov): 0,0107 $ por pregunta de media** (detalle en `DATOS-DONDE.md`). Cada pregunta escribe una línea de log con `tokens_entrada`, `tokens_salida` y `coste_usd`.

## Pendiente
- ~~Prueba con el modelo real y medir el coste.~~ Hecha (20-nov): 0,011 $ por pregunta de media (0,004 la inyección, hasta 0,013 la más cara de la I3).
- ~~I3: 12 preguntas contra el modelo real.~~ Hecha: **12/12** con `agente-v4` (la v3 sacaba 2/12). Informe y historial en `docs/I3-informe.md`; se relanza con `npm run evaluar` (el script se niega a correr sin clave o con `AGENTE_ACTIVO` distinto de 1; `-- --solo=3,5` para unas pocas, sin informe).
- **Latencia:** 11-20 s por pregunta (I3: 11,6 s de media, 19,5 s de máximo). Alguna respuesta aislada pasa del límite (en la I3, la pregunta 8 de la pasada 4): con resultados ya calculados se responde con la plantilla sin IA; sin resultados, 504 y la web pasa al modo sin IA durante 60 s («Nueva conversación» lo reinicia). **Decidido en la R5: `TIEMPO_TURNO_MS` = 26 s**, la web espera 28 s y `maxDuration` es 30 s. El reloj del servidor empieza después del arranque en frío, así que quedan ~2 s de margen frente a la web.
- **Coste de los cortes (R5-I1):** una petición que ya salió hacia Meta y se corta por tiempo cuenta 0,025 $ en el tope del día (`COSTE_LLAMADA_CORTADA_USD`) y no devuelve el cupo del visitante, porque Meta puede cobrarla.
- **El día 26 (R5-I2):** en la wifi de la URJC todos comparten IP, y por tanto el límite por visitante. Presentar con los datos del móvil o subir `AGENTE_LIMITE_IP_DIA` (p. ej. a 150) solo ese día; el tope real es `AI_DAILY_BUDGET_USD`. Comprobar en dev.meta.ai → Billing que el tope de 5 $ corta las peticiones (si es solo un aviso, bajar `AI_DAILY_BUDGET_USD` a 2).
- **Si se cambia a Baseten (R5-M3):** los textos de privacidad dicen «Meta» fijo. Cambiar a mano `src/componentes/PanelAgente.tsx`, `AcercaDe.tsx` y `Metodologia.tsx`.
- `vercel dev` / despliegue: acciones de cuenta de Guillermo.

## Lo que ve el modelo (I3)
`servidor/vista-modelo.ts` convierte cada resultado de herramienta antes de dárselo al modelo: cifras ya en español y con unidad («93,8 plazas», «189.814 habitantes», «10 km», «67 %»), nombres sin «déficit», residencias en plazas (no personas), «completa: todos los habitantes a menos de 15 km de uno» cuando nadie queda lejos (frase nominal: con una oración el modelo escribía «con todos los habitantes viven…»), filas «aproximadas» sin cifras y sin enlaces ni coordenadas. Es solo presentación: el validador sigue comparando el texto del modelo con las salidas crudas. Prompt `agente-v4` (`servidor/prompts/agente-v4.ts`; el log registra `prompt: agente-v4`; la v3 queda como historial). El log añade `validacion_detalle` (solo las cifras sobrantes) cuando el validador rechaza un texto.

## Arreglos de la revisión R2 (19-nov)
R2 (`revisor`): APTO para commit, 0 bloqueantes. Arreglado (tests en `servidor/r2-arreglos.test.ts`):
- **I1:** el cupo del visitante solo se devuelve si el error llega antes de pagar ninguna llamada al modelo. Así no se puede preguntar sin límite forzando errores después de una llamada cobrada. Una respuesta vacía dos veces también cuenta, porque se ha pagado.
- **I2:** «(87)», «(+87)» o «Pinto 45)» se comprueban. Solo se saltan los marcadores de lista: «1) …» al empezar línea, o «; 2) Palabra» con una sola cifra.
- **M7:** el texto se normaliza (NFKC) antes de validar, para que los dígitos de ancho completo también se comprueben.
- **M3:** un POST que no sea `application/json` recibe 415. Así otras webs no pueden lanzar peticiones «simples» con el navegador de sus visitantes.
- **M10:** si falla la lectura del cuerpo, la respuesta es 400 (no un 500 de la plataforma).
- **M4:** la reserva por llamada sube a 0,045 $, para cubrir también el reintento con 6.500 tokens de salida.
- **M5:** `AI_DAILY_BUDGET_USD` escrito pero no válido (-1, texto, Infinity) = **apagado** (falla cerrado), con un aviso en el arranque. Vacío = 3 $.
- **M6:** el servidor admite las 11 zonas a la vez, como la web.
- **M1:** aviso bajo el campo del agente: «Con IA, tu pregunta se envía a Baseten: no escribas datos personales».
- **M2:** ninguna ruta del Mac en los tests.
- **M8:** README corregido.
- **M9:** `prompts/agente-v1.ts` marcado como «NO SE USA» (no se ha borrado sin permiso de Guillermo).
- **M11:** `.gitattributes` marca `api/agente.js` como generado. Antes de cada commit, `npm run build` (el test `t4-empaquetado` avisa si el empaquetado está desfasado).
- Pendiente de comprobar en el panel de Baseten: que Muse Spark Open cueste allí 1,25 / 4,25 $ por millón (es el precio de Meta). Si cuesta más, el tope real sube en proporción.
