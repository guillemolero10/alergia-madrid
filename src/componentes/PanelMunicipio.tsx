import { useEffect, useMemo, useRef, type ComponentType, type RefObject } from "react";
import "./PanelMunicipio.css";
import { fichaLugar } from "../lib/donde/agregados";
import { cabeceraLugar, construirVista, ETIQUETA_SEMAFORO, type FilaVista, type LoQueFalta } from "../lib/donde/fichaVista";
import { existeLugar } from "../lib/donde/lugarUrl";
import { CENTROS_DE_DIA, HOGARES_Y_CLUBES, otrosSocialesDe } from "../lib/donde/otrosSociales";
import { enteroEs } from "../lib/donde/panelDonde";
import { SERVICIO_IDS, SERVICIOS } from "../lib/donde/servicios";
import type { ServicioId, Territorios } from "../lib/donde/tipos";
import type { BaseDonde, Carga } from "../lib/useDonde";
import type { DatosFicha } from "../lib/useFicha";
import { AireHoy } from "./AireHoy";
import { BuscadorLugar } from "./BuscadorLugar";
import { IconoCentroSalud, IconoColegio, IconoDea, IconoEnlace, IconoFarmacia, IconoHospital, IconoResidencia } from "./Iconos";

type Icono = ComponentType<{ tam?: number; className?: string }>;

const ICONOS: Record<ServicioId, Icono> = {
  centro_salud: IconoCentroSalud,
  hospital: IconoHospital,
  residencia: IconoResidencia,
  farmacia: IconoFarmacia,
  colegio: IconoColegio,
  dea: IconoDea,
};

/** Tres lugares para empezar sin escribir: una ciudad grande, un pueblo de la sierra y un distrito de la capital. */
const EJEMPLOS = [
  { id: "mun:28106", nombre: "Parla" },
  { id: "mun:28001", nombre: "La Acebeda" },
  { id: "dis:2807901", nombre: "Centro (Madrid)" },
];

interface Props {
  base: Carga<BaseDonde>;
  onReintentarBase: () => void;
  alias: Record<string, string[]>;
  /** Municipio o distrito de la ficha (`?lugar=`), o null. */
  lugarId: string | null;
  datos: DatosFicha;
  onElegirLugar: (id: string) => void;
  onVerSimulador: (servicio: ServicioId, lugar: string) => void;
  /** Servicio cuyos centros enseña el mapa. */
  servicioMapa: ServicioId;
  onServicioMapa: (id: ServicioId) => void;
  onIrAlMapa: () => void;
}

