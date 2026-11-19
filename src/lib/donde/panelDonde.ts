// Lógica del panel y del mapa de «¿Dónde hace falta?» que no depende del DOM: valores que se pintan, cifra grande,
// referencias, ranking y textos de la ventanita del mapa. Usa el motor tal cual (`cobertura`, `agregados`).
import { agregar, ranking } from "./agregados";
import { objetivoDe, plazasFaltanSeccion, plazasQueFaltan } from "./cobertura";
import { CLASE_SIN_DEFICIT, SIN_POBLACION, claseDeficit, cortesDeficit } from "./escalaColor";
import { SERVICIOS } from "./servicios";
import type { Centros, EstadoServicio, FilaRanking, NivelTerritorio, Territorios } from "./tipos";
import type { NivelRanking, OrdenRanking, ReferenciaId } from "./urlDonde";

// ---------------------------------------------------------------- formato
const decimal1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

/** «12.300», con punto de millar también en 4 cifras (Intl en español no lo agrupa por defecto: «1234»). */
export function enteroEs(n: number): string {
  const r = Math.round(n);
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return r < 0 ? `-${s}` : s;
}

/**
 * «unas 12 plazas» con el verbo concordado: «faltan unas 12 plazas», pero «falta 1 plaza» y «falta menos de 1 plaza».
 * `verbo` es lo que va delante («Faltan», «faltan», «le faltan»); en singular pasa a «Falta», «falta», «le falta».
 */
export function faltanPlazas(n: number, verbo: string): string {
  const r = Math.round(n);
  const singular = verbo.replace(/faltan$/i, (m) => (m[0] === "F" ? "Falta" : "falta"));
  if (r <= 0) return `${singular} menos de 1 plaza`;
  if (r === 1) return `${singular} 1 plaza`;
  return `${verbo} unas ${enteroEs(r)} plazas`;
}

/** «12 plazas» o «1 plaza». */
export function plazasEs(n: number): string {
  return `${enteroEs(n)} ${Math.round(n) === 1 ? "plaza" : "plazas"}`;
}

/** «4,1» (un decimal). */
export function decimalEs(n: number): string {
  return decimal1.format(n);
}

/** «4,05» (dos decimales). */
export function decimal2Es(n: number): string {
  return decimal2.format(n);
}

/** «5,8 %»; por debajo del 0,1 % de cero, «menos del 0,1 %». */
export function porcentajeEs(pct: number): string {
  if (pct > 0 && pct < 0.1) return "menos del 0,1 %";
  return `${decimal1.format(pct)} %`;
}

/** 500 → «500 m»; 1000 → «1 km»; 1500 → «1,5 km». */
export function radioEs(m: number): string {
  if (m < 1000) return `${enteroEs(m)} m`;
  const km = m / 1000;
  return `${Number.isInteger(km) ? km : decimal1.format(km)} km`;
}

// ---------------------------------------------------------------- lo que se pinta
export interface Pintura {
  tipo: "plazas" | "clases";
  /** Un valor por sección para `feature-state.v`: A_i (plazas) o la clase 0 a 4 (distancia). -1 = sin población objetivo. */
  valores: Float64Array;
  /** Plazas: el centro de la escala (la referencia). */
  centro: number | null;
  /** Distancia: cortes de las clases en personas en déficit por km². */
  cortes: [number, number, number] | null;
}

export function valoresMapa(estado: EstadoServicio): Pintura {
  const s = estado.secciones;
  const n = s.ids.length;
  const obj = objetivoDe(s, estado.grupo);
  const valores = new Float64Array(n);
  if (estado.metrica === "plazas") {
    for (let i = 0; i < n; i++) valores[i] = (obj[i] as number) > 0 ? (estado.valor[i] as number) : SIN_POBLACION;
    return { tipo: "plazas", valores, centro: estado.umbral, cortes: null };
  }
  const dens = new Float64Array(n);
  const pesos = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (estado.deficit[i] && (obj[i] as number) > 0) {
      dens[i] = (obj[i] as number) / Math.max(s.area_km2[i] as number, 1e-6);
      pesos[i] = obj[i] as number;
    }
  }
  const cortes = cortesDeficit(dens, pesos);
  for (let i = 0; i < n; i++) {
    if ((obj[i] as number) <= 0) valores[i] = SIN_POBLACION;
    else if (estado.deficit[i]) valores[i] = claseDeficit(dens[i] as number, cortes);
    else valores[i] = CLASE_SIN_DEFICIT;
  }
  return { tipo: "clases", valores, centro: null, cortes };
}

