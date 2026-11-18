import type { Caso } from "../lib/casos";
import { etiquetaDeNivel } from "../lib/riesgo";

/** La línea de «mejor hora» de un caso, con la misma lógica de frases que la pantalla «Para ti». */
export function etiquetaVentanaTexto(c: Pick<Caso, "mejor" | "sinBuenaHora" | "mejorManana" | "nivel">): string {
  if (c.sinBuenaHora) {
    const base = "Ese día no hay una buena hora: nivel alto a todas horas.";
    return c.mejorManana ? `${base} Al día siguiente lo mejor era ${c.mejorManana.etiqueta} (nivel ${etiquetaDeNivel(c.mejorManana.nivel).toLowerCase()}).` : base;
  }
  if (c.mejor) return `Mejor hora para salir: ${c.mejor.etiqueta} (nivel ${etiquetaDeNivel(c.mejor.nivel).toLowerCase()}).`;
  return c.nivel === "bajo" ? "Todo el día estaba bien." : "Sin una franja clara.";
}
