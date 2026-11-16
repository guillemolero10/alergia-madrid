// Tipos de los JSON que publica el pipeline (PLAN.md, sección 2, y docs/esquema/estado_actual.schema.json).
// Los umbrales se aplican solo en el pipeline: la web nunca recalcula un `nivel`, solo lo pinta.

export const NIVELES = ["sin_dato", "bajo", "medio", "alto"] as const;
export type Nivel = (typeof NIVELES)[number];

export type EstadoCapa = "ok" | "antiguo" | "error";
export type NombreCapa = "aire" | "polen" | "viento";

export interface Capa {
  /** Instante ISO con desfase (aire, viento) o fecha AAAA-MM-DD (polen). */
  ultimo_dato: string;
  fuente: string;
  estado: EstadoCapa;
}

export type Regla = "1h" | "media8h" | "media24h" | "diario";

export interface Observacion {
  /** `est:<8 cifras>`, `cap:<código>` o `mun:<INE>`. */
  lugar: string;
  /** `no2`, `o3`, `pm10`, `pm25` o `polen_<tipo>`. */
  variable: string;
  valor: number;
  unidad: string;
  hora: string;
  fuente: string;
  nivel: Nivel;
  regla?: Regla;
  /** El valor que se comparó con el umbral (p. ej. la media móvil). */
  valor_regla?: number | null;
  provisional?: boolean;
  /** Solo aire: 24 valores horarios, del más antiguo al más reciente; `null` si falta. */
  serie?: (number | null)[];
}

export interface Riesgo {
  lugar: string;
  nivel: Nivel;
  nivel_aire: Nivel;
  nivel_polen: Nivel;
  peor_variable: string | null;
  captador: string | null;
  polen_antiguedad_dias: number | null;
}

export interface Viento {
  lat: number;
  lon: number;
  velocidad_kmh: number;
  /** Dirección DE donde viene el viento (convención meteorológica), en grados. */
  direccion_grados: number;
}

export interface EstadoActual {
  version: 1;
  generado: string;
  modo: "tiempo_real" | "historico";
  fecha_referencia: string;
  capas: {
    aire: Capa;
    /** El esquema ya la exige, pero la web sigue funcionando si un JSON antiguo (o el respaldo) no la trae. */
    polen?: Capa;
    viento: Capa;
  };
  observaciones: Observacion[];
  riesgo: Riesgo[];
  viento: Viento[];
}

// --- datos-estaticos/lugares.json ---

export interface Estacion {
  id: string;
  nombre: string;
  municipio: string;
  lat: number;
  lon: number;
  tipo: string;
  mide: string[];
  captador: string | null;
  dist_captador_km: number | null;
}

export interface Captador {
  id: string;
  nombre: string;
  localidad: string;
  lat: number;
  lon: number;
  activo: boolean;
}

export interface Municipio {
  id: string;
  nombre: string;
  alias: string[];
  lat: number;
  lon: number;
  estacion: string;
  dist_estacion_km: number;
  captador: string | null;
  dist_captador_km: number | null;
  cobertura_aire: "buena" | "lejana";
}

export interface Lugares {
  estaciones: Estacion[];
  captadores: Captador[];
  municipios: Municipio[];
}

// --- estado de la interfaz ---

export type CapasVisibles = Record<NombreCapa, boolean>;

/** De dónde salieron los datos que se están pintando. */
export type OrigenDatos = "red" | "respaldo";
