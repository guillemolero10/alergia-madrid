// Tipos del motor de «¿Dónde hace falta?». Sin DOM ni `import.meta.env`: los comparten la web, el Web Worker
// del óptimo, la función `api/agente.ts` y el modo sin IA. Todo lo que cruza un `postMessage` o un JSON es
// serializable (objetos planos y arrays tipados).

export type ServicioId =
  | "centro_salud"
  | "hospital"
  | "residencia"
  | "farmacia"
  | "colegio"
  | "dea";

/** Clave de `Secciones.pob`: el grupo de personas al que se le cuenta el déficit. */
export type GrupoObjetivo = "total" | "65_mas" | "3_16";

export type Metrica = "distancia" | "plazas";

export type NivelTerritorio = "municipio" | "distrito" | "zona";

// ---------------------------------------------------------------- datos (JSON de public/donde/)
export interface Secciones {
  version: number;
  generado: string;
  anio_poblacion: number;
  ids: string[];
  /** `mun:28106` */
  mun: string[];
  /** `dis:2807901`; solo en la capital. */
  distrito: (string | null)[];
  /** `nuts4_codigo` (`04` = Sur Metropolitano). */
  zona: string[];
  lat: number[];
  lon: number[];
  area_km2: number[];
  pob: Record<"total" | "0_14" | "3_16" | "65_mas" | "75_mas", number[]>;
}

export interface Centros {
  version: number;
  servicio: string;
  generado: string;
  /** Nombre legible de la fuente (`Comunidad de Madrid, registro de centros…`). */
  fuente_nombre?: string;
  /** URL de la ficha del conjunto en el portal de la Comunidad, seguida de la licencia: «https://… (CC BY 4.0)». */
  fuente?: string;  ids: string[];
  /** `otros_sociales` no publica nombres: `validarCentros` rellena con cadenas vacías. */
  nombres: string[];
  /** Solo `dea`: equipos registrados en cada punto (más de 30 en el mismo punto se agrupan en un registro). */
  equipos?: number[];
  /** Municipio del polígono donde cae el punto. */
  mun: string[];
  lat: number[];
  lon: number[];
  /** Solo en servicios con plazas. `null` (el registro no la trae) cuenta como 0, igual que en Python. */
  plazas?: (number | null)[];
  titularidad?: (string | null)[];
  sector?: string[];
  tipo?: string[];
  /** `otros_sociales`: categoría del registro dentro del tipo (p. ej. «HOGARES Y CLUBES» o «CENTROS DE DÍA: OTROS»). */
  subtipo?: string[];
  descartados_sin_coordenadas?: number;
  plazas_descartadas_sin_coordenadas?: number;
  actualizado_fuente?: string;
}

export interface Municipio {
  id: string;
  nombre: string;
  zona: string;
  tramo: string;
  poblacion: number;
  lat: number;
  lon: number;
  /** [oeste, sur, este, norte] */
  bbox: [number, number, number, number];
}

export interface Distrito {
  id: string;
  nombre: string;
  poblacion: number;
  lat: number;
  lon: number;
  bbox: [number, number, number, number];
}

export interface Zona {
  codigo: string;
  nombre: string;
  alias: string[];
}

/** Contornos (Polygon o MultiPolygon, WGS84) disueltos a partir de las secciones. */
export interface ContornosGeo {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    properties: { id: string };
    geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
  }[];
}

export interface Territorios {
  version: number;
  generado: string;
  anio_poblacion: number;
  tramos_tamano: string[];
  municipios: Municipio[];
  distritos: Distrito[];
  zonas: Zona[];
  municipios_geo: ContornosGeo;
  distritos_geo: ContornosGeo;
}

/** Todo lo que carga `cargarDatosWeb` / `cargarDatosNode`. Los servicios no pedidos no están. */
export interface Datos {
  secciones: Secciones;
  territorios: Territorios;
  servicios: Partial<Record<ServicioId, Centros>>;
  otrosSociales?: Centros;
}

// ---------------------------------------------------------------- umbral de déficit (servicios con plazas)
/**
 * Con qué se compara `A_i` (plazas a menos de d0 por cada 100 personas del grupo) para decir que hay déficit:
 * - `media`: media de la Comunidad ponderada por el grupo objetivo (coincide con plazas totales / población objetivo).
 * - `mediana`: mediana de la Comunidad ponderada por el grupo objetivo.
 * - `imserso_espana` / `imserso_madrid`: cobertura publicada por el IMSERSO (31-dic-2024).
 * - un número: valor fijo en plazas por cada 100.
 */
export type UmbralDeficit = "media" | "mediana" | "imserso_espana" | "imserso_madrid" | number;

