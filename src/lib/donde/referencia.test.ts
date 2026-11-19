// Contraste del motor de TypeScript con las cifras de `pipeline/donde/referencia.json` (Python, fuerza bruta).
import { beforeAll, describe, expect, it } from "vitest";
import referencia from "../../../pipeline/donde/referencia.json";
import { fichaLugar, ranking } from "./agregados";
import { calcularEstado, optimo, plazasQueFaltan, simular } from "./cobertura";
import { datosReales } from "./datosPrueba";
import type { Datos, EstadoServicio } from "./tipos";

const cerca = (real: number, esperado: number, tol: number) =>
  expect(Math.abs(real - esperado)).toBeLessThanOrEqual(Math.abs(esperado) * tol);
/** Tolerancia absoluta de las cifras N (plazas que faltan que se reducen) frente a Python. */
const TOL_N = 1e-5;

let datos: Datos;
let cs: EstadoServicio, fa: EstadoServicio, re: EstadoServicio;

beforeAll(async () => {
  datos = await datosReales();
  cs = calcularEstado("centro_salud", datos.secciones, datos.servicios.centro_salud!, { radio_m: referencia.caso1.radio_m });
  fa = calcularEstado("farmacia", datos.secciones, datos.servicios.farmacia!, { radio_m: referencia.caso2.radio_m });
  re = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!, { radio_m: referencia.caso3.d0_m, umbral: "media" });
});

describe("referencia.json", () => {
  it("es la versión 2 (métrica «plazas que faltan»)", () => {
    expect(referencia.version).toBe(2);
  });
});

describe("datos de partida", () => {
  it("las secciones y la población coinciden con la referencia", () => {
    expect(datos.secciones.ids.length).toBe(referencia.datos.secciones);
    expect(cs.totalObjetivo).toBe(referencia.datos.poblacion_total);
    expect(re.totalObjetivo).toBe(referencia.datos.mayores_65);
  });
});

describe("caso 1: centro de salud a más de 2 km", () => {
  it("personas en déficit (±0,5 %) y dentro de la banda de sensibilidad del radio ±1 %", () => {
    cerca(cs.totalDeficit, referencia.caso1.personas, 0.005);
    expect(cs.totalDeficit).toBeLessThanOrEqual(referencia.caso1.sensibilidad_personas["radio_x0.99"]);
    expect(cs.totalDeficit).toBeGreaterThanOrEqual(referencia.caso1.sensibilidad_personas["radio_x1.01"]);
    expect(Math.abs(cs.deficit.reduce((a, b) => a + b, 0) - referencia.caso1.secciones_en_deficit)).toBeLessThanOrEqual(
      referencia.caso1.secciones_a_menos_de_10m_del_radio,
    );
  });
});

describe("caso 2: farmacia a más de 1 km", () => {
  it("personas en déficit (±0,5 %) y dentro de la banda de sensibilidad", () => {
    cerca(fa.totalDeficit, referencia.caso2.personas, 0.005);
    expect(fa.totalDeficit).toBeLessThanOrEqual(referencia.caso2.sensibilidad_personas["radio_x0.99"]);
    expect(fa.totalDeficit).toBeGreaterThanOrEqual(referencia.caso2.sensibilidad_personas["radio_x1.01"]);
  });
});

describe("caso 3: residencias (2SFCA, d0 = 10 km)", () => {
  it("umbral = media de la Comunidad = plazas con coordenadas / mayores (el centro con plazas null cuenta 0)", () => {
    cerca(re.umbral, referencia.caso3.umbral_plazas_por_100_mayores, 1e-6);
    expect(re.plazasTotales).toBe(referencia.caso3.plazas_totales);
    cerca(re.umbral, (100 * re.plazasTotales!) / re.totalObjetivo, 1e-9);
  });
  it("mayores en déficit (±0,5 %)", () => {
    cerca(re.totalDeficit, referencia.caso3.personas, 0.005);
  });
  it("plazas que faltan con cada umbral (media, mediana e IMSERSO España y Madrid)", () => {
    for (const modo of ["media", "mediana", "imserso_espana", "imserso_madrid"] as const) {
      const e = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!, { radio_m: referencia.caso3.d0_m, umbral: modo });
      cerca(e.umbral, referencia.caso3.umbrales[modo], 1e-5);
      expect(Math.abs(plazasQueFaltan(e) - referencia.caso3.plazas_faltan[modo])).toBeLessThanOrEqual(1e-3);
    }
  });
  it("A_i mínimo y máximo", () => {
    expect(Math.min(...re.valor)).toBeCloseTo(referencia.caso3.A_min, 6);
    expect(Math.max(...re.valor)).toBeCloseTo(referencia.caso3.A_max, 4);
  });
});