/** «Mi municipio»: buscador y ficha del municipio o distrito (los centros se ven en el mapa de la derecha). */
export function PanelMunicipio({ base, onReintentarBase, alias, lugarId, datos, onElegirLugar: alElegirLugar, onVerSimulador, servicioMapa, onServicioMapa, onIrAlMapa }: Props) {
  // El foco pasa al título de la nueva ficha solo cuando el usuario ha elegido el lugar (no al abrir con un enlace ni con el lugar recordado).
  const enfocar = useRef(false);
  const onElegirLugar = (id: string) => {
    enfocar.current = id !== lugarId;
    alElegirLugar(id);
  };
  if (base.fase === "cargando") {
    return (
      <div className="municipio" aria-busy="true">
        <p className="solo-lectores" role="status">
          Cargando los datos de la Comunidad…
        </p>
        <div className="esq esq--buscador" />
        <div className="esq esq--ficha" />
      </div>
    );
  }
  if (base.fase === "error") {
    return (
      <div className="municipio">
        <div className="error-panel" role="alert">
          <h2>No se han podido cargar los datos</h2>
          <p>Comprueba la conexión y vuelve a intentarlo.</p>
          <p className="error-panel__detalle">{base.mensaje}</p>
          <button type="button" className="boton" onClick={onReintentarBase}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  const t = base.valor.territorios;
  const anio = base.valor.secciones.anio_poblacion;
  const existe = lugarId !== null && existeLugar(t, lugarId);

  return (
    <div className="municipio">
      <BuscadorLugar territorios={t} alias={alias} onElegir={onElegirLugar} />
      {lugarId === null ? (
        <SinLugar onElegir={onElegirLugar} />
      ) : !existe ? (
        <div className="municipio__vacio" role="status">
          <h2 className="municipio__titulo-chico">No conozco ese lugar</h2>
          <p>El enlace apunta a un lugar que no está en los datos. Búscalo por su nombre o prueba con uno de estos.</p>
          <Ejemplos onElegir={onElegirLugar} />
        </div>
      ) : (
        <Ficha
          key={lugarId}
          t={t}
          anio={anio}
          lugarId={lugarId}
          datos={datos}
          enfocar={enfocar}
          onVerSimulador={onVerSimulador}
          servicioMapa={servicioMapa}
          onServicioMapa={onServicioMapa}
          onIrAlMapa={onIrAlMapa}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- sin lugar
function Ejemplos({ onElegir }: { onElegir: (id: string) => void }) {
  return (
    <ul className="ejemplos" aria-label="Lugares de ejemplo">
      {EJEMPLOS.map((e) => (
        <li key={e.id}>
          <button type="button" className="boton ejemplos__boton" onClick={() => onElegir(e.id)}>
            {e.nombre}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SinLugar({ onElegir }: { onElegir: (id: string) => void }) {
  return (
    <section className="municipio__vacio" aria-labelledby="mm-vacio">
      <h2 id="mm-vacio" className="municipio__titulo-chico">
        ¿Qué tiene tu municipio y qué le falta?
      </h2>
      <p>
        Busca tu pueblo, tu ciudad o un distrito de Madrid y verás cuántos centros de salud, hospitales, farmacias, colegios, desfibriladores y plazas para mayores hay, y si
        está por encima o por debajo de lo que tienen municipios parecidos.
      </p>
      <p className="nota">O empieza por uno de estos:</p>
      <Ejemplos onElegir={onElegir} />
    </section>
  );
}

// ---------------------------------------------------------------- la ficha
interface PropsFicha {
  t: Territorios;
  anio: number;
  lugarId: string;
  datos: DatosFicha;
  enfocar: RefObject<boolean>;
  onVerSimulador: (servicio: ServicioId, lugar: string) => void;
  servicioMapa: ServicioId;
  onServicioMapa: (id: ServicioId) => void;
  onIrAlMapa: () => void;
}

function Ficha({ t, anio, lugarId, datos, enfocar, onVerSimulador, servicioMapa, onServicioMapa, onIrAlMapa }: PropsFicha) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const cab = cabeceraLugar(t, lugarId);

  // Al elegir otro lugar, el lector de pantalla se queda en el título de la nueva ficha (no en el buscador, que sigue arriba).
  useEffect(() => {
    if (!enfocar.current) return;
    enfocar.current = false;
    titulo.current?.focus({ preventScroll: true });
  }, [enfocar]);

  const vista = useMemo(() => {
    const f = fichaLugar(lugarId, datos.estados, t);
    return construirVista(f, datos.estados, t, lugarId);
  }, [lugarId, datos.estados, t]);

  // El punto del lugar para elegir la estación de aire más cercana (el municipio o el distrito).
  const lugarAire = useMemo(() => {
    const x = t.municipios.find((m) => m.id === lugarId) ?? t.distritos.find((d) => d.id === lugarId);
    return x ? { id: lugarId, nombre: x.nombre, lat: x.lat, lon: x.lon } : null;
  }, [t, lugarId]);

  const sectores = useMemo(() => (datos.otros.fase === "listo" ? otrosSocialesDe(datos.otros.valor, t, lugarId) : null), [datos.otros, t, lugarId]);

  if (!cab || !vista) return null;
  const pendientes = SERVICIO_IDS.filter((id) => !datos.estados[id]);

  return (
    <article className="ficha" aria-labelledby="mm-titulo">
      <header className="ficha__cabecera">
        <p className="ficha__tipo">{cab.descripcion}</p>
        <h2 id="mm-titulo" className="ficha__nombre" tabIndex={-1} ref={titulo}>
          {cab.nombre}
        </h2>
        <p className="ficha__poblacion dato">
          {enteroEs(cab.poblacion)} habitantes <span className="ficha__anio">(INE, {anio})</span>
          {vista.grupoComparacion && <> · tamaño: {vista.grupoComparacion.replace(/^Los (municipios|pueblos) de /, "")}</>}
        </p>
        <button type="button" className="boton ficha__ir-mapa" onClick={onIrAlMapa}>
          Ver el mapa de {cab.nombre}
        </button>
      </header>

      {datos.error ? (
        <div className="error-panel" role="alert">
          <h3>No se han podido calcular los servicios</h3>
          <p className="error-panel__detalle">{datos.error}</p>
          <button type="button" className="boton" onClick={datos.reintentar}>
            Reintentar
          </button>
        </div>
      ) : (
        <>
          <p className="solo-lectores" role="status" aria-live="polite">
            {datos.completo ? `Ficha de ${cab.nombre} lista.` : `Calculando los servicios de ${cab.nombre}…`}
          </p>

          {lugarAire && <AireHoy lugar={lugarAire} />}

          <section className="bloque" aria-labelledby="mm-servicios">
            <h3 id="mm-servicios" className="rotulo-seccion">
              Los servicios que tiene
            </h3>
            <p className="nota nota--tinta">
              Cada tarjeta compara con {vista.grupoComparacion ? `${vista.grupoComparacion.toLowerCase()} (mediana)` : "la media de la Comunidad"}. Marca «Ver en el mapa» para
              dibujar sus centros.
            </p>
            <ul className="servicios-ficha">
              {vista.filas.map((f) => (
                <TarjetaServicio
                  key={f.id}
                  f={f}
                  lugarId={lugarId}
                  enMapa={servicioMapa === f.id}
                  onMapa={() => {
                    onServicioMapa(f.id);
                    onIrAlMapa();
                  }}
                  onSimulador={() => onVerSimulador(f.id, lugarId)}
                />
              ))}
              {pendientes.map((id) => (
                <li key={id} className="servicio-ficha servicio-ficha--pendiente" aria-busy="true">
                  <span className="servicio-ficha__icono" aria-hidden="true">
                    {(() => {
                      const I = ICONOS[id];
                      return <I tam={20} />;
                    })()}
                  </span>
                  <span className="servicio-ficha__espera">
                    {SERVICIOS[id].nombre}: calculando…
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bloque falta" aria-labelledby="mm-falta">
            <h3 id="mm-falta" className="rotulo-seccion">
              Dónde un centro nuevo ayudaría más
            </h3>
            {!datos.completo ? (
              <div className="esq esq--falta" aria-hidden="true" />
            ) : vista.loQueFalta.length === 0 ? (
              <p className="falta__nada">
                En ningún servicio sale por debajo de lo habitual para {vista.grupoComparacion ? vista.grupoComparacion.toLowerCase() : "la Comunidad"}. Aun así, mira el detalle:
                el semáforo es una comparación, no una garantía de que haya de todo.
              </p>
            ) : (
              <ol className="falta__lista">
                {vista.loQueFalta.map((f) => (
                  <ItemFalta key={f.id} f={f} onVer={() => onVerSimulador(f.id, lugarId)} lugar={cab.nombre} />
                ))}
              </ol>
            )}
          </section>

          <section className="bloque" aria-labelledby="mm-otros">
            <h3 id="mm-otros" className="rotulo-seccion">
              Otros servicios sociales
            </h3>
            {datos.otros.fase === "error" ? (
              <p className="nota nota--tinta">No se han podido cargar los centros sociales. {datos.otros.mensaje}</p>
            ) : sectores === null ? (
              <div className="esq esq--otros" aria-hidden="true" />
            ) : sectores.length === 0 ? (
              <p className="nota nota--tinta">El registro no recoge otros centros sociales en {cab.nombre} (aparte de las residencias de mayores).</p>
            ) : (
              <>
                <ul className="otros">
                  {sectores.map((s) => (
                    <li key={s.sector} className="otros__fila">
                      <span className="otros__sector">{s.sector}</span>
                      <span className="otros__n dato">
                        {enteroEs(s.n)} {s.n === 1 ? "centro" : "centros"}
                        {s.plazas > 0 && <span className="otros__plazas"> · {enteroEs(s.plazas)} plazas</span>}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="nota">Solo se cuentan: no hay un criterio de cuántos hacen falta. Los centros sin ubicación en el registro (por ejemplo, casas de acogida con dirección reservada) no entran.</p>
                {sectores.some((s) => s.sector === CENTROS_DE_DIA || s.sector === HOGARES_Y_CLUBES) && (
                  <p className="nota">
                    Los centros de día no están en el simulador: el registro llama «centro de día» a los hogares y clubes de mayores, que son centros sociales y no atención de día, así que
                    separamos unos de otros y no calculamos cuántos hacen falta.
                  </p>
                )}
              </>
            )}
          </section>

          <section className="bloque" aria-labelledby="mm-como">
            <h3 id="mm-como" className="rotulo-seccion">
              Cómo se lee
            </h3>
            <ul className="limites__lista">
              <li>
                El semáforo es un criterio propio: «por debajo» si queda más de un 20 % peor que la referencia y «por encima» si queda más de un 20 % mejor. La referencia es la
                mediana de los municipios de su tamaño; en un distrito, la media de la Comunidad. Las plazas de residencia que faltan se calculan con la referencia que hayas
                elegido en el simulador (media de la Comunidad, IMSERSO España o IMSERSO Madrid), y cada cifra dice cuál es.
              </li>
              <li>
                Las distancias son en línea recta, no por carretera. Los centros de los pueblos de al lado cuentan para los vecinos que los tienen cerca.
              </li>
              <li>
                «Cubierto desde fuera» significa que el municipio no tiene un centro propio, o que su cifra sale baja, pero ningún vecino queda a más de la distancia máxima de uno.
              </li>
              <li>
                Población: INE, censo anual de {anio}, por sección censal. Centros: registros de la Comunidad de Madrid (CC BY 4.0). La ficha no sustituye a la planificación
                oficial.
              </li>
            </ul>
          </section>
        </>
      )}
    </article>
  );
}

function ItemFalta({ f, onVer, lugar }: { f: LoQueFalta; onVer: () => void; lugar: string }) {
  const I = ICONOS[f.id];
  return (
    <li className="falta__item">
      <span className="falta__icono" aria-hidden="true">
        <I tam={22} />
      </span>
      <div className="falta__cuerpo">
        <p className="falta__nombre">{f.nombre}</p>
        <p className="falta__frase">{f.frase}</p>
        {f.plazasFaltan !== null && <p className="falta__plazas dato">{Math.round(f.plazasFaltan) === 1 ? "Habría sitio para 1 plaza más" : `Habría sitio para unas ${enteroEs(f.plazasFaltan)} plazas más`}{f.refPlazas ? ` ${f.refPlazas}` : ""}.</p>}
        <button type="button" className="boton boton--simulador" onClick={onVer}>
          Ver en el simulador
          <span className="solo-lectores">: {f.nombre.toLowerCase()} en {lugar}</span>
        </button>
      </div>
    </li>
  );
}

function TarjetaServicio({ f, lugarId, enMapa, onMapa, onSimulador }: { f: FilaVista; lugarId: string; enMapa: boolean; onMapa: () => void; onSimulador: () => void }) {
  const I = ICONOS[f.id];
  const idTitulo = `mm-${lugarId.replace(/\W/g, "")}-${f.id}`;
  return (
    <li className={`servicio-ficha servicio-ficha--${f.semaforo}`} aria-labelledby={idTitulo}>
      <div className="servicio-ficha__cabecera">
        <span className="servicio-ficha__icono" aria-hidden="true">
          <I tam={22} />
        </span>
        <h4 id={idTitulo} className="servicio-ficha__nombre">
          {f.nombre}
        </h4>
        <span className={`semaforo semaforo--${f.semaforo}`}>
          <span className="semaforo__punto" aria-hidden="true" />
          {ETIQUETA_SEMAFORO[f.semaforo]}
        </span>
      </div>
      <p className="servicio-ficha__titular">{f.titular}</p>
      {f.lineas.length > 0 && (
        <ul className="servicio-ficha__lineas">
          {f.lineas.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {f.referencia && (
        <details className="servicio-ficha__norma">
          <summary>
            Frente a la referencia
            {f.referencia.sello && <span className={`norma__sello norma__sello--${f.referencia.cumple ? "si" : "no"}`}>{f.referencia.sello}</span>}
          </summary>
          <p>{f.referencia.texto}.</p>
          {f.referencia.resultado && <p className="dato">{f.referencia.resultado}</p>}
          {f.referencia.nota && <p className="nota">{f.referencia.nota}</p>}
          <a className="enlace-fuente" href={f.referencia.url} target="_blank" rel="noopener noreferrer">
            Ver la fuente <IconoEnlace />
            <span className="solo-lectores"> (se abre en otra pestaña)</span>
          </a>
        </details>
      )}
      <div className="servicio-ficha__acciones">
        <button type="button" className="boton" aria-pressed={enMapa} onClick={onMapa}>
          {enMapa ? "Se ve en el mapa" : "Ver en el mapa"}
          <span className="solo-lectores">: {f.nombre.toLowerCase()}</span>
        </button>
        <button type="button" className="boton boton--texto-ficha" onClick={onSimulador}>
          Abrir en el simulador
          <span className="solo-lectores">: {f.nombre.toLowerCase()}</span>
        </button>
      </div>
    </li>
  );
}
