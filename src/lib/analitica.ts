// Vercel Web Analytics (sin cookies). Una página vista por carga (la app no cambia de ruta, solo la query): se envía la URL de ENTRADA
// con tres parámetros que no identifican a nadie (con qué apartado, servicio y año se entra). Todo lo demás de la URL se quita antes de enviar: `sim` (dónde coloca alguien un centro), `lugar`, `zona`,
// `plazas`, etc.
import type { BeforeSendEvent } from "@vercel/analytics/react";

export const PARAMETROS_PERMITIDOS = ["vista", "servicio", "anio"] as const;

export function limpiarEvento<E extends BeforeSendEvent>(evento: E): E | null {
  try {
    const u = new URL(evento.url);
    const limpios = new URLSearchParams();
    for (const p of PARAMETROS_PERMITIDOS) {
      const v = u.searchParams.get(p);
      if (v !== null) limpios.set(p, v.slice(0, 40));
    }
    u.search = limpios.toString();
    u.hash = "";
    return { ...evento, url: u.toString() };
  } catch {
    return null; // URL rara: no se envía
  }
}
