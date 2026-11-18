import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./Colegios.css";
import {
  avisosCobertura,
  buscarCentros,
  causaTexto,
  conArticulo,
  fraseEducacionFisica,
  fraseRecreo,
  HORARIO_ORIENTATIVO,
  nombreCentro,
  rangoTexto,
  type Centro,
  type CentroIndexado,
  type EvaluacionCentro,
  type ResumenColegios,
} from "../lib/colegios";
import { fechaSinAnio } from "../lib/dias";
import type { EvaluacionLugar } from "../lib/evaluar";
import { formatearKm } from "../lib/formato";
import { etiquetaDeNivel } from "../lib/riesgo";
import type { Lugares } from "../lib/tipos";
import { FranjaHoras } from "./FranjaHoras";
import { IconoAviso } from "./Iconos";

const entero = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
const formatearEntero = (n: number) => entero.format(n);

const TITULARIDAD: Record<string, string> = { pu: "público", co: "concertado", pr: "privado" };
const ETAPAS: Record<string, string> = { I: "infantil", P: "primaria", S: "secundaria", E: "educación especial" };

function etapasTexto(e: string): string {
  const lista = [...e].map((x) => ETAPAS[x] ?? x);
  return lista.length <= 1 ? (lista[0] ?? "") : `${lista.slice(0, -1).join(", ")} y ${lista[lista.length - 1]}`;
}

function cuandoTexto(e: Pick<EvaluacionCentro, "dia" | "fecha">): string {
  return e.dia === "historico" ? fechaSinAnio(e.fecha) : e.dia === "manana" ? "Mañana" : "Hoy";
}

/** «Hoy: 1.312 centros bien, 400 con precaución, 198 mejor dentro». */
export function textoResumen(r: ResumenColegios): string {
  const partes = [`${formatearEntero(r.recuento.bajo)} ${r.recuento.bajo === 1 ? "centro bien" : "centros bien"}`, `${formatearEntero(r.recuento.medio)} con precaución`, `${formatearEntero(r.recuento.alto)} mejor dentro`];
  if (r.recuento.sin_dato > 0) partes.push(`${formatearEntero(r.recuento.sin_dato)} sin datos`);
  const cuando = r.dia === "historico" && r.fecha ? fechaSinAnio(r.fecha) : r.dia === "manana" ? "Mañana" : "Hoy";
  return `${cuando}: ${partes.join(", ")}`;
}

/** Resumen sobre el mapa: cuántos patios están bien, con precaución o mejor dentro. */
export function ResumenMapa({ resumen }: { resumen: ResumenColegios | null }) {
  if (!resumen) {
    return (
      <div className="resumen-colegios tarjeta" role="status">
        <p className="resumen-colegios__texto">Calculando el recreo de 1.910 centros…</p>
      </div>
    );
  }
  const total = Math.max(1, resumen.total);
  return (
    <div className="resumen-colegios tarjeta" role="status">
      <p className="resumen-colegios__titulo">Patios a la hora del recreo</p>
      <p className="resumen-colegios__texto">{textoResumen(resumen)}</p>
      <div className="resumen-colegios__barra" aria-hidden="true">
        {(["bajo", "medio", "alto", "sin_dato"] as const).map((n) => (
          <span key={n} className={`nivel-${n}`} style={{ flexGrow: resumen.recuento[n] / total }} />
        ))}
      </div>
    </div>
  );
}

interface PropsBuscador {
  indice: readonly CentroIndexado[];
  centro: Centro | null;
  municipioDe: (c: Centro) => string;
  onElegir: (codigo: string) => void;
}

