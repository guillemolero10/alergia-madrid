// Punto de entrada de la función de Vercel (`api/agente.js`, generada con `npm run build:api`).
// Adaptador fino entre `(req, res)` de Node y `manejarAgente`: lee el cuerpo (con tope de tamaño), saca la IP y escribe la respuesta.
import type { IncomingMessage, ServerResponse } from "node:http";
import { manejarAgente, MAX_CUERPO_CARACTERES, type SalidaHttp } from "./agente";
import { crearCargadorNode } from "./datos";
import { avisosDeConfiguracion, crearPresupuesto } from "./presupuesto";
import { avisosProveedor } from "./proveedor";

// Estado de la instancia (se conserva mientras siga caliente): datos cargados y contador de gasto en memoria.
const cargador = crearCargadorNode(process.cwd(), import.meta.url);
const presupuesto = crearPresupuesto();
// Arranque de la instancia: avisa de variables mal escritas (se usa el valor por defecto en su lugar).
for (const aviso of [...avisosProveedor(process.env), ...avisosDeConfiguracion(process.env)]) console.warn(`[agente] ${aviso}`);

type PeticionVercel = IncomingMessage & { body?: unknown };

/** Cuerpo en texto: Vercel suele entregarlo ya leído en `req.body`; si no, se lee el flujo con un tope. */
export async function leerCuerpo(req: PeticionVercel, maximo = MAX_CUERPO_CARACTERES): Promise<string | null> {
  const b = req.body;
  if (typeof b === "string") return b;
  if (b instanceof Uint8Array) return Buffer.from(b).toString("utf-8");
  if (b !== undefined && b !== null) {
    try {
      return JSON.stringify(b);
    } catch {
      return null;
    }
  }
  const trozos: Buffer[] = [];
  let total = 0;
  for await (const t of req) {
    const buf = Buffer.isBuffer(t) ? t : Buffer.from(t as string);
    total += buf.length;
    if (total > maximo * 4) return null; // muy por encima del límite: se corta sin acabar de leer
    trozos.push(buf);
  }
  return Buffer.concat(trozos).toString("utf-8");
}

/** IP del visitante: Vercel pone `x-forwarded-for` (el primero es el cliente). Solo sirve para el límite diario y no se guarda. */
export function ipDe(req: IncomingMessage): string {
  const h = req.headers["x-forwarded-for"];
  const v = Array.isArray(h) ? h[0] : h;
  return v?.split(",")[0]?.trim() || (req.headers["x-real-ip"] as string | undefined) || req.socket?.remoteAddress || "desconocida";
}

export async function atender(req: PeticionVercel, res: ServerResponse, env: Record<string, string | undefined> = process.env): Promise<void> {
  let salida: SalidaHttp;
  const tipo = String(req.headers["content-type"] ?? "").toLowerCase();
  if ((req.method ?? "GET") === "POST" && !tipo.startsWith("application/json")) {
    // R2-M3: sin JSON no hay petición «simple» desde otras webs (obliga al preflight y, sin cabeceras CORS, el navegador la bloquea).
    salida = { status: 415, cuerpo: { error: "tipo" } };
  } else {
    let cuerpo: string | null;
    try {
      cuerpo = await leerCuerpo(req);
    } catch {
      cuerpo = null; // R2-M10: un flujo roto es una petición mala, no un 500 de la plataforma
    }
    salida = await manejarAgente({ metodo: req.method ?? "GET", cuerpo, ip: ipDe(req) }, { env, cargador, presupuesto });
  }
  res.statusCode = salida.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(salida.cuerpo));
}

export default async function handler(req: PeticionVercel, res: ServerResponse): Promise<void> {
  await atender(req, res);
}
