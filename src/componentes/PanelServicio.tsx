import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import "./PanelServicio.css";
import {
  cifraGrande,
  codigosZona,
  decimal2Es,
  decimalEs,
  enteroEs,
  coberturaPositiva,
  filasRanking,
  nombreZonas,
  opcionesReferencia,
  plazasEs,
  porcentajeEs,
  radioEs,
  type CifraGrande,
} from "../lib/donde/panelDonde";
import { ANIO_HOY, ANIO_PROYECCION, ROTULO_PROYECCION, fraseErrorProyeccion, fiabilidadProyeccion, type AnioDonde } from "../lib/donde/proyeccion";
import { SERVICIO_IDS, SERVICIOS } from "../lib/donde/servicios";
import type { EstadoServicio, FilaRanking, ServicioId, Territorios } from "../lib/donde/tipos";
import { esServicioConPlazas, ordenesDisponibles, type EstadoDonde, type OrdenRanking, type ReferenciaId } from "../lib/donde/urlDonde";
import type { Donde } from "../lib/useDonde";
import type { TuDecides as EstadoTuDecides } from "../lib/useTuDecides";
import { TuDecides, type AccionesMapa } from "./TuDecides";
import { useMedia } from "../lib/useMedia";
import {
  IconoCentroSalud,
  IconoColegio,
  IconoDea,
  IconoEnlace,
  IconoFarmacia,
  IconoHospital,
  IconoResidencia,
} from "./Iconos";

type Icono = ComponentType<{ tam?: number; className?: string }>;

const BOTONES: Record<ServicioId, { corto: string; Icono: Icono }> = {
  residencia: { corto: "Residencia de mayores", Icono: IconoResidencia },
  centro_salud: { corto: "Centro de salud", Icono: IconoCentroSalud },
  hospital: { corto: "Hospital", Icono: IconoHospital },
  farmacia: { corto: "Farmacia", Icono: IconoFarmacia },
  colegio: { corto: "Colegio o instituto", Icono: IconoColegio },
  dea: { corto: "Desfibrilador", Icono: IconoDea },
};

/** «a más de 2 km de {…}» */
const COMPLEMENTO: Record<ServicioId, string> = {
  residencia: "una residencia de mayores",
  centro_salud: "un centro de salud o consultorio",
  hospital: "un hospital general público",
  farmacia: "una farmacia",
  colegio: "un colegio o instituto",
  dea: "un desfibrilador",
};

const ORDEN_ETIQUETA: Record<OrdenRanking, string> = {
  faltan: "Plazas por cubrir",
  pct: "Porcentaje que se beneficiaría",
  personas: "Personas que se beneficiarían",
};

interface Props {
  donde: Donde;
  seleccion: string | null;
  /** Una fila del ranking: el mapa vuela allí y el contorno se resalta. */
  onElegirLugar: (id: string) => void;
  /** Estado de «Tú decides» (lo comparte con el mapa) y lo que puede pedirle al mapa. */
  tuDecides: EstadoTuDecides;
  mapa: AccionesMapa;
}

