import { describe, expect, it } from "vitest";
import { limpiarEvento } from "./analitica";

describe("analítica: solo se envía lo que no identifica a nadie", () => {
  it("quita sim, lugar, zona y el fragmento; deja vista, servicio y anio", () => {
    const e = limpiarEvento({ type: "pageview", url: "https://donde-hace-falta.vercel.app/?vista=donde&servicio=residencia&anio=2030&sim=40.24,-3.70&lugar=mun:28106&zona=04#x" });
    expect(e?.url).toBe("https://donde-hace-falta.vercel.app/?vista=donde&servicio=residencia&anio=2030");
  });
  it("sin parámetros, la ruta tal cual", () => {
    expect(limpiarEvento({ type: "pageview", url: "https://donde-hace-falta.vercel.app/" })?.url).toBe("https://donde-hace-falta.vercel.app/");
  });
  it("una URL no válida no se envía", () => {
    expect(limpiarEvento({ type: "pageview", url: "no es una url" })).toBeNull();
  });
});
