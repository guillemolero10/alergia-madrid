import { formatearKm } from "./formato";
import { esPolen, nivelMaximo, ordenDeNivel } from "./riesgo";
import type { Captador, EstadoActual, Estacion, Lugares, Municipio, Nivel, Observacion } from "./tipos";

// Modelo de lo que enseña `PanelLugar`. Se calcula aquí, sin React, para poder probarlo.

export type TipoLugar = "estacion" | "captador" | "municipio";

export interface AvisoFicha {
  clave: "cobertura_lejana" | "polen_antiguo" | "polen_sin_capa" | "captador_inactivo" | "sin_observaciones";
  texto: string;
}

export interface FichaLugar {
  id: string;
  tipo: TipoLugar;
  nombre: string;
  subtitulo: string;
  lat: number;
  lon: number;
  nivel: Nivel;
  nivelAire: Nivel;
  nivelPolen: Nivel;
  peorVariable: string | null;
  /** Estación de la que sale el aire (la propia o, en un municipio, la más cercana). */
  estacion: { id: string; nombre: string; distKm: number } | null;
  variablesAire: Observacion[];
  captador: {
    id: string;
    nombre: string;
    distKm: number | null;
    activo: boolean;
    ultimoDato: string | null;
    antiguedadDias: number | null;
  } | null;
  /** Polen del captador: primero lo que más riesgo da, sin los tipos a cero. */
  polen: Observacion[];
  /** Tipos de polen medidos con valor 0 (se resumen en una línea). */
  polenACero: number;
  hayProvisionales: boolean;
  avisos: AvisoFicha[];
}

const ORDEN_AIRE = ["no2", "o3", "pm10", "pm25"];

const TIPOS_ESTACION: Record<string, string> = {
  trafico: "Estación de tráfico",
  fondo: "Estación de fondo",
  industrial: "Estación industrial",
};

function airePorEstacion(estado: EstadoActual, idEstacion: string): Observacion[] {
  return estado.observaciones
    .filter((o) => o.lugar === idEstacion && !esPolen(o.variable))
    .sort((a, b) => posicion(a.variable) - posicion(b.variable));
}

function posicion(variable: string): number {
  const i = ORDEN_AIRE.indexOf(variable);
  return i === -1 ? ORDEN_AIRE.length : i;
}

function polenPorCaptador(estado: EstadoActual, idCaptador: string): Observacion[] {
  return estado.observaciones
    .filter((o) => o.lugar === idCaptador && esPolen(o.variable))
    .sort((a, b) => ordenDeNivel(b.nivel) - ordenDeNivel(a.nivel) || b.valor - a.valor);
}

function ultimaFecha(observaciones: Observacion[]): string | null {
  let ultima: string | null = null;
  for (const o of observaciones) if (o.hora && (!ultima || o.hora > ultima)) ultima = o.hora;
  return ultima;
}

const DIA_MS = 86_400_000;

/**
 * Días desde el último dato de polen del captador. Usa el que calcula el pipeline en `riesgo[]`;
 * si ninguna estación tiene emparejado ese captador, lo deduce de sus observaciones.
 */
export function antiguedadPolenDias(estado: EstadoActual, idCaptador: string, polen: Observacion[]): number | null {
  const delPipeline = estado.riesgo.find((r) => r.captador === idCaptador)?.polen_antiguedad_dias;
  if (delPipeline != null) return delPipeline;
  const ultima = ultimaFecha(polen);
  if (!ultima) return null;
  const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const dias = Math.round((dia(estado.fecha_referencia) - dia(ultima)) / DIA_MS);
  return Number.isFinite(dias) ? Math.max(0, dias) : null;
}

/** Nivel de polen de un captador: el máximo de sus tipos, y solo si el dato tiene 7 días o menos. */
function nivelPolenDe(estado: EstadoActual, captador: FichaLugar["captador"], polenTodo: Observacion[]): Nivel {
  if (!estado.capas.polen || !captador || !captador.activo) return "sin_dato";
  if (captador.antiguedadDias != null && captador.antiguedadDias > 7) return "sin_dato";
  return nivelMaximo(polenTodo.map((o) => o.nivel));
}

