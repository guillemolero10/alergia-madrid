// Propiedades del motor, casos límite, umbral configurable, plazas que faltan, lugares y carga.
import { beforeAll, describe, expect, it } from "vitest";
import { agregar, fichaLugar, ranking } from "./agregados";
import { cargarDatos, ErrorCarga } from "./cargar";
import { calcularEstado, calcularOptimo, optimo, plazasQueFaltan, simular } from "./cobertura";
import { datosReales } from "./datosPrueba";
import { desproyectar, proyectar, RejillaEspacial } from "./geo";
import { dentroDeLaComunidad, distritoEn, esLugar, lugarPorId, municipioEn, resolverLugar } from "./lugares";
import { SERVICIO_IDS, SERVICIOS, UMBRAL_DEFICIT_POR_DEFECTO } from "./servicios";
import type { Datos } from "./tipos";

let d: Datos;
beforeAll(async () => { d = await datosReales(); });

const estado = (id: keyof typeof SERVICIOS, o = {}) => calcularEstado(id, d.secciones, d.servicios[id]!, o);

describe("geo", () => {
  it("proyección ida y vuelta y error < 1 % frente a haversine en la Comunidad", () => {
    const [x, y] = proyectar(40.4168, -3.7038);
    const [lat, lon] = desproyectar(x, y);
    expect(lat).toBeCloseTo(40.4168, 9);
    expect(lon).toBeCloseTo(-3.7038, 9);
    const [x2, y2] = proyectar(41.1, -3.6);
    const plana = Math.hypot(x2 - x, y2 - y);
    const p1 = (40.4168 * Math.PI) / 180, p2 = (41.1 * Math.PI) / 180;
    const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((0.1038 * Math.PI) / 180 / 2) ** 2;
    const hav = 2 * 6371008.8 * Math.asin(Math.sqrt(a));
    expect(Math.abs(plana - hav) / hav).toBeLessThan(0.01);
  });

  it("la rejilla da lo mismo que la fuerza bruta (vecinos y más cercano)", () => {
    const n = 500;
    const xs = new Float64Array(n), ys = new Float64Array(n);
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) { xs[i] = rnd() * 50000; ys[i] = rnd() * 40000; }
    const g = new RejillaEspacial(xs, ys, 1000);
    for (let t = 0; t < 40; t++) {
      const x = rnd() * 60000 - 5000, y = rnd() * 50000 - 5000, r = rnd() * 9000;
      const bruto = [...Array(n).keys()].filter((i) => Math.hypot(xs[i]! - x, ys[i]! - y) <= r);
      expect(g.vecinos(x, y, r).sort((a, b) => a - b)).toEqual(bruto);
      let mejor = 0;
      for (let i = 1; i < n; i++) if (Math.hypot(xs[i]! - x, ys[i]! - y) < Math.hypot(xs[mejor]! - x, ys[mejor]! - y)) mejor = i;
      expect(g.masCercano(x, y).indice).toBe(mejor);
    }
  });

  it("rejilla vacía", () => {
    const g = new RejillaEspacial(new Float64Array(0), new Float64Array(0));
    expect(g.masCercano(1, 1).indice).toBe(-1);
    expect(g.vecinos(1, 1, 100)).toEqual([]);
  });
});

describe("estado", () => {
  it("todos los servicios se calculan y son coherentes", () => {
    for (const id of SERVICIO_IDS) {
      const e = estado(id);
      expect(e.totalDeficit).toBeGreaterThanOrEqual(0);
      expect(e.totalDeficit).toBeLessThanOrEqual(e.totalObjetivo);
      expect(e.nCentros).toBe(d.servicios[id]!.ids.length);
    }
  });
  it("el radio mayor nunca aumenta el déficit de distancia", () => {
    const [a, b, c] = SERVICIOS.farmacia.radios.map((r) => estado("farmacia", { radio_m: r }).totalDeficit) as [number, number, number];
    expect(a).toBeGreaterThanOrEqual(b);
    expect(b).toBeGreaterThanOrEqual(c);
  });
  it("sin centros: todo el mundo en déficit y la media de distancia no se rompe", () => {
    const vacio = { ...d.servicios.farmacia!, ids: [], nombres: [], mun: [], lat: [], lon: [] };
    const e = calcularEstado("farmacia", d.secciones, vacio);
    expect(e.totalDeficit).toBe(e.totalObjetivo);
    expect(ranking(e, d.territorios, { limite: 3 })[0]!.pct).toBe(100);
    const r = calcularEstado("residencia", d.secciones, { ...vacio, plazas: [] }, { umbral: "media" });
    expect(r.totalDeficit).toBe(0); // media 0 y nadie por debajo de 0
    expect(r.media).toBe(0);
  });
  it("radio no válido", () => {
    expect(() => estado("farmacia", { radio_m: 0 })).toThrow();
  });
});

