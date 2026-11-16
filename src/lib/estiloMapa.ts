import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

// Mapa base: estilo «positron» de OpenFreeMap (vectorial, sin clave), pasado a una paleta nocturna para que
// los niveles de riesgo y el viento sean lo que brilla. Si OpenFreeMap no responde, teselas ráster de OSM.

export const URL_POSITRON = "https://tiles.openfreemap.org/styles/positron";

/** Toda la paleta del mapa base en un solo sitio (si hiciera falta un tema claro, se cambia aquí). */
export const PALETA_MAPA = {
  tierra: "#0b1120",
  urbano: "#111a2d",
  parque: "#0d1b22",
  bosque: "#0c1a1f",
  agua: "#060a14",
  rio: "#13233f",
  edificio: "#141d32",
  edificioBorde: "#19243d",
  viaMenor: "#18233b",
  viaMayor: "#212e4c",
  autovia: "#2c3d63",
  tren: "#1a243c",
  limite: "#7890c8",
  textoCiudad: "#b9c5df",
  textoPueblo: "#8f9ebd",
  textoMenor: "#6b7a99",
  textoAgua: "#41609a",
  halo: "#0b1120",
} as const;

type Pintura = Record<string, unknown>;

const P = PALETA_MAPA;

/** Retoques por identificador de capa del estilo positron. */
const POR_CAPA: Record<string, Pintura> = {
  background: { "background-color": P.tierra },
  park: { "fill-color": P.parque },
  water: { "fill-color": P.agua },
  landcover_ice_shelf: { "fill-color": P.urbano },
  landcover_glacier: { "fill-color": P.urbano },
  landuse_residential: { "fill-color": P.urbano },
  landcover_wood: { "fill-color": P.bosque },
  waterway: { "line-color": P.rio },
  building: { "fill-color": P.edificio, "fill-outline-color": P.edificioBorde },
  "aeroway-area": { "fill-color": P.urbano },
  "aeroway-taxiway": { "line-color": P.viaMenor },
  "aeroway-runway-casing": { "line-color": P.viaMenor },
  "aeroway-runway": { "line-color": P.viaMayor },
  road_area_pier: { "fill-color": P.tierra },
  road_pier: { "line-color": P.tierra },
  highway_path: { "line-color": P.viaMenor },
  highway_minor: { "line-color": P.viaMenor },
  highway_major_casing: { "line-color": P.tierra },
  highway_major_inner: { "line-color": P.viaMayor },
  highway_major_subtle: { "line-color": P.viaMayor },
  highway_motorway_casing: { "line-color": P.tierra },
  highway_motorway_inner: { "line-color": P.autovia },
  highway_motorway_subtle: { "line-color": P.autovia },
  highway_motorway_bridge_casing: { "line-color": P.tierra },
  highway_motorway_bridge_inner: { "line-color": P.autovia },
  tunnel_motorway_casing: { "line-color": P.tierra },
  tunnel_motorway_inner: { "line-color": P.viaMayor },
  boundary_3: { "line-color": P.limite, "line-opacity": 0.5 },
  boundary_2: { "line-color": P.limite, "line-opacity": 0.6 },
  boundary_disputed: { "line-color": P.limite, "line-opacity": 0.3 },
  label_city_capital: { "text-color": P.textoCiudad },
  label_city: { "text-color": P.textoCiudad },
  label_town: { "text-color": P.textoPueblo },
  label_village: { "text-color": P.textoMenor },
  label_other: { "text-color": P.textoMenor },
  label_state: { "text-color": P.textoMenor },
  water_name_point_label: { "text-color": P.textoAgua },
  water_name_line_label: { "text-color": P.textoAgua },
  waterway_line_label: { "text-color": P.textoAgua },
};

/** Capas que sobran sobre fondo oscuro (escudos de carretera claros, aeropuertos). */
const OCULTAS = /^(highway-shield|road_shield|airport)/;

function pinturaGenerica(capa: LayerSpecification): Pintura {
  switch (capa.type) {
    case "background":
      return { "background-color": P.tierra };
    case "fill":
      return { "fill-color": P.urbano };
    case "line":
      return { "line-color": capa.id.startsWith("railway") ? (capa.id.includes("dash") ? P.tierra : P.tren) : P.viaMenor };
    case "symbol":
      return { "text-color": P.textoMenor };
    default:
      return {};
  }
}

/**
 * Devuelve una copia del estilo con la paleta nocturna. No depende de que existan todas las capas:
 * las que no conoce reciben un color genérico según su tipo, así un cambio en OpenFreeMap no deja zonas claras.
 */
export function oscurecerEstilo(estilo: StyleSpecification): StyleSpecification {
  const capas = estilo.layers.map((capa): LayerSpecification => {
    const copia = structuredClone(capa) as LayerSpecification & { paint?: Pintura; layout?: Pintura };
    if (capa.type === "raster" || capa.type === "hillshade") return copia;
    const pintura: Pintura = { ...(copia.paint ?? {}), ...pinturaGenerica(capa), ...(POR_CAPA[capa.id] ?? {}) };
    if (capa.type === "symbol") {
      pintura["text-halo-color"] = P.halo;
      pintura["text-halo-width"] = 1.4;
      pintura["text-halo-blur"] = 0.6;
      if (OCULTAS.test(capa.id)) copia.layout = { ...(copia.layout ?? {}), visibility: "none" };
    }
    copia.paint = pintura;
    return copia;
  });
  return { ...estilo, layers: capas };
}

/** Respaldo ráster: teselas estándar de OpenStreetMap, invertidas y sin color para casar con el tema oscuro. */
export const ESTILO_RASTER: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: "fondo", type: "background", paint: { "background-color": P.tierra } },
    {
      id: "osm",
      type: "raster",
      source: "osm",
      paint: {
        "raster-saturation": -0.85,
        "raster-brightness-min": 0.92,
        "raster-brightness-max": 0.06,
        "raster-contrast": -0.1,
        "raster-opacity": 0.7,
      },
    },
  ],
};

export type BaseMapa = "positron" | "raster";

function pareceEstilo(json: unknown): json is StyleSpecification {
  return (
    typeof json === "object" &&
    json !== null &&
    (json as { version?: unknown }).version === 8 &&
    Array.isArray((json as { layers?: unknown }).layers)
  );
}

/** Descarga positron y lo oscurece; si falla (o tarda más de 6 s), devuelve el estilo ráster de respaldo. */
export async function cargarEstiloBase(
  pedir: typeof globalThis.fetch = globalThis.fetch,
  forzar?: BaseMapa,
): Promise<{ estilo: StyleSpecification; base: BaseMapa }> {
  if (forzar === "raster") return { estilo: ESTILO_RASTER, base: "raster" };
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 6000);
  try {
    const respuesta = await pedir(URL_POSITRON, { signal: control.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    const json: unknown = await respuesta.json();
    if (!pareceEstilo(json)) throw new Error("estilo no válido");
    return { estilo: oscurecerEstilo(json), base: "positron" };
  } catch {
    return { estilo: ESTILO_RASTER, base: "raster" };
  } finally {
    clearTimeout(temporizador);
  }
}
