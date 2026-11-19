// Catálogo de servicios tras los cambios del 18-nov (tarde): 6 servicios, colegios con ESO y centros de día fuera.
import { beforeAll, describe, expect, it } from "vitest";
import { datosReales } from "./datosPrueba";
import { MENSAJE_CENTROS_DE_DIA, interpretar, responderSinIA } from "./intencion";
import { crearEntorno } from "./herramientas";
import { CENTROS_DE_DIA, HOGARES_Y_CLUBES, otrosSocialesDe } from "./otrosSociales";
import { SERVICIO_IDS, SERVICIOS, esServicioId } from "./servicios";
import type { Datos } from "./tipos";
import { estadoDondeDeLaUrl } from "./urlDonde";

let d: Datos;
beforeAll(async () => {
  d = await datosReales();
});

describe("catálogo de servicios", () => {
  it("son 6 y el centro de día ya no es uno de ellos", () => {
    expect(SERVICIO_IDS).toEqual(["centro_salud", "hospital", "residencia", "farmacia", "colegio", "dea"]);
    expect(esServicioId("centro_dia")).toBe(false);
    expect(Object.keys(d.servicios).sort()).toEqual([...SERVICIO_IDS].sort());
  });
  it("solo las residencias tienen plazas", () => {
    expect(SERVICIO_IDS.filter((id) => SERVICIOS[id].metrica === "plazas")).toEqual(["residencia"]);
  });
  it("colegios e institutos: 1.620 centros (1.158 públicos y 462 concertados), con la etapa de ESO", () => {
    const c = d.servicios.colegio!;
    expect(c.ids.length).toBe(1620);
    expect(c.titularidad!.filter((t) => t === "publica").length).toBe(1158);
    expect(c.titularidad!.filter((t) => t === "concertada").length).toBe(462);
    expect(SERVICIOS.colegio.nombre).toBe("Colegio o instituto");
    expect(SERVICIOS.colegio.sinonimos).toContain("instituto");
  });
  it("residencias: 500 centros con coordenadas y 18 sin ellas (avisadas)", () => {
    expect(d.servicios.residencia!.ids.length).toBe(500);
    expect(d.servicios.residencia!.descartados_sin_coordenadas).toBe(18);
  });
});

describe("la URL antigua ?servicio=centro_dia", () => {
  it("se normaliza al servicio por defecto (residencia) con su radio", () => {
    const e = estadoDondeDeLaUrl("?servicio=centro_dia&radio=5000&plazas=63&ref=imserso_espana");
    expect(e.servicio).toBe("residencia");
    expect(e.radio_m).toBe(10000); // el 5 km del centro de día no se arrastra
    expect(e.plazas).toBeNull(); // ni sus 63 plazas
  });
});

describe("«Mi municipio»: otros servicios sociales", () => {
  it("los centros de mayores se separan en centros de día y hogares y clubes", () => {
    const filas = otrosSocialesDe(d.otrosSociales!, d.territorios, "mun:28106");
    const dia = filas.find((f) => f.sector === CENTROS_DE_DIA)!;
    const club = filas.find((f) => f.sector === HOGARES_Y_CLUBES)!;
    expect(dia.n).toBe(5);
    expect(dia.plazas).toBe(193);
    expect(club.n).toBe(2);
    expect(club.plazas).toBe(0); // el aforo de un club no son plazas de atención de día
    expect(filas.some((f) => f.sector === "Personas mayores")).toBe(false);
  });
  it("en toda la Comunidad: 312 centros de día y 211 hogares y clubes con coordenadas", () => {
    const o = d.otrosSociales!;
    let dia = 0, club = 0;
    for (let j = 0; j < o.ids.length; j++) {
      if (o.sector![j] !== "Personas mayores") continue;
      if (o.subtipo![j] === "CENTROS DE DÍA: OTROS") dia++;
      else if (o.subtipo![j] === "HOGARES Y CLUBES") club++;
    }
    expect([dia, club]).toEqual([312, 211]);
  });
});

describe("el agente y los centros de día", () => {
  for (const frase of ["¿Dónde pondrías un centro de día en el sur?", "centros de dia en Getafe", "¿Cuántos centros de día tiene Parla?", "y si pongo un centro de día en Pinto"]) {
    it(`«${frase}» se contesta con honestidad y se sugiere residencias`, async () => {
      const i = interpretar(frase, { territorios: d.territorios });
      expect(i.tipo).toBe("no_entendida");
      if (i.tipo !== "no_entendida") return;
      expect(i.mensaje).toBe(MENSAJE_CENTROS_DE_DIA);
      expect(i.sugerencias[0]).toContain("residencia");
      const r = await responderSinIA({ mensajes: [{ rol: "usuario", texto: frase }], contexto: { vista: "donde", servicio: null, radio_m: null, lugar: null } }, crearEntorno(d));
      expect(r.acciones).toEqual([]);
      expect(r.texto).toContain("no son un servicio del simulador");
      expect(r.texto).not.toMatch(/\d/); // sin cifras inventadas
    });
  }
  it("lo de residencias sigue funcionando", () => {
    expect(interpretar("¿Dónde pondrías una residencia en el sur?", { territorios: d.territorios }).tipo).toBe("llamadas");
  });
});
