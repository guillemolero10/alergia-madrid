import { NIVELES, type EstadoActual, type Municipio, type Nivel, type Lugares, type Pronostico, type ZonaPronostico } from "./tipos";

// «¿A qué hora salgo?»: de las 48 h de pronóstico de una zona saca la mejor y la peor ventana del día, sin IA.
// Lógica pura (sin React ni red): la reutilizará la herramienta `pronostico` del chat (`mejor_franja`).
//
// Cómo se calcula:
//  1. Variables relevantes según el perfil (aire: NO2, O3, PM10, PM2.5; polen: los tipos elegidos que CAMS prevé).
//  2. Cada hora toma el PEOR nivel de esas variables (los niveles ya vienen del pipeline con los umbrales oficiales).
//     Culpable = la variable de ese nivel con el mayor valor normalizado.
//  3. Valor normalizado de una variable = valor / máximo de sus 48 h (0 a 1). Sirve solo para desempatar.
//  4. Día objetivo: hoy si quedan al menos 2 h entre las 7:00 y las 22:00; si no, mañana.
//  5. Mejor ventana: nivel más bajo con 3 h seguidas (2 h si no hay tres); a igual nivel, la de menor media
//     normalizada; a igual media, la más temprana. Peor ventana: la racha de horas con el nivel más alto (máx. 4 h),
//     con la de mayor media normalizada.

export type Afeccion = "aire" | "polen" | "ambos";

export interface Perfil {
  /** Id de municipio (`mun:28065`). */
  municipio: string;
  afecta: Afeccion;
  /** Claves de polen sin el prefijo (`gramineas`, `olivo`…). */
  polenes: string[];
}

export const VARIABLES_AIRE = ["no2", "o3", "pm10", "pm25"] as const;
/** Tipos que CAMS sí pronostica (los demás salen en `sin_pronostico`). */
export const POLENES_CON_PREVISION = ["gramineas", "olivo", "abedul", "aliso", "artemisia"] as const;
export const POLENES_SIN_PREVISION = ["cupresaceas", "platano"] as const;

export const PERFIL_INICIAL: Perfil = { municipio: "mun:28065", afecta: "aire", polenes: ["gramineas", "olivo"] };

export const HORA_INICIO_DIA = 7;
/** Última hora (de inicio) que cuenta: la ventana más tardía termina a las 22:00. */
export const HORA_FIN_DIA = 21;

const HORA_MS = 3_600_000;

const PALABRAS_POLEN: Record<string, string> = {
  gramineas: "gramíneas",
  olivo: "olivo",
  abedul: "abedul",
  aliso: "aliso",
  artemisia: "artemisa",
  cupresaceas: "cupresáceas",
  platano: "plátano",
};

/** Nombre de la variable en lenguaje humano («ozono», «polen de gramíneas»). */
export function palabraVariable(variable: string): string {
  switch (variable) {
    case "o3":
      return "ozono";
    case "no2":
      return "dióxido de nitrógeno";
    case "pm10":
    case "pm25":
      return "partículas";
    default:
      if (variable.startsWith("polen_")) {
        const tipo = variable.slice("polen_".length);
        return `polen de ${PALABRAS_POLEN[tipo] ?? tipo}`;
      }
      return variable;
  }
}

export function nombrePolen(tipo: string): string {
  const p = PALABRAS_POLEN[tipo] ?? tipo;
  return p.charAt(0).toUpperCase() + p.slice(1);
}

export interface VariablesPerfil {
  /** Variables presentes en el pronóstico de la zona. */
  variables: string[];
  /** Polenes elegidos que CAMS no prevé (se avisa en pantalla). */
  sinPrevision: string[];
}

export function variablesDelPerfil(perfil: Pick<Perfil, "afecta" | "polenes">, zona: ZonaPronostico, sinPronostico: readonly string[] = []): VariablesPerfil {
  const variables: string[] = [];
  const sinPrevision: string[] = [];
  if (perfil.afecta !== "polen") for (const v of VARIABLES_AIRE) if (zona.valores[v]) variables.push(v);
  if (perfil.afecta !== "aire") {
    for (const tipo of perfil.polenes) {
      const clave = `polen_${tipo}`;
      if (zona.valores[clave] && !sinPronostico.includes(clave)) variables.push(clave);
      else sinPrevision.push(tipo);
    }
  }
  return { variables, sinPrevision };
}

