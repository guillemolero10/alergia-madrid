import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import {
  AttributionControl,
  Map as MapaLibre,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type PaddingOptions,
} from "maplibre-gl";
import urlWorker from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { FeatureCollection, Point } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import "./Mapa.css";

import { cargarEstiloBase, ESTILO_RASTER, type BaseMapa } from "../lib/estiloMapa";
import { nivelParaPerfil, type PerfilNivel } from "../lib/nivelPerfil";
import { formatearEntero, horaCorta } from "../lib/formato";
import { COLOR_NIVEL, nombreVariable, ordenDeNivel } from "../lib/riesgo";
import type { CapasVisibles, EstadoActual, Lugares, Municipio, Nivel } from "../lib/tipos";
import { construirRejilla, puntoCardinal, rumboDeViento } from "../lib/viento";
import { EsqueletoMapa } from "./EsqueletoMapa";
import { detalleDeNivel, Marcador, type FormaMarcador } from "./Marcadores";
import { crearParticulasViento, type ParticulasViento } from "./particulasViento";

setWorkerUrl(urlWorker);

export interface MapaRef {
  /** Mueve la cámara a un punto. Lo usa el panel y lo usará el chat (acción `mover_mapa`). */
  volarA(lat: number, lon: number, zoom?: number): void;
}

interface PropsMapa {
  ref?: Ref<MapaRef>;
  estado: EstadoActual;
  lugares: Lugares;
  capas: CapasVisibles;
  /** `false` si el viento tiene más de 2 h: no se enseñan flechas con una dirección vieja. */
  vientoVigente: boolean;
  seleccionado: string | null;
  onSeleccionar: (id: string) => void;
  /** Hueco que ocupan los paneles: la cámara centra en lo que queda libre. */
  margen: PaddingOptions;
  /** Para probar el mapa ráster de respaldo sin esperar a que falle OpenFreeMap. */
  forzarBase?: BaseMapa;
  /** Lo que te afecta: el mapa se pinta con el nivel de esas variables, no con el riesgo global. */
  perfil: PerfilNivel;
  /** `colegios`: capa de puntos (uno por centro) en lugar de los marcadores de estaciones. */
  modo: "para-ti" | "colegios";
  colegios: readonly PuntoColegio[];
  colegioSeleccionado: string | null;
  onColegio: (codigo: string) => void;
}

/** Un colegio en el mapa: su código, posición y el nivel durante el recreo. */
export interface PuntoColegio {
  c: string;
  la: number;
  lo: number;
  nivel: Nivel;
}

/** Madrid capital no tiene estación propia pero es lo primero que se busca: su marcador siempre está. */
const ID_MADRID = "mun:28079";

/** Recuadro que encuadra las 28 estaciones (la Comunidad de Madrid, sin el pico norte de Somosierra). */
const LIMITES: [[number, number], [number, number]] = [
  [-4.5, 39.95],
  [-3.12, 41.03],
];
const CENTRO = { lat: 40.4168, lon: -3.7038 };
const VACIO: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };
const COLORES_COLEGIO = ["match", ["get", "nivel"], "bajo", COLOR_NIVEL.bajo, "medio", COLOR_NIVEL.medio, "alto", COLOR_NIVEL.alto, COLOR_NIVEL.sin_dato] as const;

const TEXTOS_MAPA = {
  "Map.Title": "Mapa de riesgo respiratorio de la Comunidad de Madrid",
  "NavigationControl.ZoomIn": "Acercar",
  "NavigationControl.ZoomOut": "Alejar",
  "AttributionControl.ToggleAttribution": "Mostrar u ocultar la atribución del mapa",
  "AttributionControl.MapFeedback": "Comentarios sobre el mapa",
};

interface Punto {
  id: string;
  forma: FormaMarcador;
  nombre: string;
  lat: number;
  lon: number;
}

