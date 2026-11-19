// «Mi municipio»: buscador, lugar en la URL, textos de la ficha y otros servicios sociales, con los datos reales.
import { beforeAll, describe, expect, it } from "vitest";
import { municipios } from "../../../datos-estaticos/lugares.json";
import { fichaLugar, ranking } from "./agregados";
import { aliasDeLugares, buscarLugar, sugerirLugares } from "./buscador";
import { calcularEstado } from "./cobertura";
import { datosReales } from "./datosPrueba";
import { comoElTuyo, construirVista, describirTramo } from "./fichaVista";
import { busquedaConLugar, CLAVE_LUGAR, existeLugar, guardarLugar, leerLugarGuardado, lugarDeLaUrl } from "./lugarUrl";
import { otrosSocialesDe, sectorLegible } from "./otrosSociales";
import { SERVICIO_IDS } from "./servicios";
import type { Datos, EstadoServicio, ServicioId } from "./tipos";

let d: Datos;
let estados: Record<ServicioId, EstadoServicio>;
const alias = aliasDeLugares({ municipios: municipios as { id: string; alias?: string[] }[] });

beforeAll(async () => {
  d = await datosReales();
  estados = Object.fromEntries(SERVICIO_IDS.map((id) => [id, calcularEstado(id, d.secciones, d.servicios[id]!, {})])) as never;
});

const resolver = (texto: string) => {
  const r = buscarLugar(d.territorios, texto, alias);
  return r.tipo === "lugar" ? r.lugar.nombre : r.tipo;
};

describe("buscador", () => {
  it("resuelve municipios, distritos, alias y erratas sin tildes", () => {
    expect(resolver("Getafe")).toBe("Getafe");
    expect(resolver("parla")).toBe("Parla");
    expect(resolver("acebeda")).toBe("La Acebeda");
    expect(resolver("Centro")).toBe("Centro");
    expect(resolver("Fuenla")).toBe("Fuenlabrada");
    expect(resolver("Alcala")).toBe("Alcalá de Henares");
    expect(resolver("San Sebastian de los Reyes")).toBe("San Sebastián de los Reyes");
    expect(resolver("Sanse")).toBe("San Sebastián de los Reyes");
    expect(resolver("Mostoles")).toBe("Móstoles");
    expect(resolver("Fuenlabada")).toBe("Fuenlabrada");
  });
  it("Centro es un distrito y Getafe un municipio", () => {
    const c = buscarLugar(d.territorios, "Centro", alias);
    expect(c.tipo === "lugar" && c.lugar.id).toBe("dis:2807901");
    const g = buscarLugar(d.territorios, "Getafe", alias);
    expect(g.tipo === "lugar" && g.lugar.id).toBe("mun:28065");
  });
  it("una consulta ambigua da sugerencias y una zona se avisa como zona", () => {
    const r = buscarLugar(d.territorios, "san", alias);
    expect(r.tipo).toBe("ninguno");
    expect(r.tipo === "ninguno" && r.sugerencias.length).toBeGreaterThan(1);
    expect(buscarLugar(d.territorios, "sur", alias).tipo).toBe("zona");
    expect(buscarLugar(d.territorios, "zzzqx", alias)).toEqual({ tipo: "ninguno", sugerencias: [] });
    expect(sugerirLugares(d.territorios, "", alias)).toEqual([]);
  });
  it("nunca devuelve zonas entre las sugerencias", () => {
    for (const q of ["sur", "sierra", "norte", "madrid"]) expect(sugerirLugares(d.territorios, q, alias).every((c) => c.id.startsWith("mun:") || c.id.startsWith("dis:"))).toBe(true);
  });
});

describe("lugar en la URL y en el navegador", () => {
  it("lee y escribe ?lugar= conservando lo demás", () => {
    expect(lugarDeLaUrl("?vista=municipio&lugar=mun:28106")).toBe("mun:28106");
    expect(lugarDeLaUrl("?lugar=dis:2807901")).toBe("dis:2807901");
    expect(lugarDeLaUrl("?lugar=<script>")).toBeNull();
    expect(lugarDeLaUrl("?lugar=zona:04")).toBeNull();
    expect(busquedaConLugar("?vista=municipio&base=raster", "mun:28065")).toBe("?vista=municipio&base=raster&lugar=mun%3A28065");
    expect(busquedaConLugar("?lugar=mun:28065&x=1", null)).toBe("?x=1");
  });
  it("comprueba que el lugar existe y recuerda el último", () => {
    expect(existeLugar(d.territorios, "mun:28106")).toBe(true);
    expect(existeLugar(d.territorios, "mun:99999")).toBe(false);
    const almacen = new Map<string, string>();
    const a = { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v) };
    expect(leerLugarGuardado(d.territorios, a)).toBeNull();
    guardarLugar("mun:28106", a);
    expect(leerLugarGuardado(d.territorios, a)).toBe("mun:28106");
    almacen.set(CLAVE_LUGAR, "mun:00000");
    expect(leerLugarGuardado(d.territorios, a)).toBeNull();
  });
});