function datosCaptador(
  estado: EstadoActual,
  lugares: Lugares,
  idCaptador: string | null,
  distKm: number | null,
): { captador: FichaLugar["captador"]; polenTodo: Observacion[] } {
  const info = idCaptador ? lugares.captadores.find((c) => c.id === idCaptador) : undefined;
  if (!info) return { captador: null, polenTodo: [] };
  const polenTodo = polenPorCaptador(estado, info.id);
  return {
    captador: {
      id: info.id,
      nombre: info.nombre,
      distKm,
      activo: info.activo,
      ultimoDato: ultimaFecha(polenTodo),
      antiguedadDias: antiguedadPolenDias(estado, info.id, polenTodo),
    },
    polenTodo,
  };
}

function avisosDePolen(estado: EstadoActual, captador: FichaLugar["captador"], polenTodo: Observacion[]): AvisoFicha[] {
  const avisos: AvisoFicha[] = [];
  if (!estado.capas.polen) {
    avisos.push({ clave: "polen_sin_capa", texto: "La capa de polen todavía no está publicada: el riesgo solo tiene en cuenta el aire." });
    return avisos;
  }
  if (captador && !captador.activo) {
    avisos.push({ clave: "captador_inactivo", texto: `El captador de ${captador.nombre} no tiene datos este año.` });
  } else if (captador?.antiguedadDias != null && captador.antiguedadDias > 7) {
    avisos.push({
      clave: "polen_antiguo",
      texto: `El último dato de polen es de hace ${captador.antiguedadDias} días: con más de 7 días no cuenta en el riesgo.`,
    });
  } else if (captador && polenTodo.length === 0) {
    avisos.push({ clave: "sin_observaciones", texto: "No hay mediciones recientes de polen en este captador." });
  }
  return avisos;
}

function fichaDeEstacion(estacion: Estacion, estado: EstadoActual, lugares: Lugares): FichaLugar {
  const riesgo = estado.riesgo.find((r) => r.lugar === estacion.id);
  const variablesAire = airePorEstacion(estado, estacion.id);
  const idCaptador = riesgo?.captador ?? estacion.captador;
  const distKm = idCaptador === estacion.captador ? estacion.dist_captador_km : null;
  const { captador, polenTodo } = datosCaptador(estado, lugares, idCaptador, distKm);
  const polen = polenTodo.filter((o) => o.valor > 0);
  return {
    id: estacion.id,
    tipo: "estacion",
    nombre: estacion.nombre,
    subtitulo: TIPOS_ESTACION[estacion.tipo] ?? "Estación de calidad del aire",
    lat: estacion.lat,
    lon: estacion.lon,
    nivel: riesgo?.nivel ?? "sin_dato",
    nivelAire: riesgo?.nivel_aire ?? "sin_dato",
    nivelPolen: riesgo?.nivel_polen ?? "sin_dato",
    peorVariable: riesgo?.peor_variable ?? null,
    estacion: { id: estacion.id, nombre: estacion.nombre, distKm: 0 },
    variablesAire,
    captador,
    polen,
    polenACero: polenTodo.length - polen.length,
    hayProvisionales: variablesAire.some((o) => o.provisional === true),
    avisos: avisosDePolen(estado, captador, polenTodo),
  };
}

/**
 * Municipio sin estación propia: el aire es el de la estación más cercana y el polen, el de SU captador
 * (que puede no ser el de esa estación). El nivel es el máximo de niveles que ya calculó el pipeline.
 */
