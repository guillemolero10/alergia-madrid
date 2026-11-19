// «Madrid en 2030»: carga, validación y cifras con los datos reales (referencia de residencias fija en el valor de hoy).
import { beforeAll, describe, expect, it } from "vitest";
import { calcularEstado, plazasQueFaltan, umbralDeHoy } from "./cobertura";
import { cargarProyeccion, lectorNode } from "./cargar";
import { datosReales } from "./datosPrueba";
import { crearEntorno, ejecutarHerramienta } from "./herramientas";
import { redactarResultado } from "./plantillas";
import { ErrorProyeccion, errorTipicoPct, fraseErrorProyeccion, territoriosConPoblacion, validarProyeccion, type Proyeccion } from "./proyeccion";
import metodologiaFuente from "../../componentes/Metodologia.tsx?raw";
import type { Datos, Secciones } from "./tipos";

let d: Datos, s30: Secciones, p: Proyeccion;
beforeAll(async () => {
  d = await datosReales();
  const r = await cargarProyeccion(lectorNode(new URL("../../../public/donde/", import.meta.url)), d.secciones);
  s30 = r.secciones;
  p = r.proyeccion;
});

describe("carga y validación", () => {
  it("cuadra con las 4.518 secciones, mismo orden, y solo cambia la población", () => {
    expect(p.n).toBe(4518);
    expect(s30.anio_poblacion).toBe(2030);
    expect(s30.ids).toBe(d.secciones.ids);
    expect(s30.pob["65_mas"].reduce((a, b) => a + b, 0)).toBe(1531180);
    expect(d.secciones.pob["65_mas"].reduce((a, b) => a + b, 0)).toBe(1342648);
  });
  it("rechaza un fichero de otro tamaño o roto", async () => {
    const crudo = (await lectorNode(new URL("../../../public/donde/", import.meta.url))("secciones_2030.json")) as any;
    expect(() => validarProyeccion({ ...crudo, n: 4517 }, d.secciones)).toThrow(ErrorProyeccion);
    expect(() => validarProyeccion({ ...crudo, pob: { ...crudo.pob, total: crudo.pob.total.slice(1) } }, d.secciones)).toThrow(/total/);
    expect(() => validarProyeccion({ ...crudo, anio: 2031 }, d.secciones)).toThrow(ErrorProyeccion);
    expect(() => validarProyeccion(null, d.secciones)).toThrow(ErrorProyeccion);
  });
  it("población de municipios y distritos recalculada desde las secciones", () => {
    const t = territoriosConPoblacion(d.territorios, s30);
    expect(t.municipios.reduce((a, m) => a + m.poblacion, 0)).toBe(7582867);
    expect(t.anio_poblacion).toBe(2030);
    expect(d.territorios.municipios.reduce((a, m) => a + m.poblacion, 0)).toBe(7113886);
  });
  it("la frase del error (panel y Metodología) sale del fichero y es la misma", () => {
    const f = fraseErrorProyeccion(p)!;
    expect(f).toContain("ponderado por población fue del 1,3 % en mayores de 65 y del 1,8 % en mayores de 75");
    expect(f).toContain("en un municipio típico, del 3,3 % y del 5,5 %");
    expect(metodologiaFuente.replace(/\s+/g, " ")).toContain(f);
    expect(fraseErrorProyeccion(null)).toBeNull();
  });
  it("el error típico sale del fichero: 3,3 % (65+) y 5,5 % (75+) por municipio", () => {
    expect(errorTipicoPct(p, "65_mas")).toBe(3.3);
    expect(errorTipicoPct(p, "75_mas")).toBe(5.5);
    expect(errorTipicoPct(null, "65_mas")).toBeNull();
  });
});

describe("residencias en 2030 con la referencia de hoy", () => {
  it("la referencia queda fija (la de hoy) y faltan unas 7.750 plazas más que hoy", () => {
    const hoy = calcularEstado("residencia", d.secciones, d.servicios.residencia!, { radio_m: 10000, umbral: "media" });
    const u = umbralDeHoy("residencia", d.secciones, d.servicios.residencia!, 10000, "media");
    expect(u).toBe(hoy.umbral);
    const e30 = calcularEstado("residencia", s30, d.servicios.residencia!, { radio_m: 10000, umbral: u });
    expect(e30.umbral).toBe(hoy.umbral);
    const dif = plazasQueFaltan(e30) - plazasQueFaltan(hoy);
    console.log(`faltan hoy ${plazasQueFaltan(hoy).toFixed(0)}; 2030 ${plazasQueFaltan(e30).toFixed(0)}; diferencia ${dif.toFixed(0)}`);
    expect(dif).toBeGreaterThan(5000);
    // Con la media recalculada con la población de 2030 la referencia cambiaría: es justo lo que no se debe hacer.
    expect(calcularEstado("residencia", s30, d.servicios.residencia!, { radio_m: 10000, umbral: "media" }).umbral).not.toBe(u);
  });
});

describe("el agente con 2030", () => {
  it("usa la referencia de hoy, lo avisa y marca el año en la acción", async () => {
    const ent = crearEntorno({ ...d, secciones: s30, servicios: { ...d.servicios } }, { seccionesHoy: d.secciones });
    const r = await ejecutarHerramienta("ubicacion_optima", { servicio: "residencia", zona: "sur" }, ent);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.salida as { anio_poblacion: number }).anio_poblacion).toBe(2030);
    expect(r.acciones[0]).toMatchObject({ tipo: "elegir_servicio", anio: 2030 });
    const t = redactarResultado(r);
    expect(t).toMatch(/^Cifras de 2030/);
    expect(t).toMatch(/media de la Comunidad|cubre/);
  });
});
