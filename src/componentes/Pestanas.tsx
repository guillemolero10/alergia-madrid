import { useRef, type KeyboardEvent } from "react";
import "./Pestanas.css";
import type { Vista } from "../lib/vista";

const PESTANAS: { id: Vista; texto: string }[] = [
  { id: "para-ti", texto: "Para ti" },
  { id: "colegios", texto: "Colegios" },
  { id: "casos", texto: "Casos" },
];

export const idPestana = (v: Vista) => `pestana-${v}`;
export const ID_PANEL_VISTA = "panel-vista";

interface Props {
  vista: Vista;
  onElegir: (v: Vista) => void;
}

/** Apartados de la columna: pestañas de verdad (flechas, Inicio y Fin; el panel va enlazado por ARIA). */
export function Pestanas({ vista, onElegir }: Props) {
  const botones = useRef<Record<string, HTMLButtonElement | null>>({});

  function alTeclear(e: KeyboardEvent, i: number) {
    const ultimo = PESTANAS.length - 1;
    const destino = e.key === "ArrowRight" ? (i + 1) % PESTANAS.length : e.key === "ArrowLeft" ? (i + ultimo) % PESTANAS.length : e.key === "Home" ? 0 : e.key === "End" ? ultimo : null;
    if (destino === null) return;
    e.preventDefault();
    const nueva = PESTANAS[destino]!;
    onElegir(nueva.id);
    botones.current[nueva.id]?.focus();
  }

  return (
    <div className="pestanas" role="tablist" aria-label="Apartados">
      {PESTANAS.map((p, i) => (
        <button
          key={p.id}
          ref={(el) => {
            botones.current[p.id] = el;
          }}
          type="button"
          role="tab"
          id={idPestana(p.id)}
          className="pestana"
          aria-selected={vista === p.id}
          aria-controls={ID_PANEL_VISTA}
          tabIndex={vista === p.id ? 0 : -1}
          onClick={() => onElegir(p.id)}
          onKeyDown={(e) => alTeclear(e, i)}
        >
          {p.texto}
        </button>
      ))}
    </div>
  );
}
