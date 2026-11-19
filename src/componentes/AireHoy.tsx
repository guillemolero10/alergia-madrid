import "./AireHoy.css";
import { hayAire, type VistaAire } from "../lib/aireHoy";
import { consejo, etiquetaVentana, fraseVeredicto, palabraVariable } from "../lib/franja";
import { etiquetaDeNivel } from "../lib/riesgo";
import type { Nivel } from "../lib/tipos";
import { useAireHoy, type CargaAire } from "../lib/useAireHoy";
import type { LugarMinimo } from "../lib/aireHoy";
import { FranjaHoras } from "./FranjaHoras";
import { IconoAviso } from "./Iconos";

interface Props {
  lugar: LugarMinimo;
}

/**
 * «El aire hoy» de la ficha de «Mi municipio»: veredicto del aire para la población general, hora del dato, franja de 24 h y avisos
 * (dato antiguo, copia de respaldo, estación lejana). Se carga aparte de la ficha: si falla, la ficha sigue.
 */
export function AireHoy({ lugar }: Props) {
  const { carga, ahora, reintentar } = useAireHoy(lugar);
  const vista = carga.fase === "lista" && hayAire(carga.vista) ? carga.vista : null;

  return (
    <section className="bloque aire" aria-labelledby="mm-aire" aria-busy={carga.fase === "cargando"}>
      <h3 id="mm-aire" className="rotulo-seccion">
        {vista?.titular?.cuando === "manana" ? "El aire mañana" : "El aire hoy"}
      </h3>
      {carga.fase === "cargando" && <Cargando lugar={lugar.nombre} />}
      {carga.fase !== "cargando" && !vista && <SinAire carga={carga} lugar={lugar.nombre} onReintentar={reintentar} />}
      {vista && <Contenido vista={vista} ahora={ahora} />}
    </section>
  );
}

function Cargando({ lugar }: { lugar: string }) {
  return (
    <>
      <p className="solo-lectores" role="status">
        Cargando el aire de {lugar}…
      </p>
      <div className="esq esq--aire" aria-hidden="true" />
    </>
  );
}

function SinAire({ carga, lugar, onReintentar }: { carga: CargaAire; lugar: string; onReintentar: () => void }) {
  const sinEstacion = carga.fase === "lista";
  return (
    <div className="aire__sin" role="status">
      <p>
        {sinEstacion
          ? `Ahora mismo no tenemos datos de aire para ${lugar}: la estación más cercana no ha enviado mediciones y no hay previsión para su zona.`
          : "No hemos podido leer el aire de hoy: ni la última actualización ni la copia guardada han respondido."}{" "}
        El resto de la ficha no depende de esto.
      </p>
      <button type="button" className="boton" onClick={onReintentar}>
        Reintentar
      </button>
    </div>
  );
}

function frasePorMedida(nivel: Nivel): string {
  return nivel === "bajo" ? "nivel bajo" : nivel === "medio" ? "nivel medio" : nivel === "alto" ? "nivel alto" : "sin dato";
}