function fichaDeMunicipio(municipio: Municipio, estado: EstadoActual, lugares: Lugares): FichaLugar | null {
  const estacion = lugares.estaciones.find((e) => e.id === municipio.estacion);
  if (!estacion) return null;
  const riesgo = estado.riesgo.find((r) => r.lugar === estacion.id);
  const variablesAire = airePorEstacion(estado, estacion.id);
  const { captador, polenTodo } = datosCaptador(estado, lugares, municipio.captador, municipio.dist_captador_km);
  const polen = polenTodo.filter((o) => o.valor > 0);
  const nivelAire = riesgo?.nivel_aire ?? "sin_dato";
  const nivelPolen = nivelPolenDe(estado, captador, polenTodo);
  const avisos = avisosDePolen(estado, captador, polenTodo);
  if (municipio.cobertura_aire === "lejana") {
    avisos.unshift({
      clave: "cobertura_lejana",
      texto: `${municipio.nombre} no tiene estación de la red de la Comunidad de Madrid. Se muestra el aire de la más cercana, ${estacion.nombre}, a ${formatearKm(municipio.dist_estacion_km)}: tómalo como orientativo.`,
    });
  }
  return {
    id: municipio.id,
    tipo: "municipio",
    nombre: municipio.nombre,
    subtitulo: "Municipio sin estación propia",
    lat: municipio.lat,
    lon: municipio.lon,
    nivel: nivelMaximo([nivelAire, nivelPolen]),
    nivelAire,
    nivelPolen,
    peorVariable: riesgo?.peor_variable ?? null,
    estacion: { id: estacion.id, nombre: estacion.nombre, distKm: municipio.dist_estacion_km },
    variablesAire,
    captador,
    polen,
    polenACero: polenTodo.length - polen.length,
    hayProvisionales: variablesAire.some((o) => o.provisional === true),
    avisos,
  };
}

function fichaDeCaptador(captador: Captador, estado: EstadoActual, lugares: Lugares): FichaLugar {
  const datos = datosCaptador(estado, lugares, captador.id, 0);
  const polen = datos.polenTodo.filter((o) => o.valor > 0);
  const nivelPolen = nivelPolenDe(estado, datos.captador, datos.polenTodo);
  const primero = datos.polenTodo[0];
  return {
    id: captador.id,
    tipo: "captador",
    nombre: captador.nombre,
    subtitulo: `Captador de polen · ${captador.localidad}`,
    lat: captador.lat,
    lon: captador.lon,
    nivel: nivelPolen,
    nivelAire: "sin_dato",
    nivelPolen,
    peorVariable: primero && ordenDeNivel(primero.nivel) > 1 ? primero.variable : null,
    estacion: null,
    variablesAire: [],
    captador: datos.captador,
    polen,
    polenACero: datos.polenTodo.length - polen.length,
    hayProvisionales: false,
    avisos: avisosDePolen(estado, datos.captador, datos.polenTodo),
  };
}

/** Nivel con el que se pinta un captador en el mapa. */
export function nivelDeCaptador(captador: Captador, estado: EstadoActual, lugares: Lugares): Nivel {
  const datos = datosCaptador(estado, lugares, captador.id, 0);
  return nivelPolenDe(estado, datos.captador, datos.polenTodo);
}

/** Nivel con el que se pinta en el mapa un municipio sin estación propia. */
export function nivelDeMunicipio(
  municipio: Municipio,
  estado: EstadoActual,
  lugares: Lugares,
): { nivel: Nivel; nivel_aire: Nivel; nivel_polen: Nivel } {
  const ficha = fichaDeMunicipio(municipio, estado, lugares);
  return {
    nivel: ficha?.nivel ?? "sin_dato",
    nivel_aire: ficha?.nivelAire ?? "sin_dato",
    nivel_polen: ficha?.nivelPolen ?? "sin_dato",
  };
}

/** Construye la ficha de un lugar (`est:`, `cap:` o `mun:`). `null` si el identificador no existe. */
export function construirFicha(id: string, estado: EstadoActual, lugares: Lugares): FichaLugar | null {
  if (id.startsWith("est:")) {
    const estacion = lugares.estaciones.find((e) => e.id === id);
    return estacion ? fichaDeEstacion(estacion, estado, lugares) : null;
  }
  if (id.startsWith("mun:")) {
    const municipio = lugares.municipios.find((m) => m.id === id);
    return municipio ? fichaDeMunicipio(municipio, estado, lugares) : null;
  }
  if (id.startsWith("cap:")) {
    const captador = lugares.captadores.find((c) => c.id === id);
    return captador ? fichaDeCaptador(captador, estado, lugares) : null;
  }
  return null;
}

/** Municipios que no tienen estación propia (hoy, Madrid capital): se pintan con un marcador aparte. */
export function municipiosSinEstacion(lugares: Lugares): Municipio[] {
  return lugares.municipios.filter((m) => m.dist_estacion_km > 0);
}