function BuscadorCentros({ indice, centro, municipioDe, onElegir }: PropsBuscador) {
  const id = useId();
  const [texto, setTexto] = useState(centro ? nombreCentro(centro) : "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  // Si el centro cambia desde fuera (clic en el mapa o botón «atrás»), el campo lo refleja.
  useEffect(() => {
    setTexto(centro ? nombreCentro(centro) : "");
  }, [centro]);

  const busqueda = useMemo(() => buscarCentros(indice, texto), [indice, texto]);
  // Con el nombre del centro ya elegido no se vuelve a abrir la lista de resultados.
  const mostrar = abierto && texto.trim().length >= 2 && texto !== (centro ? nombreCentro(centro) : "");

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierto]);

  function elegir(c: Centro) {
    onElegir(c.c);
    setTexto(nombreCentro(c));
    setAbierto(false);
  }

  const resultados = busqueda.centros;
  return (
    <div className="perfil__grupo" ref={caja}>
      <label className="perfil__rotulo" htmlFor={id}>
        ¿Qué colegio o instituto?
      </label>
      <div className="combo">
        <input
          id={id}
          className="combo__campo"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={mostrar}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={mostrar && resultados[activo] ? `${id}-${resultados[activo]!.c}` : undefined}
          placeholder="Nombre del centro o municipio"
          value={texto}
          onFocus={(e) => {
            setAbierto(true);
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAbierto(true);
              setActivo((a) => Math.min(a + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && mostrar && resultados[activo]) {
              e.preventDefault();
              elegir(resultados[activo]!);
            } else if (e.key === "Escape" && abierto) {
              e.preventDefault();
              setAbierto(false);
            }
          }}
        />
        {mostrar && (
          <ul className="combo__lista" role="listbox" id={`${id}-lista`} aria-label="Centros educativos">
            {resultados.length === 0 && <li className="combo__vacio">Ningún centro coincide. Prueba con otra parte del nombre o con el municipio.</li>}
            {resultados.map((c, i) => (
              <li
                key={c.c}
                id={`${id}-${c.c}`}
                role="option"
                aria-selected={c.c === centro?.c}
                className={`combo__opcion combo__opcion--doble${i === activo ? " combo__opcion--activa" : ""}${c.c === centro?.c ? " combo__opcion--actual" : ""}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  elegir(c);
                }}
                onPointerEnter={() => setActivo(i)}
              >
                <span>{nombreCentro(c)}</span>
                <span className="combo__sub">{municipioDe(c)}</span>
              </li>
            ))}
            {busqueda.total > resultados.length && (
              <li className="combo__vacio" role="presentation">
                Mostrando {resultados.length} de {formatearEntero(busqueda.total)}: escribe más para afinar.
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

interface Props {
  centros: readonly Centro[] | null;
  errorCentros: string | null;
  indice: readonly CentroIndexado[] | null;
  centro: Centro | null;
  /** Estado de los datos de pronóstico y mediciones. */
  estadoDatos: "cargando" | "lista" | "error";
  ev: EvaluacionLugar | null;
  evaluacion: EvaluacionCentro | null;
  resumen: ResumenColegios | null;
  lugares: Lugares;
  ahora: Date;
  historico: boolean;
  tarde: boolean;
  onTarde: (v: boolean) => void;
  onElegir: (codigo: string) => void;
  onReintentar: () => void;
}

export function Colegios(p: Props) {
  const nombresMunicipio = useMemo(() => new Map(p.lugares.municipios.map((m) => [m.id, m.nombre])), [p.lugares.municipios]);
  const municipioDe = (c: Centro) => nombresMunicipio.get(c.m) ?? "";
  const e = p.evaluacion;
  const nivel = e?.nivelRecreo ?? "sin_dato";

  return (
    <section className="colegios" aria-labelledby={p.centro ? "titular" : "colegios-intro"}>
      {p.indice ? (
        <BuscadorCentros indice={p.indice} centro={p.centro} municipioDe={municipioDe} onElegir={p.onElegir} />
      ) : p.errorCentros ? (
        <div className="aviso" role="alert">
          <IconoAviso tam={16} />
          <span>No se ha podido cargar la lista de centros ({p.errorCentros}).</span>
          <button type="button" className="boton" onClick={p.onReintentar}>
            Reintentar
          </button>
        </div>
      ) : (
        <p className="colegios__carga" role="status">
          Cargando 1.910 centros…
        </p>
      )}

      {!p.centro && (
        <div className="colegios__inicio">
          <h2 id="colegios-intro" className="titular titular--medio">
            ¿Pueden salir al patio?
          </h2>
          <p className="respuesta__texto">
            Busca un colegio o instituto y te decimos si el recreo y la educación física pueden ser al aire libre, con el
            calidad del aire de su zona (dióxido de nitrógeno, ozono y partículas), medida y prevista hora a hora.
          </p>
          {p.resumen && <p className="colegios__resumen-columna">{textoResumen(p.resumen)}.</p>}
          <p className="respuesta__pequeno">También puedes pulsar un punto del mapa: cada punto es un centro y su color, el nivel durante el recreo.</p>
        </div>
      )}

      {p.centro && p.estadoDatos === "cargando" && (
        <h2 id="titular" className="titular titular--carga">
          Mirando el cielo sobre {conArticulo(p.centro)}…
        </h2>
      )}
      {p.centro && p.estadoDatos === "error" && (
        <div className="respuesta__veredicto">
          <h2 id="titular" className="titular">
            No hemos podido preparar la previsión
          </h2>
          <button type="button" className="boton" onClick={p.onReintentar}>
            Reintentar
          </button>
        </div>
      )}

      {p.centro && p.estadoDatos === "lista" && (
        <article className="centro">
          <div className={`respuesta__veredicto nivel-${nivel}`} aria-live="polite">
            {e ? (
              <h2 id="titular" className="titular titular--centro">
                {cuandoTexto(e)} en {conArticulo(p.centro)}: <span className="titular__veredicto">{fraseRecreo(nivel)}</span>
              </h2>
            ) : (
              <h2 id="titular" className="titular">
                No tenemos datos suficientes para {conArticulo(p.centro)}
              </h2>
            )}
            <p className="centro__ficha">
              {nombresMunicipio.get(p.centro.m)} · centro {TITULARIDAD[p.centro.p] ?? ""} · {etapasTexto(p.centro.e)}
            </p>
          </div>

          {e && (
            <>
              {e.finDeSemana && (
                <p className="aviso" role="note">
                  <IconoAviso tam={16} />
                  <span>{fechaSinAnio(e.fecha)} cae en fin de semana: no hay clase. Te lo calculamos con el horario de un día lectivo.</span>
                </p>
              )}

              <dl className="horas">
                <div className="horas__bloque">
                  <dt>Recreo (horario orientativo)</dt>
                  <dd>
                    {e.recreos.map((r) => (
                      <span key={r.recreo.etiqueta} className="centro__recreo">
                        <span className="horas__valor dato">{rangoTexto(r.recreo)}</span>
                        <span className="horas__nota">
                          {e.recreos.length > 1 ? `${r.recreo.etiqueta}: ` : ""}
                          nivel {etiquetaDeNivel(r.nivel).toLowerCase()}
                        </span>
                      </span>
                    ))}
                  </dd>
                </div>
                <div className={`horas__bloque nivel-${e.mejorFranja?.nivel ?? "sin_dato"}`}>
                  <dt>Mejor franja de clase</dt>
                  <dd>
                    {e.mejorFranja && e.mejorFranja.nivel !== "alto" ? (
                      <>
                        <span className="horas__valor dato">
                          {e.mejorFranja.horaDesde}:00–{e.mejorFranja.horaHasta}:00
                        </span>
                        <span className="horas__nota">nivel {etiquetaDeNivel(e.mejorFranja.nivel).toLowerCase()}</span>
                      </>
                    ) : e.mejorFranja ? (
                      <>
                        <span className="horas__valor horas__valor--frase">Ninguna buena</span>
                        <span className="horas__nota">nivel alto toda la jornada</span>
                      </>
                    ) : (
                      <span className="horas__valor horas__valor--frase">Sin datos</span>
                    )}
                  </dd>
                </div>
              </dl>

              <p className="centro__ef">
                <strong>Educación física.</strong> {fraseEducacionFisica(e)}
              </p>
              {e.causa && <p className="centro__causa">{causaTexto(e.causa)}</p>}
            </>
          )}

          {p.ev && <FranjaHoras horas={p.ev.resultado.horas} ahora={p.ahora} mejor={null} historico={p.historico} />}

          <div className="centro__supuesto">
            <p>
              <strong>Horario orientativo.</strong> No conocemos el horario real del centro: suponemos clase de{" "}
              {HORARIO_ORIENTATIVO.lectivo.desde}:00 a {HORARIO_ORIENTATIVO.lectivo.hasta}:00 y recreo de{" "}
              {rangoTexto(HORARIO_ORIENTATIVO.recreo.infantilPrimaria)} (infantil y primaria) o{" "}
              {rangoTexto(HORARIO_ORIENTATIVO.recreo.secundaria)} (secundaria).
            </p>
            <label className="centro__tarde">
              <input type="checkbox" checked={p.tarde} onChange={(ev) => p.onTarde(ev.target.checked)} />
              <span>
                Hay clase por la tarde ({HORARIO_ORIENTATIVO.tarde.desde}:00–{HORARIO_ORIENTATIVO.tarde.hasta}:00)
              </span>
            </label>
          </div>

          <Fuentes centro={p.centro} lugares={p.lugares} />

          {e && e.sinPrevision.length > 0 && (
            <p className="aviso" role="note">
              <IconoAviso tam={16} />
              <span>Sin previsión de algunos pólenes (cupresáceas, plátano): solo cuentan si se han medido hoy.</span>
            </p>
          )}
        </article>
      )}
    </section>
  );
}

function Fuentes({ centro, lugares }: { centro: Centro; lugares: Lugares }) {
  const estacion = lugares.estaciones.find((x) => x.id === centro.ea)?.nombre ?? centro.ea;
  const avisos = avisosCobertura(centro, estacion);
  return (
    <div className="centro__datos">
      <h3 className="centro__subtitulo">De dónde sale el dato</h3>
      <ul>
        <li>
          <strong>Aire:</strong> estación de {estacion}, a {formatearKm(centro.de)}.
        </li>
      </ul>
      {avisos.map((a) => (
        <p key={a.clave} className="aviso" role="note">
          <IconoAviso tam={16} />
          <span>{a.texto}</span>
        </p>
      ))}
    </div>
  );
}