// --- tiempo local (Europa/Madrid) ---

const FORMATO_LOCAL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Madrid",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hourCycle: "h23",
});

export function partesLocales(fecha: Date): { fecha: string; hora: number } {
  const p = Object.fromEntries(FORMATO_LOCAL.formatToParts(fecha).map((x) => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, hora: Number(p.hour) };
}

// --- resultado ---

export interface HoraPronostico {
  iso: string;
  /** AAAA-MM-DD local. */
  fecha: string;
  /** Hora local de inicio (0-23). */
  hora: number;
  nivel: Nivel;
  /** Variable que da el nivel de esa hora (la de mayor valor normalizado); `null` si no hay datos. */
  culpable: string | null;
  /** 0 a 1; solo para desempatar. */
  puntuacion: number;
  /** La hora ya terminó. */
  pasada: boolean;
  /** De dónde viene el nivel: una medición real o la previsión (CAMS). */
  origen: "medido" | "prevision" | null;
  /** Nombre del captador o estación cuando el nivel es medido. */
  lugarMedido?: string;
}

/**
 * Lo que ya se ha medido y manda sobre la previsión (el nivel final de cada hora es el máximo de los dos).
 * Los niveles vienen del estado (umbrales oficiales del pipeline): la web no los recalcula.
 */
export interface Medida {
  variable: string;
  /** 1 bajo … 3 alto. */
  nivel: number;
  lugar: string;
  /** Polen: media diaria, vale para las horas de este día (AAAA-MM-DD, hora de Madrid). */
  dia?: string;
  /** Aire: vale para las horas que empiezan entre estos dos instantes (ISO), ambos incluidos. */
  desde?: string;
  hasta?: string;
}

/**
 * Mediciones del estado que aplican a la franja del perfil:
 *  - polen: el nivel diario del captador de ese municipio, solo para las horas de la fecha del dato
 *    (un dato de hace unos días NO se aplica como suelo a hoy);
 *  - aire: el último nivel de la estación del municipio, desde la hora que midió (`hora` es el final de esa hora) hasta ahora,
 *    si la medición tiene ≤ 3 h.
 */
export function medidasDelPerfil(
  perfil: Pick<Perfil, "afecta" | "polenes">,
  estado: EstadoActual,
  municipio: Pick<Municipio, "estacion" | "captador">,
  lugares: Pick<Lugares, "estaciones" | "captadores">,
  ahora: Date,
): Medida[] {
  const medidas: Medida[] = [];
  const nivelDe = (n: Nivel) => NIVELES.indexOf(n);
  if (perfil.afecta !== "polen") {
    const nombre = lugares.estaciones.find((e) => e.id === municipio.estacion)?.nombre ?? "la estación";
    for (const o of estado.observaciones) {
      if (o.lugar !== municipio.estacion || !(VARIABLES_AIRE as readonly string[]).includes(o.variable)) continue;
      const t = Date.parse(o.hora);
      const n = nivelDe(o.nivel);
      if (Number.isNaN(t) || n <= 0 || t > ahora.getTime() || ahora.getTime() - t > 3 * HORA_MS) continue;
      // `o.hora` es el FINAL de la hora medida (el `hNN` de la Comunidad marca el final: ver DATOS.md y PLAN.md). La medición cubre
      // la hora anterior a `o.hora`, así que su primera barra es la que empieza una hora antes.
      medidas.push({ variable: o.variable, nivel: n, lugar: nombre, desde: new Date(t - HORA_MS).toISOString(), hasta: ahora.toISOString() });
    }
  }
  if (perfil.afecta !== "aire" && municipio.captador) {
    const nombre = lugares.captadores.find((c) => c.id === municipio.captador)?.nombre ?? "el captador";
    for (const tipo of perfil.polenes) {
      const o = estado.observaciones.find((x) => x.lugar === municipio.captador && x.variable === `polen_${tipo}`);
      if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(o.hora)) continue;
      const n = nivelDe(o.nivel);
      if (n > 0) medidas.push({ variable: o.variable, nivel: n, lugar: nombre, dia: o.hora });
    }
  }
  return medidas;
}

