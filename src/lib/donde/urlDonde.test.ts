import { describe, expect, it } from "vitest";
import { SERVICIOS } from "./servicios";
import {
  busquedaConDonde,
  conServicio,
  coordenadasValidas,
  estadoDondeDeLaUrl,
  estadoPorDefecto,
  ordenesDisponibles,
  parsearPlazas,
  parsearSim,
  referenciaPorDefecto,
} from "./urlDonde";

describe("estado de ¿Dónde hace falta? en la URL", () => {
  it("sin parámetros: residencias con su radio, la referencia por defecto y el orden por plazas", () => {
    const e = estadoDondeDeLaUrl("");
    expect(e).toEqual({
      servicio: "residencia",
      radio_m: 10000,
      zona: null,
      referencia: "imserso_espana",
      orden: "faltan",
      nivel: "municipio",
      sim: null,
      plazas: null,
      anio: 2025,
    });
    expect(referenciaPorDefecto()).toBe("imserso_espana");
  });

  it("?servicio=farmacia&radio=1000 abre así", () => {
    const e = estadoDondeDeLaUrl("?servicio=farmacia&radio=1000");
    expect(e.servicio).toBe("farmacia");
    expect(e.radio_m).toBe(1000);
    expect(e.orden).toBe("pct");
  });

  it("acepta cualquiera de los 3 radios de cada servicio y rechaza el resto", () => {
    for (const def of Object.values(SERVICIOS)) {
      for (const r of def.radios) expect(estadoDondeDeLaUrl(`?servicio=${def.id}&radio=${r}`).radio_m).toBe(r);
      expect(estadoDondeDeLaUrl(`?servicio=${def.id}&radio=123`).radio_m).toBe(def.radioDefecto);
    }
    expect(estadoDondeDeLaUrl("?servicio=farmacia&radio=abc").radio_m).toBe(1000);
    expect(estadoDondeDeLaUrl("?servicio=farmacia&radio=").radio_m).toBe(1000);
    expect(estadoDondeDeLaUrl("?servicio=farmacia&radio=-500").radio_m).toBe(1000);
    // un radio de otro servicio no vale
    expect(estadoDondeDeLaUrl("?servicio=farmacia&radio=10000").radio_m).toBe(1000);
  });

  it("servicio desconocido o con trucos de prototipo cae en residencias", () => {
    expect(estadoDondeDeLaUrl("?servicio=piscina").servicio).toBe("residencia");
    expect(estadoDondeDeLaUrl("?servicio=constructor").servicio).toBe("residencia");
    expect(estadoDondeDeLaUrl("?servicio=__proto__").servicio).toBe("residencia");
  });

  it("zona: solo dos cifras", () => {
    expect(estadoDondeDeLaUrl("?zona=04").zona).toBe("04");
    expect(estadoDondeDeLaUrl("?zona=4").zona).toBeNull();
    expect(estadoDondeDeLaUrl("?zona=sur").zona).toBeNull();
    expect(estadoDondeDeLaUrl("?zona=").zona).toBeNull();
    // varias zonas (la sierra), separadas por comas
    expect(estadoDondeDeLaUrl("?zona=06,10,11").zona).toBe("06,10,11");
    expect(estadoDondeDeLaUrl("?zona=06,,11").zona).toBeNull();
    expect(estadoDondeDeLaUrl("?zona=06,x").zona).toBeNull();
  });

  it("referencia y orden: valores válidos; «faltan» no existe en servicios por distancia", () => {
    expect(estadoDondeDeLaUrl("?ref=imserso_espana").referencia).toBe("imserso_espana");
    expect(estadoDondeDeLaUrl("?ref=imserso_madrid").referencia).toBe("imserso_madrid");
    expect(estadoDondeDeLaUrl("?ref=media").referencia).toBe("media");
    expect(estadoDondeDeLaUrl("?ref=otra").referencia).toBe("imserso_espana");
    expect(estadoDondeDeLaUrl("?orden=personas").orden).toBe("personas");
    expect(estadoDondeDeLaUrl("?servicio=farmacia&orden=faltan").orden).toBe("pct");
    expect(estadoDondeDeLaUrl("?servicio=residencia&orden=faltan").orden).toBe("faltan");
    // un enlace antiguo con un servicio que ya no existe cae en el de por defecto (residencia)
    expect(estadoDondeDeLaUrl("?servicio=centro_dia&orden=pct").servicio).toBe("residencia");
    expect(ordenesDisponibles("hospital")).toEqual(["pct", "personas"]);
    expect(ordenesDisponibles("residencia")).toEqual(["faltan", "pct", "personas"]);
  });

  it("nivel: municipio o distrito", () => {
    expect(estadoDondeDeLaUrl("?nivel=distrito").nivel).toBe("distrito");
    expect(estadoDondeDeLaUrl("?nivel=barrio").nivel).toBe("municipio");
  });

  it("ida y vuelta: lo que se escribe se lee igual", () => {
    const e = { ...estadoPorDefecto("residencia"), radio_m: 5000, zona: "04", referencia: "imserso_madrid" as const, orden: "pct" as const, nivel: "distrito" as const, sim: { lat: 40.24, lon: -3.77 }, plazas: 120 };
    expect(estadoDondeDeLaUrl(busquedaConDonde("", e))).toEqual(e);
    for (const id of Object.keys(SERVICIOS) as (keyof typeof SERVICIOS)[]) {
      const x = estadoPorDefecto(id);
      expect(estadoDondeDeLaUrl(busquedaConDonde("", x))).toEqual(x);
    }
  });

  it("conserva el resto de parámetros (vista, base, lugar) y no escribe lo que es por defecto", () => {
    const b = busquedaConDonde("?vista=municipio&base=raster&lugar=mun%3A28065", estadoPorDefecto("farmacia"));
    const p = new URLSearchParams(b);
    expect(p.get("vista")).toBe("municipio");
    expect(p.get("base")).toBe("raster");
    expect(p.get("lugar")).toBe("mun:28065");
    expect(p.get("servicio")).toBe("farmacia");
    expect(p.get("radio")).toBe("1000");
    for (const k of ["zona", "ref", "orden", "nivel", "sim"]) expect(p.has(k)).toBe(false);
  });

  it("quita zona, sim y ref cuando ya no valen", () => {
    const b = busquedaConDonde("?zona=04&sim=40.1,-3.7&ref=imserso_espana", estadoPorDefecto("farmacia"));
    const p = new URLSearchParams(b);
    expect(p.has("zona")).toBe(false);
    expect(p.has("sim")).toBe(false);
    expect(p.has("ref")).toBe(false); // la referencia solo existe en servicios con plazas
  });

  it("cambiar de servicio: radio del nuevo servicio, orden que siga valiendo, sin punto del simulador", () => {
    const e = { ...estadoPorDefecto("residencia"), zona: "04", sim: { lat: 40.2, lon: -3.7 } };
    const f = conServicio(e, "farmacia");
    expect(f.radio_m).toBe(1000);
    expect(f.orden).toBe("pct");
    expect(f.zona).toBe("04");
    expect(f.sim).toBeNull();
    expect(conServicio({ ...e, plazas: 120 }, "hospital").plazas).toBeNull();
    // el orden que el usuario eligió se conserva; el que era el de su servicio, no
    expect(conServicio({ ...e, orden: "personas" }, "hospital").orden).toBe("personas");
    expect(conServicio(conServicio(e, "farmacia"), "residencia").orden).toBe("faltan");
    expect(conServicio(estadoPorDefecto("farmacia"), "residencia").orden).toBe("faltan");
    expect(conServicio({ ...e, orden: "faltan" }, "hospital").orden).toBe("pct");
  });
});

