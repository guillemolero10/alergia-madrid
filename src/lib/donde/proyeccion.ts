// «Madrid en 2030»: la población proyectada del INE (escenario central, 2026-2076) repartida por sección censal con un modelo
// de cohortes (`public/donde/secciones_2030.json`, `pipeline/donde/proyeccion.py`). Sin DOM: lo usan la web, el agente y los tests.
//
// Cómo se usa: se carga el fichero solo al elegir 2030, se comprueba que cuadra con las secciones de hoy (mismas 4.518, mismo orden)
// y se sustituye `pob`. El motor agrega siempre desde `pob`, así que ranking, déficit, simulador y óptimo se recalculan solos. Los
// centros (los servicios) son los de hoy: el mapa de 2030 responde «con los centros que hay, ¿dónde faltará?».
import type { GrupoObjetivo, Secciones, Territorios } from "./tipos";

export type AnioDonde = 2025 | 2030;
/** Año de la población de hoy (censo anual del INE a 1 de enero) y año de la proyección. */
export const ANIO_HOY: AnioDonde = 2025;
export const ANIO_PROYECCION: AnioDonde = 2030;
export const ANIOS: readonly AnioDonde[] = [ANIO_HOY, ANIO_PROYECCION];

export function esAnioDonde(x: unknown): x is AnioDonde {
  return x === ANIO_HOY || x === ANIO_PROYECCION;
}

type GrupoPob = "total" | "0_14" | "3_16" | "65_mas" | "75_mas";
const GRUPOS_POB: readonly GrupoPob[] = ["total", "0_14", "3_16", "65_mas", "75_mas"];

interface ErrorModelo {
  modelo: { wape: number; mediana: number; p80: number };
}

/** El fichero `secciones_2030.json`: solo los campos que usa la web. */
export interface Proyeccion {
  version: number;
  anio: number;
  anio_base: number;
  fecha_referencia: string;
  n: number;
  ids_sha1: string;
  fuente_oficial: string;
  comunidad: Record<string, Record<GrupoPob, number>>;
  pob: Record<GrupoPob, number[]>;
  validacion?: { municipio?: Partial<Record<GrupoPob, ErrorModelo>> };
}

export class ErrorProyeccion extends Error {
  constructor(motivo: string) {
    super(`La proyección a 2030 no es válida: ${motivo}`);
    this.name = "ErrorProyeccion";
  }
}

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** Comprueba el formato y que tiene una población por cada sección (`n`, la misma cuenta que las secciones de hoy). */
export function validarProyeccion(x: unknown, secciones: Secciones): Proyeccion {
  if (!esObjeto(x) || x.version !== 1) throw new ErrorProyeccion("versión no soportada");
  if (x.anio !== ANIO_PROYECCION) throw new ErrorProyeccion(`no es la de ${ANIO_PROYECCION}`);
  const n = secciones.ids.length;
  if (x.n !== n) throw new ErrorProyeccion(`trae ${String(x.n)} secciones y las de hoy son ${n}`);
  const pob = x.pob;
  if (!esObjeto(pob)) throw new ErrorProyeccion("falta «pob»");
  for (const g of GRUPOS_POB) {
    const v = pob[g];
    if (!Array.isArray(v) || v.length !== n || !v.every((y) => typeof y === "number" && Number.isFinite(y) && y >= 0)) {
      throw new ErrorProyeccion(`pob.${g} no cuadra con las ${n} secciones`);
    }
  }
  return x as unknown as Proyeccion;
}

/** sha1 en hexadecimal de los ids unidos por saltos de línea, o null si este entorno no tiene Web Crypto. */
export async function sha1Ids(ids: readonly string[]): Promise<string | null> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(ids.join("\n"));
  const h = new Uint8Array(await subtle.digest("SHA-1", bytes));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Además de `validarProyeccion`, comprueba que las secciones van en el mismo orden (sha1 de los ids), si se puede. */
export async function validarProyeccionConOrden(x: unknown, secciones: Secciones): Promise<Proyeccion> {
  const p = validarProyeccion(x, secciones);
  const sha = await sha1Ids(secciones.ids);
  if (sha !== null && p.ids_sha1 && sha !== p.ids_sha1) throw new ErrorProyeccion("las secciones no van en el mismo orden que las de hoy");
  return p;
}

