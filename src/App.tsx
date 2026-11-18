import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaddingOptions } from "maplibre-gl";
import "./App.css";
import { EsqueletoMapa } from "./componentes/EsqueletoMapa";
import { Leyenda } from "./componentes/Leyenda";
import type { MapaRef } from "./componentes/Mapa";
import { PanelLugar } from "./componentes/PanelLugar";
import { BandaHistorica } from "./componentes/BandaHistorica";
import { Casos } from "./componentes/Casos";
import { Colegios, ResumenMapa } from "./componentes/Colegios";
import { ID_PANEL_VISTA, idPestana, Pestanas } from "./componentes/Pestanas";
import { SiAquiNo } from "./componentes/SiAquiNo";
import { Respuesta } from "./componentes/Respuesta";
import { SelloCapas, SelloCapasEsqueleto } from "./componentes/SelloCapas";
import {
  cargarEstado,
  cargarPronostico,
  lugares,
  pronosticoAntiguo,
  sellosDeCapas,
  vientoVigente,
  type ResultadoCarga,
  type ResultadoPronostico,
} from "./lib/datos";
import { busquedaConFecha, cargarDia, cargarIndice, fechaDeLaUrl, fechaEnIndice, type DiaCargado, type DiaHistorico } from "./lib/dias";
import type { Caso } from "./lib/casos";
import { evaluarCentro, indexarCentros, PERFIL_COLEGIO, resumirColegios, type Centro } from "./lib/colegios";
import { evaluarLugar, type EvaluacionLugar, type FuenteDato } from "./lib/evaluar";
import { construirFicha } from "./lib/ficha";
import { buscarVecinos } from "./lib/vecinos";
import { busquedaConVista, centroDeLaUrl, vistaDeLaUrl, type Vista } from "./lib/vista";
import { calcularFranja, medidasDelPerfil, variablesConMedidas, variablesDelPerfil, zonaDe, type Perfil } from "./lib/franja";
import { fechaHoraLarga, formatearUltimoDato, horaCorta } from "./lib/formato";
import { guardarPerfil, leerPerfil } from "./lib/perfil";
import type { CapasVisibles, Municipio, NombreCapa } from "./lib/tipos";
import { useMedia } from "./lib/useMedia";

// MapLibre pesa: va en su propio trozo y se empieza a descargar a la vez que los datos.
const cargarMapa = () => import("./componentes/Mapa");
const Mapa = lazy(cargarMapa);
void cargarMapa();

type Carga =
  | { fase: "cargando" }
  | ({ fase: "lista" } & ResultadoCarga)
  | { fase: "error"; mensaje: string };

type CargaPronostico =
  | { fase: "cargando" }
  | ({ fase: "lista" } & ResultadoPronostico)
  | { fase: "error"; mensaje: string };

type CargaDia = { fase: "cargando" } | { fase: "lista"; fecha: string; dia: DiaCargado } | { fase: "error"; fecha: string; mensaje: string };

const REFRESCO_MS = 10 * 60_000;
const parametros = new URLSearchParams(window.location.search);
/** Solo en desarrollo: `?estado=/ruta.json` permite probar con otro JSON (p. ej. un día con niveles altos). */
const urlDePrueba = import.meta.env.DEV ? (parametros.get("estado") ?? undefined) : undefined;
/** Solo en desarrollo: `?pronostico=/ruta.json` y `?ahora=2026-11-16T09:00:00+01:00` para probar otras situaciones. */
const urlPronosticoDePrueba = import.meta.env.DEV ? (parametros.get("pronostico") ?? undefined) : undefined;
const ahoraForzado = import.meta.env.DEV && parametros.get("ahora") ? new Date(parametros.get("ahora")!) : null;
const baseForzada = parametros.get("base") === "raster" ? "raster" : undefined;

