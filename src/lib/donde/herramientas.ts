// Las 5 herramientas del agente de «¿Dónde hace falta?» como funciones puras sobre el motor. Las usan el modo sin IA
// (`intencion.ts`, en el navegador) y la función `api/agente.ts` (Node, tarea I2). Sin DOM, sin `import.meta.env`,
// sin red ni claves: todo lo que calculan sale de `Datos`.
//
// Cada herramienta devuelve la salida (con las cifras), las `Accion` que la web ejecutará en orden y un `PasoAgente`
// («He consultado: …»). Los números de los textos se sacan siempre de estas salidas.
import { fichaLugar, ranking } from "./agregados";
import { calcularEstado, optimo, simular, umbralDeHoy, type OpcionesEstado } from "./cobertura";
import { ANIO_PROYECCION, type AnioDonde } from "./proyeccion";
import { esLugar, lugarPorId, municipioEn, resolverLugar } from "./lugares";
import { decimal2Es, enteroEs, radioEs } from "./panelDonde";
import { esServicioId, SERVICIO_IDS, SERVICIOS, UMBRAL_DEFICIT_POR_DEFECTO } from "./servicios";
import { compararConOptimo, decimalCortoEs, detalleSimulacion, plazasEfectivas, porQueNadieGana, valorPrincipal } from "./tuDecides";
import type {
  Accion,
  Centros,
  ContextoAgente,
  Datos,
  EstadoServicio,
  FilaFicha,
  FilaRanking,
  LugarResuelto,
  Secciones,
  NivelTerritorio,
  PasoAgente,
  ServicioId,
  UmbralDeficit,
} from "./tipos";
import { coordenadasValidas, esServicioConPlazas, ordenPorDefecto, type OrdenRanking } from "./urlDonde";

// ================================================================ entorno (datos + caché de estados)
export interface OpcionesEntorno {
  /** Pide los centros de un servicio que no está en `datos.servicios` (en la web, `fetch`; en Node, `fs`). */
  cargarServicio?: (id: ServicioId) => Promise<Centros>;
  /** Alias por id de municipio (de `lugares.json`): «Fuenla» -> `mun:28058`. */
  aliasLugares?: Record<string, string[]>;
  /** Lo que se ve en pantalla: servicio y radio elegidos, lugar de «Mi municipio». */
  contexto?: Partial<ContextoAgente>;
  /** Umbral de los servicios con plazas; por defecto `UMBRAL_DEFICIT_POR_DEFECTO`. */
  referencia?: UmbralDeficit;
  /**
   * Las secciones con la población de HOY. Si `datos.secciones` es otro año (la proyección a 2030), el umbral de los servicios con plazas
   * se calcula con estas y se mantiene fijo: así el déficit de 2030 se mide con la referencia de hoy y no desaparece por definición.
   */
  seccionesHoy?: Secciones;
  /**
   * Los datos de HOY (censo de 2025). Si `datos` es la proyección a 2030, `ficha_municipio` se calcula con estos: la ficha de «Mi municipio»
   * es siempre de hoy y el agente tiene que contar lo mismo que se ve al abrirla.
   */
  datosHoy?: Datos;
}

export interface Entorno {
  readonly datos: Datos;
  readonly opciones: OpcionesEntorno;
  /** Estado (déficit por sección) del servicio con el radio del contexto o el del catálogo. */
  estado(servicio: ServicioId): Promise<EstadoServicio>;
  /** El mismo entorno (y las mismas cachés) con otro contexto de pantalla. */
  conContexto(contexto: Partial<ContextoAgente> | undefined): Entorno;
}

const CACHE_ESTADOS = new WeakMap<Datos, Map<string, EstadoServicio>>();
const CACHE_CARGAS = new WeakMap<Datos, Map<ServicioId, Promise<Centros>>>();

export function crearEntorno(datos: Datos, opciones: OpcionesEntorno = {}): Entorno {
  const estados = CACHE_ESTADOS.get(datos) ?? new Map<string, EstadoServicio>();
  CACHE_ESTADOS.set(datos, estados);
  const cargas = CACHE_CARGAS.get(datos) ?? new Map<ServicioId, Promise<Centros>>();
  CACHE_CARGAS.set(datos, cargas);

  const entorno: Entorno = {
    datos,
    opciones,
    async estado(servicio) {
      let centros = datos.servicios[servicio];
      if (!centros) {
        if (!opciones.cargarServicio) throw new Error(`Faltan los datos del servicio «${servicio}»`);
        let p = cargas.get(servicio);
        if (!p) {
          p = opciones.cargarServicio(servicio);
          cargas.set(servicio, p);
        }
        try {
          centros = await p;
        } catch (e) {
          cargas.delete(servicio);
          throw e;
        }
        datos.servicios[servicio] = centros;
      }
      const radio = radioDelContexto(servicio, opciones.contexto);
      let umbral: UmbralDeficit | undefined = esServicioConPlazas(servicio) ? (opciones.referencia ?? UMBRAL_DEFICIT_POR_DEFECTO) : undefined;
      if (umbral !== undefined && opciones.seccionesHoy && opciones.seccionesHoy !== datos.secciones) {
        umbral = umbralDeHoy(servicio, opciones.seccionesHoy, centros, radio, umbral);
      }
      const clave = `${servicio}|${radio}|${String(umbral)}`;
      let e = estados.get(clave);
      if (!e) {
        const op: OpcionesEstado = umbral === undefined ? { radio_m: radio } : { radio_m: radio, umbral };
        e = calcularEstado(servicio, datos.secciones, centros, op);
        estados.set(clave, e);
      }
      return e;
    },
    conContexto(contexto) {
      return crearEntorno(datos, { ...opciones, contexto });
    },
  };
  return entorno;
}

