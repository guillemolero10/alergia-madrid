import "./BandaHistorica.css";
import { fechaLargaDia, type DiaHistorico } from "../lib/dias";

interface Props {
  fecha: string;
  dia: DiaHistorico | undefined;
  onVolver: () => void;
}

/** Franja fija y muy visible mientras se ve un día pasado. */
export function BandaHistorica({ fecha, dia, onVolver }: Props) {
  return (
    <div className="banda" role="status">
      <div className="banda__texto">
        <p className="banda__titulo">
          Estás viendo el {fechaLargaDia(fecha)}
          {dia ? <> · {dia.titulo}</> : null}
        </p>
        {dia?.nota && <p className="banda__nota">{dia.nota}</p>}
      </div>
      <button type="button" className="banda__volver" onClick={onVolver}>
        Volver a hoy
      </button>
    </div>
  );
}
