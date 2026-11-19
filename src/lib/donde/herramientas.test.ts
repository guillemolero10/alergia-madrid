// Las 5 herramientas del agente contra los datos reales de public/donde/ y las cifras de referencia.json (Python).
import { beforeAll, describe, expect, it } from "vitest";
import referencia from "../../../pipeline/donde/referencia.json";
import { datosReales } from "./datosPrueba";
import {
  crearEntorno,
  ejecutarHerramienta,
  ESQUEMAS_HERRAMIENTAS,
  fichaMunicipio,
  moverMapa,
  NOMBRES_HERRAMIENTAS,
  rankingDeficit,
  simularCentro,
  ubicacionOptima,
  validarEntrada,
  type Entorno,
} from "./herramientas";
import { redactarResultado } from "./plantillas";
import { SERVICIO_IDS } from "./servicios";
import type { Datos } from "./tipos";

let datos: Datos;
let ent: Entorno;
beforeAll(async () => {
  datos = await datosReales();
  // Los casos de referencia.json (Python) se calcularon con la media de la Comunidad: aquí se pide explícita. El valor por defecto (IMSERSO España) se prueba al final.
  ent = crearEntorno(datos, { referencia: "media" });
});

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  expect(r.ok).toBe(true);
  return r as Extract<T, { ok: true }>;
};

