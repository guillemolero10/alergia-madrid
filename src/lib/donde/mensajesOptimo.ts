// Mensajes entre la pantalla y el Web Worker del óptimo. Todo son datos serializables (JSON, números y arrays): se
// pueden clonar con `structuredClone`. El manejador no sabe nada del navegador, así que se prueba en Node y también
// sirve de respaldo en el hilo principal si el navegador no puede crear el worker.
import { calcularOptimo, type OpcionesEstado, type OpcionesOptimo } from "./cobertura";
import type { Centros, ResultadoOptimo, Secciones, ServicioId } from "./tipos";

export type MensajeAlWorker =
  | { tipo: "datos"; secciones: Secciones }
  | { tipo: "centros"; servicio: ServicioId; centros: Centros }
  | { tipo: "optimo"; id: number; servicio: ServicioId; estado: OpcionesEstado; opciones: OpcionesOptimo };

export type RespuestaDelWorker =
  | { tipo: "resultado"; id: number; resultado: ResultadoOptimo }
  | { tipo: "error"; id: number; mensaje: string };

/** Guarda las secciones y los centros que le llegan una sola vez y contesta a cada petición de óptimo. */
export function crearManejador(): (m: MensajeAlWorker) => RespuestaDelWorker | null {
  let secciones: Secciones | null = null;
  const centros = new Map<ServicioId, Centros>();
  return (m) => {
    if (m.tipo === "datos") {
      secciones = m.secciones;
      return null;
    }
    if (m.tipo === "centros") {
      centros.set(m.servicio, m.centros);
      return null;
    }
    const c = centros.get(m.servicio);
    if (!secciones || !c) return { tipo: "error", id: m.id, mensaje: "Al worker le faltan los datos del servicio" };
    try {
      return { tipo: "resultado", id: m.id, resultado: calcularOptimo(m.servicio, secciones, c, m.estado, m.opciones) };
    } catch (e) {
      return { tipo: "error", id: m.id, mensaje: e instanceof Error ? e.message : "No se pudo calcular el óptimo" };
    }
  };
}
