import "./SiAquiNo.css";
import { etiquetaDeNivel } from "../lib/riesgo";
import type { Municipio } from "../lib/tipos";
import { textoAlternativa, textoIgualEnLaZona, type Vecinos } from "../lib/vecinos";

interface Props {
  vecinos: Vecinos;
  dia: "hoy" | "manana" | "historico";
  onElegir: (municipio: Municipio) => void;
}

/** «Si aquí no, prueba en…»: solo aparece si a la mejor hora el nivel es medio o alto. */
export function SiAquiNo({ vecinos, dia, onElegir }: Props) {
  if (!vecinos.aplica) return null;
  const { alternativas } = vecinos;
  return (
    <section className="vecinos" aria-labelledby="vecinos-titulo">
      <h3 id="vecinos-titulo" className="vecinos__titulo">
        Si aquí no, prueba en…
      </h3>
      {alternativas.length === 0 ? (
        <p className="vecinos__igual">{textoIgualEnLaZona(dia)}</p>
      ) : (
        <ul className="vecinos__lista">
          {alternativas.map((a) => (
            <li key={a.municipio.id}>
              <button type="button" className={`vecino nivel-${a.nivel}`} onClick={() => onElegir(a.municipio)}>
                <span className={`chip-nivel nivel-${a.nivel}`}>{etiquetaDeNivel(a.nivel)}</span>
                <span className="vecino__texto">{textoAlternativa(a, vecinos.franja)}</span>
                <span className="vecino__ir" aria-hidden="true">
                  Ver
                </span>
                <span className="solo-lectores">: cambiar a {a.municipio.nombre}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
