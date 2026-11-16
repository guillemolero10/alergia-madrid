import { useEffect, useState } from "react";

/** `true` mientras se cumple la media query (p. ej. «(max-width: 760px)»). */
export function useMedia(consulta: string): boolean {
  const [cumple, setCumple] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const alCambiar = () => setCumple(mq.matches);
    alCambiar();
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, [consulta]);
  return cumple;
}
