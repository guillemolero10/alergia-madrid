import {
  PLAZAS_MAX,
  PLAZAS_MIN,
  compararConOptimo,
  decimalCortoEs,
  detalleSimulacion,
  explicarCifra,
  fraseAprovechamiento,
  pctEs,
  porQueNadieGana,
  titularPrincipal,
  valorPrincipal,
} from "../lib/donde/tuDecides";
import { enteroEs, porcentajeEs } from "../lib/donde/panelDonde";
import { SERVICIOS } from "../lib/donde/servicios";
import type { EstadoServicio, ServicioId } from "../lib/donde/tipos";
import type { TuDecides as Estado } from "../lib/useTuDecides";
import "./TuDecides.css";

/** «Coloca {una residencia}» */
const NUEVO: Record<ServicioId, string> = {
  residencia: "una residencia",
  centro_salud: "un centro de salud",
  hospital: "un hospital",
  farmacia: "una farmacia",
  colegio: "un colegio",
  dea: "un desfibrilador",
};

/**
 * Distancia: «Es el 0,2 % de las 1.053.179 personas que aún pueden ganar acceso en la Comunidad.» Plazas: «Es el 0,6 % del margen de 10.048 plazas de la Comunidad.»
 * (con menos del 0,1 %, la frase cambia de forma para no decir «el menos del»).
 */
function parteDelDeficit(estado: EstadoServicio, valor: number, faltanAntes: number | undefined): string {
  if (estado.metrica === "plazas") {
    const total = faltanAntes ?? 0;
    if (!(total > 0)) return "";
    const pct = (100 * valor) / total;
    return pct < 0.1 ? `Menos del 0,1 % del margen de mejora de la Comunidad (${enteroEs(total)} plazas).` : `Es el ${porcentajeEs(pct)} del margen de mejora de la Comunidad (${enteroEs(total)} plazas).`;
  }
  const pct = estado.totalDeficit > 0 ? (100 * valor) / estado.totalDeficit : 0;
  const total = enteroEs(estado.totalDeficit);
  return pct < 0.1 ? `Menos del 0,1 % de las ${total} personas que aún pueden ganar acceso en la Comunidad.` : `Es el ${porcentajeEs(pct)} de las ${total} personas que aún pueden ganar acceso en la Comunidad.`;
}

const coordEs = (n: number) => n.toFixed(4).replace(".", ",");

export interface AccionesMapa {
  /** Centro de la parte libre del mapa, o null si el mapa aún no está. */
  centroDelMapa: () => { lat: number; lon: number } | null;
  volarA: (lat: number, lon: number) => void;
  /** En el móvil el mapa está debajo del panel: lleva la vista hasta él. */
  irAlMapa: () => void;
  /** El navegador no puede dibujar el mapa (sin WebGL): no hay dónde colocar un centro. */
  sinMapa?: boolean;
}

interface Props {
  estado: EstadoServicio;
  td: Estado;
  mapa: AccionesMapa;
}

/** «Tú decides»: coloca un centro, mira cuánta gente gana acceso y compáralo con el punto que propone el modelo. */
export function TuDecides({ estado, td, mapa }: Props) {
  const def = SERVICIOS[estado.servicio];
  const conPlazas = estado.metrica === "plazas";
  const hayPunto = td.punto !== null;

  const colocarEnElCentro = () => {
    const c = mapa.centroDelMapa();
    if (c) td.colocar(c.lat, c.lon);
  };

  return (
    <section className="bloque bloque--tudecides tudecides" aria-labelledby="td-titulo">
      <h2 id="td-titulo" className="tudecides__titulo">
        3. Tú decides
      </h2>
      <p className="tudecides__intro">
        Coloca {NUEVO[estado.servicio]} en el mapa y mira {conPlazas ? "cuántas plazas más cubre" : "cuánta gente gana acceso"}. Después compáralo con el punto que elige el modelo.
      </p>

      {mapa.sinMapa && (
        <p id="td-sin-mapa" className="tudecides__aviso" role="status">
          Este navegador no puede dibujar el mapa (necesita WebGL), así que aquí no se puede colocar un centro. Sí puedes pedirle al modelo dónde lo pondría.
        </p>
      )}

      <div className="tudecides__botones">
        <button
          type="button"
          className="boton boton--primario"
          aria-pressed={td.colocando}
          disabled={mapa.sinMapa}
          aria-describedby={mapa.sinMapa ? "td-sin-mapa" : undefined}
          onClick={() => {
            if (td.colocando) td.cancelarColocar();
            else {
              td.iniciarColocar();
              mapa.irAlMapa();
            }
          }}
        >
          {td.colocando ? "Haz clic en el mapa (cancelar)" : "Coloca un centro"}
        </button>
        <button type="button" className="boton" onClick={colocarEnElCentro} disabled={mapa.sinMapa} aria-describedby={mapa.sinMapa ? "td-sin-mapa" : undefined}>
          Colocar en el centro del mapa
        </button>
        {(hayPunto || td.modelo.fase !== "inactivo") && (
          <button type="button" className="boton boton--texto" onClick={td.borrar}>
            Borrar
          </button>
        )}
      </div>

      {conPlazas && (
        <div className="tudecides__plazas">
          <label htmlFor="td-plazas" className="campo__etiqueta">
            Plazas del centro nuevo: <output htmlFor="td-plazas" className="dato tudecides__plazas-valor">{td.plazas}</output>
          </label>
          <input
            id="td-plazas"
            type="range"
            min={PLAZAS_MIN}
            max={PLAZAS_MAX}
            step={1}
            value={td.plazas ?? def.plazasDefecto ?? PLAZAS_MIN}
            aria-valuetext={`${td.plazas} plazas`}
            onChange={(e) => td.ponerPlazas(Number(e.target.value))}
          />
          <div className="tudecides__plazas-marcas dato" aria-hidden="true">
            <span>{PLAZAS_MIN}</span>
            <span>mediana de los centros: {def.plazasDefecto}</span>
            <span>{PLAZAS_MAX}</span>
          </div>
        </div>
      )}

      {td.aviso && (
        <p className="tudecides__aviso" role="alert">
          {td.aviso}
        </p>
      )}

      <Resultado estado={estado} td={td} />
      <Modelo estado={estado} td={td} mapa={mapa} />
    </section>
  );
}

