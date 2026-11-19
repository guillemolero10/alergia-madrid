import { useRef } from "react";
import "./Leyenda.css";
import umbralesJson from "../../datos-estaticos/umbrales.json";
import { lugares } from "../lib/datos";
import { formatearNumero } from "../lib/formato";
import { nombrePolen, type Perfil } from "../lib/franja";
import { nombreVariable } from "../lib/riesgo";
import { IconoCerrar, IconoInfo, IconoPolen, IconoViento } from "./Iconos";

// Los cortes se leen del mismo fichero que usa el pipeline: la leyenda no puede desfasarse de las reglas.
interface UmbralAire {
  promedio: string;
  bajo_max: number;
  medio_max: number;
}
const aire = umbralesJson.aire as unknown as Record<string, UmbralAire>;

interface UmbralPolen {
  nombre: string;
  metodo: string;
  medio_min: number;
  alto_min: number;
}
const polen = umbralesJson.polen.tipos as unknown as Record<string, UmbralPolen>;
const tiposPorMetodo = (metodo: string) => Object.values(polen).filter((t) => t.metodo === metodo).length;
const sueloPropio = umbralesJson.polen.suelo_propio;

/** Los pólenes más alergénicos en Madrid, para la tabla de ejemplo (clave de umbrales.json). */
const POLENES_TABLA = ["gramineas", "olivo", "cupresaceas_taxaceas", "platano_de_paseo", "artemisia", "abedul"];

const CRITERIO: Record<string, string> = {
  oficial_palinocam: "Red PALINOCAM",
  clinico_rea: "REA",
  percentil_con_suelo: "Propio",
};

const URL_PALINOCAM =
  "https://airedemadrid.madrid.es/UnidadesDescentralizadas/Sostenibilidad/CalidadAire/Portal/02_Actuaciones/02%20Ficheros/Informe_Analisis_Polen_Noviembre_2025.pdf";
const URL_DATOS_MD = "https://github.com/guillemolero10/donde-hace-falta/blob/main/DATOS.md";

const PROMEDIO: Record<string, string> = {
  hora: "Valor de la última hora",
  media_movil_8h: "Media móvil de 8 h",
  media_movil_24h: "Media móvil de 24 h",
};

const VARIABLES = ["no2", "o3", "pm10", "pm25"];
const captadoresActivos = lugares.captadores.filter((c) => c.activo).length;

const NIVELES = [
  {
    nivel: "bajo",
    titulo: "Bajo",
    aire: "Calidad del aire «buena» o «razonablemente buena».",
    polen: "Todos los tipos de polen por debajo de su umbral medio.",
  },
  {
    nivel: "medio",
    titulo: "Medio",
    aire: "Calidad del aire «regular».",
    polen: "Algún tipo de polen entre su umbral medio y el alto.",
  },
  {
    nivel: "alto",
    titulo: "Alto",
    aire: "Calidad del aire «desfavorable» o peor.",
    polen: "Algún tipo de polen en su umbral alto o por encima.",
  },
  {
    nivel: "sin_dato",
    titulo: "Sin dato",
    aire: "No hay una medición válida reciente.",
    polen: "El último dato de polen tiene más de 7 días.",
  },
] as const;

interface PropsLeyenda {
  perfil: Pick<Perfil, "afecta" | "polenes">;
}

/** «Según tu perfil: asma o EPOC», «…alergia al polen (gramíneas, olivo)». */
export function textoPerfilLeyenda(perfil: Pick<Perfil, "afecta" | "polenes">): string {
  const polenes = perfil.polenes.length > 0 ? ` (${perfil.polenes.map((t) => nombrePolen(t).toLowerCase()).join(", ")})` : "";
  if (perfil.afecta === "aire") return "Según tu perfil: asma o EPOC";
  if (perfil.afecta === "polen") return `Según tu perfil: alergia al polen${polenes}`;
  return `Según tu perfil: asma y alergia al polen${polenes}`;
}

