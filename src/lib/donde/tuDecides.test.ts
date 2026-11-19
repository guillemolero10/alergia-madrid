// «Tú decides» con los datos reales: las cifras de los casos 4 y 5 de `referencia.json`, el óptimo por el camino del Web Worker
// (mensajes clonados con `structuredClone`) y el comportamiento del cliente (envío único de datos, cancelar, respaldo).
import { beforeAll, describe, expect, it } from "vitest";
import referencia from "../../../pipeline/donde/referencia.json";
import { calcularEstado, optimo } from "./cobertura";
import { canalEnMemoria, Cancelado, ClienteOptimo, type Canal } from "./clienteOptimo";
import { datosReales } from "./datosPrueba";
import { crearManejador, type MensajeAlWorker, type RespuestaDelWorker } from "./mensajesOptimo";
import {
  compararConOptimo,
  detalleSimulacion,
  decimalCortoEs,
  evaluarPunto,
  explicarCifra,
  fraseAprovechamiento,
  municipioEnPunto,
  opcionesEstado,
  pctEs,
  plazasEfectivas,
  porQueNadieGana,
  seccionesResaltadas,
  titularPrincipal,
  valorPrincipal,
} from "./tuDecides";
import type { Datos, EstadoServicio } from "./tipos";
import { estadoPorDefecto } from "./urlDonde";

let datos: Datos;
let re: EstadoServicio;
let cs: EstadoServicio;

const P5 = referencia.caso5.punto; // Pinto: 40,2420 / -3,7000
const TOL_N = 1e-5;
const OPCIONES_RE = opcionesEstado({ ...estadoPorDefecto("residencia"), radio_m: 10000, referencia: "media" });

beforeAll(async () => {
  datos = await datosReales();
  re = calcularEstado("residencia", datos.secciones, datos.servicios.residencia!, OPCIONES_RE);
  cs = calcularEstado("centro_salud", datos.secciones, datos.servicios.centro_salud!, opcionesEstado({ ...estadoPorDefecto("centro_salud"), radio_m: 2000 }));
});

describe("caso 5 de referencia.json: un centro colocado en Pinto (40,2420 / -3,7000)", () => {
  it("una residencia de 94 plazas reduce en 64 las plazas que faltan (N = 64,15; el 68 % llega a zonas con déficit)", () => {
    const ev = evaluarPunto(re, datos.territorios, P5.lat, P5.lon, 94);
    expect(ev.tipo).toBe("ok");
    if (ev.tipo !== "ok") return;
    expect(Math.abs(ev.sim.reduce! - referencia.caso5.residencia.reduce_faltan)).toBeLessThanOrEqual(TOL_N);
    expect(valorPrincipal(re, ev.sim)).toBe(ev.sim.reduce);
    expect(ev.sim.seccionesMejoran!.length).toBe(referencia.caso5.residencia.secciones_que_mejoran);
    expect(seccionesResaltadas(re, ev.sim)).toBe(ev.sim.seccionesMejoran);
    expect(ev.municipio.nombre).toBe("Pinto");
    expect(Math.abs(ev.sim.faltanDespues! - referencia.caso5.residencia.faltan_despues)).toBeLessThanOrEqual(1e-3);
    expect(titularPrincipal(re, ev.sim.reduce!)).toEqual({ numero: "64,2", texto: "plazas más cubiertas en la Comunidad" });
    expect(fraseAprovechamiento(ev.sim.reduce!, 94)).toBe("64,2 de sus 94 plazas llegan a zonas con margen de mejora");
  });
  it("un centro de salud (radio de 2 km) hace ganar acceso a 2.363 personas", () => {
    const ev = evaluarPunto(cs, datos.territorios, P5.lat, P5.lon, null);
    expect(ev.tipo === "ok" && ev.sim.ganan).toBe(referencia.caso5.centro_salud.ganan);
    expect(ev.tipo === "ok" && ev.sim.ganan).toBe(2363);
  });
  it("con más plazas reducen más (o igual) y con menos, menos (o igual)", () => {
    const g = (plazas: number) => {
      const ev = evaluarPunto(re, datos.territorios, P5.lat, P5.lon, plazas);
      return ev.tipo === "ok" ? ev.sim.reduce! : -1;
    };
    expect(g(25)).toBeLessThanOrEqual(g(94));
    expect(g(94)).toBeLessThanOrEqual(g(200));
    expect(g(200)).toBeGreaterThan(g(25));
  });
});

