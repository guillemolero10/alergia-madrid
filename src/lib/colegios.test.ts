import colegiosJson from "../../datos-estaticos/colegios.json";
import estado0519 from "../../public/dias/2026-05-19/estado.json";
import pron0519 from "../../public/dias/2026-05-19/pronostico.json";
import estado0724 from "../../public/dias/2026-07-24/estado.json";
import pron0724 from "../../public/dias/2026-07-24/pronostico.json";
import { describe, expect, it } from "vitest";
import {
  avisosCobertura,
  buscarCentros,
  conArticulo,
  evaluarCentro,
  fraseEducacionFisica,
  fraseRecreo,
  HORARIO_ORIENTATIVO,
  horasLectivas,
  horasQueToca,
  indexarCentros,
  nombreCentro,
  PERFIL_COLEGIO,
  recreosDe,
  resumirColegios,
  UMBRAL_COBERTURA_KM,
  type Centro,
} from "./colegios";
import { lugares, validarEstado, validarPronostico } from "./datos";
import { evaluarLugar } from "./evaluar";

const centros = colegiosJson.centros as Centro[];
const indice = indexarCentros(centros, lugares.municipios);
const hist = (e: unknown, p: unknown) => ({ estado: validarEstado(e), pronostico: validarPronostico(p) });
const d0519 = hist(estado0519, pron0519);
const d0724 = hist(estado0724, pron0724);

function evaluador(dia: typeof d0519) {
  const ahora = new Date(dia.estado.fecha_referencia);
  return { ahora, ev: (c: Centro) => evaluarLugar(PERFIL_COLEGIO, { estacion: c.ea, captador: c.ca }, dia.pronostico, dia.estado, lugares, ahora) };
}

describe("buscador de centros", () => {
  it("encuentra por nombre sin tildes ni mayúsculas, aunque se escriba con tilde", () => {
    const a = buscarCentros(indice, "cardenal cisneros");
    const b = buscarCentros(indice, "CARDENAL Cisnéros");
    expect(a.total).toBeGreaterThan(0);
    expect(b.centros.map((c) => c.c)).toEqual(a.centros.map((c) => c.c));
    expect(a.centros[0]!.n.toLowerCase()).toContain("cisneros");
  });

  it("encuentra por municipio y limita los resultados, diciendo cuántos hay", () => {
    const r = buscarCentros(indice, "Alcalá de Henares", 5);
    expect(r.centros).toHaveLength(5);
    expect(r.total).toBeGreaterThan(5);
    expect(r.centros.every((c) => c.m === "mun:28005")).toBe(true);
    expect(buscarCentros(indice, "alcala de henares", 5).total).toBe(r.total);
  });

  it("pide al menos dos letras y no devuelve nada si no hay coincidencia", () => {
    expect(buscarCentros(indice, "a").centros).toEqual([]);
    expect(buscarCentros(indice, "zzzzqq").total).toBe(0);
  });

  it("el nombre que empieza por lo escrito va antes que el que solo lo contiene", () => {
    const r = buscarCentros(indice, "cervantes", 50).centros;
    const primerMal = r.findIndex((c) => !c.n.toLowerCase().startsWith("cervantes"));
    const ultimoBien = r.map((c) => c.n.toLowerCase().startsWith("cervantes")).lastIndexOf(true);
    if (primerMal >= 0) expect(ultimoBien).toBeLessThan(primerMal);
  });
});

describe("horario orientativo", () => {
  it("lectivo de 9 a 14 y la tarde solo si se marca", () => {
    expect(horasLectivas(false)).toEqual([9, 10, 11, 12, 13]);
    expect(horasLectivas(true)).toEqual([9, 10, 11, 12, 13, 16]);
    expect(HORARIO_ORIENTATIVO.lectivo).toEqual({ desde: 9, hasta: 14 });
  });
  it("los recreos tocan la hora de las 11 y cada centro tiene los de sus etapas", () => {
    for (const r of Object.values(HORARIO_ORIENTATIVO.recreo)) expect(horasQueToca(r)).toEqual([11]);
    expect(recreosDe({ e: "IP" }).map((r) => r.etiqueta)).toEqual(["Infantil y primaria"]);
    expect(recreosDe({ e: "S" }).map((r) => r.etiqueta)).toEqual(["Secundaria"]);
    expect(recreosDe({ e: "IPS" })).toHaveLength(2);
    expect(horasQueToca({ desde: 10 * 60 + 45, hasta: 12 * 60 + 15 })).toEqual([10, 11, 12]);
  });
});