// ---------------------------------------------------------------- resultado en vivo
function Resultado({ estado, td }: { estado: EstadoServicio; td: Estado }) {
  const ev = td.evaluacion;
  return (
    <div className="tudecides__resultado" aria-live="polite" aria-atomic="true">
      {!td.punto ? (
        <p className="tudecides__vacio">Todavía no has colocado ningún centro. Pulsa «Coloca un centro» y haz clic en el mapa, o usa el teclado con «Colocar en el centro del mapa» y las flechas.</p>
      ) : ev === null ? (
        <p className="tudecides__vacio">Calculando…</p>
      ) : ev.tipo === "fuera" ? (
        <p className="tudecides__vacio">Este punto cae fuera de la Comunidad de Madrid. Arrastra el marcador hacia dentro.</p>
      ) : ev.tipo === "error" ? (
        <p className="tudecides__vacio">No se ha podido calcular este punto: {ev.mensaje}</p>
      ) : (
        <>
          <p className="tudecides__ubicacion">
            En <strong>{ev.municipio.nombre}</strong> <span className="dato">({coordEs(td.punto.lat)} / {coordEs(td.punto.lon)})</span>
            {ev.plazas !== null && <> · {ev.plazas} plazas</>}
          </p>
          <ResultadoCifra estado={estado} ev={ev} />
        </>
      )}
    </div>
  );
}

function ResultadoCifra({ estado, ev }: { estado: EstadoServicio; ev: Extract<NonNullable<Estado["evaluacion"]>, { tipo: "ok" }> }) {
  const plazas = estado.metrica === "plazas";
  const valor = valorPrincipal(estado, ev.sim);
  const t = titularPrincipal(estado, valor);
  // Con plazas, «nadie gana» es que N es menos de media plaza.
  const hay = plazas ? valor >= 0.5 : ev.sim.ganan > 0;
  return (
    <>
      <p className="tudecides__ganan">
        <strong className="tudecides__numero dato">{t.numero}</strong>
        <span className="tudecides__ganan-texto">{t.texto}</span>
      </p>
      {hay ? (
        <p className="tudecides__detalle">
          {plazas && ev.plazas !== null && <>{fraseAprovechamiento(valor, ev.plazas).replace(/^./, (c) => c.toUpperCase())}. </>}
          {parteDelDeficit(estado, valor, ev.sim.faltanAntes)} {detalleSimulacion(estado, ev.sim, ev.plazas)}
        </p>
      ) : (
        <p className="tudecides__detalle">{plazas ? "Aquí no se cubren más plazas." : "Nadie gana acceso aquí."} {porQueNadieGana(estado, ev.sim)}</p>
      )}
      <p className="nota">{explicarCifra(estado)} Distancias en línea recta.</p>
    </>
  );
}

