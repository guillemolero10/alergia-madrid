// Lógica de «Tú decides» que no depende del DOM: evaluar un punto con `simular`, localizarlo en la Comunidad, compararlo
// con el óptimo del modelo y escribir las frases del resultado. Se prueba en Node con los JSON reales.
import { simular, type OpcionesEstado } from "./cobertura";
import { decimal2Es, decimalEs, enteroEs, radioEs } from "./panelDonde";
import { SERVICIOS } from "./servicios";
import type { ContornosGeo, EstadoServicio, Municipio, ResultadoSimulacion, ServicioId, Territorios } from "./tipos";
import { coordenadasValidas, esServicioConPlazas, PLAZAS_MAX, PLAZAS_MIN, type EstadoDonde } from "./urlDonde";

export { PLAZAS_MAX, PLAZAS_MIN };

/** Opciones con las que se calcula el estado de un servicio (las mismas en la pantalla y en el Web Worker). */
export function opcionesEstado(est: Pick<EstadoDonde, "servicio" | "radio_m" | "referencia">): OpcionesEstado {
  return esServicioConPlazas(est.servicio) ? { radio_m: est.radio_m, umbral: est.referencia } : { radio_m: est.radio_m };
}

/**
 * Las opciones para recalcular un estado ya calculado (por ejemplo, en el Web Worker): con plazas, el umbral como NÚMERO. Así el
 * worker usa exactamente el umbral que ve el usuario, también en 2030, donde la referencia se mantiene fija en el valor de hoy.
 */
export function opcionesDeEstado(e: Pick<EstadoServicio, "radio_m" | "umbral" | "metrica">): OpcionesEstado {
  return e.metrica === "plazas" ? { radio_m: e.radio_m, umbral: e.umbral } : { radio_m: e.radio_m };
}

/** Plazas del centro simulado: las elegidas o las del catálogo (mediana de los centros); null si el servicio no tiene plazas. */
export function plazasEfectivas(servicio: ServicioId, elegidas: number | null): number | null {
  if (!esServicioConPlazas(servicio)) return null;
  const def = SERVICIOS[servicio].plazasDefecto ?? PLAZAS_MIN;
  const n = elegidas ?? def;
  return Math.min(PLAZAS_MAX, Math.max(PLAZAS_MIN, Math.round(n)));
}

// ---------------------------------------------------------------- dónde cae un punto
function dentroDelAnillo(anillo: number[][], lon: number, lat: number): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i] as [number, number];
    const [xj, yj] = anillo[j] as [number, number];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function dentroDelPoligono(poligono: number[][][], lon: number, lat: number): boolean {
  const [exterior, ...huecos] = poligono;
  if (!exterior || !dentroDelAnillo(exterior, lon, lat)) return false;
  return !huecos.some((h) => dentroDelAnillo(h, lon, lat));
}

type Contorno = ContornosGeo["features"][number];
const CONTORNOS = new WeakMap<Territorios, Map<string, Contorno>>();

function contornoDe(t: Territorios, id: string): Contorno | undefined {
  let mapa = CONTORNOS.get(t);
  if (!mapa) {
    mapa = new Map(t.municipios_geo.features.map((f) => [f.properties.id, f]));
    CONTORNOS.set(t, mapa);
  }
  return mapa.get(id);
}

/** El municipio cuyo contorno contiene el punto, o null si cae fuera de la Comunidad de Madrid. Usa el recuadro de cada municipio para descartar rápido. */
export function municipioEnPunto(t: Territorios, lat: number, lon: number): Municipio | null {
  if (!coordenadasValidas(lat, lon)) return null;
  for (const m of t.municipios) {
    const [oeste, sur, este, norte] = m.bbox;
    if (lon < oeste || lon > este || lat < sur || lat > norte) continue;
    const c = contornoDe(t, m.id);
    if (!c) continue;
    const g = c.geometry;
    const polis = g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
    if (polis.some((p) => dentroDelPoligono(p, lon, lat))) return m;
  }
  return null;
}

// ---------------------------------------------------------------- evaluar un punto
export type Evaluacion =
  | { tipo: "fuera" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "ok"; sim: ResultadoSimulacion; municipio: Municipio; plazas: number | null };

/** Lo que gana la gente si se pone un centro en el punto. Nunca lanza: un punto raro da «fuera» o «error». */
export function evaluarPunto(estado: EstadoServicio, t: Territorios, lat: number, lon: number, plazas: number | null): Evaluacion {
  const municipio = municipioEnPunto(t, lat, lon);
  if (!municipio) return { tipo: "fuera" };
  try {
    const sim = simular(estado, plazas === null ? { lat, lon } : { lat, lon, plazas });
    return { tipo: "ok", sim, municipio, plazas };
  } catch (e) {
    return { tipo: "error", mensaje: e instanceof Error ? e.message : "No se pudo calcular" };
  }
}

// ---------------------------------------------------------------- la cifra principal de cada servicio
/**
 * Servicios por distancia: personas que ganan acceso. Servicios con plazas: N = plazas que faltan que se reducen (con el
 * umbral fijo). Es el número que se enseña, se compara con el óptimo y se pasa al agente.
 */
export function valorPrincipal(estado: Pick<EstadoServicio, "metrica">, x: { ganan: number; reduce?: number }): number {
  return estado.metrica === "plazas" ? (x.reduce ?? 0) : x.ganan;
}

/** Secciones que se resaltan en el mapa: las que ganan acceso (distancia) o donde faltan menos plazas (plazas). */
export function seccionesResaltadas(estado: Pick<EstadoServicio, "metrica">, sim: ResultadoSimulacion): number[] {
  return estado.metrica === "plazas" ? (sim.seccionesMejoran ?? []) : sim.secciones;
}