describe("ficha en lenguaje llano", () => {
  const vista = (id: string) => construirVista(fichaLugar(id, estados, d.territorios), estados, d.territorios, id)!;
  it("Getafe, Parla, La Acebeda y Centro muestran los 7 servicios", () => {
    for (const id of ["mun:28065", "mun:28106", "mun:28001", "dis:2807901"]) {
      const v = vista(id);
      expect(v.filas.map((f) => f.id).sort()).toEqual([...SERVICIO_IDS].sort());
      v.filas.forEach((f) => expect(f.titular.length).toBeGreaterThan(10));
    }
  });
  it("Parla: lo que más le falta son el desfibrilador y la farmacia, con frases con nombre", () => {
    const v = vista("mun:28106");
    expect(v.loQueFalta.map((f) => f.id)).toEqual(["dea", "farmacia"]);
    expect(v.loQueFalta[0]!.frase).toContain("un punto con desfibrilador por cada 1.568 vecinos");
    expect(v.filas.find((f) => f.id === "centro_salud")!.titular).toBe("En Parla hay 5 centros de salud para 138.012 vecinos.");
    expect(v.grupoComparacion).toBe("Los municipios de más de 100.000 habitantes");
  });
  it("un pueblo cubierto por el vecino no cuenta como carencia", () => {
    const v = vista("mun:28001");
    expect(v.nombre).toBe("La Acebeda");
    const cs = v.filas.find((f) => f.id === "centro_salud")!;
    expect(cs.semaforo).toBe("cubierto");
    expect(v.loQueFalta.map((f) => f.id)).not.toContain("centro_salud");
    expect(cs.lineas.join(" ")).toContain("a menos de 2 km");
    const centro = vista("dis:2807901");
    expect(centro.filas.find((f) => f.id === "hospital")!.semaforo).toBe("cubierto");
    expect(centro.loQueFalta).toEqual([]);
  });
  it("cada cifra de plazas y porcentajes sale formateada en español", () => {
    const g = vista("mun:28065");
    const r = g.filas.find((f) => f.id === "residencia")!;
    expect(r.semaforo).toBe("debajo");
    expect(r.titular).toMatch(/^En Getafe hay 7 residencias de mayores con [\d.]+ plazas, para 38\.119 mayores de 65 años\.$/);
    expect(r.referencia?.cumple).toBe(false);
    expect(g.loQueFalta[0]!.plazasFaltan).toBe(679) // con IMSERSO España (4,05), la referencia por defecto;
  });
  it("sin servicios calculados todavía, la ficha trae solo la cabecera", () => {
    const v = construirVista(null, {}, d.territorios, "mun:28106")!;
    expect(v.filas).toEqual([]);
    expect(v.nombre).toBe("Parla");
    expect(construirVista(null, {}, d.territorios, "mun:99999")).toBeNull();
  });
  it("describe los tramos de tamaño", () => {
    expect(describirTramo("<2.000")).toBe("menos de 2.000 habitantes");
    expect(describirTramo("2.000-10.000")).toBe("entre 2.000 y 10.000 habitantes");
    expect(comoElTuyo("<2.000")).toBe("Los pueblos de menos de 2.000 habitantes");
    expect(comoElTuyo(">100.000")).toBe("Los municipios de más de 100.000 habitantes");
  });
});

