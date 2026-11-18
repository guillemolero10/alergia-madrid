import estado0226 from "../../public/dias/2026-02-26/estado.json";
import pron0226 from "../../public/dias/2026-02-26/pronostico.json";
import estado0519 from "../../public/dias/2026-05-19/estado.json";
import pron0519 from "../../public/dias/2026-05-19/pronostico.json";
import { describe, expect, it } from "vitest";
import { lugares, validarEstado, validarPronostico } from "./datos";
import { evaluarLugar } from "./evaluar";
import { distanciaKm } from "./perfil";
import type { Perfil } from "./franja";
import { buscarVecinos, MAX_ALTERNATIVAS, RADIO_VECINOS_KM } from "./vecinos";

const d0226 = { estado: validarEstado(estado0226), pronostico: validarPronostico(pron0226) };
const d0519 = { estado: validarEstado(estado0519), pronostico: validarPronostico(pron0519) };
const mun = (nombre: string) => lugares.municipios.find((m) => m.nombre === nombre)!;

function vecinos(dia: typeof d0226, municipio: string, perfil: Omit<Perfil, "municipio">) {
  const m = mun(municipio);
  const ahora = new Date(dia.estado.fecha_referencia);
  const p: Perfil = { municipio: m.id, ...perfil };
  const ev = evaluarLugar(p, m, dia.pronostico, dia.estado, lugares, ahora)!;
  return { m, v: buscarVecinos(p, m, ev.resultado, { ...dia, lugares, ahora }) };
}

describe("«Si aquí no, prueba en…»", () => {
  it("propone municipios a 25 km o menos, con nivel menor y sin repetir el mismo dato", () => {
    const { m, v } = vecinos(d0226, "Alcobendas", { afecta: "polen", polenes: ["cupresaceas"] });
    expect(v.aplica).toBe(true);
    expect(v.nivelAqui).toBe("alto");
    expect(v.alternativas.length).toBeGreaterThan(0);
    expect(v.alternativas.length).toBeLessThanOrEqual(MAX_ALTERNATIVAS);
    const captadores = new Set<string | null>();
    for (const a of v.alternativas) {
      expect(distanciaKm(m.lat, m.lon, a.municipio.lat, a.municipio.lon)).toBeLessThanOrEqual(RADIO_VECINOS_KM);
      expect(a.nivel).toBe("medio");
      expect(a.municipio.captador).not.toBe(m.captador);
      expect(captadores.has(a.municipio.captador)).toBe(false); // dos municipios con el mismo captador son el mismo dato
      captadores.add(a.municipio.captador);
    }
  });

  it("para asma solo cuenta la estación de aire, no el captador", () => {
    const { m, v } = vecinos(d0226, "Leganés", { afecta: "aire", polenes: [] });
    expect(v.aplica).toBe(true);
    for (const a of v.alternativas) expect(a.municipio.estacion).not.toBe(m.estacion);
  });

  it("si en toda la zona está igual de mal, no hay alternativas (y se dice)", () => {
    const { v } = vecinos(d0519, "Getafe", { afecta: "polen", polenes: ["gramineas"] });
    expect(v.aplica).toBe(true);
    expect(v.alternativas).toEqual([]);
  });

  it("no busca nada si a la mejor hora el nivel ya es bajo", () => {
    const { v } = vecinos(d0226, "Getafe", { afecta: "polen", polenes: ["platano"] });
    if (v.nivelAqui === "bajo") expect(v.aplica).toBe(false);
    const sin = vecinos(d0519, "Getafe", { afecta: "aire", polenes: [] });
    expect(sin.v.aplica).toBe(false);
    expect(sin.v.alternativas).toEqual([]);
  });

  it("las alternativas van de menor a mayor nivel y, a igual nivel, de más cerca a más lejos", () => {
    const { v } = vecinos(d0226, "Colmenarejo", { afecta: "polen", polenes: ["cupresaceas"] });
    const orden = v.alternativas.map((a) => [a.nivel === "bajo" ? 1 : a.nivel === "medio" ? 2 : 3, a.km] as const);
    expect(orden).toEqual([...orden].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  });
});