describe("caso 4: el botón del modelo (óptimo en un Web Worker simulado con structuredClone)", () => {
  it("el manejador, con los mensajes y la respuesta clonados, da Leganés, sección 2807405017, N = 93,82", () => {
    const manejar = crearManejador();
    const mandar = (m: MensajeAlWorker): RespuestaDelWorker | null => {
      const r = manejar(structuredClone(m));
      return r ? structuredClone(r) : null;
    };
    mandar({ tipo: "datos", secciones: datos.secciones });
    mandar({ tipo: "centros", servicio: "residencia", centros: datos.servicios.residencia! });
    const r = mandar({ tipo: "optimo", id: 7, servicio: "residencia", estado: OPCIONES_RE, opciones: { n: 1, zona: referencia.caso4.zona_candidatos, plazas: referencia.caso4.plazas } });
    expect(r?.tipo).toBe("resultado");
    if (r?.tipo !== "resultado") return;
    expect(r.id).toBe(7);
    const p = r.resultado.puntos[0]!;
    expect(p.seccion).toBe("2807405017");
    expect(p.seccion).toBe(referencia.caso4.seccion);
    expect(Math.abs(p.reduce! - referencia.caso4.reduce_faltan)).toBeLessThanOrEqual(TOL_N);
    expect(p.municipio).toBe("mun:28074");
    expect(datos.territorios.municipios.find((m) => m.id === p.municipio)?.nombre).toBe("Leganés");
    expect(Math.abs(r.resultado.faltanDespues! - referencia.caso4.faltan_despues)).toBeLessThanOrEqual(1e-3);
  });
  it("simular en el punto del modelo da lo mismo que el óptimo (así se pintan sus secciones)", () => {
    const o = optimo(re, { n: 1, zona: "04", plazas: 94 });
    const p = o.puntos[0]!;
    const ev = evaluarPunto(re, datos.territorios, p.lat, p.lon, 94);
    expect(ev.tipo === "ok" && Math.abs(ev.sim.reduce! - p.reduce!) <= 1e-9).toBe(true);
    expect(ev.tipo === "ok" && ev.sim.seccionesMejoran!.length).toBe(referencia.caso4.secciones_que_mejoran);
  });
  it("sin datos, el manejador contesta con un error y no lanza", () => {
    const r = crearManejador()({ tipo: "optimo", id: 1, servicio: "residencia", estado: OPCIONES_RE, opciones: {} });
    expect(r).toEqual({ tipo: "error", id: 1, mensaje: expect.stringContaining("faltan") });
  });
  it("un servicio sin centros que ganar no devuelve puntos, sin error", () => {
    const m = crearManejador();
    m({ tipo: "datos", secciones: datos.secciones });
    m({ tipo: "centros", servicio: "farmacia", centros: datos.servicios.farmacia! });
    // zona que no existe: sin candidatos
    const r = m({ tipo: "optimo", id: 2, servicio: "farmacia", estado: { radio_m: 1000 }, opciones: { n: 1, zona: "99" } });
    expect(r?.tipo === "resultado" && r.resultado.puntos).toEqual([]);
  });
});

describe("comparación con el modelo", () => {
  it("el caso 5 frente al óptimo de la zona 04: 68 %", () => {
    const c = compararConOptimo(referencia.caso5.residencia.reduce_faltan, referencia.caso4.reduce_faltan);
    expect(c.pct).toBeCloseTo(referencia.caso5.residencia.pct_del_optimo_zona_04, 1);
    expect(c.supera).toBe(false);
    expect(pctEs(c.pct!)).toBe("68 %");
  });
  it("supera al modelo si gana más; sin ganancia del modelo, no hay porcentaje", () => {
    expect(compararConOptimo(2000, 1581).supera).toBe(true);
    expect(compararConOptimo(1581, 1581)).toEqual({ pct: 100, supera: false });
    expect(compararConOptimo(10, 0).pct).toBeNull();
    expect(compararConOptimo(0, 0)).toEqual({ pct: null, supera: false });
  });
  it("un 99,6 % no se enseña como «100 %»", () => {
    expect(pctEs(99.6)).toBe("99 %");
    expect(pctEs(100)).toBe("100 %");
    expect(pctEs(0.2)).toBe("0 %");
  });
});

