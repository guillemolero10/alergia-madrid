import { describe, expect, it } from "vitest";
import estadoHoy from "../../public/respaldo/estado_actual.json";
import pronosticoHoy from "../../public/respaldo/pronostico.json";
import estadoDia from "../../public/dias/2026-05-19/estado.json";
import pronosticoDia from "../../public/dias/2026-05-19/pronostico.json";
import { lugares } from "./datos";
import { construirFicha } from "./ficha";
import { medidasDelPerfil, zonaDe } from "./franja";
import type { EstadoActual, Pronostico } from "./tipos";

/** Misma normalización que el buscador de `SelectorPerfil` (nombre y alias, sin tildes; empieza por o contiene). */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
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
  const casos: [string, EstadoActual, Pronostico][] = [
    ["hoy", estadoHoy as unknown as EstadoActual, pronosticoHoy as unknown as Pronostico],
    ["2026-05-19", estadoDia as unknown as EstadoActual, pronosticoDia as unknown as Pronostico],
  ];
  it.each(casos)("Chinchón, %s: zona de pronóstico, ficha y medidas", (_f, estado, pron) => {
    expect(chinchon.cobertura_aire).toBe("lejana");
    const zona = zonaDe(pron, chinchon.estacion);
    expect(zona?.lugar).toBe(chinchon.estacion);
    const ficha = construirFicha(chinchon.id, estado, lugares);
    expect(ficha?.estacion?.id).toBe(chinchon.estacion);
    const medidas = medidasDelPerfil({ afecta: "ambos", polenes: ["gramineas"] }, estado, chinchon, lugares, new Date(estado.fecha_referencia));
    expect(Array.isArray(medidas)).toBe(true);
  });
  it("los 179 municipios tienen zona de pronóstico (la de su estación)", () => {
    for (const m of lugares.municipios) expect(zonaDe(pronosticoHoy as unknown as Pronostico, m.estacion), m.id).toBeDefined();
  });
});
