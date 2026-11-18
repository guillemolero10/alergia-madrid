import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

// Mapa base: estilo «positron» de OpenFreeMap (vectorial, sin clave), pasado a una paleta de papel, como el
// mapa del tiempo de un periódico: tierra crema, agua azul suave y rótulos en gris oscuro. Sobre ese fondo
// tranquilo, lo único con color fuerte son los niveles de riesgo. Si OpenFreeMap no responde, teselas ráster de OSM.

export const URL_POSITRON = "https://tiles.openfreemap.org/styles/positron";

/** Toda la paleta del mapa base en un solo sitio. */
export const PALETA_MAPA = {
  tierra: "#f3efe6",
  urbano: "#ebe5d8",
  parque: "#dfe5d2",
  bosque: "#dbe2cd",
  agua: "#c9dce8",
  rio: "#b3cde0",
  edificio: "#e4ddce",
  edificioBorde: "#d5ccba",
  via: "#ffffff",
  viaLejana: "#fdfbf6",
  viaBorde: "#d3cab8",
  autovia: "#fffaf0",
  autoviaBorde: "#c4b9a3",
  tren: "#cfc7b8",
  limite: "#6b7480",
  textoCiudad: "#22262b",
  textoPueblo: "#3f454d",
  textoMenor: "#5f656d",
  textoAgua: "#44708f",
  halo: "#f6f2ea",
} as const;

type Pintura = Record<string, unknown>;

const P = PALETA_MAPA;

/** Retoques por identificador de capa del estilo positron. */
const POR_CAPA: Record<string, Pintura> = {
  background: { "background-color": P.tierra },
  park: { "fill-color": P.parque },
  water: { "fill-color": P.agua },
  landcover_ice_shelf: { "fill-color": P.tierra },
  landcover_glacier: { "fill-color": P.tierra },
  landuse_residential: { "fill-color": P.urbano },
  landcover_wood: { "fill-color": P.bosque },
  waterway: { "line-color": P.rio },
  building: { "fill-color": P.edificio, "fill-outline-color": P.edificioBorde },
  "aeroway-area": { "fill-color": P.urbano },
  "aeroway-taxiway": { "line-color": P.viaBorde },
  "aeroway-runway-casing": { "line-color": P.viaBorde },
  "aeroway-runway": { "line-color": P.via },
  road_area_pier: { "fill-color": P.tierra },
  road_pier: { "line-color": P.tierra },
  highway_path: { "line-color": P.viaLejana },
  highway_minor: { "line-color": P.via },
  highway_major_casing: { "line-color": P.viaBorde },
  highway_major_inner: { "line-color": P.via },
  highway_major_subtle: { "line-color": P.viaLejana },
  highway_motorway_casing: { "line-color": P.autoviaBorde },
  highway_motorway_inner: { "line-color": P.autovia },
  highway_motorway_subtle: { "line-color": P.autovia },
  highway_motorway_bridge_casing: { "line-color": P.autoviaBorde },
  highway_motorway_bridge_inner: { "line-color": P.autovia },
  tunnel_motorway_casing: { "line-color": P.viaBorde },
  tunnel_motorway_inner: { "line-color": P.viaLejana },
  boundary_3: { "line-color": P.limite, "line-opacity": 0.8 },
  boundary_2: { "line-color": P.limite, "line-opacity": 0.7 },
  boundary_disputed: { "line-color": P.limite, "line-opacity": 0.35 },
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

/** Capas que recargan el mapa sin aportar nada aquí (escudos de carretera, aeropuertos). */
const OCULTAS = /^(highway-shield|road_shield|airport)/;

function pinturaGenerica(capa: LayerSpecification): Pintura {
  switch (capa.type) {
    case "background":
      return { "background-color": P.tierra };
    case "fill":
      return { "fill-color": P.urbano };
    case "line":
      return { "line-color": capa.id.startsWith("railway") ? (capa.id.includes("dash") ? P.tierra : P.tren) : P.viaBorde };
    case "symbol":
      return { "text-color": P.textoMenor };
    default:
      return {};
  }
}

/**
 * Límites municipales: positron solo dibuja comunidades y provincias (`boundary_3`). Se añade una capa gemela,
 * más fina, con los niveles administrativos 7 y 8. Las teselas solo los traen con el mapa acercado.
 */
function capaLimiteMunicipal(provincias: LayerSpecification): LayerSpecification | null {
  if (provincias.type !== "line") return null;
  return {
    id: "limite_municipal",
    type: "line",
    source: provincias.source,
    "source-layer": provincias["source-layer"],
    minzoom: 9,
    filter: [
      "all",
      ["==", ["typeof", ["get", "admin_level"]], "number"],
      [">=", ["get", "admin_level"], 7],
      ["<=", ["get", "admin_level"], 8],
      ["!=", ["get", "maritime"], 1],
    ],
    paint: {
      "line-color": P.limite,
      "line-opacity": 0.38,
      "line-dasharray": [2, 2],
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.5, 13, 1],
    },
  } as LayerSpecification;
}

/**
 * Devuelve una copia del estilo con la paleta de `PALETA_MAPA`. No depende de que existan todas las capas:
 * las que no conoce reciben un color genérico según su tipo, así un cambio en OpenFreeMap no desentona.
 * Los `sources` (y sus atribuciones) se conservan tal cual.
 */
export function aplicarPaleta(estilo: StyleSpecification): StyleSpecification {
  const capas: LayerSpecification[] = [];
  for (const capa of estilo.layers) {
    const copia = structuredClone(capa) as LayerSpecification & { paint?: Pintura; layout?: Pintura };
    if (capa.type === "raster" || capa.type === "hillshade") {
      capas.push(copia);
      continue;
    }
    const pintura: Pintura = { ...(copia.paint ?? {}), ...pinturaGenerica(capa), ...(POR_CAPA[capa.id] ?? {}) };
    if (capa.type === "symbol") {
      pintura["text-halo-color"] = P.halo;
      pintura["text-halo-width"] = 1.6;
      pintura["text-halo-blur"] = 0.4;
      if (OCULTAS.test(capa.id)) copia.layout = { ...(copia.layout ?? {}), visibility: "none" };
    }
    copia.paint = pintura;
    if (capa.id === "boundary_3") {
      const municipal = capaLimiteMunicipal(capa);
      if (municipal) capas.push(municipal);
    }
    capas.push(copia);
  }
  return { ...estilo, layers: capas };
}

/** Respaldo ráster: teselas estándar de OpenStreetMap, casi sin color y veladas sobre el mismo papel crema. */
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
        "raster-saturation": -0.7,
        "raster-contrast": -0.15,
        "raster-opacity": 0.6,
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

/** Descarga positron y le aplica la paleta; si falla (o tarda más de 6 s), devuelve el estilo ráster de respaldo. */
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
    return { estilo: aplicarPaleta(json), base: "positron" };
  } catch {
    return { estilo: ESTILO_RASTER, base: "raster" };
  } finally {
    clearTimeout(temporizador);
  }
}
