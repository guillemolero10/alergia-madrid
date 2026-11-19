// T2 (tester): bordes extra del motor y de las herramientas, más allá de los de T1.
import { beforeAll, describe, expect, it } from "vitest";
import { calcularEstado, optimo, simular } from "./cobertura";
import { datosReales } from "./datosPrueba";
import { crearEntorno, ejecutarHerramienta } from "./herramientas";
import type { Datos } from "./tipos";

let d: Datos;
beforeAll(async () => { d = await datosReales(); });
const est = (id: "residencia" | "farmacia" | "hospital", o = {}) => calcularEstado(id, d.secciones, d.servicios[id]!, o);

describe("T2: coordenadas extremas finitas (terminan y no dan NaN)", () => {
  // Hallazgo T2-5 (corregido, M-8): con (89.9, 179.9) simular tardaba ~13 s y con 1e6 o 1e300 no terminaba, porque
  // masCercano recorría anillos desde una celda a millones de celdas de la rejilla. Ahora parte de la celda más cercana.
  const puntos: [number, number][] = [[0, 0]];
  const colgantes: [number, number][] = [[89.9, 179.9], [-89, -179], [1e6, 1e6], [1e300, -1e300], [40.4, 1e300]];
  for (const [lat, lon] of colgantes) {
    it(`simular(${lat}, ${lon}) termina rápido`, () => {
      const t0 = Date.now();
      for (const id of ["farmacia", "residencia"] as const) {
        let r;
        try { r = simular(est(id), { lat, lon }); } catch (e) { expect(e).toBeInstanceOf(RangeError); continue; }
        expect(Number.isNaN(r.ganan)).toBe(false);
        expect(r.ganan).toBeGreaterThanOrEqual(0);
      }
      expect(Date.now() - t0).toBeLessThan(2000);
    });
  }
  for (const [lat, lon] of puntos) {
    it(`simular(${lat}, ${lon})`, () => {
      const t0 = Date.now();
      for (const id of ["farmacia", "residencia"] as const) {
        let r;
        try { r = simular(est(id), { lat, lon }); } catch (e) { expect(e).toBeInstanceOf(RangeError); continue; }
        expect(Number.isNaN(r.ganan)).toBe(false);
        expect(r.ganan).toBeGreaterThanOrEqual(0);
      }
      expect(Date.now() - t0).toBeLessThan(2000);
    });
  }
});

describe("T2: parámetros raros", () => {
  it("plazas Infinity / 0 / enormes en simular", () => {
    const e = est("residencia");
    for (const p of [Infinity, 0, 1e12, -Infinity]) {
      const r = simular(e, { lat: 40.3, lon: -3.7, plazas: p });
      expect(Number.isNaN(r.ganan)).toBe(false);
      expect(r.ganan).toBeGreaterThanOrEqual(0);
    }
  });
  it("optimo con n = Infinity, '2' o plazas raras", () => {
    const e = est("residencia");
    expect(optimo(e, { n: Infinity, zona: "04" }).puntos.length).toBeLessThanOrEqual(3);
    expect(optimo(e, { n: "2" as unknown as number, zona: "04" }).puntos.length).toBeGreaterThan(0);
    for (const plazas of [0, -5, NaN, Infinity]) {
      const o = optimo(e, { zona: "04", plazas });
      for (const p of o.puntos) expect(Number.isNaN(p.ganan)).toBe(false);
    }
  });
  it("optimo con zona o municipio inexistente no lanza", () => {
    const e = est("farmacia");
    expect(() => optimo(e, { zona: "99" })).not.toThrow();
    expect(() => optimo(e, { municipio: "mun:00000" })).not.toThrow();
    expect(() => optimo(e, { distrito: "dis:nada" })).not.toThrow();
    expect(optimo(e, { zona: "99" }).puntos.length).toBe(0);
  });
  it("calcularEstado con radios 0, negativo, Infinity", () => {
    for (const r of [0, -1, Infinity]) {
      try { const e = calcularEstado("farmacia", d.secciones, d.servicios.farmacia!, { radio_m: r }); expect(Number.isNaN(e.totalDeficit)).toBe(false); }
      catch (e) { expect(e).toBeInstanceOf(Error); }
    }
  });
});

describe("T2: herramientas con entrada hostil", () => {
  const ent = () => crearEntorno(d, { contexto: { vista: "donde", servicio: "residencia", radio_m: 10000, lugar: null } });
  const casos: [string, unknown][] = [
    ["simular_centro", { servicio: "residencia", lat: 1e300, lon: -3.7 }],
    ["simular_centro", { servicio: "residencia", lat: "40.2", lon: "-3.7" }],
    ["simular_centro", { servicio: "residencia", lugar: "Pinto", plazas: 1e9 }],
    ["simular_centro", { servicio: "residencia", lugar: "Pinto", plazas: -1 }],
    ["simular_centro", { servicio: "residencia", lugar: "Pinto", plazas: NaN }],
    ["ranking_deficit", { servicio: "farmacia", limite: 1e9 }],
    ["ranking_deficit", { servicio: "farmacia", limite: -3 }],
    ["ranking_deficit", { servicio: "farmacia", zona: "sur", nivel: "distrito" }],
    ["ranking_deficit", { servicio: "residencia", orden: "faltan", nivel: "distrito", zona: "04" }],
    ["ubicacion_optima", { servicio: "hospital", n: NaN }],
    ["ubicacion_optima", { servicio: "hospital", n: 1e9, lugar: "sierra" }],
    ["ubicacion_optima", { servicio: "dea", lugar: "Madrid", n: 3 }],
    ["ficha_municipio", { lugar: "" }],
    ["ficha_municipio", { lugar: "a".repeat(10000) }],
    ["ficha_municipio", { lugar: { x: 1 } }],
    ["ficha_municipio", null],
    ["mover_mapa", { lat: NaN, lon: NaN }],
    ["mover_mapa", { lugar: "Nowhere" }],
    ["nada", {}],
  ];
  for (const [n, e] of casos) {
    it(`${n}(${JSON.stringify(e)?.slice(0, 60)}) termina con resultado estructurado`, async () => {
      const t0 = Date.now();
      const r = await ejecutarHerramienta(n, e, ent());
      expect(typeof r.ok).toBe("boolean");
      expect(Date.now() - t0).toBeLessThan(5000);
      expect(JSON.stringify(r)).not.toMatch(/NaN|undefined|Infinity/);
    }, 15000);
  }
});
