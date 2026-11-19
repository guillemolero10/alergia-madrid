// Estado de «Tú decides»: el marcador del usuario (con su resultado en vivo), el punto del modelo (óptimo calculado en un
// Web Worker) y la comparación entre los dos. Lo comparten el panel y el mapa.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clienteOptimo } from "./clienteOptimoWeb";
import { Cancelado } from "./donde/clienteOptimo";
import {
  compararConOptimo,
  evaluarPunto,
  municipioEnPunto,
  opcionesDeEstado,
  plazasEfectivas,
  seccionesResaltadas,
  valorPrincipal,
  type Comparacion,
  type Evaluacion,
} from "./donde/tuDecides";
import { nombreZonas, zonaParaMotor } from "./donde/panelDonde";
import type { PuntoOptimo, ServicioId, Territorios } from "./donde/tipos";
import type { PuntoSim } from "./donde/urlDonde";
import type { Donde } from "./useDonde";

/** Pausa antes de recalcular mientras se arrastra el marcador o se mueve el control de plazas. */
export const RETARDO_RESULTADO_MS = 100;
const RETARDO_MODELO_MS = 250;

/** El valor, pero con retardo: los cambios seguidos (arrastrar, mover el control) se recogen una sola vez. El primer valor es inmediato. */
function useRetardo<T>(valor: T, ms: number): T {
  const [retardado, setRetardado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setRetardado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return retardado;
}

export type FaseModelo = "inactivo" | "calculando" | "listo" | "error";

export interface Modelo {
  fase: FaseModelo;
  /** Servicio para el que se calculó (si cambia el servicio, el modelo deja de valer). */
  servicio: ServicioId | null;
  /** Mejor punto según el modelo, o null si no hay ninguno que haga ganar acceso a alguien. */
  punto: PuntoOptimo | null;
  nombreMunicipio: string | null;
  /** Secciones que ganan acceso (distancia) o donde faltan menos plazas (plazas) con el punto del modelo. */
  secciones: number[];
  /** Zona en la que se ha buscado el óptimo (null = toda la Comunidad) y su nombre. */
  zona: string | null;
  ambito: string;
  mensaje: string | null;
  /** `agente`: el punto lo ha propuesto el agente (el óptimo que calculó con las mismas herramientas), no el botón del modelo. */
  origen?: "agente";
  /** Texto del marcador del mapa (por defecto, «Modelo»). */
  etiqueta?: string;
  /** Otros puntos que propone el agente (hasta 2 más), solo para dibujarlos. */
  otros?: { lat: number; lon: number; etiqueta: string; ganan: number; reduce?: number }[];
}

/** Un punto que propone el agente. `plazas`: las del centro con las que calculó. `reduce`: N (solo plazas), la cifra principal. */
export interface PuntoAgente {
  lat: number;
  lon: number;
  etiqueta: string;
  ganan: number;
  plazas?: number;
  reduce?: number;
}

const MODELO_INACTIVO: Modelo = { fase: "inactivo", servicio: null, punto: null, nombreMunicipio: null, secciones: [], zona: null, ambito: "la Comunidad de Madrid", mensaje: null };

export interface TuDecides {
  /** Esperando el clic que coloca el centro. */
  colocando: boolean;
  /** Mensaje del último intento de colocar (por ejemplo, fuera de la Comunidad); se borra al colocar bien. */
  aviso: string | null;
  /** Dónde se dibuja el marcador ahora mismo (el punto fijo o el que se está arrastrando). */
  punto: PuntoSim | null;
  /** Plazas del centro simulado, o null si el servicio no tiene plazas. */
  plazas: number | null;
  /** Resultado del punto (con un retardo de 100 ms); null si no hay punto o aún no están los datos. */
  evaluacion: Evaluacion | null;
  /** Hay un resultado en camino (el punto acaba de cambiar). */
  recalculando: boolean;
  modelo: Modelo;
  comparacion: Comparacion | null;
  iniciarColocar: () => void;
  cancelarColocar: () => void;
  /** Coloca el centro en un punto (clic o «centro del mapa»). Devuelve false si cae fuera de la Comunidad. */
  colocar: (lat: number, lon: number) => boolean;
  /** Mientras se arrastra: actualiza el resultado sin tocar la URL. */
  mover: (lat: number, lon: number) => void;
  /** Al soltar: fija el punto en la URL. */
  soltar: (lat: number, lon: number) => void;
  ponerPlazas: (n: number) => void;
  pedirModelo: () => void;
  quitarModelo: () => void;
  /** El agente pinta su(s) punto(s) óptimo(s) como el punto del modelo, sin recalcularlo. */
  fijarModelo: (servicio: ServicioId, puntos: PuntoAgente[]) => void;
  borrar: () => void;
}

export function useTuDecides(donde: Donde): TuDecides {
  const { est, cambiar, estado, base, centros } = donde;
  const territorios: Territorios | null = base.fase === "listo" ? base.valor.territorios : null;
  const secciones = base.fase === "listo" ? base.valor.secciones : null;

  const [colocando, setColocando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [vivo, setVivo] = useState<PuntoSim | null>(null);
  /** Servicio para el que se ha pedido el modelo. Si el usuario cambia de servicio, `modeloActivo` se apaga en el mismo render (sin carreras con efectos). */
  const [modeloPedido, setModeloPedido] = useState<ServicioId | null>(null);
  const [modeloCalculado, setModelo] = useState<Modelo>(MODELO_INACTIVO);
  const modeloActivo = modeloPedido === est.servicio;
  /** Punto(s) que ha propuesto el agente: tienen prioridad sobre el modelo del botón mientras valgan para este servicio. */
  const [externo, setExterno] = useState<{ servicio: ServicioId; puntos: PuntoAgente[] } | null>(null);
  /** Sube cada vez que se pide el modelo, para poder reintentar tras un error. */
  const [intento, setIntento] = useState(0);

  const plazas = plazasEfectivas(est.servicio, est.plazas);
  const punto = vivo ?? est.sim;

  // ------------------------------------------------------------ resultado del punto
  const puntoRetardado = useRetardo(punto, RETARDO_RESULTADO_MS);
  const plazasRetardadas = useRetardo(plazas, RETARDO_RESULTADO_MS);
  const evaluacion = useMemo<Evaluacion | null>(() => {
    if (!estado || !territorios || !puntoRetardado) return null;
    return evaluarPunto(estado, territorios, puntoRetardado.lat, puntoRetardado.lon, plazasRetardadas);
  }, [estado, territorios, puntoRetardado, plazasRetardadas]);
  const recalculando = punto !== puntoRetardado || plazas !== plazasRetardadas;

  const modeloDelAgente = useMemo<Modelo | null>(() => {
    const p0 = externo && externo.servicio === est.servicio ? externo.puntos[0] : undefined;
    if (!externo || !p0) return null;
    const municipio = territorios ? municipioEnPunto(territorios, p0.lat, p0.lon) : null;
    // Las secciones que ganan con ese punto, con el mismo motor y las mismas plazas que usó el agente.
    const ev = estado && territorios && estado.servicio === externo.servicio ? evaluarPunto(estado, territorios, p0.lat, p0.lon, p0.plazas ?? plazasEfectivas(est.servicio, null)) : null;
    return {
      fase: "listo",
      servicio: externo.servicio,
      punto: {
        lat: p0.lat,
        lon: p0.lon,
        seccion: "",
        indice: -1,
        municipio: municipio?.id ?? "",
        ganan: p0.ganan,
        acumulado: p0.ganan,
        ...(p0.reduce === undefined ? {} : { reduce: p0.reduce, reduceAcumulado: p0.reduce }),
      },
      nombreMunicipio: municipio?.nombre ?? null,
      secciones: ev?.tipo === "ok" && estado ? seccionesResaltadas(estado, ev.sim) : [],
      zona: municipio?.zona ?? null,
      ambito: "",
      mensaje: null,
      origen: "agente",
      etiqueta: p0.etiqueta,
      otros: externo.puntos.slice(1),
    };
  }, [externo, est.servicio, estado, territorios]);
  const modelo = modeloDelAgente ?? (modeloActivo && modeloCalculado.servicio === est.servicio ? modeloCalculado : MODELO_INACTIVO);

  // ------------------------------------------------------------ colocar, arrastrar, borrar
  const throttle = useRef<{ reloj: ReturnType<typeof setTimeout> | null; ultimo: PuntoSim | null }>({ reloj: null, ultimo: null });
  const limpiarThrottle = useCallback(() => {
    if (throttle.current.reloj) clearTimeout(throttle.current.reloj);
    throttle.current = { reloj: null, ultimo: null };
  }, []);
  useEffect(() => limpiarThrottle, [limpiarThrottle]);

  const iniciarColocar = useCallback(() => {
    setAviso(null);
    setColocando(true);
  }, []);
  const cancelarColocar = useCallback(() => {
    setColocando(false);
    setAviso(null);
  }, []);

  const colocar = useCallback(
    (lat: number, lon: number) => {
      if (!territorios || !municipioEnPunto(territorios, lat, lon)) {
        setAviso("Fuera de la Comunidad de Madrid: elige un punto dentro del territorio.");
        return false;
      }
      limpiarThrottle();
      setVivo(null);
      setAviso(null);
      setColocando(false);
      cambiar({ sim: { lat, lon } });
      return true;
    },
    [territorios, cambiar, limpiarThrottle],
  );

  const mover = useCallback((lat: number, lon: number) => {
    throttle.current.ultimo = { lat, lon };
    if (throttle.current.reloj) return;
    throttle.current.reloj = setTimeout(() => {
      throttle.current.reloj = null;
      if (throttle.current.ultimo) setVivo(throttle.current.ultimo);
    }, RETARDO_RESULTADO_MS);
  }, []);

  const soltar = useCallback(
    (lat: number, lon: number) => {
      limpiarThrottle();
      setVivo(null);
      cambiar({ sim: { lat, lon } });
    },
    [cambiar, limpiarThrottle],
  );

  const ponerPlazas = useCallback((n: number) => cambiar({ plazas: n }), [cambiar]);

  const borrar = useCallback(() => {
    limpiarThrottle();
    setVivo(null);
    setColocando(false);
    setAviso(null);
    setModeloPedido(null);
    setModelo(MODELO_INACTIVO);
    setExterno(null);
    cambiar({ sim: null, plazas: null });
  }, [cambiar, limpiarThrottle]);

  // Al cambiar de servicio (o de radio) se empieza de cero: el punto lo quita `conServicio`; aquí, el resto.
  const servicioAnterior = useRef(est.servicio);
  useEffect(() => {
    if (servicioAnterior.current === est.servicio) return;
    servicioAnterior.current = est.servicio;
    setModeloPedido(null);
    setModelo(MODELO_INACTIVO);
    setExterno(null);
    setColocando(false);
    setAviso(null);
    setVivo(null);
  }, [est.servicio]);

  // ------------------------------------------------------------ el modelo (Web Worker)
  const zonaDelPunto = evaluacion?.tipo === "ok" ? evaluacion.municipio.zona : null;
  const zonaAmbito = zonaDelPunto ?? est.zona;
  const plazasModelo = useRetardo(plazas, RETARDO_MODELO_MS);
  const centrosListos = centros.fase === "listo" && centros.valor.servicio === est.servicio ? centros.valor : null;

  const pedirModelo = useCallback(() => {
    setExterno(null);
    setModeloPedido(est.servicio);
    setIntento((n) => n + 1);
  }, [est.servicio]);
  const quitarModelo = useCallback(() => {
    setExterno(null);
    setModeloPedido(null);
    setModelo(MODELO_INACTIVO);
  }, []);
  const fijarModelo = useCallback((servicio: ServicioId, puntos: PuntoAgente[]) => {
    setModeloPedido(null);
    setModelo(MODELO_INACTIVO);
    setExterno(puntos.length ? { servicio, puntos: puntos.slice(0, 3) } : null);
  }, []);

  useEffect(() => {
    if (!modeloActivo) return;
    if (!estado || !secciones || !territorios || !centrosListos || estado.servicio !== est.servicio) return;
    const nombreZona = zonaAmbito ? nombreZonas(territorios, zonaAmbito) : null;
    const ambito = nombreZona ?? "la Comunidad de Madrid";
    const servicio = est.servicio;
    // Si lo que había era de otro servicio, no se arrastra su punto.
    setModelo((m) => ({ ...(m.servicio === servicio ? m : MODELO_INACTIVO), fase: "calculando", servicio, zona: zonaAmbito, ambito, mensaje: null }));
    const pedido = clienteOptimo.calcular(est.servicio, secciones, centrosListos, opcionesDeEstado(estado), {
      n: 1,
      ...(zonaAmbito ? { zona: zonaParaMotor(zonaAmbito) } : {}),
      ...(plazasModelo !== null ? { plazas: plazasModelo } : {}),
    });
    let vigente = true;
    pedido.promesa.then(
      (r) => {
        if (!vigente) return;
        const p = r.puntos[0] ?? null;
        if (!p) {
          setModelo({
            ...MODELO_INACTIVO,
            fase: "listo",
            servicio,
            zona: zonaAmbito,
            ambito,
            mensaje: `Ningún punto de ${ambito} ${estado.metrica === "plazas" ? "reduce las plazas que faltan" : "hace ganar acceso a nadie"} con estos ajustes.`,
          });
          return;
        }
        // Las secciones que ganan con el punto del modelo, con el mismo motor que el punto del usuario.
        const ev = evaluarPunto(estado, territorios, p.lat, p.lon, plazasModelo);
        setModelo({
          fase: "listo",
          servicio,
          punto: p,
          nombreMunicipio: territorios.municipios.find((m) => m.id === p.municipio)?.nombre ?? null,
          secciones: ev.tipo === "ok" ? seccionesResaltadas(estado, ev.sim) : [],
          zona: zonaAmbito,
          ambito,
          mensaje: null,
        });
      },
      (e: unknown) => {
        if (!vigente || e instanceof Cancelado) return;
        setModelo({ ...MODELO_INACTIVO, fase: "error", servicio, zona: zonaAmbito, ambito, mensaje: e instanceof Error ? e.message : "No se pudo calcular el modelo" });
      },
    );
    return () => {
      vigente = false;
      pedido.cancelar();
    };
    // `est` entero cambia con cada parámetro; lo que cuenta aquí es el servicio, el radio y la referencia (ya recogidos en `estado`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modeloActivo, intento, estado, secciones, territorios, centrosListos, zonaAmbito, plazasModelo]);

  const comparacion = useMemo<Comparacion | null>(() => {
    if (modelo.fase !== "listo" || !modelo.punto || evaluacion?.tipo !== "ok") return null;
    if (!estado) return null;
    return compararConOptimo(valorPrincipal(estado, evaluacion.sim), valorPrincipal(estado, modelo.punto));
  }, [modelo, evaluacion, estado]);

  return {
    colocando,
    aviso,
    punto,
    plazas,
    evaluacion,
    recalculando,
    modelo,
    comparacion,
    iniciarColocar,
    cancelarColocar,
    colocar,
    mover,
    soltar,
    ponerPlazas,
    pedirModelo,
    quitarModelo,
    fijarModelo,
    borrar,
  };
}
