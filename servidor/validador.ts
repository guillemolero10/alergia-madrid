// Validador de cifras del texto que escribe el modelo: cada número tiene que salir de las salidas de las herramientas de ese turno,
// de lo que escribió el USUARIO en esta petición o del contexto de la pantalla (servicio, radio, año). Las cifras de mensajes
// «asistente» del historial NO cuentan (las manda el cliente y no se pueden verificar). Si algo no cuadra, el agente sustituye el
// texto por la plantilla del modo sin IA, calculada solo con las salidas. La IA propone y explica; los números los pone el motor.
//
// También rechaza el texto con enlaces, código, HTML, correos o dominios: el agente solo explica, no manda a ninguna dirección.
//
// Reglas de cifras (T4):
//  - Se comprueba TODO número, también el que va entre «comillas latinas» (la cifra «12.345 mayores» no es un nombre).
//  - Un número cuenta como el valor escrito con SU precisión: «94» vale por 93,82 (redondeo a 0 decimales), «93,8» también, pero
//    «95» no, y un entero exacto (1.581) solo vale por 1.581 (nada de ±1: sería abrir hueco a cualquier cifra cercana).
//  - «1,3 millones» / «10 mil» valen si redondean una cifra de las herramientas con los decimales escritos (1.342.648 -> 1,3).
//  - Un entero de 4 cifras 2000-2039 solo es un año (y se ignora) si es 2025 o 2030 con contexto de año («en 2030», «año 2025»,
//    «(2030)»). «Faltan 2024 plazas» se comprueba como cualquier cifra.
//  - Las constantes del método (65, 75, 3 a 16 años, 5 años de tramo, 6 servicios, «por cada 100», radios de los servicios en m/km)
//    valen SOLO con su contexto («mayores de 65», «3 a 16 años», «6 servicios», «2 km»), no sueltas. 0 y 1 valen siempre.
//  - Números escritos con letras por encima de «diez» (veinte, cien, doscientos, docena…) y «mil / millón / millones» sin dígito
//    delante se rechazan: el prompt exige cifras en dígitos.
//  - Un número que no cabe en un `number` (400 cifras) se rechaza.
//
// Sin DOM, sin red. Los formatos son los españoles: «2.140», «1 581», «4,3», «78 %».
import { SERVICIOS } from "../src/lib/donde/servicios";

export interface NumeroEnTexto {
  /** Valor tal como está escrito (sin aplicar «mil» / «millones»). Puede ser `Infinity`. */
  valor: number;
  /** Decimales escritos. */
  decimales: number;
  /** 1, 1.000 o 1.000.000 según «mil» / «millones» escrito detrás. */
  escala: number;
  /** Texto del número tal como aparece (para los avisos). */
  bruto: string;
  /** Hasta 24 caracteres antes y después del número (para las constantes con contexto y los años). */
  antes: string;
  despues: string;
}

const ESPACIOS_MILES = "[ \\u00A0\\u202F\\u2009]";
// 1.581 | 1 581 (espacio normal, duro o fino, grupos de 3) | 1581; luego decimal con coma o punto; luego «mil» / «millones».
const RE_NUMERO = new RegExp(
  `(\\d{1,3}(?:\\.\\d{3})+(?!\\d)|\\d{1,3}(?:${ESPACIOS_MILES}\\d{3})+(?!\\d)|\\d+)(?:,(\\d+)|\\.(\\d+))?(?:\\s*(millones|mill[oó]n|mil)(?![a-záéíóúñ]))?`,
  "giu",
);

/** Texto sin horas («10:00»), marcadores de lista («1)», «2.» al empezar línea) ni comillas latinas (su contenido SÍ se comprueba). */
function limpiar(texto: string): string {
  return texto
    .replace(/[«»]/g, " ")
    .replace(/\b\d{1,2}:\d{2}\b/g, " ")
    .replace(/(^|\n)\s*\d{1,2}[.)]\s/g, "$1 ")
    // Marcadores en mitad de línea («; 2) Pinto»): una sola cifra, con espacio antes y palabra después. «(87)» o «Pinto 45)» SÍ se comprueban (R2-I2).
    .replace(/(^|\s)[1-9]\)\s+(?=\p{L})/gu, "$1 ");
}

