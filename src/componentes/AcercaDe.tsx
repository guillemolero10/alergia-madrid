import { useEffect, useRef, useState, type ReactNode } from "react";
import "./AcercaDe.css";
import { cargarProyeccion, lectorWeb } from "../lib/donde/cargar";
import { enteroEs } from "../lib/donde/panelDonde";
import { errorPonderadoPct, errorTipicoPct } from "../lib/donde/proyeccion";
import { SERVICIO_IDS, SERVICIOS } from "../lib/donde/servicios";
import type { Centros, ServicioId } from "../lib/donde/tipos";
import { FUENTES, URL_DEMO, URL_REPO, type Actualizacion, type Fuente } from "../lib/fuentes";
import { cargarCentros, type BaseDonde } from "../lib/useDonde";
import { LIMITES } from "./Metodologia";
import { IconoCentroSalud, IconoColegio, IconoDea, IconoFarmacia, IconoHospital, IconoResidencia } from "./Iconos";

const ICONOS: Record<ServicioId, (p: { tam?: number }) => ReactNode> = {
  centro_salud: IconoCentroSalud,
  hospital: IconoHospital,
  residencia: IconoResidencia,
  farmacia: IconoFarmacia,
  colegio: IconoColegio,
  dea: IconoDea,
};

// ---------------------------------------------------------------- cifras que salen de los datos
export interface MetaAcerca {
  /** Cifras de la base de hoy (censo 2025), o null mientras llegan. */
  base: { secciones: number; habitantes: number; mayores: number; municipios: number; distritos: number; zonas: number; generado: string } | null;
  /** Centros cargados por servicio (nº de puntos) y fecha en que el portal actualizó el conjunto. */
  centros: Partial<Record<ServicioId, { n: number; actualizado: string | null; generado: string }>>;
  /** Error de la proyección a 2030 (validación 2021-2025), en %. */
  error2030: { pond65: number | null; pond75: number | null; tip65: number | null; tip75: number | null } | null;
}

export const META_VACIA: MetaAcerca = { base: null, centros: {}, error2030: null };

const suma = (v: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] as number;
  return s;
};

/** Carga (con la misma caché que el resto de la web) lo que la página cuenta con cifras. */
function useMetaAcerca(base: BaseDonde | null): MetaAcerca {
  const [centros, setCentros] = useState<MetaAcerca["centros"]>({});
  const [error2030, setError2030] = useState<MetaAcerca["error2030"]>(null);
  useEffect(() => {
    let vivo = true;
    for (const id of SERVICIO_IDS) {
      cargarCentros(id).then(
        (c: Centros) => vivo && setCentros((m) => ({ ...m, [id]: { n: c.ids.length, actualizado: c.actualizado_fuente ?? null, generado: c.generado } })),
        () => undefined,
      );
    }
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    if (!base) return;
    let vivo = true;
    cargarProyeccion(lectorWeb("/donde/"), base.secciones).then(
      ({ proyeccion: p }) =>
        vivo && setError2030({ pond65: errorPonderadoPct(p, "65_mas"), pond75: errorPonderadoPct(p, "75_mas"), tip65: errorTipicoPct(p, "65_mas"), tip75: errorTipicoPct(p, "75_mas") }),
      () => undefined,
    );
    return () => {
      vivo = false;
    };
  }, [base]);
  return {
    base: base
      ? {
          secciones: base.secciones.ids.length,
          habitantes: suma(base.secciones.pob.total),
          mayores: suma(base.secciones.pob["65_mas"]),
          municipios: base.territorios.municipios.length,
          distritos: base.territorios.distritos.length,
          zonas: base.territorios.zonas.length,
          generado: base.secciones.generado,
        }
      : null,
    centros,
    error2030,
  };
}

// ---------------------------------------------------------------- formato
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-11-18» → «18 de noviembre de 2026»; si no es una fecha ISO, tal cual. */
export function fechaEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const mes = m ? MESES[Number(m[2]) - 1] : undefined;
  return m && mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : iso;
}

const pctTxt = (n: number | null) => (n === null ? "—" : `${String(n).replace(".", ",")} %`);

