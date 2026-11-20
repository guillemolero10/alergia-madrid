// Piezas pequeñas del servidor: validador de cifras, presupuesto, proveedor y adaptador de Vercel.
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { avisosDeConfiguracion, crearPresupuesto, diaMadrid, limiteIpDia, MAX_VISITANTES, proximoReinicio, topeDiarioUsd } from "./presupuesto";
import { avisosProveedor, llamarModelo, proveedorDesdeEntorno, ErrorProveedor, ErrorTiempo } from "./proveedor";
import { ipDe, leerCuerpo } from "./vercel";
import { esPermitido, numerosDelTexto, numerosPermitidos, paraElModelo, validarTexto } from "./validador";

describe("validador de cifras", () => {
  it("lee números en formato español y se salta horas y marcadores de lista (los años los trata `validarTexto`, con su contexto)", () => {
    expect(numerosDelTexto("Faltan 1.581 plazas (4,11 por cada 100) en 2030, a las 10:00.")).toEqual([1581, 4.11, 100, 2030]);
    expect(numerosDelTexto("1) Parla: 78,5 %; 2) Pinto: 40 %")).toEqual([78.5, 40]);
    expect(numerosDelTexto("la «Residencia 12 de Octubre» tiene 94 plazas")).toEqual([12, 94]);
    expect(numerosDelTexto("hay 4.321.000 personas")).toEqual([4321000]);
  });

  it("km por metros, fracciones como %, lo que dijo el usuario y el redondeo escrito (94 por 93,82); sin ±1 sobre un entero", () => {
    const p = numerosPermitidos([{ plazas: 94, radio_m: 10000, pct: 0.78, filas: [{ a: 1 }, { a: 2 }], criterio: "a menos de 10 km con 4,11 plazas", reduce: 93.82 }], ["una residencia de 150 plazas"]);
    for (const n of [94, 10, 78, 2, 4.11, 150]) expect(esPermitido(n, p), String(n)).toBe(true);
    expect(esPermitido(94, p, 0)).toBe(true);
    expect(esPermitido(93.8, p, 1)).toBe(true);
    expect(esPermitido(93.82, p, 2)).toBe(true);
    for (const n of [12345, 7, 4.5, 151.5, 93, 95, 151, 149, 79]) expect(esPermitido(n, p), String(n)).toBe(false);
    expect(esPermitido(Infinity, p)).toBe(false);
  });

  it("las coordenadas no cuentan como permitidas (el modelo no las ve)", () => {
    expect(paraElModelo({ puntos: [{ lat: 40.3, lon: -3.7, ganan: 5 }] })).toEqual({ puntos: [{ ganan: 5 }] });
    const p = numerosPermitidos([{ puntos: [{ lat: 40.3, lon: -3.7, ganan: 5 }] }]);
    expect(validarTexto("Ponla en 40,3", p).ok).toBe(false);
  });

  it("rechaza texto vacío, larguísimo, con enlaces o con cifras ajenas", () => {
    const p = numerosPermitidos([{ n: 5 }]);
    expect(validarTexto("Son 5.", p).ok).toBe(true);
    expect(validarTexto("  ", p)).toMatchObject({ ok: false, motivo: "vacio" });
    expect(validarTexto("a".repeat(2001), p)).toMatchObject({ ok: false, motivo: "largo" });
    expect(validarTexto("Mira parla.es", p)).toMatchObject({ ok: false, motivo: "enlaces" });
    expect(validarTexto("Son 6.000.", p)).toMatchObject({ ok: false, motivo: "cifras", detalle: "6.000" });
  });
});

