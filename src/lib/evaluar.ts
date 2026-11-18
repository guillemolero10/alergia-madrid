import {
  calcularFranja,
  medidasDelPerfil,
  variablesConMedidas,
  variablesDelPerfil,
  zonaDe,
  type Medida,
  type Perfil,
  type ResultadoFranja,
} from "./franja";
import type { EstadoActual, Lugares, Pronostico } from "./tipos";

/** Estación de aire y captador de polen de los que sale el dato (los tiene un municipio y también un colegio). */
export interface FuenteDato {
  estacion: string;
  captador: string | null;
}

export interface EvaluacionLugar {
  resultado: ResultadoFranja;
  medidas: Medida[];
  /** Pólenes elegidos que CAMS no prevé y que tampoco se han medido ese día. */
  sinPrevision: string[];
}

/**
 * La franja de 48 h de un lugar para un perfil: previsión CAMS combinada con lo medido (el máximo de ambos).
 * Es lo mismo que calcula la pantalla «Para ti», pero para cualquier estación y captador.
 * `null` si el pronóstico no tiene la zona de esa estación.
 */
export function evaluarLugar(
  perfil: Pick<Perfil, "afecta" | "polenes">,
  fuente: FuenteDato,
  pronostico: Pronostico,
  estado: EstadoActual,
  lugares: Pick<Lugares, "estaciones" | "captadores">,
  ahora: Date,
): EvaluacionLugar | null {
  const zona = zonaDe(pronostico, fuente.estacion);
  if (!zona) return null;
  const vars = variablesDelPerfil(perfil, zona, pronostico.sin_pronostico);
  const medidas = medidasDelPerfil(perfil, estado, fuente, lugares, ahora);
  const resultado = calcularFranja({
    horas: pronostico.horas,
    zona,
    variables: variablesConMedidas(vars.variables, medidas),
    ahora,
    medidas,
  });
  const sinPrevision = vars.sinPrevision.filter((t) => !medidas.some((m) => m.variable === `polen_${t}` && m.dia && resultado.horas.some((h) => h.fecha === m.dia && !h.pasada)));
  return { resultado, medidas, sinPrevision };
}
