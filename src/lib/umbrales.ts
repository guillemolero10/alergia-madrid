import umbralesJson from "../../datos-estaticos/umbrales.json";

// Umbrales del fichero que usa el pipeline (`datos-estaticos/umbrales.json`). Aquí solo se LEEN para enseñarlos
// junto a una medición («377 granos/m³, el nivel alto empieza en 53»); los niveles los calcula el pipeline.

export interface UmbralAlto {
  valor: number;
  /** `desde`: el nivel alto empieza en `valor` (polen). `por_encima`: alto si se supera `valor` (aire, BOE). */
  modo: "desde" | "por_encima";
}

const aire = umbralesJson.aire as unknown as Record<string, { medio_max?: number }>;
const polen = umbralesJson.polen.tipos as unknown as Record<string, { alto_min?: number }>;

/** Umbral del nivel alto de una variable de las observaciones (`o3`, `polen_gramineas`…); `null` si no lo hay. */
export function umbralAlto(variable: string): UmbralAlto | null {
  if (variable.startsWith("polen_")) {
    const tipo = variable.slice("polen_".length);
    // En el fichero algunas claves llevan el nombre completo: `cupresaceas_taxaceas`, `platano_de_paseo`.
    const clave = polen[tipo] ? tipo : Object.keys(polen).find((k) => k.startsWith(`${tipo}_`));
    const v = clave ? polen[clave]?.alto_min : undefined;
    return typeof v === "number" ? { valor: v, modo: "desde" } : null;
  }
  const v = aire[variable]?.medio_max;
  return typeof v === "number" ? { valor: v, modo: "por_encima" } : null;
}