describe("otros servicios sociales", () => {
  it("cuenta por sector en un municipio y en un distrito, y une los sectores repetidos", () => {
    const parla = otrosSocialesDe(d.otrosSociales!, d.territorios, "mun:28106");
    expect(parla.reduce((s, f) => s + f.n, 0)).toBeGreaterThan(0);
    const centro = otrosSocialesDe(d.otrosSociales!, d.territorios, "dis:2807901");
    expect(centro.reduce((s, f) => s + f.n, 0)).toBeGreaterThan(0);
    const madrid = otrosSocialesDe(d.otrosSociales!, d.territorios, "mun:28079").reduce((s, f) => s + f.n, 0);
    expect(centro.reduce((s, f) => s + f.n, 0)).toBeLessThan(madrid);
    expect(sectorLegible("(Inmigracion) Otros grupos en situación de necesidad")).toBe("Otros grupos en situación de necesidad");
    expect(sectorLegible("Adolescencia")).toBe("Infancia y adolescencia");
    expect(new Set(parla.map((f) => f.sector)).size).toBe(parla.length);
  });
});

describe("I-2: municipios rurales con un centro dentro y secciones enormes", () => {
  const sanMartin = () => {
    const r = buscarLugar(d.territorios, "San Martín de Valdeiglesias", alias);
    if (r.tipo !== "lugar") throw new Error("no se encuentra San Martín de Valdeiglesias");
    return r.lugar.id;
  };
  it("la fila de centro de salud sale como aproximada y la ficha no afirma «el 100 % vive a más de 2 km»", () => {
    const f = fichaLugar(sanMartin(), estados, d.territorios)!.servicios.find((x) => x.id === "centro_salud")!;
    expect(f.n).toBeGreaterThan(0);
    expect(f.aproximada).toBe(true);
    const v = construirVista(fichaLugar(sanMartin(), estados, d.territorios), estados, d.territorios, sanMartin())!;
    const fila = v.filas.find((x) => x.id === "centro_salud")!;
    const texto = [fila.titular, ...fila.lineas].join(" ");
    expect(texto).not.toMatch(/vive a más de/);
    expect(texto).toContain("aproximado");
  });
  it("una ciudad (secciones pequeñas) no se marca como aproximada", () => {
    const r = buscarLugar(d.territorios, "Parla", alias);
    if (r.tipo !== "lugar") throw new Error("Parla");
    const f = fichaLugar(r.lugar.id, estados, d.territorios)!.servicios;
    expect(f.some((x) => x.aproximada)).toBe(false);
  });
});

describe("R3: filas aproximadas del ranking", () => {
  it("con orden por defecto (pct o personas), ninguna de las 10 primeras filas por municipio de un servicio por distancia es aproximada", () => {
    for (const id of ["centro_salud", "farmacia", "colegio", "dea"] as const) {
      const todas = ranking(estados[id], d.territorios, { limite: 1000 });
      expect(todas.some((f) => f.aproximada), id).toBe(true);
      expect(todas.some((f) => !f.aproximada), id).toBe(true);
      for (const orden of ["pct", "personas"] as const) {
        const f = ranking(estados[id], d.territorios, { orden, limite: 10 });
        expect(f.filter((x) => x.aproximada), `${id} ${orden}`).toEqual([]);
        const todasOrden = ranking(estados[id], d.territorios, { orden, limite: 1000 });
        const primera = todasOrden.findIndex((x) => x.aproximada);
        expect(todasOrden.slice(primera).every((x) => x.aproximada || x.en_deficit === 0), `${id} ${orden}: tras las aproximadas solo quedan las que no tienen a nadie lejos`).toBe(true);
      }
    }
  });
  it("R3b: en una zona rural cuyas filas con gente lejos son todas aproximadas, el ranking no las esconde tras las filas a 0", () => {
    // Sierra Norte (06), Nordeste (07) y Sierra Sur (10): antes el ranking empezaba por municipios al 0 % y el agente decía «todo cubierto».
    const casos: [string, "centro_salud" | "farmacia" | "dea"][] = [["06", "centro_salud"], ["07", "farmacia"], ["10", "dea"]];
    for (const [zona, id] of casos) {
      for (const orden of ["pct", "personas"] as const) {
        const f = ranking(estados[id], d.territorios, { orden, zona, limite: 1000 });
        const conGente = f.filter((x) => x.en_deficit > 0);
        expect(conGente.length, `${zona} ${id}`).toBeGreaterThan(0);
        const primeraCero = f.findIndex((x) => x.en_deficit === 0);
        if (primeraCero >= 0) expect(f.slice(primeraCero).every((x) => x.en_deficit === 0), `${zona} ${id} ${orden}`).toBe(true);
        expect(f[0]!.en_deficit, `${zona} ${id} ${orden}: la primera fila tiene gente lejos`).toBeGreaterThan(0);
      }
    }
  });
});
