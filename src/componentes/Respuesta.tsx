import "./Respuesta.css";
import {
  consejo,
  etiquetaVentana,
  fraseVeredicto,
  nombrePolen,
  palabraVariable,
  type Perfil,
  type ResultadoFranja,
} from "../lib/franja";
import { fechaHoraLarga } from "../lib/formato";
import { etiquetaDeNivel } from "../lib/riesgo";
import type { Municipio, OrigenDatos } from "../lib/tipos";
import { FranjaHoras } from "./FranjaHoras";
import { IconoAviso } from "./Iconos";

interface Props {
  perfil: Perfil;
  municipio: Municipio;
  ahora: Date;
  estado: "cargando" | "lista" | "error";
  resultado: ResultadoFranja | null;
  sinPrevision: string[];
  /** De dónde vino el pronóstico y si es viejo. */
  avisoPronostico: string | null;
  generadoPronostico: string | null;
  origenPronostico: OrigenDatos;
  /** Última medición de aire de la red (texto ya formateado, p. ej. «hoy, 10:00»). */
  aireMedido: string | null;
  avisoEstado: { origen: OrigenDatos; generado: string } | null;
  onReintentar: () => void;
}

export function Respuesta(p: Props) {
  const r = p.resultado;
  const nivel = r?.veredicto ?? "sin_dato";
  const cuando = r?.dia === "manana" ? "Mañana" : "Hoy";
  const lugar = p.municipio.nombre;

  return (
    <section className="respuesta" aria-labelledby="titular">
      <div className={`respuesta__veredicto nivel-${nivel}`} aria-live="polite">
        {p.estado === "cargando" && (
          <h2 id="titular" className="titular titular--carga">
            Mirando el cielo sobre {lugar}…
          </h2>
        )}
        {p.estado === "error" && (
          <>
            <h2 id="titular" className="titular">
              No hemos podido preparar tu previsión
            </h2>
            <p className="respuesta__texto">Ni la última actualización ni la copia de respaldo han respondido.</p>
            <button type="button" className="boton" onClick={p.onReintentar}>
              Reintentar
            </button>
          </>
        )}
        {p.estado === "lista" && (
          <>
            <h2 id="titular" className="titular">
              {r?.veredicto === "sin_dato" ? (
                <>No tenemos datos suficientes para {lugar}</>
              ) : (
                <>
                  {cuando} en {lugar}: <span className="titular__veredicto">{fraseVeredicto(nivel)}</span>
                </>
              )}
            </h2>
            {r && r.veredicto === "sin_dato" && (
              <p className="respuesta__texto">
                {p.sinPrevision.length > 0 && p.perfil.afecta === "polen"
                  ? "Ninguno de los tipos de polen que has elegido tiene previsión. Prueba con otro tipo o con la opción de aire."
                  : "La previsión de esta zona no trae datos para lo que te afecta."}
              </p>
            )}
          </>
        )}
      </div>

      {p.estado === "lista" && r && r.veredicto !== "sin_dato" && (
        <>
          <dl className="horas">
            <div className="horas__bloque horas__bloque--mejor">
              <dt>Mejor hora para salir</dt>
              <dd>
                {r.sinBuenaHora ? (
                  <span className="horas__valor horas__valor--frase horas__valor--sin">
                    {r.dia === "manana" ? "Mañana no hay una buena hora" : "Hoy no hay una buena hora"}
                  </span>
                ) : r.todoIgual ? (
                  <span className="horas__valor horas__valor--frase">Todo el día está {r.veredicto === "bajo" ? "bien" : "igual"}</span>
                ) : r.mejor ? (
                  <span className="horas__valor dato">{etiquetaVentana(r.mejor)}</span>
                ) : (
                  <span className="horas__valor horas__valor--frase">Ninguna franja clara</span>
                )}
                {r.sinBuenaHora && (
                  <span className="horas__nota">
                    Nivel alto a todas horas.
                    {r.mejorManana && ` ${r.dia === "manana" ? "Al día siguiente" : "Mañana"} lo mejor es ${etiquetaVentana(r.mejorManana)} (nivel ${etiquetaDeNivel(r.mejorManana.nivel).toLowerCase()}).`}
                  </span>
                )}
                {!r.sinBuenaHora && r.todoIgual && r.veredicto !== "bajo" && (
                  <span className="horas__nota">Nivel {etiquetaDeNivel(r.veredicto).toLowerCase()} a todas horas.</span>
                )}
                {!r.sinBuenaHora && r.mejor && <span className="horas__nota">Nivel {etiquetaDeNivel(r.mejor.nivel).toLowerCase()}, entre las 7:00 y las 22:00.</span>}
              </dd>
            </div>
            {r.peor && (
              <div className="horas__bloque horas__bloque--peor">
                <dt>Evita</dt>
                <dd>
                  <span className="horas__valor dato">{etiquetaVentana(r.peor)}</span>
                  {r.peor.culpable && <span className="horas__nota">Por el {palabraVariable(r.peor.culpable)}.</span>}
                </dd>
              </div>
            )}
          </dl>

          <FranjaHoras horas={r.horas} ahora={p.ahora} mejor={r.mejor} />

          <p className="respuesta__consejo">
            {consejo(r.veredicto, p.perfil.afecta)}
            <span className="respuesta__pequeno"> Orientativo: no sustituye el consejo médico.</span>
          </p>
        </>
      )}

      {p.estado === "lista" && p.sinPrevision.length > 0 && p.perfil.afecta !== "aire" && (
        <p className="aviso" role="note">
          <IconoAviso tam={16} />
          <span>
            No hay previsión de polen de {listar(p.sinPrevision.map((t) => nombrePolen(t).toLowerCase()))}: el modelo europeo (CAMS) no lo
            calcula. {r && r.variables.length > 0 ? "El resultado solo cuenta el resto de lo que has elegido." : ""}
          </span>
        </p>
      )}
      {p.estado === "lista" && p.municipio.cobertura_aire === "lejana" && (
        <p className="aviso" role="note">
          <IconoAviso tam={16} />
          <span>
            En {lugar} no hay estación de la Comunidad de Madrid (la red de la capital es del Ayuntamiento): usamos el aire de la
            estación más cercana, a {String(p.municipio.dist_estacion_km).replace(".", ",")} km.
          </span>
        </p>
      )}
      {p.avisoPronostico && (
        <p className="aviso" role="alert">
          <IconoAviso tam={16} />
          <span>{p.avisoPronostico}</span>
          <button type="button" className="boton" onClick={p.onReintentar}>
            Reintentar
          </button>
        </p>
      )}
      {p.avisoEstado?.origen === "respaldo" && (
        <p className="aviso" role="alert">
          <IconoAviso tam={16} />
          <span>
            Mediciones de respaldo del <strong>{fechaHoraLarga(p.avisoEstado.generado)}</strong>: no se ha podido leer la última
            actualización.
          </span>
        </p>
      )}

      <p className="respuesta__fuente">
        Previsión: CAMS Europa vía Open-Meteo
        {p.generadoPronostico ? ` (calculada ${fechaHoraLarga(p.generadoPronostico)})` : ""}.
        {p.aireMedido ? ` Aire medido: red de la Comunidad de Madrid, ${p.aireMedido}.` : ""}
      </p>
    </section>
  );
}

function listar(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
