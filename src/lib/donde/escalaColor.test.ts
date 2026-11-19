import { describe, expect, it } from "vitest";
import {
  CLASES_DEFICIT_COLORES,
  PARADAS_DIVERGENTE,
  claseDeficit,
  colorDivergente,
  cortesDeficit,
  expresionClases,
  expresionPlazas,
  paradasDivergentes,
  redondear2Cifras,
} from "./escalaColor";

const luminancia = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return ((x as number) + 0.05) / ((y as number) + 0.05);
};

describe("escala divergente centrada en la referencia", () => {
  it("la referencia da el color central; 0 y el doble, los extremos", () => {
    const [min, , centro, , max] = PARADAS_DIVERGENTE.map((p) => p.color);
    expect(colorDivergente(4.11, 4.11)).toBe(centro);
    expect(colorDivergente(0, 4.11)).toBe(min);
    expect(colorDivergente(8.22, 4.11)).toBe(max);
  });
  it("fuera del rango se queda en el extremo", () => {
    expect(colorDivergente(-5, 4)).toBe(colorDivergente(0, 4));
    expect(colorDivergente(100, 4)).toBe(colorDivergente(8, 4));
  });
  it("cambia al cambiar la referencia: el mismo valor es naranja con una referencia alta y azul con una baja", () => {
    expect(colorDivergente(4.1, 6)).not.toBe(colorDivergente(4.1, 3));
    const [r1, , b1] = [colorDivergente(3, 6), 0, colorDivergente(6, 3)];
    expect(r1).not.toBe(b1);
    // por debajo = más naranja (rojo mayor que azul); por encima = más azul
    const rgb = (h: string) => [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map((x) => Number.parseInt(x, 16));
    expect(rgb(colorDivergente(1, 4))[0]!).toBeGreaterThan(rgb(colorDivergente(1, 4))[2]!);
    expect(rgb(colorDivergente(8, 4))[2]!).toBeGreaterThan(rgb(colorDivergente(8, 4))[0]!);
  });
  it("es monótona a cada lado del centro (sin saltos de brillo)", () => {
    // por debajo de la referencia: de oscuro (0) a claro (ref), luminancia creciente
    let a = -Infinity;
    for (let v = 0; v <= 4.11; v += 0.2) { const l = luminancia(colorDivergente(v, 4.11)); expect(l).toBeGreaterThanOrEqual(a - 1e-9); a = l; }
    // por encima: de claro (ref) a oscuro, luminancia decreciente
    let b = Infinity;
    for (let v = 4.11; v <= 8.3; v += 0.2) { const l = luminancia(colorDivergente(v, 4.11)); expect(l).toBeLessThanOrEqual(b + 1e-9); b = l; }
  });
  it("paradas estrictamente crecientes, incluso con referencia 0, negativa o NaN", () => {
    for (const ref of [4.11, 0.5, 0, -3, NaN, Infinity]) {
      const p = paradasDivergentes(ref);
      expect(p).toHaveLength(5);
      for (let k = 1; k < p.length; k++) expect(p[k]!.v).toBeGreaterThan(p[k - 1]!.v);
    }
  });
  it("los extremos se distinguen del centro y entre sí (contraste de luminancia), también en escala de grises", () => {
    const [min, , centro, , max] = PARADAS_DIVERGENTE.map((p) => p.color) as string[];
    expect(contraste(min!, centro!)).toBeGreaterThan(4);
    expect(contraste(max!, centro!)).toBeGreaterThan(4);
  });
  it("la expresión de MapLibre lleva las 5 paradas de la referencia y transparenta las secciones sin población", () => {
    const e = expresionPlazas(4.11) as unknown[];
    expect(e[0]).toBe("case");
    const interp = e[3] as unknown[];
    expect(interp.slice(0, 2)).toEqual(["interpolate", ["linear"]]);
    const numeros = interp.filter((x) => typeof x === "number");
    expect(numeros).toHaveLength(5);
    expect(numeros[2]).toBeCloseTo(4.11);
    expect(JSON.stringify(e)).toContain('"feature-state","v"');
  });
});

describe("clases de déficit (servicios por distancia)", () => {
  it("la expresión asigna un color a las clases 0-4 y transparente al resto", () => {
    const e = expresionClases() as unknown[];
    expect(e[0]).toBe("match");
    expect(e.slice(2)).toEqual([0, CLASES_DEFICIT_COLORES[0], 1, CLASES_DEFICIT_COLORES[1], 2, CLASES_DEFICIT_COLORES[2], 3, CLASES_DEFICIT_COLORES[3], 4, expect.any(String), expect.any(String)]);
  });
  it("redondea a 2 cifras", () => {
    expect(redondear2Cifras(1234)).toBe(1200);
    expect(redondear2Cifras(37.4)).toBe(37);
    expect(redondear2Cifras(0.0843)).toBeCloseTo(0.084);
    expect(redondear2Cifras(0)).toBe(0);
    expect(redondear2Cifras(NaN)).toBe(0);
  });
  it("cortes ponderados por personas: crecientes y con una cuarta parte de las personas en cada clase", () => {
    const dens = Array.from({ length: 100 }, (_, i) => i + 1);
    const pesos = Array.from({ length: 100 }, () => 10);
    const c = cortesDeficit(dens, pesos);
    expect(c).toEqual([25, 50, 75]);
    expect(claseDeficit(10, c)).toBe(0);
    expect(claseDeficit(25, c)).toBe(1);
    expect(claseDeficit(60, c)).toBe(2);
    expect(claseDeficit(500, c)).toBe(3);
  });
  it("siempre devuelve 3 cortes estrictamente crecientes (valores repetidos, una sola sección, vacío)", () => {
    for (const [d, p] of [[[5, 5, 5, 5], [1, 1, 1, 1]], [[5], [10]], [[], []], [[0, 0], [0, 0]], [[1, 1000000], [1, 1]]] as [number[], number[]][]) {
      const c = cortesDeficit(d, p);
      expect(c).toHaveLength(3);
      expect(c[1]).toBeGreaterThan(c[0]);
      expect(c[2]).toBeGreaterThan(c[1]);
    }
  });
});
