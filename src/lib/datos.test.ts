import { describe, expect, it, vi } from "vitest";
import respaldoReal from "../../public/respaldo/estado_actual.json";
import pronosticoReal from "../../public/respaldo/pronostico.json";
import {
  cargarEstado,
  cargarPronostico,
  EstadoInvalido,
  selloDeCapa,
  sellosDeCapas,
  validarEstado,
  vientoVigente,
} from "./datos";
import { estadoConPolen, estadoSinPolen } from "./pruebas";

const URL_RED = "https://ejemplo.test/estado_actual.json";
const URL_RESPALDO = "/respaldo/estado_actual.json";

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } });

/** `fetch` falso: cada URL devuelve lo que diga su función. */
function fetchFalso(rutas: Record<string, () => Response | Promise<Response>>) {
  return vi.fn(async (entrada: RequestInfo | URL) => {
    const ruta = rutas[String(entrada)];
    if (!ruta) throw new TypeError("Failed to fetch");
    return ruta();
  }) as unknown as typeof fetch;
}

const opciones = (pedir: typeof fetch) => ({ fetch: pedir, urlRed: URL_RED, urlRespaldo: URL_RESPALDO });

describe("validarEstado", () => {
  it("acepta el JSON real que genera el pipeline", () => {
    const estado = validarEstado(respaldoReal);
    expect(estado.riesgo).toHaveLength(28);
    expect(estado.viento).toHaveLength(42);
    expect(estado.observaciones.length).toBeGreaterThan(80);
    expect(estado.observaciones[0]?.serie).toHaveLength(24);
  });

  it("trata la capa polen como opcional", () => {
    const estado = validarEstado(estadoSinPolen());
    expect(estado.capas.polen).toBeUndefined();
    expect(estado.capas.aire.estado).toBe("ok");
  });

  it("conserva la capa polen cuando viene", () => {
    expect(validarEstado(estadoConPolen()).capas.polen?.ultimo_dato).toBe("2026-11-13");
  });

  it("descarta una capa polen mal formada sin invalidar el resto", () => {
    const json = { ...estadoSinPolen(), capas: { ...estadoSinPolen().capas, polen: { estado: "ok" } } };
    expect(validarEstado(json).capas.polen).toBeUndefined();
  });

  it.each([
    ["no es un objeto", null],
    ["otra versión", { ...estadoSinPolen(), version: 2 }],
    ["sin capa aire", { ...estadoSinPolen(), capas: { viento: estadoSinPolen().capas.viento } }],
    ["sin riesgo", { ...estadoSinPolen(), riesgo: [] }],
    ["sin observaciones", { ...estadoSinPolen(), observaciones: undefined }],
  ])("rechaza un JSON que no valida lo básico: %s", (_caso, json) => {
    expect(() => validarEstado(json)).toThrow(EstadoInvalido);
  });

  it("pinta como «sin dato» un nivel desconocido y descarta elementos rotos", () => {
    const json = structuredClone(estadoSinPolen()) as unknown as { riesgo: unknown[]; observaciones: unknown[]; viento: unknown[] };
    json.riesgo[0] = { ...(json.riesgo[0] as object), nivel: "extremo" };
    json.observaciones.push({ lugar: "est:1", variable: "no2", valor: "mucho" });
    json.viento.push({ lat: 40 });
    const estado = validarEstado(json);
    expect(estado.riesgo[0]?.nivel).toBe("sin_dato");
    expect(estado.observaciones).toHaveLength(3);
    expect(estado.viento).toHaveLength(4);
  });
});

describe("cargarEstado", () => {
  it("usa la red cuando responde y valida", async () => {
    const pedir = fetchFalso({ [URL_RED]: () => respuesta(estadoConPolen()) });
    const resultado = await cargarEstado(opciones(pedir));
    expect(resultado.origen).toBe("red");
    expect(resultado.motivo).toBeUndefined();
    expect(pedir).toHaveBeenCalledTimes(1);
  });

  it("usa el respaldo cuando falla la red", async () => {
    const pedir = fetchFalso({ [URL_RESPALDO]: () => respuesta(respaldoReal) });
    const resultado = await cargarEstado(opciones(pedir));
    expect(resultado.origen).toBe("respaldo");
    expect(resultado.motivo).toContain("Failed to fetch");
    expect(resultado.estado.generado).toBe(respaldoReal.generado);
    expect(resultado.estado.riesgo).toHaveLength(28);
  });

  it("usa el respaldo cuando el JSON publicado todavía no existe (404)", async () => {
    const pedir = fetchFalso({
      [URL_RED]: () => respuesta({ error: "Not Found" }, 404),
      [URL_RESPALDO]: () => respuesta(estadoSinPolen()),
    });
    const resultado = await cargarEstado(opciones(pedir));
    expect(resultado.origen).toBe("respaldo");
    expect(resultado.motivo).toBe("HTTP 404");
  });

  it("usa el respaldo cuando el JSON de la red no valida lo básico", async () => {
    const pedir = fetchFalso({
      [URL_RED]: () => respuesta({ version: 1, capas: {} }),
      [URL_RESPALDO]: () => respuesta(estadoSinPolen()),
    });
    const resultado = await cargarEstado(opciones(pedir));
    expect(resultado.origen).toBe("respaldo");
    expect(resultado.motivo).toContain("no válido");
  });

  it("usa el respaldo cuando la red devuelve algo que no es JSON", async () => {
    const pedir = fetchFalso({
      [URL_RED]: () => new Response("<html>mantenimiento</html>", { status: 200 }),
      [URL_RESPALDO]: () => respuesta(estadoSinPolen()),
    });
    expect((await cargarEstado(opciones(pedir))).origen).toBe("respaldo");
  });

  it("usa el respaldo cuando la red no contesta a tiempo", async () => {
    const pedir = vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      if (String(entrada) === URL_RESPALDO) return Promise.resolve(respuesta(estadoSinPolen()));
      return new Promise<Response>((_, rechazar) => {
        init?.signal?.addEventListener("abort", () => rechazar(new DOMException("Aborted", "AbortError")));
      });
    }) as unknown as typeof fetch;
    const resultado = await cargarEstado({ ...opciones(pedir), tiempoMaxMs: 20 });
    expect(resultado.origen).toBe("respaldo");
    expect(resultado.motivo).toBe("tiempo de espera agotado");
  });

  it("lanza un error si tampoco sirve el respaldo", async () => {
    const pedir = fetchFalso({ [URL_RESPALDO]: () => respuesta({ version: 99 }) });
    await expect(cargarEstado(opciones(pedir))).rejects.toThrow(/No se pudieron cargar los datos/);
  });

  it("funciona con el polen ausente y con el polen presente", async () => {
    const sin = await cargarEstado(opciones(fetchFalso({ [URL_RED]: () => respuesta(estadoSinPolen()) })));
    const con = await cargarEstado(opciones(fetchFalso({ [URL_RED]: () => respuesta(estadoConPolen()) })));
    expect(sin.estado.capas.polen).toBeUndefined();
    expect(sin.estado.riesgo[0]?.nivel_polen).toBe("sin_dato");
    expect(con.estado.capas.polen?.estado).toBe("ok");
    expect(con.estado.observaciones.some((o) => o.variable === "polen_gramineas")).toBe(true);
  });
});

