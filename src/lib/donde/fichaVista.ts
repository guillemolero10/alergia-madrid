// Textos de la ficha de «Mi municipio»: pasa el resultado del motor (`fichaLugar`) a frases en lenguaje llano para un vecino.
// Todas las cifras salen del motor; aquí solo se redactan. Sin DOM.
import { decimal2Es, decimalEs, enteroEs, porcentajeEs, radioEs } from "./panelDonde";
import { SERVICIOS } from "./servicios";
import type { EstadoServicio, FichaLugar, FilaFicha, ServicioId, Territorios } from "./tipos";

/** Cómo se llama cada servicio en una frase: singular, plural y el artículo («un centro», «una farmacia»). */
const NOMBRES: Record<ServicioId, { s: string; p: string; un: "un" | "una"; ninguno: "ningún" | "ninguna" }> = {
  centro_salud: { s: "centro de salud", p: "centros de salud", un: "un", ninguno: "ningún" },
  hospital: { s: "hospital", p: "hospitales", un: "un", ninguno: "ningún" },
  residencia: { s: "residencia de mayores", p: "residencias de mayores", un: "una", ninguno: "ninguna" },
  farmacia: { s: "farmacia", p: "farmacias", un: "una", ninguno: "ninguna" },
  colegio: { s: "colegio o instituto", p: "colegios e institutos", un: "un", ninguno: "ningún" },
  dea: { s: "punto con desfibrilador", p: "puntos con desfibrilador", un: "un", ninguno: "ningún" },
};

/** A quién se cuenta en cada servicio. */
const GRUPOS: Record<ServicioId, string> = {
  centro_salud: "vecinos",
  hospital: "vecinos",
  residencia: "mayores de 65 años",
  farmacia: "vecinos",
  colegio: "niños y jóvenes de 3 a 16 años",
  dea: "vecinos",
};

export type Semaforo = "debajo" | "media" | "encima" | "cubierto";

export const ETIQUETA_SEMAFORO: Record<Semaforo, string> = {
  debajo: "Con margen de mejora",
  media: "En la media",
  encima: "Bien dotado",
  cubierto: "Cubierto desde fuera",
};

export interface ReferenciaVista {
  texto: string;
  /** Frase con el valor del lugar frente a la norma; `null` si no se pueden comparar. */
  resultado: string | null;
  cumple: boolean | null;
  /** Sello corto de la comparación: «Dentro del módulo», «Por encima de la referencia»… (no es un mínimo legal). */
  sello: string | null;
  url: string;
  nota: string | null;
}

export interface FilaVista {
  id: ServicioId;
  nombre: string;
  semaforo: Semaforo;
  /** La frase principal: cuántos hay y para cuántos vecinos. */
  titular: string;
  /** Frases de apoyo: el ratio, la comparación con pueblos parecidos y la Comunidad, y los vecinos en déficit. */
  lineas: string[];
  referencia: ReferenciaVista | null;
  /** Radio (en metros) del servicio: es el de los datos con los que se calcula la ficha. */
  radio_m: number;
}

export interface LoQueFalta {
  id: ServicioId;
  nombre: string;
  frase: string;
  /** Plazas que faltan (solo residencias), o `null`. */
  plazasFaltan: number | null;
  /** Con qué se calcula `plazasFaltan` («para llegar a la media de España del IMSERSO (4,05 por cada 100)»), o `null`. */
  refPlazas: string | null;
}

// ---------------------------------------------------------------- piezas
/** «<2.000» → «menos de 2.000 habitantes»; «2.000-10.000» → «entre 2.000 y 10.000 habitantes»; «>100.000» → «más de 100.000 habitantes». */
export function describirTramo(tramo: string): string {
  const t = tramo.trim();
  if (t.startsWith("<")) return `menos de ${t.slice(1)} habitantes`;
  if (t.startsWith(">")) return `más de ${t.slice(1)} habitantes`;
  const m = /^([\d.]+)-([\d.]+)$/.exec(t);
  if (m) return `entre ${m[1]} y ${m[2]} habitantes`;
  return `${t} habitantes`;
}

/** «Los pueblos de menos de 2.000 habitantes» o «Los municipios de más de 50.000 habitantes». */
export function comoElTuyo(tramo: string): string {
  const pueblo = tramo.startsWith("<") || tramo === "2.000-10.000";
  return `${pueblo ? "Los pueblos" : "Los municipios"} de ${describirTramo(tramo)}`;
}