function radioDelContexto(servicio: ServicioId, c: Partial<ContextoAgente> | undefined): number {
  const r = c?.radio_m;
  if (c?.servicio === servicio && typeof r === "number" && Number.isFinite(r) && r > 0) return r;
  return SERVICIOS[servicio].radioDefecto;
}

// ================================================================ resultados
export type CodigoError = "entrada" | "servicio" | "lugar" | "zona_no_agrupa" | "fuera" | "datos";

export interface ErrorHerramienta {
  codigo: CodigoError;
  mensaje: string;
  /** Nombres de lugares parecidos (`lugar`). */
  sugerencias?: string[];
}

export interface Ambito {
  tipo: "comunidad" | "zona" | "municipio" | "distrito";
  nombre: string;
}

interface Comun {
  /** Año de la población con la que se calcula: 2025 (hoy) o 2030 (proyección del INE; el reparto por sección es un modelo). */
  anio_poblacion: number;
  servicio: ServicioId;
  radio_m: number;
  /** Distancia: el radio en metros. Plazas: plazas por cada 100 mayores con las que se compara. */
  umbral: number;
  /** Frase del criterio de déficit, con el radio y el umbral reales. */
  criterio: string;
  ambito: Ambito;
}

export interface SalidaRanking extends Comun {
  nivel: NivelTerritorio;
  orden: OrdenRanking;
  umbral_unidad: "metros" | "plazas_por_100";
  filas: FilaRanking[];
  total_objetivo: number;
  total_deficit: number;
  fuente: string;
  fecha_datos: string;
}

export interface PuntoSalida {
  lat: number;
  lon: number;
  seccion: string;
  municipio_id: string;
  municipio: string;
  /** Distancia: personas que ganan acceso. Plazas: mayores en zonas que dejan de estar por debajo del umbral (secundaria). */
  ganan: number;
  acumulado: number;
  /** Solo plazas: N de este punto (plazas que faltan que se reducen, 2 decimales) y la suma hasta él. */
  reduce?: number;
  reduce_acumulado?: number;
  /** Solo plazas: qué % de las plazas del centro llega a zonas con déficit (N / plazas, 1 decimal). */
  pct_plazas_utiles?: number;
}

export interface SalidaOptima extends Comun {
  n: number;
  n_pedido: number;
  plazas: number | null;
  puntos: PuntoSalida[];
  deficit_antes: number;
  deficit_despues: number;
  candidatos: number;
  /** Solo plazas: N total y plazas que faltan en la Comunidad antes y después (umbral fijo). */
  reduce_total?: number;
  faltan_antes?: number;
  faltan_despues?: number;
}

export interface SalidaSimulacion extends Comun {
  lugar: string;
  municipio_id: string;
  municipio: string;
  lat: number;
  lon: number;
  plazas: number | null;
  ganan: number;
  deficit_antes: number;
  deficit_despues: number;
  /** Solo plazas: N (plazas que faltan que se reducen, 2 decimales), qué % de las plazas del centro es útil y plazas que faltan antes y después. */
  reduce?: number;
  pct_plazas_utiles?: number;
  faltan_antes?: number;
  faltan_despues?: number;
  detalle: string;
  /** Solo si nadie gana: la razón más probable. */
  por_que_nadie_gana: string | null;
  comparado_con_optimo: {
    zona: string;
    ganan_optimo: number;
    /** Solo plazas: N del mejor punto del modelo. */
    reduce_optimo?: number;
    /** % del óptimo que logra el punto (null si el modelo no gana nada). */
    pct: number | null;
    supera: boolean;
    municipio_optimo: string | null;
  };
}

export interface FilaFichaSalida extends FilaFicha {
  nombre: string;
  radio_m: number;
  grupo: string;
  /** Frase del criterio de déficit con el radio y el umbral reales (como en las demás salidas). */
  criterio: string;
  /** Solo servicios con plazas: umbral de plazas por cada 100 mayores con el que se mide el déficit, y de dónde sale. */
  umbral?: number;
  referencia_texto?: string;
}

export interface SalidaFicha {
  lugar: string;
  nombre: string;
  nivel: NivelTerritorio;
  poblacion: number;
  anio_poblacion: number;
  servicios: FilaFichaSalida[];
  faltan: ServicioId[];
  /** El aire de hoy lo añade la web (F7); esta herramienta no sale a la red. */
  aire_hoy: null;
  /** Con 2030 elegido en el simulador: la ficha se ha calculado igualmente con la población de hoy. */
  ficha_de_hoy?: boolean;
}

export interface SalidaMover {
  ok: true;
  nombre: string;
}

export type Resultado<N extends string, S> =
  | { ok: true; herramienta: N; salida: S; acciones: Accion[]; paso: PasoAgente }
  | { ok: false; herramienta: N; error: ErrorHerramienta };

export type ResultadoRanking = Resultado<"ranking_deficit", SalidaRanking>;
export type ResultadoOptima = Resultado<"ubicacion_optima", SalidaOptima>;
export type ResultadoSimulacion = Resultado<"simular_centro", SalidaSimulacion>;
export type ResultadoFicha = Resultado<"ficha_municipio", SalidaFicha>;
export type ResultadoMover = Resultado<"mover_mapa", SalidaMover>;
export type ResultadoHerramienta = ResultadoRanking | ResultadoOptima | ResultadoSimulacion | ResultadoFicha | ResultadoMover;

