// Agregados por territorio (municipio, distrito de la capital, zona estadística): ranking y ficha de lugar.
import { objetivoDe, plazasFaltanSeccion } from "./cobertura";
import { distritoEn } from "./lugares";
import { SERVICIO_IDS, SERVICIOS } from "./servicios";
import type {
  Centros,
  Comparacion,
  EstadoServicio,
  FichaLugar,
  FilaFicha,
  FilaRanking,
  NivelTerritorio,
  ServicioId,
  Territorios,
} from "./tipos";

/** Criterio propio y declarado: «por debajo» si es < 0,8 × la referencia, «por encima» si es > 1,2 ×. */
export const UMBRAL_POR_DEBAJO = 0.8;
export const UMBRAL_POR_ENCIMA = 1.2;

export interface Agregado {
  lugar: string;
  nombre: string;
  nivel: NivelTerritorio;
  zona: string;
  tramo: string | null;
  poblacion: number;
  objetivo: number;
  enDeficit: number;
  /** Σ valor × objetivo (A_i o distancia). Las distancias infinitas no entran. */
  sumaValor: number;
  pesoValor: number;
  faltan: number;
  /** Σ (umbral − A_i) × objetivo / 100 con signo: negativo si sobran plazas. */
  balance: number;
  /** Centros dentro del territorio. */
  nCentros: number;
  /** Centros que cuentan para el ratio (en centro_salud, sin consultorios). */
  nRatio: number;
  /** Plazas de los centros dentro del territorio (las que el registro no trae cuentan 0). Solo tiene sentido en servicios con plazas. */
  plazas: number;
  /** Área media de sus secciones censales (km²). Las rurales son enormes y su punto interior queda lejos del casco. */
  areaMedia: number;
}

/** Por encima de este área media por sección, la distancia (medida desde un punto de cada sección) es solo aproximada. */
export const AREA_SECCION_APROX_KM2 = 5;

/** Servicio por distancia con un centro dentro del territorio y secciones grandes: el «% a más de R» no es fiable. */
export function distanciaAproximada(a: Pick<Agregado, "nCentros" | "areaMedia" | "enDeficit">, metrica: "distancia" | "plazas"): boolean {
  return metrica === "distancia" && a.nCentros > 0 && a.enDeficit > 0 && a.areaMedia > AREA_SECCION_APROX_KM2;
}

const CACHE = new WeakMap<EstadoServicio, Map<string, Agregado[]>>();
const CENTROS_DE = new WeakMap<Centros, Map<string, Map<string, [number, number, number]>>>();

function esParaRatio(estado: EstadoServicio, j: number): boolean {
  return estado.servicio !== "centro_salud" || (estado.centros.nombres[j] ?? "").startsWith("Centro de salud");
}

function contarCentros(estado: EstadoServicio, t: Territorios, nivel: NivelTerritorio): Map<string, [number, number, number]> {
  const clave = `${nivel}`;
  let porNivel = CENTROS_DE.get(estado.centros);
  if (!porNivel) { porNivel = new Map(); CENTROS_DE.set(estado.centros, porNivel); }
  const hit = porNivel.get(clave + estado.servicio);
  if (hit) return hit;
  const cuenta = new Map<string, [number, number, number]>();
  const zonaDeMun = new Map(t.municipios.map((m) => [m.id, m.zona]));
  const c = estado.centros;
  for (let j = 0; j < c.ids.length; j++) {
    let id: string | null = null;
    const mun = c.mun[j] as string;
    if (nivel === "municipio") id = mun;
    else if (nivel === "zona") id = zonaDeMun.has(mun) ? `zona:${zonaDeMun.get(mun)}` : null;
    else if (mun === "mun:28079") id = distritoEn(t, c.lat[j] as number, c.lon[j] as number);
    if (!id) continue;
    const v = cuenta.get(id) ?? [0, 0, 0];
    v[0]++;
    if (esParaRatio(estado, j)) v[1]++;
    v[2] += c.plazas?.[j] ?? 0;
    cuenta.set(id, v);
  }
  porNivel.set(clave + estado.servicio, cuenta);
  return cuenta;
}