/** Flecha que apunta al norte; el mapa la gira con el rumbo del viento. Gris pizarra con un filo de papel. */
function imagenFlecha(): ImageData {
  const lado = 64;
  const lienzo = document.createElement("canvas");
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext("2d")!;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(32, 5); // punta
  ctx.lineTo(45, 27);
  ctx.lineTo(35.5, 23.5);
  ctx.lineTo(34, 58); // cola
  ctx.lineTo(30, 58);
  ctx.lineTo(28.5, 23.5);
  ctx.lineTo(19, 27);
  ctx.closePath();
  // El filo crema separa la flecha de carreteras y rótulos sin recurrir a sombras.
  ctx.strokeStyle = "rgba(246, 242, 234, 0.9)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#4b5665";
  ctx.fill();
  return ctx.getImageData(0, 0, lado, lado);
}

function montarCapas(mapa: MapaLibre) {
  if (!mapa.hasImage("flecha")) mapa.addImage("flecha", imagenFlecha(), { pixelRatio: 2 });
  if (!mapa.getSource("viento")) mapa.addSource("viento", { type: "geojson", data: VACIO });

  if (!mapa.getSource("colegios")) mapa.addSource("colegios", { type: "geojson", data: VACIO });
  if (!mapa.getLayer("colegios-puntos")) {
    // Un círculo por centro (1.910): una capa de MapLibre, no marcadores del DOM.
    mapa.addLayer({
      id: "colegios-puntos",
      type: "circle",
      source: "colegios",
      layout: { visibility: "none" },
      paint: {
        "circle-color": COLORES_COLEGIO as unknown as string,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.2, 10, 3.6, 13, 6, 15, 8],
        "circle-stroke-width": 0.8,
        "circle-stroke-color": "rgba(31, 35, 40, 0.55)",
        "circle-opacity": 0.92,
      },
    });
    mapa.addLayer({
      id: "colegio-seleccionado",
      type: "circle",
      source: "colegios",
      filter: ["==", ["get", "c"], ""],
      layout: { visibility: "none" },
      paint: {
        "circle-color": COLORES_COLEGIO as unknown as string,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 7, 13, 11, 15, 13],
        "circle-stroke-width": 3,
        "circle-stroke-color": "#1f2328",
      },
    });
  }

  if (!mapa.getLayer("viento-flechas")) {
    mapa.addLayer({
      id: "viento-flechas",
      type: "symbol",
      source: "viento",
      layout: {
        "icon-image": "flecha",
        "icon-rotate": ["get", "rumbo"],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-size": ["interpolate", ["linear"], ["get", "velocidad"], 0, 0.5, 15, 0.82, 40, 1.3],
      },
      paint: {
        "icon-opacity": ["interpolate", ["linear"], ["get", "velocidad"], 0, 0.4, 10, 0.7, 30, 0.95],
      },
    });
  }
}