export type NombreHerramienta = ResultadoHerramienta["herramienta"];
export const NOMBRES_HERRAMIENTAS: readonly NombreHerramienta[] = [
  "ranking_deficit",
  "ubicacion_optima",
  "simular_centro",
  "ficha_municipio",
  "mover_mapa",
];

// ================================================================ entradas
export interface EntradaRanking {
  servicio: ServicioId;
  zona?: string;
  nivel?: "municipio" | "distrito";
  orden?: OrdenRanking;
  limite?: number;
}
export interface EntradaOptima {
  servicio: ServicioId;
  zona?: string;
  n?: number;
  plazas?: number;
}
export interface EntradaSimular {
  servicio: ServicioId;
  lugar?: string;
  lat?: number;
  lon?: number;
  plazas?: number;
}
export interface EntradaFicha {
  lugar: string;
}
export interface EntradaMover {
  lugar: string;
}

// ================================================================ utilidades
const fallo = <N extends string>(herramienta: N, codigo: CodigoError, mensaje: string, sugerencias?: string[]) =>
  ({ ok: false, herramienta, error: sugerencias ? { codigo, mensaje, sugerencias } : { codigo, mensaje } }) as const;

const ID_MADRID = "mun:28079";

function nombreMunicipio(entorno: Entorno, id: string | null): string {
  if (!id) return "";
  return entorno.datos.territorios.municipios.find((m) => m.id === id)?.nombre ?? "";
}

function zonaDeMunicipio(entorno: Entorno, id: string | null): string | null {
  return entorno.datos.territorios.municipios.find((m) => m.id === id)?.zona ?? null;
}

/** `mun:…`, `dis:…`, `zona:…` o texto libre -> lugar, o error con sugerencias. */
function resolver(entorno: Entorno, texto: string): { lugar: LugarResuelto } | { error: ErrorHerramienta } {
  const t = entorno.datos.territorios;
  const limpio = texto.trim();
  if (/^(mun|dis|zona):/.test(limpio)) {
    const l = lugarPorId(t, limpio);
    if (l) return { lugar: l };
  }
  const r = resolverLugar(t, limpio, entorno.opciones.aliasLugares ?? {});
  if (esLugar(r)) return { lugar: r };
  const sug = r.sugerencias.map((s) => s.nombre);
  return {
    error: {
      codigo: "lugar",
      mensaje: sug.length ? `No encuentro «${limpio}». ¿Quizá ${sug.join(", ")}?` : `No encuentro «${limpio}» entre los municipios, distritos y zonas de la Comunidad de Madrid.`,
      sugerencias: sug,
    },
  };
}

function ambitoDe(l: LugarResuelto | null): Ambito {
  return l ? { tipo: l.tipo, nombre: l.nombre } : { tipo: "comunidad", nombre: "la Comunidad de Madrid" };
}

/** La frase del criterio, con los números reales del estado. */
export function criterioDe(estado: EstadoServicio): string {
  const def = SERVICIOS[estado.servicio];
  if (estado.metrica === "plazas") {
    return `${def.grupoEtiqueta} que viven en zonas con menos de ${decimal2Es(estado.umbral)} plazas por cada 100 mayores a menos de ${radioEs(estado.radio_m)} (referencia: ${referenciaTexto(estado)})`;
  }
  return `${def.grupoEtiqueta} que viven a más de ${radioEs(estado.radio_m)} en línea recta del centro más cercano`;
}

export function referenciaTexto(estado: EstadoServicio): string {
  const im = SERVICIOS[estado.servicio].imserso;
  if (im && estado.umbral === im.espana) return "media de España del IMSERSO";
  if (im && estado.umbral === im.madrid) return "media de Madrid del IMSERSO";
  return estado.secciones.anio_poblacion === ANIO_PROYECCION ? "media de la Comunidad de hoy, que se mantiene fija" : "media de la Comunidad";
}

const enteroNoNegativo = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function acotar(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(x)));
}

function bboxDePuntos(ps: { lat: number; lon: number }[]): [number, number, number, number] {
  const m = 0.04;
  return [
    Math.min(...ps.map((p) => p.lon)) - m,
    Math.min(...ps.map((p) => p.lat)) - m,
    Math.max(...ps.map((p) => p.lon)) + m,
    Math.max(...ps.map((p) => p.lat)) + m,
  ];
}

const accionServicio = (e: EstadoServicio): Accion => ({ tipo: "elegir_servicio", servicio: e.servicio, radio_m: e.radio_m, anio: e.secciones.anio_poblacion as AnioDonde });

const mas = (n: number) => `+${enteroEs(n)}`;

