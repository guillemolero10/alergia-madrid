import estado0226 from "../../public/dias/2026-02-26/estado.json";
import pron0226 from "../../public/dias/2026-02-26/pronostico.json";
import estado0519 from "../../public/dias/2026-05-19/estado.json";
import pron0519 from "../../public/dias/2026-05-19/pronostico.json";
import estado0724 from "../../public/dias/2026-07-24/estado.json";
import pron0724 from "../../public/dias/2026-07-24/pronostico.json";
import { describe, expect, it } from "vitest";
import { construirCaso, DEFINICIONES_CASOS, textoMedida } from "./casos";
import { textoAlternativa } from "./vecinos";
import { lugares, validarEstado, validarPronostico } from "./datos";
import type { DiaCargado } from "./dias";

const dias: Record<string, DiaCargado> = {
  "2026-02-26": { estado: validarEstado(estado0226), pronostico: validarPronostico(pron0226) },
  "2026-05-19": { estado: validarEstado(estado0519), pronostico: validarPronostico(pron0519) },
  "2026-07-24": { estado: validarEstado(estado0724), pronostico: validarPronostico(pron0724) },
};
const caso = (id: string) => {
  const def = DEFINICIONES_CASOS.find((d) => d.id === id)!;
  return construirCaso(def, dias[def.fecha]!, lugares)!;
};

describe("casos reales", () => {
  it("hay tres casos y cada uno apunta a un día que existe", () => {
    expect(DEFINICIONES_CASOS.map((d) => d.fecha)).toEqual(["2026-05-19", "2026-02-26", "2026-07-24"]);
    for (const d of DEFINICIONES_CASOS) {
      expect(dias[d.fecha]).toBeDefined();
      expect(lugares.municipios.some((m) => m.id === d.municipio)).toBe(true);
    }
  });

  it("gramíneas en Getafe: la cifra y el umbral salen de los datos", () => {
    const c = caso("gramineas");
    expect(c.hora).toBe("14:00");
    expect(c.nivel).toBe("alto");
    expect(c.medida?.valor).toBe(377);
    expect(c.medida?.umbral).toEqual({ valor: 53, modo: "desde" });
    expect(textoMedida(c.medida!)).toBe("Polen de gramíneas: 377 granos/m³ (valor diario) en el captador de Getafe. El nivel alto empieza en 53.");
    expect(c.sinBuenaHora).toBe(true);
    // Nivel alto en los 10 captadores: no hay otro sitio mejor
    expect(c.buscaAlternativa).toBe(true);
    expect(c.alternativas).toEqual([]);
    expect(c.igualEnLaZona).toBe(true);
  });

  it("cupresáceas en Alcobendas: hay un municipio cercano con un captador que da menos", () => {
    const c = caso("cupresaceas");
    expect(c.medida?.valor).toBe(1286);
    expect(c.medida?.umbral).toEqual({ valor: 171, modo: "desde" });
    expect(textoMedida(c.medida!)).toContain("1.286 granos/m³");
    expect(c.nivel).toBe("alto");
    expect(c.alternativas.length).toBeGreaterThan(0);
    for (const a of c.alternativas) {
      expect(a.km).toBeLessThanOrEqual(25);
      expect(a.nivel).toBe("medio");
      expect(a.municipio.captador).not.toBe(c.municipio.captador);
    }
    expect(textoAlternativa(c.alternativas[0]!, c.franjaAlternativas)).toMatch(/^En .+ \(\d+ km\) el nivel es medio/);
  });

  it("ozono en Rascafría: nivel alto medido, pero la tarde es buena y no hace falta cambiar de sitio", () => {
    const c = caso("ozono");
    expect(c.medida?.variable).toBe("o3");
    expect(c.medida?.valor).toBe(133.5);
    expect(textoMedida(c.medida!)).toBe("Ozono: 133,5 µg/m³ (media móvil de 8 h) en la estación de Rascafría. El nivel alto es por encima de 130.");
    expect(c.mejor?.nivel).toBe("bajo");
    expect(c.buscaAlternativa).toBe(false);
    expect(c.alternativas).toEqual([]);
  });
});