export default function Mapa({
  ref,
  estado,
  lugares,
  capas,
  vientoVigente,
  seleccionado,
  onSeleccionar,
  margen,
  forzarBase,
  perfil,
  modo,
  colegios,
  colegioSeleccionado,
  onColegio,
}: PropsMapa) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  const particulasRef = useRef<ParticulasViento | null>(null);
  const margenRef = useRef(margen);
  margenRef.current = margen;
  // Destino pedido antes de que el mapa esté cargado: se aplica al cargar en lugar de la entrada por defecto.
  const pendienteRef = useRef<{ lat: number; lon: number; zoom?: number } | null>(null);
  const cargadoRef = useRef(false);

  const [anclas, setAnclas] = useState<Record<string, HTMLElement>>({});
  const [versionEstilo, setVersionEstilo] = useState(0);
  const [base, setBase] = useState<BaseMapa | null>(null);
  const [fallo, setFallo] = useState(false);
  const [rotuloViento, setRotuloViento] = useState<{ x: number; y: number; texto: string } | null>(null);
  const [menosMovimiento, setMenosMovimiento] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  useEffect(() => {
    const consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
    const alCambiar = () => setMenosMovimiento(consulta.matches);
    consulta.addEventListener("change", alCambiar);
    return () => consulta.removeEventListener("change", alCambiar);
  }, []);

  // Puntos fijos del mapa. Los captadores van primero para que las estaciones queden encima.
  // Los otros 150 municipios sin estación NO llevan marcador (cargaban el mapa): solo se dibuja el elegido.
  const puntos = useMemo<Punto[]>(() => {
    const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");
    return [
      ...[...lugares.captadores].sort(porNombre).map((c): Punto => ({ ...c, forma: "captador" })),
      ...lugares.municipios.filter((m) => m.id === ID_MADRID).map((m): Punto => ({ ...m, forma: "municipio" })),
      ...[...lugares.estaciones].sort(porNombre).map((e): Punto => ({ ...e, forma: "estacion" })),
    ];
  }, [lugares]);

  // El municipio sin estación que está elegido (si no es Madrid) lleva un marcador propio mientras dure la elección.
  const extra = useMemo<Punto | null>(() => {
    const m = seleccionado?.startsWith("mun:") && seleccionado !== ID_MADRID ? lugares.municipios.find((x) => x.id === seleccionado) : undefined;
    return m ? { ...m, forma: "municipio" } : null;
  }, [seleccionado, lugares]);
  const puntosTodos = useMemo(() => (extra ? [...puntos, extra] : puntos), [puntos, extra]);

  // Orden de aparición: onda que sale del centro de Madrid.
  const ordenAparicion = useMemo(() => {
    const dist = (p: Punto) => Math.hypot(p.lat - CENTRO.lat, (p.lon - CENTRO.lon) * 0.76);
    const orden: Record<string, number> = {};
    [...puntos].sort((a, b) => dist(a) - dist(b)).forEach((p, i) => (orden[p.id] = i));
    return orden;
  }, [puntos]);

  // --- crear el mapa (una vez) ---
  useEffect(() => {
    const caja = cajaRef.current;
    if (!caja) return;
    let cancelado = false;
    let mapa: MapaLibre | null = null;
    let reloj: ReturnType<typeof setTimeout> | undefined;

    void cargarEstiloBase(undefined, forzarBase).then(({ estilo, base: baseInicial }) => {
      if (cancelado) return;
      let baseActual = baseInicial;
      try {
        mapa = new MapaLibre({
          container: caja,
          style: estilo,
          bounds: LIMITES,
          fitBoundsOptions: { padding: margenRef.current },
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
        return;
      }
      const m = mapa;
      mapaRef.current = m;
      setBase(baseActual);
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation();
      m.addControl(new AttributionControl({ compact: true }), "bottom-right");
      m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

      // Entrada: el mapa arranca un poco alejado y se acerca al cargar.
      const zoomFinal = m.getZoom();
      const animar = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (animar) m.jumpTo({ zoom: zoomFinal - 0.45 });

      // Si OpenFreeMap no entrega las teselas, se cambia al mapa ráster de OSM. En cuanto llega la primera
      // tesela vectorial el mapa base se da por bueno y ya no se cambia (aunque tarde en pintarse entero).
      let baseComprobada = baseActual === "raster";
      const aRespaldo = () => {
        if (baseComprobada) return;
        baseComprobada = true;
        baseActual = "raster";
        setBase("raster");
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
        if ((e as { sourceId?: string }).sourceId === "openmaptiles") aRespaldo();
      });

      m.on("style.load", () => {
        montarCapas(m);
        setVersionEstilo((v) => v + 1);
      });
      m.once("load", () => {
        cargadoRef.current = true;
        const destino = pendienteRef.current;
        if (destino) {
          pendienteRef.current = null;
          m.jumpTo({ zoom: zoomFinal - 0.45 });
          m.easeTo({ center: [destino.lon, destino.lat], zoom: destino.zoom ?? Math.max(zoomFinal, 9.6), padding: margenRef.current, duration: 2000 });
        } else if (animar) m.easeTo({ zoom: zoomFinal, duration: 2400, easing: (t) => 1 - Math.pow(1 - t, 3) });
      });

      m.on("mousemove", "viento-flechas", (e) => {
        const p = e.features?.[0]?.properties as { cardinal?: string; velocidad?: number } | undefined;
        if (!p) return;
        setRotuloViento({
          x: e.point.x,
          y: e.point.y,
          texto: `Viento del ${p.cardinal ?? ""} · ${formatearEntero(Number(p.velocidad ?? 0))} km/h`,
        });
      });
      m.on("mouseleave", "viento-flechas", () => setRotuloViento(null));
      m.on("movestart", () => setRotuloViento(null));

      // Lienzo de partículas: encima del mapa y debajo de los marcadores.
      const lienzo = document.createElement("canvas");
      lienzo.className = "mapa__particulas";
      lienzo.setAttribute("aria-hidden", "true");
      m.getCanvas().insertAdjacentElement("afterend", lienzo);
      particulasRef.current = crearParticulasViento(m, lienzo);

      // Marcadores: MapLibre coloca el ancla y React pinta dentro con un portal.
      const nuevas: Record<string, HTMLElement> = {};
      for (const p of puntos) {
        const ancla = document.createElement("div");
        ancla.className = `ancla ancla--${p.forma}`;
        new Marker({ element: ancla, anchor: "center" }).setLngLat([p.lon, p.lat]).addTo(m);
        ancla.removeAttribute("tabindex"); // el foco es del botón de dentro
        ancla.removeAttribute("aria-label");
        nuevas[p.id] = ancla;
      }
      setAnclas(nuevas);
    });

    return () => {
      cancelado = true;
      clearTimeout(reloj);
      particulasRef.current?.destruir();
      particulasRef.current = null;
      mapaRef.current = null;
      mapa?.remove();
      setAnclas({});
      setVersionEstilo(0);
    };
    // Los lugares son estáticos y el margen se lee de una ref: el mapa se crea una sola vez.
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      volarA(lat, lon, zoom) {
        const m = mapaRef.current;
        if (!m || !cargadoRef.current) {
          pendienteRef.current = { lat, lon, zoom };
          return;
        }
        m.flyTo({
          center: [lon, lat],
          zoom: zoom ?? Math.max(m.getZoom(), 9.6),
          padding: margenRef.current,
          speed: 1.1,
          curve: 1.35,
        });
      },
    }),
    [],
  );

  const listo = versionEstilo > 0;
  const hayViento = capas.viento && vientoVigente;

  // En el área metropolitana los marcadores se pisan. Al pulsar con ratón o dedo se abre el lugar cuyo
  // centro queda más cerca del punto pulsado, no el que casualmente esté encima.
  const capasRef = useRef(capas);
  capasRef.current = capas;
  const alPulsar = useCallback(
    (id: string, punto: { x: number; y: number } | null) => {
      const m = mapaRef.current;
      if (!m || !punto) return onSeleccionar(id);
      const caja = m.getContainer().getBoundingClientRect();
      let mejor = id;
      let menor = Infinity;
      for (const p of puntosTodos) {
        if (p.forma === "captador" && !capasRef.current.polen) continue;
        const px = m.project([p.lon, p.lat]);
        // A igual distancia gana la estación: el captador es el símbolo secundario.
        const d = Math.hypot(px.x + caja.left - punto.x, px.y + caja.top - punto.y) + (p.forma === "captador" ? 5 : 0);
        if (d < menor) {
          menor = d;
          mejor = p.id;
        }
      }
      onSeleccionar(menor <= 26 ? mejor : id);
    },
    [onSeleccionar, puntosTodos],
  );

  // --- nivel de cada punto SEGÚN TU PERFIL (y las capas encendidas) ---
  // Asma o EPOC: solo el aire. Alergia: solo los pólenes que has marcado. El nivel de cada variable es el del
  // pipeline (umbrales oficiales); aquí solo se elige qué variables cuentan para ti.
  const { niveles, peores } = useMemo(() => {
    const riesgoPorLugar = new Map(estado.riesgo.map((r) => [r.lugar, r]));
    const mapaNiveles: Record<string, Nivel | null> = {};
    const mapaPeores: Record<string, string | null> = {};
    const cuentaAire = capas.aire && perfil.afecta !== "polen";
    const cuentaPolen = capas.polen && perfil.afecta !== "aire";
    const opciones = { aire: capas.aire, polen: capas.polen };
    const poner = (id: string, estacion: string | null, captador: string | null) => {
      if (!cuentaAire && !cuentaPolen) {
        mapaNiveles[id] = null;
        return;
      }
      const n = nivelParaPerfil(estado, perfil, estacion, captador, opciones);
      mapaNiveles[id] = n.nivel;
      mapaPeores[id] = n.peor;
    };
    for (const e of lugares.estaciones) poner(e.id, e.id, riesgoPorLugar.get(e.id)?.captador ?? e.captador);
    for (const p of puntosTodos) {
      if (p.forma !== "municipio") continue;
      const m = lugares.municipios.find((x) => x.id === p.id) as Municipio;
      poner(m.id, m.estacion, m.captador);
    }
    // Un captador solo cuenta si te afecta el polen.
    for (const c of lugares.captadores) {
      if (cuentaPolen) poner(c.id, null, c.id);
      else mapaNiveles[c.id] = null;
    }
    return { niveles: mapaNiveles, peores: mapaPeores };
  }, [estado, lugares, capas, perfil, puntosTodos]);

  const detalles = useMemo(() => {
    const hora = horaCorta(estado.capas.aire.ultimo_dato);
    const textos: Record<string, string> = {};
    for (const p of puntosTodos) {
      const nivel = niveles[p.id];
      if (!nivel) {
        textos[p.id] = p.forma === "captador" && perfil.afecta === "aire" ? "No cuenta para tu perfil" : "";
        continue;
      }
      if (p.forma === "captador") {
        const info = lugares.captadores.find((c) => c.id === p.id);
        textos[p.id] = !info?.activo
          ? "Sin datos este año"
          : !estado.capas.polen
            ? "Polen: capa aún sin publicar"
            : detalleDeNivel(nivel, "Polen:");
        continue;
      }
      let texto = detalleDeNivel(nivel);
      const peor = peores[p.id];
      if (peor && ordenDeNivel(nivel) > 1) texto += ` por ${nombreVariable(peor).corto}`;
      if (p.forma === "municipio") texto += " · estación más cercana";
      else if (capas.aire && perfil.afecta !== "polen" && hora) texto += ` · ${hora}`;
      textos[p.id] = texto;
    }
    return textos;
  }, [estado, lugares, capas, niveles, peores, puntosTodos, perfil.afecta]);

  // --- marcador del municipio elegido (los demás municipios sin estación no se dibujan) ---
  useEffect(() => {
    const m = mapaRef.current;
    if (!listo || !m || !extra) return;
    const ancla = document.createElement("div");
    ancla.className = "ancla ancla--municipio";
    const marcador = new Marker({ element: ancla, anchor: "center" }).setLngLat([extra.lon, extra.lat]).addTo(m);
    ancla.removeAttribute("tabindex");
    ancla.removeAttribute("aria-label");
    setAnclas((a) => ({ ...a, [extra.id]: ancla }));
    return () => {
      marcador.remove();
      setAnclas((a) => {
        const { [extra.id]: _quitada, ...resto } = a;
        return resto;
      });
    };
  }, [listo, extra]);

  // --- capa de colegios ---
  const enColegios = modo === "colegios";
  const modoRef = useRef(modo);
  modoRef.current = modo;
  const alColegioRef = useRef(onColegio);
  alColegioRef.current = onColegio;

  useEffect(() => {
    const m = mapaRef.current;
    if (!listo || !m) return;
    const datos: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: colegios.map((c) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lo, c.la] },
        properties: { c: c.c, nivel: c.nivel },
      })),
    };
    (m.getSource("colegios") as GeoJSONSource | undefined)?.setData(datos);
  }, [listo, versionEstilo, colegios]);

  useEffect(() => {
    const m = mapaRef.current;
    if (!listo || !m) return;
    const vis = enColegios ? "visible" : "none";
    if (m.getLayer("colegios-puntos")) m.setLayoutProperty("colegios-puntos", "visibility", vis);
    if (m.getLayer("colegio-seleccionado")) {
      m.setLayoutProperty("colegio-seleccionado", "visibility", vis);
      m.setFilter("colegio-seleccionado", ["==", ["get", "c"], colegioSeleccionado ?? ""]);
    }
  }, [listo, versionEstilo, enColegios, colegioSeleccionado]);

  // Pulsar un punto: el centro más cercano al dedo en un margen de 9 px (los puntos son pequeños).
  useEffect(() => {
    const m = mapaRef.current;
    if (!listo || !m) return;
    const alPulsar = (e: { point: { x: number; y: number } }) => {
      if (modoRef.current !== "colegios") return;
      const { x, y } = e.point;
      const cerca = m.queryRenderedFeatures([[x - 9, y - 9], [x + 9, y + 9]], { layers: ["colegios-puntos"] });
      let mejor: string | null = null;
      let menor = Infinity;
      for (const f of cerca) {
        const [lo, la] = (f.geometry as Point).coordinates as [number, number];
        const p = m.project([lo, la]);
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < menor) {
          menor = d;
          mejor = String(f.properties?.c);
        }
      }
      if (mejor) alColegioRef.current(mejor);
    };
    const alMover = (e: { point: { x: number; y: number } }) => {
      if (modoRef.current !== "colegios") return;
      const { x, y } = e.point;
      const hay = m.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]], { layers: ["colegios-puntos"] }).length > 0;
      m.getCanvas().style.cursor = hay ? "pointer" : "";
    };
    m.on("click", alPulsar);
    m.on("mousemove", alMover);
    return () => {
      m.off("click", alPulsar);
      m.off("mousemove", alMover);
    };
  }, [listo, versionEstilo]);

  // --- flechas y partículas de viento ---
  useEffect(() => {
    const m = mapaRef.current;
    if (!listo || !m) return;
    const datos: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: estado.viento.map((v) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [v.lon, v.lat] },
        properties: {
          rumbo: rumboDeViento(v.direccion_grados),
          velocidad: v.velocidad_kmh,
          cardinal: puntoCardinal(v.direccion_grados),
        },
      })),
    };
    (m.getSource("viento") as GeoJSONSource | undefined)?.setData(datos);
    particulasRef.current?.ponerRejilla(construirRejilla(estado.viento));
  }, [listo, versionEstilo, estado.viento]);

  useEffect(() => {
    const m = mapaRef.current;
    if (!listo || !m) return;
    if (m.getLayer("viento-flechas")) m.setLayoutProperty("viento-flechas", "visibility", hayViento ? "visible" : "none");
    particulasRef.current?.activar(hayViento && !menosMovimiento);
    if (!hayViento) setRotuloViento(null);
  }, [listo, versionEstilo, hayViento, menosMovimiento]);

  if (fallo) {
    return (
      <div className="mapa mapa--sin-webgl" role="group" aria-label="Estaciones (el mapa no está disponible)">
        <p className="mapa__fallo">
          Tu navegador no puede dibujar el mapa (WebGL no está disponible).{" "}
          {enColegios ? "Busca tu centro por nombre o municipio en la columna de la izquierda." : "Puedes consultar las estaciones en esta lista."}
        </p>
        {enColegios ? null : (
        <ul className="mapa__lista">
          {lugares.estaciones.map((e) => (
            <li key={e.id}>
              <button type="button" className={`boton nivel-${niveles[e.id] ?? "sin_dato"}`} onClick={() => onSeleccionar(e.id)}>
                <span className={`chip-nivel nivel-${niveles[e.id] ?? "sin_dato"}`}>{detalles[e.id] ?? "Capa oculta"}</span>
                {e.nombre}
              </button>
            </li>
          ))}
        </ul>
        )}
      </div>
    );
  }

  return (
    <div className={`mapa${listo ? " mapa--listo" : ""}${enColegios ? " mapa--colegios" : ""}`} data-base={base ?? undefined}>
      <div ref={cajaRef} className="mapa__lienzo" />
      {!listo && <EsqueletoMapa />}
      {rotuloViento && (
        <div className="mapa__rotulo-viento" style={{ left: rotuloViento.x, top: rotuloViento.y }} role="status">
          {rotuloViento.texto}
        </div>
      )}
      {listo &&
        puntosTodos.map((p) => {
          const ancla = anclas[p.id];
          if (!ancla) return null;
          return createPortal(
            <Marcador
              id={p.id}
              forma={p.forma}
              nombre={p.nombre}
              nivel={niveles[p.id] ?? null}
              detalle={detalles[p.id] ?? ""}
              seleccionado={seleccionado === p.id}
              orden={ordenAparicion[p.id] ?? 0}
              onPulsar={alPulsar}
            />,
            ancla,
            p.id,
          );
        })}
    </div>
  );
}
