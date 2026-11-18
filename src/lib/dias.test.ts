import indiceJson from "../../public/dias/indice.json";
import estadoJson from "../../public/dias/2026-05-19/estado.json";
import estado0226 from "../../public/dias/2026-02-26/estado.json";
import pron0226 from "../../public/dias/2026-02-26/pronostico.json";
import pronosticoJson from "../../public/dias/2026-05-19/pronostico.json";
import { describe, expect, it } from "vitest";
import { lugares, selloDeCapa, sellosDeCapas, validarEstado, validarPronostico, vientoVigente } from "./datos";
import {
  busquedaConFecha,
  cargarDia,
  fechaCortaDia,
  fechaDeLaUrl,
  fechaEnIndice,
  fechaLargaDia,
  fechaSinAnio,
  validarIndice,
} from "./dias";
import respaldoEstado from "../../public/respaldo/estado_actual.json";
import respaldoPron from "../../public/respaldo/pronostico.json";
import { calcularFranja, medidasDelPerfil, variablesConMedidas, variablesDelPerfil, zonaDe } from "./franja";
import { formatearUltimoDato } from "./formato";

const archivos: Record<string, unknown> = {
  "indice.json": indiceJson,
  "2026-05-19/estado.json": estadoJson,
  "2026-05-19/pronostico.json": pronosticoJson,
  "2026-02-26/estado.json": estado0226,
  "2026-02-26/pronostico.json": pron0226,
};
const leer = (ruta: string) => archivos[ruta];

describe("fecha en la URL", () => {
  it("acepta fechas válidas y descarta el resto", () => {
    expect(fechaDeLaUrl("?fecha=2026-05-19")).toBe("2026-05-19");
    expect(fechaDeLaUrl("?fecha=2026-13-40")).toBeNull();
    expect(fechaDeLaUrl("?fecha=2026-02-30")).toBeNull();
    expect(fechaDeLaUrl("?fecha=ayer")).toBeNull();
    expect(fechaDeLaUrl("")).toBeNull();
  });
  it("conserva el resto de parámetros", () => {
    expect(busquedaConFecha("?base=raster", "2026-05-19")).toBe("?base=raster&fecha=2026-05-19");
    expect(busquedaConFecha("?fecha=2026-05-19&base=raster", null)).toBe("?base=raster");
    expect(busquedaConFecha("?fecha=2026-05-19", null)).toBe("");
  });
  it("solo vale una fecha que esté en el índice", () => {
    const indice = validarIndice(leer("indice.json"));
    expect(fechaEnIndice("2026-05-19", indice)).toBe("2026-05-19");
    expect(fechaEnIndice("2026-05-20", indice)).toBeNull();
    expect(fechaEnIndice(null, indice)).toBeNull();
  });
});

describe("textos de fecha", () => {
  it("formatea en español", () => {
    expect(fechaCortaDia("2026-05-19")).toBe("19 may");
    expect(fechaSinAnio("2026-03-05")).toBe("5 de marzo");
    expect(fechaLargaDia("2026-05-19")).toBe("19 de mayo de 2026");
  });
  it("en modo absoluto nunca dice hoy ni ayer", () => {
    const ref = new Date("2026-05-19T14:00:00+02:00");
    expect(formatearUltimoDato("2026-05-19T14:00:00+02:00", ref)).toBe("hoy, 14:00");
    expect(formatearUltimoDato("2026-05-19T14:00:00+02:00", ref, true)).toBe("19 may, 14:00");
    expect(formatearUltimoDato("2026-05-18", ref, true)).toBe("18 may");
  });
});

describe("índice", () => {
  it("ordena y descarta entradas rotas", () => {
    const r = validarIndice([{ fecha: "2026-05-19", titulo: "b", nota: "n" }, { fecha: "mal", titulo: "x" }, { fecha: "2026-02-26", titulo: "a" }, 3]);
    expect(r.map((d) => d.fecha)).toEqual(["2026-02-26", "2026-05-19"]);
    expect(validarIndice(null)).toEqual([]);
  });
  it("el índice empaquetado tiene los cinco días", () => {
    expect(validarIndice(leer("indice.json"))).toHaveLength(5);
  });
});

describe("día histórico empaquetado (2026-05-19)", () => {
  const estado = validarEstado(leer("2026-05-19/estado.json"));
  const pron = validarPronostico(leer("2026-05-19/pronostico.json"));
  const ref = new Date(estado.fecha_referencia);

  it("es modo histórico con referencia a las 14:00", () => {
    expect(estado.modo).toBe("historico");
    expect(ref.toISOString()).toBe("2026-05-19T12:00:00.000Z");
  });
  it("no avisa de datos antiguos aunque el reloj real esté lejos", () => {
    const sellos = sellosDeCapas(estado, "red", new Date("2026-11-16T10:00:00+01:00"));
    for (const s of Object.values(sellos)) expect(s.aviso).toBeNull();
    expect(selloDeCapa("polen", estado, "red", ref).aviso).toBeNull();
    expect(vientoVigente(estado, "red", ref)).toBe(true);
  });
  it("la franja con la referencia habla del 19 de mayo y marca las 14:00", () => {
    const zona = zonaDe(pron, "est:28065002") ?? pron.zonas[0]!;
    const vars = variablesDelPerfil({ afecta: "ambos", polenes: ["gramineas"] }, zona, pron.sin_pronostico);
    const r = calcularFranja({ horas: pron.horas, zona, variables: vars.variables, ahora: ref });
    expect(r.dia).toBe("hoy");
    expect(r.fechaDia).toBe("2026-05-19");
    expect(r.horas.find((h) => h.hora === 13 && h.fecha === "2026-05-19")?.pasada).toBe(true);
    expect(r.horas.find((h) => h.hora === 14 && h.fecha === "2026-05-19")?.pasada).toBe(false);
    if (r.mejor) expect(r.mejor.horaDesde).toBeGreaterThanOrEqual(14);
  });
});

