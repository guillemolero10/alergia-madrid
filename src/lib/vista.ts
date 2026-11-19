// Pestañas de la columna y su estado en la URL: `?vista=donde` y `?vista=municipio`.
// Los parámetros de cada pestaña (servicio, radio, lugar…) los añaden F3 y F6 sin tocar lo de aquí.

export type Vista = "donde" | "municipio";

const VISTAS: readonly Vista[] = ["donde", "municipio"];

/** `?vista=`; lo que falte o no se entienda es «¿Dónde hace falta?». */
export function vistaDeLaUrl(search: string): Vista {
  const v = new URLSearchParams(search).get("vista");
  return VISTAS.find((x) => x === v) ?? "donde";
}

/** Devuelve la búsqueda con la vista puesta, conservando el resto de parámetros. «donde» es la vista por defecto y no se escribe. */
export function busquedaConVista(search: string, vista: Vista): string {
  const p = new URLSearchParams(search);
  if (vista === "donde") p.delete("vista");
  else p.set("vista", vista);
  const s = p.toString();
  return s ? `?${s}` : "";
}
