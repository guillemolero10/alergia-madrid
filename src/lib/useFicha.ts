// Datos de la ficha de «Mi municipio»: el estado de los 7 servicios (calculados uno a uno, cediendo el hilo entre cada uno para
// que la página no se quede parada: el de desfibriladores tarda cerca de un segundo) y los otros servicios sociales.
import { useEffect, useMemo, useState } from "react";
import { crearEntorno } from "./donde/herramientas";
import { SERVICIO_IDS } from "./donde/servicios";
import type { Centros, Datos, EstadoServicio, ServicioId, UmbralDeficit } from "./donde/tipos";
import { cargarCentros, cargarOtros, type BaseDonde, type Carga } from "./useDonde";

/** Primero los ligeros; el desfibrilador, el último. */
const ORDEN: ServicioId[] = [...SERVICIO_IDS.filter((s) => s !== "dea"), "dea"];

export interface DatosFicha {
  estados: Partial<Record<ServicioId, EstadoServicio>>;
  /** Los 7 servicios ya están calculados. */
  completo: boolean;
  error: string | null;
  reintentar: () => void;
  otros: Carga<Centros>;
}

const cederHilo = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * `activo`: solo se calcula cuando se ve la pestaña. `referencia`: la que ha elegido el usuario en el simulador, para que la ficha y el
 * mapa den las mismas cifras de residencias.
 */
export function useFicha(base: BaseDonde | null, referencia: UmbralDeficit | undefined, activo: boolean): DatosFicha {
  const [estados, setEstados] = useState<Partial<Record<ServicioId, EstadoServicio>>>({});
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [otros, setOtros] = useState<Carga<Centros>>({ fase: "cargando" });

  const datos = useMemo<Datos | null>(() => (base ? { secciones: base.secciones, territorios: base.territorios, servicios: {} } : null), [base]);

  useEffect(() => {
    if (!datos || !activo) return;
    let cancelado = false;
    setError(null);
    const entorno = crearEntorno(datos, { cargarServicio: cargarCentros, ...(referencia === undefined ? {} : { referencia }) });
    void (async () => {
      for (const id of ORDEN) {
        try {
          const e = await entorno.estado(id);
          if (cancelado) return;
          setEstados((prev) => (prev[id] === e ? prev : { ...prev, [id]: e }));
        } catch (err) {
          if (!cancelado) setError(err instanceof Error ? err.message : "No se pudieron cargar los datos");
          return;
        }
        await cederHilo();
        if (cancelado) return;
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [datos, referencia, activo, intento]);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    setOtros((o) => (o.fase === "listo" ? o : { fase: "cargando" }));
    cargarOtros().then(
      (valor) => !cancelado && setOtros({ fase: "listo", valor }),
      (e: unknown) => !cancelado && setOtros({ fase: "error", mensaje: e instanceof Error ? e.message : "No se pudieron cargar los datos" }),
    );
    return () => {
      cancelado = true;
    };
  }, [activo, intento]);

  return { estados, completo: ORDEN.every((id) => estados[id]), error, reintentar: () => setIntento((n) => n + 1), otros };
}