describe("dónde cae un punto", () => {
  it("reconoce municipios y descarta lo que está fuera de la Comunidad", () => {
    expect(municipioEnPunto(datos.territorios, P5.lat, P5.lon)?.nombre).toBe("Pinto");
    expect(municipioEnPunto(datos.territorios, 40.4168, -3.7038)?.nombre).toBe("Madrid");
    expect(municipioEnPunto(datos.territorios, 39.86, -4.02)).toBeNull(); // Toledo
    expect(municipioEnPunto(datos.territorios, 41.1, -3.0)).toBeNull(); // Guadalajara, dentro del recuadro de la región
    expect(municipioEnPunto(datos.territorios, 0, 0)).toBeNull();
  });
  it("coordenadas que no son números: «fuera», nunca una excepción", () => {
    for (const [lat, lon] of [[NaN, NaN], [Infinity, 0], [40.4, NaN]] as const) {
      expect(evaluarPunto(re, datos.territorios, lat, lon, 94)).toEqual({ tipo: "fuera" });
    }
  });
  it("evaluar un punto es instantáneo (el resultado en vivo no frena el mapa)", () => {
    const t0 = performance.now();
    for (let k = 0; k < 50; k++) evaluarPunto(re, datos.territorios, P5.lat + k * 0.001, P5.lon, 94);
    expect((performance.now() - t0) / 50).toBeLessThan(15);
  });
});

describe("plazas y frases", () => {
  it("plazas efectivas: las del catálogo, acotadas a 25-200, y null sin plazas", () => {
    expect(plazasEfectivas("residencia", null)).toBe(94);
    expect(plazasEfectivas("residencia", 10)).toBe(25);
    expect(plazasEfectivas("residencia", 999)).toBe(200);
    expect(plazasEfectivas("farmacia", 100)).toBeNull();
  });
  it("frases con el número en español y el grupo del servicio", () => {
    expect(titularPrincipal(re, 64.15)).toEqual({ numero: "64,2", texto: "plazas más cubiertas en la Comunidad" });
    expect(titularPrincipal(re, 1.2)).toEqual({ numero: "1,2", texto: "plazas más cubiertas en la Comunidad" });
    expect(titularPrincipal(re, 0.3).numero).toBe("<1");
    expect(titularPrincipal(re, 1234.4).numero).toBe("1234,4");
    expect(titularPrincipal(cs, 2363)).toEqual({ numero: "+2.363", texto: "habitantes con un centro de salud cerca" });
    expect(explicarCifra(cs)).toContain("2 km");
    expect(explicarCifra(re)).toContain("por cada 100");
    expect(explicarCifra(re)).toContain("Plazas más cubiertas");
    expect(decimalCortoEs(93.82)).toBe("93,8");
    expect(decimalCortoEs(94)).toBe("94");
    expect(decimalCortoEs(93.96)).toBe("94");
    expect(fraseAprovechamiento(94, 94)).toBe("todas sus 94 plazas llegan a zonas con margen de mejora");
    expect(fraseAprovechamiento(93.8, 94)).toBe("93,8 de sus 94 plazas llegan a zonas con margen de mejora"); // 99,8 % no se enseña como 100 %
    const ev = evaluarPunto(re, datos.territorios, P5.lat, P5.lon, 94);
    if (ev.tipo !== "ok") throw new Error("debería evaluar");
    expect(detalleSimulacion(re, ev.sim, 94)).toMatch(/Sus 94 plazas se reparten entre los 98\.330 mayores a menos de 10 km/);
    const evCs = evaluarPunto(cs, datos.territorios, P5.lat, P5.lon, null);
    if (evCs.tipo !== "ok") throw new Error("debería evaluar");
    expect(detalleSimulacion(cs, evCs.sim, null)).toMatch(/distancia media al más cercano baja de/);
    expect(porQueNadieGana(cs, evCs.sim).length).toBeGreaterThan(10);
  });
});

// ---------------------------------------------------------------- cliente del Web Worker
interface CanalFalso extends Canal {
  mensajes: MensajeAlWorker[];
}