// ================================================================ 1. ranking_deficit
export async function rankingDeficit(entorno: Entorno, entrada: EntradaRanking): Promise<ResultadoRanking> {
  const N = "ranking_deficit" as const;
  const { servicio } = entrada;
  const t = entorno.datos.territorios;
  let estado: EstadoServicio;
  try {
    estado = await entorno.estado(servicio);
  } catch (e) {
    return fallo(N, "datos", e instanceof Error ? e.message : "No se pudieron cargar los datos");
  }

  let lugar: LugarResuelto | null = null;
  let zonas: string[] | undefined;
  let nivel: "municipio" | "distrito" = entrada.nivel ?? "municipio";
  if (entrada.zona && entrada.zona.trim()) {
    const r = resolver(entorno, entrada.zona);
    if ("error" in r) return fallo(N, r.error.codigo, r.error.mensaje, r.error.sugerencias);
    lugar = r.lugar;
    if (lugar.tipo === "zona") {
      zonas = lugar.zonas;
      if (!entrada.nivel && zonas.length === 1 && zonas[0] === "01") nivel = "distrito";
      if (nivel === "distrito" && !zonas.includes("01")) {
        return fallo(N, "zona_no_agrupa", `Los distritos son solo los de la capital; ${lugar.nombre} no tiene distritos. Pídeme el ranking de municipios.`);
      }
      if (nivel === "distrito") zonas = undefined; // los distritos ya son todos de la capital
    } else if (nivel === "distrito" && lugar.id === ID_MADRID) {
      zonas = undefined;
    } else {
      return fallo(
        N,
        "zona_no_agrupa",
        `${lugar.nombre} es un solo ${lugar.tipo}; un ranking compara varios. Pídeme su ficha, o un ranking de una zona (sur, sierra, oeste…) o de los distritos de Madrid.`,
      );
    }
  }

  const orden: OrdenRanking =
    entrada.orden && (entrada.orden !== "faltan" || esServicioConPlazas(servicio)) ? entrada.orden : ordenPorDefecto(servicio);
  const limite = acotar(entrada.limite ?? 10, 1, 10);
  const filas = ranking(estado, t, { nivel, zona: zonas, orden, limite });

  const ambito = ambitoDe(lugar);
  const def = SERVICIOS[servicio];
  const salida: SalidaRanking = {
    anio_poblacion: estado.secciones.anio_poblacion,
    servicio,
    radio_m: estado.radio_m,
    umbral: estado.umbral,
    criterio: criterioDe(estado),
    ambito,
    nivel,
    orden,
    umbral_unidad: estado.metrica === "plazas" ? "plazas_por_100" : "metros",
    filas,
    total_objetivo: Math.round(estado.totalObjetivo),
    total_deficit: Math.round(estado.totalDeficit),
    fuente: estado.centros.fuente_nombre ?? `Registro oficial de la Comunidad de Madrid (${def.nombre})`,
    fecha_datos: estado.centros.actualizado_fuente ?? estado.centros.generado,
  };
  const acciones: Accion[] = [
    accionServicio(estado),
    { tipo: "mostrar_ranking", servicio, ...(zonas && zonas.length >= 1 ? { zona: zonas.join(",") } : {}), nivel, filas },
  ];
  if (lugar && lugar.tipo === "zona") acciones.push({ tipo: "mover_mapa", bbox: lugar.bbox });
  const primero = filas[0];
  return {
    ok: true,
    herramienta: N,
    salida,
    acciones,
    paso: {
      herramienta: N,
      entrada: { servicio, ...(entrada.zona ? { zona: lugar?.nombre ?? entrada.zona } : {}), nivel, orden, limite },
      resumen: primero
        ? `${filas.length} ${nivel === "distrito" ? "distritos" : "municipios"} de ${ambito.nombre}; el primero, ${primero.nombre}`
        : `Sin filas en ${ambito.nombre}`,
    },
  };
}

