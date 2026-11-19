import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  AttributionControl,
  Map as MapaLibre,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type PaddingOptions,
} from "maplibre-gl";
import urlWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapaDonde.css";
import { TRANSPARENTE, expresionClases, expresionPlazas } from "../lib/donde/escalaColor";
import { describirCentro, describirSeccion, type Pintura, type Ventanita } from "../lib/donde/panelDonde";
import { pctEs, seccionesResaltadas, titularPrincipal, valorPrincipal } from "../lib/donde/tuDecides";
import type { Centros, ContornosGeo, EstadoServicio, Secciones, Territorios } from "../lib/donde/tipos";
import { coordenadasValidas, type NivelRanking } from "../lib/donde/urlDonde";
import { cargarEstiloBase, ESTILO_RASTER, PALETA_MAPA, type BaseMapa } from "../lib/estiloMapa";
import type { TuDecides } from "../lib/useTuDecides";
import { LeyendaDonde } from "./LeyendaDonde";

setWorkerUrl(urlWorker);

export interface MapaRef {
  /** Mueve la cámara a un punto. Lo usan la ficha y el agente (acción `mover_mapa`). Ignora coordenadas que no sean números. */
  volarA(lat: number, lon: number, zoom?: number): void;
  /** Encuadra un recuadro [oeste, sur, este, norte]: una zona, un municipio. */
  encuadrar(bbox: readonly [number, number, number, number]): void;
  /** Centro de la parte del mapa que no tapan los paneles (para «Colocar en el centro del mapa»), o null si el mapa aún no existe. */
  centro(): { lat: number; lon: number } | null;
}

interface Props {
  ref?: Ref<MapaRef>;
  /** Hueco que tapan los paneles: la cámara centra en lo que queda libre. */
  margen: PaddingOptions;
  /** Para probar el mapa ráster de respaldo sin esperar a que falle OpenFreeMap (`?base=raster`). */
  forzarBase?: BaseMapa;
  secciones: Secciones | null;
  territorios: Territorios | null;
  estado: EstadoServicio | null;
  pintura: Pintura | null;
  /** `false` en «Mi municipio»: el mapa queda como base, con los contornos. */
  mostrarDatos: boolean;
  /** «Mi municipio»: sin colorear las secciones, pero con los centros del servicio de `estado` (y su ventanita). */
  modoFicha?: boolean;
  /** Rótulo bajo el mapa en modo ficha: qué son los puntos. */
  leyendaFicha?: string | null;
  /** Municipio (`mun:…`) o distrito (`dis:…`) resaltado. */
  seleccion: string | null;
  nivel: NivelRanking;
  /** Texto de estado (cargando, error) que se muestra sobre el mapa. */
  aviso: string | null;
  /** Invitación sobre el mapa mientras no hay marcador (sin cifras de déficit: la cobertura está en el panel). */
  invitacion?: string | null;
  /** «Tú decides»: marcador del usuario, punto del modelo y secciones que ganan. null en «Mi municipio». */
  tuDecides?: TuDecides | null;
  /** Se llama una vez cuando el componente ya está montado y `MapaRef` responde (el mapa carga en diferido). */
  onMontado?: () => void;
  /** Se llama si el navegador no puede crear el mapa (sin WebGL). */
  onFallo?: () => void;
}

/** Recuadro que encuadra la Comunidad de Madrid. */
const LIMITES: [[number, number], [number, number]] = [
  [-4.58, 39.88],
  [-3.05, 41.17],
];

const TEXTOS_MAPA = {
  "Map.Title": "Mapa de la Comunidad de Madrid",
  "NavigationControl.ZoomIn": "Acercar",
  "NavigationControl.ZoomOut": "Alejar",
  "AttributionControl.ToggleAttribution": "Mostrar u ocultar la atribución del mapa",
  "AttributionControl.MapFeedback": "Comentarios sobre el mapa",
};

const TINTA = "#1f2328";
const SIN_SECCIONES: readonly number[] = [];
/** Verde de «ganan acceso» (el del nivel bajo del resto de la web) y violeta del punto del modelo: ninguno está en la escala naranja-azul del déficit. */
const COLOR_GANA = "#1b6b52";
const COLOR_MODELO = "#5b3a8c";
const VACIO = { type: "FeatureCollection", features: [] } as const;
const ATRIBUCION = '© <a href="https://datos.comunidad.madrid/catalogo/" target="_blank" rel="noopener noreferrer">Comunidad de Madrid</a> e <a href="https://www.ine.es" target="_blank" rel="noopener noreferrer">INE</a> (CC BY 4.0). Obra derivada de Núcleos de población y Unidades administrativas (IGN-INE, 2025) CC-BY 4.0 <a href="https://www.ign.es" target="_blank" rel="noopener noreferrer">ign.es</a>';

