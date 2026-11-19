// Resolución de lugares por texto («Parla», «sur», «Centro») y punto en polígono contra los contornos.
import { sinTildes } from "../texto";
import type { ContornosGeo, LugarResuelto, Sugerencias, Territorios, TipoLugar } from "./tipos";

interface Entrada {
  tipo: TipoLugar;
  id: string;
  nombre: string;
  claves: string[];
  zonas: string[];
  bbox: [number, number, number, number];
  lat: number;
  lon: number;
}

const INDICES = new WeakMap<Territorios, Map<string, Entrada[]> & { __todas?: Entrada[] }>();

export function norm(t: string): string {
  return sinTildes(t).replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
}

function unirBbox(bs: [number, number, number, number][]): [number, number, number, number] {
  return [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))];
}

function construir(t: Territorios, aliasExtra: Record<string, string[]>): Entrada[] {
  const out: Entrada[] = [];
  for (const m of t.municipios) {
    const n = norm(m.nombre);
    const claves = new Set([n, n.replace(/^(el|la|los|las) /, ""), ...(aliasExtra[m.id] ?? []).map(norm)]);
    out.push({ tipo: "municipio", id: m.id, nombre: m.nombre, claves: [...claves], zonas: [m.zona], bbox: m.bbox, lat: m.lat, lon: m.lon });
  }
  for (const d of t.distritos) {
    out.push({ tipo: "distrito", id: d.id, nombre: d.nombre, claves: [norm(d.nombre)], zonas: ["01"], bbox: d.bbox, lat: d.lat, lon: d.lon });
  }
  const porZona = (c: string) => t.municipios.filter((m) => m.zona === c).map((m) => m.bbox);
  const claveZona = new Map<string, string[]>();
  for (const z of t.zonas) {
    for (const c of [norm(z.nombre), ...z.alias.map(norm)]) {
      const l = claveZona.get(c) ?? [];
      if (!l.includes(z.codigo)) l.push(z.codigo);
      claveZona.set(c, l);
    }
  }
  const vistos = new Set<string>();
  for (const [clave, codigos] of claveZona) {
    const id = `zona:${codigos[0]}`;
    const k = `${clave}|${codigos.join(",")}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const bbox = unirBbox(codigos.flatMap(porZona).length ? codigos.flatMap(porZona) : [[0, 0, 0, 0]]);
    const nombre = codigos.length === 1 ? (t.zonas.find((z) => z.codigo === codigos[0])?.nombre ?? clave) : clave.charAt(0).toUpperCase() + clave.slice(1);
    out.push({ tipo: "zona", id, nombre, claves: [clave], zonas: codigos, bbox, lat: (bbox[1] + bbox[3]) / 2, lon: (bbox[0] + bbox[2]) / 2 });
  }
  return out;
}

function entradas(t: Territorios, aliasExtra: Record<string, string[]>): Entrada[] {
  let idx = INDICES.get(t);
  if (!idx || Object.keys(aliasExtra).length) {
    idx = new Map() as Map<string, Entrada[]> & { __todas?: Entrada[] };
    idx.__todas = construir(t, aliasExtra);
    if (!Object.keys(aliasExtra).length) INDICES.set(t, idx);
  }
  return idx.__todas as Entrada[];
}

function aResuelto(e: Entrada): LugarResuelto {
  return { tipo: e.tipo, id: e.id, nombre: e.nombre, lat: e.lat, lon: e.lon, bbox: e.bbox, zonas: e.zonas };
}

/** Distancia de edición con tope: devuelve `max + 1` si la supera. */
export function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let min = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min((prev[j] as number) + 1, (cur[j - 1] as number) + 1, (prev[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < min) min = v;
    }
    if (min > max) return max + 1;
    prev = cur;
  }
  return prev[b.length] as number;
}

const ORDEN_TIPO: Record<TipoLugar, number> = { municipio: 0, distrito: 1, zona: 2 };

/**
 * Texto -> lugar. Coincidencia exacta (sin tildes ni mayúsculas, con alias) o prefijo único: devuelve el lugar.
 * Si no, hasta 5 sugerencias (prefijo, contiene, parecido). `aliasExtra`: alias por id de municipio (de `lugares.json`).
 */
export function resolverLugar(t: Territorios, texto: string, aliasExtra: Record<string, string[]> = {}): LugarResuelto | Sugerencias {
  let q = norm(texto).replace(/^(en|de|del|por) /, "").replace(/^(municipio|distrito|zona) (de |del )?/, "");
  if (!q) return { sugerencias: [] };
  const todas = entradas(t, aliasExtra);
  const exactas = todas.filter((e) => e.claves.includes(q));
  if (exactas.length) {
    exactas.sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]);
    return aResuelto(exactas[0] as Entrada);
  }
  q = q.replace(/^(el|la|los|las) /, "");
  const sinArticulo = todas.filter((e) => e.claves.includes(q));
  if (sinArticulo.length) {
    sinArticulo.sort((a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]);
    return aResuelto(sinArticulo[0] as Entrada);
  }
  const puntuadas: { e: Entrada; p: number }[] = [];
  for (const e of todas) {
    let p = Infinity;
    for (const c of e.claves) {
      if (c.startsWith(q) || c.split(" ").some((w) => w.startsWith(q))) p = Math.min(p, c.startsWith(q) ? 1 : 2);
      else if (q.length >= 3 && c.includes(q)) p = Math.min(p, 3);
      else if (q.length >= 4) {
        const d = levenshtein(q, c.replace(/^(el|la|los|las) /, ""), 2);
        if (d <= 2) p = Math.min(p, 4 + d);
      }
    }
    if (p < Infinity) puntuadas.push({ e, p });
  }
  puntuadas.sort((a, b) => a.p - b.p || ORDEN_TIPO[a.e.tipo] - ORDEN_TIPO[b.e.tipo] || a.e.nombre.localeCompare(b.e.nombre, "es"));
  const prefijo = puntuadas.filter((x) => x.p === 1);
  if (prefijo.length === 1) return aResuelto((prefijo[0] as { e: Entrada }).e);
  return { sugerencias: puntuadas.slice(0, 5).map(({ e }) => ({ tipo: e.tipo, id: e.id, nombre: e.nombre })) };
}

export function esLugar(r: LugarResuelto | Sugerencias): r is LugarResuelto {
  return "id" in r;
}

/** Lugar por id (`mun:…`, `dis:…`, `zona:04`), o null. */
export function lugarPorId(t: Territorios, id: string): LugarResuelto | null {
  const e = entradas(t, {}).find((x) => x.id === id && (x.tipo !== "zona" || x.zonas.length === 1));
  return e ? aResuelto(e) : null;
}

// ---------------------------------------------------------------- punto en polígono
function enAnillo(x: number, y: number, anillo: number[][]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i] as [number, number];
    const [xj, yj] = anillo[j] as [number, number];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function enPoligono(x: number, y: number, p: number[][][]): boolean {
  if (!enAnillo(x, y, p[0] as number[][])) return false;
  for (let h = 1; h < p.length; h++) if (enAnillo(x, y, p[h] as number[][])) return false;
  return true;
}

function idEn(geo: ContornosGeo, bboxes: Map<string, [number, number, number, number]>, lat: number, lon: number): string | null {
  for (const f of geo.features) {
    const b = bboxes.get(f.properties.id);
    if (b && (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3])) continue;
    const g = f.geometry;
    const polis = g.type === "Polygon" ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
    for (const p of polis) if (enPoligono(lon, lat, p)) return f.properties.id;
  }
  return null;
}

const BB_MUN = new WeakMap<Territorios, Map<string, [number, number, number, number]>>();
const BB_DIS = new WeakMap<Territorios, Map<string, [number, number, number, number]>>();

/** Municipio (`mun:28106`) cuyo contorno contiene el punto, o null (fuera de la Comunidad o en un hueco de la simplificación). */
export function municipioEn(t: Territorios, lat: number, lon: number): string | null {
  let m = BB_MUN.get(t);
  if (!m) { m = new Map(t.municipios.map((x) => [x.id, x.bbox])); BB_MUN.set(t, m); }
  return idEn(t.municipios_geo, m, lat, lon);
}

/** Distrito de la capital (`dis:2807901`) que contiene el punto, o null. */
export function distritoEn(t: Territorios, lat: number, lon: number): string | null {
  let m = BB_DIS.get(t);
  if (!m) { m = new Map(t.distritos.map((x) => [x.id, x.bbox])); BB_DIS.set(t, m); }
  return idEn(t.distritos_geo, m, lat, lon);
}

export function dentroDeLaComunidad(t: Territorios, lat: number, lon: number): boolean {
  return municipioEn(t, lat, lon) !== null;
}
