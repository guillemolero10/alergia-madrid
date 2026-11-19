// Geometría plana local y rejilla espacial. Sin DOM.
const R_TIERRA = 6371008.8;
const LAT_REF = 40.42;
const RAD = Math.PI / 180;
const COS_REF = Math.cos(LAT_REF * RAD);

/** (lat, lon) en grados -> (x, y) en metros. Error < 1 % en toda la Comunidad. */
export function proyectar(lat: number, lon: number): [number, number] {
  return [R_TIERRA * lon * RAD * COS_REF, R_TIERRA * lat * RAD];
}

export function proyectarArrays(lat: ArrayLike<number>, lon: ArrayLike<number>): { xs: Float64Array; ys: Float64Array } {
  const n = lat.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    xs[i] = R_TIERRA * (lon[i] as number) * RAD * COS_REF;
    ys[i] = R_TIERRA * (lat[i] as number) * RAD;
  }
  return { xs, ys };
}

/** Inversa de `proyectar`. */
export function desproyectar(x: number, y: number): [number, number] {
  return [y / (R_TIERRA * RAD), x / (R_TIERRA * RAD * COS_REF)];
}

export function distancia2(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return dx * dx + dy * dy;
}

/**
 * Rejilla de celdas cuadradas (por defecto de 1 km) en formato CSR: sin objetos por celda, rápida de construir.
 * Guarda índices de puntos; las coordenadas las lee del array que se le pasa.
 */
export class RejillaEspacial {
  readonly tamano: number;
  private readonly xs: Float64Array;
  private readonly ys: Float64Array;
  private readonly minX: number;
  private readonly minY: number;
  private readonly cols: number;
  private readonly filas: number;
  private readonly inicio: Int32Array;
  private readonly items: Int32Array;

  constructor(xs: Float64Array, ys: Float64Array, tamano = 1000, indices?: ArrayLike<number>) {
    this.xs = xs;
    this.ys = ys;
    this.tamano = tamano;
    const n = indices ? indices.length : xs.length;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = indices ? (indices[k] as number) : k;
      const x = xs[i] as number, y = ys[i] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (n === 0) { minX = minY = maxX = maxY = 0; }
    this.minX = minX;
    this.minY = minY;
    this.cols = Math.floor((maxX - minX) / tamano) + 1;
    this.filas = Math.floor((maxY - minY) / tamano) + 1;
    const celdas = this.cols * this.filas;
    const cuenta = new Int32Array(celdas + 1);
    const celdaDe = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      const i = indices ? (indices[k] as number) : k;
      const c = Math.floor(((ys[i] as number) - minY) / tamano) * this.cols + Math.floor(((xs[i] as number) - minX) / tamano);
      celdaDe[k] = c;
      cuenta[c + 1]!++;
    }
    for (let c = 0; c < celdas; c++) cuenta[c + 1]! += cuenta[c]!;
    this.inicio = cuenta;
    const pos = cuenta.slice(0, celdas);
    this.items = new Int32Array(n);
    for (let k = 0; k < n; k++) {
      const i = indices ? (indices[k] as number) : k;
      this.items[pos[celdaDe[k] as number]!++] = i;
    }
  }

  /** Llama a `fn(indice, d2)` por cada punto a distancia <= r de (x, y). */
  cadaVecino(x: number, y: number, r: number, fn: (i: number, d2: number) => void): void {
    const r2 = r * r;
    const c0 = Math.max(0, Math.floor((x - r - this.minX) / this.tamano));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r - this.minX) / this.tamano));
    const f0 = Math.max(0, Math.floor((y - r - this.minY) / this.tamano));
    const f1 = Math.min(this.filas - 1, Math.floor((y + r - this.minY) / this.tamano));
    for (let f = f0; f <= f1; f++) {
      const base = f * this.cols;
      for (let c = c0; c <= c1; c++) {
        const fin = this.inicio[base + c + 1] as number;
        for (let k = this.inicio[base + c] as number; k < fin; k++) {
          const i = this.items[k] as number;
          const d2 = distancia2(this.xs[i] as number, this.ys[i] as number, x, y);
          if (d2 <= r2) fn(i, d2);
        }
      }
    }
  }

  vecinos(x: number, y: number, r: number): number[] {
    const out: number[] = [];
    this.cadaVecino(x, y, r, (i) => out.push(i));
    return out;
  }

  /** Punto más cercano a (x, y) (búsqueda por anillos). `indice` = -1 si no hay puntos o ninguno a <= maxR. */
  masCercano(x: number, y: number, maxR = Infinity): { indice: number; d2: number } {
    if (this.items.length === 0) return { indice: -1, d2: Infinity };
    // Coordenadas no finitas: sin esta guarda la búsqueda por anillos no termina nunca (T1-1).
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { indice: -1, d2: Infinity };
    let mejor = -1;
    let mejorD2 = maxR === Infinity ? Infinity : maxR * maxR;
    // Si el punto cae fuera de la rejilla (T2-5: p. ej. lat 89,9 o 1e300), los anillos parten de la celda más cercana
    // de la rejilla y no de una celda a millones de celdas: así terminan en, como mucho, max(cols, filas) vueltas.
    // La cota de parada sigue valiendo, porque las celdas del anillo k quedan a >= (k - 1) * tamano del punto.
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor((x - this.minX) / this.tamano)));
    const cy = Math.min(this.filas - 1, Math.max(0, Math.floor((y - this.minY) / this.tamano)));
    const visitar = (c: number, f: number) => {
      if (c < 0 || f < 0 || c >= this.cols || f >= this.filas) return;
      const base = f * this.cols + c;
      const fin = this.inicio[base + 1] as number;
      for (let k = this.inicio[base] as number; k < fin; k++) {
        const i = this.items[k] as number;
        const d2 = distancia2(this.xs[i] as number, this.ys[i] as number, x, y);
        if (d2 < mejorD2 || (d2 === mejorD2 && mejor >= 0 && i < mejor)) {
          mejorD2 = d2;
          mejor = i;
        }
      }
    };
    for (let k = 0; ; k++) {
      if (cx - k < 0 && cx + k >= this.cols && cy - k < 0 && cy + k >= this.filas) break;
      if (mejor >= 0 || maxR !== Infinity) {
        const cota = (k - 1) * this.tamano;
        if (cota > 0 && cota * cota > mejorD2) break;
      }
      if (k === 0) visitar(cx, cy);
      else {
        for (let c = cx - k; c <= cx + k; c++) { visitar(c, cy - k); visitar(c, cy + k); }
        for (let f = cy - k + 1; f <= cy + k - 1; f++) { visitar(cx - k, f); visitar(cx + k, f); }
      }
    }
    return { indice: mejor, d2: mejor >= 0 ? mejorD2 : Infinity };
  }
}

/** Tamaño de celda para una rejilla de centros: 1 km salvo que haya pocos centros (entonces, mayor). */
export function tamanoCeldaCentros(xs: Float64Array, ys: Float64Array): number {
  const n = xs.length;
  if (n < 2) return 20000;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = xs[i] as number, y = ys[i] as number;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const lado = Math.sqrt(Math.max(1, (maxX - minX) * (maxY - minY)) / n);
  return Math.min(20000, Math.max(1000, lado));
}