/** Agregados de todos los territorios de un nivel (con caché por estado y nivel). */
export function agregar(estado: EstadoServicio, t: Territorios, nivel: NivelTerritorio): Agregado[] {
  let porNivel = CACHE.get(estado);
  if (!porNivel) { porNivel = new Map(); CACHE.set(estado, porNivel); }
  const hit = porNivel.get(nivel);
  if (hit) return hit;
  const s = estado.secciones;
  const obj = objetivoDe(s, estado.grupo);
  const total = s.pob.total;
  const mapa = new Map<string, Agregado>();
  const nombres = new Map<string, string>();
  const tramos = new Map<string, string>();
  for (const m of t.municipios) { nombres.set(m.id, m.nombre); tramos.set(m.id, m.tramo); }
  for (const d of t.distritos) nombres.set(d.id, d.nombre);
  for (const z of t.zonas) nombres.set(`zona:${z.codigo}`, z.nombre);
  const esPlazas = estado.metrica === "plazas";
  const nSec = new Map<string, number>();
  for (let i = 0; i < s.ids.length; i++) {
    const id = nivel === "municipio" ? (s.mun[i] as string) : nivel === "distrito" ? s.distrito[i] : `zona:${s.zona[i]}`;
    if (!id) continue;
    let a = mapa.get(id);
    if (!a) {
      a = {
        lugar: id, nombre: nombres.get(id) ?? id, nivel, zona: s.zona[i] as string, tramo: nivel === "municipio" ? (tramos.get(id) ?? null) : null,
        poblacion: 0, objetivo: 0, enDeficit: 0, sumaValor: 0, pesoValor: 0, faltan: 0, balance: 0, nCentros: 0, nRatio: 0, plazas: 0, areaMedia: 0,
      };
      nSec.set(id, 0);
      mapa.set(id, a);
    }
    a.areaMedia += s.area_km2[i] ?? 0;
    nSec.set(id, (nSec.get(id) ?? 0) + 1);
    const o = obj[i] as number;
    const v = estado.valor[i] as number;
    a.poblacion += total[i] as number;
    a.objetivo += o;
    if (estado.deficit[i]) a.enDeficit += o;
    if (Number.isFinite(v)) { a.sumaValor += v * o; a.pesoValor += o; }
    if (esPlazas) {
      a.faltan += plazasFaltanSeccion(estado, i, obj);
      a.balance += (o * (estado.umbral - v)) / 100;
    }
  }
  const centros = contarCentros(estado, t, nivel);
  const out = [...mapa.values()];
  for (const a of out) {
    a.areaMedia = a.areaMedia / Math.max(1, nSec.get(a.lugar) ?? 1);
    const c = centros.get(a.lugar);
    if (c) { a.nCentros = c[0]; a.nRatio = c[1]; a.plazas = c[2]; }
  }
  porNivel.set(nivel, out);
  return out;
}

function mediaComunidad(estado: EstadoServicio): number | null {
  if (estado.metrica === "plazas") return estado.media;
  const obj = objetivoDe(estado.secciones, estado.grupo);
  let s = 0, w = 0;
  for (let i = 0; i < obj.length; i++) {
    const v = estado.valor[i] as number;
    if (Number.isFinite(v)) { s += v * (obj[i] as number); w += obj[i] as number; }
  }
  return w > 0 ? s / w : null;
}

export interface OpcionesRanking {
  nivel?: NivelTerritorio;
  /** Código(s) de zona (`04`). */
  zona?: string | string[];
  orden?: "pct" | "personas" | "faltan";
  limite?: number;
}

