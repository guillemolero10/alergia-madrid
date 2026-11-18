import { type EvaluacionLugar } from "./evaluar";
import { palabraVariable, partesLocales, type HoraPronostico, type Perfil } from "./franja";
import { ordenDeNivel } from "./riesgo";
import { sinTildes } from "./texto";
import type { Municipio, Nivel } from "./tipos";

// Colegios: ¿pueden salir al patio? Lo que se calcula es lo mismo que en «Para ti» (previsión CAMS + lo medido),
// solo con la CALIDAD DEL AIRE de la estación de cada centro. El polen no decide el patio: entra igual en el aula y los
// protocolos de episodios de contaminación (NO2, O3) son los que piden limitar la actividad física al aire libre.

/** Un centro de `datos-estaticos/colegios.json` (claves cortas para que el fichero pese poco). */
export interface Centro {
  /** Código de centro de 8 cifras. */
  c: string;
  n: string;
  /** CEIP, CEIPS, IES, CEE, COL, CIM o EXT. */
  t: string;
  /** Etapas: I infantil, P primaria, S secundaria, E especial. */
  e: string;
  /** Titularidad: pu público, co concertado, pr privado. */
  p: string;
  /** `mun:<INE>` */
  m: string;
  la: number;
  lo: number;
  ea: string;
  de: number;
  ca: string | null;
  dc: number | null;
}

/** El perfil del patio: solo calidad del aire. */
export const PERFIL_COLEGIO: Pick<Perfil, "afecta" | "polenes"> = {
  afecta: "aire",
  polenes: [],
};

/**
 * SUPUESTO EDITABLE: el horario escolar no está en los datos abiertos, así que se supone uno típico.
 * Las horas son locales (Madrid). Cámbialo aquí y toda la pantalla se recalcula.
 */
export const HORARIO_ORIENTATIVO = {
  /** Horas lectivas de la mañana (9:00 a 14:00). */
  lectivo: { desde: 9, hasta: 14 },
  /** Clase por la tarde, solo si el usuario marca que su centro la tiene (de 16:00 a 17:00). */
  tarde: { desde: 16, hasta: 17 },
  /** Recreo típico, en minutos desde medianoche. */
  recreo: {
    infantilPrimaria: { etiqueta: "Infantil y primaria", desde: 11 * 60, hasta: 11 * 60 + 30 },
    secundaria: { etiqueta: "Secundaria", desde: 11 * 60 + 15, hasta: 11 * 60 + 45 },
  },
} as const;

/** Más allá de esta distancia el dato de aire o de polen es «de otra zona» y se avisa. */
export const UMBRAL_COBERTURA_KM = 10;

export interface Recreo {
  etiqueta: string;
  desde: number;
  hasta: number;
}

const horaTexto = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
export const rangoTexto = (r: Pick<Recreo, "desde" | "hasta">) => `${horaTexto(r.desde)}–${horaTexto(r.hasta)}`;

/** Recreos de un centro según sus etapas (un centro de infantil a secundaria tiene los dos). */
export function recreosDe(centro: Pick<Centro, "e">): Recreo[] {
  const r = HORARIO_ORIENTATIVO.recreo;
  const lista: Recreo[] = [];
  if (/[IPE]/.test(centro.e)) lista.push(r.infantilPrimaria);
  if (centro.e.includes("S")) lista.push(r.secundaria);
  return lista.length > 0 ? lista : [r.infantilPrimaria];
}

/** Horas enteras (de inicio) que toca un rango en minutos: 11:15–11:45 toca la hora de las 11. */
export function horasQueToca(r: Pick<Recreo, "desde" | "hasta">): number[] {
  const horas: number[] = [];
  for (let h = Math.floor(r.desde / 60); h < Math.ceil(r.hasta / 60); h++) horas.push(h);
  return horas;
}

// --- nombres ---

/** «CEIP El Alamo», «IES Complutense», «Colegio Santa Maria»… */
export function nombreCentro(c: Pick<Centro, "n" | "t">): string {
  switch (c.t) {
    case "CEIP":
    case "CEIPS":
      return `CEIP ${c.n}`;
    case "IES":
      return `IES ${c.n}`;
    case "CEE":
      return `CEE ${c.n}`;
    case "COL":
      return `Colegio ${c.n}`;
    case "CIM":
      return `Conservatorio ${c.n}`;
    default:
      return c.n;
  }
}

