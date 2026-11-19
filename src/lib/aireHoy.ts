// «El aire hoy» de la ficha de «Mi municipio»: lógica pura (sin React ni red).
//
// Para un municipio o distrito elige la estación de la Comunidad que le corresponde, mira lo medido y la previsión de 24 h
// y devuelve todo lo que pinta el bloque: veredicto para la población general, hora del dato, franja y avisos.
//
// Sobre la hora del dato: `observaciones[].hora` y `capas.aire.ultimo_dato` son el FINAL de la hora medida (el `hNN` de
// `calidad_aire_datos_dia` marca el final de la hora; se comprobó con el CSV real: a las 19:20 UTC ya traía `h19` y no `h20`).
// Por eso el texto dice «hasta las 15:00» (la medida es la de 14:00 a 15:00), no «a las 15:00».
import { distanciaKm } from "./perfil";
import { evaluarLugar, type EvaluacionLugar } from "./evaluar";
import { formatearUltimoDato } from "./formato";
import { VARIABLES_AIRE, type HoraPronostico, type Ventana } from "./franja";
import { nombreVariable } from "./riesgo";
import { PLAZO_CAPA_MS, pronosticoAntiguo } from "./datos";
import type { EstadoActual, Estacion, Lugares, Nivel, OrigenDatos, Pronostico } from "./tipos";

/** Como en `lugares.json`: hasta 4,73 km es cobertura «buena» y desde 5,23 km «lejana». */
export const UMBRAL_LEJANA_KM = 5;
/** Barras que enseña la franja del bloque. */
export const HORAS_FRANJA = 24;
/** Con menos barras por delante que estas no merece la pena dibujar la franja. */
export const MIN_HORAS_FRANJA = 6;

const HORA_MS = 3_600_000;

export interface FuenteAire {
  estacion: Estacion;
  /** Distancia del punto del lugar a la estación (0 si la estación está en el propio municipio). */
  km: number;
  lejana: boolean;
  /** Madrid capital o uno de sus distritos: su red de calidad del aire es la del Ayuntamiento y no está en estos datos. */
  capital: boolean;
}

/** Datos mínimos de un lugar (los de `territorios`). */
export interface LugarMinimo {
  id: string;
  nombre: string;
  lat: number;
  lon: number;
}

export const ID_MADRID = "mun:28079";

/**
 * Estación de aire del lugar. Municipios: la de `lugares.json` (la misma que usaba «¿Salimos?»). Distritos de la capital: la estación
 * de la Comunidad más cercana a su centro, porque la capital no tiene ninguna propia.
 */
export function fuenteAireDe(lugar: LugarMinimo, lugares: Pick<Lugares, "estaciones" | "municipios">): FuenteAire | null {
  const capital = lugar.id === ID_MADRID || lugar.id.startsWith("dis:");
  if (lugar.id.startsWith("mun:")) {
    const m = lugares.municipios.find((x) => x.id === lugar.id);
    const est = m && lugares.estaciones.find((e) => e.id === m.estacion);
    if (m && est) return { estacion: est, km: m.dist_estacion_km, lejana: m.cobertura_aire === "lejana", capital };
  }
  let mejor: FuenteAire | null = null;
  for (const e of lugares.estaciones) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon) || !e.mide.some((v) => (VARIABLES_AIRE as readonly string[]).includes(v))) continue;
    const km = distanciaKm(lugar.lat, lugar.lon, e.lat, e.lon);
    if (!mejor || km < mejor.km) mejor = { estacion: e, km, lejana: km > UMBRAL_LEJANA_KM, capital };
  }
  return mejor ? { ...mejor, km: Math.round(mejor.km * 10) / 10 } : null;
}

export type TipoAviso = "antiguo" | "respaldo" | "previsionAntigua" | "cobertura";

export interface AvisoAire {
  tipo: TipoAviso;
  texto: string;
}

export interface MedidaAire {
  variable: string;
  corto: string;
  valor: number;
  unidad: string;
  nivel: Nivel;
}

