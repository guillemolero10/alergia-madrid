// I3: evalúa el agente con IA contra el modelo REAL con 12 preguntas (ver `servidor/evaluacion.ts`).
// Se lanza con `npm run evaluar` (que carga este archivo con el cargador de Vite). Solo usa `manejarAgente` en el propio proceso:
// la misma ruta que `/api/agente`, sin servidor HTTP. La clave se lee de `.env.local` con `loadEnv` y NUNCA se imprime ni se registra.
//   npm run evaluar                     las 12 preguntas, informe en docs/I3-informe.md
//   npm run evaluar -- --solo=3,5       solo esas preguntas (no escribe informe)
//   npm run evaluar -- --max-usd=0.4    corta si el gasto de la pasada supera esa cifra (por defecto 0,5 $)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadEnv } from "vite";
import { manejarAgente, PROMPT_VERSION } from "../servidor/agente";
import { crearCargadorNode } from "../servidor/datos";
import { historialDelInforme, informeMarkdown, motivoParaNoEvaluar, PREGUNTAS, puntuar, resumen, tablaConsola, type Resultado } from "../servidor/evaluacion";
import { crearPresupuesto } from "../servidor/presupuesto";
import { proveedorDesdeEntorno } from "../servidor/proveedor";
import type { RespuestaAgente } from "../src/lib/donde/tipos";

export async function main(argv: string[]): Promise<number> {
  const env: Record<string, string | undefined> = { ...process.env, ...loadEnv("development", process.cwd(), "") };
  const prov = proveedorDesdeEntorno(env);
  const motivo = motivoParaNoEvaluar(env, prov !== null);
  if (motivo) {
    console.error(motivo);
    return 1;
  }
  const solo = argv.find((a) => a.startsWith("--solo="))?.slice(7).split(",").map(Number);
  const maxUsd = Number(argv.find((a) => a.startsWith("--max-usd="))?.slice(10) ?? "0.5");
  const preguntas = solo ? PREGUNTAS.filter((p) => solo.includes(p.id)) : PREGUNTAS;

  console.log(`Evaluando ${preguntas.length} preguntas con ${prov!.nombre} en ${prov!.servicio} (modelo ${prov!.modelo}), prompt ${PROMPT_VERSION}. Tope de la pasada: ${maxUsd} $.`);
  const cargador = crearCargadorNode(process.cwd(), import.meta.url);
  const presupuesto = crearPresupuesto();
  const resultados: Resultado[] = [];

  for (const p of preguntas) {
    if (resultados.reduce((s, r) => s + r.observado.costeUsd, 0) >= maxUsd) {
      console.error(`Se supera el tope de ${maxUsd} $: se para antes de la pregunta ${p.id}.`);
      break;
    }
    const lineas: Record<string, unknown>[] = [];
    const t0 = Date.now();
    const salida = await manejarAgente(
      { metodo: "POST", cuerpo: JSON.stringify({ mensajes: p.mensajes, contexto: p.contexto }), ip: `evaluacion-${p.id}` },
      { env: { ...env, AGENTE_LIMITE_IP_DIA: "50" }, cargador, presupuesto, registrar: (l) => lineas.push(l) },
    );
    const ms = Date.now() - t0;
    const linea = lineas[lineas.length - 1] ?? {};
    const respuesta: RespuestaAgente =
      salida.status === 200
        ? (salida.cuerpo as RespuestaAgente)
        : { texto: `(sin respuesta: HTTP ${salida.status} ${JSON.stringify(salida.cuerpo)})`, acciones: [], pasos: [], modo: "reglas" };
    const observado = {
      respuesta,
      herramientas: Array.isArray(linea.herramientas) ? (linea.herramientas as string[]) : [],
      validacion: String(linea.validacion ?? (salida.status === 200 ? "?" : `http_${salida.status}`)),
      ms,
      tokensEntrada: Number(linea.tokens_entrada ?? 0),
      tokensSalida: Number(linea.tokens_salida ?? 0),
      costeUsd: Number(linea.coste_usd ?? 0),
      llamadasModelo: Number(linea.llamadas_modelo ?? 0),
      tokensRazonamiento: Number(linea.tokens_razonamiento ?? 0),
    };
    const veredicto = salida.status === 200 ? puntuar(p, observado) : { acierto: false, fallos: [`HTTP ${salida.status}`] };
    resultados.push({ pregunta: p, observado, veredicto });
    console.log(`  ${p.id}: ${veredicto.acierto ? "OK" : "FALLO"} (${(ms / 1000).toFixed(1)} s)`);
  }

  console.log("\n" + tablaConsola(resultados));
  if (!solo) {
    mkdirSync("docs", { recursive: true });
    const hoy = new Date().toISOString().slice(0, 10);
    // La tabla «Historial de pasadas» se escribe a mano: se conserva al regenerar (R5-M5). Añade a mano la fila de esta pasada.
    const historial = existsSync("docs/I3-informe.md") ? historialDelInforme(readFileSync("docs/I3-informe.md", "utf8")) : null;
    writeFileSync("docs/I3-informe.md", informeMarkdown(resultados, { prompt: PROMPT_VERSION, modelo: `${prov!.nombre} (${prov!.modelo})`, fecha: hoy, historial }));
    console.log("Informe: docs/I3-informe.md");
  }
  const s = resumen(resultados);
  return s.aciertos >= 10 && s.n === 12 ? 0 : 2;
}
