// Fuentes de datos de «¿Dónde hace falta?»: una sola lista para «Metodología y fuentes» y para la página «Qué es».
// Las fechas de actualización NO están aquí: salen de los metadatos de `public/donde/` (`generado`, `actualizado_fuente`) o son «en vivo».

export const URL_DEMO = "https://donde-hace-falta.vercel.app";
export const URL_REPO = "https://github.com/guillemolero10/donde-hace-falta";
export const CKAN = "https://datos.comunidad.madrid/catalogo/dataset/";

/** Cómo se sabe cuándo se actualizó: el metadato de un servicio, la generación de la base, el flujo horario del aire o un texto fijo. */
export type Actualizacion =
  | { tipo: "servicio"; servicio: "centro_salud" | "residencia" | "farmacia" | "dea" | "colegio" }
  | { tipo: "base" }
  | { tipo: "en_vivo"; texto: string }
  | { tipo: "fija"; texto: string };

export interface Fuente {
  id: string;
  grupo: "Portal de datos abiertos de la Comunidad de Madrid" | "INE" | "Referencias y normativa" | "Aire y mapa";
  nombre: string;
  /** Qué es el conjunto. */
  que: string;
  /** Para qué lo usa la app (corto, para el listado de la Metodología). */
  uso: string;
  licencia: string;
  /** Con qué frecuencia lo publica la fuente. */
  frecuencia: string;
  actualizacion: Actualizacion;
  url: string;
}

const CC = "CC BY 4.0";