describe("coordenadas del simulador (`sim`)", () => {
  it("acepta un punto de la Comunidad", () => {
    expect(parsearSim("40.24,-3.77")).toEqual({ lat: 40.24, lon: -3.77 });
    expect(parsearSim(" 40.24 , -3.77 ")).toEqual({ lat: 40.24, lon: -3.77 });
  });
  it("rechaza NaN, vacíos, texto, infinitos, un solo número y puntos fuera de la región", () => {
    for (const x of [null, "", "abc", "NaN,NaN", "40.2,", ",-3.7", "40.2", "40.2,-3.7,1", "Infinity,-3.7", "40,2,-3,7", "0,0", "48.85,2.35", "-3.77,40.24"]) {
      expect(parsearSim(x)).toBeNull();
    }
  });
  it("coordenadasValidas no deja pasar nada que no sea un número finito", () => {
    expect(coordenadasValidas(NaN, -3.7)).toBe(false);
    expect(coordenadasValidas(40.4, undefined)).toBe(false);
    expect(coordenadasValidas("40.4", -3.7)).toBe(false);
    expect(coordenadasValidas(Infinity, -3.7)).toBe(false);
    expect(coordenadasValidas(40.4, -3.7)).toBe(true);
  });
  it("el estado de la URL ignora un `sim` roto", () => {
    expect(estadoDondeDeLaUrl("?sim=NaN,NaN").sim).toBeNull();
    expect(estadoDondeDeLaUrl("?sim=40.24,-3.77").sim).toEqual({ lat: 40.24, lon: -3.77 });
  });
});

describe("plazas del simulador (`plazas`)", () => {
  it("solo enteros entre 25 y 200", () => {
    expect(parsearPlazas("94")).toBe(94);
    expect(parsearPlazas("25")).toBe(25);
    expect(parsearPlazas("200")).toBe(200);
    for (const malo of [null, "", "24", "201", "9.5", "-30", "abc", "1e2", "NaN"]) expect(parsearPlazas(malo)).toBeNull();
  });
  it("solo vale en residencia; en los demás servicios se ignora y no se escribe", () => {
    expect(estadoDondeDeLaUrl("?servicio=residencia&plazas=150").plazas).toBe(150);
        expect(estadoDondeDeLaUrl("?servicio=farmacia&plazas=150").plazas).toBeNull();
    expect(new URLSearchParams(busquedaConDonde("", { ...estadoPorDefecto("farmacia"), plazas: 150 })).has("plazas")).toBe(false);
    expect(new URLSearchParams(busquedaConDonde("", { ...estadoPorDefecto("residencia"), plazas: 150 })).get("plazas")).toBe("150");
  });
});

describe("año (`anio`)", () => {
  it("?anio=2030 se lee y se escribe; cualquier otro valor es hoy; hoy no se escribe", () => {
    expect(estadoDondeDeLaUrl("?anio=2030").anio).toBe(2030);
    for (const x of ["2031", "hoy", "", "2025"]) expect(estadoDondeDeLaUrl(`?anio=${x}`).anio).toBe(2025);
    expect(new URLSearchParams(busquedaConDonde("", { ...estadoPorDefecto("farmacia"), anio: 2030 })).get("anio")).toBe("2030");
    expect(new URLSearchParams(busquedaConDonde("?anio=2030", estadoPorDefecto("farmacia"))).has("anio")).toBe(false);
    const e = { ...estadoPorDefecto("residencia"), anio: 2030 as const };
    expect(estadoDondeDeLaUrl(busquedaConDonde("", e))).toEqual(e);
    expect(conServicio(e, "hospital").anio).toBe(2030);
  });
});