describe("umbral configurable de residencias", () => {
  it("por defecto, la media de España del IMSERSO (4,05)", () => {
    expect(UMBRAL_DEFICIT_POR_DEFECTO).toBe("imserso_espana");
    const e = estado("residencia");
    expect(e.umbral).toBe(4.05);
    expect(e.umbralModo).toBe("imserso_espana");
  });
  it("la media de la Comunidad sigue disponible como caso explícito", () => {
    const e = estado("residencia", { umbral: "media" });
    expect(e.umbral).toBeCloseTo(e.media!, 12);
  });
  it("mediana, IMSERSO y valor fijo", () => {
    const media = estado("residencia", { umbral: "media" });
    const med = estado("residencia", { umbral: "mediana" });
    const es = estado("residencia", { umbral: "imserso_espana" });
    const ma = estado("residencia", { umbral: "imserso_madrid" });
    const fijo = estado("residencia", { umbral: 3 });
    expect(es.umbral).toBe(4.05);
    expect(ma.umbral).toBe(4.21);
    expect(fijo.umbral).toBe(3);
    expect(med.umbral).toBeGreaterThan(0);
    // Más umbral, más déficit.
    expect(es.totalDeficit).toBeLessThanOrEqual(ma.totalDeficit);
    expect(fijo.totalDeficit).toBeLessThan(es.totalDeficit);
    expect(media.umbralModo).toBe("media");
    console.log(`umbral residencias: media ${media.umbral.toFixed(3)}, mediana ${med.umbral.toFixed(3)}, IMSERSO 4,05 -> ${es.totalDeficit} mayores en déficit, 4,21 -> ${ma.totalDeficit}, media -> ${media.totalDeficit}`);
  });
  it("el IMSERSO no existe para servicios sin plazas", () => {
    expect(() => calcularEstado("farmacia", d.secciones, d.servicios.farmacia!, { umbral: "imserso_espana" })).not.toThrow(); // se ignora: es distancia
  });
  it("plazas que faltan: por territorio (municipio, distrito, zona) y total", () => {
    const e = estado("residencia", { umbral: "imserso_madrid" });
    const total = plazasQueFaltan(e);
    expect(total).toBeGreaterThan(0);
    for (const nivel of ["municipio", "distrito", "zona"] as const) {
      const suma = agregar(e, d.territorios, nivel).reduce((s, a) => s + a.faltan, 0);
      if (nivel === "municipio" || nivel === "zona") expect(suma).toBeCloseTo(total, 6);
      else expect(suma).toBeLessThanOrEqual(total + 1e-6); // los distritos solo cubren la capital
    }
    const f = ranking(e, d.territorios, { orden: "faltan", limite: 3 });
    expect(f[0]!.plazas_faltan!).toBeGreaterThanOrEqual(f[2]!.plazas_faltan!);
    // Con un umbral enorme, las plazas que faltan crecen; con 0, no falta ninguna.
    expect(plazasQueFaltan(estado("residencia", { umbral: 0 }))).toBe(0);
    expect(plazasQueFaltan(estado("farmacia"))).toBe(0);
    console.log(`plazas que faltan (IMSERSO Madrid 4,21): ${Math.round(total)}; media: ${Math.round(plazasQueFaltan(estado("residencia")))}`);
  });
});