describe("presupuesto: reserva en vuelo (T4-11) y visitantes (T4-12)", () => {
  const USO = { entrada: 0, salida: 0, razonamiento: 0, ms: 0 };
  it("las reservas cuentan para el tope hasta que se sueltan; soltar dos veces no resta dos veces", () => {
    const p = crearPresupuesto();
    const a = p.reservar(0.1, 0.06);
    const b = p.reservar(0.1, 0.06); // 0,06 < 0,1: todavía pasa
    expect(() => p.reservar(0.1, 0.06)).toThrow(/Tope diario/); // 0,12 >= 0,1
    expect(p.reservadoUsd()).toBeCloseTo(0.12, 6);
    a();
    a();
    expect(p.reservadoUsd()).toBeCloseTo(0.06, 6);
    p.anotar({ ...USO, costeUsd: 0.05 }); // el coste real sustituye a la reserva
    b();
    expect(p.reservadoUsd()).toBe(0);
    expect(p.gastadoHoyUsd()).toBeCloseTo(0.05, 6);
    expect(() => p.reservar(0.1, 0.06)).not.toThrow();
  });
  it("con tope 0 no se reserva nada", () => {
    expect(() => crearPresupuesto().reservar(0)).toThrow(/Tope diario/);
  });
  it("al llegar a 5.000 visitantes solo sale el más antiguo; los demás conservan su cupo", () => {
    const p = crearPresupuesto();
    for (let i = 0; i < MAX_VISITANTES; i++) p.consumirPregunta(`ip-${i}`, 1);
    expect(p.consumirPregunta("ip-1", 1)).toBeNull(); // sigue con su cupo gastado
    p.consumirPregunta("nuevo", 1); // expulsa a ip-0
    expect(p.consumirPregunta("ip-1", 1)).toBeNull(); // ip-1 NO se reinició
    expect(p.consumirPregunta("ip-4999", 1)).toBeNull();
    expect(p.consumirPregunta("ip-0", 1)).toEqual({ restantes: 0 }); // el expulsado vuelve a empezar (límite declarado)
  });
  it("avisos de arranque: límite por IP no válido y tope no válido; nada si está bien o sin definir", () => {
    expect(avisosDeConfiguracion({})).toEqual([]);
    expect(avisosDeConfiguracion({ AGENTE_LIMITE_IP_DIA: "25", AI_DAILY_BUDGET_USD: "2" })).toEqual([]);
    expect(avisosDeConfiguracion({ AGENTE_LIMITE_IP_DIA: "0" })[0]).toMatch(/AGENTE_LIMITE_IP_DIA.*se usa 10/);
    expect(avisosDeConfiguracion({ AGENTE_LIMITE_IP_DIA: "abc" })).toHaveLength(1);
    expect(avisosDeConfiguracion({ AGENTE_LIMITE_IP_DIA: "2.5" })).toHaveLength(1);
    expect(avisosDeConfiguracion({ AI_DAILY_BUDGET_USD: "mucho" })[0]).toMatch(/AI_DAILY_BUDGET_USD.*APAGADO/);
  });
});

describe("presupuesto", () => {
  const USO = { entrada: 0, salida: 0, razonamiento: 0, ms: 0 };
  it("valores por defecto: 3 $ y 10 preguntas; 0 apaga; basura en el tope apaga (R2-M5) y en el límite vuelve a 10", () => {
    expect(topeDiarioUsd({})).toBe(3);
    expect(topeDiarioUsd({ AI_DAILY_BUDGET_USD: "1.5" })).toBe(1.5);
    expect(topeDiarioUsd({ AI_DAILY_BUDGET_USD: "0" })).toBe(0);
    expect(topeDiarioUsd({ AI_DAILY_BUDGET_USD: "abc" })).toBe(0); // R2-M5: escrito y no válido = apagado
    expect(topeDiarioUsd({ AI_DAILY_BUDGET_USD: "-1" })).toBe(0);
    expect(topeDiarioUsd({ AI_DAILY_BUDGET_USD: "Infinity" })).toBe(0);
    expect(topeDiarioUsd({ AI_DAILY_BUDGET_USD: "" })).toBe(3);
    expect(limiteIpDia({})).toBe(10);
    expect(limiteIpDia({ AGENTE_LIMITE_IP_DIA: "25" })).toBe(25);
    expect(limiteIpDia({ AGENTE_LIMITE_IP_DIA: "0" })).toBe(10);
  });

  it("el contador y los cupos se reinician a medianoche de Madrid", () => {
    let t = Date.parse("2026-11-25T22:30:00Z"); // 23:30 en Madrid
    const p = crearPresupuesto(() => t);
    p.anotar({ ...USO, costeUsd: 2.9 });
    expect(() => p.comprobar(3)).not.toThrow();
    p.anotar({ ...USO, costeUsd: 0.2 });
    expect(() => p.comprobar(3)).toThrow(/Tope diario/);
    expect(p.consumirPregunta("ip", 1)).toEqual({ restantes: 0 });
    expect(p.consumirPregunta("ip", 1)).toBeNull();
    t = Date.parse("2026-11-25T23:30:00Z"); // 00:30 del 26 en Madrid
    expect(() => p.comprobar(3)).not.toThrow();
    expect(p.gastadoHoyUsd()).toBe(0);
    expect(p.consumirPregunta("ip", 1)).toEqual({ restantes: 0 });
  });

  it("devolver una pregunta libera el cupo; el reinicio es la próxima medianoche de Madrid", () => {
    const p = crearPresupuesto();
    p.consumirPregunta("a", 1);
    p.devolverPregunta("a");
    expect(p.consumirPregunta("a", 1)).toEqual({ restantes: 0 });
    const ahora = Date.parse("2026-11-25T10:00:00Z");
    const r = Date.parse(proximoReinicio(ahora));
    expect(diaMadrid(r - 120_000)).toBe("2026-11-25");
    expect(diaMadrid(r + 120_000)).toBe("2026-11-26");
  });
});