/** Radio del punto de un centro: pequeño en los muy numerosos y proporcional a las plazas en las residencias. */
function radioCentro(servicio: string, plazas: number | null | undefined): number {
  if (plazas != null) return Math.min(9, 3 + Math.sqrt(Math.max(plazas, 0)) * 0.36);
  if (servicio === "dea") return 2.7;
  if (servicio === "farmacia") return 3.4;
  if (servicio === "colegio") return 3.8;
  if (servicio === "hospital") return 6.5;
  return 4.6;
}

function geojsonCentros(c: Centros): unknown {
  const features = new Array(c.ids.length);
  for (let j = 0; j < c.ids.length; j++) {
    features[j] = {
      type: "Feature",
      geometry: { type: "Point", coordinates: [c.lon[j], c.lat[j]] },
      properties: { i: j, r: radioCentro(c.servicio, c.plazas ? (c.plazas[j] ?? 0) : null) },
    };
  }
  return { type: "FeatureCollection", features };
}

/** Marcador con forma de chincheta; la etiqueta va a la derecha para que la punta quede justo en las coordenadas. */
function crearPin(tipo: "usuario" | "modelo", etiqueta: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `pin pin--${tipo}`;
  el.innerHTML =
    '<svg class="pin__forma" viewBox="0 0 32 42" width="32" height="42" aria-hidden="true" focusable="false"><path d="M16 1.5C8.3 1.5 2.5 7.4 2.5 15c0 9.8 13.5 25 13.5 25s13.5-15.2 13.5-25C29.5 7.4 23.7 1.5 16 1.5z"/><circle cx="16" cy="15" r="5"/></svg>';
  const rotulo = document.createElement("span");
  rotulo.className = "pin__etiqueta";
  rotulo.textContent = etiqueta;
  el.appendChild(rotulo);
  return el;
}

interface Tip extends Ventanita {
  x: number;
  y: number;
  tipo: "seccion" | "centro";
}

/**
 * Mapa de «¿Dónde hace falta?»: el estilo de papel de `estiloMapa` con tres capas encima: las secciones censales
 * coloreadas con `feature-state` (cambiar de servicio no vuelve a generar la geometría), los contornos de municipios
 * y distritos y los centros existentes como puntos. Al pasar el ratón o tocar, una ventanita con el dato.
 */