/** Las secciones con la población de 2030. Todo lo demás (ids, municipio, zona, punto, área) es igual: son las secciones de 2025. */
export function aplicarProyeccion(secciones: Secciones, p: Proyeccion): Secciones {
  return { ...secciones, anio_poblacion: ANIO_PROYECCION, pob: p.pob };
}

/**
 * `territorios.json` trae la población de 2025 de municipios y distritos (`poblacion`): con 2030 se recalcula sumando `pob.total`
 * de sus secciones. Los contornos y el resto son los mismos objetos.
 */
export function territoriosConPoblacion(t: Territorios, s: Secciones): Territorios {
  const porMun = new Map<string, number>();
  const porDis = new Map<string, number>();
  for (let i = 0; i < s.ids.length; i++) {
    const v = s.pob.total[i] as number;
    const m = s.mun[i] as string;
    porMun.set(m, (porMun.get(m) ?? 0) + v);
    const d = s.distrito[i];
    if (d) porDis.set(d, (porDis.get(d) ?? 0) + v);
  }
  return {
    ...t,
    anio_poblacion: s.anio_poblacion,
    municipios: t.municipios.map((m) => ({ ...m, poblacion: porMun.get(m.id) ?? m.poblacion })),
    distritos: t.distritos.map((d) => ({ ...d, poblacion: porDis.get(d.id) ?? d.poblacion })),
  };
}

// ---------------------------------------------------------------- lo que se le cuenta al usuario
/** Con qué fiabilidad se puede enseñar el grupo en 2030: el modelo gana a las referencias ingenuas en mayores, no en el total. */
export type FiabilidadProyeccion = "buena" | "menor";

export function fiabilidadProyeccion(grupo: GrupoObjetivo): FiabilidadProyeccion {
  return grupo === "65_mas" ? "buena" : "menor";
}

/** Error típico del modelo por municipio (mediana del error relativo, 2021 → 2025), en %, o null si el fichero no lo trae. */
export function errorTipicoPct(p: Proyeccion | null, grupo: "65_mas" | "75_mas" | "total"): number | null {
  const m = p?.validacion?.municipio?.[grupo]?.modelo.mediana;
  return typeof m === "number" ? Math.round(m * 1000) / 10 : null;
}

/** Error medio ponderado por población (WAPE: error absoluto total / total real) del modelo por municipio, 2021 → 2025, en %. */
export function errorPonderadoPct(p: Proyeccion | null, grupo: "65_mas" | "75_mas" | "total"): number | null {
  const m = p?.validacion?.municipio?.[grupo]?.modelo.wape;
  return typeof m === "number" ? Math.round(m * 1000) / 10 : null;
}

const pct = (n: number) => `${String(n).replace(".", ",")} %`;

/**
 * Frase única sobre el error de la proyección (panel y Metodología). Nombra las dos métricas: el error medio ponderado por
 * población (lo que importa para el total de la Comunidad) y el de un municipio típico (la mediana, mayor porque pesan los pueblos pequeños).
 */
export function fraseErrorProyeccion(p: Proyeccion | null): string | null {
  const w65 = errorPonderadoPct(p, "65_mas");
  const w75 = errorPonderadoPct(p, "75_mas");
  const m65 = errorTipicoPct(p, "65_mas");
  const m75 = errorTipicoPct(p, "75_mas");
  if (w65 === null || w75 === null || m65 === null || m75 === null) return null;
  return `Probado de 2021 a 2025, el error medio ponderado por población fue del ${pct(w65)} en mayores de 65 y del ${pct(w75)} en mayores de 75; en un municipio típico, del ${pct(m65)} y del ${pct(m75)} (en pueblos pequeños, más).`;
}

/** Texto fijo del rótulo de la proyección (sin cifras: las del error van aparte, salen del fichero). */
export const ROTULO_PROYECCION = "Proyección a 1-ene-2030 (INE, escenario central); el reparto por sección es un modelo.";
