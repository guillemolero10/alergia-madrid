import { describe, expect, it } from "vitest";
import { calcularAireHoy, fuenteAireDe, hayAire, textoHasta, type EntradaAire, type LugarMinimo } from "./aireHoy";
import { lugares } from "./datos";
import { calcularFranja, medidasDelPerfil } from "./franja";
import type { EstadoActual, Nivel, Observacion, Pronostico } from "./tipos";

const GETAFE: LugarMinimo = { id: "mun:28065", nombre: "Getafe", lat: 40.3146, lon: -3.7169 };
const MADRID: LugarMinimo = { id: "mun:28079", nombre: "Madrid", lat: 40.4168, lon: -3.7038 };
const ACEBEDA: LugarMinimo = { id: "mun:28001", nombre: "La Acebeda", lat: 41.0869, lon: -3.6248 };
// Centro de un distrito de la capital (cualquier punto de Madrid sirve: no hay estación de la Comunidad dentro).
const CENTRO: LugarMinimo = { id: "dis:2807901", nombre: "Centro", lat: 40.4153, lon: -3.7074 };

const A = (iso: string) => new Date(iso);

function obs(estacion: string, horaFin: string, nivel: Nivel = "bajo"): Observacion[] {
  return (["no2", "o3", "pm10", "pm25"] as const).map((variable, i) => ({
    lugar: estacion,
    variable,
    valor: [9, 57, 9, 3][i]!,
    unidad: "µg/m³",
    hora: horaFin,
    fuente: "ckan",
    nivel,
  }));
}

function estado(estacion: string, horaFin: string, extra: Partial<EstadoActual> = {}, nivel: Nivel = "bajo"): EstadoActual {
  return {
    version: 1,
    generado: horaFin,
    modo: "tiempo_real",
    fecha_referencia: horaFin,
    capas: {
      aire: { ultimo_dato: horaFin, fuente: "ckan", estado: "ok" },
      viento: { ultimo_dato: horaFin, fuente: "open-meteo", estado: "ok" },
    },
    observaciones: obs(estacion, horaFin, nivel),
    riesgo: [],
    viento: [],
    ...extra,
  };
}

/** 48 horas desde las 16:00 del 18-nov (hora de Madrid), todas en nivel `nivel` salvo las horas de `altas`. */
function pronostico(estacion: string, generado: string, nivel = 1, altas: number[] = [], inicio = "2026-11-18T16:00:00+01:00"): Pronostico {
  const horas = Array.from({ length: 48 }, (_, i) => {
    const t = Date.parse(inicio) + i * 3_600_000;
    const d = new Date(t + 3_600_000); // Madrid en invierno = UTC+1
    return `${d.toISOString().slice(0, 13)}:00:00+01:00`;
  });
  const niveles = horas.map((_, i) => (altas.includes(i) ? 3 : nivel));
  return {
    version: 1,
    generado,
    fuentes: { meteo: "open-meteo", aire_polen: "cams" },
    horas,
    unidades: {},
    sin_sin: undefined,
    sin_pronostico: [],
    zonas: [{ lugar: estacion, valores: { no2: horas.map(() => 10) }, niveles: { no2: niveles } }],
  } as unknown as Pronostico;
}

function entrada(lugar: LugarMinimo, e: Partial<EntradaAire>): EntradaAire {
  const fuente = fuenteAireDe(lugar, lugares)!;
  return {
    lugar,
    lugares,
    estado: estado(fuente.estacion.id, "2026-11-18T15:00:00+01:00"),
    origenEstado: "red",
    pronostico: pronostico(fuente.estacion.id, "2026-11-18T15:25:00+01:00"),
    origenPronostico: "red",
    ahora: A("2026-11-18T15:30:00+01:00"),
    ...e,
  };
}

describe("fuenteAireDe", () => {
  it("Getafe usa su propia estación", () => {
    const f = fuenteAireDe(GETAFE, lugares)!;
    expect(f.estacion.id).toBe("est:28065014");
    expect(f.km).toBe(0);
    expect(f.lejana).toBe(false);
    expect(f.capital).toBe(false);
  });

  it("Madrid y sus distritos: estación de la Comunidad más cercana, lejana y marcada como capital", () => {
    const m = fuenteAireDe(MADRID, lugares)!;
    expect(m).toMatchObject({ lejana: true, capital: true });
    expect(m.km).toBeGreaterThan(5);
    const d = fuenteAireDe(CENTRO, lugares)!;
    expect(d).toMatchObject({ lejana: true, capital: true });
    expect(d.estacion.mide).toContain("no2");
    // La estación elegida es de verdad la más cercana de todas.
    const km = (e: { lat: number; lon: number }) => Math.hypot((e.lat - CENTRO.lat) * 111, (e.lon - CENTRO.lon) * 85);
    const mejor = [...lugares.estaciones].sort((a, b) => km(a) - km(b))[0]!;
    expect(d.estacion.id).toBe(mejor.id);
  });

  it("un pueblo de la sierra sin estación cercana es «lejana» pero no es la capital", () => {
    expect(fuenteAireDe(ACEBEDA, lugares)).toMatchObject({ lejana: true, capital: false });
  });

  it("los 179 municipios tienen una estación que existe", () => {
    for (const m of lugares.municipios) {
      const f = fuenteAireDe({ id: m.id, nombre: m.nombre, lat: m.lat, lon: m.lon }, lugares);
      expect(f, m.nombre).not.toBeNull();
      expect(lugares.estaciones.some((e) => e.id === f!.estacion.id)).toBe(true);
    }
  });

  it("sin la ficha del municipio en lugares.json, cae a la estación más cercana por coordenadas", () => {
    const f = fuenteAireDe({ id: "mun:99999", nombre: "Inventado", lat: 40.3146, lon: -3.7169 }, lugares)!;
    expect(f.estacion.id).toBe("est:28065014");
  });
});