// ---------------------------------------------------------------- referencias (servicios con plazas)
export interface OpcionReferencia {
  id: ReferenciaId;
  etiqueta: string;
  /** Plazas por cada 100 mayores. */
  valor: number;
  fuente: string;
  url: string | null;
}

/** Las tres referencias de un servicio con plazas, con su fuente. `mediaComunidad` sale del estado (no depende de la referencia elegida). */
export function opcionesReferencia(estado: EstadoServicio, mediaHoy: number | null = null): OpcionReferencia[] {
  const def = SERVICIOS[estado.servicio];
  if (!def.imserso) return [];
  const mayores = "plazas residenciales";
  return [
    {
      id: "imserso_espana",
      etiqueta: "Media de España (IMSERSO)",
      valor: def.imserso.espana,
      fuente: "IMSERSO, «Servicios sociales dirigidos a las personas mayores en España», a 31-dic-2024. Cuenta las plazas que declara cada comunidad.",
      url: def.imserso.url,
    },
    {
      id: "imserso_madrid",
      etiqueta: "Media de Madrid (IMSERSO)",
      valor: def.imserso.madrid,
      fuente: "IMSERSO, mismo informe (31-dic-2024). No coincide plaza a plaza con el registro de la Comunidad que usamos para el mapa.",
      url: def.imserso.url,
    },
    {
      id: "media",
      // En 2030 la media es la de hoy (`mediaHoy`): la de 2030 sería otra y haría desaparecer el déficit.
      etiqueta: mediaHoy === null ? "Media de la Comunidad" : "Media de la Comunidad (la de hoy)",
      valor: mediaHoy ?? estado.media ?? 0,
      fuente: `Nuestro cálculo: ${mayores} del registro de centros de servicios sociales de la Comunidad ÷ mayores de 65 (INE, 2025), ponderada por población.`,
      url: "https://datos.comunidad.madrid/catalogo/dataset/atencion_social_registro_centros",
    },
  ];
}

// ---------------------------------------------------------------- cifra grande
export interface CifraGrande {
  /** «la Comunidad de Madrid» o el nombre de la zona. */
  ambito: string;
  objetivo: number;
  enDeficit: number;
  pct: number;
  /** Solo plazas: plazas que faltan para llegar a la referencia (cota inferior, ver `plazasQueFaltan`). */
  plazasFaltan: number | null;
}

const idZona = (codigo: string) => `zona:${codigo}`;

/**
 * El filtro de zona de la URL puede traer varias zonas estadísticas separadas por comas (`?zona=06,10,11` = la sierra).
 * Devuelve sus códigos (vacío = toda la Comunidad).
 */
export function codigosZona(zona: string | null | undefined): string[] {
  return zona ? zona.split(",").filter((c) => c !== "") : [];
}

/** Lo que entiende el motor: un código, varios o nada. */
export function zonaParaMotor(zona: string | null | undefined): string | string[] | undefined {
  const c = codigosZona(zona);
  return c.length === 0 ? undefined : c.length === 1 ? (c[0] as string) : c;
}