export interface VistaAire {
  lugar: string;
  fuente: FuenteAire;
  /** Última medición de cada contaminante en la estación (la más reciente de cada uno). */
  medidas: MedidaAire[];
  /** Final de la última hora medida (ISO), o null si la estación no trae nada. */
  finMedida: string | null;
  /** «hoy, hasta las 15:00». */
  textoMedida: string | null;
  /** Milisegundos desde el final de esa hora; null si no hay medida. */
  antiguedadMs: number | null;
  /** La medición no sirve para decir cómo está el aire ahora (más de 3 h, de respaldo o la fuente en error). */
  medidaAntigua: boolean;
  /** Veredicto del bloque. `null` si no hay previsión ni una medición al día (las medidas viejas se enseñan aparte). */
  titular: { nivel: Nivel; cuando: "hoy" | "manana" | "medido" } | null;
  /** De dónde sale el veredicto. */
  base: "medido y previsión" | "previsión" | "medido" | null;
  mejor: Ventana | null;
  peor: Ventana | null;
  sinBuenaHora: boolean;
  todoIgual: boolean;
  /** Las barras de las próximas horas (hasta 24), o null si no hay previsión utilizable. */
  horas: HoraPronostico[] | null;
  avisos: AvisoAire[];
}

export interface EntradaAire {
  lugar: LugarMinimo;
  lugares: Pick<Lugares, "estaciones" | "captadores" | "municipios">;
  estado: EstadoActual | null;
  origenEstado: OrigenDatos;
  pronostico: Pronostico | null;
  origenPronostico: OrigenDatos;
  ahora: Date;
}

/** «hoy, hasta las 15:00», «ayer, hasta las 22:00», «15 nov, hasta las 18:00». */
export function textoHasta(iso: string, ahora: Date): string {
  const t = formatearUltimoDato(iso, ahora);
  const i = t.lastIndexOf(", ");
  return i < 0 ? t : `${t.slice(0, i)}, hasta las ${t.slice(i + 2)}`;
}

function textoHace(ms: number): string {
  const h = Math.floor(ms / HORA_MS);
  if (h >= 48) return `${Math.floor(h / 24)} días`;
  return h <= 1 ? "1 hora" : `${h} horas`;
}

function textoCobertura(f: FuenteAire, nombre: string): string {
  const km = String(Math.round(f.km * 10) / 10).replace(".", ",");
  const donde = `la estación de ${f.estacion.nombre}, a ${km} km`;
  if (f.capital) {
    return `Madrid capital no tiene estaciones de la Comunidad de Madrid: la red de calidad del aire de la capital es del Ayuntamiento y no está en estos datos. Usamos ${donde}, así que es una aproximación del aire de la zona, no una medida de aquí.`;
  }
  return `En ${nombre} no hay estación de la Comunidad de Madrid. Usamos ${donde}, que puede no reflejar el aire de aquí.`;
}

/**
 * Todo lo que enseña el bloque. No lanza: sin estado ni pronóstico devuelve lo que pueda (avisos incluidos) y el bloque decide si
 * se oculta (`titular === null` y sin `medidas`).
 */
