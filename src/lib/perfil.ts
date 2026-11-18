import { PERFIL_INICIAL, POLENES_CON_PREVISION, POLENES_SIN_PREVISION, type Perfil } from "./franja";
import type { Lugares } from "./tipos";

const CLAVE = "alergia-madrid:perfil";
const TIPOS_POLEN: readonly string[] = [...POLENES_CON_PREVISION, ...POLENES_SIN_PREVISION];

/** Lee el perfil guardado y descarta lo que no sea válido (municipio desconocido, tipos raros). */
export function leerPerfil(lugares: Lugares, almacen: Pick<Storage, "getItem"> | null = guardado()): Perfil {
  try {
    const crudo = almacen?.getItem(CLAVE);
    if (!crudo) return PERFIL_INICIAL;
    const v = JSON.parse(crudo) as Partial<Perfil>;
    const municipio = lugares.municipios.some((m) => m.id === v.municipio) ? (v.municipio as string) : PERFIL_INICIAL.municipio;
    const afecta = v.afecta === "aire" || v.afecta === "polen" || v.afecta === "ambos" ? v.afecta : PERFIL_INICIAL.afecta;
    const polenes = Array.isArray(v.polenes) ? v.polenes.filter((t): t is string => typeof t === "string" && TIPOS_POLEN.includes(t)) : PERFIL_INICIAL.polenes;
    return { municipio, afecta, polenes };
  } catch {
    return PERFIL_INICIAL;
  }
}

export function guardarPerfil(perfil: Perfil, almacen: Pick<Storage, "setItem"> | null = guardado()): void {
  try {
    almacen?.setItem(CLAVE, JSON.stringify(perfil));
  } catch {
    // Sin almacenamiento (modo privado): el perfil vale solo para esta visita.
  }
}

function guardado(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Distancia en km entre dos puntos (fórmula del haversine). */
export function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Municipio con datos más cercano a una posición. Más de `LEJOS_KM` se considera fuera de la cobertura. */
export const LEJOS_KM = 25;
export function municipioMasCercano<M extends { lat: number; lon: number }>(
  lat: number,
  lon: number,
  municipios: readonly M[],
): { municipio: M; km: number } | null {
  let mejor: { municipio: M; km: number } | null = null;
  for (const m of municipios) {
    const km = distanciaKm(lat, lon, m.lat, m.lon);
    if (!mejor || km < mejor.km) mejor = { municipio: m, km };
  }
  return mejor;
}
