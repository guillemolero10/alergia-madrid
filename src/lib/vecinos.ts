import { distanciaKm } from "./perfil";
import { evaluarLugar } from "./evaluar";
import { etiquetaVentana, HORA_FIN_DIA, HORA_INICIO_DIA, type Perfil, type ResultadoFranja } from "./franja";
import { formatearKm } from "./formato";
import { etiquetaDeNivel, ordenDeNivel } from "./riesgo";
import type { EstadoActual, Lugares, Municipio, Nivel, Pronostico } from "./tipos";

// «Si aquí no, prueba en…»: cuando a la mejor hora el nivel es medio o alto, busca municipios cercanos cuyo
// dato (estación de aire y captador de polen) dé un nivel MENOR para el perfil y esa misma hora.

export const RADIO_VECINOS_KM = 25;
export const MAX_ALTERNATIVAS = 3;

export interface Alternativa {
  municipio: Municipio;
  km: number;
  /** Nivel en la franja de referencia. */
  nivel: Nivel;
}

export interface Vecinos {
  /** Nivel de aquí en la franja de referencia. */
  nivelAqui: Nivel;
  /** «10:00–13:00», o `null` si se compara todo el día (no hay una mejor franja). */
  franja: string | null;
  /** Solo se busca si aquí es medio o alto. */
  aplica: boolean;
  alternativas: Alternativa[];
}

/** Horas (inicio ISO) sobre las que se compara: la mejor franja o, si no hay, las horas útiles del día. */
export function horasDeReferencia(r: ResultadoFranja): { isos: string[]; franja: string | null } {
  if (r.mejor) {
    const d = Date.parse(r.mejor.desde);
    const h = Date.parse(r.mejor.hasta);
    return { isos: r.horas.filter((x) => Date.parse(x.iso) >= d && Date.parse(x.iso) < h).map((x) => x.iso), franja: etiquetaVentana(r.mejor) };
  }
  const isos = r.horas
    .filter((x) => x.fecha === r.fechaDia && x.hora >= HORA_INICIO_DIA && x.hora <= HORA_FIN_DIA && (r.dia === "manana" || !x.pasada))
    .map((x) => x.iso);
  return { isos, franja: null };
}

function nivelEn(r: ResultadoFranja, isos: readonly string[]): Nivel {
  const conjunto = new Set(isos);
  let max: Nivel = "sin_dato";
  for (const h of r.horas) if (conjunto.has(h.iso) && ordenDeNivel(h.nivel) > ordenDeNivel(max)) max = h.nivel;
  return max;
}

/** El dato que cuenta para el perfil: solo la estación si es asma, solo el captador si es polen. Mismo dato = misma clave. */
const clave = (afecta: Perfil["afecta"], m: Pick<Municipio, "estacion" | "captador">) =>
  `${afecta !== "polen" ? m.estacion : ""}|${afecta !== "aire" ? (m.captador ?? "") : ""}`;

export function buscarVecinos(
  perfil: Perfil,
  municipio: Municipio,
  aqui: ResultadoFranja,
  entorno: { pronostico: Pronostico; estado: EstadoActual; lugares: Lugares; ahora: Date },
): Vecinos {
  const { isos, franja } = horasDeReferencia(aqui);
  const nivelAqui = aqui.mejor?.nivel ?? nivelEn(aqui, isos);
  const base: Vecinos = { nivelAqui, franja, aplica: ordenDeNivel(nivelAqui) >= 2, alternativas: [] };
  if (!base.aplica || isos.length === 0) return base;

  const propia = clave(perfil.afecta, municipio);
  const vistos = new Set<string>([propia]); // el mismo dato dos veces no es una alternativa
  const candidatos = entorno.lugares.municipios
    .filter((m) => m.id !== municipio.id)
    .map((m) => ({ m, km: distanciaKm(municipio.lat, municipio.lon, m.lat, m.lon) }))
    .filter((c) => c.km <= RADIO_VECINOS_KM)
    .sort((a, b) => a.km - b.km);

  const mejoran: Alternativa[] = [];
  for (const { m, km } of candidatos) {
    const k = clave(perfil.afecta, m);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const ev = evaluarLugar(perfil, m, entorno.pronostico, entorno.estado, entorno.lugares, entorno.ahora);
    if (!ev) continue;
    const nivel = nivelEn(ev.resultado, isos);
    if (ordenDeNivel(nivel) > 0 && ordenDeNivel(nivel) < ordenDeNivel(nivelAqui)) mejoran.push({ municipio: m, km, nivel });
  }
  mejoran.sort((a, b) => ordenDeNivel(a.nivel) - ordenDeNivel(b.nivel) || a.km - b.km);
  return { ...base, alternativas: mejoran.slice(0, MAX_ALTERNATIVAS) };
}

/** «En Arganda del Rey (14 km) el nivel es bajo en tu franja (10:00–13:00)». */
export function textoAlternativa(a: Alternativa, franja: string | null): string {
  const km = formatearKm(Math.round(a.km));
  const cuando = franja ? ` en tu franja (${franja})` : " durante el día";
  return `En ${a.municipio.nombre} (${km}) el nivel es ${etiquetaDeNivel(a.nivel).toLowerCase()}${cuando}`;
}

export function textoIgualEnLaZona(dia: "hoy" | "manana" | "historico"): string {
  const cuando = dia === "hoy" ? "Hoy está" : dia === "manana" ? "Mañana estará" : "Ese día estaba";
  return `${cuando} igual en toda la zona: la mejor opción es la hora, no el sitio.`;
}