/** Todos los números del texto con su contexto. */
export function extraerNumeros(texto: string): NumeroEnTexto[] {
  const limpio = limpiar(texto.normalize("NFKC"));
  const salida: NumeroEnTexto[] = [];
  for (const m of limpio.matchAll(RE_NUMERO)) {
    const entero = m[1]!.replace(/[.    ]/g, "");
    const dec = m[2] ?? m[3] ?? "";
    const valor = Number(dec ? `${entero}.${dec}` : entero);
    const palabra = m[4]?.toLowerCase();
    const escala = palabra === undefined ? 1 : palabra === "mil" ? 1e3 : 1e6;
    const i = m.index ?? 0;
    salida.push({ valor, decimales: dec.length, escala, bruto: m[0], antes: limpio.slice(Math.max(0, i - 24), i), despues: limpio.slice(i + m[0].length, i + m[0].length + 24) });
  }
  return salida;
}

/** Números de un texto escrito en español, con «mil» / «millones» ya aplicados. No ignora nada salvo horas y marcadores de lista. */
export function numerosDelTexto(texto: string): number[] {
  return extraerNumeros(texto).map((n) => n.valor * n.escala);
}

const CLAVES_OCULTAS = new Set(["lat", "lon"]);

/** La salida de una herramienta tal como la ve el modelo: sin coordenadas (el modelo nunca las escribe: el mapa las pinta). */
export function paraElModelo<T>(x: T): T {
  if (Array.isArray(x)) return x.map((v) => paraElModelo(v)) as unknown as T;
  if (x && typeof x === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) if (!CLAVES_OCULTAS.has(k)) o[k] = paraElModelo(v);
    return o as T;
  }
  return x;
}

/** Campos de una fila `aproximada: true` cuyos números no se pueden citar. */
const CAMPOS_NO_FIABLES = new Set(["pct", "en_deficit", "objetivo", "pct_deficit", "personas_deficit", "ratio", "brecha"]);

/** Todos los números que el texto puede citar: los de las salidas (con sus formas habituales) y los de los textos dados (solo del usuario). */
export function numerosPermitidos(salidas: readonly unknown[], textosAjenos: readonly string[] = []): Set<number> {
  const out = new Set<number>();
  const anadir = (n: number) => {
    if (Number.isFinite(n)) out.add(n);
  };
  const rec = (x: unknown): void => {
    if (typeof x === "number" && Number.isFinite(x)) {
      anadir(x);
      anadir(Math.abs(x));
      anadir(x / 1000); // metros -> km
      if (x > 0 && x <= 1) anadir(x * 100); // fracción -> %
    } else if (typeof x === "string") for (const n of numerosDelTexto(x)) anadir(n);
    else if (Array.isArray(x)) {
      anadir(x.length);
      for (const v of x) rec(v);
    } else if (x && typeof x === "object") {
      // Una fila «aproximada» (centro dentro, secciones enormes) no tiene porcentaje fiable: su texto no puede citarlo.
      const aprox = (x as { aproximada?: unknown }).aproximada === true;
      for (const [k, v] of Object.entries(x)) if (!(aprox && CAMPOS_NO_FIABLES.has(k))) rec(v);
    }
  };
  for (const s of salidas) rec(paraElModelo(s));
  for (const t of textosAjenos) for (const n of numerosDelTexto(t)) anadir(n);
  return out;
}

/** ¿`p` redondeado a `decimales` decimales es `n`? (el redondeo que escribiría una persona) */
function redondeaA(p: number, n: number, decimales: number): boolean {
  const f = 10 ** Math.min(decimales, 8);
  return Math.abs(Math.round(Math.abs(p) * f + 1e-9) / f - Math.abs(n)) < 1e-9;
}

