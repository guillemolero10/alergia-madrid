import { polenVigente } from "./ficha";
import { esPolen, nivelMaximo, ordenDeNivel } from "./riesgo";
import { VARIABLES_AIRE, type Afeccion } from "./franja";
import type { EstadoActual, Nivel, Observacion } from "./tipos";

// Nivel de un lugar PARA UN PERFIL: el máximo de los niveles que el pipeline ya calculó para las variables que
// afectan a esa persona (aire si tiene asma o EPOC, los pólenes que ha marcado si es alérgica). La web no
// recalcula umbrales: solo elige qué variables cuentan. El mapa se pinta con esto, no con el riesgo global.

export interface PerfilNivel {
  afecta: Afeccion;
  polenes: readonly string[];
}

export interface NivelPerfil {
  nivel: Nivel;
  nivelAire: Nivel;
  nivelPolen: Nivel;
  /** Variable que da el nivel (la primera con el nivel más alto); `null` si es bajo o no hay dato. */
  peor: string | null;
}

export interface OpcionesNivelPerfil {
  /** Capas encendidas en el mapa: apagar «aire» o «polen» excluye esas variables. */
  aire?: boolean;
  polen?: boolean;
}

export function nivelParaPerfil(
  estado: EstadoActual,
  perfil: PerfilNivel,
  estacion: string | null,
  captador: string | null,
  { aire = true, polen = true }: OpcionesNivelPerfil = {},
): NivelPerfil {
  const delAire: Observacion[] =
    aire && perfil.afecta !== "polen" && estacion
      ? estado.observaciones.filter((o) => o.lugar === estacion && (VARIABLES_AIRE as readonly string[]).includes(o.variable))
      : [];
  const delPolen: Observacion[] =
    polen && perfil.afecta !== "aire" && captador && estado.capas.polen
      ? polenVigente(
          estado,
          estado.observaciones.filter((o) => o.lugar === captador && esPolen(o.variable) && perfil.polenes.includes(o.variable.slice("polen_".length))),
        )
      : [];
  const nivelAire = nivelMaximo(delAire.map((o) => o.nivel));
  const nivelPolen = nivelMaximo(delPolen.map((o) => o.nivel));
  const nivel = nivelMaximo([nivelAire, nivelPolen]);
  const peor = ordenDeNivel(nivel) > 1 ? ([...delAire, ...delPolen].find((o) => o.nivel === nivel)?.variable ?? null) : null;
  return { nivel, nivelAire, nivelPolen, peor };
}
