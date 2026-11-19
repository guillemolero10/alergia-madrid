import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, promptAgente } from "./prompts/agente-v3";

describe("prompt v3", () => {
  const p = promptAgente({ vista: "donde", servicio: null, radioTexto: null, lugar: null, zona: null, anio: 2025, referencia: null });
  it("versión y regla de las filas aproximadas", () => {
    expect(PROMPT_VERSION).toBe("agente-v3");
    expect(p).toMatch(/aproximada: true/);
    expect(p).toMatch(/cifra no es fiable/);
  });
  it("tono de ayuda para decidir, sin «dónde falta»", () => {
    expect(p).not.toMatch(/dónde falta/i);
    expect(p).toMatch(/dónde ayudaría más/);
  });
});
