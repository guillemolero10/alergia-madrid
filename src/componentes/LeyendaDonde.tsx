import { useState } from "react";
import { useMedia } from "../lib/useMedia";
import { CLASES_DEFICIT_COLORES, COLOR_SIN_DEFICIT, gradienteCss } from "../lib/donde/escalaColor";
import { decimal2Es, decimalEs, enteroEs, radioEs, type Pintura } from "../lib/donde/panelDonde";
import { SERVICIOS } from "../lib/donde/servicios";
import type { EstadoServicio } from "../lib/donde/tipos";

interface Props {
  estado: EstadoServicio;
  pintura: Pintura;
}

/** «0,8», «37», «1.200»: los cortes salen redondeados a 2 cifras. */
const corte = (n: number) => (n < 10 ? decimalEs(n) : enteroEs(n));

/** Leyenda sobre el mapa: la escala continua (plazas) o las 4 clases (distancia), más el símbolo del centro. */
export function LeyendaDonde({ estado, pintura }: Props) {
  const def = SERVICIOS[estado.servicio];
  const c = pintura.cortes;
  // En el móvil la leyenda empieza plegada para no tapar el mapa.
  const esMovil = useMedia("(max-width: 760px)");
  const [abierta, setAbierta] = useState(!esMovil);
  return (
    <details className="leyenda-donde tarjeta" open={abierta} onToggle={(e) => setAbierta(e.currentTarget.open)}>
      <summary className="leyenda-donde__resumen">Leyenda</summary>
      {pintura.tipo === "plazas" ? (
        <>
          <p className="leyenda-donde__titulo">Plazas a menos de {radioEs(estado.radio_m)} por cada 100 mayores</p>
          <div className="leyenda-donde__barra" style={{ background: gradienteCss() }} role="img" aria-label="Escala continua: naranja oscuro, pocas plazas; crema, la referencia; azul, más plazas que la referencia" />
          <div className="leyenda-donde__marcas" aria-hidden="true">
            <span>0</span>
            <span className="leyenda-donde__centro">{decimal2Es(pintura.centro ?? 0)}</span>
            <span>{decimal2Es(2 * (pintura.centro ?? 0))} o más</span>
          </div>
          <div className="leyenda-donde__extremos" aria-hidden="true">
            <span>menos</span>
            <span>referencia</span>
            <span>más</span>
          </div>
        </>
      ) : (
        <>
          <p className="leyenda-donde__titulo">
            {def.grupo === "3_16" ? "Personas de 3 a 16 años" : "Personas"} sin un centro a menos de {radioEs(estado.radio_m)}, por km² (más oscuro: ayudaría más uno nuevo)
          </p>
          <ul className="leyenda-donde__clases">
            {c &&
              CLASES_DEFICIT_COLORES.map((color, k) => (
                <li key={color}>
                  <span className="leyenda-donde__muestra" style={{ background: color }} aria-hidden="true" />
                  {k === 0 ? `menos de ${corte(c[0])}` : k === 3 ? `${corte(c[2])} o más` : `${corte(c[k - 1] as number)} a ${corte(c[k] as number)}`}
                </li>
              ))}
            <li>
              <span className="leyenda-donde__muestra leyenda-donde__muestra--sin" style={{ background: COLOR_SIN_DEFICIT }} aria-hidden="true" />
              ya tienen un centro cerca
            </li>
          </ul>
        </>
      )}
      <p className="leyenda-donde__centro-simbolo">
        <span className="leyenda-donde__punto" aria-hidden="true" />
        {def.metrica === "plazas" ? "Centro existente (tamaño según sus plazas)" : "Centro existente"}
      </p>
    </details>
  );
}