describe("textoHasta", () => {
  it("la hora del dato es el final de la hora medida: «hasta las»", () => {
    expect(textoHasta("2026-11-18T15:00:00+01:00", A("2026-11-18T15:30:00+01:00"))).toBe("hoy, hasta las 15:00");
    expect(textoHasta("2026-11-17T22:00:00+01:00", A("2026-11-18T08:00:00+01:00"))).toBe("ayer, hasta las 22:00");
    expect(textoHasta("2026-11-15T18:00:00+01:00", A("2026-11-18T15:30:00+01:00"))).toBe("15 nov, hasta las 18:00");
  });
});

describe("calcularAireHoy", () => {
  it("Getafe al día: veredicto, hora del dato, franja de 24 h y ningún aviso", () => {
    const v = calcularAireHoy(entrada(GETAFE, {}))!;
    expect(v.titular).toEqual({ nivel: "bajo", cuando: "hoy" });
    expect(v.base).toBe("medido y previsión");
    expect(v.textoMedida).toBe("hoy, hasta las 15:00");
    expect(v.medidaAntigua).toBe(false);
    expect(v.avisos).toEqual([]);
    expect(v.horas).toHaveLength(24);
    expect(v.medidas.map((m) => m.corto)).toEqual(["NO₂", "O₃", "PM10", "PM2,5"]);
    expect(hayAire(v)).toBe(true);
  });

  it("un dato de hace más de 3 h lleva aviso ámbar con la hora y deja de contar como medido", () => {
    const v = calcularAireHoy(entrada(GETAFE, { ahora: A("2026-11-18T20:58:00+01:00") }))!;
    expect(v.medidaAntigua).toBe(true);
    expect(v.avisos[0]).toMatchObject({ tipo: "antiguo" });
    expect(v.avisos[0]!.texto).toContain("Sin actualizar desde hace 5 horas");
    expect(v.avisos[0]!.texto).toContain("hoy, hasta las 15:00");
    expect(v.base).toBe("previsión");
  });

  it("justo en el límite de 3 h todavía no avisa", () => {
    const v = calcularAireHoy(entrada(GETAFE, { ahora: A("2026-11-18T18:00:00+01:00") }))!;
    expect(v.avisos.filter((a) => a.tipo === "antiguo")).toEqual([]);
  });

  it("la fuente caída avisa aunque el dato sea reciente", () => {
    const e = estado("est:28065014", "2026-11-18T15:00:00+01:00");
    e.capas.aire.estado = "error";
    const v = calcularAireHoy(entrada(GETAFE, { estado: e }))!;
    expect(v.avisos[0]!.texto).toContain("La fuente no responde");
    expect(v.medidaAntigua).toBe(true);
  });

  it("estado de respaldo: aviso con su fecha, sin veredicto, y las medidas como «última medición»", () => {
    const e = estado("est:28065014", "2026-11-15T18:00:00+01:00");
    const v = calcularAireHoy(entrada(GETAFE, { estado: e, origenEstado: "respaldo", pronostico: null }))!;
    expect(v.avisos[0]).toMatchObject({ tipo: "respaldo" });
    expect(v.avisos[0]!.texto).toContain("15 nov, hasta las 18:00");
    expect(v.titular).toBeNull();
    expect(v.horas).toBeNull();
    expect(v.base).toBeNull();
    expect(v.medidaAntigua).toBe(true);
    expect(v.medidas).toHaveLength(4);
    expect(hayAire(v)).toBe(true);
  });

  it("sin previsión y con una medición al día: el veredicto es lo medido", () => {
    const v = calcularAireHoy(entrada(GETAFE, { pronostico: null }))!;
    expect(v.titular).toEqual({ nivel: "bajo", cuando: "medido" });
    expect(v.base).toBe("medido");
    expect(v.horas).toBeNull();
  });

  it("pronóstico de respaldo (todo ya pasado): no se inventa una previsión", () => {
    const antiguo = pronostico("est:28065014", "2026-11-15T18:46:00+01:00", 1, [], "2026-11-15T19:00:00+01:00");
    const v = calcularAireHoy(entrada(GETAFE, { pronostico: antiguo, origenPronostico: "respaldo" }))!;
    expect(v.horas).toBeNull();
    expect(v.titular).toEqual({ nivel: "bajo", cuando: "medido" }); // la medición de las 15:00 sigue al día a las 15:30
  });

  it("sin estado pero con previsión: veredicto de la previsión y sin medidas", () => {
    const v = calcularAireHoy(entrada(GETAFE, { estado: null }))!;
    expect(v.medidas).toEqual([]);
    expect(v.titular?.cuando).toBe("hoy");
    expect(v.base).toBe("previsión");
  });

  it("sin nada: no hay aire que enseñar", () => {
    const v = calcularAireHoy(entrada(GETAFE, { estado: null, pronostico: null }));
    expect(hayAire(v)).toBe(false);
  });

  it("Madrid: aviso de cobertura que explica lo del Ayuntamiento y da la distancia", () => {
    const v = calcularAireHoy(entrada(MADRID, {}))!;
    const a = v.avisos.find((x) => x.tipo === "cobertura")!;
    expect(a.texto).toContain("Ayuntamiento");
    expect(a.texto).toContain("km");
    expect(a.texto).toContain("aproximación");
    // Un distrito habla de la capital, no de «Centro no tiene estaciones».
    const d = calcularAireHoy(entrada(CENTRO, {}))!.avisos.find((x) => x.tipo === "cobertura")!;
    expect(d.texto).toMatch(/^Madrid capital no tiene estaciones/);
  });

  it("un pueblo lejano (no la capital) avisa sin hablar del Ayuntamiento", () => {
    const a = calcularAireHoy(entrada(ACEBEDA, {}))!.avisos.find((x) => x.tipo === "cobertura")!;
    expect(a.texto).toContain("La Acebeda");
    expect(a.texto).not.toContain("Ayuntamiento");
  });

  it("una hora alta de la previsión sale como «evita» y el veredicto sube", () => {
    const f = fuenteAireDe(GETAFE, lugares)!;
    const v = calcularAireHoy(entrada(GETAFE, { pronostico: pronostico(f.estacion.id, "2026-11-18T15:25:00+01:00", 1, [5, 6, 7]) }))!;
    expect(v.titular?.nivel).toBe("alto");
    expect(v.peor).not.toBeNull();
  });

  it("un pronóstico de más de 3 h avisa de que puede haber cambiado", () => {
    const f = fuenteAireDe(GETAFE, lugares)!;
    const v = calcularAireHoy(
      entrada(GETAFE, { ahora: A("2026-11-18T19:00:00+01:00"), pronostico: pronostico(f.estacion.id, "2026-11-18T15:25:00+01:00") }),
    )!;
    expect(v.avisos.some((a) => a.tipo === "previsionAntigua" && a.texto.includes("3 horas"))).toBe(true);
  });
});

