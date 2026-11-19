// Carga de los JSON de `public/donde/`. La web usa `fetch`; Node (tests, `api/agente.ts`, scripts) usa `fs`.
// Los dos devuelven el mismo objeto `Datos`. Sin `import.meta.env`.
import { aplicarProyeccion, validarProyeccionConOrden, type Proyeccion } from "./proyeccion";
import { SERVICIO_IDS } from "./servicios";
import type { Centros, Datos, Secciones, ServicioId, Territorios } from "./tipos";

/** Lee un JSON relativo a la carpeta `donde/` (por ejemplo `secciones.json` o `servicios/dea.json`). */
export type Lector = (ruta: string) => Promise<unknown>;

export class ErrorCarga extends Error {
  constructor(public ruta: string, motivo: string) {
    super(`No se pudo cargar ${ruta}: ${motivo}`);
    this.name = "ErrorCarga";
  }
}

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

export function validarSecciones(x: unknown): Secciones {
  if (!esObjeto(x) || x.version !== 1) throw new ErrorCarga("secciones.json", "versión no soportada");
  const n = Array.isArray(x.ids) ? x.ids.length : -1;
  for (const k of ["mun", "distrito", "zona", "lat", "lon", "area_km2"]) {
    if (!Array.isArray(x[k]) || (x[k] as unknown[]).length !== n) throw new ErrorCarga("secciones.json", `la columna «${k}» no cuadra`);
  }
  const pob = x.pob;
  if (!esObjeto(pob)) throw new ErrorCarga("secciones.json", "falta «pob»");
  for (const g of ["total", "0_14", "3_16", "65_mas", "75_mas"]) {
    if (!Array.isArray(pob[g]) || (pob[g] as unknown[]).length !== n) throw new ErrorCarga("secciones.json", `pob.${g} no cuadra`);
  }
  return x as unknown as Secciones;
}

export function validarCentros(x: unknown, ruta: string): Centros {
  if (!esObjeto(x) || x.version !== 1) throw new ErrorCarga(ruta, "versión no soportada");
  const n = Array.isArray(x.ids) ? x.ids.length : -1;
  for (const k of ["mun", "lat", "lon"]) {
    if (!Array.isArray(x[k]) || (x[k] as unknown[]).length !== n) throw new ErrorCarga(ruta, `la columna «${k}» no cuadra`);
  }
  // `otros_sociales.json` no publica nombres (privacidad, R1): si falta la columna se rellena con vacíos; si viene, debe cuadrar.
  if (x.nombres !== undefined && (!Array.isArray(x.nombres) || x.nombres.length !== n)) throw new ErrorCarga(ruta, "la columna «nombres» no cuadra");
  if (x.plazas !== undefined && (!Array.isArray(x.plazas) || x.plazas.length !== n)) throw new ErrorCarga(ruta, "las plazas no cuadran");
  return (x.nombres === undefined ? { ...x, nombres: new Array<string>(n).fill("") } : x) as unknown as Centros;
}

function validarTerritorios(x: unknown): Territorios {
  if (!esObjeto(x) || x.version !== 1 || !Array.isArray(x.municipios) || !Array.isArray(x.zonas)) {
    throw new ErrorCarga("territorios.json", "formato no válido");
  }
  return x as unknown as Territorios;
}

export interface OpcionesCarga {
  /** Servicios que se cargan (por defecto, los 7). El DEA pesa 1,5 MB: pídelo solo si hace falta. */
  servicios?: readonly ServicioId[];
  /** Carga también `servicios/otros_sociales.json`. */
  otrosSociales?: boolean;
}

export async function cargarDatos(lector: Lector, opciones: OpcionesCarga = {}): Promise<Datos> {
  const ids = opciones.servicios ?? SERVICIO_IDS;
  const [secciones, territorios, ...centros] = await Promise.all([
    lector("secciones.json").then(validarSecciones),
    lector("territorios.json").then(validarTerritorios),
    ...ids.map((id) => lector(`servicios/${id}.json`).then((x) => validarCentros(x, `servicios/${id}.json`))),
  ]);
  const servicios: Datos["servicios"] = {};
  ids.forEach((id, k) => { servicios[id] = centros[k]; });
  const datos: Datos = { secciones, territorios, servicios };
  if (opciones.otrosSociales) datos.otrosSociales = validarCentros(await lector("servicios/otros_sociales.json"), "servicios/otros_sociales.json");
  return datos;
}

/** Carga un servicio suelto (para cargarlo al elegirlo). */
export async function cargarServicio(lector: Lector, id: ServicioId): Promise<Centros> {
  return validarCentros(await lector(`servicios/${id}.json`), `servicios/${id}.json`);
}

/** Los otros centros de servicios sociales (discapacidad, infancia, personas sin hogar…): solo se cuentan, no se mapean. */
export async function cargarOtrosSociales(lector: Lector): Promise<Centros> {
  return validarCentros(await lector("servicios/otros_sociales.json"), "servicios/otros_sociales.json");
}

/**
 * La población proyectada a 2030 (`secciones_2030.json`, 39 kB comprimidos): solo se pide al elegir 2030. Comprueba que trae las mismas
 * secciones (`n` y sha1 de los ids) y devuelve la proyección y las secciones con `pob` sustituida.
 */
export async function cargarProyeccion(lector: Lector, secciones: Secciones): Promise<{ proyeccion: Proyeccion; secciones: Secciones }> {
  const proyeccion = await validarProyeccionConOrden(await lector("secciones_2030.json"), secciones);
  return { proyeccion, secciones: aplicarProyeccion(secciones, proyeccion) };
}

// ---------------------------------------------------------------- navegador
export function lectorWeb(base = "/donde/"): Lector {
  const b = base.endsWith("/") ? base : `${base}/`;
  return async (ruta) => {
    let res: Response;
    try {
      res = await fetch(b + ruta);
    } catch (e) {
      throw new ErrorCarga(ruta, e instanceof Error ? e.message : "sin conexión");
    }
    if (!res.ok) throw new ErrorCarga(ruta, `HTTP ${res.status}`);
    try {
      return await res.json();
    } catch {
      throw new ErrorCarga(ruta, "el archivo no es un JSON válido");
    }
  };
}

export function cargarDatosWeb(base = "/donde/", opciones?: OpcionesCarga): Promise<Datos> {
  return cargarDatos(lectorWeb(base), opciones);
}

// ---------------------------------------------------------------- Node
interface FsPromesas {
  readFile(ruta: string | URL, codificacion: "utf-8"): Promise<string>;
}

/** `dir`: ruta de carpeta o URL de carpeta (acabada en `/`). */
export function lectorNode(dir: string | URL): Lector {
  return async (ruta) => {
    // El nombre del módulo va en una variable para que ni `tsc` ni Vite lo traten como dependencia del navegador.
    const modulo = "node:fs/promises";
    const fs = (await import(/* @vite-ignore */ modulo)) as FsPromesas;
    const destino = typeof dir === "string" ? `${dir.replace(/\/$/, "")}/${ruta}` : new URL(ruta, dir);
    return JSON.parse(await fs.readFile(destino, "utf-8"));
  };
}

export function cargarDatosNode(dir: string | URL, opciones?: OpcionesCarga): Promise<Datos> {
  return cargarDatos(lectorNode(dir), opciones);
}