/** Decimales de un número normal (4,11 -> 2). Solo para el uso suelto de `esPermitido` con un número ya leído. */
function decimalesDe(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0;
  const m = /\.(\d+)$/.exec(String(n));
  return m ? m[1]!.length : 0;
}

/**
 * ¿Sale `n` de los números permitidos? Con los decimales escritos: «94» vale por 93,82 y «93,8» también, «95» no; un entero
 * exacto solo vale por sí mismo. Un número no finito nunca vale.
 */
export function esPermitido(n: number, permitidos: ReadonlySet<number>, decimales: number = decimalesDe(n), escala = 1): boolean {
  if (!Number.isFinite(n) || !Number.isFinite(n * escala)) return false;
  for (const p of permitidos) if (redondeaA(p / escala, n, decimales)) return true;
  return false;
}

// ---------------------------------------------------------------- constantes del método, solo con su contexto
const RADIOS = new Set<number>();
for (const s of Object.values(SERVICIOS)) for (const r of s.radios) { RADIOS.add(r); RADIOS.add(r / 1000); }

const UNIDAD_DISTANCIA = /^\s*(?:m|metros?|km|kil[oó]metros?)(?![a-záéíóúñ])/i;
const EDAD_DESPUES = /^\s*(?:a[ñn]os|\+|%?\s*o m[aá]s|y m[aá]s)(?![a-záéíóúñ])/i;

/** Constantes de la metodología que el texto puede citar sin que salgan de una herramienta, con el contexto que las hace legítimas. */
function esConstanteConContexto(n: NumeroEnTexto): boolean {
  if (n.escala !== 1 || n.decimales > 1) return false;
  const v = n.valor;
  if (v === 0 || v === 1) return true;
  if ((v === 65 || v === 75 || v === 5 || v === 3 || v === 16) && (EDAD_DESPUES.test(n.despues) || /mayores de\s*$/i.test(n.antes) || /(?:poblaci[oó]n|habitantes|personas) de\s*$/i.test(n.antes))) return true;
  if (v === 3 && /^\s*(?:a|y|-|–)\s*16(?!\d)/i.test(n.despues)) return true;
  if (v === 16 && /(?<![\d,.])3\s*(?:a|y|-|–)\s*$/i.test(n.antes)) return true;
  if (v === 6 && /^\s*servicios(?![a-záéíóúñ])/i.test(n.despues)) return true;
  if (v === 100 && /\bcada\s*$/i.test(n.antes)) return true;
  if (RADIOS.has(v) && UNIDAD_DISTANCIA.test(n.despues)) return true;
  return false;
}

/** La app nunca escribe «100 %» si no es exacto: un 99,5-99,99 se muestra «99 %» (`pctEs`). El modelo puede imitarlo. */
function esNoventaYNuevePorCiento(n: NumeroEnTexto, permitidos: ReadonlySet<number>): boolean {
  if (n.valor !== 99 || n.decimales !== 0 || n.escala !== 1 || !/^\s*%/.test(n.despues)) return false;
  for (const p of permitidos) if (p >= 99.5 && p < 100) return true;
  return false;
}