// ================================================================ 2. ubicacion_optima
export async function ubicacionOptima(entorno: Entorno, entrada: EntradaOptima): Promise<ResultadoOptima> {
  const N = "ubicacion_optima" as const;
  const { servicio } = entrada;
  let estado: EstadoServicio;
  try {
    estado = await entorno.estado(servicio);
  } catch (e) {
    return fallo(N, "datos", e instanceof Error ? e.message : "No se pudieron cargar los datos");
  }
  let lugar: LugarResuelto | null = null;
  const opc: { zona?: string[]; municipio?: string; distrito?: string } = {};
  if (entrada.zona && entrada.zona.trim()) {
    const r = resolver(entorno, entrada.zona);
    if ("error" in r) return fallo(N, r.error.codigo, r.error.mensaje, r.error.sugerencias);
    lugar = r.lugar;
    if (lugar.tipo === "zona") opc.zona = lugar.zonas;
    else if (lugar.tipo === "municipio") opc.municipio = lugar.id;
    else opc.distrito = lugar.id;
  }
  const nPedido = enteroNoNegativo(entrada.n) ? Math.round(entrada.n) : 1;
  const n = acotar(nPedido, 1, 3);
  const plazas = plazasEfectivas(servicio, enteroNoNegativo(entrada.plazas) ? entrada.plazas : null);
  const res = optimo(estado, { n, ...opc, ...(plazas === null ? {} : { plazas }) });

  const puntos: PuntoSalida[] = res.puntos.map((p) => ({
    lat: round5(p.lat),
    lon: round5(p.lon),
    seccion: p.seccion,
    municipio_id: p.municipio,
    municipio: nombreMunicipio(entorno, p.municipio),
    ganan: Math.round(p.ganan),
    acumulado: Math.round(p.acumulado),
    ...(p.reduce === undefined
      ? {}
      : {
          reduce: round2(p.reduce),
          reduce_acumulado: round2(p.reduceAcumulado ?? p.reduce),
          pct_plazas_utiles: plazas && plazas > 0 ? Math.round((1000 * p.reduce) / plazas) / 10 : 0,
        }),
  }));
  const salida: SalidaOptima = {
    anio_poblacion: estado.secciones.anio_poblacion,
    servicio,
    radio_m: estado.radio_m,
    umbral: estado.umbral,
    criterio: criterioDe(estado),
    ambito: ambitoDe(lugar),
    n,
    n_pedido: nPedido,
    plazas,
    puntos,
    deficit_antes: Math.round(res.deficitAntes),
    deficit_despues: Math.round(res.deficitDespues),
    candidatos: res.candidatos,
    ...(res.reduce === undefined ? {} : { reduce_total: round2(res.reduce), faltan_antes: round2(res.faltanAntes ?? 0), faltan_despues: round2(res.faltanDespues ?? 0) }),
  };

  const acciones: Accion[] = [accionServicio(estado)];
  if (puntos.length) {
    acciones.push({
      tipo: "marcar_puntos",
      servicio,
      origen: "optimo",
      puntos: puntos.map((p, i) => ({
        lat: p.lat,
        lon: p.lon,
        etiqueta: `Opción ${i + 1}`,
        ganan: p.ganan,
        ...(p.reduce === undefined ? {} : { reduce: p.reduce }),
        ...(plazas === null ? {} : { plazas }),
      })),
    });
    const [p0] = puntos;
    if (puntos.length === 1 && p0) acciones.push({ tipo: "mover_mapa", lat: p0.lat, lon: p0.lon, zoom: 12, lugar: p0.municipio_id });
    else acciones.push({ tipo: "mover_mapa", bbox: bboxDePuntos(puntos) });
  } else if (lugar) {
    acciones.push({ tipo: "mover_mapa", bbox: lugar.bbox, ...(lugar.tipo !== "zona" ? { lugar: lugar.id } : {}) });
  }
  const ultimo = puntos[puntos.length - 1];
  const dondeResumen = `${puntos.length} ${puntos.length === 1 ? "punto" : "puntos"}${puntos.length === 1 && puntos[0] ? ` en ${puntos[0].municipio}` : ""}`;
  const resumen = puntos.length
    ? ultimo?.reduce_acumulado !== undefined
      ? `${dondeResumen}, cubre ${enteroEs(ultimo.reduce_acumulado)} plazas más`
      : `${dondeResumen}, ${mas(ultimo?.acumulado ?? 0)} ${SERVICIOS[servicio].grupoEtiqueta}`
    : "Ningún punto mejora el acceso";
  return {
    ok: true,
    herramienta: N,
    salida,
    acciones,
    paso: {
      herramienta: N,
      entrada: { servicio, ...(entrada.zona ? { zona: lugar?.nombre ?? entrada.zona } : {}), n, ...(plazas === null ? {} : { plazas }) },
      resumen,
    },
  };
}

