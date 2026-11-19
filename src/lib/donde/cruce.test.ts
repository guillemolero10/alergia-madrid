// T1: contraste TS vs Python (referencia.py) con puntos al azar (semilla fija) distintos de los 6 casos,
// y casos límite adicionales del motor. Fixture: `uv run --project pipeline python pipeline/tests/generar_cruce_donde.py`.
import { beforeAll, describe, expect, it } from "vitest";
import fx from "./cruce.fixture.json";
import { calcularEstado, optimo, simular } from "./cobertura";
import { datosReales } from "./datosPrueba";
import type { Datos } from "./tipos";

let d: Datos;
beforeAll(async () => { d = await datosReales(); });

describe("cruce con Python: distancia", () => {
  for (const c of fx.distancia) {
    it(`${c.servicio} r=${c.radio} (${c.lat}, ${c.lon})`, () => {
      const e = calcularEstado(c.servicio as "centro_salud", d.secciones, d.servicios[c.servicio as "centro_salud"]!, { radio_m: c.radio });
      expect(e.totalDeficit).toBe(c.deficit_total);
      expect(simular(e, { lat: c.lat, lon: c.lon }).ganan).toBe(c.ganan);
    });
  }
});

describe("cruce con Python: plazas (2SFCA) y óptimo", () => {
  for (const c of fx.plazas) {
    it(`residencia d0=${c.d0} plazas=${c.plazas} (${c.lat}, ${c.lon})`, () => {
      const e = calcularEstado("residencia", d.secciones, d.servicios.residencia!, { radio_m: c.d0, umbral: "media" });
      expect(e.umbral).toBeCloseTo(c.umbral, 9);
      expect(e.totalDeficit).toBe(c.deficit_total);
      const r = simular(e, { lat: c.lat, lon: c.lon, plazas: c.plazas });
      // N = plazas que faltan antes − después (umbral fijo), contra Python con 1e-5 de tolerancia
      expect(Math.abs(r.reduce! - c.reduce)).toBeLessThanOrEqual(1e-5);
      expect(r.seccionesMejoran!.length).toBe(c.mejoran);
      expect(Math.abs(r.faltanAntes! - c.faltan)).toBeLessThanOrEqual(1e-3);
      expect(r.reduce!).toBeLessThanOrEqual(c.plazas + 1e-9);
    });
  }
  for (const c of fx.optimo) {
    it(`óptimo n=1 zona ${c.zona} d0=${c.d0}: N y sección (con el desempate de Python)`, () => {
      const e = calcularEstado("residencia", d.secciones, d.servicios.residencia!, { radio_m: c.d0, umbral: "media" });
      const o = optimo(e, { n: 1, zona: c.zona, plazas: c.plazas });
      expect(Math.abs(o.puntos[0]!.reduce! - c.reduce)).toBeLessThanOrEqual(1e-5);
      expect(o.puntos[0]!.seccion).toBe(c.seccion);
    });
    it(`óptimo voraz n=2 zona ${c.zona} d0=${c.d0}`, () => {
      const e = calcularEstado("residencia", d.secciones, d.servicios.residencia!, { radio_m: c.d0, umbral: "media" });
      const o = optimo(e, { n: 2, zona: c.zona, plazas: c.plazas });
      expect(o.puntos.map((p) => p.seccion)).toEqual(c.voraz2.map((x) => x.seccion));
      o.puntos.forEach((p, k) => {
        expect(Math.abs(p.reduce! - c.voraz2[k]!.reduce)).toBeLessThanOrEqual(1e-5);
        expect(Math.abs(p.reduceAcumulado! - c.voraz2[k]!.acumulado)).toBeLessThanOrEqual(1e-5);
      });
    });
  }
});

