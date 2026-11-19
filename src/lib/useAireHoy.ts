// Carga del aire de hoy para la ficha de «Mi municipio»: el estado (mediciones) y el pronóstico, en paralelo y solo cuando el bloque
// se monta (no cuenta para el arranque de la ficha). La carga se comparte entre fichas durante unos minutos: cambiar de municipio
// no vuelve a pedir nada. Se refresca cada 10 min y el reloj avanza cada minuto para que la antigüedad se mantenga al día.
import { useCallback, useEffect, useState } from "react";
import { cargarEstado, cargarPronostico, lugares } from "./datos";
import { calcularAireHoy, type LugarMinimo, type VistaAire } from "./aireHoy";
import type { EstadoActual, OrigenDatos, Pronostico } from "./tipos";

const VIGENCIA_MS = 5 * 60_000;
const REFRESCO_MS = 10 * 60_000;

interface Cargado {
  estado: EstadoActual | null;
  origenEstado: OrigenDatos;
  pronostico: Pronostico | null;
  origenPronostico: OrigenDatos;
  /** Se pudo leer algo (aunque sea de la copia). */
  cuando: number;
}

let compartido: Cargado | null = null;
let enVuelo: Promise<Cargado> | null = null;

/** Pide estado y pronóstico a la vez. Un fallo de uno no tumba al otro; si fallan los dos, devuelve ambos a `null`. */
function pedir(forzar: boolean): Promise<Cargado> {
  if (!forzar && compartido && Date.now() - compartido.cuando < VIGENCIA_MS) return Promise.resolve(compartido);
  if (enVuelo) return enVuelo;
  enVuelo = Promise.allSettled([cargarEstado(), cargarPronostico()])
    .then(([e, p]) => {
      const previo = compartido;
      const nuevo: Cargado = {
        estado: e.status === "fulfilled" ? e.value.estado : null,
        origenEstado: e.status === "fulfilled" ? e.value.origen : "respaldo",
        pronostico: p.status === "fulfilled" ? p.value.pronostico : null,
        origenPronostico: p.status === "fulfilled" ? p.value.origen : "respaldo",
        cuando: Date.now(),
      };
      // Un refresco fallido o que solo llega a la copia no pisa datos buenos de la red.
      if (previo) {
        if ((nuevo.estado === null || nuevo.origenEstado === "respaldo") && previo.estado && previo.origenEstado === "red") {
          nuevo.estado = previo.estado;
          nuevo.origenEstado = previo.origenEstado;
        }
        if ((nuevo.pronostico === null || nuevo.origenPronostico === "respaldo") && previo.pronostico && previo.origenPronostico === "red") {
          nuevo.pronostico = previo.pronostico;
          nuevo.origenPronostico = previo.origenPronostico;
        }
      }
      compartido = nuevo;
      return nuevo;
    })
    .finally(() => {
      enVuelo = null;
    });
  return enVuelo;
}

/** Solo para las pruebas. */
export function olvidarCargaAire(): void {
  compartido = null;
  enVuelo = null;
}

export type CargaAire = { fase: "cargando" } | { fase: "sin_datos" } | { fase: "lista"; vista: VistaAire | null };

export function useAireHoy(lugar: LugarMinimo | null): { carga: CargaAire; ahora: Date; reintentar: () => void } {
  const [datos, setDatos] = useState<Cargado | null>(compartido);
  const [ahora, setAhora] = useState(() => new Date());
  const [intento, setIntento] = useState(0);
  const [terminado, setTerminado] = useState(compartido !== null);

  useEffect(() => {
    let cancelado = false;
    const cargar = (forzar: boolean) => {
      void pedir(forzar).then((c) => {
        if (cancelado) return;
        setDatos(c);
        setAhora(new Date());
        setTerminado(true);
      });
    };
    // Cede el hilo un momento: la ficha empieza a calcular sus servicios antes de que arranque la petición.
    const arranque = setTimeout(() => cargar(intento > 0), 0);
    const refresco = setInterval(() => cargar(true), REFRESCO_MS);
    const reloj = setInterval(() => setAhora(new Date()), 60_000);
    return () => {
      cancelado = true;
      clearTimeout(arranque);
      clearInterval(refresco);
      clearInterval(reloj);
    };
  }, [intento]);

  const carga: CargaAire = (() => {
    if (!terminado || !datos) return { fase: "cargando" };
    if (!datos.estado && !datos.pronostico) return { fase: "sin_datos" };
    if (!lugar) return { fase: "sin_datos" };
    return {
      fase: "lista",
      vista: calcularAireHoy({
        lugar,
        lugares,
        estado: datos.estado,
        origenEstado: datos.origenEstado,
        pronostico: datos.pronostico,
        origenPronostico: datos.origenPronostico,
        ahora,
      }),
    };
  })();

  const reintentar = useCallback(() => {
    setTerminado(false);
    setIntento((n) => n + 1);
  }, []);

  return { carga, ahora, reintentar };
}
