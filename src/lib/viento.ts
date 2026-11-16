import type { Viento } from "./tipos";

/**
 * `direccion_grados` es de DÓNDE viene el viento (convención meteorológica).
 * La flecha del mapa apunta hacia donde sopla: el rumbo opuesto.
 */
export function rumboDeViento(direccionGrados: number): number {
  return (((direccionGrados + 180) % 360) + 360) % 360;
}

/** Componentes en km/h: `u` hacia el este, `v` hacia el norte. */
export function componentesViento(direccionGrados: number, velocidadKmh: number): { u: number; v: number } {
  const rad = (direccionGrados * Math.PI) / 180;
  return { u: -velocidadKmh * Math.sin(rad), v: -velocidadKmh * Math.cos(rad) };
}

const CARDINALES = ["norte", "noreste", "este", "sureste", "sur", "suroeste", "oeste", "noroeste"];

/** Nombre del punto cardinal de procedencia: 239° → «suroeste». */
export function puntoCardinal(direccionGrados: number): string {
  const normal = ((direccionGrados % 360) + 360) % 360;
  return CARDINALES[Math.round(normal / 45) % 8] ?? "norte";
}

export interface RejillaViento {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  columnas: number;
  filas: number;
  /** Componentes por celda, fila a fila de sur a norte y de oeste a este. */
  u: Float32Array;
  v: Float32Array;
  velocidadMax: number;
}

const redondear = (x: number) => Math.round(x * 1e4) / 1e4;

/**
 * Ordena los puntos de viento en una rejilla regular para poder interpolar.
 * Devuelve `null` si los puntos no forman una rejilla completa (entonces solo se dibujan las flechas).
 */
export function construirRejilla(viento: readonly Viento[]): RejillaViento | null {
  const lons = [...new Set(viento.map((p) => redondear(p.lon)))].sort((a, b) => a - b);
  const lats = [...new Set(viento.map((p) => redondear(p.lat)))].sort((a, b) => a - b);
  const columnas = lons.length;
  const filas = lats.length;
  if (columnas < 2 || filas < 2 || columnas * filas !== viento.length) return null;

  const u = new Float32Array(columnas * filas).fill(Number.NaN);
  const v = new Float32Array(columnas * filas).fill(Number.NaN);
  let velocidadMax = 0;
  for (const p of viento) {
    const i = lats.indexOf(redondear(p.lat)) * columnas + lons.indexOf(redondear(p.lon));
    const c = componentesViento(p.direccion_grados, p.velocidad_kmh);
    u[i] = c.u;
    v[i] = c.v;
    if (p.velocidad_kmh > velocidadMax) velocidadMax = p.velocidad_kmh;
  }
  if (u.some(Number.isNaN)) return null;

  return {
    lonMin: lons[0]!,
    lonMax: lons[columnas - 1]!,
    latMin: lats[0]!,
    latMax: lats[filas - 1]!,
    columnas,
    filas,
    u,
    v,
    velocidadMax,
  };
}

/** Viento interpolado (bilineal) en un punto. `null` fuera de la rejilla: ahí no hay dato y no se inventa. */
export function vientoEn(rejilla: RejillaViento, lon: number, lat: number): { u: number; v: number } | null {
  const { lonMin, lonMax, latMin, latMax, columnas, filas } = rejilla;
  if (lon < lonMin || lon > lonMax || lat < latMin || lat > latMax) return null;
  const x = ((lon - lonMin) / (lonMax - lonMin)) * (columnas - 1);
  const y = ((lat - latMin) / (latMax - latMin)) * (filas - 1);
  const x0 = Math.min(Math.floor(x), columnas - 2);
  const y0 = Math.min(Math.floor(y), filas - 2);
  const fx = x - x0;
  const fy = y - y0;
  const i00 = y0 * columnas + x0;
  const i10 = i00 + 1;
  const i01 = i00 + columnas;
  const i11 = i01 + 1;
  const mezcla = (a: Float32Array) =>
    (a[i00]! * (1 - fx) + a[i10]! * fx) * (1 - fy) + (a[i01]! * (1 - fx) + a[i11]! * fx) * fy;
  return { u: mezcla(rejilla.u), v: mezcla(rejilla.v) };
}
