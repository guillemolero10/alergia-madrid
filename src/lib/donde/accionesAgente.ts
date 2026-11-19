// Ejecución de las `Accion` que devuelve el agente (la respuesta del servidor o la del modo sin IA). Se ejecutan en orden y
// una a una; cada una se valida antes de tocar la pantalla (una respuesta de IA no es de fiar) y un fallo no corta las siguientes.
// Sin DOM ni React: el `Destino` lo implementa `App.tsx`, aquí solo está el orden, la validación y el texto de cada paso.
import { esServicioId } from "./servicios";
import type { Accion, ServicioId } from "./tipos";
import { coordenadasValidas } from "./urlDonde";

type De<T extends Accion["tipo"]> = Extract<Accion, { tipo: T }>;

/** Lo que el agente puede hacer en pantalla. Cada método puede esperar (por ejemplo, a que lleguen los datos del servicio). */
export interface Destino {
  elegirServicio(a: De<"elegir_servicio">): void | Promise<void>;
  moverMapa(a: De<"mover_mapa">): void | Promise<void>;
  marcarPuntos(a: De<"marcar_puntos">): void | Promise<void>;
  mostrarRanking(a: De<"mostrar_ranking">): void | Promise<void>;
  abrirFicha(a: De<"abrir_ficha">): void | Promise<void>;
}

export interface ResultadoAccion {
  accion: Accion;
  ok: boolean;
  /** Por qué no se ha ejecutado (para el registro; no se enseña al usuario tal cual). */
  motivo?: string;
}

const ID_LUGAR = /^(mun:\d{5}|dis:\d{7})$/;
const finito = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Devuelve el motivo si la acción no vale, o null si se puede ejecutar. */
export function validarAccion(a: unknown): string | null {
  if (typeof a !== "object" || a === null) return "no es un objeto";
  const x = a as Record<string, unknown>;
  switch (x.tipo) {
    case "elegir_servicio":
      if (typeof x.servicio !== "string" || !esServicioId(x.servicio)) return "servicio desconocido";
      if (x.radio_m !== undefined && !(finito(x.radio_m) && x.radio_m > 0)) return "radio no válido";
      if (x.anio !== undefined && x.anio !== 2025 && x.anio !== 2030) return "año no válido";
      return null;
    case "mover_mapa": {
      if (x.lugar !== undefined && (typeof x.lugar !== "string" || !ID_LUGAR.test(x.lugar))) return "lugar no válido";
      if (x.bbox !== undefined) {
        const b = x.bbox;
        if (!Array.isArray(b) || b.length !== 4 || !b.every(finito)) return "recuadro no válido";
        const [o, s, e, n] = b as number[];
        if (!coordenadasValidas(s, o) || !coordenadasValidas(n, e) || (o as number) >= (e as number) || (s as number) >= (n as number)) return "recuadro fuera de la Comunidad";
        return null;
      }
      if (x.lat !== undefined || x.lon !== undefined) {
        if (!coordenadasValidas(x.lat, x.lon)) return "punto fuera de la Comunidad";
        if (x.zoom !== undefined && !(finito(x.zoom) && x.zoom >= 3 && x.zoom <= 18)) return "zoom no válido";
        return null;
      }
      return x.lugar !== undefined ? null : "sin destino";
    }
    case "marcar_puntos": {
      if (typeof x.servicio !== "string" || !esServicioId(x.servicio)) return "servicio desconocido";
      if (x.origen !== "optimo" && x.origen !== "simulacion") return "origen desconocido";
      if (!Array.isArray(x.puntos) || x.puntos.length === 0 || x.puntos.length > 3) return "puntos no válidos";
      for (const p of x.puntos as Record<string, unknown>[]) {
        if (typeof p !== "object" || p === null || !coordenadasValidas(p.lat, p.lon)) return "punto fuera de la Comunidad";
        if (typeof p.etiqueta !== "string" || !finito(p.ganan)) return "punto incompleto";
        if (p.plazas !== undefined && !(finito(p.plazas) && p.plazas > 0)) return "plazas no válidas";
        if (p.reduce !== undefined && !(finito(p.reduce) && p.reduce >= 0)) return "cifra no válida";
      }
      return null;
    }
    case "mostrar_ranking":
      if (typeof x.servicio !== "string" || !esServicioId(x.servicio)) return "servicio desconocido";
      if (x.nivel !== "municipio" && x.nivel !== "distrito") return "nivel desconocido";
      if (x.zona !== undefined && (typeof x.zona !== "string" || !/^\d{2}(,\d{2}){0,10}$/.test(x.zona))) return "zona no válida";
      return Array.isArray(x.filas) ? null : "sin filas";
    case "abrir_ficha":
      return typeof x.lugar === "string" && ID_LUGAR.test(x.lugar) ? null : "lugar no válido";
    default:
      return "acción desconocida";
  }
}

/** Lo que se le cuenta al usuario mientras se aplica cada acción («Moviendo el mapa…»). */
export function describirAccion(a: Accion): string {
  switch (a.tipo) {
    case "elegir_servicio":
      return "Eligiendo el servicio…";
    case "mover_mapa":
      return "Moviendo el mapa…";
    case "marcar_puntos":
      return a.origen === "optimo" ? "Pintando el punto del modelo…" : "Colocando tu centro…";
    case "mostrar_ranking":
      return "Preparando el ranking…";
    case "abrir_ficha":
      return "Abriendo la ficha del municipio…";
  }
}

/**
 * Ejecuta las acciones en orden. Espera a cada una antes de pasar a la siguiente (elegir un servicio puede tener que cargar
 * sus datos antes de pintar el punto). Nunca lanza: un fallo queda anotado en el resultado.
 */
export async function ejecutarAcciones(
  acciones: readonly Accion[],
  destino: Destino,
  alEmpezar?: (accion: Accion, indice: number) => void,
): Promise<ResultadoAccion[]> {
  const out: ResultadoAccion[] = [];
  for (let i = 0; i < acciones.length; i++) {
    const accion = acciones[i] as Accion;
    const motivo = validarAccion(accion);
    if (motivo) {
      out.push({ accion, ok: false, motivo });
      continue;
    }
    alEmpezar?.(accion, i);
    try {
      switch (accion.tipo) {
        case "elegir_servicio":
          await destino.elegirServicio(accion);
          break;
        case "mover_mapa":
          await destino.moverMapa(accion);
          break;
        case "marcar_puntos":
          await destino.marcarPuntos(accion);
          break;
        case "mostrar_ranking":
          await destino.mostrarRanking(accion);
          break;
        case "abrir_ficha":
          await destino.abrirFicha(accion);
          break;
      }
      out.push({ accion, ok: true });
    } catch (e) {
      out.push({ accion, ok: false, motivo: e instanceof Error ? e.message : "error al ejecutarla" });
    }
  }
  return out;
}

/** Servicio de una acción, si lo tiene (para saber a qué servicio hay que cambiar antes de ejecutarla). */
export function servicioDeAccion(a: Accion): ServicioId | null {
  return a.tipo === "elegir_servicio" || a.tipo === "marcar_puntos" || a.tipo === "mostrar_ranking" ? a.servicio : null;
}

/** Las filas de un `mostrar_ranking` (el servidor las rellena) para enseñarlas dentro del mensaje. */
export function filasDeRanking(acciones: readonly Accion[]): De<"mostrar_ranking"> | null {
  for (const a of acciones) if (a.tipo === "mostrar_ranking" && validarAccion(a) === null) return a;
  return null;
}