// La hora de una medición es el FINAL de la hora medida (el `hNN` de la Comunidad marca el final): la medida de 14:00 a 15:00
// se llama «15:00» y debe contar para la barra de las 14:00, no solo para las siguientes.
describe("la hora del dato de aire es el final de la hora", () => {
  const ahora = A("2026-11-18T15:30:00+01:00");

  it("la medición con hora 15:00 empieza en la barra de las 14:00", () => {
    const m = medidasDelPerfil({ afecta: "aire", polenes: [] }, estado("est:28065014", "2026-11-18T15:00:00+01:00"), { estacion: "est:28065014", captador: null }, lugares, ahora);
    expect(m).toHaveLength(4);
    expect(m[0]!.desde).toBe(A("2026-11-18T14:00:00+01:00").toISOString());
    expect(m[0]!.hasta).toBe(ahora.toISOString());
  });

  it("la barra de las 14:00 sale como medida (alto) y la de las 13:00 no", () => {
    const e = estado("est:28065014", "2026-11-18T15:00:00+01:00", {}, "alto");
    const horas = Array.from({ length: 6 }, (_, i) => `2026-11-18T${String(12 + i).padStart(2, "0")}:00:00+01:00`);
    const zona = { lugar: "est:28065014", valores: { no2: horas.map(() => 10) }, niveles: { no2: horas.map(() => 1) } };
    const medidas = medidasDelPerfil({ afecta: "aire", polenes: [] }, e, { estacion: "est:28065014", captador: null }, lugares, ahora);
    const r = calcularFranja({ horas, zona, variables: ["no2"], ahora, medidas });
    const nivel = (h: number) => r.horas.find((x) => x.hora === h)!;
    expect(nivel(13).nivel).toBe("bajo");
    expect(nivel(14)).toMatchObject({ nivel: "alto", origen: "medido" });
    expect(nivel(15)).toMatchObject({ nivel: "alto", origen: "medido" }); // la hora en curso hereda la última medición
  });
});
