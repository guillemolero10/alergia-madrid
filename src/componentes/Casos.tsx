import { useEffect, useState } from "react";
import "./Casos.css";
import { construirCaso, DEFINICIONES_CASOS, textoMedida, type Caso } from "../lib/casos";
import { cargarDia, fechaLargaDia } from "../lib/dias";
import { lugares } from "../lib/datos";
import { etiquetaVentanaTexto } from "./casosTexto";
import { etiquetaDeNivel } from "../lib/riesgo";
import { nombrePolen } from "../lib/franja";
import { textoAlternativa, textoIgualEnLaZona } from "../lib/vecinos";

type Carga = { fase: "cargando" } | { fase: "lista"; casos: Caso[] } | { fase: "error"; mensaje: string };

// Los días son estáticos: se cargan una vez por visita.
let enCache: Promise<Caso[]> | null = null;
function cargarCasos(): Promise<Caso[]> {
  enCache ??= Promise.all(
    DEFINICIONES_CASOS.map(async (def) => {
      const caso = construirCaso(def, await cargarDia(def.fecha), lugares);
      if (!caso) throw new Error(`No se pudo calcular el caso del ${def.fecha}`);
      return caso;
    }),
  ).catch((e) => {
    enCache = null;
    throw e;
  });
  return enCache;
}

interface Props {
  onVer: (caso: Caso) => void;
}

export function Casos({ onVer }: Props) {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarga({ fase: "cargando" });
    cargarCasos().then(
      (casos) => vivo && setCarga({ fase: "lista", casos }),
      (e) => vivo && setCarga({ fase: "error", mensaje: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      vivo = false;
    };
  }, [intento]);

  return (
    <section className="casos" aria-labelledby="casos-titulo">
      <h2 id="casos-titulo" className="titular titular--medio">
        Qué habría dicho ¿Salimos? ese día
      </h2>
      <p className="respuesta__texto">
        ¿Salimos? no existía en estas fechas. Son tres días señalados de 2026 recalculados con los datos reales de entonces
        (lo medido y lo previsto a las 14:00), con la misma lógica que «Para ti». Las personas son tipos, no casos reales.
      </p>

      {carga.fase === "cargando" && (
        <p className="colegios__carga" role="status">
          Recalculando los tres días…
        </p>
      )}
      {carga.fase === "error" && (
        <div className="aviso" role="alert">
          <span>No se han podido cargar los días de ejemplo ({carga.mensaje}).</span>
          <button type="button" className="boton" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {carga.fase === "lista" && (
        <ol className="casos__lista">
          {carga.casos.map((c) => (
            <li key={c.def.id}>
              <TarjetaCaso caso={c} onVer={onVer} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TarjetaCaso({ caso: c, onVer }: { caso: Caso; onVer: (c: Caso) => void }) {
  const idTitulo = `caso-${c.def.id}`;
  const perfil =
    c.def.perfil.afecta === "aire" ? "Asma o EPOC" : `Alergia a ${c.def.perfil.polenes.map((t) => nombrePolen(t).toLowerCase()).join(", ")}`;
  return (
    <article className={`caso nivel-${c.nivel}`} aria-labelledby={idTitulo}>
      <p className="caso__cuando">
        {fechaLargaDia(c.fecha)}, {c.hora} · {c.municipio.nombre}
      </p>
      <h3 id={idTitulo} className="caso__persona">
        {c.def.persona} {c.def.plan}
      </h3>
      <p className="caso__perfil">Perfil: {perfil}</p>

      <div className="caso__bloque">
        <h4>Qué medían los datos</h4>
        <p>{c.medida ? textoMedida(c.medida) : "Sin mediciones relevantes para este perfil."}</p>
      </div>

      <div className="caso__bloque caso__bloque--dice">
        <h4>Qué habría dicho la app</h4>
        <p className="caso__veredicto">
          <span className={`chip-nivel nivel-${c.nivel}`}>{etiquetaDeNivel(c.nivel)}</span> <span>{capitalizar(c.veredicto)}.</span>
        </p>
        <p>{etiquetaVentanaTexto(c)}</p>
        {c.alternativas.length > 0 && (
          <ul className="caso__alternativas">
            {c.alternativas.map((a) => (
              <li key={a.municipio.id}>{textoAlternativa(a, c.franjaAlternativas)}.</li>
            ))}
          </ul>
        )}
        {c.igualEnLaZona && <p>{textoIgualEnLaZona("historico")}</p>}
        {!c.buscaAlternativa && c.mejor && <p className="caso__nota">Tu mejor franja ya es de nivel bajo: no hace falta cambiar de sitio.</p>}
      </div>

      <button type="button" className="boton caso__ver" onClick={() => onVer(c)}>
        Ver ese día
        <span className="solo-lectores">: {fechaLargaDia(c.fecha)} en {c.municipio.nombre}</span>
      </button>
    </article>
  );
}

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