function Contenido({ vista, ahora }: { vista: VistaAire; ahora: Date }) {
  const t = vista.titular;
  const nivel: Nivel = t?.nivel ?? "sin_dato";
  const estacion = vista.fuente.estacion.nombre;
  const conPrevision = t !== null && t.cuando !== "medido";
  const aviso = vista.avisos.filter((a) => a.tipo !== "cobertura");
  const cobertura = vista.avisos.find((a) => a.tipo === "cobertura");

  return (
    <div className="aire__cuerpo">
      {t && (
        <div className={`aire__veredicto nivel-${nivel}`}>
          <p className="aire__titular">
            {t.cuando === "medido" ? (
              <>
                Lo último medido en {vista.lugar}: <span className="aire__frase">{frasePorMedida(nivel)}</span>
              </>
            ) : (
              <>
                {t.cuando === "manana" ? "Mañana" : "Hoy"} en {vista.lugar}: <span className="aire__frase">{fraseVeredicto(nivel)}</span>
              </>
            )}
          </p>
          <p className="aire__base">
            {vista.base === "medido y previsión" && `Combina lo medido en la estación de ${estacion} y la previsión.`}
            {vista.base === "previsión" && "Es la previsión del modelo europeo (CAMS)."}
            {vista.base === "medido" && "No hay previsión disponible: solo cuenta la última medición de la estación."}
          </p>
        </div>
      )}

      {!t && (
        <div className="aire__veredicto nivel-sin_dato">
          <p className="aire__titular">No tenemos el aire de ahora en {vista.lugar}</p>
          <p className="aire__base">Lo último que hay es una medición antigua, que se enseña abajo con su fecha.</p>
        </div>
      )}

      {aviso.map((a) => (
        <p key={a.tipo} className="aire__aviso" role="note">
          <IconoAviso tam={16} />
          <span>{a.texto}</span>
        </p>
      ))}

      {vista.medidas.length > 0 && (
        <div className="aire__medidas">
          <p className="aire__medidas-titulo" id="mm-aire-medidas">
            {vista.medidaAntigua ? "Última medición" : "Medido"} en la estación de {estacion}
            {vista.textoMedida && <span className="dato"> · {vista.textoMedida}</span>}
          </p>
          <ul aria-labelledby="mm-aire-medidas" className={vista.medidaAntigua ? "aire__lista aire__lista--antigua" : "aire__lista"}>
            {vista.medidas.map((m) => (
              <li key={m.variable} className={`aire__medida nivel-${m.nivel}`}>
                <span className="aire__punto" aria-hidden="true" />
                <span className="aire__corto">{m.corto}</span>
                <span className="aire__valor dato">
                  {Math.round(m.valor)} <span className="aire__unidad">{m.unidad}</span>
                </span>
                <span className="aire__nivel">{etiquetaDeNivel(m.nivel)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conPrevision && (vista.mejor || vista.peor || vista.sinBuenaHora || vista.todoIgual) && (
        <ul className="aire__horas">
          {vista.sinBuenaHora ? (
            <li>
              <strong>{t.cuando === "manana" ? "Mañana" : "Hoy"} no hay una buena hora:</strong> nivel alto a todas horas.
            </li>
          ) : vista.todoIgual ? (
            <li>
              <strong>Sin diferencias entre horas:</strong> todo el día está {nivel === "bajo" ? "bien" : "igual"}.
            </li>
          ) : (
            vista.mejor && (
              <li>
                <strong>Mejor hora:</strong> <span className="dato">{etiquetaVentana(vista.mejor)}</span>
              </li>
            )
          )}
          {vista.peor && (
            <li>
              <strong>Evita:</strong> <span className="dato">{etiquetaVentana(vista.peor)}</span>
              {vista.peor.culpable && ` (por el ${palabraVariable(vista.peor.culpable)})`}
            </li>
          )}
        </ul>
      )}

      {vista.horas && <FranjaHoras horas={vista.horas} ahora={ahora} mejor={vista.sinBuenaHora ? null : vista.mejor} titulo="Las próximas 24 horas" />}

      {cobertura && (
        <p className="aire__aviso" role="note">
          <IconoAviso tam={16} />
          <span>{cobertura.texto}</span>
        </p>
      )}

      {t && conPrevision && consejo(nivel, "aire") && (
        <p className="aire__consejo">
          {consejo(nivel, "aire")} <span className="aire__pequeno">Orientativo, para la población general: no sustituye el consejo médico.</span>
        </p>
      )}

      <p className="aire__fuente">
        Aire medido: red de calidad del aire de la Comunidad de Madrid (CC BY 4.0).
        {vista.horas || (t && conPrevision) ? (
          <>
            {" "}
            Previsión: CAMS Europa vía{" "}
            <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
              Open-Meteo
            </a>{" "}
            (CC BY 4.0). Generated using Copernicus Atmosphere Monitoring Service information 2026.
          </>
        ) : null}
      </p>
    </div>
  );
}
