import { describe, expect, it } from "vitest";
import pronosticoReal from "../../public/respaldo/pronostico.json";
import { validarPronostico } from "./datos";
import { calcularFranja, etiquetaVentana, variablesDelPerfil } from "./franja";
import type { ZonaPronostico } from "./tipos";

// 48 h desde el 16-nov-2026 a las 00:00 (hora de Madrid, +01:00).
const HORAS = Array.from({ length: 48 }, (_, i) => `2026-11-${i < 24 ? "16" : "17"}T${String(i % 24).padStart(2, "0")}:00:00+01:00`);
const A_LAS = (h: number, dia = 16) => new Date(`2026-11-${dia}T${String(h).padStart(2, "0")}:30:00+01:00`);

/** Zona con una variable: `niveles` por hora (por defecto 1) y `valores` por hora (por defecto 10). */
function zona(
  variables: Record<string, { niveles?: Record<number, number>; valores?: Record<number, number>; base?: number }>,
): ZonaPronostico {
  const z: ZonaPronostico = { lugar: "est:1", valores: {}, niveles: {} };
  for (const [v, cfg] of Object.entries(variables)) {
    z.niveles[v] = HORAS.map((_, i) => cfg.niveles?.[i] ?? cfg.base ?? 1);
    z.valores[v] = HORAS.map((_, i) => cfg.valores?.[i] ?? 10);
  }
  return z;
}
const rango = (a: number, b: number, v: number) => Object.fromEntries(Array.from({ length: b - a }, (_, i) => [a + i, v]));

describe("calcularFranja", () => {
  it("elige la mejor y la peor ventana del día", () => {
    // Ozono medio de 15 a 17, alto de 19 a 20; el resto bajo. Valores altos por la tarde.
    const z = zona({
      o3: { niveles: { ...rango(15, 18, 2), ...rango(19, 21, 3) }, valores: { ...rango(15, 18, 60), ...rango(19, 21, 90) } },
    });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: ["o3"], ahora: A_LAS(8) });
    expect(r.dia).toBe("hoy");
    expect(r.veredicto).toBe("alto");
    expect(r.todoIgual).toBe(false);
    expect(r.mejor?.nivel).toBe("bajo");
    expect(r.mejor?.horaHasta).toBe(r.mejor!.horaDesde + 3);
    expect(r.peor).toMatchObject({ horaDesde: 19, horaHasta: 21, nivel: "alto", culpable: "o3" });
    expect(etiquetaVentana(r.peor!)).toBe("19:00–21:00");
  });

  it("a igual nivel gana la ventana con menor valor normalizado", () => {
    // Todo bajo salvo una hora media (para que no sea «todo igual»); valores bajos solo de 12 a 14.
    const z = zona({ pm10: { niveles: { 18: 2 }, valores: { ...rango(7, 22, 30), ...rango(12, 15, 5), 18: 40 } } });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: ["pm10"], ahora: A_LAS(6) });
    expect(r.mejor).toMatchObject({ horaDesde: 12, horaHasta: 15, nivel: "bajo" });
  });

  it("a igual media gana la ventana más temprana", () => {
    const z = zona({ pm10: { niveles: { 18: 2 } } });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: ["pm10"], ahora: A_LAS(6) });
    expect(r.mejor?.horaDesde).toBe(7);
  });

  it("si todo está igual no hay mejor ni peor", () => {
    const r = calcularFranja({ horas: HORAS, zona: zona({ no2: {} }), variables: ["no2"], ahora: A_LAS(8) });
    expect(r.todoIgual).toBe(true);
    expect(r.mejor).toBeNull();
    expect(r.peor).toBeNull();
    expect(r.veredicto).toBe("bajo");
  });

  it("ignora las horas ya pasadas", () => {
    // Lo mejor era por la mañana (valores bajos de 8 a 11) pero son las 12:30.
    const z = zona({ pm10: { niveles: { 20: 2 }, valores: { ...rango(7, 22, 30), ...rango(8, 11, 1) } } });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: ["pm10"], ahora: A_LAS(12) });
    expect(r.dia).toBe("hoy");
    expect(r.mejor!.horaDesde).toBeGreaterThanOrEqual(12);
    expect(r.horas.filter((h) => h.pasada)).toHaveLength(12);
  });

  it("pasa a mañana cuando hoy ya no queda ventana", () => {
    const z = zona({ pm10: { niveles: { ...rango(24 + 9, 24 + 12, 2) } } });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: ["pm10"], ahora: A_LAS(21) });
    expect(r.dia).toBe("manana");
    expect(r.fechaDia).toBe("2026-11-17");
    expect(r.veredicto).toBe("medio");
    expect(r.mejor?.desde).toContain("2026-11-17");
  });

  it("`desde: manana` fuerza el día siguiente", () => {
    const r = calcularFranja({ horas: HORAS, zona: zona({ no2: {} }), variables: ["no2"], ahora: A_LAS(8), desde: "manana" });
    expect(r.dia).toBe("manana");
  });

  it("el culpable es la variable que da el peor nivel", () => {
    const z = zona({
      o3: { niveles: rango(19, 21, 3), valores: rango(19, 21, 100) },
      pm10: { niveles: rango(19, 21, 2), valores: rango(19, 21, 90) },
    });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: ["o3", "pm10"], ahora: A_LAS(8) });
    expect(r.peor?.culpable).toBe("o3");
    expect(r.horas[19]).toMatchObject({ nivel: "alto", culpable: "o3" });
  });

  it("sin dato en todas las horas no da veredicto", () => {
    const z = zona({ o3: { base: 0 } });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: ["o3"], ahora: A_LAS(8) });
    expect(r.veredicto).toBe("sin_dato");
    expect(r.mejor).toBeNull();
  });

  it("sin variables (polen que CAMS no prevé) no hay veredicto", () => {
    const z = zona({ no2: {} });
    const r = calcularFranja({ horas: HORAS, zona: z, variables: [], ahora: A_LAS(8) });
    expect(r.veredicto).toBe("sin_dato");
    expect(r.todoIgual).toBe(false);
  });
});

