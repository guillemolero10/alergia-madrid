import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaddingOptions } from "maplibre-gl";
import "./App.css";
import { EsqueletoMapa } from "./componentes/EsqueletoMapa";
import type { MapaRef } from "./componentes/MapaDonde";
import { ID_PANEL_VISTA, idPestana, Pestanas } from "./componentes/Pestanas";
import { PanelServicio } from "./componentes/PanelServicio";
import { PanelMunicipio } from "./componentes/PanelMunicipio";
import { PanelAgente } from "./componentes/PanelAgente";
import type { Destino } from "./lib/donde/accionesAgente";
import { useAgente } from "./lib/useAgente";
import { busquedaConLugar, existeLugar, guardarLugar, leerLugarGuardado, lugarDeLaUrl } from "./lib/donde/lugarUrl";
import { bboxLugar, bboxZona, enteroEs, invitacionMapa } from "./lib/donde/panelDonde";
import { SERVICIOS } from "./lib/donde/servicios";
import { ANIO_HOY, ANIO_PROYECCION, type AnioDonde } from "./lib/donde/proyeccion";
import type { ServicioId } from "./lib/donde/tipos";
import { busquedaConVista, vistaDeLaUrl, type Vista } from "./lib/vista";
import { Metodologia } from "./componentes/Metodologia";
import { EmpiezaAqui } from "./componentes/EmpiezaAqui";
import { referenciaPorDefecto } from "./lib/donde/urlDonde";
import { useAliasLugares } from "./lib/useAliasLugares";
import { useDonde } from "./lib/useDonde";
import { useFicha } from "./lib/useFicha";
import { useTuDecides } from "./lib/useTuDecides";
import { useMedia } from "./lib/useMedia";

// MapLibre pesa: va en su propio trozo y se empieza a descargar a la vez que la página.
const cargarMapa = () => import("./componentes/MapaDonde");
const Mapa = lazy(cargarMapa);
void cargarMapa();

/** Punto de la escena «Una residencia en Pinto»: la misma de las capturas y del pitch (40,2420, -3,7000; residencia de 94 plazas). */
const ESCENA_PINTO = { lat: 40.242, lon: -3.7, plazas: 94 } as const;

/** [oeste, sur, este, norte] de la Comunidad de Madrid. */
const BBOX_COMUNIDAD: [number, number, number, number] = [-4.58, 39.88, -3.05, 41.17];

const baseForzada = new URLSearchParams(window.location.search).get("base") === "raster" ? "raster" : undefined;

