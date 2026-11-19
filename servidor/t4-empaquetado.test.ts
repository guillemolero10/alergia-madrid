// T4: la función empaquetada `api/agente.js` tal como la ejecuta Vercel: al día con `servidor/`, sin secretos, y funcionando desde una
// carpeta con solo lo que incluye `vercel.json` (`public/donde/**` menos el GeoJSON), con `req`/`res` simulados.
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import REF from "../pipeline/donde/referencia.json";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const API = path.join(RAIZ, "api/agente.js");

describe("T4 api/agente.js", () => {
  it("está al día: regenerarlo con construir-api.mjs da el mismo archivo", async () => {
    const antes = await readFile(API);
    try {
      execFileSync("node", ["scripts/construir-api.mjs"], { cwd: RAIZ, stdio: "pipe" });
      const despues = await readFile(API);
      expect(despues.equals(antes), "api/agente.js está desactualizado respecto a servidor/ y src/lib/donde/").toBe(true);
    } finally {
      await writeFile(API, antes); // no dejar cambios si estaba desactualizado
    }
  }, 120_000);

  it("sin secretos, rutas absolutas del Mac ni referencias a .env; tamaño razonable; solo imports de node:", async () => {
    const codigo = await readFile(API, "utf-8");
    expect(codigo).not.toMatch(/\/Users\/|\/private\/|\/var\/folders|gmolero|Guillermo Molero/);
    expect(codigo).not.toMatch(/sk-[A-Za-z0-9_-]{16,}|Bearer [A-Za-z0-9._-]{16,}|BASETEN_API_KEY\s*[:=]\s*["'`][^"'`]+["'`]/);
    expect(codigo).not.toMatch(/\.env(\.local)?["'`]/);
    expect((await stat(API)).size).toBeLessThan(400_000);
    for (const l of codigo.split("\n").filter((x) => /^\s*(import |export .* from )/.test(x))) expect(l).toMatch(/from "node:/);
    expect(codigo).not.toMatch(/\brequire\(/);
    // No incluye el código de la web (React, MapLibre).
    expect(codigo).not.toMatch(/maplibre|react-dom|createRoot/i);
  });

  it("vercel.json incluye public/donde y excluye solo el GeoJSON de contornos (que la función no lee)", async () => {
    const v = JSON.parse(await readFile(path.join(RAIZ, "vercel.json"), "utf-8"));
    expect(v.functions["api/agente.js"].includeFiles).toBe("public/donde/**");
    expect(v.functions["api/agente.js"].excludeFiles).toBe("public/donde/secciones.geojson");
    expect(v.functions["api/agente.js"].maxDuration).toBeGreaterThan(25); // el servidor corta a los 25 s
  });

  it("funciona desde una carpeta que solo tiene api/agente.js y public/donde (sin el GeoJSON): hoy, 2030, DEA, método y cuerpo raros", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "t4-vercel-"));
    try {
      await cp(API, path.join(tmp, "api/agente.js"));
      await cp(path.join(RAIZ, "public/donde"), path.join(tmp, "public/donde"), { recursive: true, filter: (o) => !o.endsWith("secciones.geojson") });
      await writeFile(
        path.join(tmp, "correr.mjs"),
        `
import { Readable } from "node:stream";
const llamadasModelo = [];
globalThis.fetch = async (url, init) => {
  const b = JSON.parse(init.body);
  llamadasModelo.push({ url: String(url), auth: init.headers.Authorization });
  const hayTool = b.messages.some((m) => m.role === "tool");
  if (!hayTool) {
    const args = b.messages.at(-1).content.includes("dea") ? { servicio: "dea", n: 1 } : { servicio: "residencia", zona: "sur" };
    return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "a", type: "function", function: { name: "ubicacion_optima", arguments: JSON.stringify(args) } }] } }], usage: { prompt_tokens: 3000, completion_tokens: 300 } }), { status: 200 });
  }
  return new Response(JSON.stringify({ choices: [{ message: { content: "Mira el punto marcado en el mapa." } }], usage: { prompt_tokens: 3500, completion_tokens: 200 } }), { status: 200 });
};
process.env.AGENTE_ACTIVO = "1";
process.env.BASETEN_API_KEY = "clave-falsa";
const { default: handler } = await import("./api/agente.js");
async function pedir({ metodo = "POST", cuerpo, flujo = false, cabeceras: extra = {} }) {
  const cabeceras = { "content-type": "application/json", ...extra };
  const r = { cabeceras: {} };
  const res = { setHeader(k, v) { r.cabeceras[k.toLowerCase()] = v; }, end(c) { r.cuerpo = c; }, set statusCode(v) { r.status = v; } };
  const req = flujo ? Object.assign(Readable.from([Buffer.from(cuerpo)]), { method: metodo, headers: cabeceras, socket: { remoteAddress: "127.0.0.1" } }) : { method: metodo, headers: cabeceras, socket: { remoteAddress: "127.0.0.1" }, body: cuerpo };
  await handler(req, res);
  return r;
}
const pet = (t, ctx = {}) => JSON.stringify({ mensajes: [{ rol: "usuario", texto: t }], contexto: { vista: "donde", servicio: null, radio_m: null, lugar: null, ...ctx } });
const salida = {};
let r = await pedir({ cuerpo: pet("¿Dónde pondrías una residencia en el sur?", { servicio: "residencia", radio_m: 10000, referencia: "media" }), cabeceras: { "x-forwarded-for": "8.8.8.8" } });
salida.hoy = { status: r.status, cabeceras: r.cabeceras, cuerpo: JSON.parse(r.cuerpo) };
r = await pedir({ cuerpo: pet("¿Dónde pondrías una residencia en el sur?", { servicio: "residencia", radio_m: 10000, anio: 2030 }), flujo: true, cabeceras: { "x-forwarded-for": "8.8.8.9" } });
salida.d2030 = { status: r.status, cuerpo: JSON.parse(r.cuerpo) };
r = await pedir({ cuerpo: pet("dónde pondrías un dea", { servicio: "dea", radio_m: 500 }), cabeceras: { "x-forwarded-for": "8.8.8.10" } });
salida.dea = { status: r.status, cuerpo: JSON.parse(r.cuerpo) };
r = await pedir({ metodo: "GET", cuerpo: "", flujo: true }); salida.get = { status: r.status };
r = await pedir({ cuerpo: "{no json" }); salida.malo = { status: r.status, cuerpo: r.cuerpo };
r = await pedir({ cuerpo: "x".repeat(500_000), flujo: true }); salida.enorme = { status: r.status };
r = await pedir({ cuerpo: "", flujo: true }); salida.sinCuerpo = { status: r.status };
salida.urls = [...new Set(llamadasModelo.map((l) => l.url))];
salida.auth = [...new Set(llamadasModelo.map((l) => l.auth))];
console.log(JSON.stringify(salida));
`,
      );
      const out = execFileSync("node", ["correr.mjs"], { cwd: tmp, encoding: "utf-8", env: { ...process.env, AGENTE_ACTIVO: "", BASETEN_API_KEY: "" }, timeout: 60_000 });
      const s = JSON.parse(out.trim().split("\n").at(-1)!);
      expect(s.hoy.status).toBe(200);
      expect(s.hoy.cabeceras["content-type"]).toMatch(/application\/json/);
      expect(s.hoy.cabeceras["cache-control"]).toBe("no-store");
      expect(s.hoy.cuerpo.modo).toBe("ia");
      const marcar = s.hoy.cuerpo.acciones.find((a: { tipo: string }) => a.tipo === "marcar_puntos");
      expect(Math.abs(marcar.puntos[0].lat - REF.caso4.lat)).toBeLessThan(1e-4); // el punto del caso 4 (Leganés)
      expect(Math.abs(marcar.puntos[0].lon - REF.caso4.lon)).toBeLessThan(1e-4);
      expect(s.d2030.status).toBe(200);
      expect(s.d2030.cuerpo.texto).toMatch(/2030/); // el aviso de proyección
      expect(s.dea.status).toBe(200);
      expect(s.dea.cuerpo.modo).toBe("ia");
      expect(s.get.status).toBe(405);
      expect(s.malo.status).toBe(400);
      expect(s.enorme.status).toBe(400);
      expect(s.sinCuerpo.status).toBe(400);
      expect(s.urls).toEqual(["https://inference.baseten.co/v1/chat/completions"]);
      expect(s.auth).toEqual(["Bearer clave-falsa"]);
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }, 120_000);
});
