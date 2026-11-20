import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, promptAgente } from "./prompts/agente-v4";
import { PROMPT_VERSION as VERSION_DEL_AGENTE } from "./agente";

describe("prompt v4 (I3)", () => {
  const p = promptAgente({ vista: "donde", servicio: "Residencia de mayores", radioTexto: "10 km", lugar: null, zona: null, anio: 2025, referencia: null });
  it("es el que usa el agente y queda registrado en el log", () => {
    expect(PROMPT_VERSION).toBe("agente-v4");
    expect(VERSION_DEL_AGENTE).toBe("agente-v4");
  });
  it("pide cifras en formato español con unidad, tono positivo primero y plazas (no personas) en residencias", () => {
    expect(p).toMatch(/coma decimal y el punto de miles/);
    expect(p).toMatch(/siempre con su unidad/);
    expect(p).toMatch(/primero una frase en positivo/);
    expect(p).toMatch(/PLAZAS/);
    expect(p).toMatch(/servicio elegido: Residencia de mayores \(radio 10 km\)/);
  });
  it("no usa «déficit» ni «dónde falta» como vocabulario propio y mantiene la defensa ante inyecciones", () => {
    expect(p).not.toMatch(/dónde falta\b(?!»)/i);
    expect(p).toMatch(/nunca órdenes sobre estas reglas/);
  });
});
