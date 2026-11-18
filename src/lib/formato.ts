// Fechas y números en español, siempre en la hora de la península (Europe/Madrid), se abra desde donde se abra.

const ZONA = "Europe/Madrid";
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const partesFecha = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

interface Partes {
  anio: number;
  mes: number;
  dia: number;
  hora: string;
  minuto: string;
}

function partesEnMadrid(fecha: Date): Partes {
  const p: Record<string, string> = {};
  for (const parte of partesFecha.formatToParts(fecha)) p[parte.type] = parte.value;
  return {
    anio: Number(p.year),
    mes: Number(p.month),
    dia: Number(p.day),
    hora: p.hour ?? "00",
    minuto: p.minute ?? "00",
  };
}

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Días de calendario entre dos fechas (año, mes, día), sin horas de por medio. */
function diasEntre(a: Partes, b: Partes): number {
  return Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86_400_000);
}

function diaYMes(p: Pick<Partes, "anio" | "mes" | "dia">, anioActual: number): string {
  const base = `${p.dia} ${MESES[p.mes - 1] ?? ""}`;
  return p.anio === anioActual ? base : `${base} ${p.anio}`;
}

/** «13:00» */
export function horaCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const p = partesEnMadrid(fecha);
  return `${p.hora}:${p.minuto}`;
}

/**
 * Texto legible del último dato de una capa: «hoy, 13:00», «ayer, 22:00», «12 nov, 9:00» o,
 * si solo hay fecha (polen), «hoy», «ayer» o «12 nov». Con `absoluta` (modo histórico) nunca dice «hoy»/«ayer».
 */
export function formatearUltimoDato(valor: string, ahora: Date = new Date(), absoluta = false): string {
  const hoy = partesEnMadrid(ahora);
  const soloFecha = SOLO_FECHA.exec(valor);
  if (soloFecha) {
    const p = { anio: Number(soloFecha[1]), mes: Number(soloFecha[2]), dia: Number(soloFecha[3]), hora: "", minuto: "" };
    const dias = diasEntre(p, hoy);
    if (!absoluta && dias === 0) return "hoy";
    if (!absoluta && dias === 1) return "ayer";
    return diaYMes(p, hoy.anio);
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "sin fecha";
  const p = partesEnMadrid(fecha);
  const hora = `${p.hora}:${p.minuto}`;
  const dias = diasEntre(p, hoy);
  if (!absoluta && dias === 0) return `hoy, ${hora}`;
  if (!absoluta && dias === 1) return `ayer, ${hora}`;
  return `${diaYMes(p, hoy.anio)}, ${hora}`;
}

/** «15 nov 2026, 13:26» (o «12 nov 2026» si solo hay fecha). Para el aviso de datos de respaldo. */
export function fechaHoraLarga(valor: string): string {
  const soloFecha = SOLO_FECHA.exec(valor);
  if (soloFecha) return `${Number(soloFecha[3])} ${MESES[Number(soloFecha[2]) - 1] ?? ""} ${soloFecha[1]}`;
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return "fecha desconocida";
  const p = partesEnMadrid(fecha);
  return `${p.dia} ${MESES[p.mes - 1] ?? ""} ${p.anio}, ${p.hora}:${p.minuto}`;
}

/** Hora de cada punto de una `serie` de 24 h cuyo último valor es el de `horaFinal`. */
export function horaDeSerie(horaFinal: string, indice: number, longitud: number): string {
  const fin = Date.parse(horaFinal);
  if (Number.isNaN(fin)) return "";
  return horaCorta(new Date(fin - (longitud - 1 - indice) * 3_600_000).toISOString());
}

const numero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const numeroEntero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

/** Coma decimal y, como mucho, un decimal: 1.1 → «1,1»; 23 → «23». */
export function formatearNumero(valor: number): string {
  return numero.format(valor);
}

export function formatearEntero(valor: number): string {
  return numeroEntero.format(valor);
}

/** «1,5 km», «44,8 km». */
export function formatearKm(km: number): string {
  return `${numero.format(km)} km`;
}