/** ¿Es un año de la app con contexto de año («en 2030», «año 2025», «(2030)»)? Solo 2025 y 2030, sin separadores ni decimales. */
function esAnioConContexto(n: NumeroEnTexto): boolean {
  if (n.escala !== 1 || n.decimales > 0 || !/^\d{4}$/.test(n.bruto) || (n.valor !== 2025 && n.valor !== 2030)) return false;
  if (/^\s*(?:plazas|personas|mayores|habitantes|centros|residencias|vecinos|secciones|municipios|euros|metros|farmacias|colegios)\b/i.test(n.despues)) return false;
  return /(?:\b(?:en|de|del|desde|hasta|para|hacia|a[ñn]o|a[ñn]os|censo|padr[oó]n|proyecci[oó]n|previsi[oó]n|con|hoy)\s+|\b(?:proyecci[oó]n|previsi[oó]n|escenario)\s+a\s+|[(])$/i.test(n.antes);
}

// ---------------------------------------------------------------- números con letras
const RE_NUMERO_EN_LETRAS = new RegExp(
  "(?<![a-záéíóúñ])(?:once|doce|trece|catorce|quince|diecis[eé]is|diecisiete|dieciocho|diecinueve|veinte|veinti(?:[uú]n[oa]?|d[oó]s|tr[eé]s|cuatro|cinco|s[eé]is|siete|ocho|nueve)|treinta|cuarenta|cincuenta|sesenta|setenta|ochenta|noventa|cien|ciento|" +
    "doscient[oa]s|trescient[oa]s|cuatrocient[oa]s|quinient[oa]s|seiscient[oa]s|setecient[oa]s|ochocient[oa]s|novecient[oa]s|cientos|miles|mil|millares?|mill[oó]n|millones|centenares?|docenas?|decenas?)(?![a-záéíóúñ])",
  "iu",
);

// ---------------------------------------------------------------- enlaces
const DOMINIOS_CONOCIDOS = "com|es|org|net|io|app|dev|xyz|info|eu|gob|edu|gov|co|me|ly|tv|ai|cat|madrid|online|site|cloud";
// Sin la marca «i» a propósito en la primera: un dominio real va en minúsculas (parla.es, bit.ly, gob.madrid); «Parla.El» (frase sin espacio) no lo es.
const RE_DOMINIO_MINUSCULAS = /\b[A-Za-z0-9-]+\.[a-z]{2,24}\b/;
const RE_ENLACE = new RegExp(
  [
    "https?:|ftps?:|mailto:|tel:|sms:|file:|www\\.|\\/\\/|@",
    "`|<\\/?[a-z][^>]*>|\\]\\(|\\bjavascript:|\\bdata:",
    // cualquier TLD conocido aunque vaya en mayúsculas (EJEMPLO.COM), o una ruta (palabra.palabra/)
    `\\b[A-Za-z0-9-]+\\.(?:${DOMINIOS_CONOCIDOS})\\b`,
    "\\b[A-Za-z0-9-]+\\.[A-Za-z]{2,}\\/",
  ].join("|"),
  "i",
);

function hayEnlace(t: string): boolean {
  return RE_DOMINIO_MINUSCULAS.test(t) || RE_ENLACE.test(t);
}

export type VeredictoTexto = { ok: true } | { ok: false; motivo: "cifras" | "enlaces" | "largo" | "vacio"; detalle?: string };

export const MAX_CARACTERES_TEXTO = 2000;

export function validarTexto(texto: string, permitidos: ReadonlySet<number>): VeredictoTexto {
  // NFKC: los dígitos de ancho completo («１２３») pasan a 0-9 y se comprueban (R2-M7).
  const t = texto.normalize("NFKC").trim();
  if (!t) return { ok: false, motivo: "vacio" };
  if (t.length > MAX_CARACTERES_TEXTO) return { ok: false, motivo: "largo" };
  if (hayEnlace(t)) return { ok: false, motivo: "enlaces" };

  const sobran: string[] = [];
  for (const n of extraerNumeros(t)) {
    if (esAnioConContexto(n) || esConstanteConContexto(n) || esNoventaYNuevePorCiento(n, permitidos)) continue;
    if (!esPermitido(n.valor, permitidos, n.decimales, n.escala)) sobran.push(n.bruto.trim());
  }
  if (sobran.length) return { ok: false, motivo: "cifras", detalle: sobran.slice(0, 5).join(", ") };

  // Lo que queda al quitar los números en dígitos (con su «mil» / «millones»): una cifra escrita con letras ya no se puede comprobar.
  const sinDigitos = limpiar(t).replace(RE_NUMERO, " ");
  const letras = RE_NUMERO_EN_LETRAS.exec(sinDigitos);
  if (letras) return { ok: false, motivo: "cifras", detalle: letras[0] };
  return { ok: true };
}
