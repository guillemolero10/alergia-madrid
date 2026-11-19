// Colores del mapa de déficit. Sin DOM ni MapLibre (solo tipos): se prueban en Node.
//
// - Servicios con plazas: escala CONTINUA y divergente centrada en la referencia elegida. Naranja = menos plazas que la
//   referencia, azul = más. Naranja y azul se distinguen con los tres tipos habituales de daltonismo, y el centro es un
//   crema claro (la referencia), de modo que los extremos son oscuros y se leen también en escala de grises.
// - Servicios por distancia: 4 clases de personas en déficit por km² (naranja de claro a oscuro) y un crema neutro para
//   «sin déficit».

/** Color de los extremos y puntos medios, de «muy por debajo» (0 plazas) a «el doble de la referencia». */
export const PARADAS_DIVERGENTE: readonly { t: number; color: string }[] = [
  { t: -1, color: "#a33f08" }, // 0 plazas por cada 100
  { t: -0.5, color: "#e48d43" },
  { t: 0, color: "#f7f0de" }, // la referencia
  { t: 0.5, color: "#9ec4de" },
  { t: 1, color: "#2b6a9a" }, // el doble de la referencia o más
];

export const CLASES_DEFICIT_COLORES: readonly string[] = ["#f4d5ae", "#eba768", "#d56d27", "#9a3b09"];
export const COLOR_SIN_DEFICIT = "#e8e3d2";
export const TRANSPARENTE = "rgba(0,0,0,0)";

/** Valor de `feature-state.v` para las secciones sin población objetivo (no se pintan). */
export const SIN_POBLACION = -1;
/** En los servicios por distancia, la clase de «sin déficit». Las de déficit son 0 a 3. */
export const CLASE_SIN_DEFICIT = 4;

// ---------------------------------------------------------------- colores
function aRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function aHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

function mezclar(a: string, b: string, f: number): string {
  const x = aRgb(a);
  const y = aRgb(b);
  return aHex([0, 1, 2].map((i) => (x[i] as number) + ((y[i] as number) - (x[i] as number)) * f));
}

/** La referencia tiene que ser positiva para que las paradas crezcan; con 0 (sin centros) se usa una referencia mínima. */
function referenciaSegura(ref: number): number {
  return Number.isFinite(ref) && ref > 0 ? ref : 0.01;
}

/** Paradas de la escala en plazas por cada 100: 0, ½, 1, 1½ y 2 veces la referencia. */
export function paradasDivergentes(ref: number): { v: number; color: string }[] {
  const r = referenciaSegura(ref);
  return PARADAS_DIVERGENTE.map((p) => ({ v: r * (1 + p.t), color: p.color }));
}

/** Color de un valor `A_i` frente a la referencia (interpolación lineal; fuera de 0 y 2×ref se queda en el extremo). */
export function colorDivergente(v: number, ref: number): string {
  const r = referenciaSegura(ref);
  const t = Math.max(-1, Math.min(1, (v - r) / r));
  for (let k = 0; k < PARADAS_DIVERGENTE.length - 1; k++) {
    const a = PARADAS_DIVERGENTE[k] as { t: number; color: string };
    const b = PARADAS_DIVERGENTE[k + 1] as { t: number; color: string };
    if (t <= b.t) return mezclar(a.color, b.color, (t - a.t) / (b.t - a.t));
  }
  return (PARADAS_DIVERGENTE.at(-1) as { color: string }).color;
}

/** `gradient` de CSS para la leyenda, de 0 a 2×ref. */
export function gradienteCss(): string {
  const paradas = PARADAS_DIVERGENTE.map((p) => `${p.color} ${((p.t + 1) * 50).toFixed(0)}%`);
  return `linear-gradient(90deg, ${paradas.join(", ")})`;
}

// ---------------------------------------------------------------- expresiones de MapLibre (`fill-color`)
type Expresion = unknown[];

const ESTADO_V: Expresion = ["coalesce", ["feature-state", "v"], SIN_POBLACION];

/** Servicios con plazas: el color sale directamente de `feature-state.v` (= A_i). Cambiar de referencia solo cambia esta expresión. */
export function expresionPlazas(ref: number): Expresion {
  const interpolacion: Expresion = ["interpolate", ["linear"], ESTADO_V];
  for (const p of paradasDivergentes(ref)) interpolacion.push(p.v, p.color);
  return ["case", ["<", ESTADO_V, 0], TRANSPARENTE, interpolacion];
}

/** Servicios por distancia: `feature-state.v` es la clase (0 a 3 con déficit, 4 sin déficit). */
export function expresionClases(): Expresion {
  const m: Expresion = ["match", ESTADO_V];
  CLASES_DEFICIT_COLORES.forEach((c, k) => m.push(k, c));
  m.push(CLASE_SIN_DEFICIT, COLOR_SIN_DEFICIT, TRANSPARENTE);
  return m;
}

// ---------------------------------------------------------------- clases de déficit
/** Redondea a 2 cifras significativas (para que los cortes de la leyenda sean legibles: 1.800, 37, 0,8…). */
export function redondear2Cifras(x: number): number {
  if (!(x > 0) || !Number.isFinite(x)) return 0;
  const e = Math.floor(Math.log10(x)) - 1;
  const f = 10 ** e;
  return Math.round(x / f) * f;
}

/**
 * Tres cortes que dejan en cada clase una cuarta parte de las personas en déficit (cuantiles ponderados por personas),
 * redondeados a 2 cifras y estrictamente crecientes. Con menos de dos secciones en déficit devuelve cortes por defecto.
 */
export function cortesDeficit(densidades: ArrayLike<number>, pesos: ArrayLike<number>): [number, number, number] {
  const idx: number[] = [];
  for (let i = 0; i < densidades.length; i++) if ((pesos[i] as number) > 0 && Number.isFinite(densidades[i] as number)) idx.push(i);
  if (idx.length < 2) return [10, 100, 1000];
  idx.sort((a, b) => (densidades[a] as number) - (densidades[b] as number));
  let total = 0;
  for (const i of idx) total += pesos[i] as number;
  const cortes: number[] = [];
  let acum = 0;
  let objetivo = 0.25;
  for (const i of idx) {
    acum += pesos[i] as number;
    while (cortes.length < 3 && acum / total >= objetivo) {
      cortes.push(redondear2Cifras(densidades[i] as number));
      objetivo += 0.25;
    }
  }
  while (cortes.length < 3) cortes.push(cortes.at(-1) ?? 1000);
  // Estrictamente crecientes: si dos coinciden tras redondear, se separa el siguiente un 25 %.
  for (let k = 1; k < 3; k++) {
    if ((cortes[k] as number) <= (cortes[k - 1] as number)) cortes[k] = redondear2Cifras((cortes[k - 1] as number) * 1.25) || (cortes[k - 1] as number) + 1;
    if ((cortes[k] as number) <= (cortes[k - 1] as number)) cortes[k] = (cortes[k - 1] as number) + 1;
  }
  return cortes as [number, number, number];
}

/** Clase 0 a 3 según la densidad (personas en déficit por km²) y los cortes: `< c0`, `< c1`, `< c2`, el resto. */
export function claseDeficit(densidad: number, cortes: readonly number[]): 0 | 1 | 2 | 3 {
  if (densidad < (cortes[0] as number)) return 0;
  if (densidad < (cortes[1] as number)) return 1;
  if (densidad < (cortes[2] as number)) return 2;
  return 3;
}
