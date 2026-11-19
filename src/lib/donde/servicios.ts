// Catálogo de servicios: fuente única para la web, el agente y el intérprete sin IA.
import type { GrupoObjetivo, Metrica, ServicioId, UmbralDeficit, UnidadRatio } from "./tipos";

/**
 * Umbral de déficit de residencias: por defecto, la cobertura media de España del IMSERSO (4,05 plazas por cada 100 mayores de 65),
 * una referencia oficial y externa. Alternativas elegibles en pantalla: "media" de la Comunidad (4,11), "imserso_madrid" (4,21)
 * y "mediana". Se cambia solo con esta constante.
 */
export const UMBRAL_DEFICIT_POR_DEFECTO: UmbralDeficit = "imserso_espana";

export interface ReferenciaNormativa {
  texto: string;
  valor: number;
  unidad: UnidadRatio;
  url: string;
}

export interface DefServicio {
  id: ServicioId;
  nombre: string;
  sinonimos: string[];
  grupo: GrupoObjetivo;
  grupoEtiqueta: string;
  metrica: Metrica;
  radios: [number, number, number];
  radioDefecto: number;
  plazasDefecto: number | null;
  unidad: UnidadRatio;
  /** Cobertura del IMSERSO a 31-dic-2024 (solo residencia). */
  imserso: { espana: number; madrid: number; url: string } | null;
  referencia: ReferenciaNormativa | null;
  nota?: string;
}

const URL_IMSERSO =
  "https://imserso.es/documents/20123/10902543/inf_ssppmmesp2024.pdf/1432577e-5e36-5d7c-83d1-24864192dc99";

export const SERVICIOS: Record<ServicioId, DefServicio> = {
  centro_salud: {
    id: "centro_salud",
    nombre: "Centro de salud o consultorio",
    sinonimos: ["centro de salud", "centros de salud", "ambulatorio", "consultorio", "medico", "médico", "atencion primaria"],
    grupo: "total",
    grupoEtiqueta: "habitantes",
    metrica: "distancia",
    radios: [1000, 2000, 5000],
    radioDefecto: 2000,
    plazasDefecto: null,
    unidad: "hab_por_centro",
    imserso: null,
    referencia: {
      texto: "RD 137/1984: una zona de salud de 5.000 a 25.000 habitantes",
      valor: 25000,
      unidad: "hab_por_centro",
      url: "https://www.boe.es/buscar/act.php?id=BOE-A-1984-2574",
    },
    nota: "La norma aplica el módulo por zona de salud, no por municipio; los consultorios no cuentan para el ratio.",
  },
  hospital: {
    id: "hospital",
    nombre: "Hospital general público",
    sinonimos: ["hospital", "hospitales"],
    grupo: "total",
    grupoEtiqueta: "habitantes",
    metrica: "distancia",
    radios: [10000, 15000, 25000],
    radioDefecto: 15000,
    plazasDefecto: null,
    unidad: "hab_por_centro",
    imserso: null,
    referencia: null,
    nota: "Los hospitales de gestión concertada registrados como privados quedan fuera.",
  },
  residencia: {
    id: "residencia",
    nombre: "Residencia de mayores",
    sinonimos: ["residencia", "residencias", "geriatrico", "geriátrico", "centro de mayores", "residencia de mayores"],
    grupo: "65_mas",
    grupoEtiqueta: "mayores de 65",
    metrica: "plazas",
    radios: [5000, 10000, 20000],
    radioDefecto: 10000,
    plazasDefecto: 94,
    unidad: "plazas_por_100",
    imserso: { espana: 4.05, madrid: 4.21, url: URL_IMSERSO },
    referencia: {
      texto: "IMSERSO (31-dic-2024): 4,05 plazas por cada 100 mayores en España, 4,21 en Madrid",
      valor: 4.05,
      unidad: "plazas_por_100",
      url: URL_IMSERSO,
    },
  },
  farmacia: {
    id: "farmacia",
    nombre: "Farmacia",
    sinonimos: ["farmacia", "farmacias"],
    grupo: "total",
    grupoEtiqueta: "habitantes",
    metrica: "distancia",
    radios: [500, 1000, 2000],
    radioDefecto: 1000,
    plazasDefecto: null,
    unidad: "hab_por_centro",
    imserso: null,
    referencia: {
      texto: "Ley 13/2022 de la Comunidad de Madrid, art. 23.3: módulo de 3.000 habitantes por farmacia",
      valor: 3000,
      unidad: "hab_por_centro",
      url: "https://www.boe.es/eli/es-md/l/2022/12/21/13",
    },
    nota: "La ley aplica el módulo por zona farmacéutica, no por municipio.",
  },
  colegio: {
    id: "colegio",
    nombre: "Colegio o instituto",
    sinonimos: ["colegio", "colegios", "escuela", "escuelas", "cole", "instituto", "institutos"],
    grupo: "3_16",
    grupoEtiqueta: "personas de 3 a 16 años (estimado)",
    metrica: "distancia",
    radios: [1000, 1500, 3000],
    radioDefecto: 1500,
    plazasDefecto: null,
    unidad: "hab_por_centro",
    imserso: null,
    referencia: null,
    nota: "Colegios e institutos públicos y concertados con Infantil, Primaria o ESO (1.620 centros). El grupo de 3 a 16 años es una estimación a partir de tramos quinquenales, y el motor no separa etapas: un chico de 14 años cuenta como atendido por un colegio de solo Primaria cercano.",
  },
  dea: {
    id: "dea",
    nombre: "Desfibrilador",
    sinonimos: ["desfibrilador", "desfibriladores", "dea"],
    grupo: "total",
    grupoEtiqueta: "habitantes",
    metrica: "distancia",
    radios: [300, 500, 1000],
    radioDefecto: 500,
    plazasDefecto: null,
    unidad: "hab_por_centro",
    imserso: null,
    referencia: null,
    nota: "Decreto 78/2017: obligación por tipo de local, no ratio por población. Algunos están en locales privados con horario. Se cuentan puntos con desfibrilador, no equipos: el registro tiene 13.680 equipos, pero 6 direcciones con más de 30 (3.135 equipos en total, 2.200 en una sola calle de Retiro) cuentan como un punto cada una; quedan 10.551 puntos.",
  },
};

export const SERVICIO_IDS = Object.keys(SERVICIOS) as ServicioId[];

export function esServicioId(x: unknown): x is ServicioId {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(SERVICIOS, x);
}

/** Valor numérico del umbral para un servicio con plazas, salvo `media` y `mediana`, que dependen de los datos. */
export function umbralFijo(id: ServicioId, modo: UmbralDeficit): number | null {
  if (typeof modo === "number") return modo;
  const im = SERVICIOS[id].imserso;
  if (modo === "imserso_espana") return im ? im.espana : null;
  if (modo === "imserso_madrid") return im ? im.madrid : null;
  return null;
}
