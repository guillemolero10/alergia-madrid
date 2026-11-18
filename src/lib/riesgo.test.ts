import { describe, expect, it } from "vitest";
import {
  COLOR_NIVEL,
  TINTA_NIVEL,
  colorDeNivel,
  contarNiveles,
  etiquetaDeNivel,
  nivelMaximo,
  nivelVisible,
  nombreVariable,
  ordenDeNivel,
  resumirRecuento,
} from "./riesgo";
import { NIVELES, type Riesgo } from "./tipos";

/** Luminancia relativa (WCAG) de un color #rrggbb. */
function luminancia(hex: string): number {
  const canal = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
}
const contraste = (a: string, b: string) => {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (oscuro + 0.05);
};

const PAPEL = "#f3efe6"; // tierra del mapa (PALETA_MAPA.tierra)
const PANEL = "#fffdf8"; // fondo de los paneles (--superficie)
const TINTA = "#1f2328"; // texto principal y contorno de los símbolos

describe("conversión de nivel a color", () => {
  it("da un color distinto a cada nivel", () => {
    const colores = NIVELES.map(colorDeNivel);
    expect(new Set(colores).size).toBe(4);
    expect(colorDeNivel("bajo")).toBe("#24896b");
    expect(colorDeNivel("medio")).toBe("#e0a100");
    expect(colorDeNivel("alto")).toBe("#c8372d");
  });

  it("pinta «sin dato» en gris (sin tono)", () => {
    const gris = colorDeNivel("sin_dato");
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(gris.slice(i, i + 2), 16)) as [number, number, number];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(40);
  });

  it.each([undefined, null, "", "extremo", 3, {}])("trata %p como «sin dato»", (valor) => {
    expect(colorDeNivel(valor)).toBe(COLOR_NIVEL.sin_dato);
    expect(etiquetaDeNivel(valor)).toBe("Sin dato");
  });

  it("verde, rojo y gris se leen sobre la tierra crema del mapa (contraste AA para gráficos, 3:1)", () => {
    for (const nivel of ["bajo", "alto", "sin_dato"] as const) {
      expect(contraste(COLOR_NIVEL[nivel], PAPEL)).toBeGreaterThan(3);
    }
  });

  it("el ámbar, más claro, se apoya en el contorno de tinta de los símbolos (3:1 entre relleno y contorno)", () => {
    expect(contraste(COLOR_NIVEL.medio, TINTA)).toBeGreaterThan(3);
  });

  it("la versión para texto de cada nivel cumple AA (4,5:1) sobre el blanco roto de los paneles", () => {
    for (const nivel of NIVELES) expect(contraste(TINTA_NIVEL[nivel], PANEL)).toBeGreaterThan(4.5);
  });

  it("medio y alto se distinguen también por luminosidad, no solo por el tono rojo-verde", () => {
    expect(luminancia(COLOR_NIVEL.medio) / luminancia(COLOR_NIVEL.alto)).toBeGreaterThan(1.8);
    // El verde lleva mucho azul: se separa del ámbar y del rojo en el eje azul-amarillo.
    const azul = (hex: string) => parseInt(hex.slice(5, 7), 16);
    expect(azul(COLOR_NIVEL.bajo) - azul(COLOR_NIVEL.medio)).toBeGreaterThan(60);
    expect(azul(COLOR_NIVEL.bajo) - azul(COLOR_NIVEL.alto)).toBeGreaterThan(60);
  });
});

describe("escala de niveles", () => {
  it("ordena sin_dato < bajo < medio < alto", () => {
    expect(NIVELES.map(ordenDeNivel)).toEqual([0, 1, 2, 3]);
    expect(nivelMaximo(["bajo", "alto", "medio"])).toBe("alto");
    expect(nivelMaximo(["sin_dato", "bajo"])).toBe("bajo");
    expect(nivelMaximo([])).toBe("sin_dato");
  });

  const riesgo: Riesgo = {
    lugar: "est:28065014",
    nivel: "alto",
    nivel_aire: "bajo",
    nivel_polen: "alto",
    peor_variable: "polen_gramineas",
    captador: "cap:GETA",
    polen_antiguedad_dias: 2,
  };

  it("elige el nivel según las capas encendidas", () => {
    expect(nivelVisible(riesgo, { aire: true, polen: true })).toBe("alto");
    expect(nivelVisible(riesgo, { aire: true, polen: false })).toBe("bajo");
    expect(nivelVisible(riesgo, { aire: false, polen: true })).toBe("alto");
    expect(nivelVisible(riesgo, { aire: false, polen: false })).toBeNull();
    expect(nivelVisible(undefined, { aire: true, polen: true })).toBe("sin_dato");
  });

  it("resume el recuento de estaciones", () => {
    expect(resumirRecuento(contarNiveles(Array(28).fill("bajo")))).toBe("Riesgo bajo en las 28 estaciones");
    expect(resumirRecuento(contarNiveles(["alto", "alto", "medio", "bajo", "sin_dato", null]))).toBe(
      "2 en alto · 1 en medio · 1 en bajo · 1 sin dato",
    );
    expect(resumirRecuento(contarNiveles([]))).toBe("Sin estaciones");
  });
});

describe("nombres de variables", () => {
  it("da nombre a las de aire y a los pólenes", () => {
    expect(nombreVariable("no2").corto).toBe("NO₂");
    expect(nombreVariable("pm25").corto).toBe("PM2,5");
    expect(nombreVariable("polen_gramineas")).toEqual({ corto: "Gramíneas", largo: "Polen de Gramíneas" });
    expect(nombreVariable("polen_tipo_nuevo").corto).toBe("Tipo nuevo");
  });
});