/** Ranking de territorios. `pct` se redondea a 3 decimales antes de ordenar (igual que la referencia en Python). */
export function ranking(estado: EstadoServicio, t: Territorios, opciones: OpcionesRanking = {}): FilaRanking[] {
  const { nivel = "municipio", orden = "pct", limite = 10 } = opciones;
  const zonas = opciones.zona == null ? null : new Set(Array.isArray(opciones.zona) ? opciones.zona : [opciones.zona]);
  const media = mediaComunidad(estado);
  const esPlazas = estado.metrica === "plazas";
  const filas: FilaRanking[] = [];
  for (const a of agregar(estado, t, nivel)) {
    if (a.objetivo <= 0 || (zonas && !zonas.has(a.zona))) continue;
    const fila: FilaRanking = {
      lugar: a.lugar, nombre: a.nombre, objetivo: Math.round(a.objetivo), en_deficit: Math.round(a.enDeficit),
      pct: Math.round((100 * a.enDeficit) / a.objetivo * 1000) / 1000,
      ratio: a.pesoValor > 0 ? a.sumaValor / a.pesoValor : null,
      media_comunidad: media,
    };
    if (esPlazas) { fila.plazas_faltan = Math.round(a.faltan); fila.plazas_balance = Math.round(a.balance); }
    if (distanciaAproximada(a, estado.metrica)) fila.aproximada = true;
    filas.push(fila);
  }
  const cmp = (x: FilaRanking, y: FilaRanking) => (x.lugar < y.lugar ? -1 : x.lugar > y.lugar ? 1 : 0);
  // Tres grupos (R3b): primero las filas fiables con gente lejos; después las aproximadas (centro dentro y secciones enormes:
  // su % no es fiable, pero sí puede haber gente lejos); al final las que no tienen a nadie lejos. Así una zona rural
  // nunca parece «todo cubierto» solo porque sus filas con déficit sean aproximadas.
  const grupo = (f: FilaRanking) => (f.aproximada ? 1 : f.en_deficit > 0 ? 0 : 2);
  const aprox = (x: FilaRanking, y: FilaRanking) => grupo(x) - grupo(y);
  if (orden === "pct") filas.sort((x, y) => aprox(x, y) || y.pct - x.pct || y.en_deficit - x.en_deficit || cmp(x, y));
  else if (orden === "faltan") filas.sort((x, y) => (y.plazas_faltan ?? 0) - (x.plazas_faltan ?? 0) || y.en_deficit - x.en_deficit || cmp(x, y));
  else filas.sort((x, y) => aprox(x, y) || y.en_deficit - x.en_deficit || y.pct - x.pct || cmp(x, y));
  return filas.slice(0, limite);
}

// ---------------------------------------------------------------- ficha
function compara(ratio: number | null, ref: number | null, unidad: "hab_por_centro" | "plazas_por_100"): Comparacion {
  if (ref == null || !(ref > 0) || !Number.isFinite(ref)) return "en_la_media";
  if (unidad === "hab_por_centro") {
    if (ratio == null) return "por_debajo";
    if (ratio > UMBRAL_POR_ENCIMA * ref) return "por_debajo";
    if (ratio < UMBRAL_POR_DEBAJO * ref) return "por_encima";
    return "en_la_media";
  }
  if (ratio == null) return "por_debajo";
  if (ratio < UMBRAL_POR_DEBAJO * ref) return "por_debajo";
  if (ratio > UMBRAL_POR_ENCIMA * ref) return "por_encima";
  return "en_la_media";
}

function ratioDe(a: Agregado, unidad: "hab_por_centro" | "plazas_por_100"): number | null {
  if (unidad === "plazas_por_100") return a.objetivo > 0 ? a.sumaValor / a.objetivo : null;
  return a.nRatio > 0 ? a.objetivo / a.nRatio : null;
}

function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  const r = s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
  return Number.isFinite(r) ? r : null;
}

function nivelDe(id: string): NivelTerritorio | null {
  return id.startsWith("mun:") ? "municipio" : id.startsWith("dis:") ? "distrito" : id.startsWith("zona:") ? "zona" : null;
}

