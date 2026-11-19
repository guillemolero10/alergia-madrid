// Datos y estado de «¿Dónde hace falta?» para la web: carga de los JSON de `public/donde/`, estado en la URL
// y el estado del servicio elegido (el motor de `lib/donde/`).
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { cargarOtrosSociales, cargarProyeccion, cargarServicio, lectorWeb, validarSecciones, ErrorCarga } from "./donde/cargar";
import { calcularEstado } from "./donde/cobertura";
import { codigosZona, valoresMapa, type Pintura } from "./donde/panelDonde";
import { ANIO_HOY, ANIO_PROYECCION, territoriosConPoblacion, type AnioDonde, type Proyeccion } from "./donde/proyeccion";
import { SERVICIO_IDS, SERVICIOS } from "./donde/servicios";
import type { Centros, EstadoServicio, Secciones, ServicioId, Territorios } from "./donde/tipos";
import { opcionesEstado } from "./donde/tuDecides";
import { busquedaConDonde, conServicio, esServicioConPlazas, estadoDondeDeLaUrl, ordenesDisponibles, ordenPorDefecto, type EstadoDonde } from "./donde/urlDonde";

const lector = lectorWeb("/donde/");

export interface BaseDonde {
  /** Secciones con la población del año de `anio` (hoy: censo de 2025; 2030: proyección del INE repartida con un modelo). */
  secciones: Secciones;
  /** Con la población de municipios y distritos del mismo año. */
  territorios: Territorios;
  anio: AnioDonde;
  /** Solo en 2030: el fichero de la proyección (error típico, fuente). */
  proyeccion: Proyeccion | null;
}

// ---------------------------------------------------------------- caché de carga (una vez por sesión)
// Lo ya cargado se lee de forma síncrona: cambiar a un servicio ya pedido repinta sin pasar por «cargando».
let baseResuelta: BaseDonde | null = null;
let promesaBase: Promise<BaseDonde> | null = null;
const centrosResueltos = new Map<ServicioId, Centros>();
const promesasCentros = new Map<ServicioId, Promise<Centros>>();

function cargarBase(): Promise<BaseDonde> {
  if (!promesaBase) {
    const p = Promise.all([lector("secciones.json").then(validarSecciones), lector("territorios.json")]).then(([secciones, territorios]) => {
      const t = territorios as Territorios;
      if (!t || t.version !== 1 || !Array.isArray(t.municipios)) throw new ErrorCarga("territorios.json", "formato no válido");
      baseResuelta = { secciones, territorios: t, anio: ANIO_HOY, proyeccion: null };
      return baseResuelta;
    });
    p.catch(() => {
      promesaBase = null; // así «Reintentar» vuelve a pedirlo
    });
    promesaBase = p;
  }
  return promesaBase;
}

// La proyección a 2030 solo se pide al elegirla. La base de 2030 se construye una vez (identidad estable: el motor guarda cachés por objeto).
let base2030Resuelta: BaseDonde | null = null;
let promesaBase2030: Promise<BaseDonde> | null = null;

function cargarBase2030(): Promise<BaseDonde> {
  if (!promesaBase2030) {
    const p = cargarBase()
      .then(async (hoy) => {
        const { proyeccion, secciones } = await cargarProyeccion(lector, hoy.secciones);
        base2030Resuelta = { secciones, territorios: territoriosConPoblacion(hoy.territorios, secciones), anio: ANIO_PROYECCION, proyeccion };
        return base2030Resuelta;
      });
    p.catch(() => {
      promesaBase2030 = null; // así «Reintentar» vuelve a pedirlo
    });
    promesaBase2030 = p;
  }
  return promesaBase2030;
}

/** Los centros de un servicio, con la misma caché que la pantalla (el agente en el navegador no los vuelve a descargar). */
export function cargarCentros(id: ServicioId): Promise<Centros> {
  let p = promesasCentros.get(id);
  if (!p) {
    const nueva = cargarServicio(lector, id).then((c) => {
      centrosResueltos.set(id, c);
      return c;
    });
    nueva.catch(() => promesasCentros.delete(id));
    promesasCentros.set(id, nueva);
    p = nueva;
  }
  return p;
}

let promesaOtros: Promise<Centros> | null = null;

/** Los otros centros de servicios sociales (204 kB), con caché: solo los pide «Mi municipio». */
export function cargarOtros(): Promise<Centros> {
  if (!promesaOtros) {
    const p = cargarOtrosSociales(lector);
    p.catch(() => {
      promesaOtros = null;
    });
    promesaOtros = p;
  }
  return promesaOtros;
}

/** Con el navegador libre, deja pedidos los servicios para que cambiar de uno a otro sea instantáneo (el desfibrilador pesa 1,5 MB: el último). */
function precargarServicios(): void {
  const ligeros = SERVICIO_IDS.filter((id) => id !== "dea");
  const pedir = () => ligeros.forEach((id) => void cargarCentros(id).catch(() => undefined));
  if ("requestIdleCallback" in window) window.requestIdleCallback(pedir, { timeout: 3000 });
  else setTimeout(pedir, 1500);
  setTimeout(() => void cargarCentros("dea").catch(() => undefined), 5000);
}