describe("proveedor", () => {
  it("sin clave no hay proveedor; con clave usa Baseten, el id normal y los precios de Muse Spark", () => {
    expect(proveedorDesdeEntorno({})).toBeNull();
    expect(proveedorDesdeEntorno({ BASETEN_API_KEY: "   " })).toBeNull();
    expect(proveedorDesdeEntorno({ BASETEN_API_KEY: "k" })).toMatchObject({
      baseUrl: "https://inference.baseten.co/v1",
      modelo: "meta-models/muse-spark-open",
      razonamiento: "low",
      precio: { entrada: 1.25, salida: 4.25 },
    });
  });

  it("con META_API_KEY usa la API de Meta (muse-spark-1.3) y tiene prioridad sobre Baseten", () => {
    const meta = { id: "meta", servicio: "Meta", baseUrl: "https://api.meta.ai/v1", modelo: "muse-spark-1.3", razonamiento: "low", precio: { entrada: 1.25, salida: 4.25 } };
    expect(proveedorDesdeEntorno({ META_API_KEY: "m" })).toMatchObject({ ...meta, apiKey: "m" });
    expect(proveedorDesdeEntorno({ META_API_KEY: "m", BASETEN_API_KEY: "b" })).toMatchObject({ ...meta, apiKey: "m" });
    expect(proveedorDesdeEntorno({ META_API_KEY: "  ", BASETEN_API_KEY: "b" })).toMatchObject({ id: "baseten", apiKey: "b" });
    expect(proveedorDesdeEntorno({ META_API_KEY: "m", META_MODEL: "otro", META_API_BASE_URL: "http://x/v1/" })).toMatchObject({ modelo: "otro", baseUrl: "http://x/v1" });
  });

  it("AGENTE_PROVEEDOR fuerza uno y, sin su clave, no pasa al otro; un valor mal escrito avisa y elige solo", () => {
    expect(proveedorDesdeEntorno({ AGENTE_PROVEEDOR: "baseten", META_API_KEY: "m", BASETEN_API_KEY: "b" })).toMatchObject({ id: "baseten", apiKey: "b" });
    expect(proveedorDesdeEntorno({ AGENTE_PROVEEDOR: " Meta ", META_API_KEY: "m", BASETEN_API_KEY: "b" })).toMatchObject({ id: "meta" });
    expect(proveedorDesdeEntorno({ AGENTE_PROVEEDOR: "baseten", META_API_KEY: "m" })).toBeNull();
    expect(proveedorDesdeEntorno({ AGENTE_PROVEEDOR: "meta", BASETEN_API_KEY: "b" })).toBeNull();
    expect(proveedorDesdeEntorno({ AGENTE_PROVEEDOR: "openai", BASETEN_API_KEY: "b" })).toMatchObject({ id: "baseten" });
    expect(avisosProveedor({ AGENTE_PROVEEDOR: "openai" })).toHaveLength(1);
    expect(avisosProveedor({ AGENTE_PROVEEDOR: "meta" })).toEqual([]);
    expect(avisosProveedor({})).toEqual([]);
  });

  const p = proveedorDesdeEntorno({ BASETEN_API_KEY: "k" })!;
  const ok = (extra: object = {}) => new Response(JSON.stringify({ choices: [{ message: { content: "hola" } }], usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }, ...extra }), { status: 200 });

  it("calcula el coste por llamada (1,25 $ + 4,25 $ por millón)", async () => {
    const r = await llamarModelo(p, [{ role: "user", content: "x" }], { limite: Date.now() + 5000, fetch: (async () => ok()) as unknown as typeof fetch });
    expect(r.uso.costeUsd).toBeCloseTo(5.5, 6);
  });

  it("ignora tool_calls mal formadas y distingue tiempo de error", async () => {
    const raro = (async () => new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ nada: 1 }, { id: "a", function: { name: "x", arguments: "{}" } }] } }] }), { status: 200 })) as unknown as typeof fetch;
    const r = await llamarModelo(p, [], { limite: Date.now() + 5000, fetch: raro });
    expect(r.llamadas).toHaveLength(1);
    await expect(llamarModelo(p, [], { limite: Date.now() - 1, fetch: raro })).rejects.toBeInstanceOf(ErrorTiempo);
    const cae = (async () => {
      throw new TypeError("fallo");
    }) as unknown as typeof fetch;
    await expect(llamarModelo(p, [], { limite: Date.now() + 5000, fetch: cae })).rejects.toBeInstanceOf(ErrorProveedor);
  });

  it("antes y despues se llaman en cada petición, también en el reintento por respuesta vacía", async () => {
    let n = 0;
    const f = (async () => (n++ === 0 ? new Response(JSON.stringify({ choices: [{ message: { content: "" } }], usage: { prompt_tokens: 10, completion_tokens: 20 } })) : ok())) as unknown as typeof fetch;
    let antes = 0;
    let despues = 0;
    await llamarModelo(p, [], { limite: Date.now() + 9000, fetch: f, antes: () => { antes++; }, despues: () => { despues++; } });
    expect([antes, despues]).toEqual([2, 2]);
  });
});