/** Variables del perfil más las que solo existen como medición (polen que CAMS no modela). */
export function variablesConMedidas(variables: readonly string[], medidas: readonly Medida[]): string[] {
  return [...new Set([...variables, ...medidas.map((m) => m.variable)])];
}

export interface Ventana {
  desde: string;
  /** Fin exclusivo (inicio de la hora siguiente a la última). */
  hasta: string;
  horaDesde: number;
  horaHasta: number;
  nivel: Nivel;
  /** Variable que más veces da el nivel de la ventana (útil en la peor). */
  culpable: string | null;
}

export interface ResultadoFranja {
  horas: HoraPronostico[];
  variables: string[];
  /** Día sobre el que se habla; `null` si no hay datos utilizables. */
  dia: "hoy" | "manana" | null;
  fechaDia: string | null;
  /** Peor nivel del día objetivo; `sin_dato` si no hay datos. */
  veredicto: Nivel;
  mejor: Ventana | null;
  peor: Ventana | null;
  /** Todas las horas de día tienen el mismo nivel: no hay mejor ni peor momento. */
  todoIgual: boolean;
  /** Ni siquiera la mejor franja del día es buena (todo en nivel alto). */
  sinBuenaHora: boolean;
  /** Si el día no tiene buena hora y el siguiente es mejor: su mejor franja. */
  mejorManana: Ventana | null;
}

const ord = (n: Nivel) => NIVELES.indexOf(n);

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function etiquetaVentana(v: Pick<Ventana, "horaDesde" | "horaHasta">): string {
  return `${pad(v.horaDesde)}:00–${pad(v.horaHasta)}:00`;
}

export interface EntradaFranja {
  horas: readonly string[];
  zona: ZonaPronostico;
  variables: readonly string[];
  ahora: Date;
  /** `manana` fuerza el día siguiente (la herramienta del chat: `desde: "manana"`). */
  desde?: "ahora" | "manana";
  /** Mediciones que se combinan con la previsión (máximo de ambas). */
  medidas?: readonly Medida[];
}