export function calcularAireHoy(e: EntradaAire): VistaAire | null {
  const fuente = fuenteAireDe(e.lugar, e.lugares);
  if (!fuente) return null;
  const { estacion } = fuente;
  const avisos: AvisoAire[] = [];

  // --- lo medido en la estación ---
  const ultimas = new Map<string, MedidaAire & { t: number }>();
  for (const o of e.estado?.observaciones ?? []) {
    if (o.lugar !== estacion.id || !(VARIABLES_AIRE as readonly string[]).includes(o.variable)) continue;
    const t = Date.parse(o.hora);
    if (Number.isNaN(t)) continue;
    const previa = ultimas.get(o.variable);
    if (!previa || t > previa.t) ultimas.set(o.variable, { variable: o.variable, corto: nombreVariable(o.variable).corto, valor: o.valor, unidad: o.unidad, nivel: o.nivel, t });
  }
  const orden = VARIABLES_AIRE as readonly string[];
  const lista = [...ultimas.values()].sort((a, b) => orden.indexOf(a.variable) - orden.indexOf(b.variable));
  const medidas: MedidaAire[] = lista.map((x) => ({ variable: x.variable, corto: x.corto, valor: x.valor, unidad: x.unidad, nivel: x.nivel }));
  const finT = lista.reduce<number | null>((m, x) => (m === null || x.t > m ? x.t : m), null);
  const finMedida = finT === null ? null : new Date(finT).toISOString();
  const antiguedadMs = finT === null ? null : e.ahora.getTime() - finT;

  const capaAire = e.estado?.capas.aire;
  const fuenteCaida = !!capaAire && capaAire.estado !== "ok";
  const respaldo = e.estado !== null && e.origenEstado === "respaldo";
  const medidaAntigua = finT !== null && (respaldo || fuenteCaida || (antiguedadMs ?? 0) > PLAZO_CAPA_MS.aire);

  if (e.estado && finMedida) {
    if (respaldo) {
      avisos.push({
        tipo: "respaldo",
        texto: `No se ha podido leer la última actualización: las mediciones son de una copia guardada (${textoHasta(finMedida, e.ahora)}) y no son el aire de ahora.`,
      });
    } else if (fuenteCaida) {
      avisos.push({
        tipo: "antiguo",
        texto: `La fuente no responde: la última medición de ${estacion.nombre} es de ${textoHasta(finMedida, e.ahora)}.`,
      });
    } else if (medidaAntigua) {
      avisos.push({
        tipo: "antiguo",
        texto: `Sin actualizar desde hace ${textoHace(antiguedadMs ?? 0)}: la última medición de ${estacion.nombre} es de ${textoHasta(finMedida, e.ahora)}.`,
      });
    }
  }

  // --- previsión + medida (población general: solo aire) ---
  let evaluacion: EvaluacionLugar | null = null;
  if (e.pronostico) {
    // Sin estado (la lectura falló) la previsión sigue valiendo: se evalúa sin mediciones.
    const base = e.estado ?? ({ observaciones: [] } as unknown as EstadoActual);
    evaluacion = evaluarLugar({ afecta: "aire", polenes: [] }, { estacion: estacion.id, captador: null }, e.pronostico, base, e.lugares, e.ahora);
  }
  const r = evaluacion?.resultado ?? null;
  const hayPrevision = !!r && r.veredicto !== "sin_dato" && r.dia !== null;

  const todas = r?.horas ?? [];
  const futuras = todas.filter((h) => !h.pasada).slice(0, HORAS_FRANJA);
  const horas = hayPrevision && futuras.length >= MIN_HORAS_FRANJA && futuras.some((h) => h.nivel !== "sin_dato") ? futuras : null;

  if (e.pronostico && hayPrevision && (e.origenPronostico === "respaldo" || pronosticoAntiguo(e.pronostico, e.ahora))) {
    const hace = e.ahora.getTime() - Date.parse(e.pronostico.generado);
    avisos.push({ tipo: "previsionAntigua", texto: `La previsión se calculó hace ${textoHace(hace)}: puede haber cambiado.` });
  }

  let titular: VistaAire["titular"] = null;
  let base: VistaAire["base"] = null;
  if (hayPrevision && r) {
    titular = { nivel: r.veredicto, cuando: r.dia === "manana" ? "manana" : "hoy" };
    base = medidas.length > 0 && !medidaAntigua ? "medido y previsión" : "previsión";
  } else if (medidas.length > 0 && !medidaAntigua) {
    // Una medición vieja (o de la copia de respaldo) no se presenta como veredicto: se enseña aparte, con su fecha.
    const peor = medidas.reduce<Nivel>((m, x) => (ordNivel(x.nivel) > ordNivel(m) ? x.nivel : m), "sin_dato");
    if (peor !== "sin_dato") {
      titular = { nivel: peor, cuando: "medido" };
      base = "medido";
    }
  }

  if (fuente.lejana) avisos.push({ tipo: "cobertura", texto: textoCobertura(fuente, e.lugar.nombre) });

  return {
    lugar: e.lugar.nombre,
    fuente,
    medidas,
    finMedida,
    textoMedida: finMedida ? textoHasta(finMedida, e.ahora) : null,
    antiguedadMs,
    medidaAntigua,
    titular,
    base,
    mejor: hayPrevision && r ? r.mejor : null,
    peor: hayPrevision && r ? r.peor : null,
    sinBuenaHora: hayPrevision && !!r?.sinBuenaHora,
    todoIgual: hayPrevision && !!r?.todoIgual,
    horas,
    avisos,
  };
}

function ordNivel(n: Nivel): number {
  return ["sin_dato", "bajo", "medio", "alto"].indexOf(n);
}

/** ¿Hay algo que enseñar? Si no, el bloque se oculta con una nota. */
export function hayAire(v: VistaAire | null): v is VistaAire {
  return !!v && (v.titular !== null || v.medidas.length > 0);
}
