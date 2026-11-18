import { useMemo, useState, type PointerEvent } from "react";
import { formatearNumero, horaDeSerie } from "../lib/formato";

interface PropsMinigrafica {
  /** 24 valores horarios, del más antiguo al más reciente; `null` si falta el dato. */
  serie: (number | null)[];
  /** Instante del último valor de la serie. */
  horaFinal: string;
  unidad: string;
  /** Nombre de la variable para el texto alternativo. */
  nombre: string;
}

const ANCHO = 300;
const ALTO = 64;
const SUPERIOR = 8;
const INFERIOR = 6;

/** Gráfica de línea de las últimas 24 h, en SVG propio. Los huecos sin dato se dejan en blanco, no se inventan. */
export function Minigrafica({ serie, horaFinal, unidad, nombre }: PropsMinigrafica) {
  const [activo, setActivo] = useState<number | null>(null);

  const g = useMemo(() => {
    const validos = serie.filter((v): v is number => v != null);
    if (validos.length === 0) return null;
    const max = Math.max(...validos);
    const min = Math.min(...validos);
    const techo = Math.max(max * 1.15, 1);
    const n = serie.length;
    const x = (i: number) => (n > 1 ? (i / (n - 1)) * ANCHO : ANCHO / 2);
    const y = (v: number) => ALTO - INFERIOR - (v / techo) * (ALTO - SUPERIOR - INFERIOR);

    // Un tramo por cada racha seguida de datos.
    const tramos: { i: number; v: number }[][] = [];
    let actual: { i: number; v: number }[] = [];
    serie.forEach((v, i) => {
      if (v == null) {
        if (actual.length) tramos.push(actual);
        actual = [];
      } else actual.push({ i, v });
    });
    if (actual.length) tramos.push(actual);

    const linea = tramos
      .map((t) => t.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" "))
      .join(" ");
    const area = tramos
      .filter((t) => t.length > 1)
      .map((t) => {
        const cuerpo = t.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
        return `${cuerpo} L${x(t[t.length - 1]!.i).toFixed(1)} ${ALTO} L${x(t[0]!.i).toFixed(1)} ${ALTO} Z`;
      })
      .join(" ");
    const sueltos = tramos.filter((t) => t.length === 1).map((t) => t[0]!);
    const ultimoIndice = serie.findLastIndex((v) => v != null);
    return { max, min, x, y, linea, area, sueltos, ultimoIndice, faltan: n - validos.length, validos: validos.length };
  }, [serie]);

  if (!g) {
    return <p className="minigrafica minigrafica--vacia">Sin datos horarios en las últimas 24 h.</p>;
  }

  const alMover = (e: PointerEvent<SVGSVGElement>) => {
    const caja = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - caja.left) / caja.width) * (serie.length - 1));
    setActivo(Math.max(0, Math.min(serie.length - 1, i)));
  };

  const indice = activo ?? g.ultimoIndice;
  const valor = serie[indice] ?? null;
  const hora = horaDeSerie(horaFinal, indice, serie.length);
  const resumen =
    `${nombre}, últimas 24 horas: mínimo ${formatearNumero(g.min)} y máximo ${formatearNumero(g.max)} ${unidad}` +
    (g.faltan > 0 ? `; ${g.faltan} horas sin dato` : "") +
    ".";

  return (
    <figure className="minigrafica">
      <div className="minigrafica__lienzo">
      <svg
        viewBox={`0 0 ${ANCHO} ${ALTO}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={resumen}
        onPointerMove={alMover}
        onPointerDown={alMover}
        onPointerLeave={() => setActivo(null)}
      >
        <line className="minigrafica__base" x1="0" x2={ANCHO} y1={ALTO - 0.5} y2={ALTO - 0.5} />
        {g.area && <path className="minigrafica__area" d={g.area} />}
        <path className="minigrafica__linea" d={g.linea} vectorEffect="non-scaling-stroke" />
        {activo != null && (
          <line className="minigrafica__cursor" x1={g.x(indice)} x2={g.x(indice)} y1="0" y2={ALTO} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Los puntos van fuera del SVG estirado para que sigan siendo redondos */}
      {g.sueltos.map((p) => (
        <span key={p.i} className="minigrafica__punto minigrafica__punto--suelto" style={posicion(g.x(p.i), g.y(p.v))} />
      ))}
      {valor != null && <span className="minigrafica__punto" style={posicion(g.x(indice), g.y(valor))} />}
      </div>
      <figcaption className="minigrafica__pie">
        <span>hace 24 h</span>
        <span className="minigrafica__lectura" aria-hidden="true">
          {hora} · {valor != null ? `${formatearNumero(valor)} ${unidad}` : "sin dato"}
        </span>
        <span>{horaDeSerie(horaFinal, serie.length - 1, serie.length)}</span>
      </figcaption>
    </figure>
  );
}

function posicion(x: number, y: number) {
  return { left: `${(x / ANCHO) * 100}%`, top: `${(y / ALTO) * 100}%` };
}