export const FUENTES: readonly Fuente[] = [
  {
    id: "centros_servicios_establecimientos_sanitarios",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Centros, servicios y establecimientos sanitarios",
    que: "Registro de los centros sanitarios de la Comunidad, con su tipo y su ubicación.",
    uso: "centros de salud, consultorios y hospitales generales",
    licencia: CC,
    frecuencia: "Periódica, la fija el portal",
    actualizacion: { tipo: "servicio", servicio: "centro_salud" },
    url: `${CKAN}centros_servicios_establecimientos_sanitarios`,
  },
  {
    id: "atencion_social_registro_centros",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Registro de centros de atención social",
    que: "Centros de servicios sociales con su tipo, su ubicación y sus plazas autorizadas.",
    uso: "residencias de mayores (con sus plazas) y otros servicios sociales",
    licencia: CC,
    frecuencia: "Periódica, la fija el portal",
    actualizacion: { tipo: "servicio", servicio: "residencia" },
    url: `${CKAN}atencion_social_registro_centros`,
  },
  {
    id: "oficinas_farmacia",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Oficinas de farmacia",
    que: "Las oficinas de farmacia autorizadas, con su dirección y sus coordenadas.",
    uso: "farmacias",
    licencia: CC,
    frecuencia: "Periódica, la fija el portal",
    actualizacion: { tipo: "servicio", servicio: "farmacia" },
    url: `${CKAN}oficinas_farmacia`,
  },
  {
    id: "desfibriladores_externos_fuera_ambito_sanitario",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Desfibriladores externos fuera del ámbito sanitario",
    que: "Registro de los desfibriladores instalados en locales públicos y privados fuera de centros sanitarios.",
    uso: "desfibriladores",
    licencia: CC,
    frecuencia: "Periódica, la fija el portal",
    actualizacion: { tipo: "servicio", servicio: "dea" },
    url: `${CKAN}desfibriladores_externos_fuera_ambito_sanitario`,
  },
  {
    id: "centros_educativos",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Centros educativos",
    que: "Colegios e institutos de la Comunidad, con su titularidad y su ubicación.",
    uso: "colegios e institutos",
    licencia: CC,
    frecuencia: "Periódica, la fija el portal",
    actualizacion: { tipo: "servicio", servicio: "colegio" },
    url: `${CKAN}centros_educativos`,
  },
  {
    id: "municipio_comunidad_madrid",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Municipios de la Comunidad de Madrid",
    que: "Lista oficial de los 179 municipios con sus códigos y su zona estadística.",
    uso: "lista y códigos de los 179 municipios",
    licencia: CC,
    frecuencia: "Estable (cambia muy rara vez)",
    actualizacion: { tipo: "base" },
    url: `${CKAN}municipio_comunidad_madrid`,
  },
  {
    id: "proyecciones_poblacion_por_sexo",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Proyecciones de población por sexo",
    que: "La proyección oficial del INE (2026-2076, escenario central) para la Comunidad de Madrid, por edad.",
    uso: "población de 2030",
    licencia: CC,
    frecuencia: "Cuando el INE publica una edición nueva",
    actualizacion: { tipo: "fija", texto: "Edición del INE de junio de 2026" },
    url: `${CKAN}proyecciones_poblacion_por_sexo`,
  },
  {
    id: "calidad_aire_datos_dia",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Calidad del aire: datos del día",
    que: "Mediciones horarias de la red de estaciones de la Comunidad.",
    uso: "aire de hoy en «Mi municipio»",
    licencia: CC,
    frecuencia: "Cada hora",
    actualizacion: { tipo: "en_vivo", texto: "En vivo: nuestro flujo la copia de forma programada cada hora (GitHub puede retrasarlo)" },
    url: `${CKAN}calidad_aire_datos_dia`,
  },
  {
    id: "calidad_aire_estaciones",
    grupo: "Portal de datos abiertos de la Comunidad de Madrid",
    nombre: "Calidad del aire: estaciones",
    que: "Ubicación y datos de cada estación de medición.",
    uso: "ubicación de las estaciones de aire",
    licencia: CC,
    frecuencia: "Estable",
    actualizacion: { tipo: "en_vivo", texto: "Se lee junto con el aire de cada hora" },
    url: `${CKAN}calidad_aire_estaciones`,
  },
  {
    id: "ine_censo_69213",
    grupo: "INE",
    nombre: "Censo anual de población por sección censal (tabla 69213)",
    que: "Habitantes de cada sección censal por sexo y tramos de edad, a 1 de enero de 2025.",
    uso: "la población de las 4.518 secciones, base de todos los cálculos",
    licencia: `${CC} (fuente: INE)`,
    frecuencia: "Anual (1 de enero)",
    actualizacion: { tipo: "fija", texto: "Censo a 1 de enero de 2025" },
    url: "https://www.ine.es/jaxiT3/Tabla.htm?t=69213",
  },
  {
    id: "ine_seccionado_2025",
    grupo: "INE",
    nombre: "Seccionado censal 2025",
    que: "Los límites geográficos de las secciones censales.",
    uso: "dibujar las secciones y los contornos de municipios y distritos",
    licencia: `${CC} (fuente: INE)`,
    frecuencia: "Anual",
    actualizacion: { tipo: "fija", texto: "Edición de 2025" },
    url: "https://www.ine.es/prodyser/cartografia/seccionado_2025.zip",
  },
  {
    id: "imserso_2024",
    grupo: "Referencias y normativa",
    nombre: "IMSERSO: Servicios sociales dirigidos a las personas mayores en España, 2024",
    que: "Informe oficial con las plazas de residencia por cada 100 mayores (4,05 en España y 4,21 en Madrid).",
    uso: "referencia con la que se compara la cobertura de residencias",
    licencia: "Publicación oficial; se cita la fuente (no es un conjunto con licencia abierta propia)",
    frecuencia: "Anual",
    actualizacion: { tipo: "fija", texto: "Datos a 31 de diciembre de 2024" },
    url: "https://imserso.es/documents/20123/10902543/inf_ssppmmesp2024.pdf/1432577e-5e36-5d7c-83d1-24864192dc99",
  },
  {
    id: "ign_nucleos",
    grupo: "Referencias y normativa",
    nombre: "IGN-INE: Núcleos de población y Unidades administrativas",
    que: "Nombre y punto del núcleo principal de cada municipio.",
    uso: "colocar y nombrar los municipios en el buscador y el mapa",
    licencia: `${CC} (obra derivada de IGN-INE, 2025)`,
    frecuencia: "Anual",
    actualizacion: { tipo: "fija", texto: "Edición de 2025" },
    url: "https://www.ign.es",
  },
  {
    id: "decreto_78_2017",
    grupo: "Referencias y normativa",
    nombre: "Decreto 78/2017 de la Comunidad de Madrid (desfibriladores)",
    que: "Obliga a ciertos locales a tener un desfibrilador. No fija un ratio por población.",
    uso: "contexto normativo de los desfibriladores",
    licencia: "Texto oficial publicado en el BOCM",
    frecuencia: "Norma de 2017",
    actualizacion: { tipo: "fija", texto: "Texto de 2017" },
    url: "https://www.bocm.es/boletin/CM_Orden_BOCM/2017/09/14/BOCM-20170914-1.PDF",
  },
  {
    id: "open_meteo_cams",
    grupo: "Aire y mapa",
    nombre: "Open-Meteo (modelo CAMS de Copernicus)",
    que: "Previsión de la calidad del aire para las próximas horas.",
    uso: "«El aire hoy» y su previsión en «Mi municipio»",
    licencia: `${CC}. Generated using Copernicus Atmosphere Monitoring Service information 2026`,
    frecuencia: "Varias veces al día",
    actualizacion: { tipo: "en_vivo", texto: "En vivo: nuestro flujo la copia de forma programada cada hora (GitHub puede retrasarlo)" },
    url: "https://open-meteo.com",
  },
  {
    id: "openfreemap",
    grupo: "Aire y mapa",
    nombre: "OpenFreeMap, OpenMapTiles y OpenStreetMap",
    que: "El mapa base (calles, nombres, relieve).",
    uso: "el mapa sobre el que se pintan las secciones",
    licencia: "© OpenMapTiles; datos © colaboradores de OpenStreetMap (ODbL)",
    frecuencia: "Continua",
    actualizacion: { tipo: "en_vivo", texto: "En vivo, desde el servicio de teselas" },
    url: "https://openfreemap.org",
  },
];

export const COMUNIDAD = FUENTES.filter((f) => f.grupo === "Portal de datos abiertos de la Comunidad de Madrid");
