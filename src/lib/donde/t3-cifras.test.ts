// T3 (18-nov, tras los arreglos de R1): cifras clave de los datos publicados y DEA agrupados.
import { beforeAll, describe, expect, it } from "vitest";
import { fichaLugar } from "./agregados";
import { calcularEstado, plazasQueFaltan, umbralDeHoy } from "./cobertura";
import { cargarProyeccion, lectorNode } from "./cargar";
import { datosReales } from "./datosPrueba";
import type { Datos } from "./tipos";

let d: Datos;
beforeAll(async () => { d = await datosReales(); });

describe("T3 cifras clave", () => {
  it("población y mayores de 65", () => {
    const pob = d.secciones.pob as unknown as Record<string, number[]>;
    const suma = (k: string) => pob[k]!.reduce((a, b) => a + b, 0);
    expect(d.secciones.ids.length).toBe(4518);
    expect(suma("total")).toBe(7113886);
    expect(suma("65_mas")).toBe(1342648);
  });
  it("DEA: 10.551 puntos que suman 13.680 equipos", () => {
    const dea = d.servicios.dea!;
    const eq = (dea as unknown as { equipos?: number[] }).equipos!;
    expect(dea.ids.length).toBe(10551);
    expect(eq.reduce((a, b) => a + b, 0)).toBe(13680);
    expect(Math.max(...eq)).toBe(2200);
  });
  it("faltan 10.048 plazas hoy (IMSERSO España, por defecto) y 15.526 en 2030", async () => {
    const hoy = calcularEstado("residencia", d.secciones, d.servicios.residencia!, { radio_m: 10000 });
    expect(hoy.umbral).toBe(4.05);
    expect(Math.round(plazasQueFaltan(hoy))).toBe(10048);
    const r = await cargarProyeccion(lectorNode(new URL("../../../public/donde/", import.meta.url)), d.secciones);
    const u = umbralDeHoy("residencia", d.secciones, d.servicios.residencia!, 10000, "imserso_espana");
    const e30 = calcularEstado("residencia", r.secciones, d.servicios.residencia!, { radio_m: 10000, umbral: u });
    expect(Math.round(plazasQueFaltan(e30))).toBe(15526);
  });
  it("con la media de la Comunidad (caso explícito) faltan 10.689 plazas hoy y 16.280 en 2030", async () => {
    const hoy = calcularEstado("residencia", d.secciones, d.servicios.residencia!, { radio_m: 10000, umbral: "media" });
    expect(Math.round(plazasQueFaltan(hoy))).toBe(10689);
    const r = await cargarProyeccion(lectorNode(new URL("../../../public/donde/", import.meta.url)), d.secciones);
    const u = umbralDeHoy("residencia", d.secciones, d.servicios.residencia!, 10000, "media");
    const e30 = calcularEstado("residencia", r.secciones, d.servicios.residencia!, { radio_m: 10000, umbral: u });
    expect(Math.round(plazasQueFaltan(e30))).toBe(16280);
  });
  it("Retiro y Chamartín: ratio de DEA razonable tras agrupar los apilados", () => {
    const e = { dea: calcularEstado("dea", d.secciones, d.servicios.dea!, {}) };
    const fila = (id: string) => fichaLugar(id, e, d.territorios)!.servicios.find((x) => x.id === "dea")!;
    const ret = fila("dis:2807903"), cha = fila("dis:2807905");
    expect(ret.n).toBe(179);
    expect(ret.ratio!).toBeGreaterThan(500);
    expect(ret.ratio!).toBeLessThan(800);
    expect(cha.n).toBe(405);
    expect(cha.ratio!).toBeGreaterThan(300);
    expect(cha.ratio!).toBeLessThan(450);
  });
});
