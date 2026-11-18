// Pestañas de la columna y su estado en la URL: `?vista=colegios&centro=<código>`, junto a `?fecha=`.

export type Vista = "para-ti" | "colegios" | "casos";

const VISTAS: readonly Vista[] = ["para-ti", "colegios", "casos"];

/** `?vista=`; lo que falte o no se entienda es «Para ti». */
export function vistaDeLaUrl(search: string): Vista {
  const v = new URLSearchParams(search).get("vista");
  return VISTAS.find((x) => x === v) ?? "para-ti";
}

/** `?centro=` (código de 8 cifras); solo cuenta en la vista de colegios. */
export function centroDeLaUrl(search: string): string | null {
  const p = new URLSearchParams(search);
  if (vistaDeLaUrl(search) !== "colegios") return null;
  const c = p.get("centro");
  return c && /^\d{8}$/.test(c) ? c : null;
}

/** Devuelve la búsqueda con la vista (y el centro) puestos, conservando `fecha` y el resto. «Para ti» es la vista por defecto y no se escribe. */
export function busquedaConVista(search: string, vista: Vista, centro: string | null = null): string {
  const p = new URLSearchParams(search);
  if (vista === "para-ti") p.delete("vista");
  else p.set("vista", vista);
  if (vista === "colegios" && centro) p.set("centro", centro);
  else p.delete("centro");
  const s = p.toString();
  return s ? `?${s}` : "";
}