export type Carga<T> = { fase: "cargando" } | { fase: "listo"; valor: T } | { fase: "error"; mensaje: string };

/** Pide algo una vez y avisa cuando llega o falla; si ya está resuelto (`yaResuelto`), no hace nada. */
function useAviso(yaResuelto: boolean, pedir: () => Promise<unknown>, clave: string): { error: string | null; reintentar: () => void } {
  const [, forzar] = useReducer((n: number) => n + 1, 0);
  const [error, setError] = useState<{ clave: string; mensaje: string } | null>(null);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (yaResuelto) return;
    let cancelado = false;
    setError(null);
    pedir().then(
      () => !cancelado && forzar(),
      (e: unknown) => !cancelado && setError({ clave, mensaje: e instanceof Error ? e.message : "Error desconocido" }),
    );
    return () => {
      cancelado = true;
    };
    // `pedir` cambia en cada render: lo que cuenta es la clave y el intento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, intento, yaResuelto]);
  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { error: error && error.clave === clave ? error.mensaje : null, reintentar };
}

export interface Donde {
  est: EstadoDonde;
  /** Los datos de HOY (censo de 2025), siempre: «Mi municipio» y el agente en esa pestaña no usan la proyección. */
  baseHoy: Carga<BaseDonde>;
  /** Año de la población de `base` y `estado`: puede ir por detrás de `est.anio` mientras llega la proyección. */
  anioActivo: AnioDonde;
  /** Se está descargando la proyección a 2030. */
  cargandoAnio: boolean;
  /** No se ha podido cargar la proyección a 2030. */
  errorAnio: string | null;
  reintentarAnio: () => void;
  /** Cambia partes del estado y lo escribe en la URL (sin añadir entradas al historial). */
  cambiar: (parcial: Partial<EstadoDonde>) => void;
  elegirServicio: (id: ServicioId) => void;
  base: Carga<BaseDonde>;
  reintentarBase: () => void;
  centros: Carga<Centros>;
  reintentarCentros: () => void;
  /** Estado del servicio elegido, o null mientras llegan los datos (o la proyección del año elegido). */
  estado: EstadoServicio | null;
  /**
   * Solo con 2030 y un servicio con plazas: el estado de HOY con la misma referencia, para decir «faltan N más que hoy». En 2030 la
   * referencia se mantiene fija en el valor de hoy (si no, el déficit desaparecería por definición).
   */
  estadoHoy: EstadoServicio | null;
  errorCalculo: string | null;
  pintura: Pintura | null;
}

