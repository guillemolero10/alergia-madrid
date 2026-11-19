// Buscador de «Mi municipio»: municipios y distritos de la capital, con los alias de `lugares.json`, sin tildes ni mayúsculas
// y tolerante a erratas. No devuelve zonas: la ficha es de un municipio o de un distrito.
import { levenshtein, norm, resolverLugar } from "./lugares";
import type { Territorios } from "./tipos";

export interface Candidato {
  tipo: "municipio" | "distrito";
  /** `mun:28106` o `dis:2807901`. */
  id: string;
  nombre: string;
  /** Línea pequeña bajo el nombre: la zona o «Distrito de Madrid». */
  detalle: string;
  poblacion: number;
}

interface Entrada extends Candidato {
  claves: string[];
}

const ARTICULO = /^(el|la|los|las) /;

const INDICES = new WeakMap<Territorios, Entrada[]>();

function construir(t: Territorios, alias: Record<string, string[]>): Entrada[] {
  const zona = new Map(t.zonas.map((z) => [z.codigo, z.nombre]));
  const out: Entrada[] = [];
  for (const m of t.municipios) {
    const n = norm(m.nombre);
    const claves = new Set([n, n.replace(ARTICULO, ""), ...(alias[m.id] ?? []).flatMap((a) => [norm(a), norm(a).replace(ARTICULO, "")])]);
    out.push({ tipo: "municipio", id: m.id, nombre: m.nombre, detalle: zona.get(m.zona) ?? "Comunidad de Madrid", poblacion: m.poblacion, claves: [...claves] });
  }
  for (const d of t.distritos) {
    const n = norm(d.nombre);
    out.push({ tipo: "distrito", id: d.id, nombre: d.nombre, detalle: "Distrito de Madrid", poblacion: d.poblacion, claves: [n, n.replace(ARTICULO, "")] });
  }
  return out;
}

function entradas(t: Territorios, alias: Record<string, string[]>): Entrada[] {
  const hayAlias = Object.keys(alias).length > 0;
  if (!hayAlias) {
    const hit = INDICES.get(t);
    if (hit) return hit;
  }
  const e = construir(t, alias);
  if (!hayAlias) INDICES.set(t, e);
  return e;
}

/** Puntuación (menor = mejor) de una consulta contra las claves de un lugar; `Infinity` si no se parece. 0 = exacto, 1 = empieza por, 2 = una palabra empieza por, 3 = contiene, 4 o más = errata. */
function puntuar(q: string, claves: string[]): number {
  let p = Infinity;
  for (const c of claves) {
    if (c === q) return 0;
    if (c.startsWith(q)) p = Math.min(p, 1);
    else if (c.split(" ").some((w) => w.length > 2 && w.startsWith(q))) p = Math.min(p, 2);
    else if (q.length >= 3 && c.includes(q)) p = Math.min(p, 3);
    if (q.length >= 4) {
      // Errata: se compara con el nombre entero y con el principio del nombre del mismo largo («fuenlabada» ~ «fuenlabrada»).
      const d = Math.min(levenshtein(q, c, 2), c.length > q.length ? levenshtein(q, c.slice(0, q.length), 1) + 0.5 : 9);
      if (d <= 2) p = Math.min(p, 4 + d);
    }
  }
  return p;
}

function limpiar(texto: string): string {
  return norm(texto).replace(/^(municipio|distrito|ciudad|pueblo) (de |del )?/, "").replace(/^(en|de|del) /, "");
}

interface Puntuada {
  e: Entrada;
  p: number;
}

function ordenadas(t: Territorios, texto: string, alias: Record<string, string[]>): Puntuada[] {
  const q = limpiar(texto);
  const qq = q.replace(ARTICULO, "");
  if (qq.length < 1) return [];
  const out: Puntuada[] = [];
  for (const e of entradas(t, alias)) {
    const p = Math.min(puntuar(q, e.claves), puntuar(qq, e.claves));
    if (p < Infinity) out.push({ e, p });
  }
  out.sort((a, b) => a.p - b.p || (a.e.tipo === b.e.tipo ? 0 : a.e.tipo === "municipio" ? -1 : 1) || b.e.poblacion - a.e.poblacion || a.e.nombre.localeCompare(b.e.nombre, "es"));
  return out;
}

function aCandidato({ e }: Puntuada): Candidato {
  return { tipo: e.tipo, id: e.id, nombre: e.nombre, detalle: e.detalle, poblacion: e.poblacion };
}

/**
 * Lugares que encajan con lo escrito, de mejor a peor (como mucho `max`). Un texto vacío no da nada.
 * `alias`: alias por id de municipio (`lugares.json`: «sanse», «alcala»…).
 */
export function sugerirLugares(t: Territorios, texto: string, alias: Record<string, string[]> = {}, max = 8): Candidato[] {
  return ordenadas(t, texto, alias).slice(0, max).map(aCandidato);
}

export type ResultadoBusqueda =
  | { tipo: "lugar"; lugar: Candidato }
  | { tipo: "zona"; nombre: string }
  | { tipo: "ninguno"; sugerencias: Candidato[] };

/**
 * Lo que pasa al pulsar «Buscar» o Intro sin elegir de la lista: el mejor candidato si lo es con claridad (exacto, o mejor clase
 * de coincidencia que el segundo: «Fuenla», «Alcala»); si hay empate («San», «Villa»), sugerencias; si el texto es una zona
 * («sur», «sierra»), se avisa de que la ficha es de un municipio.
 */
export function buscarLugar(t: Territorios, texto: string, alias: Record<string, string[]> = {}): ResultadoBusqueda {
  const o = ordenadas(t, texto, alias);
  const primero = o[0];
  if (primero) {
    const segundo = o[1];
    if (primero.p === 0 || !segundo || primero.p < segundo.p) return { tipo: "lugar", lugar: aCandidato(primero) };
    return { tipo: "ninguno", sugerencias: o.slice(0, 5).map(aCandidato) };
  }
  const r = resolverLugar(t, texto, alias);
  if ("id" in r && r.tipo === "zona") return { tipo: "zona", nombre: r.nombre };
  return { tipo: "ninguno", sugerencias: [] };
}

/** Alias de `lugares.json` por id de municipio. */
export function aliasDeLugares(lugares: { municipios: { id: string; alias?: string[] }[] }): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of lugares.municipios) if (m.alias?.length) out[m.id] = m.alias;
  return out;
}
