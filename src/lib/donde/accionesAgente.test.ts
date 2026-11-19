// Ejecución de las acciones del agente, con los datos reales y un destino simulado; y la pregunta de F5 de principio a fin.
import { beforeAll, describe, expect, it } from "vitest";
import { describirAccion, ejecutarAcciones, filasDeRanking, validarAccion, type Destino } from "./accionesAgente";
import { crearClienteAgente } from "./clienteAgente";
import { datosReales } from "./datosPrueba";
import { crearEntorno } from "./herramientas";
import { responderSinIA } from "./intencion";
import type { Accion, Datos } from "./tipos";

let datos: Datos;
beforeAll(async () => {
  datos = await datosReales();
});

function destinoGrabador() {
  const llamadas: string[] = [];
  const d: Destino = {
    elegirServicio: (a) => void llamadas.push(`servicio:${a.servicio}:${a.radio_m ?? ""}`),
    moverMapa: (a) => void llamadas.push(`mapa:${a.bbox ? "bbox" : `${a.lat},${a.lon},${a.zoom}`}`),
    marcarPuntos: (a) => void llamadas.push(`puntos:${a.origen}:${a.puntos.length}`),
    mostrarRanking: (a) => void llamadas.push(`ranking:${a.nivel}:${a.zona ?? ""}`),
    abrirFicha: (a) => void llamadas.push(`ficha:${a.lugar}`),
  };
  return { llamadas, d };
}

describe("ejecutarAcciones", () => {
  it("las ejecuta en orden y espera a las asíncronas", async () => {
    const orden: string[] = [];
    const d: Destino = {
      elegirServicio: async () => {
        await new Promise((r) => setTimeout(r, 15));
        orden.push("servicio");
      },
      moverMapa: () => void orden.push("mapa"),
      marcarPuntos: () => void orden.push("puntos"),
      mostrarRanking: () => void orden.push("ranking"),
      abrirFicha: () => void orden.push("ficha"),
    };
    const acciones: Accion[] = [
      { tipo: "elegir_servicio", servicio: "residencia", radio_m: 10000 },
      { tipo: "marcar_puntos", servicio: "residencia", origen: "optimo", puntos: [{ lat: 40.24, lon: -3.77, etiqueta: "Opción 1", ganan: 10 }] },
      { tipo: "mover_mapa", lat: 40.24, lon: -3.77, zoom: 12 },
    ];
    const r = await ejecutarAcciones(acciones, d);
    expect(orden).toEqual(["servicio", "puntos", "mapa"]);
    expect(r.every((x) => x.ok)).toBe(true);
  });

  it("descarta las acciones no válidas sin cortar las demás", async () => {
    const { llamadas, d } = destinoGrabador();
    const malas = [
      { tipo: "elegir_servicio", servicio: "gimnasio" },
      { tipo: "mover_mapa", lat: 0, lon: 0 },
      { tipo: "mover_mapa", lat: Number.NaN, lon: -3.7 },
      { tipo: "mover_mapa", bbox: [-3, 40, -4, 41] },
      { tipo: "marcar_puntos", servicio: "dea", origen: "optimo", puntos: [] },
      { tipo: "abrir_ficha", lugar: "../etc" },
      { tipo: "borrar" },
    ] as unknown as Accion[];
    const r = await ejecutarAcciones([...malas, { tipo: "abrir_ficha", lugar: "mun:28106" }], d);
    expect(r.slice(0, malas.length).every((x) => !x.ok)).toBe(true);
    expect(r[malas.length]?.ok).toBe(true);
    expect(llamadas).toEqual(["ficha:mun:28106"]);
  });

  it("un fallo del destino queda anotado y no corta las siguientes", async () => {
    const { llamadas, d } = destinoGrabador();
    d.marcarPuntos = () => {
      throw new Error("el punto cae fuera de la Comunidad");
    };
    const r = await ejecutarAcciones(
      [
        { tipo: "marcar_puntos", servicio: "dea", origen: "simulacion", puntos: [{ lat: 40.4, lon: -3.7, etiqueta: "x", ganan: 1 }] },
        { tipo: "abrir_ficha", lugar: "mun:28106" },
      ],
      d,
    );
    expect(r.map((x) => x.ok)).toEqual([false, true]);
    expect(r[0]?.motivo).toMatch(/fuera/);
    expect(llamadas).toEqual(["ficha:mun:28106"]);
  });

  it("avisa de cada paso y los describe en español", async () => {
    const { d } = destinoGrabador();
    const vistos: string[] = [];
    await ejecutarAcciones([{ tipo: "mover_mapa", bbox: [-4, 40, -3.5, 40.5] }, { tipo: "marcar_puntos", servicio: "dea", origen: "optimo", puntos: [{ lat: 40.3, lon: -3.7, etiqueta: "a", ganan: 1 }] }], d, (a) => vistos.push(describirAccion(a)));
    expect(vistos).toEqual(["Moviendo el mapa…", "Pintando el punto del modelo…"]);
  });

  it("valida plazas y recuadros", () => {
    expect(validarAccion({ tipo: "marcar_puntos", servicio: "residencia", origen: "optimo", puntos: [{ lat: 40.3, lon: -3.7, etiqueta: "a", ganan: 1, plazas: -3 }] })).toMatch(/plazas/);
    expect(validarAccion({ tipo: "marcar_puntos", servicio: "residencia", origen: "optimo", puntos: [{ lat: 40.3, lon: -3.7, etiqueta: "a", ganan: 1, plazas: 94, reduce: -1 }] })).toMatch(/cifra/);
    expect(validarAccion({ tipo: "marcar_puntos", servicio: "residencia", origen: "optimo", puntos: [{ lat: 40.3, lon: -3.7, etiqueta: "a", ganan: 1, plazas: 94, reduce: 93.8 }] })).toBeNull();
    expect(validarAccion({ tipo: "mover_mapa", bbox: [-4, 40, -3.5, 40.5] })).toBeNull();
    expect(validarAccion({ tipo: "mostrar_ranking", servicio: "dea", nivel: "municipio", zona: "04", filas: [] })).toBeNull();
    expect(validarAccion({ tipo: "mostrar_ranking", servicio: "dea", nivel: "municipio", zona: "sur", filas: [] })).toMatch(/zona/);
  });
});

