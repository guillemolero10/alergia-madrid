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
import { municipiosSinEstacion, nivelDeCaptador, nivelDeMunicipio } from "../lib/ficha";
import { formatearEntero, horaCorta } from "../lib/formato";
import { colorDeNivel, esPolen, nivelVisible, nombreVariable, ordenDeNivel } from "../lib/riesgo";
import type { CapasVisibles, EstadoActual, Lugares, Nivel } from "../lib/tipos";
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
}

/** Recuadro que encuadra las 28 estaciones (la Comunidad de Madrid, sin el pico norte de Somosierra). */
const LIMITES: [[number, number], [number, number]] = [
  [-4.5, 39.95],
  [-3.12, 41.03],
];
const CENTRO = { lat: 40.4168, lon: -3.7038 };
const VACIO: FeatureCollection<Point> = { type: "FeatureCollection", features: [] };

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

/** Flecha que apunta al norte; el mapa la gira con el rumbo del viento. */
function imagenFlecha(): ImageData {
  const lado = 64;
  const lienzo = document.createElement("canvas");
  lienzo.width = lado;
  lienzo.height = lado;
  const ctx = lienzo.getContext("2d")!;
  ctx.shadowColor = "rgba(3, 7, 18, 0.95)";
  ctx.shadowBlur = 5;
  ctx.fillStyle = "#d9edff";
  ctx.beginPath();
  ctx.moveTo(32, 5); // punta
  ctx.lineTo(45, 27);
  ctx.lineTo(35.5, 23.5);
  ctx.lineTo(34, 58); // cola
  ctx.lineTo(30, 58);
  ctx.lineTo(28.5, 23.5);
  ctx.lineTo(19, 27);
  ctx.closePath();
  ctx.fill();
  return ctx.getImageData(0, 0, lado, lado);
}

function montarCapas(mapa: MapaLibre) {
  if (!mapa.hasImage("flecha")) mapa.addImage("flecha", imagenFlecha(), { pixelRatio: 2 });
  if (!mapa.getSource("estaciones")) mapa.addSource("estaciones", { type: "geojson", data: VACIO });
  if (!mapa.getSource("viento")) mapa.addSource("viento", { type: "geojson", data: VACIO });

  // Las auras van por debajo de los rótulos del mapa base para no emborronar los nombres.
  const primeraEtiqueta = mapa.getStyle().layers.find((capa) => capa.type === "symbol")?.id;
  if (!mapa.getLayer("auras")) {
    mapa.addLayer(
      {
        id: "auras",
        type: "circle",
        source: "estaciones",
        paint: {
          "circle-color": ["get", "color"],
          "circle-blur": 1,
          "circle-opacity": ["get", "opacidad"],
          "circle-radius": [
            "interpolate",
            ["exponential", 1.5],
            ["zoom"],
            7,
            ["*", 24, ["get", "peso"]],
            10,
            ["*", 64, ["get", "peso"]],
            13,
            ["*", 130, ["get", "peso"]],
          ],
        },
      },
      primeraEtiqueta,
    );
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
        "icon-opacity": ["interpolate", ["linear"], ["get", "velocidad"], 0, 0.3, 10, 0.62, 30, 0.95],
      },
    });
  }
}

