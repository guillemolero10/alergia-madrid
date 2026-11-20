import { describe, expect, it } from "vitest";
import { busquedaConVista, vistaDeLaUrl } from "./vista";

describe("vista en la URL", () => {
  it("lee la vista y cae en «¿Dónde hace falta?» si no se entiende", () => {
    expect(vistaDeLaUrl("?vista=municipio")).toBe("municipio");
    expect(vistaDeLaUrl("?vista=donde")).toBe("donde");
    expect(vistaDeLaUrl("?vista=colegios")).toBe("donde");
    expect(vistaDeLaUrl("?vista=otra")).toBe("donde");
    expect(vistaDeLaUrl("")).toBe("donde");
  });
  it("«Qué es» va en la URL y conserva lo demás", () => {
    expect(vistaDeLaUrl("?vista=acerca")).toBe("acerca");
    const b = busquedaConVista("?servicio=residencia&sim=40.242,-3.7", "acerca");
    expect(vistaDeLaUrl(b)).toBe("acerca");
    expect(new URLSearchParams(b).get("servicio")).toBe("residencia");
    expect(busquedaConVista(b, "donde")).toBe("?servicio=residencia&sim=40.242%2C-3.7");
  });
  it("conserva el resto de parámetros", () => {
    const b = busquedaConVista("?servicio=residencia&radio=10000", "municipio");
    const p = new URLSearchParams(b);
    expect(p.get("vista")).toBe("municipio");
    expect(p.get("servicio")).toBe("residencia");
    expect(p.get("radio")).toBe("10000");
    expect(vistaDeLaUrl(b)).toBe("municipio");
  });
  it("«donde» no deja rastro", () => {
    expect(busquedaConVista("?vista=municipio", "donde")).toBe("");
    expect(busquedaConVista("?vista=municipio&lugar=mun:28065", "donde")).toBe("?lugar=mun%3A28065");
  });
});