const CERCA: Record<string, string> = { centro_salud: "un centro de salud", hospital: "un hospital", farmacia: "una farmacia", colegio: "un colegio", dea: "un desfibrilador" };

/** Un decimal con coma, sin «,0» sobrante en los enteros: 93,8 y 94. */
export function decimalCortoEs(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? enteroEs(r) : decimalEs(r);
}

// ---------------------------------------------------------------- comparación con el modelo
export interface Comparacion {
  /** Porcentaje del óptimo que logra el punto del usuario (sin redondear), o null si el modelo no gana nada. */
  pct: number | null;
  /** El usuario logra más que el modelo (el modelo solo prueba los centros de las secciones; un punto cualquiera puede ser mejor). */
  supera: boolean;
}

export function compararConOptimo(ganan: number, gananOptimo: number): Comparacion {
  if (!(gananOptimo > 0)) return { pct: null, supera: ganan > 0 };
  return { pct: (100 * ganan) / gananOptimo, supera: ganan > gananOptimo };
}

/** «68 %», con el redondeo habitual; un 99,6 % no se enseña como «100 %» (no es igual). */
export function pctEs(pct: number): string {
  const r = Math.round(pct);
  return `${r >= 100 && pct < 100 ? 99 : r} %`;
}

// ---------------------------------------------------------------- frases
/**
 * El titular en vivo. Distancia: «+2.363» y «habitantes con un centro de salud cerca». Plazas: «64» y «plazas menos de las que faltan en la
 * Comunidad» (el valor es N).
 */
export function titularPrincipal(estado: EstadoServicio, valor: number): { numero: string; texto: string } {
  if (estado.metrica === "plazas") {
    const r = Math.round(valor);
    if (valor > 0 && r < 1) return { numero: "<1", texto: "plaza más cubierta en la Comunidad" };
    return { numero: decimalCortoEs(valor), texto: `${Math.round(valor * 10) / 10 === 1 ? "plaza más cubierta" : "plazas más cubiertas"} en la Comunidad` };
  }
  return { numero: `+${enteroEs(valor)}`, texto: `${SERVICIOS[estado.servicio].grupoEtiqueta} con ${CERCA[estado.servicio]} cerca` };
}

/** Qué significa la cifra principal, en una frase. */
export function explicarCifra(estado: EstadoServicio): string {
  if (estado.metrica === "plazas") {
    return `«Plazas más cubiertas» son las que este centro añade donde la zona aún no llega a la referencia (${decimal2Es(estado.umbral)} por cada 100 mayores a menos de ${radioEs(estado.radio_m)}). Una plaza nueva solo cuenta donde esa zona está por debajo; si llega a una zona que ya la alcanza, no suma.`;
  }
  return `«Ganan acceso» son las personas que hoy están a más de ${radioEs(estado.radio_m)} del centro más cercano y pasarían a estar a menos de esa distancia.`;
}

const kmOMetros = (m: number) => (m >= 1000 ? `${decimalEs(m / 1000)} km` : `${enteroEs(m)} m`);

/** «el 68 % de sus 94 plazas llega a zonas con déficit» (en minúscula, para ir tras dos puntos o entre paréntesis): la parte de las plazas que no se «desperdicia» en zonas que ya llegan. */
export function fraseAprovechamiento(reduce: number, plazas: number): string {
  const pct = plazas > 0 ? (100 * reduce) / plazas : 0;
  if (pct >= 99.95) return `todas sus ${enteroEs(plazas)} plazas llegan a zonas con margen de mejora`;
  return `${decimalCortoEs(reduce)} de sus ${enteroEs(plazas)} plazas llegan a zonas con margen de mejora`;
}

/** Una frase de detalle: cómo se reparte el centro o cuánto baja la distancia media. */
export function detalleSimulacion(estado: EstadoServicio, sim: ResultadoSimulacion, plazas: number | null): string {
  if (estado.metrica === "plazas") {
    const pob = sim.objetivoEnRadio ?? 0;
    if (pob <= 0) return `No hay mayores de 65 a menos de ${radioEs(estado.radio_m)} de este punto: las plazas no llegan a nadie.`;
    const extra = 100 * (sim.rNuevo ?? 0);
    return `Sus ${enteroEs(plazas ?? 0)} plazas se reparten entre los ${enteroEs(pob)} mayores a menos de ${radioEs(estado.radio_m)}: +${decimalEs(extra)} plazas por cada 100.`;
  }
  const a = sim.distancia_media_antes;
  const d = sim.distancia_media_despues;
  if (a === undefined || d === undefined) return `A menos de ${radioEs(estado.radio_m)} de este punto no vive nadie.`;
  return `Para quien vive a menos de ${radioEs(estado.radio_m)} del nuevo centro, la distancia media al más cercano baja de ${kmOMetros(a)} a ${kmOMetros(d)}.`;
}

/** Cuando la cifra principal es cero: la razón más probable. */
export function porQueNadieGana(estado: EstadoServicio, sim: ResultadoSimulacion): string {
  if (estado.metrica === "plazas") {
    if ((sim.objetivoEnRadio ?? 0) <= 0) return "No hay mayores de 65 cerca.";
    return "Aquí todas las zonas cercanas ya llegan a la referencia: las plazas no reducen lo que falta. Prueba con otra zona.";
  }
  return "Cerca de este punto ya hay un centro a menos de la distancia máxima, o no vive casi nadie.";
}