describe("casos límite adicionales", () => {
  it("radio enorme (1e9 m) en distancia: nadie en déficit y no se cuelga", () => {
    const e = calcularEstado("farmacia", d.secciones, d.servicios.farmacia!, { radio_m: 1e9 });
    expect(e.totalDeficit).toBe(0);
    expect(simular(e, { lat: 40.4, lon: -3.7 }).ganan).toBe(0);
  });
  it("radio enorme en plazas (d0 = 1e7): finito y sin NaN", () => {
    const e = calcularEstado("residencia", d.secciones, d.servicios.residencia!, { radio_m: 1e7 });
    expect(Number.isFinite(e.umbral)).toBe(true);
    expect(e.valor.every(Number.isFinite)).toBe(true);
  });
  it("radio negativo o NaN lanzan error", () => {
    expect(() => calcularEstado("farmacia", d.secciones, d.servicios.farmacia!, { radio_m: -5 })).toThrow();
    expect(() => calcularEstado("farmacia", d.secciones, d.servicios.farmacia!, { radio_m: NaN })).toThrow();
  });
  it("sección sin población: no genera NaN ni la elige el óptimo", () => {
    const s = structuredClone(d.secciones);
    const k = 10;
    for (const g of Object.keys(s.pob)) (s.pob as any)[g][k] = 0;
    const e = calcularEstado("residencia", s, d.servicios.residencia!);
    expect(Number.isNaN(e.totalDeficit)).toBe(false);
    expect(e.valor.every((v) => !Number.isNaN(v))).toBe(true);
    const o = optimo(e, { n: 3 });
    expect(o.puntos.every((p) => p.indice !== k)).toBe(true);
    const f = calcularEstado("farmacia", s, d.servicios.farmacia!);
    expect(Number.isNaN(simular(f, { lat: s.lat[k]!, lon: s.lon[k]! }).ganan)).toBe(false);
  });
  it("todas las plazas null: umbral 0, sin déficit y simular no explota", () => {
    const c = structuredClone(d.servicios.residencia!);
    c.plazas = c.plazas!.map(() => null);
    const e = calcularEstado("residencia", d.secciones, c, { umbral: "media" });
    expect(e.plazasTotales).toBe(0);
    expect(e.totalDeficit).toBe(0);
    expect(Number.isNaN(simular(e, { lat: 40.3, lon: -3.7, plazas: 50 }).ganan)).toBe(false);
  });
  it("n mayor que los candidatos: devuelve los que hay (municipio de 1 sección)", () => {
    const e = calcularEstado("farmacia", d.secciones, d.servicios.farmacia!, { radio_m: 100 });
    const mun = d.secciones.mun[0]!;
    const nSec = d.secciones.mun.filter((m) => m === mun).length;
    const o = optimo(e, { n: 3, municipio: mun });
    expect(o.puntos.length).toBeLessThanOrEqual(Math.min(3, nSec));
    expect(o.candidatos).toBeLessThanOrEqual(nSec);
    expect(new Set(o.puntos.map((p) => p.seccion)).size).toBe(o.puntos.length);
  });
  it("n = 0, negativo, NaN o 99 se acotan a 1-3 sin lanzar", () => {
    const e = calcularEstado("farmacia", d.secciones, d.servicios.farmacia!);
    for (const n of [0, -2, 99, 2.7]) expect(optimo(e, { n, zona: "04" }).puntos.length).toBeGreaterThan(0);
  });
  // T1-2 (corregido): n = NaN se trata como 1.
  it("n = NaN se trata como 1", () => {
    const e = calcularEstado("farmacia", d.secciones, d.servicios.farmacia!);
    expect(optimo(e, { n: NaN, zona: "04" }).puntos.length).toBeGreaterThan(0);
  });
  // T1-1 (corregido): simular con lat/lon no finitas lanza RangeError en vez de colgarse.
  it("simular con coordenadas NaN o infinitas lanza un error claro y no se cuelga", () => {
    const e = calcularEstado("farmacia", d.secciones, d.servicios.farmacia!);
    expect(() => simular(e, { lat: NaN, lon: NaN })).toThrow(RangeError);
    expect(() => simular(e, { lat: 40.3, lon: Infinity })).toThrow(RangeError);
  });
  it("plazas negativas o NaN en simular no producen ganancias negativas ni NaN", () => {
    const e = calcularEstado("residencia", d.secciones, d.servicios.residencia!);
    for (const p of [-50, NaN]) {
      const r = simular(e, { lat: 40.3, lon: -3.7, plazas: p });
      expect(r.ganan).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(r.ganan)).toBe(false);
      expect(Number.isNaN(r.reduce!)).toBe(false);
    }
  });
  it("con plazas negativas, N no es positivo (no inventa plazas que faltan menos)", () => {
    const e = calcularEstado("residencia", d.secciones, d.servicios.residencia!);
    expect(simular(e, { lat: 40.3, lon: -3.7, plazas: -50 }).reduce!).toBeLessThanOrEqual(1e-9);
  });
});
