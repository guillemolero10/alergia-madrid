import { nivelParaPerfil } from "./nivelPerfil";
import { evaluarLugar } from "./evaluar";
import { etiquetaVentana, fraseVeredicto, palabraVariable, type Perfil, type ResultadoFranja } from "./franja";
import { nombreVariable, textoRegla } from "./riesgo";
import type { DiaCargado } from "./dias";
import { umbralAlto, type UmbralAlto } from "./umbrales";
import { buscarVecinos, type Alternativa } from "./vecinos";
import type { Lugares, Municipio, Nivel } from "./tipos";

// «Qué habría dicho ¿Salimos? ese día»: historias generadas con plantilla a partir de los días de `public/dias/`.
// La app no existía entonces: son simulaciones con los datos reales de esa fecha, y así se presentan.
// Ninguna cifra está escrita a mano: valor, umbral, hora, franja y alternativas salen de los datos.

export interface DefinicionCaso {
  id: string;
  /** Día de `public/dias/`. */
  fecha: string;
  municipio: string;
  perfil: Pick<Perfil, "afecta" | "polenes">;
  /** Persona tipo, sin nombre real ni cifras. */
  persona: string;
  /** Lo que quería hacer. */
  plan: string;
}

export const DEFINICIONES_CASOS: readonly DefinicionCaso[] = [
  {
    id: "gramineas",
    fecha: "2026-05-19",
    municipio: "mun:28065", // Getafe
    perfil: { afecta: "polen", polenes: ["gramineas"] },
    persona: "Una corredora con alergia a las gramíneas",
    plan: "quiere salir a correr por Getafe",
  },
  {
    id: "cupresaceas",
    fecha: "2026-02-26",
    municipio: "mun:28006", // Alcobendas
    perfil: { afecta: "polen", polenes: ["cupresaceas"] },
    persona: "Un padre con alergia a las cupresáceas",
    plan: "quiere llevar a sus hijos al parque en Alcobendas",
  },
  {
    id: "ozono",
    fecha: "2026-07-24",
    // Rascafría y no Colmenar Viejo: ese día el ozono (media de 8 h) solo llegó al nivel alto en la estación de Rascafría.
    municipio: "mun:28120",
    perfil: { afecta: "aire", polenes: [] },
    persona: "Un ciclista con asma",
    plan: "quiere hacer una ruta en bici por Rascafría",
  },
];

const numero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1, useGrouping: "always" });
const formatearNumero = (v: number) => numero.format(v);

export interface MedidaCaso {
  variable: string;
  nombre: string;
  valor: number;
  unidad: string;
  /** «media móvil de 8 h», «valor diario»… */
  regla: string | null;
  /** Dónde se midió. */
  lugar: string;
  tipoLugar: "estación" | "captador";
  nivel: Nivel;
  umbral: UmbralAlto | null;
}

export interface Caso {
  def: DefinicionCaso;
  municipio: Municipio;
  /** AAAA-MM-DD y hora local de la foto del día. */
  fecha: string;
  hora: string;
  medida: MedidaCaso | null;
  nivel: Nivel;
  resultado: ResultadoFranja;
  veredicto: string;
  /** Mejor franja («19:00–22:00») y su nivel; `null` si no hay una clara. */
  mejor: { etiqueta: string; nivel: Nivel } | null;
  /** Nivel alto a todas horas. */
  sinBuenaHora: boolean;
  alternativas: Alternativa[];
  /** Mejor franja del día siguiente, si hoy no hay ninguna buena y mañana sí. */
  mejorManana: { etiqueta: string; nivel: Nivel } | null;
  /** A la mejor hora el nivel es medio o alto, así que tiene sentido buscar otro sitio. */
  buscaAlternativa: boolean;
  /** Se buscó alternativa (el nivel era medio o alto) y no mejoró ninguna. */
  igualEnLaZona: boolean;
  franjaAlternativas: string | null;
}

function medidaDe(def: DefinicionCaso, municipio: Municipio, dia: DiaCargado, lugares: Lugares): MedidaCaso | null {
  const np = nivelParaPerfil(dia.estado, def.perfil, municipio.estacion, municipio.captador);
  const candidatas = dia.estado.observaciones.filter((o) => {
    if (np.peor) return o.variable === np.peor && (o.lugar === municipio.estacion || o.lugar === municipio.captador);
    return false;
  });
  const o = candidatas[0];
  if (!o) return null;
  const esCaptador = o.lugar.startsWith("cap:");
  const lugar = esCaptador ? lugares.captadores.find((c) => c.id === o.lugar)?.nombre : lugares.estaciones.find((e) => e.id === o.lugar)?.nombre;
  return {
    variable: o.variable,
    nombre: nombreVariable(o.variable).corto,
    // El valor que se compara con el umbral: la media de 8 h del ozono, no el dato de la hora.
    valor: o.valor_regla ?? o.valor,
    unidad: o.unidad,
    regla: textoRegla(o.regla),
    lugar: lugar ?? o.lugar,
    tipoLugar: esCaptador ? "captador" : "estación",
    nivel: o.nivel,
    umbral: umbralAlto(o.variable),
  };
}

export function construirCaso(def: DefinicionCaso, dia: DiaCargado, lugares: Lugares): Caso | null {
  const municipio = lugares.municipios.find((m) => m.id === def.municipio);
  if (!municipio) return null;
  const referencia = new Date(dia.estado.fecha_referencia);
  const ev = evaluarLugar(def.perfil, municipio, dia.pronostico, dia.estado, lugares, referencia);
  if (!ev) return null;
  const r = ev.resultado;
  const perfil: Perfil = { municipio: municipio.id, ...def.perfil };
  const vecinos = buscarVecinos(perfil, municipio, r, { pronostico: dia.pronostico, estado: dia.estado, lugares, ahora: referencia });
  return {
    def,
    municipio,
    fecha: def.fecha,
    hora: dia.estado.fecha_referencia.slice(11, 16),
    medida: medidaDe(def, municipio, dia, lugares),
    nivel: r.veredicto,
    resultado: r,
    veredicto: fraseVeredicto(r.veredicto),
    mejor: r.mejor && !r.sinBuenaHora ? { etiqueta: etiquetaVentana(r.mejor), nivel: r.mejor.nivel } : null,
    sinBuenaHora: r.sinBuenaHora,
    mejorManana: r.mejorManana ? { etiqueta: etiquetaVentana(r.mejorManana), nivel: r.mejorManana.nivel } : null,
    buscaAlternativa: vecinos.aplica,
    alternativas: vecinos.alternativas,
    igualEnLaZona: vecinos.aplica && vecinos.alternativas.length === 0,
    franjaAlternativas: vecinos.franja,
  };
}

/** «Polen de gramíneas: 377 granos/m³ en el captador de Getafe. El nivel alto empieza en 53.» */
export function textoMedida(m: MedidaCaso): string {
  const que = palabraVariable(m.variable);
  const cifra = `${formatearNumero(m.valor)} ${m.unidad}${m.regla ? ` (${m.regla})` : ""}`;
  const umbral = m.umbral
    ? m.umbral.modo === "desde"
      ? ` El nivel alto empieza en ${formatearNumero(m.umbral.valor)}.`
      : ` El nivel alto es por encima de ${formatearNumero(m.umbral.valor)}.`
    : "";
  return `${que.charAt(0).toUpperCase()}${que.slice(1)}: ${cifra} ${m.tipoLugar === "captador" ? "en el captador de" : "en la estación de"} ${m.lugar}.${umbral}`;
}
