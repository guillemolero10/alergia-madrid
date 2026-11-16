import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaddingOptions } from "maplibre-gl";
import "./App.css";
import { EsqueletoMapa } from "./componentes/EsqueletoMapa";
import { IconoAviso, Logotipo } from "./componentes/Iconos";
import { Leyenda } from "./componentes/Leyenda";
import type { MapaRef } from "./componentes/Mapa";
import { PanelLugar } from "./componentes/PanelLugar";
import { SelloCapas, SelloCapasEsqueleto } from "./componentes/SelloCapas";
import { cargarEstado, lugares, sellosDeCapas, vientoVigente, type ResultadoCarga } from "./lib/datos";
import { construirFicha } from "./lib/ficha";
import { fechaHoraLarga, horaCorta } from "./lib/formato";
import { COLOR_NIVEL, contarNiveles, nivelVisible, resumirRecuento } from "./lib/riesgo";
import type { CapasVisibles, Nivel, NombreCapa } from "./lib/tipos";
import { useMedia } from "./lib/useMedia";

// MapLibre pesa: va en su propio trozo y se empieza a descargar a la vez que los datos.
const cargarMapa = () => import("./componentes/Mapa");
const Mapa = lazy(cargarMapa);
void cargarMapa();

type Carga =
  | { fase: "cargando" }
  | ({ fase: "lista" } & ResultadoCarga)
  | { fase: "error"; mensaje: string };

const REFRESCO_MS = 10 * 60_000;
const parametros = new URLSearchParams(window.location.search);
/** Solo en desarrollo: `?estado=/ruta.json` permite probar con otro JSON (p. ej. un día con niveles altos). */
const urlDePrueba = import.meta.env.DEV ? (parametros.get("estado") ?? undefined) : undefined;
const baseForzada = parametros.get("base") === "raster" ? "raster" : undefined;

