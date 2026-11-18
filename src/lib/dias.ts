import { validarEstado, validarPronostico } from "./datos";
import type { EstadoActual, Pronostico } from "./tipos";

// Días históricos: JSON estáticos que viajan con la web (public/dias), así no dependen de la rama `datos`.

export const BASE_DIAS = `${import.meta.env.BASE_URL}dias`;

export interface DiaHistorico {
  /** AAAA-MM-DD */
  fecha: string;
  titulo: string;
  nota: string;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `true` si es una fecha de calendario real con forma AAAA-MM-DD. */
export function esFechaValida(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const m = FORMATO_FECHA.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

/** «19 de mayo» */
export function fechaSinAnio(fecha: string): string {
  const m = FORMATO_FECHA.exec(fecha);
  return m ? `${Number(m[3])} de ${MESES[Number(m[2]) - 1] ?? ""}` : fecha;
}

/** «19 de mayo de 2026» */
export function fechaLargaDia(fecha: string): string {
  const m = FORMATO_FECHA.exec(fecha);
  return m ? `${fechaSinAnio(fecha)} de ${m[1]}` : fecha;
}

/** «19 may» (para chips). */
export function fechaCortaDia(fecha: string): string {
  const m = FORMATO_FECHA.exec(fecha);
  return m ? `${Number(m[3])} ${(MESES[Number(m[2]) - 1] ?? "").slice(0, 3)}` : fecha;
}

/** Lee `?fecha=` de la URL. Devuelve `null` (= hoy) si falta o no es una fecha válida. */
export function fechaDeLaUrl(search: string): string | null {
  const v = new URLSearchParams(search).get("fecha");
  return esFechaValida(v) ? v : null;
}

/** Devuelve la búsqueda con `fecha` puesta (o quitada si es `null`), conservando el resto de parámetros. */
export function busquedaConFecha(search: string, fecha: string | null): string {
  const p = new URLSearchParams(search);
  if (fecha) p.set("fecha", fecha);
  else p.delete("fecha");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Índice de días: descarta entradas mal formadas y las ordena de la más antigua a la más reciente. */
export function validarIndice(json: unknown): DiaHistorico[] {
  if (!Array.isArray(json)) return [];
  const dias: DiaHistorico[] = [];
  for (const e of json) {
    if (typeof e !== "object" || e === null) continue;
    const o = e as Record<string, unknown>;
    if (!esFechaValida(o.fecha) || typeof o.titulo !== "string") continue;
    dias.push({ fecha: o.fecha, titulo: o.titulo, nota: typeof o.nota === "string" ? o.nota : "" });
  }
  return dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Fecha pedida si está en el índice; si no, `null` (= hoy). */
export function fechaEnIndice(fecha: string | null, indice: readonly DiaHistorico[]): string | null {
  return fecha && indice.some((d) => d.fecha === fecha) ? fecha : null;
}

async function pedir(url: string, pedirFn: typeof globalThis.fetch): Promise<unknown> {
  const r = await pedirFn(url, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export async function cargarIndice(pedirFn: typeof globalThis.fetch = globalThis.fetch): Promise<DiaHistorico[]> {
  return validarIndice(await pedir(`${BASE_DIAS}/indice.json`, pedirFn));
}

export interface DiaCargado {
  estado: EstadoActual;
  pronostico: Pronostico;
}

export async function cargarDia(fecha: string, pedirFn: typeof globalThis.fetch = globalThis.fetch): Promise<DiaCargado> {
  if (!esFechaValida(fecha)) throw new Error("fecha no válida");
  const [e, p] = await Promise.all([pedir(`${BASE_DIAS}/${fecha}/estado.json`, pedirFn), pedir(`${BASE_DIAS}/${fecha}/pronostico.json`, pedirFn)]);
  return { estado: validarEstado(e), pronostico: validarPronostico(p) };
}
