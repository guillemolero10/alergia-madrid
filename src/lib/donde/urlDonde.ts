// Estado de «¿Dónde hace falta?» en la URL: `?servicio=farmacia&radio=1000&zona=04&ref=imserso_espana&orden=pct&nivel=distrito&sim=40.24,-3.77&anio=2030`.
// Funciones puras (sin DOM): lo que no se entiende cae en el valor por defecto, nunca rompe la pantalla.
import { ANIO_HOY, ANIO_PROYECCION, type AnioDonde } from "./proyeccion";
import { esServicioId, SERVICIOS, UMBRAL_DEFICIT_POR_DEFECTO } from "./servicios";
import type { ServicioId } from "./tipos";

/** Con qué se compara `A_i` en residencias. Coincide con los modos de `UmbralDeficit`. */
export type ReferenciaId = "media" | "imserso_espana" | "imserso_madrid";
export const REFERENCIAS: readonly ReferenciaId[] = ["media", "imserso_espana", "imserso_madrid"];

export type OrdenRanking = "faltan" | "pct" | "personas";
export type NivelRanking = "municipio" | "distrito";

export interface PuntoSim {
  lat: number;
  lon: number;
}

export interface EstadoDonde {
  servicio: ServicioId;
  radio_m: number;
  /** Código de zona estadística (`04`), varios separados por comas (`06,10,11` = la sierra) o null para toda la Comunidad. */
  zona: string | null;
  referencia: ReferenciaId;
  orden: OrdenRanking;
  nivel: NivelRanking;
  /** Punto del simulador «Tú decides» (F4). */
  sim: PuntoSim | null;
  /** Plazas del centro simulado (solo residencia); null = las del catálogo (la mediana de los centros). */
  plazas: number | null;
  /** Año de la población: 2025 (hoy, el censo del INE) o 2030 (proyección del INE; `?anio=2030`). */
  anio: AnioDonde;
}

export const PLAZAS_MIN = 25;
export const PLAZAS_MAX = 200;

export const SERVICIO_POR_DEFECTO: ServicioId = "residencia";

/** La referencia por defecto sale de `UMBRAL_DEFICIT_POR_DEFECTO` (IMSERSO España); si no es una de las tres, la media. */
export function referenciaPorDefecto(): ReferenciaId {
  return REFERENCIAS.find((r) => r === UMBRAL_DEFICIT_POR_DEFECTO) ?? "media";
}

export function esServicioConPlazas(servicio: ServicioId): boolean {
  return SERVICIOS[servicio].metrica === "plazas";
}

/** Órdenes del ranking que tienen sentido: «plazas que faltan» solo existe en residencias. */
export function ordenesDisponibles(servicio: ServicioId): OrdenRanking[] {
  return esServicioConPlazas(servicio) ? ["faltan", "pct", "personas"] : ["pct", "personas"];
}

export function ordenPorDefecto(servicio: ServicioId): OrdenRanking {
  return esServicioConPlazas(servicio) ? "faltan" : "pct";
}

export function estadoPorDefecto(servicio: ServicioId = SERVICIO_POR_DEFECTO): EstadoDonde {
  return {
    servicio,
    radio_m: SERVICIOS[servicio].radioDefecto,
    zona: null,
    referencia: referenciaPorDefecto(),
    orden: ordenPorDefecto(servicio),
    nivel: "municipio",
    sim: null,
    plazas: null,
    anio: ANIO_HOY,
  };
}

// ---------------------------------------------------------------- coordenadas
/** Recuadro holgado de la Comunidad de Madrid: fuera de él no se llama al motor (`simular` lanza RangeError con NaN). */
export const LIMITES_VALIDOS = { latMin: 39.8, latMax: 41.3, lonMin: -4.8, lonMax: -2.9 } as const;

export function coordenadasValidas(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= LIMITES_VALIDOS.latMin &&
    lat <= LIMITES_VALIDOS.latMax &&
    lon >= LIMITES_VALIDOS.lonMin &&
    lon <= LIMITES_VALIDOS.lonMax
  );
}

/** `«40.24,-3.77»` → punto, o null si falta algo, no es un número o cae fuera de la región. */
export function parsearSim(texto: string | null): PuntoSim | null {
  if (!texto) return null;
  const partes = texto.split(",");
  if (partes.length !== 2) return null;
  const [a, b] = partes.map((p) => (p.trim() === "" ? NaN : Number(p)));
  if (!coordenadasValidas(a, b)) return null;
  return { lat: a as number, lon: b as number };
}