export function useDonde(): Donde {
  const [est, setEst] = useState<EstadoDonde>(() => estadoDondeDeLaUrl(window.location.search));
  const estRef = useRef(est);
  estRef.current = est;

  // C-3: un enlace con valores que no valen (`?sim=45,-3`, `?zona=xx`) se escribe ya normalizado, para que lo que se ve en la barra sea lo que se está usando.
  useEffect(() => {
    const busqueda = window.location.search;
    if (!/[?&](servicio|radio|zona|ref|orden|nivel|sim|plazas|anio)=/.test(busqueda)) return;
    const normalizada = busquedaConDonde(busqueda, estRef.current);
    if (normalizada !== busqueda) window.history.replaceState(null, "", `${window.location.pathname}${normalizada}`);
  }, []);

  useEffect(() => {
    const alRetroceder = () => setEst(estadoDondeDeLaUrl(window.location.search));
    window.addEventListener("popstate", alRetroceder);
    return () => window.removeEventListener("popstate", alRetroceder);
  }, []);

  const poner = useCallback((nuevo: EstadoDonde) => {
    estRef.current = nuevo;
    setEst(nuevo);
    window.history.replaceState(null, "", `${window.location.pathname}${busquedaConDonde(window.location.search, nuevo)}`);
  }, []);

  const cambiar = useCallback(
    (parcial: Partial<EstadoDonde>) => {
      const actual = estRef.current;
      const nuevo = { ...actual, ...parcial };
      // Radio, orden y referencia solo valen si son de este servicio.
      if (!SERVICIOS[nuevo.servicio].radios.includes(nuevo.radio_m)) nuevo.radio_m = SERVICIOS[nuevo.servicio].radioDefecto;
      if (!ordenesDisponibles(nuevo.servicio).includes(nuevo.orden)) nuevo.orden = ordenPorDefecto(nuevo.servicio);
      poner(nuevo);
    },
    [poner],
  );

  const elegirServicio = useCallback((id: ServicioId) => poner(conServicio(estRef.current, id)), [poner]);

  const avisoBase = useAviso(baseResuelta !== null, cargarBase, "base");
  // Con identidad estable: `base` y `centros` son dependencias de otros hooks, y si cambiaran en cada render se recalcularía todo en cada render.
  const baseListaAhora = baseResuelta;
  const baseHoy = useMemo<Carga<BaseDonde>>(
    () => (baseListaAhora ? { fase: "listo", valor: baseListaAhora } : avisoBase.error ? { fase: "error", mensaje: avisoBase.error } : { fase: "cargando" }),
    [baseListaAhora, avisoBase.error],
  );
  // 2030: se pide al elegirlo. Mientras llega (o si falla) sigue la base de hoy, y `estado` queda vacío para no enseñar cifras de hoy como si fueran de 2030.
  const quiere2030 = est.anio === ANIO_PROYECCION;
  const lista2030 = base2030Resuelta;
  const avisoAnio = useAviso(!quiere2030 || lista2030 !== null, cargarBase2030, "base:2030");
  const base = useMemo<Carga<BaseDonde>>(() => (quiere2030 && lista2030 && baseHoy.fase === "listo" ? { fase: "listo", valor: lista2030 } : baseHoy), [quiere2030, lista2030, baseHoy]);
  const anioActivo: AnioDonde = base.fase === "listo" ? base.valor.anio : ANIO_HOY;
  const cargandoAnio = quiere2030 && lista2030 === null && baseHoy.fase === "listo" && avisoAnio.error === null;
  // Los servicios se piden cuando ya está la base (así el error de red sale una sola vez).
  const centrosListos = centrosResueltos.get(est.servicio) ?? null;
  const avisoCentros = useAviso(centrosListos !== null, () => cargarCentros(est.servicio), `centros:${est.servicio}`);
  const centros = useMemo<Carga<Centros>>(
    () => (centrosListos ? { fase: "listo", valor: centrosListos } : avisoCentros.error ? { fase: "error", mensaje: avisoCentros.error } : { fase: "cargando" }),
    [centrosListos, avisoCentros.error],
  );
  const reintentarCentros = avisoCentros.reintentar;
  // Si la red se cayó, fallaron a la vez la base y los centros: «Reintentar» pide las dos cosas.
  const reintentarBaseAviso = avisoBase.reintentar;
  const reintentarBase = useCallback(() => {
    reintentarBaseAviso();
    reintentarCentros();
  }, [reintentarBaseAviso, reintentarCentros]);

  useEffect(() => {
    if (base.fase === "listo") precargarServicios();
  }, [base.fase]);

  // Una zona que no existe en los datos se ignora.
  const zonaValida = useMemo(() => {
    if (base.fase !== "listo" || !est.zona) return est.zona;
    // Vale una zona o varias separadas por comas (la sierra); las que no existen en los datos se quitan.
    const existentes = codigosZona(est.zona).filter((c) => base.valor.territorios.zonas.some((z) => z.codigo === c));
    return existentes.length ? existentes.join(",") : null;
  }, [base, est.zona]);

  useEffect(() => {
    if (zonaValida !== est.zona) cambiar({ zona: zonaValida });
  }, [zonaValida, est.zona, cambiar]);

  const calculo = useMemo<{ estado: EstadoServicio | null; estadoHoy: EstadoServicio | null; error: string | null }>(() => {
    const vacio = { estado: null, estadoHoy: null, error: null };
    if (base.fase !== "listo" || baseHoy.fase !== "listo" || centros.fase !== "listo") return vacio;
    // El servicio de los centros cargados tiene que ser el elegido (al cambiar, llegan un instante después).
    if (centros.valor.servicio !== est.servicio) return vacio;
    // La proyección todavía no ha llegado: ni cifras de hoy con la etiqueta de 2030.
    if (base.valor.anio !== est.anio) return vacio;
    try {
      const opciones = opcionesEstado({ servicio: est.servicio, radio_m: est.radio_m, referencia: est.referencia });
      if (base.valor.anio === ANIO_HOY) return { estado: calcularEstado(est.servicio, base.valor.secciones, centros.valor, opciones), estadoHoy: null, error: null };
      // 2030: la referencia de residencias se queda en el valor de hoy (número fijo) y se calcula también el estado de hoy para compararlos.
      if (esServicioConPlazas(est.servicio)) {
        const hoy = calcularEstado(est.servicio, baseHoy.valor.secciones, centros.valor, opciones);
        return { estado: calcularEstado(est.servicio, base.valor.secciones, centros.valor, { ...opciones, umbral: hoy.umbral }), estadoHoy: hoy, error: null };
      }
      return { estado: calcularEstado(est.servicio, base.valor.secciones, centros.valor, opciones), estadoHoy: null, error: null };
    } catch (e) {
      return { ...vacio, error: e instanceof Error ? e.message : "No se pudo calcular" };
    }
  }, [base, baseHoy, centros, est.servicio, est.radio_m, est.referencia, est.anio]);

  const pintura = useMemo(() => (calculo.estado ? valoresMapa(calculo.estado) : null), [calculo.estado]);

  return {
    est: zonaValida === est.zona ? est : { ...est, zona: zonaValida },
    baseHoy,
    anioActivo,
    cargandoAnio,
    errorAnio: avisoAnio.error,
    reintentarAnio: avisoAnio.reintentar,
    cambiar,
    elegirServicio,
    base,
    reintentarBase,
    centros,
    reintentarCentros,
    estado: calculo.estado,
    estadoHoy: calculo.estadoHoy,
    errorCalculo: calculo.error,
    pintura,
  };
}