export default function MapaDonde({ ref, margen, forzarBase, secciones, territorios, estado, pintura, mostrarDatos, modoFicha = false, leyendaFicha = null, seleccion, nivel, aviso, invitacion = null, tuDecides = null, onMontado, onFallo }: Props) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  const margenRef = useRef(margen);
  margenRef.current = margen;
  const [fallo, setFallo] = useState(false);
  /** Sube cada vez que se montan las capas (la primera vez y tras el cambio al mapa ráster de respaldo). */
  const [epoca, setEpoca] = useState(0);
  const [tip, setTip] = useState<Tip | null>(null);
  /** `true` si no se ha podido descargar `secciones.geojson` (el mapa se ve sin colorear). */
  const [falloGeo, setFalloGeo] = useState(false);

  // Lo último que ven los manejadores del ratón, sin volver a registrarlos.
  const vivo = useRef({ estado, territorios, mostrarDatos, modoFicha, td: tuDecides });
  vivo.current = { estado, territorios, mostrarDatos, modoFicha, td: tuDecides };
  const hoverRef = useRef<string | null>(null);
  const territoriosRef = useRef(territorios);
  territoriosRef.current = territorios;

  const indicePorId = useMemo(() => new Map((secciones?.ids ?? []).map((id, i) => [id, i])), [secciones]);
  const indiceRef = useRef(indicePorId);
  indiceRef.current = indicePorId;

  const pinUsuario = useRef<Marker | null>(null);
  const pinModelo = useRef<Marker | null>(null);
  const arrastrando = useRef(false);
  /** Secciones con el estado `gana` / `gm` puesto ahora mismo, y la época de capas en la que se pusieron. */
  const resaltadas = useRef<{ gana: Set<string>; gm: Set<string>; epoca: number }>({ gana: new Set(), gm: new Set(), epoca: 0 });

  /** Encuadre pedido antes de que el mapa exista (p. ej. `?zona=04` al abrir): se aplica al crearlo. */
  const pendienteRef = useRef<[number, number, number, number] | null>(null);

  useEffect(() => {
    onMontado?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** El margen que tapan los paneles, recortado para que nunca llene el lienzo: con un mapa estrecho, MapLibre avisaría «Map cannot fit within canvas». */
  const margenSeguro = (): PaddingOptions => {
    const m = margenRef.current;
    const ancho = cajaRef.current?.clientWidth ?? 0;
    const alto = cajaRef.current?.clientHeight ?? 0;
    const recorta = (a: number, b: number, total: number): [number, number] => {
      const maximo = total * 0.6; // queda siempre al menos el 40 % del lienzo libre
      if (total <= 0 || a + b <= maximo) return [a, b];
      const f = maximo / (a + b);
      return [Math.floor(a * f), Math.floor(b * f)];
    };
    const [izquierda, derecha] = recorta(m.left ?? 0, m.right ?? 0, ancho);
    const [arriba, abajo] = recorta(m.top ?? 0, m.bottom ?? 0, alto);
    return { left: izquierda, right: derecha, top: arriba, bottom: abajo };
  };

  const sinMovimiento = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  useImperativeHandle(
    ref,
    () => ({
      volarA(lat, lon, zoom = 10.5) {
        if (!coordenadasValidas(lat, lon)) return;
        mapaRef.current?.flyTo({ center: [lon, lat], zoom, padding: margenSeguro(), duration: sinMovimiento() ? 0 : 1400, essential: false });
      },
      centro() {
        const c = mapaRef.current?.getCenter();
        return c ? { lat: c.lat, lon: c.lng } : null;
      },
      encuadrar(b) {
        if (!b.every((x) => Number.isFinite(x)) || b[0] >= b[2] || b[1] >= b[3]) return;
        if (!mapaRef.current) {
          pendienteRef.current = [b[0], b[1], b[2], b[3]];
          return;
        }
        mapaRef.current.fitBounds(
          [
            [b[0], b[1]],
            [b[2], b[3]],
          ],
          { padding: margenSeguro(), maxZoom: 12.5, duration: sinMovimiento() ? 0 : 1200, essential: false },
        );
      },
    }),
    [],
  );

  // ------------------------------------------------------------ creación del mapa
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    let cancelado = false;
    let mapa: MapaLibre | null = null;
    let reloj: ReturnType<typeof setTimeout> | undefined;

    void cargarEstiloBase(undefined, forzarBase).then(({ estilo, base }) => {
      if (cancelado) return;
      try {
        mapa = new MapaLibre({
          container: caja,
          style: estilo,
          bounds: LIMITES,
          fitBoundsOptions: { padding: margenSeguro() },
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          rollEnabled: false,
          maxPitch: 0,
          minZoom: 6.6,
          maxZoom: 15,
          maxBounds: [
            [-8.4, 37.6],
            [0.8, 43.2],
          ],
          renderWorldCopies: false,
          locale: TEXTOS_MAPA,
        });
      } catch {
        setFallo(true);
        onFallo?.();
        return;
      }
      const m = mapa;
      mapaRef.current = m;
      if (pendienteRef.current) {
        const b = pendienteRef.current;
        pendienteRef.current = null;
        m.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: margenSeguro(), maxZoom: 12.5, duration: 0 });
      }
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new AttributionControl({ compact: true }), "bottom-right");
      m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");
      // En pantallas estrechas la atribución empieza plegada (el botón «i» la abre) para no tapar la leyenda.
      m.once("idle", () => {
        if (caja.clientWidth >= 640) return;
        const atrib = caja.querySelector(".maplibregl-ctrl-attrib");
        atrib?.removeAttribute("open");
        atrib?.classList.remove("maplibregl-compact-show");
      });

      // Capas de datos: se montan con el estilo y otra vez si el estilo se cambia (respaldo ráster).
      const montar = () => {
        if (m.getSource("secciones")) return;
        const antes = m.getStyle().layers.find((l) => l.type === "symbol")?.id; // los rótulos del mapa base quedan encima
        m.addSource("secciones", { type: "geojson", data: "/donde/secciones.geojson", promoteId: "id", maxzoom: 12, buffer: 16, attribution: ATRIBUCION });
        m.addLayer({ id: "secciones-relleno", type: "fill", source: "secciones", paint: { "fill-color": TRANSPARENTE, "fill-opacity": 0.84 } }, antes);
        m.addLayer(
          {
            id: "secciones-hover",
            type: "line",
            source: "secciones",
            paint: { "line-color": TINTA, "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.2, 0] as ExpressionSpecification },
          },
          antes,
        );
        // «Tú decides»: las secciones que ganan acceso con el centro del usuario (relleno verde y contorno) y con el del modelo (contorno a trazos).
        const gana = (clave: string, si: number, no: number) => ["case", ["boolean", ["feature-state", clave], false], si, no] as ExpressionSpecification;
        m.addLayer({ id: "secciones-gana-relleno", type: "fill", source: "secciones", paint: { "fill-color": COLOR_GANA, "fill-opacity": gana("gana", 0.34, 0) } }, antes);
        m.addLayer({ id: "secciones-gana-borde", type: "line", source: "secciones", paint: { "line-color": "#fffdf8", "line-width": gana("gana", 4.2, 0), "line-opacity": 0.85 } }, antes);
        m.addLayer({ id: "secciones-gana", type: "line", source: "secciones", layout: { "line-join": "round" }, paint: { "line-color": COLOR_GANA, "line-width": gana("gana", 2.2, 0) } }, antes);
        m.addLayer({ id: "secciones-modelo", type: "line", source: "secciones", layout: { "line-join": "round" }, paint: { "line-color": COLOR_MODELO, "line-width": gana("gm", 2.4, 0), "line-dasharray": [2, 1.4] } }, antes);
        for (const [fuente, prefijo] of [["municipios", "mun"], ["distritos", "dis"]] as const) {
          m.addSource(fuente, { type: "geojson", data: VACIO as never, promoteId: "id" });
          const ancho = ["interpolate", ["linear"], ["zoom"], 6.6, 0.5, 10, 1, 13, 1.6] as ExpressionSpecification;
          m.addLayer(
            {
              id: `${prefijo}-linea`,
              type: "line",
              source: fuente,
              layout: { visibility: fuente === "municipios" ? "visible" : "none" },
              paint: fuente === "municipios"
                ? { "line-color": PALETA_MAPA.limite, "line-opacity": 0.6, "line-width": ancho }
                : { "line-color": PALETA_MAPA.limite, "line-opacity": 0.7, "line-width": ancho, "line-dasharray": [3, 2] },
            },
            antes,
          );
          const ninguno = ["==", ["get", "id"], ""] as ExpressionSpecification;
          m.addLayer({ id: `${prefijo}-sel-borde`, type: "line", source: fuente, filter: ninguno, layout: { "line-join": "round" }, paint: { "line-color": "#fffdf8", "line-width": 6, "line-opacity": 0.9 } }, antes);
          m.addLayer({ id: `${prefijo}-sel`, type: "line", source: fuente, filter: ninguno, layout: { "line-join": "round" }, paint: { "line-color": TINTA, "line-width": 2.6 } }, antes);
        }
        m.addSource("centros", { type: "geojson", data: VACIO as never });
        m.addLayer({
          id: "centros-punto",
          type: "circle",
          source: "centros",
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, ["*", 0.55, ["get", "r"]], 12, ["get", "r"]] as ExpressionSpecification,
            "circle-color": TINTA,
            "circle-stroke-color": "#fffdf8",
            "circle-stroke-width": 1.2,
            "circle-opacity": 0.95,
          },
        });
        setEpoca((e) => e + 1);
      };

      m.on("style.load", montar);
      if (m.isStyleLoaded()) montar();

      // Si OpenFreeMap no entrega las teselas, se cambia al mapa ráster de OSM.
      let baseComprobada = base === "raster";
      const aRespaldo = () => {
        if (baseComprobada) return;
        baseComprobada = true;
        m.setStyle(ESTILO_RASTER);
      };
      reloj = setTimeout(aRespaldo, 12_000);
      m.on("sourcedata", (e) => {
        if (!baseComprobada && e.sourceId === "openmaptiles" && e.tile) {
          baseComprobada = true;
          clearTimeout(reloj);
        }
      });
      m.on("error", (e) => {
        const fuente = (e as { sourceId?: string }).sourceId;
        if (fuente === "openmaptiles") aRespaldo();
        else if (fuente === "secciones") setFalloGeo(true);
      });
      m.on("sourcedata", (e) => {
        if (e.sourceId === "secciones" && e.isSourceLoaded) {
          setFalloGeo((antes) => {
            if (antes) setEpoca((n) => n + 1); // vuelve a pintar lo que se pidió mientras faltaba la geometría
            return false;
          });
        }
      });

      // ---------------------------------------------------- ventanita al pasar o tocar
      const quitarHover = () => {
        if (hoverRef.current !== null && m.getSource("secciones")) m.setFeatureState({ source: "secciones", id: hoverRef.current }, { hover: false });
        hoverRef.current = null;
      };
      const mostrar = (x: number, y: number) => {
        const { estado: est, territorios: t, mostrarDatos: ver, modoFicha: ficha } = vivo.current;
        if (!est || !t || !(ver || ficha) || !m.getLayer("centros-punto")) {
          quitarHover();
          setTip(null);
          return;
        }
        const centro = m.queryRenderedFeatures(
          [
            [x - 7, y - 7],
            [x + 7, y + 7],
          ],
          { layers: ["centros-punto"] },
        )[0];
        if (centro) {
          quitarHover();
          const v = describirCentro(est, t, Number(centro.properties?.i));
          setTip(v ? { ...v, x, y, tipo: "centro" } : null);
          m.getCanvas().style.cursor = "pointer";
          return;
        }
        m.getCanvas().style.cursor = "";
        if (!ver) {
          // «Mi municipio»: solo hay ventanita en los centros, no en el suelo.
          quitarHover();
          setTip(null);
          return;
        }
        const sec = m.queryRenderedFeatures([x, y], { layers: ["secciones-relleno"] })[0];
        const id = sec ? String(sec.id ?? sec.properties?.id ?? "") : "";
        const i = indiceRef.current.get(id);
        if (i === undefined) {
          quitarHover();
          setTip(null);
          return;
        }
        if (hoverRef.current !== id) {
          quitarHover();
          m.setFeatureState({ source: "secciones", id }, { hover: true });
          hoverRef.current = id;
        }
        const v = describirSeccion(est, t, i);
        setTip(v ? { ...v, x, y, tipo: "seccion" } : null);
      };
      m.on("mousemove", (e) => {
        if (vivo.current.td?.colocando) {
          quitarHover();
          setTip(null);
          return; // al colocar el centro no hay ventanita: el clic es para poner el marcador
        }
        mostrar(e.point.x, e.point.y);
      });
      m.on("click", (e) => {
        const td = vivo.current.td;
        if (td?.colocando) {
          // En el modo «Coloca un centro» el clic (o el toque) pone el centro en vez de abrir la ventanita.
          quitarHover();
          setTip(null);
          td.colocar(e.lngLat.lat, e.lngLat.lng);
          return;
        }
        if ((e.originalEvent.target as HTMLElement | null)?.closest?.(".pin")) return; // un toque en el marcador no abre la ventanita del suelo
        mostrar(e.point.x, e.point.y); // en pantallas táctiles no hay «pasar por encima»: se toca
      });
      m.on("mouseout", () => {
        quitarHover();
        setTip(null);
      });
      m.on("movestart", () => setTip(null));
    });

    return () => {
      cancelado = true;
      clearTimeout(reloj);
      mapa?.remove();
      mapaRef.current = null;
      pinUsuario.current = null;
      pinModelo.current = null;
    };
  }, [forzarBase]);

  const reintentarGeo = useCallback(() => {
    (mapaRef.current?.getSource("secciones") as GeoJSONSource | undefined)?.setData("/donde/secciones.geojson");
  }, []);

  // Si los datos base llegan después de un fallo (el usuario pulsó «Reintentar» del panel), la geometría también se vuelve a pedir.
  useEffect(() => {
    if (secciones && falloGeo) reintentarGeo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secciones]);

  // ------------------------------------------------------------ contornos (llegan con los territorios)
  useEffect(() => {
    const m = mapaRef.current;
    if (!m || !territorios || epoca === 0) return;
    (m.getSource("municipios") as GeoJSONSource | undefined)?.setData(territorios.municipios_geo as ContornosGeo as never);
    (m.getSource("distritos") as GeoJSONSource | undefined)?.setData(territorios.distritos_geo as ContornosGeo as never);
  }, [territorios, epoca]);

  useEffect(() => {
    const m = mapaRef.current;
    if (!m || epoca === 0) return;
    m.setLayoutProperty("dis-linea", "visibility", nivel === "distrito" && mostrarDatos ? "visible" : "none");
  }, [nivel, mostrarDatos, epoca]);

  // ------------------------------------------------------------ selección (fila del ranking)
  useEffect(() => {
    const m = mapaRef.current;
    if (!m || epoca === 0) return;
    for (const [prefijo, es] of [["mun", seleccion?.startsWith("mun:")], ["dis", seleccion?.startsWith("dis:")]] as const) {
      const filtro = ["==", ["get", "id"], es && seleccion ? seleccion : ""] as ExpressionSpecification;
      m.setFilter(`${prefijo}-sel-borde`, filtro);
      m.setFilter(`${prefijo}-sel`, filtro);
    }
  }, [seleccion, epoca]);

  // ------------------------------------------------------------ centros y pintura del servicio
  useEffect(() => {
    const m = mapaRef.current;
    if (!m || epoca === 0) return;
    const visible = (mostrarDatos || modoFicha) && estado !== null;
    setTip(null);
    m.setLayoutProperty("centros-punto", "visibility", visible ? "visible" : "none");
    m.setLayoutProperty("secciones-relleno", "visibility", mostrarDatos ? "visible" : "none");
    (m.getSource("centros") as GeoJSONSource | undefined)?.setData((estado ? geojsonCentros(estado.centros) : VACIO) as never);
    // Los desfibriladores son más de 10.000 puntos: solo con el mapa acercado.
    m.setLayerZoomRange("centros-punto", estado?.servicio === "dea" ? 10.5 : 0, 24);
  }, [estado, mostrarDatos, modoFicha, epoca]);

  // ------------------------------------------------------------ «Tú decides»: secciones que ganan acceso
  const gananUsuario = tuDecides?.evaluacion?.tipo === "ok" && mostrarDatos ? (estado ? seccionesResaltadas(estado, tuDecides.evaluacion.sim) : SIN_SECCIONES) : SIN_SECCIONES;
  const gananModelo = tuDecides?.modelo.fase !== "inactivo" && mostrarDatos ? (tuDecides?.modelo.secciones ?? SIN_SECCIONES) : SIN_SECCIONES;

  useEffect(() => {
    const m = mapaRef.current;
    if (!m || epoca === 0 || !secciones) return;
    const r = resaltadas.current;
    if (r.epoca !== epoca) {
      // Las capas se han vuelto a montar (cambio al mapa ráster): el estado anterior ya no existe.
      r.gana.clear();
      r.gm.clear();
      r.epoca = epoca;
    }
    const aplicar = (clave: "gana" | "gm", indices: readonly number[]) => {
      const nuevo = new Set<string>();
      for (const i of indices) {
        const id = secciones.ids[i];
        if (id !== undefined) nuevo.add(id);
      }
      const actual = r[clave];
      for (const id of actual) if (!nuevo.has(id)) m.removeFeatureState({ source: "secciones", id }, clave);
      for (const id of nuevo) if (!actual.has(id)) m.setFeatureState({ source: "secciones", id }, { [clave]: true });
      r[clave] = nuevo;
    };
    aplicar("gana", gananUsuario);
    aplicar("gm", gananModelo);
    const caja = contenedorRef.current;
    if (caja) {
      caja.dataset.gananSecciones = String(gananUsuario.length);
      caja.dataset.modeloSecciones = String(gananModelo.length);
      caja.dataset.modeloSeccion = tuDecides?.modelo.fase === "listo" && mostrarDatos ? (tuDecides.modelo.punto?.seccion ?? "") : "";
    }
  }, [gananUsuario, gananModelo, secciones, epoca, tuDecides?.modelo, mostrarDatos]);

  // ------------------------------------------------------------ «Tú decides»: marcadores
  const punto = mostrarDatos ? (tuDecides?.punto ?? null) : null;
  useEffect(() => {
    const m = mapaRef.current;
    if (!m || epoca === 0) return;
    if (!punto) {
      pinUsuario.current?.remove();
      pinUsuario.current = null;
      return;
    }
    if (pinUsuario.current) {
      if (!arrastrando.current) pinUsuario.current.setLngLat([punto.lon, punto.lat]);
      return;
    }
    const el = crearPin("usuario", "Tu centro");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Tu centro. Muévelo con las flechas del teclado; con Mayús, a pasos grandes.");
    const pin = new Marker({ element: el, draggable: true, anchor: "bottom" }).setLngLat([punto.lon, punto.lat]).addTo(m);
    const posicion = () => pin.getLngLat();
    pin.on("dragstart", () => {
      arrastrando.current = true;
      setTip(null);
    });
    pin.on("drag", () => {
      const p = posicion();
      vivo.current.td?.mover(p.lat, p.lng);
    });
    pin.on("dragend", () => {
      arrastrando.current = false;
      const p = posicion();
      vivo.current.td?.soltar(p.lat, p.lng);
    });
    // Teclado: las flechas mueven el marcador 24 px (96 con Mayús) y se fija al dejar de pulsar.
    let reloj: ReturnType<typeof setTimeout> | undefined;
    el.addEventListener("keydown", (e) => {
      const paso = e.shiftKey ? 96 : 24;
      const d = e.key === "ArrowLeft" ? [-paso, 0] : e.key === "ArrowRight" ? [paso, 0] : e.key === "ArrowUp" ? [0, -paso] : e.key === "ArrowDown" ? [0, paso] : null;
      if (!d) return;
      e.preventDefault();
      e.stopPropagation(); // que el mapa no se desplace a la vez
      const mapa = mapaRef.current;
      if (!mapa) return;
      const actual = mapa.project(posicion());
      const nuevo = mapa.unproject([actual.x + (d[0] as number), actual.y + (d[1] as number)]);
      pin.setLngLat(nuevo);
      vivo.current.td?.mover(nuevo.lat, nuevo.lng);
      clearTimeout(reloj);
      reloj = setTimeout(() => {
        const p = posicion();
        vivo.current.td?.soltar(p.lat, p.lng);
      }, 350);
    });
    pinUsuario.current = pin;
  }, [punto, epoca]);

  const puntoModelo = mostrarDatos && tuDecides?.modelo.fase !== "inactivo" ? (tuDecides?.modelo.punto ?? null) : null;
  const etiquetaModelo = tuDecides?.modelo.etiqueta ?? "Modelo";
  useEffect(() => {
    const m = mapaRef.current;
    if (!m || epoca === 0) return;
    if (!puntoModelo) {
      pinModelo.current?.remove();
      pinModelo.current = null;
      return;
    }
    if (pinModelo.current && pinModelo.current.getElement().dataset.etiqueta === etiquetaModelo) {
      pinModelo.current.setLngLat([puntoModelo.lon, puntoModelo.lat]);
      return;
    }
    pinModelo.current?.remove();
    const el = crearPin("modelo", etiquetaModelo);
    el.dataset.etiqueta = etiquetaModelo;
    el.setAttribute("aria-hidden", "true");
    pinModelo.current = new Marker({ element: el, anchor: "bottom" }).setLngLat([puntoModelo.lon, puntoModelo.lat]).addTo(m);
  }, [puntoModelo, etiquetaModelo, epoca]);

  // Si el agente propone varios puntos, los demás se dibujan como el primero (solo con su etiqueta).
  const otrosModelo = mostrarDatos && tuDecides?.modelo.fase !== "inactivo" ? (tuDecides?.modelo.otros ?? null) : null;
  const claveOtros = otrosModelo ? JSON.stringify(otrosModelo.map((p) => [p.lat, p.lon, p.etiqueta])) : "";
  useEffect(() => {
    const m = mapaRef.current;
    if (!m || epoca === 0 || !claveOtros) return;
    const pines = (JSON.parse(claveOtros) as [number, number, string][]).map(([lat, lon, etiqueta]) => {
      const el = crearPin("modelo", etiqueta);
      el.setAttribute("aria-hidden", "true");
      return new Marker({ element: el, anchor: "bottom" }).setLngLat([lon, lat]).addTo(m);
    });
    return () => pines.forEach((p) => p.remove());
  }, [claveOtros, epoca]);

  // Esc cancela el modo «Coloca un centro».
  const colocando = tuDecides?.colocando ?? false;
  const cancelarColocar = tuDecides?.cancelarColocar;
  useEffect(() => {
    if (!colocando || !cancelarColocar) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelarColocar();
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [colocando, cancelarColocar]);

  // Esc cierra la ventanita (WCAG 1.4.13: el contenido que aparece al pasar el ratón se puede descartar sin mover el puntero).
  const hayTip = tip !== null;
  useEffect(() => {
    if (!hayTip) return;
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const m = mapaRef.current;
      if (m && hoverRef.current !== null && m.getSource("secciones")) m.setFeatureState({ source: "secciones", id: hoverRef.current }, { hover: false });
      hoverRef.current = null;
      setTip(null);
    };
    window.addEventListener("keydown", alPulsar);
    return () => window.removeEventListener("keydown", alPulsar);
  }, [hayTip]);

  const pintar = useCallback(() => {
    const m = mapaRef.current;
    if (!m || !secciones || !pintura) return;
    const t0 = performance.now();
    m.setPaintProperty(
      "secciones-relleno",
      "fill-color",
      (pintura.tipo === "plazas" ? expresionPlazas(pintura.centro ?? 0) : expresionClases()) as ExpressionSpecification,
    );
    const ids = secciones.ids;
    const v = pintura.valores;
    for (let i = 0; i < ids.length; i++) m.setFeatureState({ source: "secciones", id: ids[i] as string }, { v: v[i] as number });
    const caja = contenedorRef.current;
    if (caja) {
      caja.dataset.pintadoServicio = estado?.servicio ?? "";
      caja.dataset.pintadoPreparacionMs = (performance.now() - t0).toFixed(0);
      delete caja.dataset.pintadoMs;
      m.once("idle", () => {
        caja.dataset.pintadoMs = (performance.now() - t0).toFixed(0); // desde que se aplica la pintura hasta que el mapa queda dibujado
      });
    }
    m.triggerRepaint();
  }, [secciones, pintura, estado]);

  useEffect(() => {
    if (epoca === 0) return;
    pintar();
  }, [pintar, epoca]);

  if (fallo) {
    return (
      <div className="mapa-donde mapa-donde--fallo" role="alert">
        <p>Este navegador no puede dibujar el mapa (necesita WebGL). El resto de la página funciona igual: el panel y el ranking dan las mismas cifras.</p>
      </div>
    );
  }

  return (
    <div className={`mapa-donde${colocando ? " mapa-donde--colocando" : ""}`} ref={contenedorRef}>
      <div ref={cajaRef} className="mapa-donde__lienzo" role="region" aria-label="Mapa de la Comunidad de Madrid" />
      {aviso ? (
        <p className="mapa-donde__aviso" role="status">
          {aviso}
        </p>
      ) : (
        falloGeo && (
          <div className="mapa-donde__aviso mapa-donde__aviso--error" role="alert">
            <p>No se ha podido cargar el dibujo de las secciones: el mapa se ve sin colorear.</p>
            <button type="button" className="boton" onClick={reintentarGeo}>
              Reintentar
            </button>
          </div>
        )
      )}
      {colocando && (
        <p className={`mapa-donde__guia${tuDecides?.aviso ? " mapa-donde__guia--aviso" : ""}`} role={tuDecides?.aviso ? undefined : "status"} aria-hidden={tuDecides?.aviso ? true : undefined}>
          {tuDecides?.aviso ?? (
            <>
              Haz clic en el mapa para colocar el centro. <span className="mapa-donde__guia-esc">Esc para cancelar.</span>
            </>
          )}
        </p>
      )}
      {mostrarDatos && estado && tuDecides && <ResultadoEnMapa td={tuDecides} estado={estado} invitacion={invitacion} />}
      {tip && (
        <div className={`ventanita ventanita--${tip.tipo}`} style={posicionVentanita(tip, cajaRef.current)} role="tooltip">
          <p className="ventanita__titulo">{tip.titulo}</p>
          {tip.lineas.map((l) => (
            <p key={l} className="ventanita__linea">
              {l}
            </p>
          ))}
        </div>
      )}
      {mostrarDatos && estado && pintura && !falloGeo && <LeyendaDonde estado={estado} pintura={pintura} />}
      {modoFicha && !mostrarDatos && estado && leyendaFicha && <p className="mapa-donde__ficha tarjeta">{leyendaFicha}</p>}
    </div>
  );
}