/** El óptimo de TypeScript debe dar la misma sección (o una alternativa con el mismo N) y el mismo N. */
function contrasta(o: ReturnType<typeof optimo>, ref: { seccion: string; reduce_faltan: number; alternativas?: { seccion: string; reduce_faltan: number }[] }) {
  const p = o.puntos[0]!;
  expect(Math.abs(p.reduce! - ref.reduce_faltan)).toBeLessThanOrEqual(TOL_N);
  const validas = [ref, ...(ref.alternativas ?? [])].filter((a) => Math.abs(a.reduce_faltan - ref.reduce_faltan) <= TOL_N).map((a) => a.seccion);
  expect(validas).toContain(p.seccion);
}

describe("caso 4: óptimo n = 1 de una residencia de 94 plazas (N = plazas que faltan que se reducen)", () => {
  it("zona 04: Leganés, sección 2807405017, N = 93,82", () => {
    const o = optimo(re, { n: 1, zona: referencia.caso4.zona_candidatos, plazas: referencia.caso4.plazas });
    expect(o.candidatos).toBe(referencia.caso4.candidatos);
    contrasta(o, referencia.caso4);
    // El desempate («donde más falta») da exactamente la misma sección que Python.
    expect(o.puntos[0]!.seccion).toBe(referencia.caso4.seccion);
    expect(o.puntos[0]!.municipio).toBe(referencia.caso4.municipio);
    expect(Math.abs(o.faltanAntes! - referencia.caso4.faltan_antes)).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(o.faltanDespues! - referencia.caso4.faltan_despues)).toBeLessThanOrEqual(1e-3);
    const m = datos.territorios.municipios.find((x) => x.id === o.puntos[0]!.municipio)!;
    expect(m.zona).toBe("04");
  });
  it("toda la Comunidad: Madrid, sección 2807913014, N = 94 (el tope, ~630 secciones empatan)", () => {
    const o = optimo(re, { n: 1, plazas: referencia.caso4b.plazas });
    expect(o.candidatos).toBe(referencia.caso4b.candidatos);
    contrasta(o, referencia.caso4b);
    expect(o.puntos[0]!.seccion).toBe(referencia.caso4b.seccion);
    expect(Math.abs(o.puntos[0]!.reduce! - referencia.caso4b.plazas)).toBeLessThanOrEqual(TOL_N);
  });
  it("con cada una de las 4 referencias da el mismo óptimo que Python", () => {
    for (const modo of ["media", "mediana", "imserso_espana", "imserso_madrid"] as const) {
      const e = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!, { radio_m: 10000, umbral: modo });
      const esp = referencia.caso4.por_referencia[modo];
      const o = optimo(e, { n: 1, zona: "04", plazas: 94 });
      expect(Math.abs(o.puntos[0]!.reduce! - esp.reduce_faltan), modo).toBeLessThanOrEqual(TOL_N);
      expect(o.puntos[0]!.seccion, modo).toBe(esp.seccion);
    }
  });
});

describe("caso 5: lo que gana un centro en un punto fijo (Pinto)", () => {
  it("centro de salud (2 km): personas que ganan acceso, sin cambios", () => {
    const r = simular(cs, referencia.caso5.punto);
    cerca(r.ganan, referencia.caso5.centro_salud.ganan, 0.005);
    expect(r.secciones.length).toBe(referencia.caso5.centro_salud.secciones_que_ganan);
    expect(r.deficitDespues).toBe(r.deficitAntes - r.ganan);
    expect(r.reduce).toBeUndefined();
  });
  it("residencia de 94 plazas: N = 64,15 plazas que faltan menos", () => {
    const e = referencia.caso5.residencia;
    const r = simular(re, { ...referencia.caso5.punto, plazas: e.plazas });
    expect(Math.abs(r.reduce! - e.reduce_faltan)).toBeLessThanOrEqual(TOL_N);
    expect(r.seccionesMejoran!.length).toBe(e.secciones_que_mejoran);
    expect(Math.abs(r.faltanAntes! - e.faltan_antes)).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(r.faltanDespues! - e.faltan_despues)).toBeLessThanOrEqual(1e-3);
    expect(r.rNuevo).toBeCloseTo(e.r_nuevo, 8);
    expect(r.objetivoEnRadio).toBe(e.mayores_a_menos_de_d0);
    // N nunca supera las plazas del centro
    expect(r.reduce!).toBeLessThanOrEqual(e.plazas + 1e-9);
    cerca((100 * r.reduce!) / e.plazas, e.pct_del_maximo_posible, 1e-4);
  });
  it("residencia: con las 4 referencias da el N de Python", () => {
    for (const modo of ["media", "mediana", "imserso_espana", "imserso_madrid"] as const) {
      const e = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!, { radio_m: 10000, umbral: modo });
      const esp = referencia.caso5.residencia.por_referencia[modo];
      const r = simular(e, { ...referencia.caso5.punto, plazas: 94 });
      expect(Math.abs(r.reduce! - esp.reduce_faltan), modo).toBeLessThanOrEqual(TOL_N);
      expect(r.seccionesMejoran!.length, modo).toBe(esp.secciones_que_mejoran);
    }
  });
  it("Pinto logra el 68 % del óptimo de la zona 04", () => {
    const r = simular(re, { ...referencia.caso5.punto, plazas: 94 });
    const o = optimo(re, { n: 1, zona: "04", plazas: 94 });
    cerca((100 * r.reduce!) / o.puntos[0]!.reduce!, referencia.caso5.residencia.pct_del_optimo_zona_04, 1e-4);
  });
});