/** «el CEIP El Alamo» / «Hastings School» (los centros extranjeros ya traen su nombre completo). */
export function conArticulo(c: Pick<Centro, "n" | "t">): string {
  const nombre = nombreCentro(c);
  return c.t === "EXT" && !/^colegio\b/i.test(nombre) ? nombre : `el ${nombre}`;
}

// --- buscador ---

export interface CentroIndexado {
  centro: Centro;
  nombre: string;
  completo: string;
  municipio: string;
}

export function indexarCentros(centros: readonly Centro[], municipios: readonly Pick<Municipio, "id" | "nombre">[]): CentroIndexado[] {
  const nombres = new Map(municipios.map((m) => [m.id, sinTildes(m.nombre)]));
  return centros.map((centro) => ({
    centro,
    nombre: sinTildes(centro.n),
    completo: sinTildes(nombreCentro(centro)),
    municipio: nombres.get(centro.m) ?? "",
  }));
}

export interface ResultadoBusqueda {
  total: number;
  centros: Centro[];
}

/**
 * Busca por nombre del centro o del municipio, sin tildes ni mayúsculas. Orden: el nombre empieza por lo escrito,
 * lo contiene, el municipio empieza por lo escrito, o todas las palabras aparecen entre nombre y municipio.
 */
export function buscarCentros(indice: readonly CentroIndexado[], texto: string, limite = 8): ResultadoBusqueda {
  const q = sinTildes(texto.trim()).replace(/\s+/g, " ");
  if (q.length < 2) return { total: 0, centros: [] };
  const palabras = q.split(" ");
  const puntuados: { c: Centro; puntos: number; nombre: string }[] = [];
  for (const i of indice) {
    let puntos = -1;
    if (i.nombre.startsWith(q) || i.completo.startsWith(q)) puntos = 0;
    else if (i.nombre.includes(q) || i.completo.includes(q)) puntos = 1;
    else if (i.municipio.startsWith(q)) puntos = 2;
    else if (i.municipio.includes(q)) puntos = 3;
    else if (palabras.length > 1 && palabras.every((p) => i.completo.includes(p) || i.municipio.includes(p))) puntos = 4;
    if (puntos >= 0) puntuados.push({ c: i.centro, puntos, nombre: i.nombre });
  }
  puntuados.sort((a, b) => a.puntos - b.puntos || a.nombre.localeCompare(b.nombre, "es"));
  return { total: puntuados.length, centros: puntuados.slice(0, limite).map((p) => p.c) };
}

// --- evaluación ---

export type EducacionFisica = "aire_libre" | "franja" | "precaucion" | "gimnasio" | "sin_dato";

export interface FranjaLectiva {
  horaDesde: number;
  horaHasta: number;
  nivel: Nivel;
}

export interface CausaCentro {
  variable: string;
  origen: "medido" | "prevision";
  lugarMedido?: string;
}

export interface EvaluacionCentro {
  /** AAAA-MM-DD del día del que se habla. */
  fecha: string;
  dia: "hoy" | "manana" | "historico";
  finDeSemana: boolean;
  /** Peor nivel durante el recreo; `sin_dato` si no hay datos para esas horas. */
  nivelRecreo: Nivel;
  recreos: { recreo: Recreo; nivel: Nivel }[];
  /** Qué da el nivel del recreo (`null` si es bajo o no hay dato). */
  causa: CausaCentro | null;
  educacionFisica: EducacionFisica;
  /** Mejor franja lectiva para salir al aire libre (para educación física). */
  mejorFranja: FranjaLectiva | null;
  /** Peor nivel de toda la jornada. */
  nivelJornada: Nivel;
  sinPrevision: string[];
}

const esFinDeSemana = (fecha: string) => [0, 6].includes(new Date(`${fecha}T12:00:00Z`).getUTCDay());

function nivelMax(horas: readonly HoraPronostico[]): Nivel {
  let max: Nivel = "sin_dato";
  for (const h of horas) if (ordenDeNivel(h.nivel) > ordenDeNivel(max)) max = h.nivel;
  return max;
}