describe("cargarDia", () => {
  it("lee estado y pronóstico y valida", async () => {
    const pedidas: string[] = [];
    const falso = (async (url: string) => {
      pedidas.push(url);
      const ruta = url.replace(/^.*\/dias\//, "");
      return { ok: true, status: 200, json: async () => leer(ruta) };
    }) as unknown as typeof fetch;
    const d = await cargarDia("2026-05-19", falso);
    expect(d.estado.modo).toBe("historico");
    expect(pedidas.sort()).toEqual([expect.stringContaining("2026-05-19/estado.json"), expect.stringContaining("2026-05-19/pronostico.json")]);
  });
  it("rechaza fechas inválidas y errores HTTP", async () => {
    await expect(cargarDia("../x")).rejects.toThrow();
    const f404 = (async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    await expect(cargarDia("2026-05-19", f404)).rejects.toThrow("HTTP 404");
  });
});

describe("lo medido manda sobre la previsión", () => {
  const getafe = lugares.municipios.find((m) => m.id === "mun:28065")!;
  const franja = (carpeta: string, afecta: "aire" | "polen" | "ambos", polenes: string[], ahora?: Date) => {
    const estado = validarEstado(archivos[`${carpeta}/estado.json`]);
    const pron = validarPronostico(archivos[`${carpeta}/pronostico.json`]);
    const ref = ahora ?? new Date(estado.fecha_referencia);
    const zona = zonaDe(pron, getafe.estacion)!;
    const vars = variablesDelPerfil({ afecta, polenes }, zona, pron.sin_pronostico);
    const medidas = medidasDelPerfil({ afecta, polenes }, estado, getafe, lugares, ref);
    return { medidas, r: calcularFranja({ horas: pron.horas, zona, variables: variablesConMedidas(vars.variables, medidas), ahora: ref, medidas }), sinPrevision: vars.sinPrevision };
  };

  it("19-may, Getafe, polen: gramíneas medidas en alto dan veredicto alto y ninguna buena hora", () => {
    const { r } = franja("2026-05-19", "polen", ["gramineas", "olivo"]);
    expect(r.veredicto).toBe("alto");
    expect(r.sinBuenaHora).toBe(true);
    const h = r.horas.find((x) => x.fecha === "2026-05-19" && x.hora === 15)!;
    expect(h.nivel).toBe("alto");
    expect(h.origen).toBe("medido");
    expect(h.lugarMedido).toMatch(/Getafe/i);
  });
  it("el polen medido no se aplica a otro día", () => {
    const { r } = franja("2026-05-19", "polen", ["gramineas"]);
    const manana = r.horas.find((x) => x.fecha === "2026-05-20" && x.hora === 12)!;
    expect(manana.origen).not.toBe("medido");
  });
  it("26-feb, cupresáceas (sin previsión CAMS) salen de lo medido: alto", () => {
    const { r, sinPrevision } = franja("2026-02-26", "polen", ["cupresaceas"]);
    expect(sinPrevision).toContain("cupresaceas");
    expect(r.veredicto).toBe("alto");
    expect(r.horas.find((x) => x.fecha === "2026-02-26" && x.hora === 15)?.origen).toBe("medido");
  });
  it("aire: el nivel medido solo cuenta en la hora de referencia", () => {
    const { medidas } = franja("2026-05-19", "aire", []);
    expect(medidas.length).toBeGreaterThan(0);
    expect(medidas.every((m) => m.desde && m.hasta && !m.dia)).toBe(true);
  });
  it("tiempo real con polen de hace días: no cambia nada respecto a la previsión", () => {
    const estado = validarEstado(respaldoEstado);
    const pron = validarPronostico(respaldoPron);
    const ahora = new Date("2026-11-16T10:27:00+01:00");
    const zona = zonaDe(pron, getafe.estacion)!;
    const vars = variablesDelPerfil({ afecta: "polen", polenes: ["gramineas", "olivo"] }, zona, pron.sin_pronostico);
    const medidas = medidasDelPerfil({ afecta: "polen", polenes: ["gramineas", "olivo"] }, estado, getafe, lugares, ahora);
    const con = calcularFranja({ horas: pron.horas, zona, variables: variablesConMedidas(vars.variables, medidas), ahora, medidas });
    const sin = calcularFranja({ horas: pron.horas, zona, variables: vars.variables, ahora });
    expect(con.veredicto).toBe(sin.veredicto);
    expect(con.horas.map((h) => h.nivel)).toEqual(sin.horas.map((h) => h.nivel));
  });
  it("si todo el día es alto propone la mejor franja del siguiente si es mejor", () => {
    const horas = Array.from({ length: 48 }, (_, i) => `2026-11-${i < 24 ? "16" : "17"}T${String(i % 24).padStart(2, "0")}:00:00+01:00`);
    const zona = { lugar: "e", valores: { o3: horas.map(() => 5) }, niveles: { o3: horas.map((_, i) => (i < 24 ? 3 : 1)) } };
    const r = calcularFranja({ horas, zona, variables: ["o3"], ahora: new Date("2026-11-16T08:30:00+01:00") });
    expect(r.sinBuenaHora).toBe(true);
    expect(r.mejorManana?.nivel).toBe("bajo");
  });
});