/** «Sur Metropolitano» o «Sierra Norte, Sierra Sur y Sierra Central». */
export function nombreZonas(t: Territorios, zona: string | null | undefined): string {
  const nombres = codigosZona(zona).map((c) => t.zonas.find((z) => z.codigo === c)?.nombre ?? `la zona ${c}`);
  if (nombres.length <= 1) return nombres[0] ?? "la Comunidad de Madrid";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/** Cifra de toda la Comunidad o de una zona estadística. Para la Comunidad usa los totales del motor (`totalDeficit`, `plazasQueFaltan`). */
export function cifraGrande(estado: EstadoServicio, t: Territorios, zona: string | null): CifraGrande {
  const esPlazas = estado.metrica === "plazas";
  if (!zona) {
    return {
      ambito: "la Comunidad de Madrid",
      objetivo: estado.totalObjetivo,
      enDeficit: estado.totalDeficit,
      pct: estado.totalObjetivo > 0 ? (100 * estado.totalDeficit) / estado.totalObjetivo : 0,
      plazasFaltan: esPlazas ? plazasQueFaltan(estado) : null,
    };
  }
  const codigos = new Set(codigosZona(zona));
  const nombre = nombreZonas(t, zona);
  let objetivo = 0;
  let enDeficit = 0;
  let faltan = 0;
  for (const a of agregar(estado, t, "zona")) {
    if (![...codigos].some((c) => a.lugar === idZona(c))) continue;
    objetivo += a.objetivo;
    enDeficit += a.enDeficit;
    faltan += a.faltan;
  }
  return { ambito: nombre, objetivo, enDeficit, pct: objetivo > 0 ? (100 * enDeficit) / objetivo : 0, plazasFaltan: esPlazas ? faltan : null };
}

const TIENE_CERCA: Record<string, string> = {
  centro_salud: "un centro de salud o consultorio",
  hospital: "un hospital general público",
  farmacia: "una farmacia",
  colegio: "un colegio o instituto",
  dea: "un desfibrilador",
};

/** Invitación sobre el mapa antes de colocar nada: sin cifras, solo qué se puede hacer. */
export function invitacionMapa(estado: Pick<EstadoServicio, "metrica">): string {
  return estado.metrica === "plazas" ? "Coloca una residencia y mira cuántas plazas más cubre" : "Coloca un centro y mira a cuántos vecinos ayuda";
}

export interface CoberturaPositiva {
  /** La cifra grande: «93,8 %» (distancia) o «80.505» plazas. */
  numero: string;
  /** Qué cuenta, empezando por la cifra: «de los habitantes tiene una farmacia a menos de 1 km en la Comunidad de Madrid». */
  texto: string;
}

/**
 * Lo que sí está cubierto, en positivo y con los mismos números que `cifraGrande`. Distancia: el porcentaje de vecinos con el
 * servicio cerca. Plazas, toda la Comunidad: las plazas que hay y las que salen por cada 100 mayores; en una zona, el porcentaje de
 * mayores que vive donde se llega a la referencia. `null` si no hay población objetivo.
 */
export function coberturaPositiva(estado: EstadoServicio, t: Territorios, zona: string | null): CoberturaPositiva | null {
  const c = cifraGrande(estado, t, zona);
  if (c.objetivo <= 0) return null;
  const futuro = estado.secciones.anio_poblacion === 2030;
  const marca = futuro ? " (2030)" : "";
  if (estado.metrica === "plazas") {
    if (!zona && estado.plazasTotales !== null && estado.media !== null) {
      return {
        numero: enteroEs(estado.plazasTotales),
        texto: `plazas de residencia en ${c.ambito}: ${decimal2Es(estado.media)} por cada 100 mayores de 65${marca}`,
      };
    }
    return { numero: porcentajeEs(100 - c.pct), texto: `de los mayores de 65 vive en zonas que llegan a ${decimal2Es(estado.umbral)} plazas por cada 100 en ${c.ambito}${marca}` };
  }
  const sujeto = SERVICIOS[estado.servicio].grupo === "3_16" ? "de las personas de 3 a 16 años" : "de los habitantes";
  return {
    numero: porcentajeEs(100 - c.pct),
    texto: `${sujeto} tiene ${TIENE_CERCA[estado.servicio] ?? "un centro"} a menos de ${radioEs(estado.radio_m)} en ${c.ambito}${marca}`,
  };
}

// ---------------------------------------------------------------- ranking
export interface OpcionesPanelRanking {
  nivel: NivelRanking;
  zona: string | null;
  orden: OrdenRanking;
  limite?: number;
}

/** Las filas del ranking del panel: el motor, con el orden y el filtro de zona elegidos. Con `pct` y `personas` coincide con el caso 6 de `referencia.json`. */
export function filasRanking(estado: EstadoServicio, t: Territorios, o: OpcionesPanelRanking): FilaRanking[] {
  const nivel: NivelTerritorio = o.nivel;
  return ranking(estado, t, { nivel, zona: zonaParaMotor(o.zona), orden: o.orden, limite: o.limite ?? 10 });
}

/** Recuadro [oeste, sur, este, norte] de una zona (unión de los de sus municipios), o null. */
export function bboxZona(t: Territorios, zona: string): [number, number, number, number] | null {
  const codigos = new Set(codigosZona(zona));
  let b: [number, number, number, number] | null = null;
  for (const m of t.municipios) {
    if (!codigos.has(m.zona)) continue;
    b = b
      ? [Math.min(b[0], m.bbox[0]), Math.min(b[1], m.bbox[1]), Math.max(b[2], m.bbox[2]), Math.max(b[3], m.bbox[3])]
      : [...m.bbox];
  }
  return b;
}

/** Recuadro de un municipio o distrito por su id, o null. */
export function bboxLugar(t: Territorios, id: string): [number, number, number, number] | null {
  return t.municipios.find((m) => m.id === id)?.bbox ?? t.distritos.find((d) => d.id === id)?.bbox ?? null;
}

// ---------------------------------------------------------------- ventanita del mapa
export interface Ventanita {
  titulo: string;
  lineas: string[];
}

function nombreMunicipio(t: Territorios, id: string): string {
  return t.municipios.find((m) => m.id === id)?.nombre ?? "Municipio sin nombre";
}

function nombreDistrito(t: Territorios, id: string | null): string | null {
  return id ? (t.distritos.find((d) => d.id === id)?.nombre ?? null) : null;
}

/** Municipio, población objetivo y distancia o plazas de una sección censal. */
export function describirSeccion(estado: EstadoServicio, t: Territorios, i: number): Ventanita | null {
  const s = estado.secciones;
  if (i < 0 || i >= s.ids.length) return null;
  const def = SERVICIOS[estado.servicio];
  const obj = objetivoDe(s, estado.grupo)[i] as number;
  const dis = nombreDistrito(t, s.distrito[i] ?? null);
  const titulo = dis ? `${nombreMunicipio(t, s.mun[i] as string)}, distrito ${dis}` : nombreMunicipio(t, s.mun[i] as string);
  const lineas = [`${enteroEs(obj)} ${def.grupoEtiqueta} en esta sección censal${s.anio_poblacion === 2030 ? " (proyección a 2030)" : ""}`];
  const v = estado.valor[i] as number;
  if (estado.metrica === "plazas") {
    lineas.push(`${decimalEs(v)} plazas a menos de ${radioEs(estado.radio_m)} por cada 100 mayores (referencia: ${decimal2Es(estado.umbral)})`);
    const falta = plazasFaltanSeccion(estado, i, objetivoDe(s, estado.grupo));
    lineas.push(falta >= 0.5 ? `${plazasEs(falta)} por cubrir para llegar a la referencia` : "Llega a la referencia");
  } else if (!Number.isFinite(v)) {
    lineas.push("No hay ningún centro registrado");
  } else {
    const km = v >= 1000 ? `${decimalEs(v / 1000)} km` : `${enteroEs(v)} m`;
    lineas.push(`Centro más cercano a ${km} en línea recta`);
    lineas.push(estado.deficit[i] ? `A más de ${radioEs(estado.radio_m)}: un centro nuevo ayudaría` : `A menos de ${radioEs(estado.radio_m)}: cubierta`);
  }
  return { titulo, lineas };
}

/** Nombre y plazas de un centro. */
export function describirCentro(estado: EstadoServicio, t: Territorios, j: number): Ventanita | null {
  const c: Centros = estado.centros;
  if (j < 0 || j >= c.ids.length) return null;
  const def = SERVICIOS[estado.servicio];
  const nombre = (c.nombres[j] ?? "").trim();
  const lineas = [nombreMunicipio(t, c.mun[j] as string)];
  if (c.plazas) {
    const p = c.plazas[j];
    lineas.push(p == null ? "Plazas: el registro no las indica" : `${enteroEs(p)} plazas autorizadas`);
  }
  return { titulo: nombre || def.nombre, lineas };
}
