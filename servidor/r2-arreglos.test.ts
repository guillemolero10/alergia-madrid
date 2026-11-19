// Tests de los arreglos de la revisión R2 (19-nov). Cada bloque cita el hallazgo (R2-I1, R2-M3…).
import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import type { PeticionAgente } from "../src/lib/donde/tipos";
import { manejarAgente, type Dependencias } from "./agente";
import { crearCargadorNode } from "./datos";
import { crearPresupuesto } from "./presupuesto";
import { numerosPermitidos, validarTexto } from "./validador";
import { atender } from "./vercel";

const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } });
const uso = { prompt_tokens: 2000, completion_tokens: 400 };
const texto = (content: string) => json({ choices: [{ message: { content } }], usage: uso });
const herr = (name: string, args: unknown) =>
  json({ choices: [{ message: { content: null, tool_calls: [{ id: "c0", type: "function", function: { name, arguments: JSON.stringify(args) } }] } }], usage: uso });

const cargador = crearCargadorNode(process.cwd(), import.meta.url);
const ENV = { AGENTE_ACTIVO: "1", BASETEN_API_KEY: "clave-falsa-r2" };
function montar(fetchSim: typeof fetch, env: Record<string, string> = ENV): Dependencias {
  return { env, cargador, presupuesto: crearPresupuesto(), registrar: () => {}, espera: async () => {}, fetch: fetchSim };
}
function guion(f: (n: number) => Response): typeof fetch {
  let n = 0;
  return (async () => f(n++)) as unknown as typeof fetch;
}
const pet = (t: string, contexto: Partial<PeticionAgente["contexto"]> = {}): PeticionAgente => ({
  mensajes: [{ rol: "usuario", texto: t }],
  contexto: { vista: "donde", servicio: null, radio_m: null, lugar: null, ...contexto },
});
const preguntar = async (p: PeticionAgente, deps: Dependencias, ip = "1.2.3.4") =>
  (await manejarAgente({ metodo: "POST", cuerpo: JSON.stringify(p), ip }, deps)).status;

describe("R2-I1: un error tras una llamada pagada NO devuelve el cupo del visitante", () => {
  it("con límite 1, herramienta fallida + 500 del proveedor: la 1.ª es 503 y la 2.ª ya es 429", async () => {
    // Cada pregunta: 1.ª llamada (pagada) pide una herramienta que falla; 2.ª llamada, 500.
    const deps = montar(guion((n) => (n % 2 === 0 ? herr("ficha_municipio", { lugar: "" }) : json({}, 500))), { ...ENV, AGENTE_LIMITE_IP_DIA: "1" });
    expect(await preguntar(pet("x"), deps)).toBe(503);
    expect(await preguntar(pet("x"), deps)).toBe(429);
  });
  it("si el proveedor falla sin haber cobrado nada, el cupo SÍ se devuelve", async () => {
    const deps = montar(guion(() => json({}, 500)), { ...ENV, AGENTE_LIMITE_IP_DIA: "1" });
    for (let i = 0; i < 5; i++) expect(await preguntar(pet("x"), deps)).toBe(503);
  });
});

describe("R2-I2 y R2-M7: validador", () => {
  const permitidos = numerosPermitidos([{ total: 1581 }]);
  it("una cifra inventada entre paréntesis se comprueba: «(87)», «(+87)», «Pinto 45)»", () => {
    expect(validarTexto("En Parla faltan plazas (87) y ganan 1.581.", permitidos).ok).toBe(false);
    expect(validarTexto("Ganan 1.581 (+87).", permitidos).ok).toBe(false);
    expect(validarTexto("Ganan 1.581 en Pinto 45).", permitidos).ok).toBe(false);
  });
  it("los marcadores de lista al empezar línea siguen sin contar", () => {
    expect(validarTexto("1) Ganan 1.581.\n2) Es la mejor opción.", permitidos).ok).toBe(true);
  });
  it("los dígitos de ancho completo se normalizan y se comprueban", () => {
    expect(validarTexto("Faltan １２３ plazas.", permitidos).ok).toBe(false);
    expect(validarTexto("Ganan １.５８１.", permitidos).ok).toBe(true);
  });
});

describe("R2-M6: la zona admite las 11 zonas a la vez, como la web", () => {
  it("?zona=01,…,11 no da 400", async () => {
    const zona = Array.from({ length: 11 }, (_, i) => String(i + 1).padStart(2, "0")).join(",");
    expect(await preguntar(pet("hola", { zona }), montar(guion(() => texto("Hola."))))).toBe(200);
  });
});

describe("R2-M3 y R2-M10: adaptador de Vercel", () => {
  function res() {
    const r = { statusCode: 0, cuerpo: "", setHeader: () => r, end: (c: string) => { r.cuerpo = c; } };
    return r;
  }
  function req(cuerpo: Readable, tipo?: string) {
    return Object.assign(cuerpo, { method: "POST", headers: tipo ? { "content-type": tipo } : {}, socket: { remoteAddress: "1.2.3.4" } });
  }
  const apagado = {}; // sin AGENTE_ACTIVO: si llega a manejarAgente, 503
  it("un POST que no es JSON (text/plain, sin tipo) recibe 415 antes de leer nada", async () => {
    for (const tipo of ["text/plain", undefined, "application/x-www-form-urlencoded"]) {
      const r = res();
      await atender(req(Readable.from(["{}"]), tipo) as never, r as unknown as ServerResponse, apagado);
      expect(r.statusCode).toBe(415);
    }
  });
  it("con application/json pasa al agente (aquí apagado: 503)", async () => {
    const r = res();
    await atender(req(Readable.from(["{}"]), "application/json; charset=utf-8") as never, r as unknown as ServerResponse, apagado);
    expect(r.statusCode).toBe(503);
  });
  it("un flujo que se rompe al leer da 400, no un 500 de la plataforma", async () => {
    const roto = new Readable({ read() { this.destroy(new Error("conexión cortada")); } });
    const r = res();
    await atender(req(roto, "application/json") as never, r as unknown as ServerResponse, { ...ENV });
    expect(r.statusCode).toBe(400);
  });
});
