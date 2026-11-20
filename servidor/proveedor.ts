// Cliente del modelo de IA del agente: Muse Spark (Meta), con una API compatible con OpenAI (`POST {base}/chat/completions`).
// Dos proveedores, elegidos por variables de entorno:
//  - **Meta** (por defecto): la Model API de Meta (`https://api.meta.ai/v1`, `muse-spark-1.3`), clave `META_API_KEY`.
//  - **Baseten** (alternativa): Muse Spark Open, los pesos abiertos (`meta-models/muse-spark-open`), clave `BASETEN_API_KEY`.
// `AGENTE_PROVEEDOR=meta|baseten` fuerza uno; sin ella se usa Meta si hay `META_API_KEY` y, si no, Baseten si hay `BASETEN_API_KEY`.
//
// Código reutilizado y declarado: la estructura (proveedor con clave solo por variable de entorno, `reasoning_effort` bajo y
// margen en `max_tokens` porque Muse siempre razona, un reintento ante 429/5xx, error si la respuesta viene vacía, coste por
// llamada con el precio por millón de tokens) está adaptada de `apps/meta-hackathon/dockclerk/src/lib/ai/client.ts`, proyecto
// propio de Guillermo Molero. Aquí se ha quitado todo lo que no usa este proyecto (visión, voz, SAM) y el `fetch` se inyecta para
// poder probarlo sin red.
//
// Sin DOM ni `import.meta.env`. La clave solo se lee de `process.env` en el servidor.
import type { UsoLlamada } from "./presupuesto";

export type IdProveedor = "meta" | "baseten";

export interface Proveedor {
  id: IdProveedor;
  /** Modelo, para los registros y los avisos («Muse Spark», «Muse Spark Open»). */
  nombre: string;
  /** Quién sirve el modelo («Meta», «Baseten»). */
  servicio: string;
  baseUrl: string;
  apiKey: string;
  modelo: string;
  /** Muse razona siempre; el esfuerzo bajo acorta el razonamiento (no lo apaga; «none» da 400 en Meta). */
  razonamiento: "low";
  /** Dólares por millón de tokens (entrada y salida): Muse Spark, 1,25 / 4,25 (dev.meta.ai/docs/pricing-rate-limits, comprobado en DockClerk el 31-oct-2026). */
  precio: { entrada: number; salida: number };
}

interface Configuracion {
  nombre: string;
  servicio: string;
  base: string;
  modelo: string;
  varClave: string;
  varBase: string;
  varModelo: string;
}

export const PROVEEDORES: Record<IdProveedor, Configuracion> = {
  meta: {
    nombre: "Muse Spark",
    servicio: "Meta",
    base: "https://api.meta.ai/v1",
    modelo: "muse-spark-1.3",
    varClave: "META_API_KEY",
    varBase: "META_API_BASE_URL",
    varModelo: "META_MODEL",
  },
  baseten: {
    nombre: "Muse Spark Open",
    servicio: "Baseten",
    base: "https://inference.baseten.co/v1",
    // El id normal, no el «[HACKATHON]», que puede desaparecer.
    modelo: "meta-models/muse-spark-open",
    varClave: "BASETEN_API_KEY",
    varBase: "BASETEN_BASE_URL",
    varModelo: "BASETEN_MODEL",
  },
};

type Entorno = Record<string, string | undefined>;

/** El valor de `AGENTE_PROVEEDOR` si es válido; si no (vacío o mal escrito), null = automático. */
export function proveedorElegido(env: Entorno): IdProveedor | null {
  const v = env.AGENTE_PROVEEDOR?.trim().toLowerCase();
  return v === "meta" || v === "baseten" ? v : null;
}

function construir(id: IdProveedor, env: Entorno): Proveedor | null {
  const c = PROVEEDORES[id];
  const apiKey = env[c.varClave]?.trim();
  if (!apiKey) return null;
  return {
    id,
    nombre: c.nombre,
    servicio: c.servicio,
    apiKey,
    baseUrl: (env[c.varBase]?.trim() || c.base).replace(/\/$/, ""),
    modelo: env[c.varModelo]?.trim() || c.modelo,
    razonamiento: "low",
    precio: { entrada: 1.25, salida: 4.25 },
  };
}

/**
 * El proveedor configurado, o null si falta su clave (el agente responde entonces 503 `sin_clave`).
 * Con `AGENTE_PROVEEDOR` forzado y sin su clave, NO se pasa al otro: así no se gasta en una cuenta que no se ha elegido.
 */
export function proveedorDesdeEntorno(env: Entorno): Proveedor | null {
  const elegido = proveedorElegido(env);
  if (elegido) return construir(elegido, env);
  return construir("meta", env) ?? construir("baseten", env);
}

/** Avisos de arranque sobre el proveedor (variable mal escrita). */
export function avisosProveedor(env: Entorno): string[] {
  const v = env.AGENTE_PROVEEDOR?.trim();
  if (v && !proveedorElegido(env)) return [`AGENTE_PROVEEDOR="${v.slice(0, 20)}" no es «meta» ni «baseten»: se elige solo (Meta si hay META_API_KEY; si no, Baseten).`];
  return [];
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

/** Se agotó el tiempo del turno (504). `enviada`: la petición ya había salido hacia el proveedor (puede cobrarla). */
export class ErrorTiempo extends Error {
  constructor(public enviada = false) {
    super("Se agotó el tiempo del turno");
    this.name = "ErrorTiempo";
  }
}

/**
 * Coste que se apunta cuando una petición ya enviada se corta por tiempo (R5-I1): el proveedor puede cobrarla aunque no llegue la
 * respuesta, así que cuenta en el tope del día y el cupo del visitante no se devuelve. Es la «llamada cara» de `presupuesto.ts`.
 */
export const COSTE_LLAMADA_CORTADA_USD = 0.025;

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

const esCorte = (e: unknown) => e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

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
  /** La petición ya salió: se apunta como gastada (el proveedor puede cobrarla) y se corta el turno. */
  const cortadaPorTiempo = (): never => {
    o.despues?.({ entrada: 0, salida: 0, razonamiento: 0, costeUsd: COSTE_LLAMADA_CORTADA_USD, ms: ahora() - inicio });
    throw new ErrorTiempo(true);
  };

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
        if (ahora() >= o.limite - 50 || esCorte(e)) cortadaPorTiempo();
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
      } catch (e) {
        // Si el tiempo se agota mientras llega el cuerpo, la respuesta ya estaba pagada: es un corte por tiempo, no un fallo de formato.
        if (esCorte(e) || ahora() >= o.limite - 50) cortadaPorTiempo();
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
