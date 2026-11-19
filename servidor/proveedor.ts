// Cliente del modelo de IA del agente: Muse Spark Open (Meta, pesos abiertos) servido por Baseten con una API compatible
// con OpenAI (`POST {base}/chat/completions`).
//
// Código reutilizado y declarado: la estructura (proveedor con clave solo por variable de entorno, `reasoning_effort` bajo y
// margen en `max_tokens` porque Muse siempre razona, un reintento ante 429/5xx, error si la respuesta viene vacía, coste por
// llamada con el precio por millón de tokens) está adaptada de `apps/meta-hackathon/dockclerk/src/lib/ai/client.ts`, proyecto
// propio de Guillermo Molero. Aquí se ha quitado todo lo que no usa este proyecto (visión, voz, SAM) y el `fetch` se inyecta para
// poder probarlo sin red.
//
// Sin DOM ni `import.meta.env`. La clave solo se lee de `process.env` en el servidor.
import type { UsoLlamada } from "./presupuesto";

export interface Proveedor {
  nombre: string;
  baseUrl: string;
  apiKey: string;
  modelo: string;
  /** Muse razona siempre; el esfuerzo bajo acorta el razonamiento (no lo apaga). */
  razonamiento: "low";
  /** Dólares por millón de tokens (entrada y salida): Muse Spark, 1,25 / 4,25 (dev.meta.ai, comprobado en DockClerk el 31-oct-2026). */
  precio: { entrada: number; salida: number };
}

export const MODELO_POR_DEFECTO = "meta-models/muse-spark-open";
export const BASE_POR_DEFECTO = "https://inference.baseten.co/v1";

type Entorno = Record<string, string | undefined>;

/** El proveedor configurado, o null si falta la clave (el agente responde entonces 503 `sin_clave`). */
export function proveedorDesdeEntorno(env: Entorno): Proveedor | null {
  const apiKey = env.BASETEN_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    nombre: "Muse Spark Open",
    apiKey,
    baseUrl: (env.BASETEN_BASE_URL?.trim() || BASE_POR_DEFECTO).replace(/\/$/, ""),
    modelo: env.BASETEN_MODEL?.trim() || MODELO_POR_DEFECTO,
    razonamiento: "low",
    precio: { entrada: 1.25, salida: 4.25 },
  };
}

// ---------------------------------------------------------------- mensajes (formato OpenAI)
export interface LlamadaHerramientaModelo {
  id: string;
  type?: "function";
  function: { name: string; arguments: string };
}

export type MensajeModelo =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: LlamadaHerramientaModelo[] }
  | { role: "tool"; tool_call_id: string; content: string };

export interface HerramientaModelo {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface RespuestaModelo {
  contenido: string | null;
  llamadas: LlamadaHerramientaModelo[];
  uso: UsoLlamada;
}

/** Fallos del proveedor: el agente los convierte en 503 `proveedor` (la web responde entonces con el modo sin IA). */
export class ErrorProveedor extends Error {
  constructor(
    public codigo: "http" | "red" | "vacia" | "formato",
    mensaje: string,
  ) {
    super(mensaje);
    this.name = "ErrorProveedor";
  }
}

/** Se agotó el tiempo del turno (504). */
export class ErrorTiempo extends Error {
  constructor() {
    super("Se agotó el tiempo del turno");
    this.name = "ErrorTiempo";
  }
}

/** Tokens que puede gastar Muse razonando, además de la respuesta. «low» no es un tope duro (se han visto de 25 a 800). */
const MARGEN_RAZONAMIENTO = 2500;
export const MAX_TOKENS_RESPUESTA = 1500;
const REINTENTAR_EN = new Set([429, 502, 503, 504, 529]);

export interface OpcionesLlamada {
  herramientas?: HerramientaModelo[];
  /** Instante (ms desde 1970) en que hay que haber terminado. */
  limite: number;
  /**
   * Se llama antes de CADA petición al proveedor (también en los reintentos): aquí se comprueba el tope de gasto y se reserva el coste
   * estimado. Puede lanzar. Si devuelve una función, se llama al terminar esa petición (respondiera o fallara), después de `despues`.
   */
  antes?: () => (() => void) | void;
  /** Se llama con el uso de CADA respuesta recibida (también la vacía): aquí se apunta el gasto. */
  despues?: (uso: UsoLlamada) => void;
  fetch?: typeof fetch;
  ahora?: () => number;
  espera?: (ms: number) => Promise<void>;
}

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface CuerpoRespuesta {
  choices?: { message?: { content?: unknown; tool_calls?: unknown }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } };
}