/** Con qué se compara el déficit de las plazas, según la referencia que haya elegido el usuario en el simulador. */
export function etiquetaUmbral(estado: EstadoServicio): string {
  const modo = estado.umbralModo;
  if (modo === "imserso_espana") return "la media de España del IMSERSO";
  if (modo === "imserso_madrid") return "la media de Madrid del IMSERSO";
  if (modo === "mediana") return "la mediana de la Comunidad";
  if (modo === "media") return "la media de la Comunidad";
  return "la referencia elegida";
}

const mil = (n: number) => enteroEs(Math.round(n));

/** «100 %», «14,9 %»: sin decimal cuando es redondo. */
function pct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? `${enteroEs(r)} %` : porcentajeEs(r);
}

/** Cómo se llama el servicio al decir «tiene uno a menos de 2 km» (el de salud incluye los consultorios). */
function cobertura(id: ServicioId): string {
  return id === "centro_salud" ? "un centro de salud o consultorio" : `${NOMBRES[id].un} ${NOMBRES[id].s}`;
}

/** «una farmacia por cada 4.929» (con nombre, la primera vez) o «una por cada 2.936» (sin él, al comparar). */
function unoPor(id: ServicioId, ratio: number, conNombre = false): string {
  const n = NOMBRES[id];
  if (conNombre) return `${n.un} ${n.s} por cada ${mil(ratio)}`;
  return `${n.un === "una" ? "una" : "uno"} por cada ${mil(ratio)}`;
}

function plural(n: number, id: ServicioId): string {
  return `${enteroEs(n)} ${n === 1 ? NOMBRES[id].s : NOMBRES[id].p}`;
}

// ---------------------------------------------------------------- una fila
function semaforoDe(f: FilaFicha): Semaforo {
  if (f.cubierto_desde_fuera) return "cubierto";
  return f.comparacion === "por_debajo" ? "debajo" : f.comparacion === "por_encima" ? "encima" : "media";
}