describe("ubicacion_optima", () => {
  it("residencia en el sur = punto del caso 4 de referencia.json (Leganés, 93,8 de 94 plazas)", async () => {
    const r = ok(await ubicacionOptima(ent, { servicio: "residencia", zona: "sur" }));
    const p = r.salida.puntos[0]!;
    expect(p.seccion).toBe(referencia.caso4.seccion);
    expect(p.municipio).toBe("Leganés");
    expect(p.municipio_id).toBe(referencia.caso4.municipio);
    expect(Math.abs(p.reduce! - referencia.caso4.reduce_faltan)).toBeLessThan(0.006);
    expect(p.pct_plazas_utiles).toBeCloseTo(referencia.caso4.pct_del_maximo_posible, 0);
    expect(Math.abs(p.lat - referencia.caso4.lat)).toBeLessThan(1e-4);
    expect(Math.abs(p.lon - referencia.caso4.lon)).toBeLessThan(1e-4);
    expect(Math.abs(r.salida.faltan_antes! - referencia.caso4.faltan_antes)).toBeLessThan(0.01);
    expect(Math.abs(r.salida.faltan_despues! - referencia.caso4.faltan_despues)).toBeLessThan(0.01);
    expect(Math.abs(r.salida.reduce_total! - referencia.caso4.reduce_faltan)).toBeLessThan(0.006);
    expect(r.salida.plazas).toBe(94);
    expect(r.salida.ambito).toEqual({ tipo: "zona", nombre: "Sur Metropolitano" });
    // el texto usa la métrica nueva y no «ganan acceso»
    const t = redactarResultado(r);
    expect(t).toMatch(/cubre 93,8 plazas más/);
    expect(t).toMatch(/Leganés/);
    expect(t).not.toMatch(/ganan acceso|pasarían a vivir/);
  });

  it("acciones en orden: elegir_servicio, marcar_puntos (optimo) y mover_mapa", async () => {
    const r = ok(await ubicacionOptima(ent, { servicio: "residencia", zona: "sur" }));
    expect(r.acciones.map((a) => a.tipo)).toEqual(["elegir_servicio", "marcar_puntos", "mover_mapa"]);
    const marcar = r.acciones[1]!;
    expect(marcar.tipo === "marcar_puntos" && marcar.origen).toBe("optimo");
    expect(marcar.tipo === "marcar_puntos" && marcar.puntos[0]).toMatchObject({ etiqueta: "Opción 1", plazas: 94 });
    expect(marcar.tipo === "marcar_puntos" && Math.abs(marcar.puntos[0]!.reduce! - 93.82)).toBeLessThan(0.006);
    expect(r.acciones[2]).toMatchObject({ tipo: "mover_mapa", lugar: "mun:28074" });
    expect(r.paso.resumen).toMatch(/Leganés/);
    expect(r.paso.resumen).toMatch(/cubre 94 plazas más/);
  });

  it("voraz n = 3 en el sur: las 3 secciones del caso 7 y el texto con la lista", async () => {
    const r = ok(await ubicacionOptima(ent, { servicio: "residencia", zona: "sur", n: 3 }));
    expect(r.salida.puntos.map((p) => p.seccion)).toEqual(referencia.caso7.zona_04.map((p) => p.seccion));
    expect(Math.abs(r.salida.reduce_total! - referencia.caso7.zona_04[2]!.acumulado)).toBeLessThan(0.01);
    expect(redactarResultado(r)).toMatch(/Entre todos cubren 281,4 plazas más/);
  });

  it("n se acota a 3 y se avisa del n pedido; los servicios sin plazas ignoran `plazas`", async () => {
    const r = ok(await ubicacionOptima(ent, { servicio: "farmacia", zona: "sur", n: 7, plazas: 120 }));
    expect(r.salida.n).toBe(3);
    expect(r.salida.n_pedido).toBe(7);
    expect(r.salida.plazas).toBeNull();
    expect(redactarResultado(r)).toMatch(/Solo calculo hasta 3 puntos/);
  });

  it("acepta un municipio y un distrito de la capital como ámbito", async () => {
    const m = ok(await ubicacionOptima(ent, { servicio: "farmacia", zona: "Getafe" }));
    expect(m.salida.puntos[0]!.municipio_id).toBe("mun:28065");
    const d = ok(await ubicacionOptima(ent, { servicio: "centro_salud", zona: "Villa de Vallecas" }));
    expect(d.salida.ambito.tipo).toBe("distrito");
    expect(d.salida.puntos[0]!.municipio_id).toBe("mun:28079");
    expect(d.salida.puntos[0]!.ganan).toBeGreaterThan(0);
  });

  it("zona sin ningún punto que gane: respuesta honesta y sin marcar nada", async () => {
    const r = ok(await ubicacionOptima(ent, { servicio: "dea", zona: "La Acebeda" }));
    expect(r.salida.puntos.length).toBeLessThanOrEqual(1);
    if (r.salida.puntos.length === 0) {
      expect(r.acciones.some((a) => a.tipo === "marcar_puntos")).toBe(false);
      expect(redactarResultado(r)).toMatch(/no encuentro ningún punto/);
    }
  });

  it("zona desconocida: error con sugerencias, sin lanzar", async () => {
    const r = await ubicacionOptima(ent, { servicio: "residencia", zona: "Villaquerida" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe("lugar");
  });
});

describe("ranking_deficit", () => {
  it("residencias por % afectado: los 5 primeros son los del caso 6", async () => {
    const r = ok(await rankingDeficit(ent, { servicio: "residencia", orden: "pct", limite: 5 }));
    expect(r.salida.filas.map((f) => f.lugar)).toEqual(referencia.caso6.por_pct.map((f) => f.lugar));
    expect(r.acciones.map((a) => a.tipo)).toEqual(["elegir_servicio", "mostrar_ranking"]);
    const a = r.acciones[1]!;
    expect(a.tipo === "mostrar_ranking" && a.filas.length).toBe(5);
  });

  it("zona con varias zonas estadísticas (sierra): solo sus municipios y el mapa vuela allí", async () => {
    const r = ok(await rankingDeficit(ent, { servicio: "centro_salud", zona: "sierra", limite: 10 }));
    const zonasSierra = new Set(["06", "10", "11"]);
    const mun = new Map(datos.territorios.municipios.map((m) => [m.id, m.zona]));
    expect(r.salida.filas.length).toBe(10);
    for (const f of r.salida.filas) expect(zonasSierra.has(mun.get(f.lugar)!)).toBe(true);
    expect(r.acciones.map((a) => a.tipo)).toEqual(["elegir_servicio", "mostrar_ranking", "mover_mapa"]);
    // M-3: la pantalla recibe las tres zonas de la sierra (`?zona=06,10,11`) para que el ranking y el texto coincidan.
    const rk = r.acciones[1]!;
    expect(rk.tipo === "mostrar_ranking" && rk.zona?.split(",").sort()).toEqual(["06", "10", "11"]);
  });

  it("distritos de Madrid", async () => {
    const r = ok(await rankingDeficit(ent, { servicio: "centro_salud", zona: "Madrid", nivel: "distrito" }));
    expect(r.salida.nivel).toBe("distrito");
    expect(r.salida.filas[0]!.lugar.startsWith("dis:")).toBe(true);
  });

  it("un solo municipio no se puede ordenar: lo dice y propone la ficha", async () => {
    const r = await rankingDeficit(ent, { servicio: "farmacia", zona: "Getafe" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.codigo).toBe("zona_no_agrupa");
      expect(r.error.mensaje).toMatch(/ficha/);
    }
  });

  it("orden «faltan» solo existe con plazas: con distancia vuelve a %", async () => {
    const r = ok(await rankingDeficit(ent, { servicio: "farmacia", orden: "faltan", limite: 3 }));
    expect(r.salida.orden).toBe("pct");
    const p = ok(await rankingDeficit(ent, { servicio: "residencia", limite: 3 }));
    expect(p.salida.orden).toBe("faltan");
    expect(p.salida.filas[0]!.plazas_faltan).toBeGreaterThan(0);
  });
});

describe("simular_centro", () => {
  it("coordenadas del caso 5: +2.363 (centro de salud) y, en residencias, 64 plazas menos que faltan (68 % del óptimo de la zona 04)", async () => {
    const p = referencia.caso5.punto;
    const cs = ok(await simularCentro(ent, { servicio: "centro_salud", lat: p.lat, lon: p.lon }));
    expect(cs.salida.ganan).toBe(referencia.caso5.centro_salud.ganan);
    expect(cs.salida.reduce).toBeUndefined();
    const re = ok(await simularCentro(ent, { servicio: "residencia", lat: p.lat, lon: p.lon, plazas: 94 }));
    expect(Math.abs(re.salida.reduce! - referencia.caso5.residencia.reduce_faltan)).toBeLessThan(0.006);
    expect(re.salida.pct_plazas_utiles).toBeCloseTo(referencia.caso5.residencia.pct_del_maximo_posible, 0);
    expect(Math.abs(re.salida.comparado_con_optimo.reduce_optimo! - referencia.caso4.reduce_faltan)).toBeLessThan(0.006);
    expect(re.salida.comparado_con_optimo.pct!).toBeCloseTo(referencia.caso5.residencia.pct_del_optimo_zona_04, 1);
    expect(re.salida.comparado_con_optimo.zona).toBe("Sur Metropolitano");
    expect(re.salida.comparado_con_optimo.municipio_optimo).toBe("Leganés");
    expect(re.acciones.map((a) => a.tipo)).toEqual(["elegir_servicio", "marcar_puntos", "mover_mapa"]);
    const m = re.acciones[1]!;
    expect(m.tipo === "marcar_puntos" && m.origen).toBe("simulacion");
    // el texto de la propuesta: «reduce en 64 plazas las que faltan», «el modelo aprovecha 93,8 de 94 en Leganés», «el 68 % del óptimo»
    const t = redactarResultado(re);
    expect(t).toMatch(/cubre 64,2 plazas más \(64,2 de sus 94 plazas llegan a zonas con margen de mejora\)/);
    expect(t).toMatch(/El modelo aprovecha 93,8 de 94 en Leganés/);
    expect(t).toMatch(/tu ubicación logra el 68 % del óptimo/);
    expect(t).not.toMatch(/ganan acceso|pasarían a vivir|mayores que/);
  });

  it("por nombre de municipio usa su punto y su zona", async () => {
    const r = ok(await simularCentro(ent, { servicio: "residencia", lugar: "Pinto" }));
    expect(r.salida.municipio).toBe("Pinto");
    expect(r.salida.reduce!).toBeGreaterThan(0);
    expect(Math.abs(r.salida.comparado_con_optimo.reduce_optimo! - 93.82)).toBeLessThan(0.006);
  });

  it("nadie gana: lo explica sin inventar", async () => {
    const r = ok(await simularCentro(ent, { servicio: "centro_salud", lugar: "Getafe" }));
    if (r.salida.ganan === 0) expect(r.salida.por_que_nadie_gana).toBeTruthy();
    else expect(r.salida.por_que_nadie_gana).toBeNull();
  });

  it("fuera de la Comunidad, sin sitio, o una zona entera: error claro", async () => {
    const fuera = await simularCentro(ent, { servicio: "residencia", lat: 40.0, lon: -4.0 }); // cerca de Toledo
    expect(fuera.ok).toBe(false);
    if (!fuera.ok) expect(fuera.error.codigo).toBe("fuera");
    const sin = await simularCentro(ent, { servicio: "residencia" });
    expect(sin.ok).toBe(false);
    const zona = await simularCentro(ent, { servicio: "residencia", lugar: "sur" });
    expect(zona.ok).toBe(false);
    if (!zona.ok) expect(zona.error.codigo).toBe("zona_no_agrupa");
  });

  it("coordenadas NaN o infinitas no cuelgan el motor", async () => {
    const r = await ejecutarHerramienta("simular_centro", { servicio: "residencia", lat: NaN, lon: 1 }, ent);
    expect(r.ok).toBe(false);
    const q = await simularCentro(ent, { servicio: "residencia", lat: Infinity, lon: -3.7 });
    expect(q.ok).toBe(false);
  });
});

describe("ficha_municipio y mover_mapa", () => {
  it("Getafe, Parla, La Acebeda y el distrito Centro devuelven los 6 servicios", async () => {
    for (const nombre of ["Getafe", "Parla", "La Acebeda", "Centro"]) {
      const r = ok(await fichaMunicipio(ent, { lugar: nombre }));
      expect(r.salida.servicios.map((s) => s.id)).toEqual(SERVICIO_IDS);
      expect(r.salida.poblacion).toBeGreaterThan(0);
      expect(r.acciones).toEqual([{ tipo: "abrir_ficha", lugar: r.salida.lugar }]);
      expect(r.salida.aire_hoy).toBeNull();
    }
  });

  it("acepta el id del contexto (`mun:28106`) y es coherente con el motor", async () => {
    const r = ok(await fichaMunicipio(ent, { lugar: "mun:28106" }));
    expect(r.salida.nombre).toBe("Parla");
    expect(r.salida.poblacion).toBe(datos.territorios.municipios.find((m) => m.id === "mun:28106")!.poblacion);
    const re = r.salida.servicios.find((s) => s.id === "residencia")!;
    expect(re.n).toBe(5);
    expect(r.salida.faltan.every((id) => r.salida.servicios.find((s) => s.id === id)!.comparacion === "por_debajo")).toBe(true);
  });

  it("una zona con varias zonas estadísticas no tiene ficha; una zona simple, sí (sin abrir Mi municipio)", async () => {
    const sierra = await fichaMunicipio(ent, { lugar: "sierra" });
    expect(sierra.ok).toBe(false);
    const sur = ok(await fichaMunicipio(ent, { lugar: "sur" }));
    expect(sur.acciones.map((a) => a.tipo)).toEqual(["mover_mapa"]);
  });

  it("mover_mapa: bbox y lugar", async () => {
    const r = ok(await moverMapa(ent, { lugar: "Rascafría" }));
    expect(r.salida.nombre).toBe("Rascafría");
    expect(r.acciones[0]).toMatchObject({ tipo: "mover_mapa", lugar: expect.stringMatching(/^mun:28\d{3}$/) });
    const z = ok(await moverMapa(ent, { lugar: "sur" }));
    expect(z.acciones[0]).not.toHaveProperty("lugar");
  });
});

describe("el criterio de la referencia elegida aparece en el texto (I3)", () => {
  it("ficha con IMSERSO España: 4,05 y la referencia, no «la media»", async () => {
    const e = crearEntorno(datos, { referencia: "imserso_espana" });
    const r = ok(await fichaMunicipio(e, { lugar: "Leganés" }));
    const fila = r.salida.servicios.find((x) => x.id === "residencia")!;
    expect(fila.umbral).toBeCloseTo(4.05, 6);
    expect(fila.referencia_texto).toBe("media de España del IMSERSO");
    const t = redactarResultado(r);
    if (r.salida.faltan.includes("residencia")) {
      expect(t).toContain("con menos de 4,05 plazas por cada 100 mayores (referencia: media de España del IMSERSO)");
      expect(t).not.toContain("menos plazas que la media");
    }
  });
  it("ficha con IMSERSO Madrid: 4,21", async () => {
    const e = crearEntorno(datos, { referencia: "imserso_madrid" });
    const r = ok(await fichaMunicipio(e, { lugar: "Parla" }));
    expect(r.salida.servicios.find((x) => x.id === "residencia")!.umbral).toBeCloseTo(4.21, 6);
  });
  it("el óptimo de residencias dice el criterio", async () => {
    const e = crearEntorno(datos, { referencia: "imserso_espana" });
    const r = ok(await ubicacionOptima(e, { servicio: "residencia", zona: "sur" }));
    expect(redactarResultado(r)).toContain("Criterio:");
    expect(redactarResultado(r)).toContain("referencia: media de España del IMSERSO");
  });
});

describe("validación y despacho", () => {
  it("rechaza servicios y tipos que no existen", () => {
    expect(validarEntrada("ranking_deficit", { servicio: "gimnasio" }).ok).toBe(false);
    expect(validarEntrada("ubicacion_optima", { servicio: "dea", n: "tres" }).ok).toBe(false);
    expect(validarEntrada("ranking_deficit", { servicio: "dea", nivel: "barrio" }).ok).toBe(false);
    expect(validarEntrada("simular_centro", { servicio: "dea", lat: 40.3 }).ok).toBe(false);
    expect(validarEntrada("ficha_municipio", {}).ok).toBe(false);
    expect(validarEntrada("borrar_todo", {}).ok).toBe(false);
    expect(validarEntrada("mover_mapa", null).ok).toBe(false);
    expect(validarEntrada("mover_mapa", { lugar: "x".repeat(101) }).ok).toBe(false);
  });

  it("ejecutarHerramienta nunca lanza y devuelve el error", async () => {
    const r = await ejecutarHerramienta("ranking_deficit", { servicio: "nada" }, ent);
    expect(r.ok).toBe(false);
    const u = await ejecutarHerramienta("herramienta_inventada", {}, ent);
    expect(u.ok).toBe(false);
  });

  it("los esquemas cubren las 5 herramientas con el enum de los 7 servicios", () => {
    expect(ESQUEMAS_HERRAMIENTAS.map((e) => e.name)).toEqual([...NOMBRES_HERRAMIENTAS]);
    for (const e of ESQUEMAS_HERRAMIENTAS.filter((x) => "servicio" in x.input_schema.properties)) {
      expect((e.input_schema.properties.servicio as { enum: string[] }).enum).toEqual(SERVICIO_IDS);
      expect(e.input_schema.required).toContain("servicio");
    }
  });

  it("carga bajo demanda un servicio que no está en los datos", async () => {
    const parcial: Datos = { ...datos, servicios: { farmacia: datos.servicios.farmacia } };
    const e = crearEntorno(parcial, { cargarServicio: async (id) => datos.servicios[id]! });
    const r = ok(await ubicacionOptima(e, { servicio: "dea", zona: "Getafe" }));
    expect(r.salida.puntos.length).toBe(1);
    const sin = crearEntorno({ ...datos, servicios: {} });
    const f = await ubicacionOptima(sin, { servicio: "dea" });
    expect(f.ok).toBe(false);
  });

  it("usa el radio de la pantalla solo para el servicio elegido", async () => {
    const e = ent.conContexto({ servicio: "farmacia", radio_m: 500 });
    const f = ok(await rankingDeficit(e, { servicio: "farmacia", limite: 1 }));
    expect(f.salida.radio_m).toBe(500);
    const h = ok(await rankingDeficit(e, { servicio: "centro_salud", limite: 1 }));
    expect(h.salida.radio_m).toBe(2000);
  });
});

describe("referencia por defecto de residencias: IMSERSO España (4,05)", () => {
  it("el óptimo de la zona 04 y Pinto con 94 plazas, con las cifras que calcula el motor", async () => {
    const porDefecto = crearEntorno(datos);
    const op = ok(await ubicacionOptima(porDefecto, { servicio: "residencia", zona: "sur", plazas: 94 }));
    const p = op.salida.puntos[0]!;
    expect(op.salida.umbral).toBe(4.05);
    expect(p.seccion).toBe("2806504029");
    expect(p.reduce!).toBeCloseTo(93.78, 2);
    const pinto = ok(await simularCentro(porDefecto, { servicio: "residencia", lat: 40.242, lon: -3.7, plazas: 94 }));
    expect(pinto.salida.reduce!).toBeCloseTo(63.39, 2);
    expect(pinto.salida.pct_plazas_utiles).toBeDefined();
    const t = redactarResultado(pinto);
    expect(t).toMatch(/cubre 63,4 plazas más.*93,8 de 94 en Getafe.*el 68 % del óptimo/);
  });
});