function causaDe(horas: readonly HoraPronostico[], nivel: Nivel): CausaCentro | null {
  if (ordenDeNivel(nivel) < 2) return null;
  const h = horas.find((x) => x.nivel === nivel && x.culpable);
  if (!h?.culpable || !h.origen) return null;
  return { variable: h.culpable, origen: h.origen, ...(h.lugarMedido ? { lugarMedido: h.lugarMedido } : {}) };
}

/** Racha de horas seguidas con el nivel más bajo; a igual largo, la más temprana. */
function mejorRacha(horas: readonly HoraPronostico[]): FranjaLectiva | null {
  const conDato = horas.filter((h) => h.nivel !== "sin_dato");
  if (conDato.length === 0) return null;
  const minimo = conDato.reduce((m, h) => (ordenDeNivel(h.nivel) < ordenDeNivel(m) ? h.nivel : m), "alto" as Nivel);
  let mejor: HoraPronostico[] = [];
  let actual: HoraPronostico[] = [];
  for (const h of conDato) {
    if (h.nivel !== minimo) {
      actual = [];
      continue;
    }
    const previa = actual[actual.length - 1];
    actual = previa && h.hora === previa.hora + 1 ? [...actual, h] : [h];
    if (actual.length > mejor.length) mejor = actual;
  }
  const primera = mejor[0]!;
  return { horaDesde: primera.hora, horaHasta: mejor[mejor.length - 1]!.hora + 1, nivel: minimo };
}

export interface OpcionesEvaluacion {
  /** Reloj de la pantalla (en un día histórico, la foto de las 14:00 de ese día). */
  ahora: Date;
  /** Día histórico: se evalúa ese día entero, sin descartar las horas ya pasadas. */
  historico: boolean;
  /** El centro tiene clase por la tarde (`HORARIO_ORIENTATIVO.tarde`). */
  tarde: boolean;
}

export function horasLectivas(tarde: boolean): number[] {
  const h = HORARIO_ORIENTATIVO;
  const lista: number[] = [];
  for (let x = h.lectivo.desde; x < h.lectivo.hasta; x++) lista.push(x);
  if (tarde) for (let x = h.tarde.desde; x < h.tarde.hasta; x++) lista.push(x);
  return lista;
}

/**
 * Qué pasa en el patio de un centro. Parte de las horas ya combinadas (medido + CAMS) de su zona.
 * Hoy si queda alguna hora lectiva por delante; si no, mañana. `null` si no hay datos de ese día.
 */
export function evaluarCentro(centro: Pick<Centro, "e">, ev: EvaluacionLugar, { ahora, historico, tarde }: OpcionesEvaluacion): EvaluacionCentro | null {
  const lectivas = horasLectivas(tarde);
  const horas = ev.resultado.horas;
  const hoy = partesLocales(ahora).fecha;
  const delDia = (f: string) => horas.filter((h) => h.fecha === f && lectivas.includes(h.hora));

  let fecha = hoy;
  let dia: EvaluacionCentro["dia"] = historico ? "historico" : "hoy";
  if (!historico && !delDia(hoy).some((h) => !h.pasada)) {
    const siguiente = horas.map((h) => h.fecha).find((f) => f > hoy);
    if (!siguiente) return null;
    fecha = siguiente;
    dia = "manana";
  }
  const jornada = delDia(fecha).filter((h) => historico || dia === "manana" || !h.pasada);
  if (jornada.length === 0) return null;

  const recreos = recreosDe(centro).map((recreo) => {
    const tocadas = horasQueToca(recreo);
    return { recreo, horas: jornada.filter((h) => tocadas.includes(h.hora)) };
  });
  const horasRecreo = recreos.flatMap((r) => r.horas);
  // Si hoy el recreo ya ha pasado no hay nada que decir de él: se habla del resto de la jornada.
  const nivelRecreo = nivelMax(horasRecreo.length > 0 ? horasRecreo : jornada);
  const nivelJornada = nivelMax(jornada);
  const mejorFranja = mejorRacha(jornada);

  let educacionFisica: EducacionFisica = "sin_dato";
  if (mejorFranja) {
    if (nivelJornada === "bajo") educacionFisica = "aire_libre";
    else if (mejorFranja.nivel === "bajo") educacionFisica = "franja";
    else if (mejorFranja.nivel === "medio") educacionFisica = "precaucion";
    else educacionFisica = "gimnasio";
  }

  return {
    fecha,
    dia,
    finDeSemana: esFinDeSemana(fecha),
    nivelRecreo,
    recreos: recreos.map((r) => ({ recreo: r.recreo, nivel: nivelMax(r.horas) })),
    causa: causaDe(horasRecreo.length > 0 ? horasRecreo : jornada, nivelRecreo),
    educacionFisica,
    mejorFranja,
    nivelJornada,
    sinPrevision: ev.sinPrevision,
  };
}

