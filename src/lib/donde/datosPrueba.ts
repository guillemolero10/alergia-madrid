// Solo para los tests: carga una vez los JSON reales de public/donde/.
import { cargarDatosNode } from "./cargar";
import type { Datos } from "./tipos";

let promesa: Promise<Datos> | null = null;

export function datosReales(): Promise<Datos> {
  promesa ??= cargarDatosNode(new URL("../../../public/donde/", import.meta.url), { otrosSociales: true });
  return promesa;
}