/** Marcador del mapa que representa a un municipio (Madrid capital no tiene estación propia). */
/** Id del lugar que se pinta en el mapa y del que se enseña el detalle. */
const idMarcador = (m: Municipio) => (m.cobertura_aire === "lejana" ? m.id : m.estacion);

/** Municipio al que corresponde un marcador pulsado (estación, captador o la propia capital). */
function municipioDeMarcador(id: string): Municipio | undefined {
  const candidatos = lugares.municipios.filter((m) => m.id === id || (m.cobertura_aire !== "lejana" && m.estacion === id) || m.captador === id);
  const campo = id.startsWith("cap:") ? "dist_captador_km" : "dist_estacion_km";
  return candidatos.sort((a, b) => (a[campo] ?? 99) - (b[campo] ?? 99))[0];
}

export default function App() {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [cargaPron, setCargaPron] = useState<CargaPronostico>({ fase: "cargando" });
  const [capas, setCapas] = useState<CapasVisibles>({ aire: true, polen: true, viento: true });
  const [perfil, setPerfil] = useState<Perfil>(() => leerPerfil(lugares));
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => ahoraForzado ?? new Date());
  // Día histórico: `fechaPedida` sale de la URL; solo vale si está en el índice (si no, se ve hoy).
  const [fechaPedida, setFechaPedida] = useState<string | null>(() => fechaDeLaUrl(window.location.search));
  const [indice, setIndice] = useState<DiaHistorico[] | null>(null);
  const [cargaDia, setCargaDia] = useState<CargaDia>({ fase: "cargando" });
  const [vista, setVista] = useState<Vista>(() => vistaDeLaUrl(window.location.search));
  const [centroId, setCentroId] = useState<string | null>(() => centroDeLaUrl(window.location.search));
  const [tarde, setTarde] = useState(false);
  const [centros, setCentros] = useState<Centro[] | null>(null);
  const [errorCentros, setErrorCentros] = useState<string | null>(null);
  const mapaRef = useRef<MapaRef>(null);
  const fechaActual = useRef<string | null>(null);
  const esMovil = useMedia("(max-width: 760px)");

  const municipio = useMemo(
    () => lugares.municipios.find((m) => m.id === perfil.municipio) ?? lugares.municipios[0]!,
    [perfil.municipio],
  );

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarga({ fase: "cargando" });
    try {
      const resultado = await cargarEstado({ urlRed: urlDePrueba });
      setCarga((anterior) => {
        // Un refresco fallido no cambia datos de la red por la copia de respaldo, que es más vieja.
        if (silencioso && anterior.fase === "lista" && anterior.origen === "red" && resultado.origen === "respaldo") {
          return anterior;
        }
        return { fase: "lista", ...resultado };
      });
    } catch (e) {
      if (!silencioso) setCarga({ fase: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  const cargarPron = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargaPron({ fase: "cargando" });
    try {
      const resultado = await cargarPronostico({ urlRed: urlPronosticoDePrueba, ahora: ahoraForzado ?? new Date() });
      setCargaPron((anterior) => {
        if (silencioso && anterior.fase === "lista" && anterior.origen === "red" && resultado.origen === "respaldo") return anterior;
        return { fase: "lista", ...resultado };
      });
    } catch (e) {
      if (!silencioso) setCargaPron({ fase: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void cargar();
    void cargarPron();
    const refresco = setInterval(() => {
      if (fechaActual.current) return;
      void cargar(true);
      void cargarPron(true);
    }, REFRESCO_MS);
    const reloj = ahoraForzado ? undefined : setInterval(() => setAhora(new Date()), 60_000);
    return () => {
      clearInterval(refresco);
      clearInterval(reloj);
    };
  }, [cargar, cargarPron]);

  useEffect(() => guardarPerfil(perfil), [perfil]);

  useEffect(() => {
    cargarIndice().then(setIndice, () => setIndice([]));
    const alRetroceder = () => {
      setFechaPedida(fechaDeLaUrl(window.location.search));
      setVista(vistaDeLaUrl(window.location.search));
      setCentroId(centroDeLaUrl(window.location.search));
    };
    window.addEventListener("popstate", alRetroceder);
    return () => window.removeEventListener("popstate", alRetroceder);
  }, []);

  const esperandoIndice = fechaPedida !== null && indice === null;
  const fecha = indice ? fechaEnIndice(fechaPedida, indice) : null;
  const historico = fecha !== null;
  fechaActual.current = fecha;
  const diaIndice = indice?.find((d) => d.fecha === fecha);

  // Una fecha que no está en el índice se quita de la URL y se ve hoy.
  useEffect(() => {
    if (indice && fechaPedida && !fecha) {
      window.history.replaceState(null, "", `${window.location.pathname}${busquedaConFecha(window.location.search, null)}`);
      setFechaPedida(null);
    }
  }, [indice, fechaPedida, fecha]);

  const cargarElDia = useCallback((f: string) => {
    setCargaDia({ fase: "cargando" });
    cargarDia(f).then(
      (dia) => setCargaDia({ fase: "lista", fecha: f, dia }),
      (e) => setCargaDia({ fase: "error", fecha: f, mensaje: e instanceof Error ? e.message : String(e) }),
    );
  }, []);
  useEffect(() => {
    if (fecha) cargarElDia(fecha);
  }, [fecha, cargarElDia]);

  const elegirFecha = useCallback((f: string | null) => {
    window.history.pushState(null, "", `${window.location.pathname}${busquedaConFecha(window.location.search, f)}`);
    setFechaPedida(f);
    document.getElementById("titular")?.scrollIntoView?.({ block: "nearest" });
  }, []);

  const diaListo = cargaDia.fase === "lista" && cargaDia.fecha === fecha ? cargaDia.dia : null;
  const diaError = cargaDia.fase === "error" && cargaDia.fecha === fecha ? cargaDia.mensaje : null;
  const estado = historico ? (diaListo?.estado ?? null) : esperandoIndice ? null : carga.fase === "lista" ? carga.estado : null;
  const origen = !historico && carga.fase === "lista" ? carga.origen : "red";
  // En modo histórico el reloj es la foto de las 14:00 de ese día (`fecha_referencia`), no el «ahora» real.
  const ahoraVista = historico && estado ? new Date(estado.fecha_referencia) : ahora;
  const fase = historico ? (diaListo ? "lista" : diaError ? "error" : "cargando") : esperandoIndice ? "cargando" : carga.fase;

  const sellos = useMemo(() => (estado ? sellosDeCapas(estado, origen, ahoraVista) : null), [estado, origen, ahoraVista]);
  const vigente = useMemo(() => (estado ? vientoVigente(estado, origen, ahoraVista) : false), [estado, origen, ahoraVista]);
  const fichaCompleta = useMemo(
    () => (estado && detalleId ? construirFicha(detalleId, estado, lugares) : null),
    [estado, detalleId],
  );
  const ficha = vista === "para-ti" ? fichaCompleta : null;

  // --- la respuesta personal ---
  const pronostico = historico ? (diaListo?.pronostico ?? null) : esperandoIndice ? null : cargaPron.fase === "lista" ? cargaPron.pronostico : null;
  const fasePron = historico ? fase : esperandoIndice ? "cargando" : cargaPron.fase;
  const zona = pronostico ? zonaDe(pronostico, municipio.estacion) : undefined;
  const vars = useMemo(() => (pronostico && zona ? variablesDelPerfil(perfil, zona, pronostico.sin_pronostico) : null), [pronostico, zona, perfil]);
  // Lo medido (polen del día y aire de la hora de referencia) manda sobre la previsión: gana el nivel más alto.
  const medidas = useMemo(
    () => (estado ? medidasDelPerfil(perfil, estado, municipio, lugares, ahoraVista) : []),
    [estado, perfil, municipio, ahoraVista],
  );
  const resultado = useMemo(
    () =>
      pronostico && zona && vars
        ? calcularFranja({ horas: pronostico.horas, zona, variables: variablesConMedidas(vars.variables, medidas), ahora: ahoraVista, medidas })
        : null,
    [pronostico, zona, vars, ahoraVista, medidas],
  );
  // Un polen sin previsión que sí se ha medido el día de referencia ya está cubierto: no se avisa.
  const sinPrevision = useMemo(() => {
    return (vars?.sinPrevision ?? []).filter((t) => !medidas.some((m) => m.variable === `polen_${t}` && m.dia && resultado?.horas.some((h) => h.fecha === m.dia && !h.pasada)));
  }, [vars, medidas, resultado]);

  let avisoPronostico: string | null = null;
  if (!historico && !esperandoIndice && cargaPron.fase === "lista") {
    const gen = fechaHoraLarga(cargaPron.pronostico.generado);
    if (!zona) avisoPronostico = `No hay previsión para la zona de ${municipio.nombre}.`;
    else if (pronosticoAntiguo(cargaPron.pronostico, ahora)) {
      avisoPronostico =
        cargaPron.origen === "respaldo"
          ? `No se ha podido leer la previsión de hoy: se usa una copia del ${gen}. Puede no ser fiable.`
          : `La previsión tiene más de 3 horas (calculada el ${gen}). Puede no ser fiable.`;
    }
  }

  const aireMedido = estado ? (historico ? horaCorta(estado.capas.aire.ultimo_dato) : formatearUltimoDato(estado.capas.aire.ultimo_dato, ahora)) : null;
  const marcadorSeleccionado = idMarcador(municipio);

  // --- «Si aquí no, prueba en…» ---
  const vecinos = useMemo(
    () =>
      vista === "para-ti" && estado && pronostico && resultado
        ? buscarVecinos(perfil, municipio, resultado, { pronostico, estado, lugares, ahora: ahoraVista })
        : null,
    [vista, estado, pronostico, resultado, perfil, municipio, ahoraVista],
  );

  // --- colegios ---
  const cargarCentros = useCallback(() => {
    setErrorCentros(null);
    // El fichero pesa 322 kB: va en su propio trozo y solo se baja al abrir la pestaña.
    import("../datos-estaticos/colegios.json").then(
      (m) => setCentros((m.default as unknown as { centros: Centro[] }).centros),
      (e) => setErrorCentros(e instanceof Error ? e.message : String(e)),
    );
  }, []);
  useEffect(() => {
    if (vista === "colegios" && !centros && !errorCentros) cargarCentros();
  }, [vista, centros, errorCentros, cargarCentros]);

  const indiceCentros = useMemo(() => (centros ? indexarCentros(centros, lugares.municipios) : null), [centros]);
  // Una evaluación por estación y captador (no por centro): son unas 200 combinaciones para 1.910 centros.
  const evaluador = useMemo(() => {
    if (!estado || !pronostico) return null;
    const cache = new Map<string, EvaluacionLugar | null>();
    return (c: FuenteDato | Centro) => {
      const fuente: FuenteDato = "ea" in c ? { estacion: c.ea, captador: c.ca } : c;
      const clave = `${fuente.estacion}|${fuente.captador ?? ""}`;
      if (!cache.has(clave)) cache.set(clave, evaluarLugar(PERFIL_COLEGIO, fuente, pronostico, estado, lugares, ahoraVista));
      return cache.get(clave)!;
    };
  }, [estado, pronostico, ahoraVista]);
  const opcionesColegios = useMemo(() => ({ ahora: ahoraVista, historico, tarde }), [ahoraVista, historico, tarde]);
  const resumenColegios = useMemo(
    () => (vista === "colegios" && centros && evaluador ? resumirColegios(centros, evaluador, opcionesColegios) : null),
    [vista, centros, evaluador, opcionesColegios],
  );
  const centro = useMemo(() => (centros && centroId ? (centros.find((c) => c.c === centroId) ?? null) : null), [centros, centroId]);
  const evCentro = centro && evaluador ? evaluador(centro) : null;
  const evaluacionCentro = useMemo(() => (centro && evCentro ? evaluarCentro(centro, evCentro, opcionesColegios) : null), [centro, evCentro, opcionesColegios]);
  const puntosColegios = useMemo(
    () => (resumenColegios && centros ? centros.map((c) => ({ c: c.c, la: c.la, lo: c.lo, nivel: resumenColegios.niveles.get(c.c) ?? ("sin_dato" as const) })) : []),
    [resumenColegios, centros],
  );
  const estadoColegios: "cargando" | "lista" | "error" = fasePron === "error" || fase === "error" ? "error" : estado && pronostico ? "lista" : "cargando";

  const cambiarUrl = useCallback((busqueda: (actual: string) => string) => {
    window.history.pushState(null, "", `${window.location.pathname}${busqueda(window.location.search)}`);
  }, []);
  const elegirVista = useCallback(
    (v: Vista) => {
      cambiarUrl((b) => busquedaConVista(b, v, v === "colegios" ? centroId : null));
      setVista(v);
    },
    [cambiarUrl, centroId],
  );
  const elegirCentro = useCallback(
    (codigo: string) => {
      cambiarUrl((b) => busquedaConVista(b, "colegios", codigo));
      setVista("colegios");
      setCentroId(codigo);
      if (esMovil) requestAnimationFrame(() => document.getElementById("titular")?.scrollIntoView?.({ block: "start", behavior: "smooth" }));
    },
    [cambiarUrl, esMovil],
  );
  // La cámara va al centro elegido.
  useEffect(() => {
    if (vista === "colegios" && centro) mapaRef.current?.volarA(centro.la, centro.lo, 13.5);
  }, [vista, centro]);

  /** «Ver ese día»: abre «Para ti» con la fecha, el municipio y el perfil del caso. */
  const verCaso = useCallback(
    (c: Caso) => {
      setPerfil((p) => ({ municipio: c.municipio.id, afecta: c.def.perfil.afecta, polenes: c.def.perfil.polenes.length > 0 ? [...c.def.perfil.polenes] : p.polenes }));
      cambiarUrl((b) => busquedaConVista(busquedaConFecha(b, c.fecha), "para-ti"));
      setFechaPedida(c.fecha);
      setVista("para-ti");
      requestAnimationFrame(() => document.getElementById("titular")?.scrollIntoView?.({ block: "nearest" }));
    },
    [cambiarUrl],
  );
  const elegirVecino = useCallback((m: Municipio) => {
    setPerfil((p) => ({ ...p, municipio: m.id }));
    requestAnimationFrame(() => document.getElementById("titular")?.scrollIntoView?.({ block: "nearest" }));
  }, []);

  // Hueco que tapan los paneles, para que la cámara centre en la parte libre del mapa.
  const margen = useMemo<PaddingOptions>(
    () => (esMovil ? { top: 96, right: 18, left: 18, bottom: 70 } : { top: 24, bottom: 84, left: 24, right: ficha ? 440 : 24 }),
    [esMovil, ficha],
  );

  // Al cambiar de municipio el mapa vuela allí. También al montarse el mapa (carga en diferido).
  const municipioRef = useRef(municipio);
  municipioRef.current = municipio;
  const alMontarMapa = useCallback((m: MapaRef | null) => {
    mapaRef.current = m;
    if (m) m.volarA(municipioRef.current.lat, municipioRef.current.lon);
  }, []);
  const idMunicipio = municipio.id;
  useEffect(() => {
    if (vista !== "colegios") mapaRef.current?.volarA(municipioRef.current.lat, municipioRef.current.lon);
  }, [idMunicipio, margen, vista]);

  // Si el detalle está abierto, sigue al municipio.
  useEffect(() => {
    setDetalleId((d) => (d ? idMarcador(municipioRef.current) : d));
  }, [idMunicipio]);

  const elegirMarcador = useCallback((id: string) => {
    const m = municipioDeMarcador(id);
    if (m) setPerfil((p) => ({ ...p, municipio: m.id }));
  }, []);
  const cambiarCapa = useCallback((capa: NombreCapa, visible: boolean) => {
    setCapas((c) => ({ ...c, [capa]: visible }));
  }, []);
  const cerrarPanel = useCallback(() => {
    setDetalleId(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".respuesta__detalle")?.focus());
  }, []);

  const estadoRespuesta = fasePron;

  return (
    <div className={`app${ficha ? " app--con-panel" : ""}`}>
      <a className="saltar" href="#mapa">
        Saltar al mapa
      </a>

      <main className="columna">
        {fecha && <BandaHistorica fecha={fecha} dia={diaIndice} onVolver={() => elegirFecha(null)} />}
        <header className="marca">
          <h1 className="marca__nombre">¿Salimos?</h1>
          <p className="marca__edicion">Comunidad de Madrid</p>
          <p className="marca__lema">No te enseñamos datos: te decimos cuándo salir.</p>
          <p className="marca__intro">
            Con el aire, el polen y el viento de la Comunidad de Madrid, que se actualizan cada hora, te decimos a qué hora
            puedes salir si tienes asma o alergia al polen, y si el recreo y la educación física de un colegio pueden ser al
            aire libre.
          </p>
          <details className="como">
            <summary className="como__titulo">¿Cómo funciona?</summary>
            <ol className="como__pasos">
              <li>
                <strong>Dinos qué te afecta y dónde:</strong> asma o EPOC, alergia al polen o las dos, y tu municipio. Si
                miras por un colegio, basta con buscar el centro.
              </li>
              <li>
                <strong>Cruzamos tres fuentes:</strong> el aire que mide cada hora la red de la Comunidad de Madrid, el
                polen de sus captadores y la previsión de aire, polen y viento para las próximas 48 h.
              </li>
              <li>
                <strong>Te respondemos:</strong> en «Para ti», si hoy es buen día, la mejor hora para salir, qué evitar y,
                si aquí no, dónde probar. En «Colegios», si el recreo y la educación física pueden ser al aire libre. En
                «Casos», qué habría dicho en tres días señalados.
              </li>
            </ol>
            <p className="como__nota">
              Los niveles siguen umbrales oficiales (BOE y red PALINOCAM) y clínicos (Sociedad Española de Alergología).
              Datos del{" "}
              <a href="https://datos.comunidad.madrid/catalogo/" target="_blank" rel="noreferrer">
                portal de datos abiertos de la Comunidad de Madrid
              </a>{" "}
              y Open-Meteo. Es orientativo: no sustituye el consejo médico.
            </p>
          </details>
        </header>

        <Pestanas vista={vista} onElegir={elegirVista} />

        <div role="tabpanel" id={ID_PANEL_VISTA} aria-labelledby={idPestana(vista)}>

          {vista === "para-ti" && (
            <Respuesta
              fechaHistorica={fecha}
              perfil={perfil}
              municipios={lugares.municipios}
              municipio={municipio}
              onPerfil={setPerfil}
              ahora={ahoraVista}
              estado={estadoRespuesta}
              resultado={resultado}
              sinPrevision={sinPrevision}
              avisoPronostico={avisoPronostico}
              generadoPronostico={historico ? null : (pronostico?.generado ?? null)}
              origenPronostico={!historico && cargaPron.fase === "lista" ? cargaPron.origen : "red"}
              aireMedido={aireMedido}
              avisoEstado={!historico && carga.fase === "lista" ? { origen: carga.origen, generado: carga.estado.generado } : null}
              onReintentar={() => {
                if (fecha) cargarElDia(fecha);
                else {
                  void cargar();
                  void cargarPron();
                }
              }}
              onDetalle={() => setDetalleId(marcadorSeleccionado)}
              alternativas={vecinos && <SiAquiNo vecinos={vecinos} dia={historico ? "historico" : resultado?.dia === "manana" ? "manana" : "hoy"} onElegir={elegirVecino} />}
            />
          )}

          {vista === "colegios" && (
            <Colegios
              centros={centros}
              errorCentros={errorCentros}
              indice={indiceCentros}
              centro={centro}
              estadoDatos={estadoColegios}
              ev={evCentro}
              evaluacion={evaluacionCentro}
              resumen={resumenColegios}
              lugares={lugares}
              ahora={ahoraVista}
              historico={historico}
              tarde={tarde}
              onTarde={setTarde}
              onElegir={elegirCentro}
              onReintentar={() => {
                if (errorCentros) cargarCentros();
                if (fecha) cargarElDia(fecha);
                else {
                  void cargar();
                  void cargarPron();
                }
              }}
            />
          )}

          {vista === "casos" && <Casos onVer={verCaso} />}
        </div>
      </main>

      <div className="zona-mapa">
        <section id="mapa" className="lienzo" tabIndex={-1} aria-label={vista === "colegios" ? "Mapa de colegios: cada punto es un centro y su color, el nivel durante el recreo" : `Mapa de riesgo respiratorio, centrado en ${municipio.nombre}`}>
          {estado ? (
            <Suspense fallback={<EsqueletoMapa />}>
              <Mapa
                ref={alMontarMapa}
                estado={estado}
                lugares={lugares}
                capas={capas}
                vientoVigente={vigente}
                seleccionado={marcadorSeleccionado}
                onSeleccionar={elegirMarcador}
                margen={margen}
                forzarBase={baseForzada}
                perfil={perfil}
                modo={vista === "colegios" ? "colegios" : "para-ti"}
                colegios={puntosColegios}
                colegioSeleccionado={vista === "colegios" ? centroId : null}
                onColegio={elegirCentro}
              />
            </Suspense>
          ) : historico && diaError ? (
            <div className="fallo-datos" role="alert">
              <div className="tarjeta fallo-datos__caja">
                <h2>No se ha podido cargar ese día</h2>
                <p className="fallo-datos__detalle">{diaError}</p>
                <button type="button" className="boton" onClick={() => elegirFecha(null)}>
                  Volver a hoy
                </button>
              </div>
            </div>
          ) : !historico && carga.fase === "error" ? (
            <div className="fallo-datos" role="alert">
              <div className="tarjeta fallo-datos__caja">
                <h2>No se han podido cargar las mediciones</h2>
                <p>El mapa necesita la última actualización o la copia de respaldo, y ninguna ha respondido.</p>
                <p className="fallo-datos__detalle">{carga.mensaje}</p>
                <button type="button" className="boton" onClick={() => void cargar()}>
                  Reintentar
                </button>
              </div>
            </div>
          ) : (
            <EsqueletoMapa texto="Cargando el mapa…" />
          )}
        </section>

        <div className="superior">
          {vista === "colegios" ? (
            <ResumenMapa resumen={resumenColegios} />
          ) : sellos ? (
            <SelloCapas sellos={sellos} visibles={capas} onCambiar={cambiarCapa} vientoVigente={vigente} ahora={ahoraVista} historico={historico} />
          ) : (
            fase === "cargando" && <SelloCapasEsqueleto />
          )}
        </div>

        {ficha && <PanelLugar ficha={ficha} ahora={ahoraVista} historico={historico} onCerrar={cerrarPanel} onIrA={setDetalleId} />}

        <div className="pie">
          <Leyenda perfil={perfil} modo={vista === "colegios" ? "colegios" : "para-ti"} />
        </div>

        {/* Hueco reservado para el chat plegable (tarea 10). */}
        <div className="hueco-chat" data-hueco="chat" />
      </div>
    </div>
  );
}
