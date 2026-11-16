import { useRef, type CSSProperties, type PointerEvent } from "react";
import { etiquetaDeNivel } from "../lib/riesgo";
import type { Nivel } from "../lib/tipos";

export type FormaMarcador = "estacion" | "captador" | "municipio";

interface PropsMarcador {
  id: string;
  forma: FormaMarcador;
  nombre: string;
  /** `null`: sus capas están apagadas y el marcador se atenúa. */
  nivel: Nivel | null;
  /** Segunda línea del rótulo (p. ej. «Riesgo bajo · dato de las 13:00»). */
  detalle: string;
  seleccionado: boolean;
  /** Orden de aparición al cargar (onda desde el centro de Madrid). */
  orden: number;
  /** `punto` es dónde se pulsó (coordenadas de ventana); `null` si fue con el teclado. */
  onPulsar: (id: string, punto: { x: number; y: number } | null) => void;
}

const NOMBRE_FORMA: Record<FormaMarcador, string> = {
  estacion: "Estación",
  captador: "Captador de polen",
  municipio: "Municipio",
};

/**
 * Marcador del mapa: un botón de verdad (enfocable con el teclado y con nombre accesible).
 * El nivel se codifica por color y, además, por tamaño, número de ondas y ritmo del pulso.
 */
export function Marcador({ id, forma, nombre, nivel, detalle, seleccionado, orden, onPulsar }: PropsMarcador) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const clase = nivel ?? "apagado";

  // Si el gesto empezó sobre el marcador pero era para arrastrar el mapa, no cuenta como pulsación.
  const alBajar = (e: PointerEvent) => {
    inicio.current = { x: e.clientX, y: e.clientY };
  };
  const alPulsar = (e: { clientX: number; clientY: number; detail: number }) => {
    const p = inicio.current;
    inicio.current = null;
    if (p && e.detail > 0 && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
    onPulsar(id, e.detail > 0 ? { x: e.clientX, y: e.clientY } : null);
  };

  const estilo = { "--orden": orden } as CSSProperties;
  const etiqueta = nivel ? `${NOMBRE_FORMA[forma]} ${nombre}: ${detalle}` : `${NOMBRE_FORMA[forma]} ${nombre}: capa oculta`;

  return (
    <button
      type="button"
      className={`marcador marcador--${forma} nivel-${clase}`}
      data-lugar={id}
      data-nivel={clase}
      aria-label={`${etiqueta}. Abrir detalle`}
      aria-pressed={seleccionado}
      style={estilo}
      onPointerDown={alBajar}
      onClick={alPulsar}
    >
      {forma === "estacion" && nivel && nivel !== "sin_dato" && (
        <>
          <span className="marcador__halo" aria-hidden="true" />
          <span className="marcador__onda" aria-hidden="true" />
          {nivel === "alto" && <span className="marcador__onda marcador__onda--2" aria-hidden="true" />}
        </>
      )}
      <span className="marcador__nucleo" aria-hidden="true" />
      <span className="marcador__rotulo" aria-hidden="true">
        <strong>{nombre}</strong>
        <span>{nivel ? detalle : "Capa oculta"}</span>
      </span>
    </button>
  );
}

export function detalleDeNivel(nivel: Nivel, prefijo = "Riesgo"): string {
  return nivel === "sin_dato" ? "Sin dato" : `${prefijo} ${etiquetaDeNivel(nivel).toLowerCase()}`;
}