/** Un «worker» en memoria que clona todo lo que entra y sale, y contesta tras `retardo` ms. */
function canalClonado(retardo = 0): CanalFalso {
  const manejar = crearManejador();
  let recibir: (r: RespuestaDelWorker) => void = () => undefined;
  const mensajes: MensajeAlWorker[] = [];
  return {
    mensajes,
    enviar(m) {
      const c = structuredClone(m);
      mensajes.push(c);
      const r = manejar(c);
      if (r) setTimeout(() => recibir(structuredClone(r)), retardo);
    },
    alRecibir: (cb) => {
      recibir = cb;
    },
    alFallar: () => undefined,
    cerrar: () => undefined,
  };
}

const pedirParla = (c: ClienteOptimo, plazas = 94) =>
  c.calcular("residencia", datos.secciones, datos.servicios.residencia!, OPCIONES_RE, { n: 1, zona: "04", plazas });

describe("cliente del óptimo", () => {
  it("los datos grandes viajan una sola vez al worker; las siguientes peticiones solo llevan las opciones", async () => {
    const canal = canalClonado();
    const cliente = new ClienteOptimo(() => canal);
    const a = await pedirParla(cliente).promesa;
    const b = await pedirParla(cliente, 150).promesa;
    expect(a.puntos[0]?.seccion).toBe("2807405017");
    expect(Math.abs(a.puntos[0]!.reduce! - 93.82032)).toBeLessThanOrEqual(TOL_N);
    expect(b.puntos[0]?.reduce).toBeGreaterThan(a.puntos[0]!.reduce!);
    expect(canal.mensajes.map((m) => m.tipo)).toEqual(["datos", "centros", "optimo", "optimo"]);
    // al cambiar de servicio solo se añaden los centros de ese servicio
    await cliente.calcular("farmacia", datos.secciones, datos.servicios.farmacia!, { radio_m: 1000 }, { n: 1, zona: "04" }).promesa;
    expect(canal.mensajes.map((m) => m.tipo).slice(4)).toEqual(["centros", "optimo"]);
  });

  it("cancelar descarta la respuesta tardía y rechaza con «Cancelado»", async () => {
    const cliente = new ClienteOptimo(() => canalClonado(20));
    const vieja = pedirParla(cliente);
    vieja.cancelar();
    await expect(vieja.promesa).rejects.toBeInstanceOf(Cancelado);
    const nueva = await pedirParla(cliente).promesa;
    expect(nueva.puntos[0]?.seccion).toBe("2807405017");
  });

  it("dos peticiones a la vez se contestan cada una con lo suyo", async () => {
    const cliente = new ClienteOptimo(() => canalClonado(5));
    const [a, b] = await Promise.all([pedirParla(cliente, 94).promesa, pedirParla(cliente, 200).promesa]);
    expect(a.puntos[0]?.seccion).toBe("2807405017");
    expect(b.puntos[0]!.reduce!).toBeGreaterThan(a.puntos[0]!.reduce!);
  });

  it("si no se puede crear el worker, calcula en el hilo principal con el mismo resultado", async () => {
    const cliente = new ClienteOptimo(() => {
      throw new Error("Worker no disponible");
    });
    const r = await pedirParla(cliente).promesa;
    expect(r.puntos[0]?.seccion).toBe("2807405017");
  });

  it("si el worker muere a mitad, se reenvía lo pendiente al hilo principal", async () => {
    let fallar: (m: string) => void = () => undefined;
    const roto: Canal = {
      enviar: () => undefined, // nunca contesta
      alRecibir: () => undefined,
      alFallar: (cb) => {
        fallar = cb;
      },
      cerrar: () => undefined,
    };
    const cliente = new ClienteOptimo(() => roto);
    const p = pedirParla(cliente);
    fallar("el script no carga");
    const r = await p.promesa;
    expect(r.puntos[0]?.seccion).toBe("2807405017");
    // y las siguientes peticiones ya van al hilo principal
    expect((await pedirParla(cliente, 120).promesa).puntos.length).toBe(1);
  });

  it("el canal en memoria funciona solo", async () => {
    const cliente = new ClienteOptimo(canalEnMemoria);
    expect((await pedirParla(cliente).promesa).puntos[0]?.seccion).toBe("2807405017");
  });

  it("un error del cálculo llega como rechazo con su mensaje", async () => {
    const cliente = new ClienteOptimo(() => canalClonado());
    await expect(cliente.calcular("residencia", datos.secciones, datos.servicios.residencia!, { radio_m: -5 }, {}).promesa).rejects.toThrow(/Radio no válido/);
  });
});