/** Frase del veredicto del patio. */
export function fraseRecreo(nivel: Nivel): string {
  switch (nivel) {
    case "bajo":
      return "recreo al aire libre sin problema";
    case "medio":
      return "recreo con precaución";
    case "alto":
      return "recreo mejor dentro";
    default:
      return "sin datos suficientes";
  }
}

export function fraseEducacionFisica(e: EvaluacionCentro): string {
  const f = e.mejorFranja ? `${e.mejorFranja.horaDesde}:00–${e.mejorFranja.horaHasta}:00` : "";
  switch (e.educacionFisica) {
    case "aire_libre":
      return "Al aire libre, sin problema en toda la jornada.";
    case "franja":
      return `Al aire libre solo en la mejor franja (${f}); el resto del día, mejor dentro o con poca intensidad.`;
    case "precaucion":
      return `Al aire libre con precaución y poca intensidad; lo mejor es ${f}. El alumnado con asma, mejor dentro.`;
    case "gimnasio":
      return "Mejor en el gimnasio: no hay ninguna hora buena para el aire libre.";
    default:
      return "No hay datos suficientes para recomendarla.";
  }
}

export interface AvisoCobertura {
  clave: "aire" | "polen";
  texto: string;
}

/** Aviso honesto cuando la estación de aire queda a más de `UMBRAL_COBERTURA_KM`. */
export function avisosCobertura(centro: Pick<Centro, "de">, estacion: string): AvisoCobertura[] {
  const km = (v: number) => `${String(v).replace(".", ",")} km`;
  const avisos: AvisoCobertura[] = [];
  if (centro.de > UMBRAL_COBERTURA_KM) {
    avisos.push({ clave: "aire", texto: `La estación de aire más cercana (${estacion}) está a ${km(centro.de)}: el aire del patio puede ser distinto del que medimos.` });
  }
  return avisos;
}

export function causaTexto(causa: CausaCentro): string {
  const que = palabraVariable(causa.variable);
  return causa.origen === "medido" ? `Por el ${que}, medido${causa.lugarMedido ? ` en ${causa.lugarMedido}` : ""}.` : `Por el ${que} (previsión CAMS).`;
}

// --- resumen para el mapa ---

export interface ResumenColegios {
  /** Nivel del recreo de cada centro (`sin_dato` si no se pudo evaluar). */
  niveles: Map<string, Nivel>;
  recuento: Record<Nivel, number>;
  total: number;
  fecha: string | null;
  dia: EvaluacionCentro["dia"] | null;
}

/** Evalúa todos los centros; `evaluador` devuelve la evaluación (con caché por estación y captador) de cada uno. */
export function resumirColegios(
  centros: readonly Centro[],
  evaluador: (c: Centro) => EvaluacionLugar | null,
  opciones: OpcionesEvaluacion,
): ResumenColegios {
  const niveles = new Map<string, Nivel>();
  const recuento: Record<Nivel, number> = { sin_dato: 0, bajo: 0, medio: 0, alto: 0 };
  let fecha: string | null = null;
  let dia: EvaluacionCentro["dia"] | null = null;
  for (const c of centros) {
    const ev = evaluador(c);
    const e = ev ? evaluarCentro(c, ev, opciones) : null;
    const nivel = e?.nivelRecreo ?? "sin_dato";
    niveles.set(c.c, nivel);
    recuento[nivel] += 1;
    if (e && !fecha) {
      fecha = e.fecha;
      dia = e.dia;
    }
  }
  return { niveles, recuento, total: centros.length, fecha, dia };
}
