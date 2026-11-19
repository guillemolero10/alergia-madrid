import { useCallback, useId, useRef, useState } from "react";
import "./EmpiezaAqui.css";

const CLAVE = "donde:empieza-aqui";

/** Lo recordado en este navegador: `cerrado` si ya se usó o se ocultó. Con el almacenamiento bloqueado (modo privado), siempre abierto. */
export function leerCerrado(): boolean {
  try {
    return window.localStorage.getItem(CLAVE) === "cerrado";
  } catch {
    return false;
  }
}

export function guardarCerrado(cerrado: boolean): void {
  try {
    if (cerrado) window.localStorage.setItem(CLAVE, "cerrado");
    else window.localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: no se recuerda */
  }
}

/**
 * Traga los clics durante `ms` (por defecto 700): al elegir un ejemplo el bloque se pliega y el panel sube; un segundo clic del mismo gesto
 * (doble clic o doble toque) caería sobre lo que haya quedado bajo el cursor (p. ej. «2030»). Devuelve la función que lo quita antes.
 */
export function bloquearClics(destino: EventTarget = window, ms = 700): () => void {
  const tragar = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  destino.addEventListener("click", tragar, { capture: true });
  destino.addEventListener("dblclick", tragar, { capture: true });
  const quitar = () => {
    destino.removeEventListener("click", tragar, { capture: true });
    destino.removeEventListener("dblclick", tragar, { capture: true });
  };
  setTimeout(quitar, ms);
  return quitar;
}

interface Ejemplo {
  id: "pinto" | "2030" | "municipio";
  titulo: string;
  detalle: string;
}

/** Textos sin cifras: lo que se verá sale del motor, no de aquí. */
export const EJEMPLOS: readonly Ejemplo[] = [
  { id: "pinto", titulo: "Una residencia en Pinto frente a la mejor ubicación", detalle: "Mira cuántas plazas más cubre y cuánto se acerca a la mejor opción." },
  { id: "2030", titulo: "Madrid en 2030", detalle: "Cómo cambia la cobertura de residencias cuando haya más mayores." },
  { id: "municipio", titulo: "Conoce los servicios de tu municipio", detalle: "Busca el tuyo y mira qué tiene y dónde ayudaría más un centro nuevo." },
];

interface Props {
  onElegir: (id: Ejemplo["id"]) => void;
}

function Flecha() {
  return (
    <svg className="empieza__flecha" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** «Empieza aquí»: tres escenas de un clic para quien abre la web sin que nadie se la explique. Se pliega y se recuerda. */
export function EmpiezaAqui({ onElegir }: Props) {
  const [cerrado, setCerrado] = useState(leerCerrado);
  const id = useId();
  const botonAbrir = useRef<HTMLButtonElement>(null);
  const cambiar = useCallback((c: boolean) => {
    setCerrado(c);
    guardarCerrado(c);
  }, []);

  if (cerrado) {
    return (
      <div className="empieza empieza--plegado">
        <button ref={botonAbrir} type="button" className="empieza__abrir" aria-expanded={false} onClick={() => cambiar(false)}>
          Ver ejemplos de un clic
        </button>
      </div>
    );
  }

  return (
    <section className="empieza" aria-labelledby={`${id}-titulo`}>
      <div className="empieza__cabecera">
        <h2 id={`${id}-titulo`} className="rotulo-seccion empieza__titulo">
          Empieza aquí
        </h2>
        <button type="button" className="empieza__cerrar" aria-expanded={true} aria-controls={`${id}-lista`} onClick={() => cambiar(true)}>
          Ocultar
        </button>
      </div>
      <ul id={`${id}-lista`} className="empieza__lista">
        {EJEMPLOS.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="empieza__ejemplo"
              onClick={() => {
                bloquearClics();
                cambiar(true);
                onElegir(e.id);
                // El botón pulsado desaparece al plegar: el foco pasa a «Ver ejemplos» (en «Mi municipio» lo coge el buscador un poco después).
                requestAnimationFrame(() => botonAbrir.current?.focus({ preventScroll: true }));
              }}
            >
              <span className="empieza__texto">
                <span className="empieza__ejemplo-titulo">{e.titulo}</span>
                <span className="empieza__detalle">{e.detalle}</span>
              </span>
              <Flecha />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