describe("la pregunta del criterio de F5, sin /api", () => {
  it("«¿Dónde pondrías una residencia en el sur?» -> servicio, punto del modelo (Leganés, 93,8 de 94 plazas), mapa y «Modo sin IA» en menos de 1 s", async () => {
    const fetchSinApi = (async () => new Response("no existe", { status: 404 })) as unknown as typeof fetch;
    const cliente = crearClienteAgente({
      fetch: fetchSinApi,
      local: (p) => responderSinIA(p, crearEntorno(datos, { contexto: p.contexto, referencia: "media" })),
    });
    const t0 = performance.now();
    const r = await cliente.preguntar({
      mensajes: [{ rol: "usuario", texto: "¿Dónde pondrías una residencia en el sur?" }],
      contexto: { vista: "donde", servicio: "residencia", radio_m: 10000, lugar: null },
    });
    const { llamadas, d } = destinoGrabador();
    const resultados = await ejecutarAcciones(r.respuesta.acciones, d);
    expect(performance.now() - t0).toBeLessThan(1000);

    expect(r.via).toBe("local");
    expect(r.respuesta.modo).toBe("reglas");
    expect(r.aviso).toBeTruthy();
    expect(resultados.every((x) => x.ok)).toBe(true);
    expect(llamadas[0]).toMatch(/^servicio:residencia/);
    expect(llamadas).toContain("puntos:optimo:1");
    expect(llamadas.some((l) => l.startsWith("mapa:"))).toBe(true);
    const marca = r.respuesta.acciones.find((a) => a.tipo === "marcar_puntos");
    expect(marca?.tipo === "marcar_puntos" && Math.abs(marca.puntos[0]!.reduce! - 93.82)).toBeLessThan(0.006);
    expect(marca?.tipo === "marcar_puntos" && marca.puntos[0]?.plazas).toBe(94);
    expect(r.respuesta.texto).toMatch(/Leganés/);
  });

  it("el ranking trae sus filas para enseñarlas en el mensaje", async () => {
    const r = await responderSinIA(
      { mensajes: [{ rol: "usuario", texto: "¿Qué municipios de la sierra están peor en centros de salud?" }], contexto: { vista: "donde", servicio: null, radio_m: null, lugar: null } },
      crearEntorno(datos, { referencia: "media" }),
    );
    const rk = filasDeRanking(r.acciones);
    expect(rk?.filas.length).toBeGreaterThan(0);
    expect(rk?.servicio).toBe("centro_salud");
  });
});