describe("variablesDelPerfil", () => {
  const z = zona({ no2: {}, o3: {}, pm10: {}, pm25: {}, polen_gramineas: {}, polen_olivo: {} });
  it("asma usa solo el aire", () => {
    expect(variablesDelPerfil({ afecta: "aire", polenes: ["gramineas"] }, z).variables).toEqual(["no2", "o3", "pm10", "pm25"]);
  });
  it("polen separa los tipos sin previsión", () => {
    const r = variablesDelPerfil({ afecta: "polen", polenes: ["gramineas", "cupresaceas", "platano"] }, z, ["polen_cupresaceas", "polen_platano"]);
    expect(r.variables).toEqual(["polen_gramineas"]);
    expect(r.sinPrevision).toEqual(["cupresaceas", "platano"]);
  });
  it("ambos suma aire y polen", () => {
    expect(variablesDelPerfil({ afecta: "ambos", polenes: ["olivo"] }, z).variables).toEqual(["no2", "o3", "pm10", "pm25", "polen_olivo"]);
  });
});

describe("con el pronóstico real", () => {
  it("Getafe y asma da un resultado coherente", () => {
    const p = validarPronostico(pronosticoReal);
    const zonaGetafe = p.zonas.find((x) => x.lugar === "est:28065014")!;
    const { variables } = variablesDelPerfil({ afecta: "aire", polenes: [] }, zonaGetafe, p.sin_pronostico);
    const ahora = new Date(Date.parse(p.horas[0]!) + 30 * 60_000);
    const r = calcularFranja({ horas: p.horas, zona: zonaGetafe, variables, ahora });
    expect(r.horas).toHaveLength(48);
    expect(["bajo", "medio", "alto"]).toContain(r.veredicto);
  });
});
