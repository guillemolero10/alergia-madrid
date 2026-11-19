import { beforeAll, describe, expect, it } from "vitest";
import referencia from "../../../pipeline/donde/referencia.json";
import { calcularEstado, plazasQueFaltan } from "./cobertura";
import { datosReales } from "./datosPrueba";
import { CLASE_SIN_DEFICIT, SIN_POBLACION } from "./escalaColor";
import {
  coberturaPositiva,
  invitacionMapa,
  bboxLugar,
  bboxZona,
  cifraGrande,
  codigosZona,
  faltanPlazas,
  nombreZonas,
  decimalEs,
  decimal2Es,
  describirCentro,
  describirSeccion,
  enteroEs,
  filasRanking,
  opcionesReferencia,
  porcentajeEs,
  radioEs,
  valoresMapa,
} from "./panelDonde";
import { SERVICIO_IDS, SERVICIOS } from "./servicios";
import type { Datos } from "./tipos";

let datos: Datos;
beforeAll(async () => {
  datos = await datosReales();
});

const estado = (id: (typeof SERVICIO_IDS)[number], o: Parameters<typeof calcularEstado>[3] = {}) =>
  calcularEstado(id, datos.secciones, datos.servicios[id]!, o);

describe("formato en español", () => {
  it("miles con punto también en 4 cifras, decimales con coma", () => {
    expect(enteroEs(1234)).toBe("1.234");
    expect(enteroEs(999)).toBe("999");
    expect(enteroEs(1234567)).toBe("1.234.567");
    expect(enteroEs(-1500)).toBe("-1.500");
    expect(enteroEs(2.6)).toBe("3");
    expect(decimalEs(4.11)).toBe("4,1");
    expect(porcentajeEs(5.84)).toBe("5,8 %");
    expect(porcentajeEs(0.04)).toBe("menos del 0,1 %");
    expect(porcentajeEs(0)).toBe("0,0 %");
    expect(radioEs(500)).toBe("500 m");
    expect(radioEs(1000)).toBe("1 km");
    expect(radioEs(1500)).toBe("1,5 km");
    expect(radioEs(25000)).toBe("25 km");
  });
});