// ================================================================ 3. simular_centro
export async function simularCentro(entorno: Entorno, entrada: EntradaSimular): Promise<ResultadoSimulacion> {
  const N = "simular_centro" as const;
  const { servicio } = entrada;
  const t = entorno.datos.territorios;
  let estado: EstadoServicio;
  try {
    estado = await entorno.estado(servicio);
  } catch (e) {
    return fallo(N, "datos", e instanceof Error ? e.message : "No se pudieron cargar los datos");
  }

  let lat: number;
  let lon: number;
  let nombreLugar: string;
  let lugarId: string | null = null;
  if (entrada.lugar && entrada.lugar.trim()) {
    const r = resolver(entorno, entrada.lugar);
    if ("error" in r) return fallo(N, r.error.codigo, r.error.mensaje, r.error.sugerencias);
    if (r.lugar.tipo === "zona") {
      return fallo(N, "zona_no_agrupa", `«${r.lugar.nombre}» es una zona entera. Dime un municipio o un distrito concreto (o pulsa en el mapa) para probar ahí.`);
    }
    ({ lat, lon } = r.lugar);
    nombreLugar = r.lugar.nombre;
    lugarId = r.lugar.id;
  } else if (entrada.lat !== undefined && entrada.lon !== undefined) {
    if (!coordenadasValidas(entrada.lat, entrada.lon)) return fallo(N, "fuera", "Esas coordenadas no están en la Comunidad de Madrid.");
    lat = entrada.lat;
    lon = entrada.lon;
    nombreLugar = `${decimalCoord(lat)}, ${decimalCoord(lon)}`;
  } else {
    return fallo(N, "entrada", "Dime dónde: un municipio, un distrito o unas coordenadas.");
  }

  const municipioId = municipioEn(t, lat, lon) ?? (lugarId && lugarId.startsWith("mun:") ? lugarId : null);
  if (!municipioId) return fallo(N, "fuera", "Ese punto cae fuera de la Comunidad de Madrid.");

  const plazas = plazasEfectivas(servicio, enteroNoNegativo(entrada.plazas) ? entrada.plazas : null);
  const sim = simular(estado, plazas === null ? { lat, lon } : { lat, lon, plazas });

  // El óptimo de la misma zona estadística (igual que «Tú decides»).
  const zona = zonaDeMunicipio(entorno, municipioId) ?? "01";
  const opt = optimo(estado, { n: 1, zona, ...(plazas === null ? {} : { plazas }) });
  const esPlazas = estado.metrica === "plazas";
  const ganan = Math.round(sim.ganan);
  // La cifra principal: personas que ganan acceso (distancia) o N, plazas que faltan que se reducen (plazas).
  const principal = esPlazas ? valorPrincipal(estado, sim) : ganan;
  const principalOptimo = opt.puntos[0] ? (esPlazas ? valorPrincipal(estado, opt.puntos[0]) : Math.round(opt.puntos[0].ganan)) : 0;
  const cmp = compararConOptimo(principal, principalOptimo);

  const salida: SalidaSimulacion = {
    anio_poblacion: estado.secciones.anio_poblacion,
    servicio,
    radio_m: estado.radio_m,
    umbral: estado.umbral,
    criterio: criterioDe(estado),
    ambito: { tipo: "municipio", nombre: nombreMunicipio(entorno, municipioId) },
    lugar: nombreLugar,
    municipio_id: municipioId,
    municipio: nombreMunicipio(entorno, municipioId),
    lat: round5(lat),
    lon: round5(lon),
    plazas,
    ganan,
    deficit_antes: Math.round(sim.deficitAntes),
    deficit_despues: Math.round(sim.deficitDespues),
    ...(esPlazas
      ? {
          reduce: round2(principal),
          pct_plazas_utiles: plazas && plazas > 0 ? Math.round((1000 * principal) / plazas) / 10 : 0,
          faltan_antes: round2(sim.faltanAntes ?? 0),
          faltan_despues: round2(sim.faltanDespues ?? 0),
        }
      : {}),
    detalle: detalleSimulacion(estado, sim, plazas),
    por_que_nadie_gana: (esPlazas ? principal >= 0.5 : ganan > 0) ? null : porQueNadieGana(estado, sim),
    comparado_con_optimo: {
      zona: t.zonas.find((z) => z.codigo === zona)?.nombre ?? zona,
      ganan_optimo: Math.round(opt.puntos[0]?.ganan ?? 0),
      ...(esPlazas ? { reduce_optimo: round2(principalOptimo) } : {}),
      pct: cmp.pct,
      supera: cmp.supera,
      municipio_optimo: opt.puntos[0] ? nombreMunicipio(entorno, opt.puntos[0].municipio) : null,
    },
  };
  const acciones: Accion[] = [
    accionServicio(estado),
    { tipo: "marcar_puntos", servicio, origen: "simulacion", puntos: [{ lat: round5(lat), lon: round5(lon), etiqueta: `Tu punto en ${nombreLugar}`, ganan, ...(esPlazas ? { reduce: round2(principal) } : {}), ...(plazas === null ? {} : { plazas }) }] },
    { tipo: "mover_mapa", lat: round5(lat), lon: round5(lon), zoom: 12, lugar: municipioId },
  ];
  return {
    ok: true,
    herramienta: N,
    salida,
    acciones,
    paso: {
      herramienta: N,
      entrada: { servicio, lugar: nombreLugar, ...(plazas === null ? {} : { plazas }) },
      resumen: `${esPlazas ? `Cubre ${decimalCortoEs(principal)} plazas más` : `${mas(ganan)} ${SERVICIOS[servicio].grupoEtiqueta}`} en ${nombreLugar}${cmp.pct === null ? "" : `, ${Math.round(cmp.pct)} % del óptimo`}`,
    },
  };
}