// ---------------------------------------------------------------- estado, simulación y óptimo
export interface EstadoServicio {
  servicio: ServicioId;
  metrica: Metrica;
  /** Radio del déficit (distancia) o d0 de la captación (plazas), en metros. */
  radio_m: number;
  grupo: GrupoObjetivo;
  /** Distancia al centro más cercano en metros (`Infinity` si no hay centros) o `A_i` (plazas por cada 100). */
  valor: Float64Array;
  /** 1 si la sección está en déficit. */
  deficit: Uint8Array;
  /** Distancia: el radio. Plazas: el valor con el que se compara `A_i` (fijo mientras se simula). */
  umbral: number;
  umbralModo: UmbralDeficit | null;
  /** Solo plazas: media de `A_i` ponderada por el grupo (plazas por cada 100). */
  media: number | null;
  /** Solo plazas: `r_j` de cada centro (plazas / grupo objetivo a menos de d0). */
  r: Float64Array | null;
  /** Solo plazas: suma de las plazas de los centros (null = 0). */
  plazasTotales: number | null;
  totalObjetivo: number;
  totalDeficit: number;
  /** Número de centros. */
  nCentros: number;
  centros: Centros;
  secciones: Secciones;
}

export interface ResultadoSimulacion {
  /**
   * Personas del grupo objetivo cuyas secciones pasan de déficit a sin déficit. Es la cifra principal de los servicios por
   * distancia; en los de plazas es secundaria (la principal es `reduce`).
   */
  ganan: number;
  /** Índices (en `Secciones`) de las secciones que ganan. */
  secciones: number[];
  /**
   * Solo plazas: N = plazas que faltan antes − después de abrir el centro, con el umbral fijo y la misma agregación que
   * `plazasQueFaltan`. Siempre N ≤ plazas del centro.
   */
  reduce?: number;
  /** Solo plazas: índices de las secciones donde faltan menos plazas que antes (las que se resaltan en el mapa). */
  seccionesMejoran?: number[];
  /** Solo plazas: plazas que faltan en la Comunidad antes y después. */
  faltanAntes?: number;
  faltanDespues?: number;
  /** Municipio de la sección más cercana al punto (el punto puede estar fuera de la Comunidad: ver `municipioEn`). */
  municipio: string | null;
  /** Distancia a esa sección, en metros. */
  distanciaSeccion_m: number;
  deficitAntes: number;
  deficitDespues: number;
  /** Solo plazas: `r_nuevo` y grupo objetivo a menos de d0 del punto. */
  rNuevo?: number;
  objetivoEnRadio?: number;
  /** Solo distancia: distancia media al centro más cercano de quienes viven a menos de `radio` del punto (ponderada por el grupo). */
  distancia_media_antes?: number;
  distancia_media_despues?: number;
}

export interface PuntoOptimo {
  lat: number;
  lon: number;
  seccion: string;
  /** Índice de la sección en `Secciones`. */
  indice: number;
  municipio: string;
  /** Distancia: personas que ganan acceso. Plazas: mayores en zonas que dejan de estar por debajo del umbral (secundaria). */
  ganan: number;
  acumulado: number;
  /** Solo plazas: N de este punto (plazas que faltan que se reducen) y la suma hasta él. */
  reduce?: number;
  reduceAcumulado?: number;
}

export interface ResultadoOptimo {
  puntos: PuntoOptimo[];
  deficitAntes: number;
  deficitDespues: number;
  /** Solo plazas: N total de los puntos elegidos y plazas que faltan antes y después. */
  reduce?: number;
  faltanAntes?: number;
  faltanDespues?: number;
  /** Secciones candidatas evaluadas. */
  candidatos: number;
}

// ---------------------------------------------------------------- agregados
export interface FilaRanking {
  lugar: string;
  nombre: string;
  /** Personas del grupo objetivo del territorio. */
  objetivo: number;
  en_deficit: number;
  /** % de `en_deficit` sobre `objetivo`, redondeado a 3 decimales. */
  pct: number;
  /** Plazas: media de `A_i` del territorio. Distancia: distancia media (m) al centro más cercano, ponderada por el grupo. */
  ratio: number | null;
  /** Mismo valor para toda la Comunidad. */
  media_comunidad: number | null;
  /** Solo plazas: plazas que faltan para que ninguna sección quede por debajo del umbral (ver `plazasQueFaltan`). */
  plazas_faltan?: number;
  /** Solo plazas: balance neto (negativo = sobran plazas). */
  plazas_balance?: number;
  /** Servicio por distancia con un centro dentro y secciones muy grandes (rural): el % a más del radio es aproximado. */
  aproximada?: true;
}

export type Comparacion = "por_debajo" | "en_la_media" | "por_encima";

export type UnidadRatio = "hab_por_centro" | "plazas_por_100";