describe("simulación y óptimo: casos límite", () => {
  it("punto fuera de la Comunidad (Segovia) no gana nada con 1 km y se detecta con municipioEn", () => {
    const f = estado("farmacia", { radio_m: 1000 });
    const r = simular(f, { lat: 40.95, lon: -4.12 });
    expect(r.ganan).toBe(0);
    expect(dentroDeLaComunidad(d.territorios, 40.95, -4.12)).toBe(false);
    expect(municipioEn(d.territorios, 40.4168, -3.7038)).toBe("mun:28079");
    expect(distritoEn(d.territorios, 40.4168, -3.7038)).toBe("dis:2807901");
    expect(municipioEn(d.territorios, 40.2113, -3.7733)).toBe("mun:28106"); // Parla
  });
  it("plazas = 0 no gana nada", () => {
    const re = estado("residencia");
    const r = simular(re, { lat: 40.2136, lon: -3.7444, plazas: 0 });
    expect(r.ganan).toBe(0);
    expect(r.rNuevo).toBe(0);
    expect(optimo(re, { n: 1, plazas: 0 }).puntos).toEqual([]);
  });
  it("más plazas no ganan menos", () => {
    const re = estado("residencia");
    const g = [25, 94, 200].map((p) => simular(re, { lat: 40.2136, lon: -3.7444, plazas: p }).ganan);
    expect(g[0]!).toBeLessThanOrEqual(g[1]!);
    expect(g[1]!).toBeLessThanOrEqual(g[2]!);
    // y con la métrica N, más plazas reducen más las plazas que faltan, sin pasar nunca de las plazas del centro
    const n = [25, 94, 200].map((p) => simular(re, { lat: 40.2136, lon: -3.7444, plazas: p }).reduce!);
    expect(n[0]!).toBeLessThanOrEqual(n[1]!);
    expect(n[1]!).toBeLessThanOrEqual(n[2]!);
    [25, 94, 200].forEach((p, k) => expect(n[k]!).toBeLessThanOrEqual(p + 1e-9));
  });
  it("N: con 0 plazas es 0 y los servicios por distancia no tienen N", () => {
    const re = estado("residencia");
    expect(simular(re, { lat: 40.2136, lon: -3.7444, plazas: 0 }).reduce).toBe(0);
    expect(simular(estado("farmacia", { radio_m: 1000 }), { lat: 40.4, lon: -3.7 }).reduce).toBeUndefined();
    expect(optimo(estado("farmacia", { radio_m: 1000 }), { n: 1, zona: "04" }).puntos[0]!.reduce).toBeUndefined();
  });
  it("zona sin déficit: Sierra Norte nadie queda a más de 100 km de un hospital -> óptimo vacío", () => {
    const h = estado("hospital", { radio_m: 200000 });
    expect(h.totalDeficit).toBe(0);
    const o = optimo(h, { n: 3, zona: "06" });
    expect(o.puntos).toEqual([]);
    expect(o.deficitAntes).toBe(0);
    expect(o.deficitDespues).toBe(0);
  });
  it("zona o municipio que no existen: sin candidatos", () => {
    const re = estado("residencia");
    expect(optimo(re, { zona: "99" })).toMatchObject({ puntos: [], candidatos: 0 });
    expect(optimo(re, { municipio: "mun:00000" }).puntos).toEqual([]);
  });
  it("n se limita a 1-3 y las ganancias acumuladas cuadran con el déficit", () => {
    const re = estado("residencia");
    const o = optimo(re, { n: 99 });
    expect(o.puntos.length).toBe(3);
    expect(o.puntos[2]!.acumulado).toBe(o.puntos.reduce((s, p) => s + p.ganan, 0));
    expect(o.deficitDespues).toBe(o.deficitAntes - o.puntos[2]!.acumulado);
    expect(o.puntos[0]!.ganan).toBeGreaterThanOrEqual(o.puntos[1]!.ganan);
  });
  it("el óptimo n = 1 nunca es peor que cualquier otro punto de la zona (simulación)", () => {
    const f = estado("farmacia", { radio_m: 1000 });
    const o = optimo(f, { n: 1, municipio: "mun:28079" });
    const p = o.puntos[0]!;
    expect(simular(f, p).ganan).toBe(p.ganan);
    for (const i of [0, 40, 400, 1500]) {
      if (d.secciones.mun[i] === "mun:28079") expect(simular(f, { lat: d.secciones.lat[i]!, lon: d.secciones.lon[i]! }).ganan).toBeLessThanOrEqual(p.ganan);
    }
  });
  it("simular coincide con aplicar el óptimo en 2SFCA", () => {
    const re = estado("residencia");
    const o = optimo(re, { n: 1, zona: "04", plazas: 94 });
    const p = o.puntos[0]!;
    const sim = simular(re, { lat: p.lat, lon: p.lon, plazas: 94 });
    expect(sim.ganan).toBe(p.ganan);
    expect(Math.abs(sim.reduce! - p.reduce!)).toBeLessThanOrEqual(1e-9);
  });
  it("el óptimo con plazas: N acumulado es la suma, no repite secciones y baja las plazas que faltan en lo que dice", () => {
    const re = estado("residencia");
    const o = optimo(re, { n: 3, zona: "04", plazas: 94 });
    expect(o.puntos.length).toBe(3);
    expect(new Set(o.puntos.map((p) => p.seccion)).size).toBe(3);
    expect(o.puntos[2]!.reduceAcumulado!).toBeCloseTo(o.puntos.reduce((s, p) => s + p.reduce!, 0), 9);
    expect(o.reduce!).toBeCloseTo(o.puntos[2]!.reduceAcumulado!, 9);
    expect(o.faltanDespues!).toBeCloseTo(plazasQueFaltan(re) - o.reduce!, 6);
    for (const p of o.puntos) expect(p.reduce!).toBeLessThanOrEqual(94 + 1e-9);
  });
  it("el óptimo con plazas nunca es peor que otros puntos de la zona (N con simular)", () => {
    const re = estado("residencia");
    const o = optimo(re, { n: 1, zona: "04", plazas: 94 });
    const mejor = o.puntos[0]!.reduce!;
    for (const i of [3, 700, 1500, 2600, 3300, 4400]) {
      if (d.secciones.zona[i] === "04") expect(simular(re, { lat: d.secciones.lat[i]!, lon: d.secciones.lon[i]!, plazas: 94 }).reduce!).toBeLessThanOrEqual(mejor + 1e-6);
    }
  });
  it("si todo está sobre el umbral no hay N que reducir: óptimo vacío", () => {
    const re = estado("residencia", { umbral: 0 });
    expect(plazasQueFaltan(re)).toBe(0);
    expect(optimo(re, { n: 3, plazas: 94 }).puntos).toEqual([]);
    expect(simular(re, { lat: 40.2, lon: -3.7, plazas: 94 }).reduce).toBe(0);
  });
  it("no muta el estado", () => {
    const re = estado("residencia");
    const antes = Uint8Array.from(re.deficit);
    optimo(re, { n: 3 });
    simular(re, { lat: 40.2, lon: -3.7 });
    expect(Array.from(re.deficit)).toEqual(Array.from(antes));
  });
});