function decimalCoord(x: number): string {
  return x.toFixed(4).replace(".", ",");
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function round5(x: number): number {
  return Math.round(x * 1e5) / 1e5;
}

// ================================================================ 4. ficha_municipio
export async function fichaMunicipio(entornoPedido: Entorno, entrada: EntradaFicha): Promise<ResultadoFicha> {
  const N = "ficha_municipio" as const;
  // La ficha es siempre de hoy: con la proyección a 2030 en el simulador, se calcula con los datos de hoy y se avisa.
  const hoy = entornoPedido.opciones.datosHoy;
  const deHoy = hoy !== undefined && hoy !== entornoPedido.datos;
  const entorno = deHoy ? crearEntorno(hoy, { ...entornoPedido.opciones, seccionesHoy: undefined, datosHoy: undefined }) : entornoPedido;
  const t = entorno.datos.territorios;
  const r = resolver(entorno, entrada.lugar);
  if ("error" in r) return fallo(N, r.error.codigo, r.error.mensaje, r.error.sugerencias);
  const lugar = r.lugar;
  if (lugar.tipo === "zona" && lugar.zonas.length > 1) {
    return fallo(N, "zona_no_agrupa", `«${lugar.nombre}» agrupa varias zonas. Dime un municipio, un distrito de Madrid o una zona concreta (Sur Metropolitano, Sierra Norte…).`);
  }
  const estados: Partial<Record<ServicioId, EstadoServicio>> = {};
  try {
    for (const id of SERVICIO_IDS) estados[id] = await entorno.estado(id);
  } catch (e) {
    return fallo(N, "datos", e instanceof Error ? e.message : "No se pudieron cargar los datos");
  }
  const ficha = fichaLugar(lugar.id, estados, t);
  if (!ficha) return fallo(N, "lugar", `No tengo la ficha de «${lugar.nombre}».`);
  const servicios: FilaFichaSalida[] = ficha.servicios.map((f) => ({
    ...f,
    nombre: SERVICIOS[f.id].nombre,
    radio_m: (estados[f.id] as EstadoServicio).radio_m,
    grupo: SERVICIOS[f.id].grupoEtiqueta,
    criterio: criterioDe(estados[f.id] as EstadoServicio),
    ...((estados[f.id] as EstadoServicio).metrica === "plazas"
      ? { umbral: (estados[f.id] as EstadoServicio).umbral, referencia_texto: referenciaTexto(estados[f.id] as EstadoServicio) }
      : {}),
  }));
  const salida: SalidaFicha = {
    lugar: ficha.lugar,
    nombre: ficha.nombre,
    nivel: ficha.nivel,
    poblacion: ficha.poblacion,
    anio_poblacion: entorno.datos.secciones.anio_poblacion,
    servicios,
    faltan: ficha.faltan,
    aire_hoy: null,
    ...(deHoy ? { ficha_de_hoy: true } : {}),
  };
  const acciones: Accion[] = lugar.tipo === "zona" ? [{ tipo: "mover_mapa", bbox: lugar.bbox }] : [{ tipo: "abrir_ficha", lugar: lugar.id }];
  return {
    ok: true,
    herramienta: N,
    salida,
    acciones,
    paso: {
      herramienta: N,
      entrada: { lugar: lugar.nombre },
      resumen: ficha.faltan.length ? `Un centro nuevo ayudaría más en: ${ficha.faltan.map((s) => SERVICIOS[s].nombre).join(", ")}` : "No sale por debajo de lo habitual en ningún servicio",
    },
  };
}

// ================================================================ 5. mover_mapa
export async function moverMapa(entorno: Entorno, entrada: EntradaMover): Promise<ResultadoMover> {
  const N = "mover_mapa" as const;
  const r = resolver(entorno, entrada.lugar);
  if ("error" in r) return fallo(N, r.error.codigo, r.error.mensaje, r.error.sugerencias);
  const l = r.lugar;
  return {
    ok: true,
    herramienta: N,
    salida: { ok: true, nombre: l.nombre },
    acciones: [{ tipo: "mover_mapa", bbox: l.bbox, ...(l.tipo !== "zona" ? { lugar: l.id } : {}) }],
    paso: { herramienta: N, entrada: { lugar: l.nombre }, resumen: `Mapa en ${l.nombre}` },
  };
}

// ================================================================ validación y despacho
type Validada =
  | { ok: true; nombre: "ranking_deficit"; entrada: EntradaRanking }
  | { ok: true; nombre: "ubicacion_optima"; entrada: EntradaOptima }
  | { ok: true; nombre: "simular_centro"; entrada: EntradaSimular }
  | { ok: true; nombre: "ficha_municipio"; entrada: EntradaFicha }
  | { ok: true; nombre: "mover_mapa"; entrada: EntradaMover }
  | { ok: false; error: ErrorHerramienta };

const ERR = (mensaje: string, codigo: CodigoError = "entrada"): Validada => ({ ok: false, error: { codigo, mensaje } });

function texto(x: unknown, max = 100): string | null | undefined {
  if (x === undefined || x === null) return undefined;
  if (typeof x !== "string") return null;
  const s = x.trim();
  return s.length > max ? null : s;
}

function numero(x: unknown): number | null | undefined {
  if (x === undefined || x === null) return undefined;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

/** Valida a mano (sin zod) la entrada de una herramienta: lo que venga del modelo o del intérprete. */
export function validarEntrada(nombre: string, entrada: unknown): Validada {
  if (typeof entrada !== "object" || entrada === null || Array.isArray(entrada)) return ERR("La entrada de la herramienta tiene que ser un objeto.");
  const e = entrada as Record<string, unknown>;
  const servicioOk = (): ServicioId | null => (esServicioId(e.servicio) ? e.servicio : null);

  switch (nombre) {
    case "ranking_deficit": {
      const servicio = servicioOk();
      if (!servicio) return ERR(`Servicio desconocido. Usa uno de: ${SERVICIO_IDS.join(", ")}.`, "servicio");
      const zona = texto(e.zona);
      const limite = numero(e.limite);
      if (zona === null || limite === null) return ERR("«zona» o «limite» no son válidos.");
      if (e.nivel !== undefined && e.nivel !== "municipio" && e.nivel !== "distrito") return ERR("«nivel» tiene que ser «municipio» o «distrito».");
      if (e.orden !== undefined && e.orden !== "pct" && e.orden !== "personas" && e.orden !== "faltan") return ERR("«orden» tiene que ser «pct», «personas» o «faltan».");
      return {
        ok: true,
        nombre,
        entrada: { servicio, ...(zona ? { zona } : {}), ...(e.nivel ? { nivel: e.nivel as "municipio" | "distrito" } : {}), ...(e.orden ? { orden: e.orden as OrdenRanking } : {}), ...(limite === undefined ? {} : { limite }) },
      };
    }
    case "ubicacion_optima": {
      const servicio = servicioOk();
      if (!servicio) return ERR(`Servicio desconocido. Usa uno de: ${SERVICIO_IDS.join(", ")}.`, "servicio");
      const zona = texto(e.zona);
      const n = numero(e.n);
      const plazas = numero(e.plazas);
      if (zona === null || n === null || plazas === null) return ERR("«zona», «n» o «plazas» no son válidos.");
      return { ok: true, nombre, entrada: { servicio, ...(zona ? { zona } : {}), ...(n === undefined ? {} : { n }), ...(plazas === undefined ? {} : { plazas }) } };
    }
    case "simular_centro": {
      const servicio = servicioOk();
      if (!servicio) return ERR(`Servicio desconocido. Usa uno de: ${SERVICIO_IDS.join(", ")}.`, "servicio");
      const lugar = texto(e.lugar);
      const lat = numero(e.lat);
      const lon = numero(e.lon);
      const plazas = numero(e.plazas);
      if (lugar === null || lat === null || lon === null || plazas === null) return ERR("«lugar», «lat», «lon» o «plazas» no son válidos.");
      if ((lat === undefined) !== (lon === undefined)) return ERR("Hacen falta «lat» y «lon» juntas.");
      if (!lugar && lat === undefined) return ERR("Dime dónde: «lugar» o «lat» y «lon».");
      return {
        ok: true,
        nombre,
        entrada: { servicio, ...(lugar ? { lugar } : {}), ...(lat === undefined || lon === undefined ? {} : { lat, lon }), ...(plazas === undefined ? {} : { plazas }) },
      };
    }
    case "ficha_municipio":
    case "mover_mapa": {
      const lugar = texto(e.lugar);
      if (!lugar) return ERR("Falta «lugar».");
      return { ok: true, nombre, entrada: { lugar } } as Validada;
    }
    default:
      return ERR(`Herramienta desconocida: «${nombre}».`);
  }
}

/** Ejecuta una herramienta por nombre con una entrada sin validar (la del modelo o la del intérprete). Nunca lanza. */
export async function ejecutarHerramienta(nombre: string, entrada: unknown, entorno: Entorno): Promise<ResultadoHerramienta> {
  const v = validarEntrada(nombre, entrada);
  if (!v.ok) return { ok: false, herramienta: (NOMBRES_HERRAMIENTAS as readonly string[]).includes(nombre) ? (nombre as NombreHerramienta) : "mover_mapa", error: v.error };
  try {
    switch (v.nombre) {
      case "ranking_deficit": return await rankingDeficit(entorno, v.entrada);
      case "ubicacion_optima": return await ubicacionOptima(entorno, v.entrada);
      case "simular_centro": return await simularCentro(entorno, v.entrada);
      case "ficha_municipio": return await fichaMunicipio(entorno, v.entrada);
      case "mover_mapa": return await moverMapa(entorno, v.entrada);
    }
  } catch (e) {
    return { ok: false, herramienta: v.nombre, error: { codigo: "datos", mensaje: e instanceof Error ? e.message : "Error al calcular" } };
  }
}

// ================================================================ esquemas (para el modelo con IA, tarea I2)
const ENUM_SERVICIO = { type: "string", enum: [...SERVICIO_IDS], description: "Servicio público: " + SERVICIO_IDS.map((s) => `${s} = ${SERVICIOS[s].nombre}`).join("; ") };

export interface EsquemaHerramienta {
  name: NombreHerramienta;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[]; additionalProperties: false };
}

export const ESQUEMAS_HERRAMIENTAS: EsquemaHerramienta[] = [
  {
    name: "ranking_deficit",
    description: "Ranking de municipios (o distritos de Madrid) con más déficit de un servicio. Devuelve cifras calculadas con datos oficiales; no inventes otras.",
    input_schema: {
      type: "object",
      properties: {
        servicio: ENUM_SERVICIO,
        zona: { type: "string", description: "Zona estadística en texto libre (sur, sierra, oeste, capital…). Vacío = toda la Comunidad." },
        nivel: { type: "string", enum: ["municipio", "distrito"] },
        orden: { type: "string", enum: ["pct", "personas", "faltan"], description: "pct = % afectado; personas = nº de personas; faltan = plazas que faltan (solo residencia)." },
        limite: { type: "integer", minimum: 1, maximum: 10 },
      },
      required: ["servicio"],
      additionalProperties: false,
    },
  },
  {
    name: "ubicacion_optima",
    description: "Mejor sitio (o los n mejores, hasta 3) para un centro nuevo de un servicio: en servicios por distancia, el que más personas saca del déficit; en residencias, el que más reduce las plazas que faltan. Calcula el modelo; no pone cifras tú.",
    input_schema: {
      type: "object",
      properties: {
        servicio: ENUM_SERVICIO,
        zona: { type: "string", description: "Zona, municipio o distrito en texto libre donde buscar el punto. Vacío = toda la Comunidad." },
        n: { type: "integer", minimum: 1, maximum: 3 },
        plazas: { type: "integer", minimum: 25, maximum: 200, description: "Solo residencia." },
      },
      required: ["servicio"],
      additionalProperties: false,
    },
  },
  {
    name: "simular_centro",
    description: "Qué consigue un centro nuevo en un lugar (personas que ganan acceso, o plazas que faltan que se reducen en residencias), comparado con el mejor punto del modelo en su zona.",
    input_schema: {
      type: "object",
      properties: {
        servicio: ENUM_SERVICIO,
        lugar: { type: "string", description: "Municipio o distrito en texto libre." },
        lat: { type: "number" },
        lon: { type: "number" },
        plazas: { type: "integer", minimum: 25, maximum: 200, description: "Solo residencia." },
      },
      required: ["servicio"],
      additionalProperties: false,
    },
  },
  {
    name: "ficha_municipio",
    description: "Qué servicios tiene un municipio o distrito de Madrid, cuáles le faltan frente a la media y a municipios de su tamaño.",
    input_schema: { type: "object", properties: { lugar: { type: "string", description: "Municipio, distrito o zona en texto libre." } }, required: ["lugar"], additionalProperties: false },
  },
  {
    name: "mover_mapa",
    description: "Lleva el mapa a un municipio, distrito o zona.",
    input_schema: { type: "object", properties: { lugar: { type: "string" } }, required: ["lugar"], additionalProperties: false },
  },
];