/** Ficha de un lugar con una fila por servicio cargado en `estados`. `null` si el id no existe. */
export function fichaLugar(
  lugarId: string,
  estados: Partial<Record<ServicioId, EstadoServicio>>,
  t: Territorios,
): FichaLugar | null {
  const nivel = nivelDe(lugarId);
  if (!nivel) return null;
  const filas: FilaFicha[] = [];
  let nombre = "";
  let poblacion = 0;
  for (const id of SERVICIO_IDS) {
    const e = estados[id];
    if (!e) continue;
    const def = SERVICIOS[id];
    const todos = agregar(e, t, nivel);
    const a = todos.find((x) => x.lugar === lugarId);
    if (!a) return null;
    nombre = a.nombre;
    poblacion = Math.round(a.poblacion);
    const unidad = def.unidad;
    const ratio = ratioDe(a, unidad);
    let mediaCom: number | null;
    if (unidad === "plazas_por_100") mediaCom = e.media;
    else {
      const n = e.centros.ids.reduce((c, _, j) => c + (esParaRatio(e, j) ? 1 : 0), 0);
      mediaCom = n > 0 ? e.totalObjetivo / n : null;
    }
    let medTramo: number | null = null;
    if (nivel === "municipio" && a.tramo) {
      const vs = todos.filter((x) => x.tramo === a.tramo && x.objetivo > 0).map((x) => {
        const r = ratioDe(x, unidad);
        return r == null ? (unidad === "hab_por_centro" ? Infinity : 0) : r;
      });
      medTramo = mediana(vs);
    }
    const ref = medTramo ?? mediaCom;
    let comparacion = compara(ratio, ref, unidad);
    // Servicios por distancia: si nadie queda a más del radio de un centro, no hay déficit aunque el ratio (o el hecho de no tener
    // ninguno dentro del municipio) salga bajo. Es el caso de un pueblo cuyo centro de salud o hospital está en el de al lado.
    const cubierto = unidad === "hab_por_centro" && comparacion === "por_debajo" && a.objetivo > 0 && a.enDeficit <= 0;
    if (cubierto) comparacion = "en_la_media";
    let brecha = 0;
    if (comparacion === "por_debajo") {
      if (ratio == null) brecha = 1;
      else if (ref != null && ref > 0) brecha = unidad === "hab_por_centro" ? 1 - ref / ratio : 1 - ratio / ref;
      brecha = Math.min(1, Math.max(0, brecha));
    }
    const fila: FilaFicha = {
      id, n: a.nCentros, n_ratio: a.nRatio, objetivo: Math.round(a.objetivo), unidad, ratio, media_comunidad: mediaCom, mediana_tramo: medTramo,
      pct_deficit: a.objetivo > 0 ? Math.round((100 * a.enDeficit) / a.objetivo * 1000) / 1000 : 0,
      personas_deficit: Math.round(a.enDeficit),
      comparacion, comparacion_comunidad: compara(ratio, mediaCom, unidad), brecha, cubierto_desde_fuera: cubierto,
    };
    if (distanciaAproximada(a, e.metrica)) fila.aproximada = true;
    if (unidad === "plazas_por_100") { fila.plazas_faltan = Math.round(a.faltan); fila.plazas = Math.round(a.plazas); }
    if (def.referencia) {
      const r = def.referencia;
      fila.referencia = {
        texto: r.texto, valor: r.valor, unidad: r.unidad, url: r.url,
        cumple: r.unidad === "hab_por_centro" ? (ratio != null && ratio <= r.valor) : ratio != null && ratio >= r.valor,
      };
    }
    filas.push(fila);
  }
  const faltan = filas
    .filter((f) => f.comparacion === "por_debajo")
    .sort((x, y) => y.brecha - x.brecha || y.pct_deficit - x.pct_deficit)
    .map((f) => f.id);
  return { lugar: lugarId, nombre, nivel, poblacion, servicios: filas, faltan };
}
