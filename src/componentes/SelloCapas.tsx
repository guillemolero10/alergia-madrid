import "./SelloCapas.css";
import type { SelloCapa } from "../lib/datos";
import { formatearUltimoDato } from "../lib/formato";
import type { CapasVisibles, NombreCapa } from "../lib/tipos";
import { IconoAire, IconoAviso, IconoPolen, IconoViento } from "./Iconos";

interface PropsSello {
  sellos: Record<NombreCapa, SelloCapa>;
  visibles: CapasVisibles;
  onCambiar: (capa: NombreCapa, visible: boolean) => void;
  /** `false` cuando el viento ha caducado y las flechas se ocultan. */
  vientoVigente: boolean;
  ahora: Date;
  /** Modo histórico: las fechas se enseñan absolutas, nunca «hoy». */
  historico?: boolean;
}

const CAPAS: { nombre: NombreCapa; titulo: string; ayuda: string; Icono: typeof IconoAire }[] = [
  { nombre: "aire", titulo: "Aire", ayuda: "28 estaciones, dato horario", Icono: IconoAire },
  { nombre: "polen", titulo: "Polen", ayuda: "captadores, dato diario o semanal", Icono: IconoPolen },
  { nombre: "viento", titulo: "Viento", ayuda: "dirección y velocidad", Icono: IconoViento },
];

/** Tres interruptores (aire, polen y viento) con la fecha del último dato de cada capa siempre a la vista. */
export function SelloCapas({ sellos, visibles, onCambiar, vientoVigente, ahora, historico = false }: PropsSello) {
  return (
    <section className="sello tarjeta" aria-labelledby="sello-titulo">
      <h2 id="sello-titulo" className="sello__titulo">
        Capas del mapa
      </h2>
      <ul className="sello__lista">
        {CAPAS.map(({ nombre, titulo, ayuda, Icono }) => {
          const sello = sellos[nombre];
          const id = `capa-${nombre}`;
          let aviso = sello.aviso;
          if (nombre === "viento" && sello.disponible && !vientoVigente) {
            aviso = aviso ? `${aviso}. Flechas ocultas` : "Viento sin actualizar: flechas ocultas";
          }
          return (
            <li key={nombre} className={`sello__capa${aviso ? " sello__capa--aviso" : ""}`} data-capa={nombre}>
              <label className="sello__etiqueta" htmlFor={id}>
                <Icono className="sello__icono" />
                <span className="sello__nombre">{titulo}</span>
                <span className="solo-lectores">: {ayuda}</span>
              </label>
              <input
                id={id}
                className="interruptor"
                type="checkbox"
                role="switch"
                checked={sello.disponible && visibles[nombre]}
                disabled={!sello.disponible}
                onChange={(e) => onCambiar(nombre, e.target.checked)}
                aria-describedby={`${id}-dato`}
              />
              <p id={`${id}-dato`} className="sello__dato">
                {sello.ultimoDato ? (
                  <>
                    Último dato:{" "}
                    <time dateTime={sello.ultimoDato}>
                      {formatearUltimoDato(sello.ultimoDato, ahora, historico)}
                    </time>
                  </>
                ) : (
                  "Aún sin datos publicados"
                )}
              </p>
              {aviso && (
                <p className="sello__aviso">
                  <IconoAviso />
                  <span>{aviso}</span>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function SelloCapasEsqueleto() {
  return (
    <section className="sello tarjeta sello--esqueleto" aria-busy="true" aria-label="Capas: cargando datos">
      <h2 className="sello__titulo">Capas del mapa</h2>
      <ul className="sello__lista" aria-hidden="true">
        {CAPAS.map(({ nombre, titulo, Icono }) => (
          <li key={nombre} className="sello__capa">
            <span className="sello__etiqueta">
              <Icono className="sello__icono" />
              <span className="sello__nombre">{titulo}</span>
            </span>
            <span className="interruptor interruptor--falso" />
            <p className="sello__dato">
              <span className="hueso" />
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