/** Cuándo se actualizó una fuente en la app: metadato del fichero, generación de la base, «en vivo» o texto fijo. */
export function actualizacionTexto(a: Actualizacion, meta: MetaAcerca): string {
  if (a.tipo === "en_vivo" || a.tipo === "fija") return a.texto;
  if (a.tipo === "base") return meta.base ? `Copiado el ${fechaEs(meta.base.generado)}` : "Cargando…";
  const c = meta.centros[a.servicio];
  if (!c) return "Cargando…";
  return c.actualizado ? `Actualizado en la fuente el ${fechaEs(c.actualizado)}; copiado el ${fechaEs(c.generado)}` : `Copiado el ${fechaEs(c.generado)}`;
}

// ---------------------------------------------------------------- piezas
function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** El índice desplaza dentro de la página sin escribir `#…` en la URL: así «Volver» y el botón Atrás no se lían con las anclas. */
function irASeccion(e: { preventDefault: () => void }, id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  e.preventDefault();
  const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "start" });
  const h = el.querySelector<HTMLElement>("h2");
  if (h) {
    h.tabIndex = -1;
    h.focus({ preventScroll: true });
  }
}

const INDICE: { id: string; texto: string }[] = [
  { id: "que-es", texto: "Qué es" },
  { id: "que-hace", texto: "Qué hace" },
  { id: "fuentes", texto: "Fuentes de datos" },
  { id: "calculo", texto: "Cómo se calcula" },
  { id: "limites", texto: "Límites" },
  { id: "tecnologia", texto: "Tecnología y transparencia" },
  { id: "enlaces", texto: "Enlaces" },
];

function TarjetaFuente({ f, meta }: { f: Fuente; meta: MetaAcerca }) {
  return (
    <li className="acerca__fuente">
      <h4 className="acerca__fuente-titulo">
        <Enlace href={f.url}>{f.nombre}</Enlace>
      </h4>
      <p>{f.que}</p>
      <dl className="acerca__datos">
        <div>
          <dt>Para qué la usamos</dt>
          <dd>{f.uso}</dd>
        </div>
        <div>
          <dt>Licencia</dt>
          <dd>{f.licencia}</dd>
        </div>
        <div>
          <dt>La fuente la publica</dt>
          <dd>{f.frecuencia}</dd>
        </div>
        <div>
          <dt>En esta web</dt>
          <dd>{actualizacionTexto(f.actualizacion, meta)}</dd>
        </div>
      </dl>
    </li>
  );
}

interface Props {
  /** Datos de hoy ya cargados por la app (o null). */
  base: BaseDonde | null;
  /** Vuelve a la app, donde estaba. */
  onVolver: () => void;
  /** Vuelve a «¿Dónde hace falta?», a los ejemplos de «Empieza aquí». */
  onProbar: () => void;
  /** Cifras ya calculadas (las pruebas y la maqueta pasan las suyas; sin ellas se cargan). */
  meta?: MetaAcerca;
}