/** Panel izquierdo de «¿Dónde hace falta?»: servicio, radio, cifra grande, referencia y ranking. */
export function PanelServicio({ donde, seleccion, onElegirLugar, tuDecides, mapa }: Props) {
  const { est, base, estado, centros } = donde;

  if (base.fase === "cargando") return <EsqueletoPanel />;
  if (base.fase === "error") {
    return <ErrorPanel titulo="No se han podido cargar los datos" detalle={base.mensaje} onReintentar={donde.reintentarBase} />;
  }
  const territorios = base.valor.territorios;

  return (
    <div className="panel-servicio">
      <SelectorAnio donde={donde} />
      <SelectorServicio est={est} onElegir={donde.elegirServicio} />
      <SelectorRadio est={est} onElegir={(r) => donde.cambiar({ radio_m: r })} />

      {centros.fase === "error" ? (
        <ErrorPanel titulo="No se han podido cargar los centros de este servicio" detalle={centros.mensaje} onReintentar={donde.reintentarCentros} />
      ) : donde.errorAnio && est.anio === ANIO_PROYECCION ? (
        <ErrorPanel titulo="No se ha podido cargar la proyección a 2030" detalle={donde.errorAnio} onReintentar={donde.reintentarAnio} />
      ) : donde.errorCalculo ? (
        <ErrorPanel titulo="No se ha podido calcular la cobertura" detalle={donde.errorCalculo} />
      ) : !estado ? (
        <EsqueletoCifra />
      ) : (
        <>
          <Cifra estado={estado} estadoHoy={donde.estadoHoy} territorios={territorios} zona={est.zona} />
          <TuDecides estado={estado} td={tuDecides} mapa={mapa} />
          <Referencia estado={estado} est={est} mediaHoy={donde.estadoHoy?.media ?? null} onElegir={(r) => donde.cambiar({ referencia: r })} />
          <Ranking estado={estado} territorios={territorios} est={est} cambiar={donde.cambiar} seleccion={seleccion} onElegirLugar={onElegirLugar} />
          <Limites estado={estado} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- año
function SelectorAnio({ donde }: { donde: Donde }) {
  const { est } = donde;
  const proy = donde.base.fase === "listo" ? donde.base.valor.proyeccion : null;
  const fraseError = fraseErrorProyeccion(proy);
  const opciones: { anio: AnioDonde; texto: string }[] = [
    { anio: ANIO_HOY, texto: "Hoy (censo 2025)" },
    { anio: ANIO_PROYECCION, texto: "2030 (proyección)" },
  ];
  return (
    <fieldset className="bloque bloque--anio">
      <legend className="rotulo-seccion">Población</legend>
      <div className="radios radios--dos">
        {opciones.map((o) => (
          <label key={o.anio} className="opcion opcion--radio">
            <input type="radio" name="anio" value={o.anio} checked={est.anio === o.anio} onChange={() => donde.cambiar({ anio: o.anio })} />
            <span>{o.texto}</span>
          </label>
        ))}
      </div>
      {est.anio === ANIO_PROYECCION && (
        <div className="nota nota--tinta aviso-proyeccion" role="note">
          <p>
            <strong>{ROTULO_PROYECCION}</strong>
          </p>
          <p>
            {donde.cargandoAnio ? "Cargando la proyección… " : ""}
            Con los centros de hoy: cómo quedaría la cobertura y dónde un centro nuevo ayudaría más si la población crece como prevé el INE.
            {fraseError ? ` ${fraseError}` : ""}{" "}
            Los barrios nuevos pueden tener más gente de la que enseñamos.
          </p>
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------- servicio y radio
function SelectorServicio({ est, onElegir }: { est: EstadoDonde; onElegir: (id: ServicioId) => void }) {
  // En el móvil los servicios van en una fila que se desplaza: el elegido tiene que quedar a la vista (también al abrir con `?servicio=`).
  const contenedor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const c = contenedor.current;
    const elegido = c?.querySelector<HTMLElement>(".opcion:has(input:checked)");
    if (!c || !elegido || c.scrollWidth <= c.clientWidth) return;
    c.scrollTo({ left: elegido.offsetLeft - (c.clientWidth - elegido.offsetWidth) / 2, behavior: "auto" });
  }, [est.servicio]);
  return (
    <fieldset className="bloque bloque--servicios">
      <legend className="rotulo-seccion">1. Elige un servicio</legend>
      <div className="servicios" ref={contenedor}>
        {SERVICIO_IDS.map((id) => {
          const { corto, Icono } = BOTONES[id];
          return (
            <label key={id} className="opcion opcion--servicio">
              <input type="radio" name="servicio" value={id} checked={est.servicio === id} onChange={() => onElegir(id)} />
              <Icono tam={22} />
              <span>{corto}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SelectorRadio({ est, onElegir }: { est: EstadoDonde; onElegir: (m: number) => void }) {
  const def = SERVICIOS[est.servicio];
  const plazas = def.metrica === "plazas";
  return (
    <fieldset className="bloque bloque--radio">
      <legend className="rotulo-seccion">{plazas ? "2. Radio de captación" : "2. Distancia máxima"}</legend>
      <div className="radios">
        {def.radios.map((r) => (
          <label key={r} className="opcion opcion--radio">
            <input type="radio" name="radio" value={r} checked={est.radio_m === r} onChange={() => onElegir(r)} />
            <span>{radioEs(r)}</span>
          </label>
        ))}
      </div>
      <p className="nota">
        {plazas
          ? `Cuenta las plazas de los centros a menos de ${radioEs(est.radio_m)} de cada sección censal, en línea recta.`
          : `Un vecino tiene el servicio cerca si hay un centro a menos de ${radioEs(est.radio_m)} en línea recta (por carretera suele ser más).`}
      </p>
    </fieldset>
  );
}

// ---------------------------------------------------------------- cobertura (lo primero) y margen de mejora (después)
function Cifra({ estado, estadoHoy, territorios, zona }: { estado: EstadoServicio; estadoHoy: EstadoServicio | null; territorios: Territorios; zona: string | null }) {
  const c = useMemo(() => cifraGrande(estado, territorios, zona), [estado, territorios, zona]);
  const positiva = useMemo(() => coberturaPositiva(estado, territorios, zona), [estado, territorios, zona]);
  const donde = zona ? `${zona.includes(",") ? "las zonas" : "la zona"} ${c.ambito}` : "la Comunidad de Madrid";
  return (
    <section className="bloque bloque--cifra cifra" aria-labelledby="cifra-titulo" aria-live="polite">
      <h2 id="cifra-titulo" className="rotulo-seccion">
        {zona ? `${zona.includes(",") ? "Zonas" : "Zona"}: ${c.ambito}` : "Cobertura en toda la Comunidad de Madrid"}
      </h2>
      {positiva ? (
        <p className="cifra__frase">
          <strong className="cifra__numero cifra__numero--cobertura dato">{positiva.numero}</strong>
          <span className="cifra__despues">{positiva.texto}</span>
        </p>
      ) : (
        <p className="cifra__texto">No hay población de este grupo registrada en {donde}.</p>
      )}
      {estado.metrica === "plazas" && positiva && !zona && estado.media !== null && estado.media >= estado.umbral && (
        <p className="nota">En conjunto la Comunidad supera la referencia, pero las plazas no están repartidas por igual: se concentran en algunas zonas y otras quedan por debajo.</p>
      )}
      <h3 className="cifra__margen-titulo">Dónde un centro nuevo ayudaría más</h3>
      {estado.metrica === "plazas" ? <MargenPlazas c={c} estado={estado} estadoHoy={estadoHoy} territorios={territorios} zona={zona} donde={donde} /> : <MargenDistancia c={c} estado={estado} donde={donde} />}
      {estado.secciones.anio_poblacion === ANIO_PROYECCION && estado.metrica === "distancia" && fiabilidadProyeccion(estado.grupo) === "menor" && (
        <p className="nota nota--aviso">
          Cifra menos fiable: para {estado.grupo === "3_16" ? "los niños y jóvenes" : "el total de habitantes"} el modelo de reparto no mejora a suponer que todos los municipios crecen igual. Tómala como orientativa; en mayores sí es sólida.
        </p>
      )}
    </section>
  );
}

function MargenPlazas({ c, estado, estadoHoy, territorios, zona, donde }: { c: CifraGrande; estado: EstadoServicio; estadoHoy: EstadoServicio | null; territorios: Territorios; zona: string | null; donde: string }) {
  const def = SERVICIOS[estado.servicio];
  const futuro = estado.secciones.anio_poblacion === ANIO_PROYECCION;
  const hoy = estadoHoy ? cifraGrande(estadoHoy, territorios, zona).plazasFaltan : null;
  const referencia = `${decimal2Es(estado.umbral)} por cada 100 mayores de 65`;
  if (c.objetivo === 0) return null;
  if ((c.plazasFaltan ?? 0) < 0.5) {
    return <p className="cifra__texto">En {donde} todas las zonas llegan a la referencia ({referencia}): hay buena cobertura.</p>;
  }
  return (
    <>
      <p className="cifra__texto cifra__margen">
        {enteroEs(c.enDeficit)} {def.grupoEtiqueta} ({porcentajeEs(c.pct)}) viven en zonas con margen de mejora, por debajo de la referencia ({referencia}). Para llegar a ella{futuro ? " en 2030" : ""} habría
        sitio para <strong className="dato">{enteroEs(c.plazasFaltan ?? 0)}</strong> {Math.round(c.plazasFaltan ?? 0) === 1 ? "plaza" : "plazas"} más de residencia.
      </p>
      {futuro && hoy !== null && (c.plazasFaltan ?? 0) - hoy >= 0.5 && (
        <p className="cifra__texto">
          Son <strong className="dato">{enteroEs((c.plazasFaltan ?? 0) - hoy)}</strong> más que hoy ({enteroEs(hoy)}), con las residencias que hay y la referencia de hoy.
        </p>
      )}
      <p className="nota">Cálculo mínimo: cuenta solo las plazas necesarias donde hay margen de mejora; una plaza real también llega a zonas que ya no la necesitan.</p>
    </>
  );
}

function MargenDistancia({ c, estado, donde }: { c: CifraGrande; estado: EstadoServicio; donde: string }) {
  const def = SERVICIOS[estado.servicio];
  const sujeto = def.grupo === "3_16" ? "personas de 3 a 16 años (estimado)" : "personas";
  const futuro = estado.secciones.anio_poblacion === ANIO_PROYECCION;
  if (c.enDeficit < 0.5) {
    return (
      <p className="cifra__texto">
        En {donde} todo el mundo tiene {COMPLEMENTO[estado.servicio]} a menos de {radioEs(estado.radio_m)}: cobertura completa.
      </p>
    );
  }
  return (
    <p className="cifra__texto cifra__margen">
      <strong className="dato">{enteroEs(c.enDeficit)}</strong> {sujeto} ({c.pct < 0.1 ? "menos del 0,1 %" : porcentajeEs(c.pct)}) {futuro ? "vivirán" : "viven"} a más de {radioEs(estado.radio_m)}, en línea recta, de{" "}
      {COMPLEMENTO[estado.servicio]}: ahí un centro nuevo ayudaría más.
    </p>
  );
}

// ---------------------------------------------------------------- fuente
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** «2026-11-18» -> «18 de noviembre de 2026» (si no es una fecha ISO, tal cual). */
function fechaEs(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const mes = m ? MESES[Number(m[2]) - 1] : undefined;
  return m && mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : iso;
}

/** Los ficheros traen el nombre de la fuente sin tildes: se escribe bien en pantalla. */
function nombreFuente(n: string | undefined): string {
  return (n ?? "Comunidad de Madrid, portal de datos abiertos").replace("atencion social", "atención social").replace("ambito sanitario", "ámbito sanitario");
}

// ---------------------------------------------------------------- referencia
function Referencia({ estado, est, mediaHoy, onElegir }: { estado: EstadoServicio; est: EstadoDonde; mediaHoy: number | null; onElegir: (r: ReferenciaId) => void }) {
  const def = SERVICIOS[estado.servicio];
  if (esServicioConPlazas(estado.servicio)) {
    const opciones = opcionesReferencia(estado, mediaHoy);
    const elegida = opciones.find((o) => o.id === est.referencia) ?? opciones[0];
    return (
      <fieldset className="bloque bloque--referencia referencia">
        <legend className="rotulo-seccion">4. Con qué se compara</legend>
        <div className="referencias">
          {opciones.map((o) => (
            <label key={o.id} className="opcion opcion--referencia">
              <input type="radio" name="referencia" value={o.id} checked={est.referencia === o.id} onChange={() => onElegir(o.id)} />
              <span className="opcion__texto">{o.etiqueta}</span>
              <span className="opcion__valor dato">{decimal2Es(o.valor)}</span>
            </label>
          ))}
        </div>
        <p className="nota">Plazas por cada 100 mayores de 65. Fuente: {elegida?.fuente}</p>
        {estado.secciones.anio_poblacion === ANIO_PROYECCION && <p className="nota">En 2030 la referencia se queda fija en el valor de hoy: si se recalculara con la población de 2030, la referencia subiría y la comparación perdería sentido por definición.</p>}
        {/* La media de la Comunidad sale del mismo registro que los centros: su enlace ya está en «Datos» de abajo. */}
        {elegida?.url && elegida.id !== "media" && (
          <a className="enlace-fuente" href={elegida.url} target="_blank" rel="noopener noreferrer">
            Ver la fuente <IconoEnlace />
          </a>
        )}
      </fieldset>
    );
  }
  return (
    <section className="bloque bloque--referencia referencia" aria-labelledby="ref-titulo">
      <h2 id="ref-titulo" className="rotulo-seccion">
        4. Referencia oficial
      </h2>
      {def.referencia ? (
        <>
          <p className="nota nota--tinta">{def.referencia.texto}.</p>
          <a className="enlace-fuente" href={def.referencia.url} target="_blank" rel="noopener noreferrer">
            Ver la norma <IconoEnlace />
          </a>
        </>
      ) : (
        <p className="nota nota--tinta">No hay una norma con ratios que se pueda verificar para este servicio: el mapa compara cada zona con el resto de la Comunidad.</p>
      )}
      {def.nota && <p className="nota">{def.nota}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- ranking
function Ranking({
  estado,
  territorios,
  est,
  cambiar,
  seleccion,
  onElegirLugar,
}: {
  estado: EstadoServicio;
  territorios: Territorios;
  est: EstadoDonde;
  cambiar: Donde["cambiar"];
  seleccion: string | null;
  onElegirLugar: (id: string) => void;
}) {
  const esMovil = useMedia("(max-width: 760px)");
  const [abierto, setAbierto] = useState(!esMovil);
  const plazas = estado.metrica === "plazas";
  const orden = est.orden;
  const nombreZona = est.zona ? nombreZonas(territorios, est.zona) : null;
  const variasZonas = codigosZona(est.zona).length > 1;

  const filas = useMemo(() => {
    const todas = filasRanking(estado, territorios, { nivel: est.nivel, zona: est.zona, orden, limite: 10 });
    const valor = (f: FilaRanking) => (orden === "faltan" ? (f.plazas_faltan ?? 0) : orden === "pct" ? f.pct : f.en_deficit);
    return todas.filter((f) => valor(f) > 0);
  }, [estado, territorios, est.nivel, est.zona, orden]);

  const valorFila = (f: FilaRanking) => (f.aproximada ? 0 : orden === "faltan" ? (f.plazas_faltan ?? 0) : orden === "pct" ? f.pct : f.en_deficit);
  const maximo = Math.max(1e-9, ...filas.map(valorFila));
  const titulo = est.nivel === "distrito" ? "Distritos de Madrid" : "Municipios";

  return (
    <details className="bloque bloque--ranking ranking" open={abierto} onToggle={(e) => setAbierto(e.currentTarget.open)}>
      <summary className="rotulo-seccion ranking__resumen">5. Dónde más ayudaría: {titulo.toLowerCase()}</summary>

      <div className="ranking__controles">
        <label className="campo">
          <span className="campo__etiqueta">Zona</span>
          <select value={est.zona ?? ""} onChange={(e) => cambiar({ zona: e.target.value || null })}>
            <option value="">Toda la Comunidad</option>
            {territorios.zonas.map((z) => (
              <option key={z.codigo} value={z.codigo}>
                {z.nombre}
              </option>
            ))}
            {variasZonas && <option value={est.zona ?? ""}>{nombreZona}</option>}
          </select>
        </label>
        <label className="campo">
          <span className="campo__etiqueta">Ordenar por</span>
          <select value={orden} onChange={(e) => cambiar({ orden: e.target.value as OrdenRanking })}>
            {ordenesDisponibles(estado.servicio).map((o) => (
              <option key={o} value={o}>
                {ORDEN_ETIQUETA[o]}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="campo campo--nivel">
          <legend className="campo__etiqueta">Ver</legend>
          <div className="radios radios--chico">
            {(["municipio", "distrito"] as const).map((n) => (
              <label key={n} className="opcion opcion--radio">
                <input type="radio" name="nivel" value={n} checked={est.nivel === n} onChange={() => cambiar({ nivel: n })} />
                <span>{n === "municipio" ? "Municipios" : "Distritos"}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {filas.length === 0 ? (
        <p className="ranking__vacio">
          {est.nivel === "distrito" && est.zona && !codigosZona(est.zona).includes("01")
            ? "Los distritos solo existen en Madrid capital (zona «Municipio de Madrid capital»)."
            : plazas
              ? `Ningún ${est.nivel === "distrito" ? "distrito" : "municipio"}${nombreZona ? ` de ${nombreZona}` : ""} queda por debajo de la referencia: todos están bien cubiertos.`
              : `Nadie está a más de ${radioEs(estado.radio_m)} de ${COMPLEMENTO[estado.servicio]}${nombreZona ? ` en ${nombreZona}` : ""}.`}
        </p>
      ) : (
        <ol className="ranking__lista" aria-label={`${titulo} donde más ayudaría un centro nuevo, ordenados por ${ORDEN_ETIQUETA[orden].toLowerCase()}`}>
          {filas.map((f, k) => (
            <li key={f.lugar}>
              <button type="button" className="fila" aria-pressed={seleccion === f.lugar} onClick={() => onElegirLugar(f.lugar)}>
                <span className="fila__puesto dato" aria-hidden="true">
                  {k + 1}
                </span>
                <span className="fila__nombre">{f.nombre}</span>
                <span className="fila__cifra dato">{textoCifra(f, orden)}</span>
                <span className="fila__detalle dato">{textoDetalle(f, orden, plazas)}</span>
                <span className="fila__barra" aria-hidden="true">
                  <span style={{ width: `${Math.max(3, (100 * valorFila(f)) / maximo)}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {filas.some((f) => f.aproximada) && (
        <p className="nota">«aprox.»: municipios rurales con un centro dentro y secciones censales muy grandes. La distancia se mide desde un punto de cada sección, así que no damos su porcentaje.</p>
      )}
    </details>
  );
}

function textoCifra(f: FilaRanking, orden: OrdenRanking): string {
  if (orden === "faltan") return plazasEs(f.plazas_faltan ?? 0);
  if (f.aproximada) return "aprox.";
  if (orden === "pct") return porcentajeEs(f.pct);
  return `${enteroEs(f.en_deficit)} pers.`;
}

function textoDetalle(f: FilaRanking, orden: OrdenRanking, plazas: boolean): string {
  if (plazas) {
    const ratio = f.ratio != null ? `${decimalEs(f.ratio)} por cada 100 mayores` : "sin dato";
    return orden === "faltan" ? `${ratio} · ${porcentajeEs(f.pct)} con margen de mejora` : `${ratio} · ${plazasEs(f.plazas_faltan ?? 0)} por cubrir`;
  }
  if (f.aproximada) return "tiene centro dentro; cifra no fiable (secciones censales muy grandes)";
  const base = orden === "pct" ? `${enteroEs(f.en_deficit)} de ${enteroEs(f.objetivo)}` : `${porcentajeEs(f.pct)} de ${enteroEs(f.objetivo)}`;
  return base;
}

// ---------------------------------------------------------------- límites y avisos de calidad del dato
function Limites({ estado }: { estado: EstadoServicio }) {
  const c = estado.centros;
  const sin = c.descartados_sin_coordenadas ?? 0;
  const plazasSin = c.plazas_descartadas_sin_coordenadas ?? 0;
  const def = SERVICIOS[estado.servicio];
  // `fuente` viene como «https://… (CC BY 4.0)»: solo se enlaza si empieza por https.
  const urlFuente = /^https:\/\/\S+/.exec(c.fuente ?? "")?.[0] ?? null;
  return (
    <details className="bloque bloque--limites limites">
      <summary className="rotulo-seccion">Cómo se calcula y qué límites tiene</summary>
      <ul className="limites__lista">
        <li>
          {estado.secciones.anio_poblacion === ANIO_PROYECCION
            ? "La población de 2030 es una proyección: el total y la edad de la Comunidad son del INE (escenario central) y el reparto por sección censal es un modelo nuestro, partiendo del censo de 2025. No modela vivienda nueva ni barrios en desarrollo, y los centros son los de hoy."
            : "La población es del censo del INE a 1 de enero de 2025, por sección censal (unas 1.600 personas cada una), colocada en un punto interior de la sección."}
        </li>
        <li>
          {def.metrica === "plazas"
            ? "Las plazas de cada centro se reparten entre los mayores de las secciones a menos del radio elegido (método de las áreas de captación flotantes, 2SFCA). Son plazas autorizadas, no libres, y no se separan las públicas de las privadas."
            : "Las distancias son en línea recta desde el centro de la sección hasta el centro más cercano, no por carretera."}
        </li>
        {sin > 0 && (
          <li>
            {sin} {sin === 1 ? "centro" : "centros"} del registro no tienen coordenadas y no se dibujan ni cuentan
            {plazasSin > 0 ? ` (${enteroEs(plazasSin)} plazas)` : ""}.
          </li>
        )}
        {def.nota && <li>{def.nota}</li>}
        <li>
          Datos:{" "}
          {urlFuente ? (
            <a href={urlFuente} target="_blank" rel="noreferrer">
              {nombreFuente(c.fuente_nombre)}
            </a>
          ) : (
            nombreFuente(c.fuente_nombre)
          )}{" "}
          (CC BY 4.0){c.actualizado_fuente ? `, actualizado el ${fechaEs(c.actualizado_fuente)}` : ""}. Todas las fuentes y límites, en «Metodología y fuentes» (en la cabecera).
        </li>
      </ul>
    </details>
  );
}

// ---------------------------------------------------------------- estados
function EsqueletoPanel() {
  return (
    <div className="panel-servicio" role="status" aria-live="polite" aria-label="Cargando los datos">
      <div className="esq esq--servicios" />
      <div className="esq esq--radios" />
      <EsqueletoCifra />
      <p className="nota">Cargando los datos de la Comunidad…</p>
    </div>
  );
}

function EsqueletoCifra() {
  return (
    <div className="bloque bloque--cifra" role="status" aria-live="polite">
      <div className="esq esq--cifra" />
      <p className="nota">Calculando…</p>
    </div>
  );
}

function ErrorPanel({ titulo, detalle, onReintentar }: { titulo: string; detalle?: string; onReintentar?: () => void }) {
  return (
    <div className="bloque error-panel" role="alert">
      <h2>{titulo}</h2>
      <p>Comprueba tu conexión e inténtalo de nuevo.</p>
      {detalle && <p className="error-panel__detalle">{detalle}</p>}
      {onReintentar && (
        <button type="button" className="boton" onClick={onReintentar}>
          Reintentar
        </button>
      )}
    </div>
  );
}
