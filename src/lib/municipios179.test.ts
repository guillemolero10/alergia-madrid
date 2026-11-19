import { describe, expect, it } from "vitest";
import estadoHoy from "../../public/respaldo/estado_actual.json";
import pronosticoHoy from "../../public/respaldo/pronostico.json";
import { lugares } from "./datos";
import { sinTildes } from "./texto";
import { medidasDelPerfil, zonaDe } from "./franja";
import type { EstadoActual, Pronostico } from "./tipos";

/** Búsqueda por nombre y alias, sin tildes (la base del buscador de «Mi municipio»). */
function buscar(texto: string) {
  const q = sinTildes(texto.trim());
  return lugares.municipios.filter((m) => [m.nombre, ...m.alias].map(sinTildes).some((n) => n.includes(q))).map((m) => m.nombre);
}

describe("179 municipios: búsqueda", () => {
  it.each([
    ["Chinchón", "Chinchón"],
    ["Villarejo de Salvanés", "Villarejo de Salvanés"],
    ["Rozas", "Las Rozas de Madrid"],
    ["alamo", "El Álamo"],
    ["san lorenzo", "San Lorenzo de El Escorial"],
  ])("«%s» encuentra %s", (texto, esperado) => {
    expect(buscar(texto)).toContain(esperado);
  });
});

describe("municipio sin estación propia usa la estación asignada", () => {
  const chinchon = lugares.municipios.find((m) => m.id === "mun:28052")!;
  it("Chinchón: zona de pronóstico y medidas", () => {
    const estado = estadoHoy as unknown as EstadoActual;
    const pron = pronosticoHoy as unknown as Pronostico;
    expect(chinchon.cobertura_aire).toBe("lejana");
    expect(zonaDe(pron, chinchon.estacion)?.lugar).toBe(chinchon.estacion);
    const medidas = medidasDelPerfil({ afecta: "ambos", polenes: ["gramineas"] }, estado, chinchon, lugares, new Date(estado.fecha_referencia));
    expect(Array.isArray(medidas)).toBe(true);
  });
  it("los 179 municipios tienen zona de pronóstico (la de su estación)", () => {
    for (const m of lugares.municipios) expect(zonaDe(pronosticoHoy as unknown as Pronostico, m.estacion), m.id).toBeDefined();
  });
});
