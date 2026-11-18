import "./SelectorFecha.css";
import { fechaCortaDia, fechaLargaDia, type DiaHistorico } from "../lib/dias";

interface Props {
  dias: readonly DiaHistorico[];
  /** Fecha elegida; `null` = hoy. */
  fecha: string | null;
  onElegir: (fecha: string | null) => void;
}

/** «Hoy» + días señalados de 2026, en chips con desplazamiento horizontal (cómodos con el pulgar). */
export function SelectorFecha({ dias, fecha, onElegir }: Props) {
  if (dias.length === 0) return null;
  return (
    <section className="fechas" aria-labelledby="fechas-titulo" data-hueco="selector-fecha">
      <h2 id="fechas-titulo" className="fechas__rotulo">
        ¿Qué día quieres ver?
      </h2>
      <div className="fechas__lista" role="group" aria-labelledby="fechas-titulo">
        <button type="button" className="fecha" aria-pressed={fecha === null} onClick={() => onElegir(null)}>
          <span className="fecha__dia">Hoy</span>
          <span className="fecha__titulo">Tiempo real</span>
        </button>
        {dias.map((d) => (
          <button
            key={d.fecha}
            type="button"
            className="fecha"
            aria-pressed={fecha === d.fecha}
            aria-label={`${fechaLargaDia(d.fecha)}: ${d.titulo}`}
            onClick={() => onElegir(d.fecha)}
          >
            <span className="fecha__dia">{fechaCortaDia(d.fecha)}</span>
            <span className="fecha__titulo">{d.titulo}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
