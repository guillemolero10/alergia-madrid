import { describe, expect, it } from "vitest";
import { validarCentros } from "./cargar";

const base = { version: 1, servicio: "otros_sociales", generado: "2026-11-18", ids: ["a", "b"], mun: ["mun:28079", "mun:28079"], lat: [40.4, 40.5], lon: [-3.7, -3.6] };

describe("validarCentros", () => {
  it("acepta otros_sociales sin columna de nombres (no se publican) y la rellena con vacíos", () => {
    const c = validarCentros(base, "servicios/otros_sociales.json");
    expect(c.nombres).toEqual(["", ""]);
    expect(c.ids).toEqual(["a", "b"]);
  });

  it("si trae nombres, deben cuadrar con los ids", () => {
    expect(validarCentros({ ...base, nombres: ["x", "y"] }, "r").nombres).toEqual(["x", "y"]);
    expect(() => validarCentros({ ...base, nombres: ["x"] }, "r")).toThrow(/nombres/);
  });

  it("sigue exigiendo mun, lat y lon", () => {
    expect(() => validarCentros({ ...base, lat: [1] }, "r")).toThrow(/lat/);
  });
});