describe("proveedor: la reserva se suelta siempre", () => {
  const p = proveedorDesdeEntorno({ BASETEN_API_KEY: "k" })!;
  it("se llama a la función de `antes` al terminar cada petición, respondiera o fallara", async () => {
    let sueltas = 0;
    let en_vuelo = 0;
    const antes = () => {
      en_vuelo++;
      return () => { en_vuelo--; sueltas++; };
    };
    const fallos: (() => Promise<Response>)[] = [
      async () => new Response("{}", { status: 500 }),
      async () => { throw new TypeError("sin red"); },
      async () => new Response("<html>", { status: 200 }),
      async () => new Response(JSON.stringify({ choices: [{ message: { content: "hola" } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 }),
    ];
    for (const f of fallos) await llamarModelo(p, [], { limite: Date.now() + 9000, fetch: f as unknown as typeof fetch, antes }).catch(() => {});
    expect(sueltas).toBe(4);
    expect(en_vuelo).toBe(0);
  });
});

describe("adaptador de Vercel", () => {
  it("lee el cuerpo ya parseado por Vercel (objeto o texto) o el flujo", async () => {
    expect(await leerCuerpo({ body: { a: 1 } } as never)).toBe('{"a":1}');
    expect(await leerCuerpo({ body: '{"b":2}' } as never)).toBe('{"b":2}');
    const flujo = Object.assign(Readable.from([Buffer.from('{"c"'), Buffer.from(":3}")]), { headers: {} });
    expect(await leerCuerpo(flujo as never)).toBe('{"c":3}');
    const enorme = Object.assign(Readable.from([Buffer.alloc(1000, "x")]), { headers: {} });
    expect(await leerCuerpo(enorme as never, 10)).toBeNull();
  });

  it("la IP es la primera de x-forwarded-for", () => {
    expect(ipDe({ headers: { "x-forwarded-for": "5.6.7.8, 10.0.0.1" }, socket: {} } as never)).toBe("5.6.7.8");
    expect(ipDe({ headers: {}, socket: { remoteAddress: "::1" } } as never)).toBe("::1");
  });
});

describe("la función empaquetada (api/agente.js, la que ejecuta Vercel)", () => {
  it("existe, es un solo archivo sin imports relativos y responde 503 apagado sin AGENTE_ACTIVO", async () => {
    const { readFile } = await import("node:fs/promises");
    const codigo = await readFile(new URL("../api/agente.js", import.meta.url), "utf-8");
    // Solo módulos internos de Node: con "type": "module" Vercel no resolvería imports relativos sin extensión.
    for (const l of codigo.split("\n").filter((x) => /^import /.test(x))) expect(l).toMatch(/from "node:/);
    expect(codigo).not.toMatch(/BASETEN_API_KEY\s*[:=]\s*["'][A-Za-z0-9]/);
    const ruta = new URL("../api/agente.js", import.meta.url).href;
    const modulo = (await import(/* @vite-ignore */ ruta)) as { default: (req: unknown, res: unknown) => Promise<void> };
    const respuesta: { status?: number; cuerpo?: string } = {};
    const res = { setHeader() {}, end(c: string) { respuesta.cuerpo = c; }, set statusCode(v: number) { respuesta.status = v; } };
    const desactivado = process.env.AGENTE_ACTIVO;
    delete process.env.AGENTE_ACTIVO;
    try {
      await modulo.default({ method: "POST", headers: { "content-type": "application/json" }, socket: {}, body: "{}" }, res);
    } finally {
      if (desactivado !== undefined) process.env.AGENTE_ACTIVO = desactivado;
    }
    expect(respuesta.status).toBe(503);
    expect(JSON.parse(respuesta.cuerpo!)).toEqual({ error: "agente_no_disponible", motivo: "apagado" });
  });
});
