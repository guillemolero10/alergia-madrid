import { useEffect, useRef } from "react";
import "./PanelLugar.css";
import type { FichaLugar } from "../lib/ficha";
import { formatearKm, formatearNumero, formatearUltimoDato, horaCorta } from "../lib/formato";
import { etiquetaDeNivel, nombreVariable, textoRegla } from "../lib/riesgo";
import type { Nivel, Observacion } from "../lib/tipos";
import { IconoAviso, IconoCerrar, IconoPolen } from "./Iconos";
import { Minigrafica } from "./Minigrafica";

interface PropsPanel {
  ficha: FichaLugar;
  ahora: Date;
  onCerrar: () => void;
  /** Abre otro lugar relacionado (la estación más cercana o el captador). */
  onIrA: (id: string) => void;
}

const FRASE: Record<Nivel, string> = {
  bajo: "Riesgo respiratorio bajo",
  medio: "Riesgo respiratorio medio",
  alto: "Riesgo respiratorio alto",
  sin_dato: "Sin datos suficientes",
};

/** Detalle de un lugar. En escritorio es un panel a la derecha; en el móvil, una hoja inferior. */
export function PanelLugar({ ficha, ahora, onCerrar, onIrA }: PropsPanel) {
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const cuerpoRef = useRef<HTMLDivElement>(null);

  // Al abrir (o cambiar de lugar) el foco va al título, para que el teclado y el lector sigan aquí.
  useEffect(() => {
    tituloRef.current?.focus({ preventScroll: true });
    cuerpoRef.current?.scrollTo({ top: 0 });
  }, [ficha.id]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) onCerrar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [onCerrar]);

  const esCaptador = ficha.tipo === "captador";

  return (
    <aside className="panel tarjeta" aria-labelledby="panel-titulo" data-lugar={ficha.id}>
      <span className="panel__asa" aria-hidden="true" />
      <header className="panel__cabecera">
        <div>
          <p className="panel__antetitulo">{ficha.subtitulo}</p>
          <h2 id="panel-titulo" ref={tituloRef} tabIndex={-1} className="panel__titulo">
            {ficha.nombre}
          </h2>
        </div>
        <button type="button" className="boton boton--icono" onClick={onCerrar} aria-label={`Cerrar el detalle de ${ficha.nombre}`}>
          <IconoCerrar />
        </button>
      </header>

      <div className="panel__cuerpo" ref={cuerpoRef}>
        <section className={`semaforo nivel-${ficha.nivel}`} aria-label="Nivel de riesgo">
          <div className="semaforo__luces" aria-hidden="true">
            {(["bajo", "medio", "alto"] as const).map((n) => (
              <span key={n} className={`semaforo__luz nivel-${n}${ficha.nivel === n ? " semaforo__luz--encendida" : ""}`} />
            ))}
          </div>
          <div>
            <p className="semaforo__nivel">{etiquetaDeNivel(ficha.nivel)}</p>
            <p className="semaforo__frase">{esCaptador ? fraseCaptador(ficha.nivel) : FRASE[ficha.nivel]}</p>
          </div>
          {!esCaptador && (
            <dl className="semaforo__partes">
              <div>
                <dt>Aire</dt>
                <dd>
                  <span className={`chip-nivel nivel-${ficha.nivelAire}`}>{etiquetaDeNivel(ficha.nivelAire)}</span>
                </dd>
              </div>
              <div>
                <dt>Polen</dt>
                <dd>
                  <span className={`chip-nivel nivel-${ficha.nivelPolen}`}>{etiquetaDeNivel(ficha.nivelPolen)}</span>
                </dd>
              </div>
            </dl>
          )}
        </section>

        {ficha.avisos
          .filter((a) => a.clave === "cobertura_lejana")
          .map((a) => (
            <p key={a.clave} className="aviso" role="note">
              <IconoAviso tam={16} />
              <span>{a.texto}</span>
            </p>
          ))}

        {!esCaptador && (
          <section className="panel__seccion" aria-labelledby="panel-aire">
            <div className="panel__encabezado">
              <h3 id="panel-aire">Calidad del aire</h3>
              {ficha.estacion && ficha.tipo === "municipio" && (
                <button type="button" className="enlace" onClick={() => onIrA(ficha.estacion!.id)}>
                  Estación de {ficha.estacion.nombre}, a {formatearKm(ficha.estacion.distKm)}
                </button>
              )}
            </div>
            {ficha.variablesAire.length === 0 ? (
              <p className="panel__vacio">Esta estación no tiene mediciones válidas ahora mismo.</p>
            ) : (
              <ul className="variables">
                {ficha.variablesAire.map((o) => (
                  <VariableAire key={o.variable} obs={o} />
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="panel__seccion" aria-labelledby="panel-polen">
          <div className="panel__encabezado">
            <h3 id="panel-polen">Polen</h3>
          </div>
          {ficha.captador ? (
            <p className="captador">
              <IconoPolen tam={16} />
              <span>
                {esCaptador ? (
                  "Mediciones de este captador"
                ) : (
                  <>
                    Captador de{" "}
                    <button type="button" className="enlace" onClick={() => onIrA(ficha.captador!.id)}>
                      {ficha.captador.nombre}
                    </button>
                    {ficha.captador.distKm != null && (
                      <>
                        , a <strong className="dato">{formatearKm(ficha.captador.distKm)}</strong>
                      </>
                    )}
                  </>
                )}
                {ficha.captador.ultimoDato && (
                  <>
                    {" "}
                    · último dato: <time dateTime={ficha.captador.ultimoDato}>{formatearUltimoDato(ficha.captador.ultimoDato, ahora)}</time>
                  </>
                )}
              </span>
            </p>
          ) : (
            <p className="panel__vacio">No hay captador de polen asignado a este lugar.</p>
          )}

          {ficha.avisos
            .filter((a) => a.clave !== "cobertura_lejana")
            .map((a) => (
              <p key={a.clave} className="aviso aviso--suave" role="note">
                <IconoAviso tam={15} />
                <span>{a.texto}</span>
              </p>
            ))}

          {ficha.polen.length > 0 && (
            <ul className="polenes">
              {ficha.polen.map((o) => (
                <li key={o.variable} className={`polenes__fila nivel-${o.nivel}`}>
                  <span className="polenes__nombre">{nombreVariable(o.variable).corto}</span>
                  <span className="polenes__valor dato">
                    {formatearNumero(o.valor)} <small>{o.unidad}</small>
                  </span>
                  <span className={`chip-nivel nivel-${o.nivel}`}>{etiquetaDeNivel(o.nivel)}</span>
                </li>
              ))}
            </ul>
          )}
          {ficha.polenACero > 0 && (
            <p className="panel__nota">
              {ficha.polen.length > 0
                ? `Otros ${ficha.polenACero} tipos de polen medidos están a 0.`
                : `Los ${ficha.polenACero} tipos de polen medidos están a 0 granos/m³.`}
            </p>
          )}
        </section>

        <footer className="panel__pie">
          {ficha.hayProvisionales && <p>Los datos de aire del día son provisionales: la Comunidad los valida después.</p>}
          <p>
            Fuente: Comunidad de Madrid, portal de datos abiertos (CC BY 4.0). Esta información es orientativa y no
            sustituye al consejo médico.
          </p>
        </footer>
      </div>
    </aside>
  );
}

function fraseCaptador(nivel: Nivel): string {
  return nivel === "sin_dato" ? "Sin datos recientes de polen" : `Polen en nivel ${etiquetaDeNivel(nivel).toLowerCase()}`;
}

function VariableAire({ obs }: { obs: Observacion }) {
  const nombre = nombreVariable(obs.variable);
  const regla = textoRegla(obs.regla);
  const comparaOtraCosa = obs.regla && obs.regla !== "1h" && obs.valor_regla != null;
  return (
    <li className={`variable nivel-${obs.nivel}`}>
      <div className="variable__cabecera">
        <p className="variable__nombre">
          <strong>{nombre.corto}</strong>
          <span>{nombre.largo}</span>
        </p>
        <span className={`chip-nivel nivel-${obs.nivel}`}>{etiquetaDeNivel(obs.nivel)}</span>
      </div>
      <p className="variable__valor">
        <span className="variable__cifra dato">{formatearNumero(obs.valor)}</span>
        <span className="variable__unidad">{obs.unidad}</span>
        <span className="variable__hora">
          a las <time dateTime={obs.hora}>{horaCorta(obs.hora)}</time>
          {obs.provisional ? " · provisional" : ""}
        </span>
      </p>
      {comparaOtraCosa && regla && (
        <p className="variable__regla">
          El nivel sale de la {regla}: <span className="dato">{formatearNumero(obs.valor_regla!)}</span> {obs.unidad}
        </p>
      )}
      {obs.regla && obs.regla !== "1h" && obs.valor_regla == null && obs.nivel === "sin_dato" && regla && (
        <p className="variable__regla">Aún no hay horas suficientes para la {regla}.</p>
      )}
      {obs.serie && <Minigrafica serie={obs.serie} horaFinal={obs.hora} unidad={obs.unidad} nombre={nombre.corto} />}
    </li>
  );
}
