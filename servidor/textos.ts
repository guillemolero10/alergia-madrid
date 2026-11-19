// Textos pequeños del servidor que no son del prompt.
import { AVISO_2030 } from "../src/lib/donde/plantillas";
import type { ContextoAgente } from "../src/lib/donde/tipos";

/** Aviso que abre toda respuesta con cifras de 2030 (el mismo del modo sin IA). */
export const aviso2030 = (): string => AVISO_2030;

/** Nombre de cada referencia de plazas, para el prompt (sin cifras: las cifras salen de las herramientas). */
export const REFERENCIA_NOMBRES: Record<NonNullable<ContextoAgente["referencia"]>, string> = {
  media: "media de la Comunidad de Madrid",
  imserso_espana: "IMSERSO, media de España",
  imserso_madrid: "IMSERSO, Madrid",
};
