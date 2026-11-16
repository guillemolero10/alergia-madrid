import { describe, expect, it } from "vitest";
import { fechaHoraLarga, formatearKm, formatearNumero, formatearUltimoDato, horaCorta, horaDeSerie } from "./formato";

describe("fechas legibles en hora de Madrid", () => {
  const ahora = new Date("2026-11-15T18:30:00+01:00");

  it("dice hoy, ayer o la fecha", () => {
    expect(formatearUltimoDato("2026-11-15T13:00:00+01:00", ahora)).toBe("hoy, 13:00");
    expect(formatearUltimoDato("2026-11-14T22:00:00+01:00", ahora)).toBe("ayer, 22:00");
    expect(formatearUltimoDato("2026-11-10T09:00:00+01:00", ahora)).toBe("10 nov, 09:00");
    expect(formatearUltimoDato("2025-12-31T09:00:00+01:00", ahora)).toBe("31 dic 2025, 09:00");
  });

  it("entiende las fechas sin hora del polen", () => {
    expect(formatearUltimoDato("2026-11-15", ahora)).toBe("hoy");
    expect(formatearUltimoDato("2026-11-14", ahora)).toBe("ayer");
    expect(formatearUltimoDato("2026-11-12", ahora)).toBe("12 nov");
  });

  it("no depende de la zona horaria del navegador", () => {
    // 12:00 UTC en noviembre son las 13:00 en Madrid; en verano, las 14:00.
    expect(horaCorta("2026-11-15T12:00:00Z")).toBe("13:00");
    expect(horaCorta("2026-05-19T12:00:00Z")).toBe("14:00");
    expect(formatearUltimoDato("2026-11-14T23:30:00Z", ahora)).toBe("hoy, 00:30");
  });

  it("escribe la fecha larga del respaldo", () => {
    expect(fechaHoraLarga("2026-11-15T13:26:15+01:00")).toBe("15 nov 2026, 13:26");
    expect(fechaHoraLarga("2026-11-12")).toBe("12 nov 2026");
  });

  it("calcula la hora de cada punto de la serie", () => {
    expect(horaDeSerie("2026-11-15T13:00:00+01:00", 23, 24)).toBe("13:00");
    expect(horaDeSerie("2026-11-15T13:00:00+01:00", 0, 24)).toBe("14:00");
    expect(horaDeSerie("2026-11-15T13:00:00+01:00", 12, 24)).toBe("02:00");
  });

  it("aguanta fechas rotas", () => {
    expect(formatearUltimoDato("no es una fecha", ahora)).toBe("sin fecha");
    expect(horaCorta("")).toBe("");
  });
});

describe("números", () => {
  it("usa coma decimal", () => {
    expect(formatearNumero(1.1)).toBe("1,1");
    expect(formatearNumero(23)).toBe("23");
    expect(formatearNumero(41.52)).toBe("41,5");
    expect(formatearKm(1.46)).toBe("1,5 km");
  });
});
