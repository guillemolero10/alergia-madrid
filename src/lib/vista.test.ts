import { describe, expect, it } from "vitest";
import { busquedaConFecha } from "./dias";
import { busquedaConVista, centroDeLaUrl, vistaDeLaUrl } from "./vista";

describe("vista y centro en la URL", () => {
  it("lee la vista y cae en «Para ti» si no se entiende", () => {
    expect(vistaDeLaUrl("?vista=colegios")).toBe("colegios");
    expect(vistaDeLaUrl("?vista=casos")).toBe("casos");
    expect(vistaDeLaUrl("?vista=otra")).toBe("para-ti");
    expect(vistaDeLaUrl("")).toBe("para-ti");
  });
  it("el centro solo vale en la vista de colegios y con 8 cifras", () => {
    expect(centroDeLaUrl("?vista=colegios&centro=28000029")).toBe("28000029");
    expect(centroDeLaUrl("?centro=28000029")).toBeNull();
    expect(centroDeLaUrl("?vista=colegios&centro=abc")).toBeNull();
  });
  it("es compatible con ?fecha=", () => {
    const b = busquedaConVista("?fecha=2026-05-19", "colegios", "28000029");
    expect(new URLSearchParams(b).get("fecha")).toBe("2026-05-19");
    expect(new URLSearchParams(b).get("centro")).toBe("28000029");
    expect(vistaDeLaUrl(busquedaConFecha(b, null))).toBe("colegios");
    expect(centroDeLaUrl(busquedaConFecha(b, "2026-02-26"))).toBe("28000029");
  });
  it("«Para ti» no deja rastro y quita el centro", () => {
    expect(busquedaConVista("?vista=colegios&centro=28000029&fecha=2026-05-19", "para-ti")).toBe("?fecha=2026-05-19");
    expect(busquedaConVista("?vista=colegios&centro=28000029", "para-ti")).toBe("");
  });
});