export default function App() {
  const [carga, setCarga] = useState<Carga>({ fase: "cargando" });
  const [capas, setCapas] = useState<CapasVisibles>({ aire: true, polen: true, viento: true });
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => new Date());
  const mapaRef = useRef<MapaRef>(null);
  const esMovil = useMedia("(max-width: 760px)");

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarga({ fase: "cargando" });
    try {
      const resultado = await cargarEstado({ urlRed: urlDePrueba });
      setAhora(new Date());
      setCarga((anterior) => {
        // Un refresco fallido no cambia datos de la red por la copia de respaldo, que es más vieja.
        if (silencioso && anterior.fase === "lista" && anterior.origen === "red" && resultado.origen === "respaldo") {
          return anterior;
        }
        return { fase: "lista", ...resultado };
      });
    } catch (e) {
      if (!silencioso) setCarga({ fase: "error", mensaje: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  useEffect(() => {
    void cargar();
    const refresco = setInterval(() => void cargar(true), REFRESCO_MS);
    const reloj = setInterval(() => setAhora(new Date()), 60_000);
    return () => {
      clearInterval(refresco);
      clearInterval(reloj);
    };
  }, [cargar]);

  const estado = carga.fase === "lista" ? carga.estado : null;
  const origen = carga.fase === "lista" ? carga.origen : "red";

  const sellos = useMemo(() => (estado ? sellosDeCapas(estado, origen, ahora) : null), [estado, origen, ahora]);
  const vigente = useMemo(() => (estado ? vientoVigente(estado, origen, ahora) : false), [estado, origen, ahora]);
  const ficha = useMemo(
    () => (estado && seleccionado ? construirFicha(seleccionado, estado, lugares) : null),
    [estado, seleccionado],
  );

  const recuento = useMemo(() => {
    if (!estado) return null;
    const porLugar = new Map(estado.riesgo.map((r) => [r.lugar, r]));
    return contarNiveles(lugares.estaciones.map((e) => nivelVisible(porLugar.get(e.id), capas)));
  }, [estado, capas]);

  // Hueco que tapan los paneles, para que la cámara centre en la parte libre del mapa.
  const margen = useMemo<PaddingOptions>(() => {
    if (esMovil) {
      // Arriba: marca, resumen, aviso de respaldo (si lo hay) y, con el panel cerrado, las fichas de capas.
      const top = (ficha ? 100 : 166) + (origen === "respaldo" ? 48 : 0);
      return { top, right: 18, left: 18, bottom: ficha ? Math.min(window.innerHeight * 0.54, 480) + 12 : 86 };
    }
    return { top: 78, bottom: 84, left: 344, right: ficha ? 440 : 40 };
  }, [esMovil, ficha, origen]);

  const fichaId = ficha?.id;
  useEffect(() => {
    if (ficha) mapaRef.current?.volarA(ficha.lat, ficha.lon);
    // Solo al cambiar de lugar, no en cada refresco de datos.
  }, [fichaId]);

  const cambiarCapa = useCallback((capa: NombreCapa, visible: boolean) => {
    setCapas((c) => ({ ...c, [capa]: visible }));
  }, []);
  const cerrarPanel = useCallback(() => {
    const id = seleccionado;
    setSeleccionado(null);
    // Devuelve el foco al marcador desde el que se abrió.
    if (id) requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-lugar="${id}"].marcador`)?.focus());
  }, [seleccionado]);

  return (
    <div className={`app${ficha ? " app--con-panel" : ""}`}>
      <a className="saltar" href="#mapa">
        Saltar al mapa
      </a>

      <div className="superior">
        <header className="marca tarjeta">
          <Logotipo />
          <div>
            <h1 className="marca__nombre">
              Alerg<span>IA</span> Madrid
            </h1>
            <p className="marca__lema">Riesgo respiratorio en tiempo real</p>
          </div>
        </header>

        <div className="estado-global">
          {carga.fase === "cargando" && (
            <p className="resumen tarjeta" role="status">
              <span className="resumen__carga" aria-hidden="true" />
              Cargando los datos…
            </p>
          )}
          {estado && recuento && (
            <p className="resumen tarjeta" role="status">
              <BarraNiveles recuento={recuento} />
              <strong>{capas.aire || capas.polen ? resumirRecuento(recuento) : "Capas de riesgo ocultas"}</strong>
              <span className="resumen__hora">
                aire de las <time dateTime={estado.capas.aire.ultimo_dato}>{horaCorta(estado.capas.aire.ultimo_dato)}</time>
              </span>
            </p>
          )}

          {/* Hueco reservado para el selector de fecha (tarea 12): «Ahora» + días históricos. */}
          <div className="hueco-fecha" data-hueco="selector-fecha" />

          {carga.fase === "lista" && carga.origen === "respaldo" && (
            <p className="aviso-respaldo" role="alert">
              <IconoAviso tam={16} />
              <span>
                Datos de respaldo del <strong>{fechaHoraLarga(carga.estado.generado)}</strong>
                <span className="aviso-respaldo__detalle">: no se ha podido leer la última actualización.</span>
              </span>
              <button type="button" className="boton" onClick={() => void cargar()}>
                Reintentar
              </button>
            </p>
          )}
        </div>

        {sellos ? (
          <SelloCapas sellos={sellos} visibles={capas} onCambiar={cambiarCapa} vientoVigente={vigente} ahora={ahora} />
        ) : (
          carga.fase === "cargando" && <SelloCapasEsqueleto />
        )}
      </div>

      <main id="mapa" className="lienzo" tabIndex={-1}>
        {estado ? (
          <Suspense fallback={<EsqueletoMapa />}>
            <Mapa
              ref={mapaRef}
              estado={estado}
              lugares={lugares}
              capas={capas}
              vientoVigente={vigente}
              seleccionado={seleccionado}
              onSeleccionar={setSeleccionado}
              margen={margen}
              forzarBase={baseForzada}
            />
          </Suspense>
        ) : carga.fase === "error" ? (
          <div className="fallo-datos" role="alert">
            <div className="tarjeta fallo-datos__caja">
              <h2>No se han podido cargar los datos</h2>
              <p>
                Ni la última actualización ni la copia de respaldo han respondido. Comprueba la conexión y vuelve a
                intentarlo.
              </p>
              <p className="fallo-datos__detalle dato">{carga.mensaje}</p>
              <button type="button" className="boton" onClick={() => void cargar()}>
                Reintentar
              </button>
            </div>
          </div>
        ) : (
          <EsqueletoMapa texto="Cargando los datos…" />
        )}
      </main>

      {ficha && <PanelLugar ficha={ficha} ahora={ahora} onCerrar={cerrarPanel} onIrA={setSeleccionado} />}

      <div className="pie">
        <Leyenda />
      </div>

      {/* Hueco reservado para el chat plegable (tarea 10). */}
      <div className="hueco-chat" data-hueco="chat" />
    </div>
  );
}

const ORDEN_BARRA: Nivel[] = ["alto", "medio", "bajo", "sin_dato"];

/** Barrita apilada: qué parte de las estaciones está en cada nivel. */
function BarraNiveles({ recuento }: { recuento: Record<Nivel, number> }) {
  const total = ORDEN_BARRA.reduce((suma, n) => suma + recuento[n], 0);
  if (total === 0) return null;
  return (
    <span className="resumen__barra" aria-hidden="true">
      {ORDEN_BARRA.filter((n) => recuento[n] > 0).map((n) => (
        <span key={n} style={{ flexGrow: recuento[n], background: COLOR_NIVEL[n] }} />
      ))}
    </span>
  );
}
