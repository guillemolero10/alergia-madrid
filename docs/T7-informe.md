# T7: prueba del diff sin commit (Meta directo + I3), 2026-11-20

Sin llamadas reales a Meta ni a Baseten. No se ha leído ningún `.env`. Tests nuevos: `servidor/t7-pruebas.test.ts` (27 tests, proveedor simulado y reloj falso).

## Bloqueantes
Ninguno.

## Importantes

### I-1. Un 504 apaga la IA 60 s para ese visitante, y una llamada abortada no se cuenta en el tope de gasto
- `servidor/agente.ts:~300` (`if (gasto.llamadas === 0) devolverCupo()`), `servidor/proveedor.ts` (`despues` solo se llama si llega respuesta), `src/lib/donde/clienteAgente.ts` (`recordar` → `ESPERA_TRAS_FALLO_MS` = 60 s).
- Reproducir: `servidor/t7-pruebas.test.ts`, bloque «latencia». Con Meta a 26, 27, 28 o 31 s en una llamada sin herramientas: HTTP 504, `gasto` 0 en el contador, cupo devuelto.
- Dos efectos: (a) el usuario pierde la IA 60 s por un solo tiempo agotado (la web pasa al modo sin IA y no vuelve a preguntar al servidor); (b) Meta puede cobrar la petición abandonada, pero el contador local no la apunta y el cupo de IP se devuelve. Con Meta lento, un visitante podría repetir sin que el tope de `AI_DAILY_BUDGET_USD` lo vea. El freno real sería solo el tope de 5 $ de dev.meta.ai.
- Arreglo propuesto: en el camino de tiempo agotado, apuntar un coste estimado (p. ej. `RESERVA_POR_LLAMADA_USD` o la mitad) y no devolver el cupo cuando se ha lanzado una llamada al proveedor; y/o bajar `ESPERA_TRAS_FALLO_MS` a 15-20 s solo para `tiempo`.

## Menores

### M-1. Baseten usa el precio de Meta (1,25 / 4,25 $)
- `servidor/proveedor.ts:~91` (`precio` fijo en `construir`). Si algún día se usa Baseten, el coste anotado puede ser falso. Arreglo: `precio` dentro de `PROVEEDORES[id]` y comprobar el de Baseten.

### M-2. Cifras de tiempo distintas entre documentos
- `DATOS-DONDE.md:344` dice «de 11 a 18 s»; `docs/I3-informe.md` dice 11,6 s de media y 19,5 s de máximo (y en la pasada 4 una pregunta agotó los 25 s). `docs/I2-agente.md:9` y el comentario `agente.ts:32` hablan de 25 s, coherente. Arreglo: poner «11-20 s, con alguna respuesta rara por encima de 25 s» en `DATOS-DONDE.md`.
- Coste: 0,011 $ (README, pitch, DATOS-DONDE) frente a 0,0107 $ (I3): coherente por redondeo. Con los créditos de Meta, 150 / 0,011 ≈ 13.600 («unas 13.000» correcto).

### M-3. Un turno con herramienta no puede aprovechar una primera llamada lenta
- `servidor/agente.ts` (límite acumulado de 25 s para todas las vueltas). Si la 1.ª llamada tarda 24 s, la 2.ª (redactar) no cabe: respuesta 200 con plantilla `modo: "reglas"` (validacion `tiempo`) y se cobra la 1.ª. Es el comportamiento correcto (el usuario recibe respuesta), pero conviene saberlo: el margen real para el modelo es de unos 15 s por llamada si hay herramienta.

### M-4. Flaky ya conocido
- En una de dos pasadas de la suite completa falló 1 test (el de rendimiento de `optimo`, ya anotado en el CLAUDE.md). Segunda pasada: todo verde.

## Cosméticos
- `servidor/proveedor.ts`: el comentario de `precio` cita «comprobado en DockClerk el 31-oct-2026»; no hay forma de verificarlo desde el repo.
- `.env.example`: `AGENTE_ACTIVO=0` junto a `AI_DAILY_BUDGET_USD=3` está bien, pero conviene recordar que `AI_DAILY_BUDGET_USD=0,5` (coma) apaga el agente (falla cerrado; ya avisa en el log de arranque).

## Lo comprobado y correcto
- `npm run build` regenera `api/agente.js` idéntico al que hay en el repo (no está desfasado). `TIEMPO_TURNO_MS = 25_000` está dentro del bundle.
- `dist/` no contiene `META_API_KEY`, `BASETEN_API_KEY`, `api.meta.ai` ni `Bearer`.
- Selección de proveedor: solo Meta, solo Baseten, las dos (gana Meta), ninguna (503 `sin_clave`), `AGENTE_PROVEEDOR` raro (se ignora con aviso), forzado sin su clave (no se pasa al otro), clave con espacios (recortada). `AGENTE_ACTIVO` = 0, vacío, ausente, «true», «si» → 503 y 0 llamadas; solo `1` (con espacios) activa.
- Petición a `https://api.meta.ai/v1/chat/completions` con `Bearer`. Coste con 2000 entrada / 400 salida = 0,0042 $ (exacto con 1,25/4,25). El tope diario corta con 503 `presupuesto`.
- La clave no sale en el registro ni en la respuesta, ni siquiera si el mensaje del error de red la contiene (los errores solo exponen `motivo`/`tipo`).
- Texto de privacidad (AcercaDe, Metodología, PanelAgente: «se envía a Meta») cuadra con lo que se manda de verdad: el prompt de sistema con el contexto de pantalla, los últimos 6 mensajes (también los del asistente) y los resultados de herramientas. No se guarda el texto en el servidor (el registro solo lleva herramientas, tokens, coste y tiempos).
- `vista-modelo.ts`: miles con punto, decimales con coma y «%» con espacio; 0, NaN, negativos, Infinity y 1e21 no lanzan; `undefined/null` en opcionales no lanzan; el validador acepta las cifras copiadas de la vista y rechaza una inventada (189.815).
- Modo sin IA con 503/504/429, sin red y sin clave: cubierto por tests existentes y los nuevos (504 y 503 devuelven el cupo si no hubo llamada pagada).