const AURA: Record<Nivel, { peso: number; opacidad: number }> = {
  sin_dato: { peso: 0, opacidad: 0 },
  bajo: { peso: 1, opacidad: 0.2 },
  medio: { peso: 1.25, opacidad: 0.34 },
  alto: { peso: 1.5, opacidad: 0.46 },
};

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
}: PropsMapa) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<MapaLibre | null>(null);
  const particulasRef = useRef<ParticulasViento | null>(null);
  const margenRef = useRef(margen);
  margenRef.current = margen;

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
  const puntos = useMemo<Punto[]>(() => {
    const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, "es");
    return [
      ...[...lugares.captadores].sort(porNombre).map((c): Punto => ({ ...c, forma: "captador" })),
      ...municipiosSinEstacion(lugares).map((m): Punto => ({ ...m, forma: "municipio" })),
      ...[...lugares.estaciones].sort(porNombre).map((e): Punto => ({ ...e, forma: "estacion" })),
    ];
  }, [lugares]);

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
        if (animar) m.easeTo({ zoom: zoomFinal, duration: 2400, easing: (t) => 1 - Math.pow(1 - t, 3) });
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
        if (!m) return;
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
      for (const p of puntos) {
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
    [onSeleccionar, puntos],
  );

  // --- nivel de cada punto según las capas encendidas ---
  const niveles = useMemo(() => {
    const riesgoPorLugar = new Map(estado.riesgo.map((r) => [r.lugar, r]));
    const mapaNiveles: Record<string, Nivel | null> = {};
    for (const e of lugares.estaciones) mapaNiveles[e.id] = nivelVisible(riesgoPorLugar.get(e.id), capas);
    for (const m of municipiosSinEstacion(lugares)) {
      const n = nivelDeMunicipio(m, estado, lugares);
      mapaNiveles[m.id] = nivelVisible({ ...n, lugar: m.id, peor_variable: null, captador: null, polen_antiguedad_dias: null }, capas);
    }
    for (const c of lugares.captadores) mapaNiveles[c.id] = capas.polen ? nivelDeCaptador(c, estado, lugares) : null;
    return mapaNiveles;
  }, [estado, lugares, capas]);

  const detalles = useMemo(() => {
    const prefijo = capas.aire && capas.polen ? "Riesgo" : capas.aire ? "Aire:" : "Polen:";
    const hora = horaCorta(estado.capas.aire.ultimo_dato);
    const riesgoPorLugar = new Map(estado.riesgo.map((r) => [r.lugar, r]));
    const textos: Record<string, string> = {};
    for (const p of puntos) {
      const nivel = niveles[p.id];
      if (!nivel) continue;
      if (p.forma === "captador") {
        const info = lugares.captadores.find((c) => c.id === p.id);
        textos[p.id] = !info?.activo
          ? "Sin datos este año"
          : !estado.capas.polen
            ? "Polen: capa aún sin publicar"
            : detalleDeNivel(nivel, "Polen:");
        continue;
      }
      let texto = detalleDeNivel(nivel, prefijo);
      const peor = riesgoPorLugar.get(p.id)?.peor_variable;
      if (peor && ordenDeNivel(nivel) > 1 && (capas.aire || esPolen(peor))) texto += ` por ${nombreVariable(peor).corto}`;
      if (p.forma === "municipio") texto += " · estación más cercana";
      else if (capas.aire && hora) texto += ` · ${hora}`;
      textos[p.id] = texto;
    }
    return textos;
  }, [estado, lugares, capas, niveles, puntos]);

  // --- auras de las estaciones ---
  useEffect(() => {
    const m = mapaRef.current;
    if (!listo || !m) return;
    const datos: FeatureCollection<Point> = {
      type: "FeatureCollection",
      features: lugares.estaciones.flatMap((e) => {
        const nivel = niveles[e.id];
        if (!nivel || nivel === "sin_dato") return [];
        return [
          {
            type: "Feature" as const,
            geometry: { type: "Point" as const, coordinates: [e.lon, e.lat] },
            properties: { color: colorDeNivel(nivel), ...AURA[nivel] },
          },
        ];
      }),
    };
    (m.getSource("estaciones") as GeoJSONSource | undefined)?.setData(datos);
  }, [listo, versionEstilo, lugares, niveles]);

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
          Tu navegador no puede dibujar el mapa (WebGL no está disponible). Puedes consultar las estaciones en esta lista.
        </p>
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
      </div>
    );
  }

  return (
    <div className={`mapa${listo ? " mapa--listo" : ""}`} data-base={base ?? undefined}>
      <div ref={cajaRef} className="mapa__lienzo" />
      {!listo && <EsqueletoMapa />}
      {rotuloViento && (
        <div className="mapa__rotulo-viento" style={{ left: rotuloViento.x, top: rotuloViento.y }} role="status">
          {rotuloViento.texto}
        </div>
      )}
      {listo &&
        puntos.map((p) => {
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