describe("serializable (Web Worker)", () => {
  it("calcularOptimo con datos clonados da lo mismo y devuelve un objeto clonable", () => {
    const secciones = structuredClone(d.secciones);
    const centros = structuredClone(d.servicios.residencia!);
    const r = calcularOptimo("residencia", secciones, centros, { radio_m: 10000 }, { n: 2, zona: "04", plazas: 94 });
    const directo = optimo(estado("residencia"), { n: 2, zona: "04", plazas: 94 });
    expect(r).toEqual(directo);
    expect(structuredClone(r)).toEqual(r);
  });
});

describe("agregados y ficha", () => {
  it("la suma de los municipios es el total", () => {
    const e = estado("farmacia");
    const m = agregar(e, d.territorios, "municipio");
    expect(m.length).toBe(179);
    expect(m.reduce((s, a) => s + a.objetivo, 0)).toBe(e.totalObjetivo);
    expect(m.reduce((s, a) => s + a.enDeficit, 0)).toBe(e.totalDeficit);
    expect(agregar(e, d.territorios, "distrito").length).toBe(21);
    expect(agregar(e, d.territorios, "zona").length).toBe(11);
    expect(m.reduce((s, a) => s + a.nCentros, 0)).toBe(e.nCentros);
  });
  it("Getafe, Parla, La Acebeda y el distrito Centro se resuelven y muestran los 6 servicios", () => {
    const estados = Object.fromEntries(SERVICIO_IDS.map((id) => [id, estado(id)]));
    for (const texto of ["Getafe", "parla", "acebeda", "Centro"]) {
      const l = resolverLugar(d.territorios, texto);
      expect(esLugar(l), texto).toBe(true);
      if (!esLugar(l)) continue;
      const f = fichaLugar(l.id, estados, d.territorios)!;
      expect(f.servicios.length).toBe(6);
      expect(f.poblacion).toBeGreaterThan(0);
      f.servicios.forEach((s) => { expect(s.pct_deficit).toBeGreaterThanOrEqual(0); expect(s.pct_deficit).toBeLessThanOrEqual(100); });
    }
    const acebeda = fichaLugar("mun:28001", estados, d.territorios)!;
    expect(acebeda.poblacion).toBe(70);
    expect(acebeda.servicios.find((s) => s.id === "hospital")!.comparacion).toBeDefined();
    expect(acebeda.faltan.length).toBeGreaterThan(0);
    const getafe = fichaLugar("mun:28065", estados, d.territorios)!;
    const farm = getafe.servicios.find((s) => s.id === "farmacia")!;
    expect(farm.referencia?.valor).toBe(3000);
    expect(farm.n).toBeGreaterThan(20);
    expect(fichaLugar("mun:99999", estados, d.territorios)).toBeNull();
    expect(fichaLugar("xx", estados, d.territorios)).toBeNull();
  });
  it("el ratio de centro de salud no cuenta consultorios", () => {
    const e = estado("centro_salud");
    const total = agregar(e, d.territorios, "municipio").reduce((s, a) => s + a.nRatio, 0);
    expect(total).toBe(d.servicios.centro_salud!.nombres.filter((n) => n.startsWith("Centro de salud")).length);
  });
});