export default function App() {
  const [vista, setVista] = useState<Vista>(() => vistaDeLaUrl(window.location.search));
  const mapaRef = useRef<MapaRef>(null);
  const esMovil = useMedia("(max-width: 760px)");
  /** Hasta 1100 px el mapa es estrecho: el agente se abre como hoja inferior y no como columna sobre él. */
  const hojaInferior = useMedia("(max-width: 1100px)");
  const [sinMapa, setSinMapa] = useState(false);
  const [mapaALaVista, setMapaALaVista] = useState(false);
  const donde = useDonde();
  const { est, estado } = donde;
  const tuDecides = useTuDecides(donde);
  const territorios = donde.base.fase === "listo" ? donde.base.valor.territorios : null;
  const secciones = donde.base.fase === "listo" ? donde.base.valor.secciones : null;
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [mapaMontado, setMapaMontado] = useState(false);
  const alias = useAliasLugares();
  const [lugarId, setLugarId] = useState<string | null>(() => lugarDeLaUrl(window.location.search));
  const [servicioMapa, setServicioMapa] = useState<ServicioId>("centro_salud");
  const conservarSeleccion = useRef(false);
  const lugarValido = territorios && lugarId && existeLugar(territorios, lugarId) ? lugarId : null;
  // «Mi municipio» es siempre de hoy: no usa la proyección a 2030 aunque el simulador la tenga elegida.
  const ficha = useFicha(donde.baseHoy.fase === "listo" ? donde.baseHoy.valor : null, est.referencia, vista === "municipio");
  const [agenteAbierto, setAgenteAbierto] = useState(() => new URLSearchParams(window.location.search).get("agente") === "1");

  useEffect(() => {
    const alRetroceder = () => {
      setVista(vistaDeLaUrl(window.location.search));
      setLugarId(lugarDeLaUrl(window.location.search));
    };
    window.addEventListener("popstate", alRetroceder);
    return () => window.removeEventListener("popstate", alRetroceder);
  }, []);

  const elegirVista = useCallback((v: Vista) => {
    window.history.pushState(null, "", `${window.location.pathname}${busquedaConVista(window.location.search, v)}`);
    setVista(v);
  }, []);

  // En el móvil el mapa está debajo del panel: lleva la vista hasta él.
  const irAlMapa = useCallback(() => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("mapa")?.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "start" });
  }, []);

  // ---- «Mi municipio» ----
  /** Abre la ficha de un municipio o distrito: cambia a la pestaña, escribe `?lugar=` y lo recuerda para la próxima visita. */
  const abrirLugar = useCallback((id: string) => {
    const busqueda = busquedaConVista(busquedaConLugar(window.location.search, id), "municipio");
    window.history.pushState(null, "", `${window.location.pathname}${busqueda}`);
    setVista("municipio");
    setLugarId(id);
    guardarLugar(id);
  }, []);

  // Sin `?lugar=`, la ficha abre con el último lugar que se miró en este navegador.
  useEffect(() => {
    if (vista !== "municipio" || !territorios || lugarDeLaUrl(window.location.search) !== null) return;
    const guardado = leerLugarGuardado(territorios);
    if (!guardado) return;
    setLugarId(guardado);
    window.history.replaceState(null, "", `${window.location.pathname}${busquedaConLugar(window.location.search, guardado)}`);
  }, [vista, territorios]);

  // El mapa de la ficha encuadra el lugar y lo recuerda.
  useEffect(() => {
    if (vista !== "municipio") return;
    setSeleccion(lugarValido);
    if (!lugarValido || !territorios || !mapaMontado) return;
    const b = bboxLugar(territorios, lugarValido);
    if (b) mapaRef.current?.encuadrar(b);
    guardarLugar(lugarValido);
  }, [vista, lugarValido, territorios, mapaMontado]);

  // Al salir de la ficha, el contorno resaltado deja de valer (salvo que venga de «Ver en el simulador»).
  useEffect(() => {
    if (vista !== "donde") return;
    if (conservarSeleccion.current) conservarSeleccion.current = false;
    else setSeleccion(null);
  }, [vista]);

  /** «Ver en el simulador»: abre el apartado 1 con ese servicio, el nivel del lugar y el mapa encuadrado en él. */
  const verEnSimulador = useCallback(
    (servicio: ServicioId, lugar: string) => {
      conservarSeleccion.current = true;
      elegirVista("donde");
      const d = vivo.current.donde;
      if (d.est.servicio !== servicio) d.elegirServicio(servicio);
      // La ficha es de hoy: el simulador se abre con la población de hoy, no con la proyección que hubiera elegida.
      d.cambiar({ nivel: lugar.startsWith("dis:") ? "distrito" : "municipio", anio: ANIO_HOY });
      setSeleccion(lugar);
      const t = vivo.current.territorios;
      const b = t ? bboxLugar(t, lugar) : null;
      if (b) mapaRef.current?.encuadrar(b);
      // El panel que se acaba de ir tenía el foco: pasa a la pestaña, y la vista vuelve arriba.
      requestAnimationFrame(() => {
        document.getElementById(idPestana("donde"))?.focus({ preventScroll: true });
        document.getElementById(ID_PANEL_VISTA)?.scrollIntoView({ block: "start" });
      });
    },
    [elegirVista],
  );

  // Una fila del ranking: se resalta el contorno y el mapa encuadra el municipio o distrito.
  const elegirLugar = useCallback(
    (id: string) => {
      const b = territorios ? bboxLugar(territorios, id) : null;
      if (!b) return;
      setSeleccion(id);
      mapaRef.current?.encuadrar(b);
      if (esMovil) {
        const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.getElementById("mapa")?.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "start" });
      }
    },
    [territorios, esMovil],
  );

  // El resaltado deja de valer si cambia el nivel (municipios <-> distritos) o el servicio no tiene ese lugar.
  useEffect(() => {
    setSeleccion((s) => (s && (est.nivel === "distrito") !== s.startsWith("dis:") ? null : s));
  }, [est.nivel]);

  // Al elegir una zona (o volver a «toda la Comunidad»), el mapa la encuadra. Al abrir sin zona, no hace nada.
  const zonaAnterior = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (!territorios || !mapaMontado) return;
    if (zonaAnterior.current === est.zona) return;
    const primera = zonaAnterior.current === undefined;
    zonaAnterior.current = est.zona;
    if (primera && !est.zona) return;
    const b = est.zona ? bboxZona(territorios, est.zona) : BBOX_COMUNIDAD;
    if (b) mapaRef.current?.encuadrar(b);
  }, [est.zona, territorios, mapaMontado]);

  // Lo que «Tú decides» le pide al mapa.
  const accionesMapa = useMemo(
    () => ({
      centroDelMapa: () => mapaRef.current?.centro() ?? null,
      volarA: (lat: number, lon: number) => {
        mapaRef.current?.volarA(lat, lon, 11.5);
        if (window.matchMedia("(max-width: 760px)").matches) irAlMapa();
      },
      irAlMapa,
      sinMapa,
    }),
    [irAlMapa, sinMapa],
  );

  // ---- «Empieza aquí»: escenas de un clic ----
  /** Tras elegir «Pinto» hay que pedir el modelo cuando ya estén el servicio y los datos: se hace en un efecto, no en el clic. */
  const [modeloPendiente, setModeloPendiente] = useState(false);
  useEffect(() => {
    if (!modeloPendiente || est.servicio !== "residencia" || !est.sim || !estado || estado.servicio !== "residencia") return;
    setModeloPendiente(false);
    tuDecides.pedirModelo();
  }, [modeloPendiente, est.servicio, est.sim, estado, tuDecides]);

  /** Lleva la vista al bloque del resultado cuando ya existe (la proyección o el modelo pueden tardar un poco): en el panel (escritorio) o en la página (móvil). */
  const mostrarBloque = useCallback((selector: string) => {
    let intentos = 0;
    const reloj = window.setInterval(() => {
      const el = document.querySelector(selector);
      if (!el && ++intentos < 80) return;
      window.clearInterval(reloj);
      const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el?.scrollIntoView({ behavior: sinMovimiento ? "auto" : "smooth", block: "start" });
    }, 100);
  }, []);

  const elegirEscena = useCallback(
    (escena: "pinto" | "2030" | "municipio") => {
      if (escena === "municipio") {
        elegirVista("municipio");
        window.setTimeout(() => document.querySelector<HTMLInputElement>(".buscador__entrada")?.focus(), 120);
        return;
      }
      // El lugar de una ficha anterior no pinta nada aquí: fuera de la URL.
      const q = new URLSearchParams(window.location.search);
      if (q.has("lugar")) {
        q.delete("lugar");
        window.history.replaceState(null, "", `${window.location.pathname}${q.toString() ? `?${q}` : ""}`);
      }
      const d = vivo.current.donde;
      const comun = { servicio: "residencia" as const, radio_m: SERVICIOS.residencia.radioDefecto, zona: null, nivel: "municipio" as const, orden: "faltan" as const, referencia: referenciaPorDefecto() };
      setSeleccion(null);
      if (escena === "pinto") {
        d.cambiar({ ...comun, anio: ANIO_HOY, sim: { lat: ESCENA_PINTO.lat, lon: ESCENA_PINTO.lon }, plazas: ESCENA_PINTO.plazas });
        setModeloPendiente(true);
        mapaRef.current?.volarA(ESCENA_PINTO.lat, ESCENA_PINTO.lon, 10.8);
        mostrarBloque(".tudecides__resultado");
      } else {
        vivo.current.tuDecides.borrar();
        d.cambiar({ ...comun, anio: ANIO_PROYECCION, sim: null, plazas: null });
        mapaRef.current?.encuadrar(BBOX_COMUNIDAD);
        mostrarBloque(".bloque--cifra");
      }
    },
    [elegirVista, mostrarBloque],
  );

  // ---- el agente: lo que sabe hacer en pantalla ----
  // Lo último que se ha pintado, para que las acciones lean el estado de ahora y no el de cuando se pidieron.
  const vivo = useRef({ donde, tuDecides, vista, territorios });
  vivo.current = { donde, tuDecides, vista, territorios };
  const oyentes = useRef(new Set<() => void>());
  useEffect(() => {
    oyentes.current.forEach((f) => f());
  });
  const esperarA = useCallback((condicion: () => boolean, ms = 15000) => {
    return new Promise<boolean>((resolver) => {
      if (condicion()) return resolver(true);
      const fin = (ok: boolean) => {
        oyentes.current.delete(oyente);
        clearTimeout(reloj);
        resolver(ok);
      };
      const oyente = () => condicion() && fin(true);
      const reloj = setTimeout(() => fin(false), ms);
      oyentes.current.add(oyente);
    });
  }, []);

  /** Pone el servicio (y el radio) pedidos, vuelve a la pestaña del simulador y espera a tener sus datos calculados. */
  const asegurarServicio = useCallback(
    async (servicio: ServicioId, radio?: number, anio?: AnioDonde) => {
      if (vivo.current.vista !== "donde") elegirVista("donde");
      const d = vivo.current.donde;
      if (d.est.servicio !== servicio) d.elegirServicio(servicio);
      if (radio !== undefined && radio !== vivo.current.donde.est.radio_m) vivo.current.donde.cambiar({ radio_m: radio });
      // Las cifras del agente son de un año: la pantalla pasa a ese año para que lo que se ve cuadre con lo que dice.
      if (anio !== undefined && anio !== vivo.current.donde.est.anio) vivo.current.donde.cambiar({ anio });
      const ok = await esperarA(() => {
        const x = vivo.current.donde;
        return (
          x.est.servicio === servicio &&
          x.estado !== null &&
          x.estado.servicio === servicio &&
          x.estado.radio_m === x.est.radio_m &&
          x.anioActivo === x.est.anio
        );
      });
      if (!ok) throw new Error(`no se han podido cargar los datos de ${SERVICIOS[servicio].nombre.toLowerCase()}`);
    },
    [elegirVista, esperarA],
  );

  const destinoAgente = useMemo<Destino>(
    () => ({
      elegirServicio: (a) => asegurarServicio(a.servicio, a.radio_m, a.anio),
      moverMapa: (a) => {
        const m = mapaRef.current;
        if (!m) throw new Error("el mapa todavía no está listo");
        if (a.bbox) m.encuadrar(a.bbox);
        else if (a.lat !== undefined && a.lon !== undefined) m.volarA(a.lat, a.lon, a.zoom ?? 11);
        if (a.lugar && (a.lugar.startsWith("mun:") || a.lugar.startsWith("dis:"))) setSeleccion(a.lugar);
        irAlMapa();
      },
      marcarPuntos: async (a) => {
        await asegurarServicio(a.servicio);
        const x = vivo.current;
        if (a.origen === "simulacion") {
          const p = a.puntos[0];
          if (!p) return;
          if (p.plazas !== undefined) x.donde.cambiar({ plazas: p.plazas });
          if (!x.tuDecides.colocar(p.lat, p.lon)) throw new Error("el punto cae fuera de la Comunidad");
        } else {
          x.tuDecides.fijarModelo(a.servicio, a.puntos);
        }
        irAlMapa();
      },
      mostrarRanking: async (a) => {
        await asegurarServicio(a.servicio);
        vivo.current.donde.cambiar({ ...(a.nivel === "municipio" || a.nivel === "distrito" ? { nivel: a.nivel } : {}), zona: a.zona ?? null });
      },
      abrirFicha: (a) => abrirLugar(a.lugar),
    }),
    [asegurarServicio, abrirLugar, irAlMapa],
  );
  const agente = useAgente({ donde, vista, destino: destinoAgente, lugar: lugarValido, alias });

  // Si se abre con un enlace que ya trae un punto (`?sim=`), el mapa se acerca a él una vez.
  const simInicial = useRef(est.sim);
  useEffect(() => {
    const p = simInicial.current;
    if (!mapaMontado || !p || vista !== "donde") return;
    simInicial.current = null;
    mapaRef.current?.volarA(p.lat, p.lon, 10.8);
  }, [mapaMontado, vista]);

  const invitacionDelMapa = estado ? invitacionMapa(estado) : null;
  const estadoFicha = ficha.estados[servicioMapa] ?? null;
  const avisoMapa =
    vista === "municipio"
      ? donde.base.fase === "cargando"
        ? "Cargando los datos de la Comunidad…"
        : donde.base.fase === "error"
          ? "No se han podido cargar los datos"
          : !lugarValido
            ? "Elige un municipio o un distrito y lo verás aquí"
            : !estadoFicha && !ficha.error
              ? `Cargando: ${SERVICIOS[servicioMapa].nombre.toLowerCase()}…`
              : null
      : donde.base.fase === "cargando"
      ? "Cargando los datos de la Comunidad…"
      : donde.base.fase === "error" || donde.centros.fase === "error"
        ? "No se han podido cargar los datos"
        : donde.centros.fase === "cargando"
          ? `Cargando: ${SERVICIOS[est.servicio].nombre.toLowerCase()}…`
          : null;

  // Hueco que tapan los paneles, para que la cámara centre en la parte libre del mapa.
  const margen = useMemo<PaddingOptions>(() => {
    if (esMovil) return { top: 24, right: 18, left: 18, bottom: agenteAbierto ? 290 : 70 };
    if (hojaInferior) return { top: 70, bottom: agenteAbierto ? 300 : 24, left: 24, right: 24 };
    return { top: 24, bottom: 24, left: 24, right: agenteAbierto ? 24 + 396 : 24 };
  }, [esMovil, hojaInferior, agenteAbierto]);

  // Móvil: el mapa está debajo del panel. Un botón fijo lleva hasta él mientras no se ve, y el agente (hoja fija abajo) deja el mapa arriba.
  useEffect(() => {
    const el = document.getElementById("mapa");
    if (!esMovil || !el || typeof IntersectionObserver === "undefined") {
      setMapaALaVista(false);
      return;
    }
    const o = new IntersectionObserver(([e]) => setMapaALaVista(Boolean(e?.isIntersecting)), { threshold: 0.3 });
    o.observe(el);
    return () => o.disconnect();
  }, [esMovil]);

  const abrirAgente = useCallback(() => {
    setAgenteAbierto(true);
    irAlMapa();
  }, [irAlMapa]);

  // Un enlace con `?agente=1` en el móvil: cuando la página ya tiene su altura, el mapa se pone arriba, sobre la hoja del agente.
  const agenteInicialListo = useRef(false);
  useEffect(() => {
    if (agenteInicialListo.current || donde.base.fase !== "listo" || !agenteAbierto) return;
    agenteInicialListo.current = true;
    requestAnimationFrame(irAlMapa);
  }, [donde.base.fase, agenteAbierto, irAlMapa]);

  return (
    <div className="app">
      <a className="saltar" href="#mapa">
        Saltar al mapa
      </a>

      <main className="columna">
        <header className="marca">
          <p className="marca__edicion">Comunidad de Madrid</p>
          <h1 className="marca__nombre">¿Dónde hace falta?</h1>
          <p className="marca__lema">Qué cerca están los servicios públicos y dónde un centro nuevo ayudaría más.</p>
          <div className="marca__enlaces">
            <details className="como">
              <summary className="como__titulo">¿Cómo funciona?</summary>
              <p className="como__intro">
                Cruzamos los registros oficiales de la Comunidad de Madrid con la población por edad para ver qué cobertura tienen los centros de salud, hospitales,
                farmacias, colegios, desfibriladores y plazas para mayores, y dónde un centro nuevo ayudaría más.
              </p>
              <ol className="como__pasos">
                <li>
                  <strong>Elige un servicio:</strong> el mapa colorea cada zona según lo cerca que queda para la gente que lo necesita, o cuántas plazas tiene.
                </li>
                <li>
                  <strong>Decide tú:</strong> coloca un centro nuevo en el mapa y mira cuántos vecinos ganan acceso (en residencias, cuántas plazas más cubre), frente a la
                  ubicación que propone el modelo. También puedes preguntárselo a un agente.
                </li>
                <li>
                  <strong>Mira tu municipio:</strong> en «Mi municipio» ves qué servicios tiene tu pueblo o distrito, cómo está frente a la media, dónde un centro nuevo ayudaría más y cómo está hoy el aire.
                </li>
              </ol>
              <p className="como__nota">
                Distancias en línea recta, no por carretera. Datos del{" "}
                <a href="https://datos.comunidad.madrid/catalogo/" target="_blank" rel="noreferrer">
                  portal de datos abiertos de la Comunidad de Madrid
                </a>{" "}
                y del INE. Todas las fuentes y los límites, en «Metodología y fuentes».
              </p>
            </details>
            <Metodologia />
          </div>
        </header>

        <Pestanas vista={vista} onElegir={elegirVista} />

        <div role="tabpanel" id={ID_PANEL_VISTA} aria-labelledby={idPestana(vista)}>
          {vista === "donde" && (
            <section className="vista vista--donde" aria-label="¿Dónde hace falta?">
              <EmpiezaAqui onElegir={elegirEscena} />
              <PanelServicio donde={donde} seleccion={seleccion} onElegirLugar={elegirLugar} tuDecides={tuDecides} mapa={accionesMapa} />
            </section>
          )}

          {vista === "municipio" && (
            <section className="vista vista--municipio" aria-label="Mi municipio">
              <PanelMunicipio
                base={donde.baseHoy}
                onReintentarBase={donde.reintentarBase}
                alias={alias}
                lugarId={lugarId}
                datos={ficha}
                onElegirLugar={abrirLugar}
                onVerSimulador={verEnSimulador}
                servicioMapa={servicioMapa}
                onServicioMapa={setServicioMapa}
                onIrAlMapa={irAlMapa}
              />
            </section>
          )}
        </div>
      </main>

      <div className="zona-mapa">
        <section id="mapa" className="lienzo" tabIndex={-1} aria-label="Mapa de la Comunidad de Madrid">
          <Suspense fallback={<EsqueletoMapa />}>
            <Mapa
              ref={mapaRef}
              margen={margen}
              forzarBase={baseForzada}
              secciones={secciones}
              territorios={territorios}
              estado={vista === "municipio" ? (lugarValido ? estadoFicha : null) : donde.estado}
              pintura={vista === "municipio" ? null : donde.pintura}
              mostrarDatos={vista === "donde"}
              modoFicha={vista === "municipio" && lugarValido !== null}
              leyendaFicha={
                lugarValido && territorios
                  ? `Puntos: ${SERVICIOS[servicioMapa].nombre.toLowerCase()} de la Comunidad (${enteroEs(estadoFicha?.nCentros ?? 0)}). Contorno: ${
                      territorios.municipios.find((m) => m.id === lugarValido)?.nombre ?? territorios.distritos.find((d) => d.id === lugarValido)?.nombre ?? ""
                    }.`
                  : null
              }
              seleccion={seleccion}
              nivel={est.nivel}
              aviso={avisoMapa}
              invitacion={invitacionDelMapa}
              tuDecides={vista === "donde" ? tuDecides : null}
              onMontado={() => setMapaMontado(true)}
              onFallo={() => setSinMapa(true)}
            />
          </Suspense>
        </section>

        {esMovil && !mapaALaVista && !agenteAbierto && (
          <button type="button" className="ir-mapa" onClick={irAlMapa}>
            Ver el mapa
          </button>
        )}

        <div className="hueco-agente" data-hueco="agente">
          <PanelAgente agente={agente} abierto={agenteAbierto} onAbrir={abrirAgente} onCerrar={() => setAgenteAbierto(false)} />
        </div>
      </div>
    </div>
  );
}