/** Tira con los niveles (siempre visible) y diálogo con el significado, los umbrales y las fuentes. */
export function Leyenda({ perfil }: PropsLeyenda) {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <section className="leyenda tarjeta" aria-label="Leyenda del mapa">
        <p className="leyenda__perfil">
          {textoPerfilLeyenda(perfil)}
        </p>
        <ul className="leyenda__niveles">
          {NIVELES.map((n) => (
            <li key={n.nivel} className={`leyenda__nivel nivel-${n.nivel}`}>
              <span className="leyenda__punto" aria-hidden="true" />
              {n.titulo}
            </li>
          ))}
        </ul>
        <ul className="leyenda__simbolos">
          <li>
            <IconoPolen tam={15} /> Captador de polen
          </li>
          <li>
            <IconoViento tam={15} className="leyenda__viento" /> Viento
          </li>
        </ul>
        <button
          type="button"
          className="boton leyenda__boton"
          onClick={() => dialogoRef.current?.showModal()}
          aria-haspopup="dialog"
        >
          <IconoInfo />
          <span>Niveles y fuentes</span>
        </button>
      </section>

      <dialog
        ref={dialogoRef}
        className="metodo"
        aria-labelledby="metodo-titulo"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close(); // pulsar fuera cierra
        }}
      >
        <div className="metodo__caja">
          <header className="metodo__cabecera">
            <div>
              <p className="panel__antetitulo">Cómo leer el mapa</p>
              <h2 id="metodo-titulo">Niveles, umbrales y fuentes</h2>
            </div>
            <button type="button" className="boton boton--icono" onClick={() => dialogoRef.current?.close()} aria-label="Cerrar">
              <IconoCerrar />
            </button>
          </header>

          <div className="metodo__cuerpo">
            <p className="metodo__entrada">
              Cada estación se pinta con el peor nivel de lo que te afecta según tu perfil: el aire si tienes asma o EPOC,
              los pólenes que has marcado si eres alérgico, o ambos. Los niveles salen de reglas
              fijas, no de una estimación de la IA.
            </p>

            <ul className="metodo__niveles">
              {NIVELES.map((n) => (
                <li key={n.nivel} className={`nivel-${n.nivel}`}>
                  <span className={`chip-nivel nivel-${n.nivel}`}>{n.titulo}</span>
                  <p>
                    {n.aire} {n.polen}
                  </p>
                </li>
              ))}
            </ul>

            <h3>Umbrales del aire</h3>
            <p>
              Bandas del Índice Nacional de Calidad del Aire (Orden TEC/351/2019 y{" "}
              <a href="https://www.boe.es/diario_boe/txt.php?id=BOE-A-2020-10426" target="_blank" rel="noopener noreferrer">
                Resolución de 2 de septiembre de 2020, BOE
              </a>
              ), en µg/m³.
            </p>
            <div className="metodo__tabla" role="region" aria-label="Tabla de umbrales del aire" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Contaminante</th>
                    <th scope="col">Se compara</th>
                    <th scope="col" className="nivel-bajo">Bajo</th>
                    <th scope="col" className="nivel-medio">Medio</th>
                    <th scope="col" className="nivel-alto">Alto</th>
                  </tr>
                </thead>
                <tbody>
                  {VARIABLES.map((v) => {
                    const u = aire[v];
                    if (!u) return null;
                    return (
                      <tr key={v}>
                        <th scope="row">{nombreVariable(v).corto}</th>
                        <td>{PROMEDIO[u.promedio] ?? u.promedio}</td>
                        <td className="dato">≤ {formatearNumero(u.bajo_max)}</td>
                        <td className="dato">
                          {formatearNumero(u.bajo_max + 1)}–{formatearNumero(u.medio_max)}
                        </td>
                        <td className="dato">&gt; {formatearNumero(u.medio_max)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h3>Umbrales del polen</h3>
            <p>
              Cada tipo de polen tiene sus propios cortes, en granos/m³ sobre el valor diario. Usamos, por este orden:
              los umbrales de la{" "}
              <a href={URL_PALINOCAM} target="_blank" rel="noopener noreferrer">
                Red PALINOCAM de la Comunidad de Madrid
              </a>{" "}
              ({tiposPorMetodo("oficial_palinocam")} tipos; son percentiles de sus series {umbralesJson.polen.periodo}, no
              umbrales de síntomas), las categorías clínicas de la Red Española de Aerobiología, REA (
              {tiposPorMetodo("clinico_rea")} tipos) y, para los que no tienen umbral publicado, un criterio propio con un
              suelo de {formatearNumero(sueloPropio.medio)} y {formatearNumero(sueloPropio.alto)} granos/m³.
            </p>
            <div className="metodo__tabla" role="region" aria-label="Tabla de umbrales del polen" tabIndex={0}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Polen</th>
                    <th scope="col" className="nivel-medio">Medio desde</th>
                    <th scope="col" className="nivel-alto">Alto desde</th>
                    <th scope="col">Criterio</th>
                  </tr>
                </thead>
                <tbody>
                  {POLENES_TABLA.map((clave) => {
                    const t = polen[clave];
                    if (!t) return null;
                    return (
                      <tr key={clave}>
                        <th scope="row">{t.nombre}</th>
                        <td className="dato">{formatearNumero(t.medio_min)}</td>
                        <td className="dato">{formatearNumero(t.alto_min)}</td>
                        <td>{CRITERIO[t.metodo] ?? t.metodo}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="metodo__detalle">
              El polen solo cuenta en el riesgo si el dato tiene 7 días o menos. La tabla completa y las fuentes están en{" "}
              <a href={URL_DATOS_MD} target="_blank" rel="noopener noreferrer">
                DATOS.md
              </a>
              .
            </p>

            <h3>Símbolos</h3>
            <ul className="metodo__simbolos">
              <li>
                <span className="simbolo simbolo--estacion" aria-hidden="true" />
                Estación de calidad del aire ({lugares.estaciones.length}). El círculo es más grande cuanto mayor es el nivel.
              </li>
              <li>
                <span className="simbolo simbolo--captador" aria-hidden="true" />
                Captador de polen ({lugares.captadores.length}, {captadoresActivos} con datos este año).
              </li>
              <li>
                <span className="simbolo simbolo--municipio" aria-hidden="true" />
                Madrid capital: no tiene estación de la red de la Comunidad y se muestra la más cercana. El resto de municipios
                sin estación solo se dibuja al elegirlo.
              </li>
              <li>
                <IconoViento tam={18} className="leyenda__viento" />
                Viento: la flecha apunta hacia donde sopla y crece con la velocidad.
              </li>
            </ul>

            <h3>Fuentes y licencias</h3>
            <ul className="metodo__fuentes">
              <li>
                <a href="https://datos.comunidad.madrid/catalogo/dataset/calidad_aire_datos_dia" target="_blank" rel="noopener noreferrer">
                  Calidad del aire, datos del día
                </a>
                ,{" "}
                <a href="https://datos.comunidad.madrid/catalogo/dataset/mediciones_polen" target="_blank" rel="noopener noreferrer">
                  mediciones de polen
                </a>
                ,{" "}
                <a href="https://datos.comunidad.madrid/catalogo/dataset/calidad_aire_estaciones" target="_blank" rel="noopener noreferrer">
                  estaciones
                </a>{" "}
                y{" "}
                <a href="https://datos.comunidad.madrid/catalogo/dataset/captadores_polen" target="_blank" rel="noopener noreferrer">
                  captadores
                </a>
                . Fuente: Comunidad de Madrid, portal de datos abiertos. Licencia CC BY 4.0.
              </li>
              <li>
                Viento:{" "}
                <a href="https://open-meteo.com" target="_blank" rel="noopener noreferrer">
                  Open-Meteo
                </a>
                . Licencia CC BY 4.0.
              </li>
              <li>
                Previsión de aire y polen: Open-Meteo Air Quality API (CAMS Europa). Licencia CC BY 4.0. Generated using
                Copernicus Atmosphere Monitoring Service information 2026.
              </li>
              <li>Mapa base: OpenFreeMap, © OpenMapTiles y © colaboradores de OpenStreetMap.</li>
            </ul>

            <p className="metodo__nota">
              Los datos de aire del día son provisionales. Esta web es orientativa y no sustituye al consejo médico.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