describe("lugares", () => {
  it("sin tildes, alias y zonas", () => {
    const g = resolverLugar(d.territorios, "alcala de henares");
    expect(esLugar(g) && g.id).toBe("mun:28005");
    const sur = resolverLugar(d.territorios, "el sur");
    expect(esLugar(sur) && sur.tipo).toBe("zona");
    expect(esLugar(sur) && sur.zonas).toEqual(["04"]);
    const sierra = resolverLugar(d.territorios, "sierra");
    expect(esLugar(sierra) && sierra.zonas.sort()).toEqual(["06", "10", "11"]);
    const cap = resolverLugar(d.territorios, "capital");
    expect(esLugar(cap) && cap.zonas).toEqual(["01"]);
  });
  it("ambiguo o con errata: sugerencias; vacío: sin sugerencias", () => {
    const r = resolverLugar(d.territorios, "Rozas");
    expect(esLugar(r)).toBe(false);
    expect(!esLugar(r) && r.sugerencias.map((s) => s.nombre)).toContain("Las Rozas de Madrid");
    const e = resolverLugar(d.territorios, "Fuenlabada");
    expect(!esLugar(e) && e.sugerencias[0]!.nombre).toBe("Fuenlabrada");
    expect(resolverLugar(d.territorios, "   ")).toEqual({ sugerencias: [] });
    expect(esLugar(resolverLugar(d.territorios, "xyzxyz"))).toBe(false);
  });
  it("lugarPorId", () => {
    expect(lugarPorId(d.territorios, "mun:28106")!.nombre).toBe("Parla");
    expect(lugarPorId(d.territorios, "zona:04")!.nombre).toBe("Sur Metropolitano");
    expect(lugarPorId(d.territorios, "nada")).toBeNull();
  });
});

describe("carga", () => {
  it("error claro si un archivo falla o no cuadra", async () => {
    await expect(cargarDatos(async () => { throw new ErrorCarga("x", "HTTP 404"); })).rejects.toThrow(/HTTP 404/);
    await expect(cargarDatos(async (ruta) => (ruta === "secciones.json" ? { version: 1, ids: [1], mun: [] } : {}))).rejects.toThrow(/no cuadra/);
    await expect(cargarDatos(async () => ({ version: 2 }))).rejects.toThrow(/versión/);
  });
  it("carga solo los servicios pedidos", async () => {
    const x = await cargarDatos(async (r) => (r === "secciones.json" ? d.secciones : r === "territorios.json" ? d.territorios : d.servicios.farmacia), { servicios: ["farmacia"] });
    expect(Object.keys(x.servicios)).toEqual(["farmacia"]);
  });
  it("no hay columnas personales en los datos cargados", () => {
    const prohibidas = /(titulares_nombre|contacto_telefono|contacto_correo|entidad_nif|^nif$)/i;
    for (const c of Object.values(d.servicios)) expect(Object.keys(c!).filter((k) => prohibidas.test(k))).toEqual([]);
  });
});