## Latencia: qué pasa exactamente (servidor 25 s, web 28 s, Vercel 30 s)

El reloj del servidor cuenta desde que entra la petición y es acumulado entre vueltas (una llamada con herramienta + una de redacción comparten los 25 s).

| Meta tarda | Una sola llamada (sin herramienta) | Con herramienta (1.ª llamada + redacción) |
|---|---|---|
| 24 s | 200, `modo: ia`, se cobra | Si es la 1.ª: queda 1 s, la redacción no cabe: 200 con plantilla `reglas` (validacion `tiempo`), se cobra la 1.ª |
| 26 s | Corte a los 25 s: 504 `tiempo`. La web (espera 28 s) recibe el 504 hacia los 25-26 s, muestra el aviso «ha tardado demasiado; respondo con reglas», responde en local y deja la IA apagada 60 s. No se apunta coste y se devuelve el cupo | 1.ª llamada: igual, 504. 2.ª llamada: 200 con plantilla `reglas` |
| 27 s | Igual que 26 s (el servidor ya abortó a los 25 s) | Igual |
| 28 s | Igual (la web nunca llega a su propio corte: el 504 llega antes) | Igual |
| 31 s | Igual; Vercel (30 s) no llega a intervenir | Igual |

El usuario siempre obtiene una respuesta (plantilla o reglas), nunca una pantalla en blanco. Lo que se pierde es el texto de la IA y 60 s de modo sin IA.

### Recomendación sobre `TIEMPO_TURNO_MS`
Mantener **25 s**. Razones:
- Con 27 s, el servidor respondería a ~27,3 s (tras el corte aún hay que ejecutar `responderSinIA`, que puede cargar un servicio de `public/donde/`, hasta cientos de ms) frente a los 28 s de la web: margen de menos de 1 s, y a 3 s del corte duro de Vercel. Si el 504 llega después de los 28 s, la web aborta por su cuenta y el resultado para el usuario es el mismo, pero se pierde el aviso exacto.
- La ganancia es mínima: 2 de unas 60 respuestas superaron 25 s; con 27 s solo se rescataría una parte de ellas (no hay distribución de colas, solo 2 puntos), y ahorraría al visitante nada que no reciba ya como plantilla.
- Con 26 s sería defendible (margen de 2 s con la web) pero la ganancia es igual de pequeña. Si se quiere de verdad dar más tiempo a Meta, subir los tres a la vez y con margen: servidor 30 s, web 34 s, `maxDuration` 45 s (comprobar que el plan de Vercel lo permite). Sin eso, no tocar.
- Más efectivo que subir el tiempo: arreglar I-1 (que un solo tiempo agotado no apague la IA 60 s) y, si Meta es lento durante la demo, el plan B es la plantilla sin IA, que ya funciona.

## Suite
- `npx vitest run`: 766 tests (739 anteriores + 27 nuevos de T7). Pasada 1: 765 pasan y 1 falla (rendimiento de `optimo`, flaky conocido); pasada 2: 766 pasan.
- `npx tsc --noEmit`: OK.
- `npm run build`: OK; `api/agente.js` sin cambios respecto al repo.

## Arreglos tras la revisión R5 (20-nov, Claude)
- **`TIEMPO_TURNO_MS` = 26 s** (decisión del `revisor`; la web sigue en 28 s y `maxDuration` en 30 s).
- **I-1, parte b (R5-I1):** una petición que ya salió y se corta por tiempo lanza `ErrorTiempo(enviada = true)`. Antes apunta `COSTE_LLAMADA_CORTADA_USD` (0,025 $) con `despues`, así que cuenta en el tope y el cupo del visitante ya no se devuelve. Un corte mientras llega el cuerpo (`res.json()`) también cuenta como tiempo, no como «formato». La parte a (60 s sin IA tras un 504) se deja como está.
- **M1 (R5):** la vista del modelo ya no lleva `puesto` ni `orden`.
- **M2 (R5):** por debajo del 0,1 %, la vista dice «una parte mínima», sin cifra.
- **M5 (R5):** `npm run evaluar` conserva la sección «Historial de pasadas» de `docs/I3-informe.md`. El informe usa `TIEMPO_TURNO_MS`.
- **M3, M4 y M7:** avisos y cifras corregidos en `.env.example`, `docs/I2-agente.md`, `DATOS-DONDE.md` y el pitch.
- Pruebas de latencia invertidas y 6 tests nuevos (`R5: arreglos de la revisión` en `servidor/t7-pruebas.test.ts`). **772 vitest, tsc y build OK.** `api/agente.js` regenerado.