/** Plazas de la URL: un entero entre `PLAZAS_MIN` y `PLAZAS_MAX`, o null. */
export function parsearPlazas(texto: string | null): number | null {
  if (texto === null || !/^\d{1,3}$/.test(texto.trim())) return null;
  const n = Number(texto);
  return n >= PLAZAS_MIN && n <= PLAZAS_MAX ? n : null;
}

// ---------------------------------------------------------------- URL
export function estadoDondeDeLaUrl(search: string): EstadoDonde {
  const p = new URLSearchParams(search);
  const s = p.get("servicio");
  const servicio: ServicioId = esServicioId(s) ? s : SERVICIO_POR_DEFECTO;
  const base = estadoPorDefecto(servicio);
  // Un servicio que ya no existe (`?servicio=centro_dia`, de un enlace antiguo) cae en el de por defecto con SUS valores por defecto:
  // el radio y las plazas de aquel servicio no tienen por qué valer para este.
  const servicioDesconocido = s !== null && !esServicioId(s);

  const radio = Number(p.get("radio"));
  const radio_m = !servicioDesconocido && SERVICIOS[servicio].radios.includes(radio) ? radio : base.radio_m;

  const z = p.get("zona");
  const zona = z !== null && /^\d{2}(,\d{2}){0,10}$/.test(z) ? z : null;

  const r = p.get("ref");
  const referencia = REFERENCIAS.find((x) => x === r) ?? base.referencia;

  const o = p.get("orden");
  const orden = ordenesDisponibles(servicio).find((x) => x === o) ?? base.orden;

  const nivel: NivelRanking = p.get("nivel") === "distrito" ? "distrito" : "municipio";

  const plazas = esServicioConPlazas(servicio) && !servicioDesconocido ? parsearPlazas(p.get("plazas")) : null;

  const anio: AnioDonde = p.get("anio") === String(ANIO_PROYECCION) ? ANIO_PROYECCION : ANIO_HOY;

  return { servicio, radio_m, zona, referencia, orden, nivel, sim: parsearSim(p.get("sim")), plazas, anio };
}

/**
 * Devuelve la búsqueda con el estado puesto, conservando el resto de parámetros (`vista`, `base`, `lugar`…).
 * `servicio` y `radio` se escriben siempre (un enlace explícito); lo demás solo si no es el valor por defecto.
 */
export function busquedaConDonde(search: string, est: EstadoDonde): string {
  const p = new URLSearchParams(search);
  p.set("servicio", est.servicio);
  p.set("radio", String(est.radio_m));
  if (est.zona) p.set("zona", est.zona);
  else p.delete("zona");
  if (esServicioConPlazas(est.servicio) && est.referencia !== referenciaPorDefecto()) p.set("ref", est.referencia);
  else p.delete("ref");
  if (est.orden !== ordenPorDefecto(est.servicio)) p.set("orden", est.orden);
  else p.delete("orden");
  if (est.nivel !== "municipio") p.set("nivel", est.nivel);
  else p.delete("nivel");
  if (est.sim && coordenadasValidas(est.sim.lat, est.sim.lon)) p.set("sim", `${est.sim.lat.toFixed(5)},${est.sim.lon.toFixed(5)}`);
  else p.delete("sim");
  if (esServicioConPlazas(est.servicio) && est.plazas !== null && est.plazas >= PLAZAS_MIN && est.plazas <= PLAZAS_MAX) p.set("plazas", String(Math.round(est.plazas)));
  else p.delete("plazas");
  if (est.anio === ANIO_PROYECCION) p.set("anio", String(ANIO_PROYECCION));
  else p.delete("anio");
  const q = p.toString();
  return q ? `?${q}` : "";
}

/**
 * Cambio de servicio: radio por defecto del nuevo servicio y se quitan el punto y las plazas del simulador. El orden del ranking se
 * conserva solo si el usuario lo había elegido (no era el de su servicio) y sigue valiendo; si no, el del nuevo servicio
 * (en residencias, «plazas que faltan»).
 */
export function conServicio(est: EstadoDonde, servicio: ServicioId): EstadoDonde {
  const base = estadoPorDefecto(servicio);
  const eligido = est.orden !== ordenPorDefecto(est.servicio);
  return {
    ...est,
    servicio,
    radio_m: base.radio_m,
    orden: eligido && ordenesDisponibles(servicio).includes(est.orden) ? est.orden : base.orden,
    sim: null,
    plazas: null,
  };
}