// ---------------------------------------------------------------- el modelo
function Modelo({ estado, td, mapa }: { estado: EstadoServicio; td: Estado; mapa: AccionesMapa }) {
  const m = td.modelo;
  const ev = td.evaluacion;
  const gananUsuario = ev?.tipo === "ok" ? valorPrincipal(estado, ev.sim) : null;

  if (m.fase === "inactivo") {
    return (
      <div className="tudecides__modelo">
        <button type="button" className="boton boton--modelo" onClick={td.pedirModelo}>
          ¿Y dónde lo pondría el modelo?
        </button>
        <p className="nota">
          {estado.metrica === "plazas"
            ? "El modelo busca el punto donde más plazas de un centro llegan a zonas con margen de mejora (algoritmo voraz de máxima cobertura) y te dice qué parte de eso logra el tuyo."
            : "El modelo busca el punto que más gente pone cerca del servicio (algoritmo voraz de máxima cobertura) y te dice qué parte de eso logra el tuyo."}
        </p>
      </div>
    );
  }

  return (
    <div className="tudecides__modelo" aria-live="polite" aria-busy={m.fase === "calculando"}>
      <h3 className="tudecides__subtitulo">El modelo</h3>
      {m.fase === "calculando" && !m.punto && (
        <p className="tudecides__vacio">
          <span className="giro" aria-hidden="true" /> Calculando el mejor punto de {m.ambito}…
        </p>
      )}
      {m.fase === "error" && (
        <>
          <p className="tudecides__aviso" role="alert">
            No se ha podido calcular el modelo{m.mensaje ? `: ${m.mensaje}` : ""}.
          </p>
          <button type="button" className="boton" onClick={td.pedirModelo}>
            Reintentar
          </button>
        </>
      )}
      {m.fase === "listo" && !m.punto && <p className="tudecides__vacio">{m.mensaje}</p>}
      {m.punto && (
        <>
          <p className="tudecides__ubicacion">
            {m.origen === "agente" ? "El agente lo pone en" : "Lo pondría en"} <strong>{m.nombreMunicipio ?? "un municipio sin nombre"}</strong>{" "}
            <span>{m.origen === "agente" ? `(${m.etiqueta ?? "punto propuesto"}, calculado por el agente)` : `(mejor punto de ${m.ambito})`}</span>
            {m.fase === "calculando" && <span className="giro giro--chico" aria-label="Recalculando" role="img" />}
          </p>
          <p className="tudecides__ganan tudecides__ganan--modelo">
            <strong className="tudecides__numero dato">{titularPrincipal(estado, valorPrincipal(estado, m.punto)).numero}</strong>
            <span className="tudecides__ganan-texto">{titularPrincipal(estado, valorPrincipal(estado, m.punto)).texto}</span>
          </p>
          {estado.metrica === "plazas" && td.plazas !== null && (
            <p className="tudecides__detalle">
              Aprovecha <strong className="dato">{decimalCortoEs(valorPrincipal(estado, m.punto))}</strong> de sus {enteroEs(td.plazas)} plazas
              {m.nombreMunicipio ? ` en ${m.nombreMunicipio}` : ""}.
            </p>
          )}
          {m.otros && m.otros.length > 0 && (
            <p className="nota">
              También propone: {m.otros.map((o) => `${o.etiqueta} (${estado.metrica === "plazas" ? decimalCortoEs(o.reduce ?? 0) : `+${enteroEs(o.ganan)}`})`).join(", ")}. Aquí se detalla el primero; los demás están en el mapa.
            </p>
          )}
          {gananUsuario !== null ? <Comparativa estado={estado} tuyo={gananUsuario} modelo={valorPrincipal(estado, m.punto)} /> : <p className="nota">Coloca tu centro para compararlo con este punto.</p>}
          <div className="tudecides__botones">
            <button type="button" className="boton" onClick={() => m.punto && mapa.volarA(m.punto.lat, m.punto.lon)}>
              Ver en el mapa
            </button>
            <button type="button" className="boton boton--texto" onClick={td.quitarModelo}>
              Quitar el modelo
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Comparativa({ estado, tuyo, modelo }: { estado: EstadoServicio; tuyo: number; modelo: number }) {
  const c = compararConOptimo(tuyo, modelo);
  const maximo = Math.max(tuyo, modelo, 1);
  const plazas = estado.metrica === "plazas";
  const fmt = plazas ? decimalCortoEs : enteroEs;
  const unidad = plazas ? "plazas más cubiertas" : SERVICIOS[estado.servicio].grupoEtiqueta;
  return (
    <div className="comparativa">
      <p className="comparativa__frase">
        {c.pct === null ? (
          plazas ? "El modelo no encuentra ningún punto que cubra más plazas." : "El modelo no encuentra ningún punto que gane acceso."
        ) : c.supera ? (
          <>
            Tu ubicación <strong>supera al modelo</strong> ({pctEs(c.pct)}): el modelo solo prueba el punto interior de cada sección censal y tú has encontrado un sitio mejor.
          </>
        ) : (
          <>
            Tu ubicación logra el <strong className="dato">{pctEs(c.pct)}</strong> del óptimo.
          </>
        )}
      </p>
      <div className="comparativa__barras" role="img" aria-label={`Tu centro: ${fmt(tuyo)} ${unidad}. Modelo: ${fmt(modelo)}.`}>
        <div className="comparativa__fila">
          <span className="comparativa__nombre">Tú</span>
          <span className="comparativa__barra"><span className="comparativa__relleno comparativa__relleno--tuyo" style={{ width: `${(100 * tuyo) / maximo}%` }} /></span>
          <span className="comparativa__valor dato">{fmt(tuyo)}</span>
        </div>
        <div className="comparativa__fila">
          <span className="comparativa__nombre">Modelo</span>
          <span className="comparativa__barra"><span className="comparativa__relleno comparativa__relleno--modelo" style={{ width: `${(100 * modelo) / maximo}%` }} /></span>
          <span className="comparativa__valor dato">{fmt(modelo)}</span>
        </div>
      </div>
    </div>
  );
}
