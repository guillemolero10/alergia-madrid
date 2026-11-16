import { describe, expect, it } from "vitest";
import respaldoReal from "../../public/respaldo/estado_actual.json";
import { estadoSinPolen } from "./pruebas";
import { componentesViento, construirRejilla, puntoCardinal, rumboDeViento, vientoEn } from "./viento";

describe("viento", () => {
  it("la flecha apunta hacia donde sopla (lo contrario de la procedencia)", () => {
    expect(rumboDeViento(0)).toBe(180); // viene del norte → sopla hacia el sur
    expect(rumboDeViento(270)).toBe(90); // viene del oeste → sopla hacia el este
    expect(rumboDeViento(239)).toBe(59);
    expect(rumboDeViento(359)).toBe(179);
  });

  it("descompone en este y norte", () => {
    const oeste = componentesViento(270, 10);
    expect(oeste.u).toBeCloseTo(10);
    expect(oeste.v).toBeCloseTo(0);
    const norte = componentesViento(0, 10);
    expect(norte.u).toBeCloseTo(0);
    expect(norte.v).toBeCloseTo(-10);
  });

  it("nombra el punto cardinal de procedencia", () => {
    expect(puntoCardinal(0)).toBe("norte");
    expect(puntoCardinal(239)).toBe("suroeste");
    expect(puntoCardinal(350)).toBe("norte");
    expect(puntoCardinal(-90)).toBe("oeste");
  });

  it("monta la rejilla real de 42 puntos", () => {
    const rejilla = construirRejilla(respaldoReal.viento);
    expect(rejilla).not.toBeNull();
    expect(rejilla!.columnas * rejilla!.filas).toBe(42);
    expect(rejilla!.lonMin).toBeCloseTo(-4.55);
    expect(rejilla!.latMax).toBeCloseTo(41.15);
  });

  it("interpola dentro de la rejilla y no inventa fuera", () => {
    const rejilla = construirRejilla(estadoSinPolen().viento)!;
    const esquina = vientoEn(rejilla, -4.0, 40.0)!;
    expect(esquina.u).toBeCloseTo(10);
    const centro = vientoEn(rejilla, -3.75, 40.25)!;
    expect(centro.u).toBeCloseTo(7.5); // media de 10, 20, 0 y 0
    expect(centro.v).toBeCloseTo(7.5);
    expect(vientoEn(rejilla, -5, 40.2)).toBeNull();
    expect(vientoEn(rejilla, -3.7, 41)).toBeNull();
  });

  it("devuelve null si los puntos no forman una rejilla completa", () => {
    expect(construirRejilla(estadoSinPolen().viento.slice(0, 3))).toBeNull();
    expect(construirRejilla([])).toBeNull();
  });
});