describe("valores que se pintan", () => {
  it("plazas: A_i en las secciones con mayores y -1 en las que no tienen", () => {
    const e = estado("residencia");
    const p = valoresMapa(e);
    expect(p.tipo).toBe("plazas");
    expect(p.centro).toBeCloseTo(e.umbral, 9);
    let sinMayores = 0;
    for (let i = 0; i < p.valores.length; i++) {
      if (datos.secciones.pob["65_mas"][i]! > 0) expect(p.valores[i]).toBe(e.valor[i]);
      else { expect(p.valores[i]).toBe(SIN_POBLACION); sinMayores++; }
    }
    expect(sinMayores).toBeLessThan(p.valores.length);
  });
  it("distancia: clases 0-3 en déficit, 4 sin déficit y -1 sin población; la clase más alta es la más densa", () => {
    const e = estado("farmacia");
    const p = valoresMapa(e);
    expect(p.tipo).toBe("clases");
    expect(p.cortes![1]).toBeGreaterThan(p.cortes![0]);
    const area = datos.secciones.area_km2;
    const total = datos.secciones.pob.total;
    let enDeficit = 0;
    const porClase = [0, 0, 0, 0];
    for (let i = 0; i < p.valores.length; i++) {
      const v = p.valores[i]!;
      if (total[i]! <= 0) expect(v).toBe(SIN_POBLACION);
      else if (e.deficit[i]) { expect([0, 1, 2, 3]).toContain(v); enDeficit++; porClase[v]! += total[i]!; }
      else expect(v).toBe(CLASE_SIN_DEFICIT);
      if (v === 3) expect(total[i]! / area[i]!).toBeGreaterThanOrEqual(p.cortes![2]);
    }
    expect(enDeficit).toBe(e.deficit.reduce((a, b) => a + b, 0) - 0 - (e.deficit.reduce((a, b, i) => a + (b && total[i]! <= 0 ? 1 : 0), 0)));
    // reparto razonable: ninguna clase se queda vacía
    for (const n of porClase) expect(n).toBeGreaterThan(0);
  });
  it("repintar al cambiar de servicio (estado + valores de los 6) cuesta mucho menos de 1 s", () => {
    const t0 = performance.now();
    for (const id of SERVICIO_IDS) valoresMapa(estado(id));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("referencias", () => {
  it("residencia: media de la Comunidad, España y Madrid (IMSERSO) con su fuente", () => {
    const o = opcionesReferencia(estado("residencia"));
    expect(o.map((x) => x.id)).toEqual(["imserso_espana", "imserso_madrid", "media"]);
    expect(o[2]!.valor).toBeCloseTo(referencia.caso3.umbral_plazas_por_100_mayores, 5);
    expect(o[0]!.valor).toBe(4.05);
    expect(o[1]!.valor).toBe(4.21);
    expect(o[0]!.url).toContain("imserso.es");
    for (const x of o) expect(x.fuente.length).toBeGreaterThan(20);
  });
  it("los servicios por distancia no tienen referencias de plazas (y los centros de día ya no son un servicio)", () => {
    expect(opcionesReferencia(estado("farmacia"))).toEqual([]);
    expect(SERVICIO_IDS).not.toContain("centro_dia");
    expect(SERVICIO_IDS.filter((id) => SERVICIOS[id].metrica === "plazas")).toEqual(["residencia"]);
  });
  it("elegir cada referencia cambia el umbral del estado y la cifra de plazas que faltan", () => {
    const faltan = (u: "media" | "imserso_espana" | "imserso_madrid") => plazasQueFaltan(estado("residencia", { umbral: u }));
    const a = faltan("media");
    const b = faltan("imserso_espana");
    const c = faltan("imserso_madrid");
    expect(estado("residencia", { umbral: "imserso_espana" }).umbral).toBe(4.05);
    expect(estado("residencia", { umbral: "imserso_madrid" }).umbral).toBe(4.21);
    // más exigente = faltan más plazas
    expect(c).toBeGreaterThan(a);
    expect(a).toBeGreaterThan(b);
    expect(Math.round(a)).toBeGreaterThan(9000);
  });
});

describe("cifra grande", () => {
  it("toda la Comunidad en servicios por distancia: lo mismo que el motor", () => {
    const e = estado("centro_salud");
    const c = cifraGrande(e, datos.territorios, null);
    expect(c.enDeficit).toBe(e.totalDeficit);
    expect(c.objetivo).toBe(e.totalObjetivo);
    expect(c.pct).toBeCloseTo((100 * e.totalDeficit) / e.totalObjetivo, 9);
    expect(c.plazasFaltan).toBeNull();
    expect(c.ambito).toBe("la Comunidad de Madrid");
  });
  it("residencias: faltan N plazas = plazasQueFaltan", () => {
    const e = estado("residencia");
    const c = cifraGrande(e, datos.territorios, null);
    expect(c.plazasFaltan).toBeCloseTo(plazasQueFaltan(e), 6);
    expect(c.plazasFaltan!).toBeGreaterThan(0);
  });
  it("una zona: las zonas suman la Comunidad", () => {
    const e = estado("residencia");
    let faltan = 0, def = 0, obj = 0;
    for (const z of datos.territorios.zonas) {
      const c = cifraGrande(e, datos.territorios, z.codigo);
      faltan += c.plazasFaltan!; def += c.enDeficit; obj += c.objetivo;
    }
    const total = cifraGrande(e, datos.territorios, null);
    expect(faltan).toBeCloseTo(total.plazasFaltan!, 3);
    expect(def).toBeCloseTo(total.enDeficit, 3);
    expect(obj).toBeCloseTo(total.objetivo, 3);
    expect(cifraGrande(e, datos.territorios, "04").ambito).toBe("Sur Metropolitano");
  });
  it("una zona sin déficit devuelve 0 personas (se avisa en la pantalla)", () => {
    // Hospitales a 25 km: ninguna zona poblada queda fuera, y la sierra tampoco
    const e = estado("farmacia", { radio_m: 2000 });
    const sinDeficit = datos.territorios.zonas.map((z) => cifraGrande(e, datos.territorios, z.codigo)).filter((c) => c.enDeficit === 0);
    for (const c of sinDeficit) expect(c.pct).toBe(0);
  });
  it("una zona que no existe no rompe nada", () => {
    const c = cifraGrande(estado("farmacia"), datos.territorios, "99");
    expect(c.enDeficit).toBe(0);
    expect(c.objetivo).toBe(0);
  });
});

describe("ranking del panel", () => {
  const nombres = (f: { lugar: string }[]) => f.map((x) => x.lugar);
  const re = () => estado("residencia", { radio_m: referencia.caso3.d0_m, umbral: "media" });
  it("residencias por % y por personas coincide con el caso 6 de referencia.json", () => {
    const e = re();
    expect(nombres(filasRanking(e, datos.territorios, { nivel: "municipio", zona: null, orden: "pct", limite: referencia.caso6.limite }))).toEqual(
      nombres(referencia.caso6.por_pct),
    );
    expect(nombres(filasRanking(e, datos.territorios, { nivel: "municipio", zona: null, orden: "personas", limite: 5 }))).toEqual(
      nombres(referencia.caso6.por_personas),
    );
    expect(nombres(filasRanking(e, datos.territorios, { nivel: "municipio", zona: "04", orden: "personas", limite: 5 }))).toEqual(
      nombres(referencia.caso6.zona_04_por_personas),
    );
  });
  it("por defecto son 10 filas y por «faltan» salen ordenadas por plazas que faltan", () => {
    const f = filasRanking(re(), datos.territorios, { nivel: "municipio", zona: null, orden: "faltan" });
    expect(f).toHaveLength(10);
    for (let k = 1; k < f.length; k++) expect(f[k - 1]!.plazas_faltan!).toBeGreaterThanOrEqual(f[k]!.plazas_faltan!);
    expect(f[0]!.plazas_faltan).toBeGreaterThan(0);
  });
  it("el filtro de zona solo deja municipios de esa zona", () => {
    const f = filasRanking(re(), datos.territorios, { nivel: "municipio", zona: "04", orden: "pct" });
    const zona = new Map(datos.territorios.municipios.map((m) => [m.id, m.zona]));
    expect(f.length).toBeGreaterThan(0);
    for (const x of f) expect(zona.get(x.lugar)).toBe("04");
  });
  it("distritos: solo los 21 de la capital", () => {
    const f = filasRanking(re(), datos.territorios, { nivel: "distrito", zona: null, orden: "pct", limite: 30 });
    expect(f.length).toBeLessThanOrEqual(21);
    for (const x of f) expect(x.lugar.startsWith("dis:")).toBe(true);
  });
  it("en servicios por distancia no hay plazas que faltan", () => {
    const f = filasRanking(estado("farmacia"), datos.territorios, { nivel: "municipio", zona: null, orden: "pct" });
    expect(f[0]!.plazas_faltan).toBeUndefined();
  });
});

describe("recuadros y ventanitas", () => {
  it("bbox de zona = unión de sus municipios; bbox de un municipio y de un distrito", () => {
    const b = bboxZona(datos.territorios, "04")!;
    expect(b[0]).toBeLessThan(b[2]);
    expect(b[1]).toBeLessThan(b[3]);
    expect(bboxZona(datos.territorios, "99")).toBeNull();
    expect(bboxLugar(datos.territorios, "mun:28106")).not.toBeNull();
    expect(bboxLugar(datos.territorios, "dis:2807901")).not.toBeNull();
    expect(bboxLugar(datos.territorios, "mun:0")).toBeNull();
  });
  it("describirSeccion: servicio por distancia y por plazas", () => {
    const dis = describirSeccion(estado("farmacia"), datos.territorios, 100)!;
    expect(dis.titulo.length).toBeGreaterThan(0);
    expect(dis.lineas.join(" ")).toMatch(/Centro más cercano a/);
    const pl = describirSeccion(estado("residencia"), datos.territorios, 100)!;
    expect(pl.lineas.join(" ")).toMatch(/por cada 100 mayores/);
    expect(describirSeccion(estado("farmacia"), datos.territorios, -1)).toBeNull();
    expect(describirSeccion(estado("farmacia"), datos.territorios, 99999)).toBeNull();
  });
  it("describirSeccion en un servicio sin centros", () => {
    const vacio = { ...datos.servicios.hospital!, ids: [], nombres: [], mun: [], lat: [], lon: [] };
    const e = calcularEstado("hospital", datos.secciones, vacio);
    expect(describirSeccion(e, datos.territorios, 0)!.lineas.join(" ")).toMatch(/ningún centro/);
  });
  it("describirCentro: nombre, municipio y plazas (o su ausencia)", () => {
    const e = estado("residencia");
    const c = describirCentro(e, datos.territorios, 0)!;
    expect(c.titulo.length).toBeGreaterThan(3);
    expect(c.lineas.join(" ")).toMatch(/plazas/);
    const j = e.centros.plazas!.findIndex((p) => p == null);
    if (j >= 0) expect(describirCentro(e, datos.territorios, j)!.lineas.join(" ")).toMatch(/no las indica/);
    expect(describirCentro(e, datos.territorios, -1)).toBeNull();
    expect(describirCentro(estado("hospital"), datos.territorios, 0)!.titulo).toMatch(/^Hospital/);
  });
  it("cada servicio tiene nombre", () => {
    for (const id of SERVICIO_IDS) expect(SERVICIOS[id].nombre.length).toBeGreaterThan(3);
  });
});

describe("T2 (arreglos): plurales y varias zonas", () => {
  it("«faltan unas N plazas» concuerda con el número", () => {
    expect(faltanPlazas(1, "Faltan")).toBe("Falta 1 plaza");
    expect(faltanPlazas(1.3, "faltan")).toBe("falta 1 plaza");
    expect(faltanPlazas(1, "le faltan")).toBe("le falta 1 plaza");
    expect(faltanPlazas(0.2, "faltan")).toBe("falta menos de 1 plaza");
    expect(faltanPlazas(2, "Faltan")).toBe("Faltan unas 2 plazas");
    expect(faltanPlazas(1234, "faltan")).toBe("faltan unas 1.234 plazas");
  });

  it("varias zonas (la sierra): cifra, nombre, recuadro y ranking suman las tres", () => {
    expect(codigosZona("06,10,11")).toEqual(["06", "10", "11"]);
    expect(codigosZona(null)).toEqual([]);
    expect(nombreZonas(datos.territorios, "06,10,11")).toBe("Sierra Norte, Sierra Sur y Sierra Central");
    expect(nombreZonas(datos.territorios, "04")).toBe("Sur Metropolitano");
    const e = estado("residencia");
    const suma = ["06", "10", "11"].map((z) => cifraGrande(e, datos.territorios, z));
    const junto = cifraGrande(e, datos.territorios, "06,10,11");
    expect(junto.objetivo).toBe(suma.reduce((a, c) => a + c.objetivo, 0));
    expect(junto.enDeficit).toBe(suma.reduce((a, c) => a + c.enDeficit, 0));
    const b = bboxZona(datos.territorios, "06,10,11")!;
    for (const z of ["06", "10", "11"]) {
      const bz = bboxZona(datos.territorios, z)!;
      expect(b[0]).toBeLessThanOrEqual(bz[0]);
      expect(b[3]).toBeGreaterThanOrEqual(bz[3]);
    }
    const mun = new Map(datos.territorios.municipios.map((m) => [m.id, m.zona]));
    const filas = filasRanking(estado("centro_salud"), datos.territorios, { nivel: "municipio", zona: "06,10,11", orden: "pct", limite: 50 });
    expect(filas.length).toBeGreaterThan(10);
    for (const f of filas) expect(["06", "10", "11"]).toContain(mun.get(f.lugar));
  });
});

describe("cobertura en positivo e invitación del mapa", () => {
  it("residencias, toda la Comunidad: las plazas que hay y las que salen por cada 100 mayores (cifras del motor)", () => {
    const e = estado("residencia");
    const t = coberturaPositiva(e, datos.territorios, null)!;
    expect(t.numero).toBe(enteroEs(e.plazasTotales!));
    expect(t.texto).toBe(`plazas de residencia en la Comunidad de Madrid: ${decimal2Es(e.media!)} por cada 100 mayores de 65`);
    expect(t.texto).not.toMatch(/falta|déficit/i);
  });
  it("residencias en una zona: el porcentaje de mayores que llega a la referencia, complemento del déficit", () => {
    const e = estado("residencia");
    const c = cifraGrande(e, datos.territorios, "04");
    const t = coberturaPositiva(e, datos.territorios, "04")!;
    expect(t.numero).toBe(porcentajeEs(100 - c.pct));
    expect(t.texto).toContain("Sur Metropolitano");
    expect(t.texto).toContain("4,05 plazas por cada 100");
  });
  it("distancia: el porcentaje de vecinos con el servicio cerca = 100 - % en déficit", () => {
    const e = estado("farmacia");
    const t = coberturaPositiva(e, datos.territorios, null)!;
    expect(t.numero).toBe(porcentajeEs(100 - (100 * e.totalDeficit) / e.totalObjetivo));
    expect(t.texto).toMatch(/^de los habitantes tiene una farmacia a menos de 1 km en la Comunidad de Madrid$/);
    expect(coberturaPositiva(estado("colegio"), datos.territorios, null)!.texto).toContain("3 a 16 años");
  });
  it("sin déficit, la cobertura es del 100 %", () => {
    expect(coberturaPositiva(estado("farmacia", { radio_m: 1e9 }), datos.territorios, null)!.numero).toBe("100,0 %");
  });
  it("la invitación no lleva cifras ni palabras de déficit", () => {
    for (const m of ["plazas", "distancia"] as const) {
      const t = invitacionMapa({ metrica: m });
      expect(t).not.toMatch(/\d|falta|déficit/i);
    }
    expect(invitacionMapa({ metrica: "distancia" })).toBe("Coloca un centro y mira a cuántos vecinos ayuda");
  });
});
