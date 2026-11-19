import lugaresJson from "../../datos-estaticos/lugares.json";
import { esNivel } from "./riesgo";
import type {
  Capa,
  EstadoActual,
  EstadoCapa,
  Lugares,
  NombreCapa,
  Observacion,
  OrigenDatos,
  Pronostico,
  Riesgo,
  ZonaPronostico,
  Viento,
} from "./tipos";

/** JSON que publica el workflow en la rama `datos` (CORS abierto, caché de 5 min). */
export const URL_ESTADO = "https://raw.githubusercontent.com/guillemolero10/donde-hace-falta/datos/estado_actual.json";
/** Copia empaquetada con la web por si falla la red o el JSON no valida. */
export const URL_RESPALDO = `${import.meta.env.BASE_URL}respaldo/estado_actual.json`;

const TIEMPO_MAX_MS = 8000;

/** Lugares estáticos (estaciones, captadores y municipios): van empaquetados, no dependen de la red. */
export const lugares = lugaresJson as unknown as Lugares;

export class EstadoInvalido extends Error {
  constructor(motivo: string) {
    super(`estado_actual.json no válido: ${motivo}`);
    this.name = "EstadoInvalido";
  }
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function esNumero(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function esFechaLegible(v: unknown): v is string {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

const ESTADOS_CAPA: readonly string[] = ["ok", "antiguo", "error"];

function leerCapa(v: unknown): Capa | null {
  if (!esObjeto(v)) return null;
  if (!esFechaLegible(v.ultimo_dato)) return null;
  if (typeof v.estado !== "string" || !ESTADOS_CAPA.includes(v.estado)) return null;
  return {
    ultimo_dato: v.ultimo_dato,
    fuente: typeof v.fuente === "string" ? v.fuente : "",
    estado: v.estado as EstadoCapa,
  };
}

function leerObservacion(v: unknown): Observacion | null {
  if (!esObjeto(v)) return null;
  if (typeof v.lugar !== "string" || typeof v.variable !== "string" || !esNumero(v.valor)) return null;
  const obs: Observacion = {
    lugar: v.lugar,
    variable: v.variable,
    valor: v.valor,
    unidad: typeof v.unidad === "string" ? v.unidad : "",
    hora: typeof v.hora === "string" ? v.hora : "",
    fuente: typeof v.fuente === "string" ? v.fuente : "",
    nivel: esNivel(v.nivel) ? v.nivel : "sin_dato",
  };
  if (v.regla === "1h" || v.regla === "media8h" || v.regla === "media24h" || v.regla === "diario") obs.regla = v.regla;
  if (esNumero(v.valor_regla)) obs.valor_regla = v.valor_regla;
  if (typeof v.provisional === "boolean") obs.provisional = v.provisional;
  if (Array.isArray(v.serie)) obs.serie = v.serie.map((x) => (esNumero(x) ? x : null));
  return obs;
}

function leerRiesgo(v: unknown): Riesgo | null {
  if (!esObjeto(v) || typeof v.lugar !== "string") return null;
  return {
    lugar: v.lugar,
    nivel: esNivel(v.nivel) ? v.nivel : "sin_dato",
    nivel_aire: esNivel(v.nivel_aire) ? v.nivel_aire : "sin_dato",
    nivel_polen: esNivel(v.nivel_polen) ? v.nivel_polen : "sin_dato",
    peor_variable: typeof v.peor_variable === "string" ? v.peor_variable : null,
    captador: typeof v.captador === "string" ? v.captador : null,
    polen_antiguedad_dias: esNumero(v.polen_antiguedad_dias) ? v.polen_antiguedad_dias : null,
  };
}

function leerViento(v: unknown): Viento | null {
  if (!esObjeto(v)) return null;
  if (!esNumero(v.lat) || !esNumero(v.lon) || !esNumero(v.velocidad_kmh) || !esNumero(v.direccion_grados)) return null;
  return { lat: v.lat, lon: v.lon, velocidad_kmh: v.velocidad_kmh, direccion_grados: v.direccion_grados };
}

function limpiar<T>(lista: unknown[], leer: (v: unknown) => T | null): T[] {
  const salida: T[] = [];
  for (const elemento of lista) {
    const leido = leer(elemento);
    if (leido) salida.push(leido);
  }
  return salida;
}

/**
 * Comprueba «lo básico» y devuelve el estado normalizado. Lanza `EstadoInvalido` si el JSON no sirve para
 * pintar el mapa. Es tolerante con lo opcional: la capa `polen` puede faltar (o venir rota: se descarta),
 * y los elementos sueltos mal formados se ignoran en lugar de tumbar toda la carga.
 */
export function validarEstado(json: unknown): EstadoActual {
  if (!esObjeto(json)) throw new EstadoInvalido("no es un objeto");
  if (json.version !== 1) throw new EstadoInvalido(`versión desconocida (${String(json.version)})`);
  if (!esFechaLegible(json.generado)) throw new EstadoInvalido("falta `generado`");
  if (json.modo !== "tiempo_real" && json.modo !== "historico") throw new EstadoInvalido("`modo` desconocido");
  if (!esObjeto(json.capas)) throw new EstadoInvalido("falta `capas`");

  const aire = leerCapa(json.capas.aire);
  const viento = leerCapa(json.capas.viento);
  if (!aire) throw new EstadoInvalido("falta la capa `aire`");
  if (!viento) throw new EstadoInvalido("falta la capa `viento`");
  const polen = leerCapa(json.capas.polen);

  if (!Array.isArray(json.observaciones)) throw new EstadoInvalido("falta `observaciones`");
  if (!Array.isArray(json.riesgo)) throw new EstadoInvalido("falta `riesgo`");
  if (!Array.isArray(json.viento)) throw new EstadoInvalido("falta `viento`");

  const riesgo = limpiar(json.riesgo, leerRiesgo);
  if (riesgo.length === 0) throw new EstadoInvalido("`riesgo` está vacío");

  return {
    version: 1,
    generado: json.generado,
    modo: json.modo,
    fecha_referencia: esFechaLegible(json.fecha_referencia) ? json.fecha_referencia : json.generado,
    capas: polen ? { aire, polen, viento } : { aire, viento },
    observaciones: limpiar(json.observaciones, leerObservacion),
    riesgo,
    viento: limpiar(json.viento, leerViento),
  };
}

export interface ResultadoCarga {
  estado: EstadoActual;
  origen: OrigenDatos;
  /** Por qué no se pudo usar la red (solo cuando `origen` es `respaldo`). */
  motivo?: string;
}

export interface OpcionesCarga {
  /** Inyectable para las pruebas. */
  fetch?: typeof globalThis.fetch;
  urlRed?: string;
  urlRespaldo?: string;
  tiempoMaxMs?: number;
}

async function pedirJson(url: string, pedir: typeof globalThis.fetch, tiempoMaxMs: number): Promise<unknown> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), tiempoMaxMs);
  try {
    const respuesta = await pedir(url, { signal: control.signal, headers: { accept: "application/json" } });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {
    clearTimeout(temporizador);
  }
}

function textoError(e: unknown): string {
  if (e instanceof Error) return e.name === "AbortError" ? "tiempo de espera agotado" : e.message;
  return String(e);
}

/**
 * Lee el estado publicado y, si la red falla o el JSON no valida lo básico, la copia de respaldo.
 * Solo lanza si tampoco el respaldo sirve.
 */
export async function cargarEstado(opciones: OpcionesCarga = {}): Promise<ResultadoCarga> {
  const pedir = opciones.fetch ?? globalThis.fetch;
  const urlRed = opciones.urlRed ?? URL_ESTADO;
  const urlRespaldo = opciones.urlRespaldo ?? URL_RESPALDO;
  const tiempoMaxMs = opciones.tiempoMaxMs ?? TIEMPO_MAX_MS;

  let motivo: string;
  try {
    return { estado: validarEstado(await pedirJson(urlRed, pedir, tiempoMaxMs)), origen: "red" };
  } catch (e) {
    motivo = textoError(e);
  }

  try {
    return { estado: validarEstado(await pedirJson(urlRespaldo, pedir, tiempoMaxMs)), origen: "respaldo", motivo };
  } catch (e) {
    throw new Error(`No se pudieron cargar los datos (red: ${motivo}; respaldo: ${textoError(e)})`);
  }
}

// --- sello de cada capa: último dato y avisos ---

const HORA_MS = 3_600_000;
const DIA_MS = 24 * HORA_MS;

/** Plazos del PLAN.md (sección 3): aire más de 3 h, viento más de 2 h y polen más de 7 días se consideran antiguos. */
export const PLAZO_CAPA_MS: Record<NombreCapa, number> = {
  aire: 3 * HORA_MS,
  viento: 2 * HORA_MS,
  polen: 7 * DIA_MS,
};

export interface SelloCapa {
  nombre: NombreCapa;
  /** `false` si el JSON no trae la capa (un `estado_actual.json` anterior a la capa de polen). */
  disponible: boolean;
  ultimoDato: string | null;
  estado: EstadoCapa | "ausente";
  /** Texto del aviso ámbar; `null` si la capa está al día. */
  aviso: string | null;
}

/**
 * Reloj contra el que se mide la antigüedad. En tiempo real y con datos de la red es «ahora».
 * Una foto histórica o el respaldo se miden contra sí mismos: ya van rotulados con su fecha.
 */
export function relojDeReferencia(estado: EstadoActual, origen: OrigenDatos, ahora: Date): Date {
  if (estado.modo === "historico") return new Date(estado.fecha_referencia);
  if (origen === "respaldo") return new Date(estado.generado);
  return ahora;
}

function instanteDe(ultimoDato: string): number {
  // Las fechas sin hora (polen) cuentan hasta el final de ese día.
  return /^\d{4}-\d{2}-\d{2}$/.test(ultimoDato) ? Date.parse(`${ultimoDato}T23:59:59`) : Date.parse(ultimoDato);
}

function textoAntiguedad(ms: number): string {
  if (ms >= 2 * DIA_MS) return `${Math.floor(ms / DIA_MS)} días`;
  const horas = Math.max(1, Math.floor(ms / HORA_MS));
  return horas === 1 ? "1 hora" : `${horas} horas`;
}

export function selloDeCapa(
  nombre: NombreCapa,
  estado: EstadoActual,
  origen: OrigenDatos,
  ahora: Date,
): SelloCapa {
  const capa = estado.capas[nombre];
  if (!capa) return { nombre, disponible: false, ultimoDato: null, estado: "ausente", aviso: null };

  let aviso: string | null = null;
  // Una foto histórica no se queda «sin actualizar»: está rotulada con su fecha.
  if (estado.modo === "historico") return { nombre, disponible: true, ultimoDato: capa.ultimo_dato, estado: capa.estado, aviso: null };
  if (capa.estado === "error") aviso = "La fuente no responde: se conserva el último dato";
  else if (capa.estado === "antiguo") aviso = "Dato antiguo: la fuente no se ha actualizado";
  else {
    const edad = relojDeReferencia(estado, origen, ahora).getTime() - instanteDe(capa.ultimo_dato);
    if (edad > PLAZO_CAPA_MS[nombre]) aviso = `Sin actualizar desde hace ${textoAntiguedad(edad)}`;
  }
  return { nombre, disponible: true, ultimoDato: capa.ultimo_dato, estado: capa.estado, aviso };
}

export function sellosDeCapas(estado: EstadoActual, origen: OrigenDatos, ahora: Date): Record<NombreCapa, SelloCapa> {
  return {
    aire: selloDeCapa("aire", estado, origen, ahora),
    polen: selloDeCapa("polen", estado, origen, ahora),
    viento: selloDeCapa("viento", estado, origen, ahora),
  };
}

/** El viento caduca rápido: con más de 2 h las flechas se ocultan en lugar de enseñar una dirección vieja. */
export function vientoVigente(estado: EstadoActual, origen: OrigenDatos, ahora: Date): boolean {
  if (estado.viento.length === 0) return false;
  const edad = relojDeReferencia(estado, origen, ahora).getTime() - instanteDe(estado.capas.viento.ultimo_dato);
  return edad <= PLAZO_CAPA_MS.viento;
}

// --- pronóstico de 48 h ---

export const URL_PRONOSTICO = "https://raw.githubusercontent.com/guillemolero10/donde-hace-falta/datos/pronostico.json";
export const URL_RESPALDO_PRONOSTICO = `${import.meta.env.BASE_URL}respaldo/pronostico.json`;
/** Con más de 3 h el pronóstico se considera antiguo (el cron lo renueva cada hora). */
export const PLAZO_PRONOSTICO_MS = 3 * HORA_MS;

export class PronosticoInvalido extends Error {
  constructor(motivo: string) {
    super(`pronostico.json no válido: ${motivo}`);
    this.name = "PronosticoInvalido";
  }
}

function leerSerie<T>(v: unknown, n: number, leer: (x: unknown) => T): T[] | null {
  return Array.isArray(v) && v.length === n ? v.map(leer) : null;
}

function leerZona(v: unknown, n: number): ZonaPronostico | null {
  if (!esObjeto(v) || typeof v.lugar !== "string" || !esObjeto(v.valores) || !esObjeto(v.niveles)) return null;
  const valores: ZonaPronostico["valores"] = {};
  for (const [clave, serie] of Object.entries(v.valores)) {
    const s = leerSerie(serie, n, (x) => (esNumero(x) ? x : null));
    if (s) valores[clave] = s;
  }
  const niveles: ZonaPronostico["niveles"] = {};
  for (const [clave, serie] of Object.entries(v.niveles)) {
    const s = leerSerie(serie, n, (x) => (esNumero(x) && x >= 0 && x <= 3 ? Math.round(x) : 0));
    if (s) niveles[clave] = s;
  }
  return { lugar: v.lugar, valores, niveles };
}

/** Comprueba lo básico del pronóstico; descarta las zonas mal formadas y lanza si no queda ninguna utilizable. */
export function validarPronostico(json: unknown): Pronostico {
  if (!esObjeto(json)) throw new PronosticoInvalido("no es un objeto");
  if (json.version !== 1) throw new PronosticoInvalido(`versión desconocida (${String(json.version)})`);
  if (!esFechaLegible(json.generado)) throw new PronosticoInvalido("falta `generado`");
  if (!Array.isArray(json.horas) || json.horas.length === 0 || !json.horas.every(esFechaLegible)) {
    throw new PronosticoInvalido("`horas` no es válido");
  }
  if (!Array.isArray(json.zonas)) throw new PronosticoInvalido("faltan las zonas");
  const horas = json.horas as string[];
  const zonas = limpiar(json.zonas, (z) => leerZona(z, horas.length));
  if (zonas.length === 0) throw new PronosticoInvalido("no hay zonas utilizables");
  const fuentes = esObjeto(json.fuentes) ? json.fuentes : {};
  return {
    version: 1,
    generado: json.generado,
    fuentes: {
      meteo: typeof fuentes.meteo === "string" ? fuentes.meteo : "",
      aire_polen: typeof fuentes.aire_polen === "string" ? fuentes.aire_polen : "",
    },
    horas,
    unidades: esObjeto(json.unidades)
      ? Object.fromEntries(Object.entries(json.unidades).filter(([, u]) => typeof u === "string")) as Record<string, string>
      : {},
    sin_pronostico: Array.isArray(json.sin_pronostico) ? json.sin_pronostico.filter((x): x is string => typeof x === "string") : [],
    zonas,
  };
}

export function pronosticoAntiguo(p: Pronostico, ahora: Date): boolean {
  return ahora.getTime() - Date.parse(p.generado) > PLAZO_PRONOSTICO_MS;
}

export interface ResultadoPronostico {
  pronostico: Pronostico;
  origen: OrigenDatos;
  /** Por qué no se usó la red, o por qué el dato es viejo. */
  motivo?: string;
}

export interface OpcionesPronostico extends OpcionesCarga {
  ahora?: Date;
}

/**
 * Lee el pronóstico publicado. Si falla la red o tiene más de 3 h, mira la copia empaquetada y se queda con la
 * más reciente de las dos. Solo lanza si no hay ninguna utilizable.
 */
export async function cargarPronostico(opciones: OpcionesPronostico = {}): Promise<ResultadoPronostico> {
  const pedir = opciones.fetch ?? globalThis.fetch;
  const urlRed = opciones.urlRed ?? URL_PRONOSTICO;
  const urlRespaldo = opciones.urlRespaldo ?? URL_RESPALDO_PRONOSTICO;
  const tiempoMaxMs = opciones.tiempoMaxMs ?? TIEMPO_MAX_MS;
  const ahora = opciones.ahora ?? new Date();

  let motivo: string;
  let deRed: Pronostico | null = null;
  try {
    deRed = validarPronostico(await pedirJson(urlRed, pedir, tiempoMaxMs));
    if (!pronosticoAntiguo(deRed, ahora)) return { pronostico: deRed, origen: "red" };
    motivo = "la última actualización tiene más de 3 horas";
  } catch (e) {
    motivo = textoError(e);
  }

  try {
    const copia = validarPronostico(await pedirJson(urlRespaldo, pedir, tiempoMaxMs));
    if (deRed && Date.parse(deRed.generado) >= Date.parse(copia.generado)) return { pronostico: deRed, origen: "red", motivo };
    return { pronostico: copia, origen: "respaldo", motivo };
  } catch (e) {
    if (deRed) return { pronostico: deRed, origen: "red", motivo };
    throw new Error(`No se pudo cargar el pronóstico (red: ${motivo}; respaldo: ${textoError(e)})`);
  }
}