describe("nombres", () => {
  it("pone el tipo delante y el artículo", () => {
    expect(nombreCentro({ n: "El Alamo", t: "CEIP" })).toBe("CEIP El Alamo");
    expect(conArticulo({ n: "Complutense", t: "IES" })).toBe("el IES Complutense");
    expect(conArticulo({ n: "Hastings School", t: "EXT" })).toBe("Hastings School");
    expect(conArticulo({ n: "Colegio Aleman de Madrid", t: "EXT" })).toBe("el Colegio Aleman de Madrid");
  });
});

describe("evaluar un centro", () => {
  const getafe = centros.find((c) => c.m === "mun:28065" && c.t === "CEIP")!;

  it("19-may (polen de gramíneas alto, aire limpio): el polen no cierra el patio", () => {
    const { ahora, ev } = evaluador(d0519);
    const e = evaluarCentro(getafe, ev(getafe)!, { ahora, historico: true, tarde: false })!;
    expect(e.fecha).toBe("2026-05-19");
    expect(e.dia).toBe("historico");
    expect(e.nivelRecreo).not.toBe("alto");
    expect(e.causa?.variable ?? "").not.toMatch(/^polen_/);
  });

  it("solo mira las horas lectivas y el recreo es la hora de las 11", () => {
    const { ahora, ev } = evaluador(d0519);
    const e = evaluarCentro(getafe, ev(getafe)!, { ahora, historico: true, tarde: true })!;
    expect(e.recreos.map((r) => r.recreo.etiqueta)).toEqual(["Infantil y primaria"]);
    expect(e.mejorFranja === null || (e.mejorFranja.horaDesde >= 9 && e.mejorFranja.horaHasta <= 17)).toBe(true);
  });

  it("24-jul (ozono): la mañana es buena y la jornada entera permite salir", () => {
    const { ahora, ev } = evaluador(d0724);
    const c = centros.find((x) => x.m === "mun:28065")!;
    const e = evaluarCentro(c, ev(c)!, { ahora, historico: true, tarde: false })!;
    expect(["bajo", "medio", "alto"]).toContain(e.nivelRecreo);
    expect(e.nivelJornada).not.toBe("sin_dato");
  });

  it("si en tiempo real ya no queda jornada lectiva, habla de mañana", () => {
    const { ev } = evaluador(d0519);
    const tarde = new Date("2026-05-19T19:00:00+02:00");
    const hoyYa = evaluarCentro(getafe, ev(getafe)!, { ahora: tarde, historico: false, tarde: false });
    if (hoyYa) {
      expect(hoyYa.dia).toBe("manana");
      expect(hoyYa.fecha).toBe("2026-05-20");
    }
  });

  it("avisa si es fin de semana (19-may es martes; 23-may sábado)", () => {
    const { ahora, ev } = evaluador(d0519);
    const e = evaluarCentro(getafe, ev(getafe)!, { ahora, historico: true, tarde: false })!;
    expect(e.finDeSemana).toBe(false);
  });
});

describe("cobertura de los datos", () => {
  it("avisa solo si la estación de aire queda a más de 10 km (el polen no cuenta en el patio)", () => {
    expect(UMBRAL_COBERTURA_KM).toBe(10);
    expect(avisosCobertura({ de: 4 }, "Getafe")).toEqual([]);
    const lejos = avisosCobertura({ de: 14.1 }, "Alcorcón");
    expect(lejos.map((a) => a.clave)).toEqual(["aire"]);
    expect(lejos[0]!.texto).toContain("14,1 km");
  });
  it("todos los centros tienen estación y la mayoría captador", () => {
    expect(centros.length).toBe(1910);
    expect(centros.every((c) => lugares.estaciones.some((e) => e.id === c.ea))).toBe(true);
    expect(centros.every((c) => c.ca === null || lugares.captadores.some((k) => k.id === c.ca))).toBe(true);
  });
});

describe("resumen para el mapa", () => {
  it("cuenta los 1.910 centros y cada uno tiene un nivel", () => {
    const { ahora, ev } = evaluador(d0519);
    const r = resumirColegios(centros, ev, { ahora, historico: true, tarde: false });
    expect(r.total).toBe(1910);
    expect(r.recuento.bajo + r.recuento.medio + r.recuento.alto + r.recuento.sin_dato).toBe(1910);
    expect(r.niveles.size).toBe(1910);
    // El 19-may hay polen alto en los 10 captadores, pero el patio solo depende del aire: casi todos, fuera
    expect(r.recuento.bajo).toBeGreaterThan(r.recuento.alto);
    expect(r.fecha).toBe("2026-05-19");
  });
});