function esLlamada(x: unknown): x is LlamadaHerramientaModelo {
  if (typeof x !== "object" || x === null) return false;
  const l = x as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
  return typeof l.id === "string" && typeof l.function?.name === "string" && typeof l.function.arguments === "string";
}

/**
 * Una vuelta de la conversación. Lanza `ErrorProveedor` (HTTP, red, respuesta vacía, formato) o `ErrorTiempo`.
 * Un reintento tras 1 s si la respuesta es 429 o un error de pasarela, siempre que quede tiempo. Una respuesta vacía
 * (Muse gastó todos los tokens razonando) también se reintenta una vez, con más margen.
 */
export async function llamarModelo(p: Proveedor, mensajes: MensajeModelo[], o: OpcionesLlamada): Promise<RespuestaModelo> {
  const ahora = o.ahora ?? (() => Date.now());
  const f = o.fetch ?? fetch;
  const esperar = o.espera ?? dormir;
  const inicio = ahora();

  for (let intento = 0; ; intento++) {
    const margen = MARGEN_RAZONAMIENTO * (intento + 1);
    const cuerpo = JSON.stringify({
      model: p.modelo,
      messages: mensajes,
      temperature: 0,
      max_tokens: MAX_TOKENS_RESPUESTA + margen,
      reasoning_effort: p.razonamiento,
      ...(o.herramientas?.length ? { tools: o.herramientas, tool_choice: "auto" } : {}),
    });

    let res: Response;
    const queda = o.limite - ahora();
    if (queda < 1000) throw new ErrorTiempo();
    const soltar = o.antes?.();
    try {
      try {
        res = await f(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" },
          body: cuerpo,
          signal: AbortSignal.timeout(queda),
        });
      } catch (e) {
        if (ahora() >= o.limite - 50 || (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))) throw new ErrorTiempo();
        throw new ErrorProveedor("red", e instanceof Error ? e.message : "sin red");
      }

      if (!res.ok) {
        if (intento === 0 && REINTENTAR_EN.has(res.status) && o.limite - ahora() > 3000) {
          await esperar(1000);
          continue;
        }
        // No se copia el cuerpo del error: podría repetir partes de la petición.
        throw new ErrorProveedor("http", `${p.nombre} respondió ${res.status}`);
      }

      let datos: CuerpoRespuesta;
      try {
        datos = (await res.json()) as CuerpoRespuesta;
      } catch {
        throw new ErrorProveedor("formato", `${p.nombre} no devolvió un JSON`);
      }
      const msg = datos.choices?.[0]?.message;
      const contenido = typeof msg?.content === "string" && msg.content.trim() ? msg.content : null;
      const llamadas = Array.isArray(msg?.tool_calls) ? msg.tool_calls.filter(esLlamada) : [];
      const entrada = datos.usage?.prompt_tokens ?? 0;
      const salida = datos.usage?.completion_tokens ?? 0;
      const uso: UsoLlamada = {
        entrada,
        salida,
        razonamiento: datos.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
        costeUsd: (entrada * p.precio.entrada + salida * p.precio.salida) / 1_000_000,
        ms: ahora() - inicio,
      };
      o.despues?.(uso);
      if (!contenido && llamadas.length === 0) {
        // Vacía: casi siempre «finish_reason: length» por razonar de más. Una segunda oportunidad con más margen; el gasto de la primera ya cuenta.
        if (intento === 0 && o.limite - ahora() > 3000) continue;
        throw new ErrorProveedor("vacia", `${p.nombre} devolvió una respuesta vacía`);
      }
      return { contenido, llamadas, uso };
    } finally {
      if (typeof soltar === "function") soltar();
    }
  }
}