export function calcularFranja({ horas, zona, variables, ahora, desde = "ahora", medidas = [] }: EntradaFranja): ResultadoFranja {
  const maximos = new Map<string, number>();
  for (const v of variables) {
    const serie = zona.valores[v] ?? [];
    maximos.set(v, Math.max(0, ...serie.filter((x): x is number => typeof x === "number")));
  }

  const lista: HoraPronostico[] = horas.map((iso, i) => {
    let nivel = 0;
    let culpable: string | null = null;
    let mejorNorm = -1;
    let puntuacion = 0;
    let origen: "medido" | "prevision" | null = null;
    let lugarMedido: string | undefined;
    const t = Date.parse(iso);
    const dia = iso.slice(0, 10);
    for (const v of variables) {
      const nCams = zona.niveles[v]?.[i] ?? 0;
      let nMed = 0;
      let lugar: string | undefined;
      for (const m of medidas) {
        if (m.variable !== v || m.nivel <= nMed) continue;
        const vale = m.dia ? m.dia === dia : m.desde !== undefined && m.hasta !== undefined && t >= Date.parse(m.desde) - HORA_MS + 1 && t <= Date.parse(m.hasta);
        if (vale) {
          nMed = m.nivel;
          lugar = m.lugar;
        }
      }
      const n = Math.max(nCams, nMed);
      if (n === 0) continue;
      const valor = zona.valores[v]?.[i];
      const max = maximos.get(v) ?? 0;
      const norm = nMed >= nCams ? 1 : typeof valor === "number" && max > 0 ? valor / max : 0;
      puntuacion = Math.max(puntuacion, norm);
      if (n > nivel || (n === nivel && norm > mejorNorm)) {
        nivel = n;
        culpable = v;
        mejorNorm = norm;
        origen = nMed >= nCams ? "medido" : "prevision";
        lugarMedido = origen === "medido" ? lugar : undefined;
      }
    }
    return {
      iso,
      fecha: iso.slice(0, 10),
      hora: Number(iso.slice(11, 13)),
      nivel: NIVELES[nivel] ?? "sin_dato",
      culpable: nivel === 0 ? null : culpable,
      puntuacion,
      pasada: Date.parse(iso) + HORA_MS <= ahora.getTime(),
      origen: nivel === 0 ? null : origen,
      ...(origen === "medido" && nivel > 0 ? { lugarMedido } : {}),
    };
  });

  const hoy = partesLocales(ahora).fecha;
  const enDia = (h: HoraPronostico) => h.hora >= HORA_INICIO_DIA && h.hora <= HORA_FIN_DIA;
  const restantesHoy = lista.filter((h) => h.fecha === hoy && enDia(h) && !h.pasada);
  const fechaManana = lista.map((h) => h.fecha).find((f) => f > hoy) ?? null;

  let dia: "hoy" | "manana" | null = null;
  let fechaDia: string | null = null;
  if (desde === "ahora" && restantesHoy.length >= 2) {
    dia = "hoy";
    fechaDia = hoy;
  } else if (fechaManana) {
    dia = "manana";
    fechaDia = fechaManana;
  }

  const vacio: ResultadoFranja = {
    horas: lista,
    variables: [...variables],
    dia,
    fechaDia,
    veredicto: "sin_dato",
    mejor: null,
    peor: null,
    todoIgual: false,
    sinBuenaHora: false,
    mejorManana: null,
  };
  if (!fechaDia) return vacio;

  const candidatas = lista.filter((h) => h.fecha === fechaDia && enDia(h) && (dia === "manana" || !h.pasada));
  const conDato = candidatas.filter((h) => h.nivel !== "sin_dato");
  if (conDato.length === 0) return vacio;

  const nivelMax = conDato.reduce<Nivel>((m, h) => (ord(h.nivel) > ord(m) ? h.nivel : m), "bajo");
  const nivelMin = conDato.reduce<Nivel>((m, h) => (ord(h.nivel) < ord(m) ? h.nivel : m), "alto");
  const todoIgual = candidatas.length >= 2 && candidatas.every((h) => h.nivel === candidatas[0]!.nivel);

  const resultado = { ...vacio, veredicto: nivelMax, todoIgual };
  if (candidatas.length < 2) return resultado;
  if (!todoIgual) resultado.mejor = elegirMejor(candidatas);

  // Día malo de principio a fin: se propone el día siguiente si es mejor.
  if (nivelMax === "alto" && (todoIgual || resultado.mejor?.nivel === "alto")) {
    resultado.sinBuenaHora = true;
    const diaSig = lista.map((h) => h.fecha).find((f) => f > fechaDia) ?? null;
    if (diaSig) {
      const sig = lista.filter((h) => h.fecha === diaSig && enDia(h));
      const m = sig.length >= 2 ? elegirMejor(sig) : null;
      if (m && ord(m.nivel) < ord("alto")) resultado.mejorManana = m;
    }
  }
  if (todoIgual) return resultado;
  if (ord(nivelMax) >= ord("medio") && ord(nivelMax) > ord(nivelMin)) resultado.peor = elegirPeor(candidatas, nivelMax);
  return resultado;
}

const consecutivas = (a: HoraPronostico, b: HoraPronostico) => Date.parse(b.iso) - Date.parse(a.iso) === HORA_MS;

function media(hs: readonly HoraPronostico[]): number {
  return hs.reduce((s, h) => s + h.puntuacion, 0) / hs.length;
}

function nivelDe(hs: readonly HoraPronostico[]): Nivel {
  return hs.reduce<Nivel>((m, h) => (ord(h.nivel) > ord(m) ? h.nivel : m), "bajo");
}

