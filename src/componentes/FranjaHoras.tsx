import { useMemo, useRef, useState } from "react";
import "./FranjaHoras.css";
import { palabraVariable, partesLocales, type HoraPronostico, type Ventana } from "../lib/franja";
import { etiquetaDeNivel } from "../lib/riesgo";

interface Props {
  horas: readonly HoraPronostico[];
  ahora: Date;
  mejor: Ventana | null;
  /** Modo histórico: la marca se llama con la hora de referencia y los días se nombran por fecha. */
  historico?: boolean;
}

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** «por polen de gramíneas, medido en el captador de Getafe» / «…, según la previsión». */
function causa(h: HoraPronostico): string {
  if (!h.culpable || h.nivel === "bajo" || h.nivel === "sin_dato") return "";
  const por = `, por ${palabraVariable(h.culpable)}`;
  if (h.origen === "medido") return `${por}, medido en ${h.lugarMedido ?? "la red"}`;
  return `${por}, según la previsión`;
}

function nombreDia(fecha: string, hoy: string, corto: boolean, historico = false): string {
  if (!historico && fecha === hoy) return "hoy";
  const manana = new Date(Date.parse(`${hoy}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  if (!historico && fecha === manana) return "mañana";
  const d = new Date(`${fecha}T12:00:00Z`);
  return corto ? DIAS[d.getUTCDay()]! : `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** 48 barras, una por hora, coloreadas con el nivel combinado de lo que le afecta a la persona. */
export function FranjaHoras({ horas, ahora, mejor, historico = false }: Props) {
  const hoy = partesLocales(ahora).fecha;
  const [activa, setActiva] = useState<number | null>(null);
  const [foco, setFoco] = useState(0);
  const barras = useRef<(HTMLButtonElement | null)[]>([]);

  // Hora en curso: la barra cuyo intervalo contiene «ahora» (puede ser anterior a la primera barra).
  const iAhora = useMemo(() => {
    const t = ahora.getTime();
    const i = horas.findIndex((h) => Date.parse(h.iso) <= t && t < Date.parse(h.iso) + 3_600_000);
    return i;
  }, [horas, ahora]);
  const marca = useMemo(() => {
    if (horas.length === 0) return null;
    const t = ahora.getTime();
    const primera = Date.parse(horas[0]!.iso);
    if (t < primera) return t > primera - 3_600_000 ? 0 : null; // justo antes de la primera hora: borde izquierdo
    if (iAhora < 0) return null;
    return iAhora + (t - Date.parse(horas[iAhora]!.iso)) / 3_600_000;
  }, [horas, ahora, iAhora]);

  const tramos = useMemo(() => {
    const t: { fecha: string; desde: number; n: number }[] = [];
    horas.forEach((h, i) => {
      const ultimo = t[t.length - 1];
      if (ultimo && ultimo.fecha === h.fecha) ultimo.n += 1;
      else t.push({ fecha: h.fecha, desde: i, n: 1 });
    });
    return t;
  }, [horas]);

  const enMejor = (iso: string) => !!mejor && iso >= mejor.desde && Date.parse(iso) < Date.parse(mejor.hasta);

  const lectura = activa !== null ? horas[activa] : null;
  const textoLectura = lectura
    ? `${nombreDia(lectura.fecha, hoy, false, historico)}, ${String(lectura.hora).padStart(2, "0")}:00 · ${
        lectura.nivel === "sin_dato"
          ? "sin dato"
          : `nivel ${etiquetaDeNivel(lectura.nivel).toLowerCase()}${causa(lectura)}`
      }${lectura.pasada ? " (ya pasó)" : ""}`
    : "Toca o pasa el ratón por una barra para ver la hora, el nivel y qué lo causa.";

  function mover(e: React.KeyboardEvent, i: number) {
    let n = i;
    if (e.key === "ArrowRight") n = Math.min(i + 1, horas.length - 1);
    else if (e.key === "ArrowLeft") n = Math.max(i - 1, 0);
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = horas.length - 1;
    else return;
    e.preventDefault();
    setFoco(n);
    setActiva(n);
    barras.current[n]?.focus();
  }

  return (
    <figure className="franja">
      <figcaption className="franja__titulo">{historico ? "Las 48 horas de ese día y el siguiente" : "Las próximas 48 horas"}</figcaption>
      <div className="franja__cuerpo" style={{ ["--n" as string]: horas.length }} onPointerLeave={() => setActiva(null)}>
        <div className="franja__dias" aria-hidden="true">
          {tramos.map((t) => (
            <span key={t.fecha} className="franja__dia" style={{ gridColumn: `${t.desde + 1} / span ${t.n}` }}>
              {t.n >= 7 ? nombreDia(t.fecha, hoy, false, historico) : t.n >= 3 ? nombreDia(t.fecha, hoy, true, historico) : ""}
            </span>
          ))}
        </div>

        <div className="franja__barras" role="group" aria-label="Nivel por hora; usa las flechas para recorrerlas">
          {horas.map((h, i) => (
            <button
              key={h.iso}
              ref={(el) => {
                barras.current[i] = el;
              }}
              type="button"
              className={`franja__barra nivel-${h.nivel}${h.pasada ? " franja__barra--pasada" : ""}${enMejor(h.iso) ? " franja__barra--mejor" : ""}${
                activa === i ? " franja__barra--activa" : ""
              }${h.hora === 0 ? " franja__barra--medianoche" : ""}`}
              tabIndex={i === foco ? 0 : -1}
              aria-label={`${nombreDia(h.fecha, hoy, false, historico)} ${String(h.hora).padStart(2, "0")}:00, ${
                h.nivel === "sin_dato" ? "sin dato" : `nivel ${etiquetaDeNivel(h.nivel).toLowerCase()}`
              }${causa(h)}`}
              onPointerEnter={() => setActiva(i)}
              onFocus={() => {
                setFoco(i);
                setActiva(i);
              }}
              onBlur={() => setActiva(null)}
              onClick={() => setActiva(i)}
              onKeyDown={(e) => mover(e, i)}
            />
          ))}
          {marca !== null && (
            <span className={`franja__ahora${marca < 3 ? " franja__ahora--borde" : ""}`} style={{ left: `calc(${marca} / var(--n) * 100%)` }} aria-hidden="true">
              <span>{historico ? `${String(partesLocales(ahora).hora).padStart(2, "0")}:00` : "ahora"}</span>
            </span>
          )}
        </div>

        <div className="franja__horas" aria-hidden="true">
          {horas.map((h, i) =>
            h.hora % 3 === 0 ? (
              <span key={h.iso} className="franja__hora" style={{ gridColumn: `${i + 1} / span 1` }}>
                {h.hora}
              </span>
            ) : null,
          )}
        </div>
      </div>

      <p className="franja__lectura" role="status" aria-live="polite">
        {textoLectura}
      </p>
      <p className="franja__clave">
        <span className="franja__muestra nivel-bajo" /> bajo <span className="franja__muestra nivel-medio" /> medio{" "}
        <span className="franja__muestra nivel-alto" /> alto{" "}
        {mejor && (
          <>
            <span className="franja__subrayado" /> mejor hora
          </>
        )}
        <span className="franja__hora-local">Hora local</span>
      </p>
    </figure>
  );
}