export interface FilaFicha {
  id: ServicioId;
  /** Centros dentro del territorio. */
  n: number;
  /** Los que cuentan para el ratio (en centro de salud, sin consultorios). */
  n_ratio: number;
  /** Personas del grupo objetivo del servicio en el territorio (habitantes, mayores de 65 o 3 a 16 años). */
  objetivo: number;
  /** Plazas de los centros del territorio (solo servicios con plazas). */
  plazas?: number;
  unidad: UnidadRatio;
  /** `hab_por_centro` (grupo objetivo por centro; `null` si n = 0) o `plazas_por_100` (media de A_i). */
  ratio: number | null;
  media_comunidad: number | null;
  mediana_tramo: number | null;
  pct_deficit: number;
  personas_deficit: number;
  /** Frente a la mediana del tramo de tamaño (si hay) o, si no, frente a la media de la Comunidad. */
  comparacion: Comparacion;
  comparacion_comunidad: Comparacion;
  /** Brecha relativa (0 a 1) frente a la referencia usada en `comparacion`; 0 si no está por debajo. */
  brecha: number;
  /**
   * Servicios por distancia: el ratio sale por debajo (o no hay centro dentro del territorio) pero ningún vecino queda a más
   * del radio de uno, porque lo cubren los pueblos de al lado. En ese caso `comparacion` es «en_la_media» y no cuenta en `faltan`.
   */
  cubierto_desde_fuera: boolean;
  /** Hay un centro dentro del territorio pero sus secciones son muy grandes: el % a más del radio solo es aproximado. */
  aproximada?: true;
  /** Plazas: las que faltan para llegar al umbral en este territorio. */
  plazas_faltan?: number;
  referencia?: {
    texto: string;
    valor: number;
    unidad: UnidadRatio;
    url: string;
    /** `null` si no es comparable (n = 0 en hab/centro cuenta como no cumple). */
    cumple: boolean | null;
  };
}

export interface FichaLugar {
  lugar: string;
  nombre: string;
  nivel: NivelTerritorio;
  poblacion: number;
  servicios: FilaFicha[];
  /** Servicios por debajo, de mayor a menor brecha. */
  faltan: ServicioId[];
}

// ---------------------------------------------------------------- lugares
export type TipoLugar = "municipio" | "distrito" | "zona";

export interface LugarResuelto {
  tipo: TipoLugar;
  /** `mun:28106`, `dis:2807901` o `zona:04` (si la zona agrupa varias, la primera). */
  id: string;
  nombre: string;
  lat: number;
  lon: number;
  /** [oeste, sur, este, norte] */
  bbox: [number, number, number, number];
  /** Códigos de zona: una sola para `zona` simple, varias para «sierra» o «norte»; la zona del municipio si es municipio. */
  zonas: string[];
}

export interface Sugerencias {
  sugerencias: { tipo: TipoLugar; id: string; nombre: string }[];
}

// ---------------------------------------------------------------- contrato del agente (api/agente.ts y la web)
export type Accion =
  | { tipo: "elegir_servicio"; servicio: ServicioId; radio_m?: number; /** Año de la población con la que se calcularon las cifras (2025 = hoy, 2030 = proyección). */ anio?: 2025 | 2030 }
  | { tipo: "mover_mapa"; lat?: number; lon?: number; zoom?: number; bbox?: [number, number, number, number]; lugar?: string }
  | {
      tipo: "marcar_puntos";
      servicio: ServicioId;
      origen: "optimo" | "simulacion";
      /** `plazas`: solo en servicios con plazas; las del centro con las que se calculó. `reduce`: N (solo plazas), la cifra principal. */
      puntos: { lat: number; lon: number; etiqueta: string; ganan: number; plazas?: number; reduce?: number }[];
    }
  | { tipo: "mostrar_ranking"; servicio: ServicioId; zona?: string; nivel: NivelTerritorio; filas: FilaRanking[] }
  | { tipo: "abrir_ficha"; lugar: string };

export interface MensajeAgente {
  rol: "usuario" | "asistente";
  texto: string;
}

export interface ContextoAgente {
  vista: "donde" | "municipio";
  servicio: ServicioId | null;
  radio_m: number | null;
  lugar: string | null;
  /** Lo que se ve en el simulador (la función `/api/agente` los usa para calcular con lo mismo que el usuario). Opcionales: sin ellos, 2025 y la referencia por defecto. */
  anio?: 2025 | 2030;
  /** Referencia de plazas elegida en el panel (solo cuenta en los servicios con plazas). */
  referencia?: "media" | "imserso_espana" | "imserso_madrid";
  /** Zonas estadísticas filtradas en el panel (`04`, o `06,10,11`), o null. */
  zona?: string | null;
}

export interface PeticionAgente {
  mensajes: MensajeAgente[];
  contexto: ContextoAgente;
}

export interface PasoAgente {
  herramienta: string;
  entrada: Record<string, unknown>;
  resumen: string;
}

export interface RespuestaAgente {
  texto: string;
  acciones: Accion[];
  pasos: PasoAgente[];
  modo: "ia" | "reglas";
  restantes: number | null;
  /** Preguntas con IA por visitante y día que admite el servidor (`AGENTE_LIMITE_IP_DIA`). Solo en respuestas del servidor. */
  limite?: number;
  /** Solo con `modo: "reglas"` desde el servidor: el texto del modelo se ha descartado por seguridad (cifra o enlace que no salen del cálculo) y se da la respuesta calculada. */
  motivo?: "revisada";
}