/** Página «Qué es»: explica el proyecto entero, con las cifras que salen de los datos. */
export function AcercaDe({ base, onVolver, onProbar, meta: metaFija }: Props) {
  const cargada = useMetaAcerca(metaFija ? null : base);
  const meta = metaFija ?? cargada;
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titulo.current?.focus({ preventScroll: true });
  }, []);
  // Esc cierra, como cualquier diálogo. En fase de captura y sin propagarse, para no cancelar a la vez el «Coloca un centro» o la
  // ventanita del mapa que hay debajo (R4-1). Solo cierra una vez: un Esc repetido antes de que llegue el `popstate` de
  // `history.back()` haría un `pushState` encima (R4-2). Al cerrarse, el componente se desmonta y el ref vuelve a empezar.
  const cerrado = useRef(false);
  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (e.repeat || cerrado.current) return;
      cerrado.current = true;
      onVolver();
    };
    window.addEventListener("keydown", alPulsar, true);
    return () => window.removeEventListener("keydown", alPulsar, true);
  }, [onVolver]);
  const b = meta.base;
  const grupos = [...new Set(FUENTES.map((f) => f.grupo))];

  return (
    <div className="acerca" role="dialog" aria-modal="true" aria-labelledby="acerca-titulo">
      <div className="acerca__barra">
        <button type="button" className="acerca__volver" onClick={onVolver}>
          <span aria-hidden="true">←</span> Volver a la app
        </button>
        <button type="button" className="acerca__probar" onClick={onProbar}>
          Probar los ejemplos
        </button>
      </div>

      <div className="acerca__hoja">
        <header className="acerca__cabecera">
          <p className="acerca__kicker">Comunidad de Madrid · DATAMAD 2026</p>
          <h1 id="acerca-titulo" ref={titulo} tabIndex={-1}>
            ¿Dónde hace falta?
          </h1>
          <p className="acerca__lema">Qué cerca están los servicios públicos y dónde un centro nuevo ayudaría más.</p>
        </header>

        <nav className="acerca__indice" aria-label="Contenido de esta página">
          <ol>
            {INDICE.map((i) => (
              <li key={i.id}>
                <a href={`#${i.id}`} onClick={(e) => irASeccion(e, i.id)}>
                  {i.texto}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="acerca__cuerpo">
          <section id="que-es" aria-labelledby="h-que-es">
            <h2 id="h-que-es">Qué es</h2>
            <p className="acerca__destacado">
              Una herramienta para decidir dónde conviene colocar un servicio público nuevo. Cruza los registros oficiales de centros de la Comunidad de Madrid con la
              población por edad de cada sección censal, enseña qué cobertura tiene hoy cada servicio y calcula cuánta gente ganaría con un centro nuevo en cada sitio.
            </p>
            <p>
              Está pensada para dos personas: quien decide dónde invertir (ayuntamientos, consejerías, asociaciones) y cualquier vecino que quiera saber qué tiene su
              pueblo y qué le ayudaría. No sustituye un estudio técnico: es un primer mapa, con todos sus datos y límites a la vista.
            </p>
            <p>
              Es un prototipo en desarrollo, hecho por <strong>Guillermo Molero</strong> para el datathon <strong>DATAMAD 2026</strong> (Comunidad de Madrid y URJC), que sigue
              mejorando hasta la final del 26 de noviembre.
            </p>
            {b && (
              <ul className="acerca__cifras" aria-label="Cifras de un vistazo">
                <li>
                  <strong>{enteroEs(b.secciones)}</strong> secciones censales
                </li>
                <li>
                  <strong>{enteroEs(b.habitantes)}</strong> habitantes (INE, censo de 2025)
                </li>
                <li>
                  <strong>{enteroEs(b.mayores)}</strong> mayores de 65 años
                </li>
                <li>
                  <strong>{enteroEs(b.municipios)}</strong> municipios
                </li>
                <li>
                  <strong>{enteroEs(b.distritos)}</strong> distritos de la capital
                </li>
                <li>
                  <strong>{enteroEs(b.zonas)}</strong> zonas estadísticas
                </li>
                {SERVICIO_IDS.map((id) => {
                  const c = meta.centros[id];
                  return c ? (
                    <li key={id}>
                      <strong>{enteroEs(c.n)}</strong> {id === "dea" ? "puntos con desfibrilador" : SERVICIOS[id].nombre.toLowerCase()}
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </section>

          <section id="que-hace" aria-labelledby="h-que-hace">
            <h2 id="h-que-hace">Qué hace</h2>

            <h3>«¿Dónde hace falta?»: la cobertura de cada servicio</h3>
            <p>
              Eliges un servicio y el mapa pinta cada una de las secciones censales. En los servicios por distancia, el color dice a cuánta gente le queda un centro cerca; en
              las residencias, cuántas plazas hay por cada 100 mayores frente a una referencia. Arriba del panel está primero la cobertura y, debajo, «dónde un centro nuevo
              ayudaría más».
            </p>
            <table className="acerca__tabla">
              <caption>Servicios, a quién cuentan y radios que se pueden elegir</caption>
              <thead>
                <tr>
                  <th scope="col">Servicio</th>
                  <th scope="col">Personas que cuenta</th>
                  <th scope="col">Radios</th>
                </tr>
              </thead>
              <tbody>
                {SERVICIO_IDS.map((id) => {
                  const Icono = ICONOS[id];
                  const s = SERVICIOS[id];
                  const r = s.radios.map((m) => (m >= 1000 ? `${m / 1000} km` : `${m} m`)).join(", ");
                  return (
                    <tr key={id}>
                      <th scope="row">
                        <span className="acerca__icono">{Icono({ tam: 20 })}</span> {s.nombre}
                      </th>
                      <td>{s.grupoEtiqueta}</td>
                      <td>
                        {r} {s.metrica === "plazas" ? "(radio de captación de las plazas)" : "(distancia máxima)"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p>
              En residencias hay tres referencias entre las que elegir:{" "}
              <strong>la media de España del IMSERSO ({String(SERVICIOS.residencia.imserso?.espana).replace(".", ",")} plazas por cada 100 mayores, la de por defecto)</strong>, la media de
              Madrid del IMSERSO ({String(SERVICIOS.residencia.imserso?.madrid).replace(".", ",")}) y la media de la Comunidad que sale del registro de centros. Son comparaciones, no un mínimo legal. El
              ranking se puede ver por municipio, por distrito de Madrid o por zona estadística, y ordenarlo por plazas por cubrir, por porcentaje o por personas.
            </p>

            <h3>«Tú decides»: colocar un centro y compararlo</h3>
            <p>
              Colocas un centro nuevo en el mapa (con un clic, arrastrándolo, con el dedo o con las flechas del teclado) y, si es una residencia, eliges sus plazas. Al momento ves
              cuánta gente gana un centro cerca o cuántas plazas más se cubren. Después pides «¿Y dónde lo pondría el modelo?»: un algoritmo voraz de máxima cobertura busca el
              mejor punto y la app te dice qué porcentaje de ese óptimo logra el tuyo.
            </p>

            <h3>«Madrid en 2030»</h3>
            <p>
              Repite todo con la población proyectada por el INE para 2030, repartida por sección con un modelo de cohortes propio y calibrada con la proyección oficial. Se probó de 2021 a
              2025 (error medio ponderado por población):{" "}
              {meta.error2030 ? (
                <>
                  {pctTxt(meta.error2030.pond65)} en mayores de 65 y {pctTxt(meta.error2030.pond75)} en mayores de 75; en un municipio típico, {pctTxt(meta.error2030.tip65)} y{" "}
                  {pctTxt(meta.error2030.tip75)}.
                </>
              ) : (
                "cargando…"
              )}{" "}
              Los centros son los de hoy y la referencia de residencias se mantiene en el valor de hoy.
            </p>

            <h3>«Mi municipio»: la ficha de tu pueblo o distrito</h3>
            <p>
              Buscas tu municipio (o un distrito de Madrid) y ves qué servicios tiene, cómo está frente a municipios de su tamaño y a la media de la Comunidad (un semáforo con
              formas y texto, no solo color), dónde un centro nuevo ayudaría más y cómo está el aire hoy, con la última medición de la estación más cercana y la previsión de las
              próximas horas. Los centros se ven en el mapa.
            </p>

            <h3>El agente</h3>
            <p>
              Puedes preguntar en lenguaje natural («¿dónde pondrías una residencia en el sur?»). El agente solo puede usar las herramientas de cálculo de la propia web, mueve el mapa y
              enseña los pasos que ha seguido. Tiene dos modos: <strong>con IA</strong> (Muse Spark, el modelo de Meta, a través de su API, cuando está activa), y <strong>sin IA</strong>, que
              interpreta la pregunta por reglas en tu navegador. En los dos, las cifras salen siempre del cálculo: un validador comprueba cada número del texto y, si alguno no sale de
              las herramientas, lo sustituye por una respuesta calculada.
            </p>

            <h3>Y además</h3>
            <ul>
              <li>
                <strong>«Empieza aquí»:</strong> tres ejemplos de un clic para ver la app funcionando sin saber nada.
              </li>
              <li>
                <strong>Enlaces que se comparten:</strong> servicio, radio, zona, punto colocado y año van en la dirección; copiar la URL reproduce lo que ves.
              </li>
              <li>
                <strong>Móvil:</strong> se usa a 375 px, con el mapa debajo del panel y un botón para saltar a él; accesible con teclado y lector de pantalla.
              </li>
            </ul>
          </section>

          <section id="fuentes" aria-labelledby="h-fuentes">
            <h2 id="h-fuentes">Fuentes de datos</h2>
            <p>
              Todo lo que usa la app, con su licencia y la fecha en que se copió. Los datos de centros y población se generan con un pipeline reproducible
              {b ? ` (última generación: ${fechaEs(b.generado)})` : ""}; el aire de hoy se copia de forma programada cada hora en la rama <code>datos</code> del repositorio (GitHub puede retrasarlo; la web avisa si el dato tiene más de 3 h).
            </p>
            {grupos.map((g) => (
              <div key={g}>
                <h3>{g}</h3>
                <ul className="acerca__fuentes">
                  {FUENTES.filter((f) => f.grupo === g).map((f) => (
                    <TarjetaFuente key={f.id} f={f} meta={meta} />
                  ))}
                </ul>
              </div>
            ))}
          </section>

          <section id="calculo" aria-labelledby="h-calculo">
            <h2 id="h-calculo">Cómo se calcula</h2>
            <ol>
              <li>
                <strong>La unidad es la sección censal.</strong> Cada una se representa con un punto interior y se considera que su gente vive ahí.
              </li>
              <li>
                <strong>Distancias en línea recta</strong> al centro más cercano. Se cuenta como «con servicio cerca» a quien tiene un centro dentro del radio elegido.
              </li>
              <li>
                <strong>Plazas de residencia por cada 100 mayores:</strong> para cada sección se suman las plazas de las residencias a menos del radio de captación (por defecto 10 km), repartidas
                entre los mayores de su alcance, y se comparan con la referencia.
              </li>
              <li>
                <strong>Dónde un centro nuevo ayudaría más:</strong> un algoritmo voraz de máxima cobertura prueba cada sección como sitio posible y elige la que más gente acerca al servicio (o más
                plazas cubre). Se comprueba contra una implementación independiente en Python.
              </li>
              <li>
                <strong>Madrid en 2030:</strong> la proyección oficial del INE, repartida por sección con un modelo de cohortes y validada con los años 2021-2025.
              </li>
            </ol>
            <p>
              El detalle completo está en «Metodología y fuentes», en la cabecera de la app, y en{" "}
              <Enlace href={`${URL_REPO}/blob/main/DATOS-DONDE.md`}>DATOS-DONDE.md</Enlace> del repositorio.
            </p>
          </section>

          <section id="limites" aria-labelledby="h-limites">
            <h2 id="h-limites">Límites declarados</h2>
            <p>Esta herramienta ayuda a decidir; no decide por nadie. Lo que conviene tener presente:</p>
            <ul>
              {LIMITES.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </section>

          <section id="tecnologia" aria-labelledby="h-tecnologia">
            <h2 id="h-tecnologia">Tecnología y transparencia</h2>
            <ul>
              <li>
                <strong>Código abierto.</strong> Licencia MIT para el código y CC BY 4.0 (con su atribución) para los datos derivados. Todo en{" "}
                <Enlace href={URL_REPO}>el repositorio</Enlace>.
              </li>
              <li>
                <strong>Tecnología.</strong> Vite, React y TypeScript; MapLibre GL para el mapa; el cálculo se hace en tu navegador. El pipeline de datos es Python. El agente corre en una
                función de Vercel.
              </li>
              <li>
                <strong>Reproducible.</strong> Un comando regenera los datos y otro construye la web. Más de 700 pruebas automáticas en la web y más de 200 en el pipeline; el motor de cálculo se
                comprueba contra una implementación independiente en Python.
              </li>
              <li>
                <strong>Privacidad.</strong> Sin datos personales: todo son registros públicos y población agregada por sección. Los servicios sociales sensibles (acogida, menores, pisos tutelados…) se
                muestran sin nombre ni dirección. Nosotros no guardamos el texto de las preguntas al agente; con IA, se envía a Meta junto con los resultados de las herramientas (datos públicos) y Meta puede usarlo según sus condiciones. No escribas datos personales.
              </li>
              <li>
                <strong>Uso de IA.</strong> El desarrollo se ha hecho con ayuda de asistentes de IA (permitido por las bases). En la app, el agente usa Muse Spark (Meta), y sus cifras las valida el servidor.
              </li>
              <li>
                <strong>Código reutilizado, declarado.</strong> El cliente del portal de datos (CKAN) del pipeline está basado en el servidor MCP del ponente Alberto Abella (
                <Enlace href="https://github.com/albertoabellagarcia/DATAMAD2026">DATAMAD2026</Enlace>). El cliente del modelo del agente y su tope de gasto diario están adaptados de
                DockClerk, otro proyecto del mismo autor.
              </li>
            </ul>
          </section>

          <section id="enlaces" aria-labelledby="h-enlaces">
            <h2 id="h-enlaces">Enlaces</h2>
            <ul>
              <li>
                Demo: <Enlace href={URL_DEMO}>{URL_DEMO.replace("https://", "")}</Enlace>
              </li>
              <li>
                Repositorio: <Enlace href={URL_REPO}>github.com/guillemolero10/donde-hace-falta</Enlace>
              </li>
              <li>
                Autor: Guillermo Molero (GitHub: <Enlace href="https://github.com/guillemolero10">guillemolero10</Enlace>). Para cualquier duda, un «issue» en el repositorio.
              </li>
            </ul>
            <p>
              <button type="button" className="acerca__volver acerca__volver--final" onClick={onVolver}>
                <span aria-hidden="true">←</span> Volver a la app
              </button>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
