import type { ReactNode } from "react";
import { SERVICIOS } from "../lib/donde/servicios";
import { COMUNIDAD, URL_REPO } from "../lib/fuentes";
import "./Metodologia.css";

// Fuentes y límites en la propia web: las bases del concurso piden citar los conjuntos y declarar el código reutilizado.
// Las URLs salen de `fuente` de cada JSON de `public/donde/`, de DATOS-DONDE.md y de `pipeline/`.

function Enlace({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export const LIMITES: ReactNode[] = [
  <>
    <strong>Distancias en línea recta</strong>, no por carretera ni a pie: un río o una autopista no cuentan.
  </>,
  <>
    <strong>La unidad es la sección censal</strong> (4.518 en la Comunidad). Cada una se representa con un punto interior, y la gente de la sección se
    considera que vive ahí.
  </>,
  <>
    <strong>La edad de 3 a 16 años es una estimación</strong>: el INE publica tramos de 5 años, y el grupo se reparte a partes iguales dentro de cada tramo.
  </>,
  <>
    <strong>Plazas autorizadas, no libres</strong>: el registro no dice cuántas están ocupadas ni cuántas son públicas.
  </>,
  <>
    <strong>18 residencias sin coordenadas</strong> (el 4,7 % de las plazas) no se dibujan ni cuentan.
  </>,
  <>
    <strong>Hospitales: solo los generales.</strong> Los centros sanitarios no traen nombre propio en la fuente, así que se nombran por su dirección o por el
    municipio.
  </>,
  <>
    <strong>Los centros de día no se tratan como residencias.</strong> El registro llama «centro de día» a 230 hogares y clubes de mayores (el 76 % de esas
    plazas): contarlos daba 5,4 plazas por cada 100 mayores frente a 1,2 del IMSERSO. Se muestran aparte, en «Otros servicios sociales».
  </>,
  <>
    <strong>Servicios sociales sensibles</strong> (acogida, pisos tutelados, menores, personas sin hogar…): no se muestran con su nombre ni su dirección. Solo se
    cuentan por municipio y distrito, y su punto en el mapa es el centro de su sección censal. Las residencias de mayores sí aparecen con su ubicación, porque
    son servicios abiertos al público.
  </>,
  <>
    <strong>Desfibriladores agrupados:</strong> el registro tiene 13.680 equipos, pero 3.135 están dados de alta en solo 6 direcciones (2.200 en una calle de
    Retiro): son equipos móviles registrados en una sede. Cada una de esas 6 direcciones cuenta como un punto, así que mostramos 10.551 puntos con
    desfibrilador. La cobertura por distancia no cambia.
  </>,
  <>
    <strong>Aire de hoy:</strong> la red de calidad del aire de la capital es del Ayuntamiento y no está en este portal, así que cada distrito usa la estación
    de la Comunidad más cercana a su centro (Leganés, Coslada, Pozuelo de Alarcón, Alcobendas, Getafe, Rivas-Vaciamadrid o Las Rozas, a varios kilómetros) y Madrid
    entera, la de Pozuelo. La ficha avisa cuando la estación está lejos o el dato es antiguo.
  </>,
  <>
    <strong>2030 es una proyección, no un dato.</strong> El total y la edad de la Comunidad son del INE (escenario central); el reparto por sección es un
    modelo nuestro. Probado de 2021 a 2025, el error medio ponderado por población fue del 1,3 % en mayores de 65 y del 1,8 % en mayores de 75; en un municipio típico, del 3,3 % y del 5,5 % (en pueblos pequeños, más). No incluye vivienda
    nueva ni cambios locales de migración. La referencia de residencias se mantiene en el valor de hoy y los centros son los de hoy.
  </>,
  <>
    <strong>Municipios rurales:</strong> la distancia de cada sección censal se mide desde un punto interior de la sección. En el campo las secciones son enormes y ese punto puede
    quedar lejos del casco, así que en un municipio con un centro dentro y secciones de más de 5 km² de media no damos el porcentaje de vecinos «lejos» (en la ficha) y lo marcamos
    como aproximado (en los rankings).
  </>,
  <>
    <strong>Las referencias de residencias</strong> son comparaciones, no un mínimo legal. Por defecto usamos la media de España del IMSERSO (4,05 plazas por
    cada 100 mayores de 65), una cifra oficial y externa; también puedes elegir la media de Madrid del IMSERSO o la media de la Comunidad que sale del
    registro de centros. El IMSERSO cuenta lo que declara cada comunidad.
  </>,
];

/** «Metodología y fuentes»: desplegable de la cabecera con cada conjunto enlazado y su licencia, los límites del cálculo y el código reutilizado. */
export function Metodologia() {
  const urlImserso = SERVICIOS.residencia.imserso?.url ?? "https://imserso.es";
  return (
    <details className="como metodologia" id="metodologia">
      <summary className="como__titulo">Metodología y fuentes</summary>
      <div className="metodologia__cuerpo">
        <h2 className="metodologia__h">Fuentes de datos</h2>
        <p className="metodologia__p">
          <strong>Portal de datos abiertos de la Comunidad de Madrid</strong>, licencia{" "}
          <Enlace href="https://creativecommons.org/licenses/by/4.0/deed.es">CC BY 4.0</Enlace> (fuente: Comunidad de Madrid):
        </p>
        <ul className="metodologia__lista">
          {COMUNIDAD.map((c) => (
            <li key={c.id}>
              <Enlace href={c.url}>{c.nombre}</Enlace>: {c.uso}.
            </li>
          ))}
        </ul>
        <p className="metodologia__p">
          <strong>INE</strong>, licencia CC BY 4.0 (fuente: INE):
        </p>
        <ul className="metodologia__lista">
          <li>
            <Enlace href="https://www.ine.es/jaxiT3/Tabla.htm?t=69213">Censo anual de población por sección censal, tabla 69213</Enlace> (1 de enero de 2025):
            7.113.886 habitantes.
          </li>
          <li>
            <Enlace href="https://www.ine.es/prodyser/cartografia/seccionado_2025.zip">Seccionado censal 2025</Enlace>: los límites de las 4.518 secciones.
          </li>
          <li>
            <Enlace href="https://ine.es/dyngs/Prensa/PROP20262076.htm">Proyecciones de población 2026-2076</Enlace> (escenario central), tal como las publica la
            Comunidad.
          </li>
        </ul>
        <p className="metodologia__p">
          <strong>Referencias y normativa:</strong>
        </p>
        <ul className="metodologia__lista">
          <li>
            <Enlace href={urlImserso}>IMSERSO, «Servicios sociales dirigidos a personas mayores 2024» (a 31-dic-2024)</Enlace>: 4,05 plazas de residencia por cada 100
            mayores en España y 4,21 en Madrid.
          </li>
          <li>
            <Enlace href="https://www.bocm.es/boletin/CM_Orden_BOCM/2017/09/14/BOCM-20170914-1.PDF">Decreto 78/2017 de la Comunidad de Madrid</Enlace> sobre
            desfibriladores fuera del ámbito sanitario: obliga a tenerlos a ciertos locales (por ejemplo, los centros educativos); no fija un ratio por población.
          </li>
        </ul>
        <p className="metodologia__p">
          <strong>Nombres y puntos de los municipios:</strong> Obra derivada de Núcleos de población y Unidades administrativas (IGN-INE, 2025){" "}
          <Enlace href="https://creativecommons.org/licenses/by/4.0/deed.es">CC-BY 4.0</Enlace> <Enlace href="https://www.ign.es">ign.es</Enlace>.
        </p>
        <p className="metodologia__p">
          <strong>Aire de hoy:</strong> las mediciones son de la red de calidad del aire de la Comunidad de Madrid (CC BY 4.0). La previsión usa{" "}
          <Enlace href="https://open-meteo.com">Open-Meteo</Enlace> (CC BY 4.0): Generated using Copernicus Atmosphere Monitoring Service information 2026.
        </p>
        <p className="metodologia__p">
          <strong>Mapa:</strong> <Enlace href="https://openfreemap.org">OpenFreeMap</Enlace> ©{" "}
          <Enlace href="https://openmaptiles.org">OpenMapTiles</Enlace> datos de{" "}
          <Enlace href="https://www.openstreetmap.org/copyright">© OpenStreetMap</Enlace>, dibujado con <Enlace href="https://maplibre.org">MapLibre</Enlace>.
        </p>

        <h2 className="metodologia__h">Qué límites tiene</h2>
        <ul className="metodologia__lista">
          {LIMITES.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>

        <h2 className="metodologia__h">El agente</h2>
        <p className="metodologia__p">
          El agente tiene dos modos. <strong>Con IA</strong>, un modelo de lenguaje entiende la pregunta y decide qué herramientas de cálculo usar; las herramientas son
          las mismas que usa la web y solo ellas dan las cifras. El servidor comprueba que cada número del texto salga de esos cálculos y, si no, lo sustituye por una
          respuesta calculada con reglas. <strong>Sin IA</strong> (cuando no hay clave, se acaba el límite diario de gasto o no hay conexión), la pregunta se interpreta
          por reglas en tu navegador y se responde con las mismas herramientas. En ambos casos el agente propone y tú decides: ves el punto en el mapa y puedes
          moverlo, y cada respuesta enseña los pasos que ha seguido.
        </p>
        <p className="metodologia__p">
          Modelo: <Enlace href="https://dev.meta.ai">Muse Spark</Enlace> (Meta), a través de la API de Meta (el código admite también Muse Spark Open, los pesos abiertos, en
          Baseten). Las preguntas se envían a Meta junto con los resultados de las herramientas (datos públicos), y Meta puede usarlas según sus condiciones; no
          pidas ni escribas datos personales. Nosotros no guardamos el texto de las preguntas. Las visitas se cuentan con Vercel Web Analytics, sin cookies y sin la posición de lo que colocas en el mapa (Vercel ve el país, el navegador y la web desde la que llegas).
        </p>

        <h2 className="metodologia__h">Código y reproducibilidad</h2>
        <p className="metodologia__p">
          El código es abierto (licencia MIT) y los datos se regeneran con el pipeline del repositorio:{" "}
          <Enlace href={URL_REPO}>github.com/guillemolero10/donde-hace-falta</Enlace>.
        </p>
        <p className="metodologia__p">
          <strong>Código reutilizado, declarado:</strong> el cliente del portal de datos (CKAN) del pipeline está basado en el servidor MCP del ponente Alberto
          Abella para DATAMAD 2026 (<Enlace href="https://github.com/albertoabellagarcia/DATAMAD2026">github.com/albertoabellagarcia/DATAMAD2026</Enlace>). El resto
          del código es propio, escrito con ayuda de IA.
        </p>
        <p className="metodologia__p">
          <strong>Código propio reutilizado, declarado:</strong> el cliente del modelo de IA del agente y su tope de gasto diario (<code>servidor/proveedor.ts</code> y{" "}
          <code>servidor/presupuesto.ts</code>) están adaptados de DockClerk, otro proyecto del mismo autor (Guillermo Molero), que los escribió para el Meta Hackathon.
        </p>
      </div>
    </details>
  );
}