/** Coloca la ventanita junto al puntero y la voltea si no cabe por la derecha o por abajo. */
function posicionVentanita(t: Tip, caja: HTMLElement | null): React.CSSProperties {
  const ancho = caja?.clientWidth ?? 800;
  const alto = caja?.clientHeight ?? 600;
  const derecha = t.x > ancho - 290;
  const abajo = t.y > alto - 150;
  return {
    left: derecha ? undefined : t.x + 14,
    right: derecha ? ancho - t.x + 14 : undefined,
    top: abajo ? undefined : t.y + 14,
    bottom: abajo ? alto - t.y + 14 : undefined,
  };
}

/** Tarjeta con el resultado en vivo sobre el mapa: se ve mientras se arrastra el marcador, también en el móvil. El panel lo lee en voz alta; aquí no. */
function ResultadoEnMapa({ td, estado, invitacion }: { td: TuDecides; estado: EstadoServicio; invitacion: string | null }) {
  const ev = td.evaluacion;
  if (!td.punto) {
    // Sin marcador: un atajo para empezar sin salir del mapa (en el móvil el panel queda lejos).
    if (td.colocando) return null;
    return (
      <div className="titular-mapa">
        {invitacion && (
          <div className="titular-mapa__cifra tarjeta">
            <p className="titular-mapa__texto">{invitacion}</p>
          </div>
        )}
        <button type="button" className="boton boton--primario titular-mapa__boton" onClick={td.iniciarColocar}>
          Coloca un centro en el mapa
        </button>
      </div>
    );
  }
  let cuerpo: React.ReactNode;
  if (ev?.tipo === "ok") {
    const t = titularPrincipal(estado, valorPrincipal(estado, ev.sim));
    cuerpo = (
      <>
        <p className="resultado-mapa__numero dato">{t.numero}</p>
        <p className="resultado-mapa__texto">{t.texto}</p>
        {td.comparacion?.pct != null && <p className="resultado-mapa__modelo">{pctEs(td.comparacion.pct)} del óptimo del modelo</p>}
      </>
    );
  } else if (ev?.tipo === "fuera") {
    cuerpo = <p className="resultado-mapa__texto">Fuera de la Comunidad de Madrid</p>;
  } else {
    cuerpo = <p className="resultado-mapa__texto">Calculando…</p>;
  }
  return (
    <div className={`resultado-mapa tarjeta${td.recalculando ? " resultado-mapa--calculando" : ""}`} aria-hidden="true">
      {cuerpo}
    </div>
  );
}
