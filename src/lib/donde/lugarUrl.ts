// El lugar de «Mi municipio»: `?vista=municipio&lugar=mun:28106` y la copia en el navegador del usuario (como `perfil.ts`).
import type { Territorios } from "./tipos";

export const CLAVE_LUGAR = "donde-hace-falta:lugar";

const FORMA = /^(mun|dis):\d{4,8}$/;

export function esIdLugar(x: unknown): x is string {
  return typeof x === "string" && FORMA.test(x);
}

/** ¿Existe ese municipio o distrito en los datos? */
export function existeLugar(t: Territorios, id: string): boolean {
  return esIdLugar(id) && (t.municipios.some((m) => m.id === id) || t.distritos.some((d) => d.id === id));
}

/** `?lugar=` si tiene la forma de un municipio o distrito; si no, null. (Que exista en los datos se comprueba aparte.) */
export function lugarDeLaUrl(search: string): string | null {
  const v = new URLSearchParams(search).get("lugar");
  return esIdLugar(v) ? v : null;
}

/** Devuelve la búsqueda con el lugar puesto (o quitado), conservando el resto de parámetros. */
export function busquedaConLugar(search: string, lugar: string | null): string {
  const p = new URLSearchParams(search);
  if (lugar && esIdLugar(lugar)) p.set("lugar", lugar);
  else p.delete("lugar");
  const s = p.toString();
  return s ? `?${s}` : "";
}

function guardado(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** El lugar recordado, si sigue existiendo en los datos. */
export function leerLugarGuardado(t: Territorios, almacen: Pick<Storage, "getItem"> | null = guardado()): string | null {
  try {
    const v = almacen?.getItem(CLAVE_LUGAR);
    return v && existeLugar(t, v) ? v : null;
  } catch {
    return null;
  }
}

export function guardarLugar(id: string, almacen: Pick<Storage, "setItem"> | null = guardado()): void {
  try {
    if (esIdLugar(id)) almacen?.setItem(CLAVE_LUGAR, id);
  } catch {
    // Sin almacenamiento (modo privado): vale solo para esta visita.
  }
}

export function olvidarLugar(almacen: Pick<Storage, "removeItem"> | null = guardado()): void {
  try {
    almacen?.removeItem(CLAVE_LUGAR);
  } catch {
    // nada
  }
}
