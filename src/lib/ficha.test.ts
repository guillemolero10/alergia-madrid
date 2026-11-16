import { describe, expect, it } from "vitest";
import { lugares } from "./datos";
import { construirFicha, municipiosSinEstacion, nivelDeCaptador } from "./ficha";
import { estadoConPolen, estadoSinPolen, LUGARES_PRUEBA } from "./pruebas";

describe("ficha de un lugar", () => {
  it("estación sin capa de polen: variables de aire ordenadas y aviso de polen", () => {
    const ficha = construirFicha("est:28065014", estadoSinPolen(), LUGARES_PRUEBA)!;
    expect(ficha.tipo).toBe("estacion");
    expect(ficha.nivel).toBe("bajo");
    expect(ficha.variablesAire.map((o) => o.variable)).toEqual(["no2", "o3"]);
    expect(ficha.captador).toMatchObject({ id: "cap:GETA", distKm: 1.46, ultimoDato: null });
    expect(ficha.polen).toEqual([]);
    expect(ficha.hayProvisionales).toBe(true);
    expect(ficha.avisos.map((a) => a.clave)).toEqual(["polen_sin_capa"]);
  });

  it("estación con polen: primero lo que más riesgo da y sin los tipos a cero", () => {
    const ficha = construirFicha("est:28065014", estadoConPolen(), LUGARES_PRUEBA)!;
    expect(ficha.nivel).toBe("alto");
    expect(ficha.nivelPolen).toBe("alto");
    expect(ficha.polen.map((o) => o.variable)).toEqual(["polen_gramineas", "polen_artemisia"]);
    expect(ficha.polenACero).toBe(1);
    expect(ficha.captador).toMatchObject({ ultimoDato: "2026-11-13", antiguedadDias: 2 });
    expect(ficha.avisos).toEqual([]);
  });

  it("avisa cuando el polen tiene más de 7 días", () => {
    const estado = estadoConPolen();
    estado.riesgo[0]!.polen_antiguedad_dias = 9;
    estado.riesgo[0]!.nivel_polen = "sin_dato";
    const ficha = construirFicha("est:28065014", estado, LUGARES_PRUEBA)!;
    expect(ficha.avisos.map((a) => a.clave)).toEqual(["polen_antiguo"]);
    expect(nivelDeCaptador(LUGARES_PRUEBA.captadores[0]!, estado, LUGARES_PRUEBA)).toBe("sin_dato");
  });

  it("Madrid: aire de la estación más cercana, polen de su propio captador y aviso de cobertura lejana", () => {
    const ficha = construirFicha("mun:28079", estadoConPolen(), LUGARES_PRUEBA)!;
    expect(ficha.tipo).toBe("municipio");
    expect(ficha.estacion).toEqual({ id: "est:28115003", nombre: "Pozuelo de Alarcón", distKm: 9.42 });
    expect(ficha.nivelAire).toBe("medio");
    expect(ficha.captador?.id).toBe("cap:AYTM");
    expect(ficha.captador?.antiguedadDias).toBe(3); // deducido: del 12 al 15 de noviembre
    expect(ficha.nivelPolen).toBe("alto");
    expect(ficha.nivel).toBe("alto");
    expect(ficha.avisos[0]?.clave).toBe("cobertura_lejana");
    expect(ficha.avisos[0]?.texto).toContain("9,4 km");
  });

  it("captador: su nivel es el máximo de sus pólenes", () => {
    const ficha = construirFicha("cap:GETA", estadoConPolen(), LUGARES_PRUEBA)!;
    expect(ficha.tipo).toBe("captador");
    expect(ficha.nivel).toBe("alto");
    expect(ficha.peorVariable).toBe("polen_gramineas");
    expect(ficha.variablesAire).toEqual([]);
  });

  it("captador sin datos este año", () => {
    const ficha = construirFicha("cap:LEGA", estadoConPolen(), LUGARES_PRUEBA)!;
    expect(ficha.nivel).toBe("sin_dato");
    expect(ficha.avisos.map((a) => a.clave)).toEqual(["captador_inactivo"]);
  });

  it("devuelve null si el lugar no existe", () => {
    expect(construirFicha("est:00000000", estadoSinPolen(), LUGARES_PRUEBA)).toBeNull();
    expect(construirFicha("otra:cosa", estadoSinPolen(), LUGARES_PRUEBA)).toBeNull();
  });
});

describe("lugares.json real", () => {
  it("trae 28 estaciones, 11 captadores y Madrid como único municipio sin estación", () => {
    expect(lugares.estaciones).toHaveLength(28);
    expect(lugares.captadores).toHaveLength(11);
    const sinEstacion = municipiosSinEstacion(lugares);
    expect(sinEstacion.map((m) => m.nombre)).toEqual(["Madrid"]);
    expect(sinEstacion[0]?.cobertura_aire).toBe("lejana");
  });
});
