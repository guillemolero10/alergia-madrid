import estado0519 from "../../public/dias/2026-05-19/estado.json";
import { describe, expect, it } from "vitest";
import { lugares, validarEstado } from "./datos";
import { nivelParaPerfil } from "./nivelPerfil";

const estado = validarEstado(estado0519);
const getafe = lugares.municipios.find((m) => m.nombre === "Getafe")!;

describe("nivel según el perfil", () => {
  it("con asma solo cuenta el aire: el 19-may, con polen alto, el nivel es el del aire", () => {
    const n = nivelParaPerfil(estado, { afecta: "aire", polenes: ["gramineas"] }, getafe.estacion, getafe.captador);
    expect(n.nivelPolen).toBe("sin_dato");
    expect(n.nivel).toBe(n.nivelAire);
    expect(n.nivel).toBe("bajo");
    expect(n.peor).toBeNull();
  });

  it("con alergia a las gramíneas cuenta ese polen y nada más", () => {
    const n = nivelParaPerfil(estado, { afecta: "polen", polenes: ["gramineas"] }, getafe.estacion, getafe.captador);
    expect(n.nivel).toBe("alto");
    expect(n.peor).toBe("polen_gramineas");
    expect(n.nivelAire).toBe("sin_dato");
  });

  it("un polen que no has marcado no cuenta", () => {
    const n = nivelParaPerfil(estado, { afecta: "polen", polenes: ["abedul"] }, getafe.estacion, getafe.captador);
    expect(n.nivel).not.toBe("alto");
  });

  it("«las dos» es el máximo de aire y polen, y apagar una capa la excluye", () => {
    const perfil = { afecta: "ambos" as const, polenes: ["gramineas"] };
    expect(nivelParaPerfil(estado, perfil, getafe.estacion, getafe.captador).nivel).toBe("alto");
    expect(nivelParaPerfil(estado, perfil, getafe.estacion, getafe.captador, { polen: false }).nivel).toBe("bajo");
    expect(nivelParaPerfil(estado, perfil, getafe.estacion, getafe.captador, { aire: false, polen: false }).nivel).toBe("sin_dato");
  });

  it("sin captador no hay polen", () => {
    const n = nivelParaPerfil(estado, { afecta: "polen", polenes: ["gramineas"] }, getafe.estacion, null);
    expect(n.nivel).toBe("sin_dato");
  });
});