function filaVista(f: FilaFicha, nombre: string, tramo: string | null, estado: EstadoServicio): FilaVista {
  const id = f.id;
  const def = SERVICIOS[id];
  const nom = NOMBRES[id];
  const grupo = GRUPOS[id];
  const radio = radioEs(estado.radio_m);
  const lineas: string[] = [];
  let titular: string;

  if (f.unidad === "hab_por_centro") {
    const consultorios = id === "centro_salud" ? f.n - f.n_ratio : 0;
    const dentro = id === "centro_salud" ? f.n_ratio : f.n;
    if (dentro > 0) {
      titular = `En ${nombre} hay ${plural(dentro, id)} para ${mil(f.objetivo)} ${grupo}`;
      if (consultorios > 0) titular += ` (y ${consultorios === 1 ? "1 consultorio" : `${enteroEs(consultorios)} consultorios`})`;
      titular += ".";
    } else if (consultorios > 0) {
      titular = `En ${nombre} no hay ${nom.ninguno} centro de salud, solo ${consultorios === 1 ? "1 consultorio" : `${enteroEs(consultorios)} consultorios`}.`;
    } else {
      titular = `En ${nombre} no hay ${nom.ninguno} ${nom.s}.`;
    }
    if (f.ratio != null && dentro > 1) lineas.push(`Eso es ${unoPor(id, f.ratio, true)} ${grupo}.`);
    const comunidad = f.media_comunidad != null ? unoPor(id, f.media_comunidad) : null;
    if (f.mediana_tramo != null && tramo) {
      lineas.push(`${comoElTuyo(tramo)} tienen, de mediana, ${unoPor(id, f.mediana_tramo)} ${grupo}${comunidad ? `; la Comunidad, ${comunidad}` : ""}.`);
    } else if (comunidad) {
      lineas.push(`La Comunidad tiene, de media, ${comunidad} ${grupo}.`);
    }
    if (f.objetivo > 0) {
      if (f.pct_deficit <= 0) {
        lineas.push(
          f.n === 0
            ? `Aun así, todos los ${grupo} tienen ${cobertura(id)} a menos de ${radio} en línea recta, en los municipios de al lado.`
            : `Todos los ${grupo} tienen ${cobertura(id)} a menos de ${radio} en línea recta.`,
        );
      } else if (f.aproximada) {
        lineas.push(
          `Tiene ${plural(dentro, id)} dentro del municipio. En municipios rurales como este, la distancia se mide desde un punto de cada sección censal, que son muy grandes: por eso no damos el porcentaje de ${grupo} que vive lejos (sería aproximado).`,
        );
      } else {
        lineas.push(`El ${pct(f.pct_deficit)} de los ${grupo} (${mil(f.personas_deficit)}) vive a más de ${radio} en línea recta de ${cobertura(id)}.`);
      }
    }
  } else {
    const plazas = f.plazas ?? 0;
    titular =
      f.n > 0
        ? `En ${nombre} hay ${plural(f.n, id)} con ${mil(plazas)} plazas, para ${mil(f.objetivo)} ${grupo}.`
        : `En ${nombre} no hay ${nom.ninguno} ${nom.s}${f.objetivo > 0 ? `; viven ${mil(f.objetivo)} ${grupo}` : ""}.`;
    if (f.ratio != null) {
      lineas.push(`Contando también las plazas de los municipios de al lado (hasta ${radio}), salen ${decimalEs(f.ratio)} plazas por cada 100 ${grupo}.`);
    }
    const comunidad = f.media_comunidad != null ? `la Comunidad, ${decimalEs(f.media_comunidad)}` : null;
    if (f.mediana_tramo != null && tramo) {
      lineas.push(`${comoElTuyo(tramo)} tienen, de mediana, ${decimalEs(f.mediana_tramo)}${comunidad ? `; ${comunidad}` : ""}.`);
    } else if (comunidad) {
      lineas.push(`${comunidad.charAt(0).toUpperCase()}${comunidad.slice(1)}.`);
    }
    if ((f.plazas_faltan ?? 0) >= 1) {
      lineas.push(`En las zonas de ${nombre} que aún no llegan a ${etiquetaUmbral(estado)} (${decimal2Es(estado.umbral)} plazas por cada 100) habría sitio para ${Math.round(f.plazas_faltan ?? 0) === 1 ? "1 plaza más" : `unas ${mil(f.plazas_faltan ?? 0)} plazas más`}.`);
    } else if (f.objetivo > 0) {
      lineas.push(`Llega a ${etiquetaUmbral(estado)} (${decimal2Es(estado.umbral)} plazas por cada 100).`);
    }
  }

  let referencia: ReferenciaVista | null = null;
  if (f.referencia) {
    const r = f.referencia;
    const hay = f.ratio != null;
    let resultado: string | null = null;
    if (hay && f.ratio != null) {
      resultado =
        r.unidad === "hab_por_centro"
          ? `${nombre}: ${unoPor(id, f.ratio, true)}. ${f.referencia.cumple ? "Dentro del módulo orientativo." : "Por encima del módulo orientativo."}`
          : `${nombre}: ${decimal2Es(f.ratio)} plazas por cada 100. ${f.referencia.cumple ? "Por encima de la referencia." : "Por debajo de la referencia."}`;
    }
    referencia = { texto: r.texto, resultado, cumple: hay ? r.cumple : null, sello: hay && r.cumple !== null ? (r.unidad === "hab_por_centro" ? (r.cumple ? "Dentro del módulo" : "Por encima del módulo") : r.cumple ? "Por encima de la referencia" : "Por debajo de la referencia") : null, url: r.url, nota: def.nota ?? null };
  }

  return { id, nombre: def.nombre, semaforo: semaforoDe(f), titular, lineas, referencia, radio_m: estado.radio_m };
}

