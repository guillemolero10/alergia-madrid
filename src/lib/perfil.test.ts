import { describe, expect, it } from "vitest";
import { lugares } from "./datos";
import { PERFIL_INICIAL } from "./franja";
import { guardarPerfil, leerPerfil, LEJOS_KM, municipioMasCercano } from "./perfil";

const almacen = (valor: string | null) => ({ getItem: () => valor });

describe("perfil", () => {
  it("sin nada guardado arranca en Getafe con asma", () => {
    expect(leerPerfil(lugares, almacen(null))).toEqual(PERFIL_INICIAL);
    expect(PERFIL_INICIAL.municipio).toBe("mun:28065");
  });
  it("ida y vuelta", () => {
    let guardado = "";
    guardarPerfil({ municipio: "mun:28079", afecta: "ambos", polenes: ["olivo"] }, { setItem: (_, v) => void (guardado = v) });
    expect(leerPerfil(lugares, almacen(guardado))).toEqual({ municipio: "mun:28079", afecta: "ambos", polenes: ["olivo"] });
  });
  it("descarta datos inválidos", () => {
    expect(leerPerfil(lugares, almacen("{no json"))).toEqual(PERFIL_INICIAL);
    expect(leerPerfil(lugares, almacen('{"municipio":"x","afecta":"y","polenes":["zz","olivo"]}'))).toEqual({ ...PERFIL_INICIAL, polenes: ["olivo"] });
  });
});

describe("municipioMasCercano", () => {
  const muns = [
    { id: "mun:28065", nombre: "Getafe", lat: 40.3083, lon: -3.7327 },
    { id: "mun:28005", nombre: "Alcalá de Henares", lat: 40.4793, lon: -3.3779 },
  ];
  it("elige el más cercano y da la distancia", () => {
    const r = municipioMasCercano(40.3, -3.72, muns)!;
    expect(r.municipio.id).toBe("mun:28065");
    expect(r.km).toBeLessThan(2);
  });
  it("desde Toledo queda lejos de la cobertura", () => {
    const r = municipioMasCercano(39.8628, -4.0273, muns)!;
    expect(r.km).toBeGreaterThan(LEJOS_KM);
  });
  it("sin municipios devuelve null", () => {
    expect(municipioMasCercano(40, -3, [])).toBeNull();
  });
});
