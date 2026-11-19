// Objetivos de rendimiento del plan (Node, con los datos reales).
import { beforeAll, describe, expect, it } from "vitest";
import { calcularEstado, optimo, simular } from "./cobertura";
import { datosReales } from "./datosPrueba";
import type { Datos } from "./tipos";

let datos: Datos;
beforeAll(async () => { datos = await datosReales(); });

function medir<T>(fn: () => T): { ms: number; valor: T } {
  const t0 = performance.now();
  const valor = fn();
  return { ms: performance.now() - t0, valor };
}

describe("rendimiento", () => {
  it("calcularEstado(dea) en frío < 300 ms (10.551 puntos x 4.518 secciones)", () => {
    const dea = datos.servicios.dea!;
    expect(dea.ids.length).toBe(10551); // 13.680 registrados; 3.135 apilados en 6 puntos (R1)
    const { ms } = medir(() => calcularEstado("dea", datos.secciones, dea));
    console.log(`calcularEstado(dea) = ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(300);
  });

  it("simular < 10 ms (distancia y plazas)", () => {
    const cs = calcularEstado("centro_salud", datos.secciones, datos.servicios.centro_salud!);
    const re = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!);
    simular(cs, { lat: 40.24, lon: -3.7 }); // calentamiento
    simular(re, { lat: 40.24, lon: -3.7 });
    for (const [e, nombre] of [[cs, "centro_salud"], [re, "residencia"]] as const) {
      const peor = Math.max(...[0, 1, 2, 3, 4].map(() => medir(() => simular(e, { lat: 40.4168, lon: -3.7038 })).ms));
      console.log(`simular(${nombre}) peor de 5 = ${peor.toFixed(2)} ms`);
      expect(peor).toBeLessThan(10);
    }
  });

  it("optimo del hospital con n = 3 < 800 ms (radio de 15 km)", () => {
    const h = calcularEstado("hospital", datos.secciones, datos.servicios.hospital!, { radio_m: 15000 });
    const { ms, valor } = medir(() => optimo(h, { n: 3 }));
    console.log(`optimo(hospital, n=3) = ${ms.toFixed(1)} ms, puntos: ${valor.puntos.length}`);
    expect(ms).toBeLessThan(800);
  });

  it("optimo de la residencia con n = 3 en toda la Comunidad < 800 ms", () => {
    const re = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!);
    const { ms, valor } = medir(() => optimo(re, { n: 3 }));
    console.log(`optimo(residencia, n=3) = ${ms.toFixed(1)} ms, puntos: ${valor.puntos.length}`);
    expect(valor.puntos.length).toBe(3);
    expect(ms).toBeLessThan(800);
  });
});