// ---------------------------------------------------------------- lo que más le falta
function fraseFalta(f: FilaFicha, nombre: string, tramo: string | null, estado: EstadoServicio): LoQueFalta {
  const id = f.id;
  const nom = NOMBRES[id];
  const grupo = GRUPOS[id];
  const ref = f.mediana_tramo ?? f.media_comunidad;
  const refQuien = f.mediana_tramo != null && tramo ? comoElTuyo(tramo).toLowerCase() : "la Comunidad";
  let frase: string;
  if (f.unidad === "hab_por_centro") {
    if (f.ratio == null) {
      const resto = f.pct_deficit > 0 ? `, y el ${pct(f.pct_deficit)} de sus ${grupo} vive a más de ${radioEs(estado.radio_m)} de ${cobertura(id)}` : "";
      frase = `${nombre} no tiene ${nom.ninguno} ${nom.s} dentro del municipio${resto}.`;
    } else {
      frase = `Tiene ${unoPor(id, f.ratio, true)} ${grupo}${ref != null ? `; ${refQuien} ${refQuien === "la Comunidad" ? "tiene" : "tienen"}, de ${refQuien === "la Comunidad" ? "media" : "mediana"}, ${unoPor(id, ref)} ${grupo}` : ""}.`;
    }
  } else {
    const r = f.ratio != null ? `${decimalEs(f.ratio)} plazas por cada 100 ${grupo}` : "ninguna plaza a su alcance";
    frase = `Tiene ${r}${ref != null ? `; ${refQuien} ${refQuien === "la Comunidad" ? "tiene" : "tienen"} ${decimalEs(ref)}` : ""}.`;
  }
  const hayPlazas = f.unidad === "plazas_por_100" && (f.plazas_faltan ?? 0) >= 1;
  return { id, nombre: SERVICIOS[id].nombre, frase, plazasFaltan: hayPlazas ? (f.plazas_faltan ?? 0) : null, refPlazas: hayPlazas ? `para llegar a ${etiquetaUmbral(estado)} (${decimal2Es(estado.umbral)} por cada 100)` : null };
}

// ---------------------------------------------------------------- la ficha entera
export interface CabeceraLugar {
  id: string;
  nombre: string;
  tipo: "municipio" | "distrito";
  poblacion: number;
  /** «Municipio de la zona Sur Metropolitano» / «Distrito de Madrid». */
  descripcion: string;
  /** Tramo de tamaño del municipio («>100.000»); null en un distrito. */
  tramo: string | null;
}

/** Nombre, población y zona de un municipio o distrito (sin esperar a los cálculos), o null si no existe. */
export function cabeceraLugar(t: Territorios, id: string): CabeceraLugar | null {
  const m = t.municipios.find((x) => x.id === id);
  if (m) {
    const zona = t.zonas.find((z) => z.codigo === m.zona)?.nombre;
    return { id, nombre: m.nombre, tipo: "municipio", poblacion: m.poblacion, descripcion: zona ? `Municipio de la zona ${zona}` : "Municipio de la Comunidad de Madrid", tramo: m.tramo };
  }
  const d = t.distritos.find((x) => x.id === id);
  if (d) return { id, nombre: d.nombre, tipo: "distrito", poblacion: d.poblacion, descripcion: "Distrito de Madrid", tramo: null };
  return null;
}

export interface FichaVista extends CabeceraLugar {
  /** «Los municipios de más de 100.000 habitantes»: el grupo con el que se compara (null en un distrito). */
  grupoComparacion: string | null;
  filas: FilaVista[];
  loQueFalta: LoQueFalta[];
}

/**
 * Ficha lista para pintar, o null si el lugar no existe. `estados` trae los servicios ya calculados (el radio y la referencia
 * de cada uno); las filas de `ficha` cuyo servicio no esté en `estados` se saltan (todavía se están calculando).
 */
export function construirVista(
  ficha: FichaLugar | null,
  estados: Partial<Record<ServicioId, EstadoServicio>>,
  t: Territorios,
  id: string,
  maximoFalta = 2,
): FichaVista | null {
  const cab = cabeceraLugar(t, id);
  if (!cab) return null;
  const filas: FilaVista[] = [];
  const loQueFalta: LoQueFalta[] = [];
  if (ficha) {
    for (const f of ficha.servicios) {
      const e = estados[f.id];
      if (e) filas.push(filaVista(f, cab.nombre, cab.tramo, e));
    }
    for (const sid of ficha.faltan) {
      const f = ficha.servicios.find((x) => x.id === sid);
      const e = estados[sid];
      if (f && e && loQueFalta.length < maximoFalta) loQueFalta.push(fraseFalta(f, cab.nombre, cab.tramo, e));
    }
  }
  return { ...cab, grupoComparacion: cab.tramo ? comoElTuyo(cab.tramo) : null, filas, loQueFalta };
}