describe("caso 6: ranking de municipios en residencias", () => {
  const nombres = (f: { lugar: string }[]) => f.map((x) => x.lugar);
  it("por porcentaje", () => {
    const f = ranking(re, datos.territorios, { nivel: "municipio", orden: "pct", limite: referencia.caso6.limite });
    expect(nombres(f)).toEqual(nombres(referencia.caso6.por_pct));
    f.forEach((x, k) => {
      const r = referencia.caso6.por_pct[k]!;
      expect([x.objetivo, x.en_deficit, x.pct]).toEqual([r.objetivo, r.en_deficit, r.pct]);
    });
  });
  it("por personas, en toda la Comunidad y en la zona 04", () => {
    const f = ranking(re, datos.territorios, { orden: "personas", limite: 5 });
    expect(nombres(f)).toEqual(nombres(referencia.caso6.por_personas));
    const z = ranking(re, datos.territorios, { orden: "personas", limite: 5, zona: "04" });
    expect(nombres(z)).toEqual(nombres(referencia.caso6.zona_04_por_personas));
  });
});

describe("caso 6 (bis): ranking de residencias por plazas que faltan", () => {
  it("toda la Comunidad y zona 04: mismos municipios y mismas plazas que Python (redondeadas)", () => {
    const f = ranking(re, datos.territorios, { orden: "faltan", limite: 5 });
    expect(f.map((x) => x.lugar)).toEqual(referencia.caso6.por_plazas_faltan.map((x) => x.lugar));
    f.forEach((x, k) => expect(Math.abs(x.plazas_faltan! - referencia.caso6.por_plazas_faltan[k]!.plazas_faltan)).toBeLessThanOrEqual(0.5));
    const z = ranking(re, datos.territorios, { orden: "faltan", limite: 5, zona: "04" });
    expect(z.map((x) => x.lugar)).toEqual(referencia.caso6.zona_04_por_plazas_faltan.map((x) => x.lugar));
  });
});

describe("caso 7: voraz n = 3 de 94 plazas con la media", () => {
  for (const [nombre, zona, esperado] of [
    ["zona 04", "04", referencia.caso7.zona_04],
    ["toda la Comunidad", undefined, referencia.caso7.comunidad],
  ] as const) {
    it(nombre, () => {
      const o = optimo(re, { n: 3, ...(zona ? { zona } : {}), plazas: 94 });
      expect(o.puntos.length).toBe(3);
      o.puntos.forEach((p, k) => {
        const e = esperado[k]!;
        expect(Math.abs(p.reduce! - e.reduce_faltan), `paso ${k + 1}`).toBeLessThanOrEqual(TOL_N);
        expect(Math.abs(p.reduceAcumulado! - e.acumulado), `acumulado ${k + 1}`).toBeLessThanOrEqual(TOL_N);
        expect(p.seccion, `paso ${k + 1}`).toBe(e.seccion);
      });
      // sin repetir secciones
      expect(new Set(o.puntos.map((p) => p.seccion)).size).toBe(3);
      expect(Math.abs(o.reduce! - esperado[2]!.acumulado)).toBeLessThanOrEqual(TOL_N);
    });
  }
});

describe("sensibilidad del radio (declarada)", () => {
  it("cambiar el radio un 1 % mueve las personas dentro de la banda de la referencia", () => {
    const a = calcularEstado("centro_salud", datos.secciones, datos.servicios.centro_salud!, { radio_m: 2000 * 0.99 });
    const b = calcularEstado("centro_salud", datos.secciones, datos.servicios.centro_salud!, { radio_m: 2000 * 1.01 });
    expect(a.totalDeficit).toBe(referencia.caso1.sensibilidad_personas["radio_x0.99"]);
    expect(b.totalDeficit).toBe(referencia.caso1.sensibilidad_personas["radio_x1.01"]);
  });
  it("umbral ±1 % en residencias", () => {
    const u = referencia.caso3.umbral_plazas_por_100_mayores;
    const a = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!, { umbral: u * 0.99 });
    const b = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!, { umbral: u * 1.01 });
    expect(a.totalDeficit).toBe(referencia.caso3.sensibilidad_personas["umbral_x0.99"]);
    expect(b.totalDeficit).toBe(referencia.caso3.sensibilidad_personas["umbral_x1.01"]);
  });
});

describe("ficha: Parla", () => {
  it("devuelve una fila por servicio cargado", () => {
    const estados: Partial<Record<string, EstadoServicio>> = { centro_salud: cs, farmacia: fa, residencia: re };
    const f = fichaLugar("mun:28106", estados, datos.territorios)!;
    expect(f.nombre).toBe("Parla");
    expect(f.servicios.map((s) => s.id)).toEqual(["centro_salud", "residencia", "farmacia"]);
  });
});