/** Ventanas de `largo` horas seguidas y con dato. */
function ventanas(hs: readonly HoraPronostico[], largo: number): HoraPronostico[][] {
  const salida: HoraPronostico[][] = [];
  for (let i = 0; i + largo <= hs.length; i++) {
    const trozo = hs.slice(i, i + largo);
    if (trozo.every((h, j) => h.nivel !== "sin_dato" && (j === 0 || consecutivas(trozo[j - 1]!, h)))) salida.push(trozo);
  }
  return salida;
}

function aVentana(hs: readonly HoraPronostico[]): Ventana {
  const primera = hs[0]!;
  const ultima = hs[hs.length - 1]!;
  const cuentas = new Map<string, number>();
  for (const h of hs) if (h.culpable) cuentas.set(h.culpable, (cuentas.get(h.culpable) ?? 0) + 1);
  let culpable: string | null = null;
  let veces = 0;
  for (const [v, n] of cuentas) {
    if (n > veces) {
      culpable = v;
      veces = n;
    }
  }
  return {
    desde: primera.iso,
    hasta: new Date(Date.parse(ultima.iso) + HORA_MS).toISOString(),
    horaDesde: primera.hora,
    horaHasta: ultima.hora + 1,
    nivel: nivelDe(hs),
    culpable,
  };
}

function elegirMejor(candidatas: readonly HoraPronostico[]): Ventana | null {
  for (const nivel of ["bajo", "medio", "alto"] as const) {
    for (const largo of [3, 2]) {
      const validas = ventanas(candidatas, largo).filter((w) => ord(nivelDe(w)) <= ord(nivel));
      if (validas.length === 0) continue;
      // `reduce` con `<` estricto se queda con la más temprana en caso de empate.
      return aVentana(validas.reduce((a, b) => (media(b) < media(a) ? b : a)));
    }
  }
  return null;
}

function elegirPeor(candidatas: readonly HoraPronostico[], nivel: Nivel): Ventana | null {
  // Rachas de horas seguidas al nivel máximo.
  const rachas: HoraPronostico[][] = [];
  for (const h of candidatas) {
    if (h.nivel !== nivel) continue;
    const ultima = rachas[rachas.length - 1];
    if (ultima && consecutivas(ultima[ultima.length - 1]!, h)) ultima.push(h);
    else rachas.push([h]);
  }
  if (rachas.length === 0) return null;
  const MAX = 4;
  const recortadas = rachas.map((r) => {
    if (r.length <= MAX) return r;
    return ventanas(r, MAX).reduce((a, b) => (media(b) > media(a) ? b : a));
  });
  return aVentana(recortadas.reduce((a, b) => (media(b) > media(a) ? b : a)));
}

// --- frases ---

export function fraseVeredicto(nivel: Nivel): string {
  switch (nivel) {
    case "bajo":
      return "buen día para salir";
    case "medio":
      return "mejor con precaución";
    case "alto":
      return "mejor evita el ejercicio al aire libre";
    default:
      return "sin datos suficientes";
  }
}

export function consejo(nivel: Nivel, afecta: Afeccion): string | null {
  const respira = afecta !== "polen";
  switch (nivel) {
    case "bajo":
      return "Buen momento para hacer ejercicio al aire libre.";
    case "medio":
      return respira
        ? "Si tienes asma o EPOC, baja la intensidad y elige la mejor hora."
        : "Si notas síntomas, elige la mejor hora y evita los parques con mucha hierba.";
    case "alto":
      return respira
        ? "Mejor ejercicio en interior. Si sales, lleva tu inhalador de rescate."
        : "Mejor ejercicio en interior. Si sales, lleva tu medicación habitual y date una ducha al volver.";
    default:
      return null;
  }
}

/** Todo el pronóstico de una zona (atajo para el chat y la web). */
export function zonaDe(pronostico: Pronostico, estacion: string): ZonaPronostico | undefined {
  return pronostico.zonas.find((z) => z.lugar === estacion);
}