describe("sello de cada capa", () => {
  const justoDespues = new Date("2026-11-15T13:40:00+01:00");

  it("marca el polen como no disponible si la capa falta", () => {
    const sellos = sellosDeCapas(estadoSinPolen(), "red", justoDespues);
    expect(sellos.polen).toMatchObject({ disponible: false, estado: "ausente", ultimoDato: null, aviso: null });
    expect(sellos.aire).toMatchObject({ disponible: true, estado: "ok", aviso: null });
    expect(sellos.viento.aviso).toBeNull();
  });

  it("da la fecha del polen cuando la capa está", () => {
    expect(sellosDeCapas(estadoConPolen(), "red", justoDespues).polen).toMatchObject({
      disponible: true,
      ultimoDato: "2026-11-13",
      aviso: null,
    });
  });

  it("avisa si el estado de la capa no es ok", () => {
    const estado = estadoSinPolen();
    estado.capas.aire.estado = "error";
    estado.capas.viento.estado = "antiguo";
    expect(selloDeCapa("aire", estado, "red", justoDespues).aviso).toMatch(/fuente no responde/);
    expect(selloDeCapa("viento", estado, "red", justoDespues).aviso).toMatch(/antiguo/i);
  });

  it("avisa si el dato de la red se ha quedado viejo aunque diga ok", () => {
    const tarde = new Date("2026-11-15T19:10:00+01:00");
    expect(selloDeCapa("aire", estadoSinPolen(), "red", tarde).aviso).toBe("Sin actualizar desde hace 6 horas");
    expect(vientoVigente(estadoSinPolen(), "red", tarde)).toBe(false);
  });

  it("mide el respaldo contra su propia fecha, no contra el reloj", () => {
    const tarde = new Date("2026-11-20T09:00:00+01:00");
    expect(selloDeCapa("aire", estadoSinPolen(), "respaldo", tarde).aviso).toBeNull();
    expect(vientoVigente(estadoSinPolen(), "respaldo", tarde)).toBe(true);
  });

  it("da por vigente el viento reciente y no el que no trae puntos", () => {
    expect(vientoVigente(estadoSinPolen(), "red", justoDespues)).toBe(true);
    expect(vientoVigente({ ...estadoSinPolen(), viento: [] }, "red", justoDespues)).toBe(false);
  });
});

describe("cargarPronostico", () => {
  const viejo = { ...pronosticoReal, generado: "2026-11-10T10:00:00+01:00" };
  const reciente = { ...pronosticoReal, generado: "2026-11-16T10:00:00+01:00" };
  const ahora = new Date("2026-11-16T11:00:00+01:00");
  const o = (pedir: typeof fetch) => ({ fetch: pedir, urlRed: URL_RED, urlRespaldo: URL_RESPALDO, ahora });

  it("usa la red si está al día", async () => {
    const r = await cargarPronostico(o(fetchFalso({ [URL_RED]: () => respuesta(reciente) })));
    expect(r.origen).toBe("red");
  });

  it("si la red tiene más de 3 h, usa la copia más reciente", async () => {
    const r = await cargarPronostico(o(fetchFalso({ [URL_RED]: () => respuesta(viejo), [URL_RESPALDO]: () => respuesta(reciente) })));
    expect(r.origen).toBe("respaldo");
    expect(r.motivo).toContain("3 horas");
  });

  it("si la red falla usa el respaldo", async () => {
    const r = await cargarPronostico(o(fetchFalso({ [URL_RESPALDO]: () => respuesta(pronosticoReal) })));
    expect(r.origen).toBe("respaldo");
  });

  it("lanza si no hay ninguno", async () => {
    await expect(cargarPronostico(o(fetchFalso({})))).rejects.toThrow();
  });
});
