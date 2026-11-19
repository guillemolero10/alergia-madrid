// Frases en español para las respuestas calculadas con reglas (modo sin IA) y como texto de respaldo del agente con
// IA (el validador de I2 sustituye por estas plantillas un texto que traiga cifras que no salgan de las herramientas).
// REGLA: cada número de estas frases sale de la salida de una herramienta; aquí no se calcula nada.
import type { ErrorHerramienta, ResultadoHerramienta, SalidaFicha, SalidaOptima, SalidaRanking, SalidaSimulacion } from "./herramientas";
import { decimal2Es, decimalEs, enteroEs, plazasEs, porcentajeEs, radioEs } from "./panelDonde";
import { ANIO_PROYECCION } from "./proyeccion";
import { SERVICIOS } from "./servicios";
import type { ServicioId } from "./tipos";
import { decimalCortoEs, fraseAprovechamiento, pctEs } from "./tuDecides";

/** Etiqueta que acompaña a toda respuesta del modo sin IA. */
export const ETIQUETA_MODO_REGLAS = "Modo sin IA: respuesta calculada con reglas";

interface Frase {
  un: string;
  singular: string;
  plural: string;
}

export const FRASES: Record<ServicioId, Frase> = {
  centro_salud: { un: "un centro de salud o consultorio", singular: "centro de salud o consultorio", plural: "centros de salud o consultorios" },
  hospital: { un: "un hospital general público", singular: "hospital general público", plural: "hospitales generales públicos" },
  residencia: { un: "una residencia de mayores", singular: "residencia de mayores", plural: "residencias de mayores" },
  farmacia: { un: "una farmacia", singular: "farmacia", plural: "farmacias" },
  colegio: { un: "un colegio o instituto", singular: "colegio o instituto", plural: "colegios e institutos" },
  dea: { un: "un punto con desfibrilador", singular: "punto con desfibrilador", plural: "puntos con desfibrilador" },
};

function enAmbito(a: { tipo: string; nombre: string }): string {
  switch (a.tipo) {
    case "comunidad": return "en la Comunidad de Madrid";
    case "zona": return `en la zona «${a.nombre}»`;
    case "distrito": return `en el distrito de ${a.nombre}`;
    default: return `en ${a.nombre}`;
  }
}

function deAmbito(a: { tipo: string; nombre: string }): string {
  switch (a.tipo) {
    case "comunidad": return "de la Comunidad de Madrid";
    case "zona": return `de la zona «${a.nombre}»`;
    case "distrito": return `del distrito de ${a.nombre}`;
    default: return `de ${a.nombre}`;
  }
}

const lineaRecta = (servicio: ServicioId) => (SERVICIOS[servicio].metrica === "distancia" ? " Las distancias son en línea recta." : " Cuenta las plazas autorizadas, no las libres.");

function queSignifica(s: { servicio: ServicioId; radio_m: number; umbral: number }, subjuntivo = false): string {
  const def = SERVICIOS[s.servicio];
  const pasar = subjuntivo ? "pasaran a vivir" : "pasarían a vivir";
  return def.metrica === "plazas"
    ? `${pasar} en una zona con al menos ${decimal2Es(s.umbral)} plazas por cada 100 mayores a menos de ${radioEs(s.radio_m)}`
    : `${pasar} a menos de ${radioEs(s.radio_m)} del centro más cercano`;
}

// ---------------------------------------------------------------- óptimo
export function textoOptima(s: SalidaOptima): string {
  const f = FRASES[s.servicio];
  const def = SERVICIOS[s.servicio];
  const donde = enAmbito(s.ambito);
  const nota = s.n_pedido > s.n ? ` Solo calculo hasta ${s.n} puntos a la vez.` : "";
  if (s.puntos.length === 0) {
    return `En ${s.ambito.tipo === "comunidad" ? "la Comunidad" : s.ambito.nombre} no encuentro ningún punto donde ${f.un} mejore el acceso de nadie con este criterio (${s.criterio}). Puede que ya esté cubierto o que ${def.metrica === "plazas" ? "las plazas no bastaran" : "no viva casi nadie lejos de un centro"}.${lineaRecta(s.servicio)}`;
  }
  const plazas = s.plazas === null ? "" : ` de ${enteroEs(s.plazas)} plazas`;
  const sig = queSignifica(s);
  if (def.metrica === "plazas" && s.plazas !== null) {
    const faltan = s.faltan_antes !== undefined && s.faltan_despues !== undefined ? ` En toda la Comunidad, el margen de mejora pasaría de ${enteroEs(s.faltan_antes)} a ${enteroEs(s.faltan_despues)} plazas.` : "";
    if (s.puntos.length === 1) {
      const p = s.puntos[0]!;
      return `El mejor sitio para ${f.un}${plazas} ${donde} es ${p.municipio} (sección censal ${p.seccion}): cubre ${decimalCortoEs(p.reduce ?? 0)} plazas más (${fraseAprovechamiento(p.reduce ?? 0, s.plazas)}). Criterio: ${s.criterio}.${faltan}${lineaRecta(s.servicio)} Puedes arrastrar el punto en el mapa para probar otro sitio.${nota}`;
    }
    const lista = s.puntos.map((p, i) => `${i + 1}) ${p.municipio} (${decimalCortoEs(p.reduce ?? 0)})`).join(", ");
    return `Los ${s.puntos.length} mejores sitios para ${f.plural}${plazas} ${donde}, en el orden en que el modelo los elige: ${lista}. Entre todos cubren ${decimalCortoEs(s.reduce_total ?? 0)} plazas más. Criterio: ${s.criterio}.${faltan}${lineaRecta(s.servicio)}${nota}`;
  }
  if (s.puntos.length === 1) {
    const p = s.puntos[0]!;
    return `El mejor sitio para ${f.un}${plazas} ${donde} es ${p.municipio} (sección censal ${p.seccion}): ${enteroEs(p.ganan)} ${def.grupoEtiqueta} ${sig}. En toda la Comunidad, las personas con margen de mejora pasarían de ${enteroEs(s.deficit_antes)} a ${enteroEs(s.deficit_despues)}.${lineaRecta(s.servicio)} Puedes arrastrar el punto en el mapa para probar otro sitio.${nota}`;
  }
  const lista = s.puntos.map((p, i) => `${i + 1}) ${p.municipio} (+${enteroEs(p.ganan)})`).join(", ");
  const total = s.puntos[s.puntos.length - 1]!.acumulado;
  return `Los ${s.puntos.length} mejores sitios para ${f.plural}${plazas} ${donde}, en el orden en que el modelo los elige: ${lista}. Entre todos, ${enteroEs(total)} ${def.grupoEtiqueta} ${sig}.${lineaRecta(s.servicio)}${nota}`;
}

// ---------------------------------------------------------------- ranking
export function textoRanking(s: SalidaRanking): string {
  const f = FRASES[s.servicio];
  const def = SERVICIOS[s.servicio];
  const unidad = s.nivel === "distrito" ? "distritos" : "municipios";
  const donde = deAmbito(s.ambito);
  const filas = s.filas.slice(0, 5);
  if (filas.length === 0) return `No tengo ${unidad} ${donde} con población para calcular este ranking.`;
  if ((filas[0]?.en_deficit ?? 0) === 0) {
    return `${s.ambito.tipo === "comunidad" ? "En la Comunidad" : `En ${s.ambito.nombre}`} todo el mundo tiene cubierto el servicio de ${f.plural} con este criterio (${s.criterio}).`;
  }
  const lista = filas
    .map((r, i) => {
      if (s.orden === "faltan" && r.plazas_faltan !== undefined) return `${i + 1}) ${r.nombre}: ${plazasEs(r.plazas_faltan)} por cubrir (${porcentajeEs(r.pct)} de sus ${def.grupoEtiqueta} con margen de mejora)`;
      if (r.aproximada) return `${i + 1}) ${r.nombre}: tiene centro dentro; cifra no fiable (secciones censales muy grandes)`;
      return `${i + 1}) ${r.nombre}: ${porcentajeEs(r.pct)} (${enteroEs(r.en_deficit)} de ${enteroEs(r.objetivo)})`;
    })
    .join("; ");
  const cab =
    s.orden === "faltan"
      ? `${unidad[0]!.toUpperCase()}${unidad.slice(1)} ${donde} donde más ayudarían nuevas ${f.plural}`
      : s.orden === "personas"
        ? `${unidad[0]!.toUpperCase()}${unidad.slice(1)} ${donde} con más ${def.grupoEtiqueta} que se beneficiarían de ${f.un}`
        : `${unidad[0]!.toUpperCase()}${unidad.slice(1)} ${donde} con mayor porcentaje de ${def.grupoEtiqueta} que se beneficiarían de ${f.un}`;
  const aprox = filas.some((r) => r.aproximada) ? ": en esos municipios rurales hay un centro dentro y las secciones censales son muy grandes; la distancia se mide desde un punto de cada sección, así que no damos su porcentaje." : "";
  // Sin el número: el validador no lo conoce (es una resta) y rechazaría la frase si el modelo la copia (R3b).
  const resto = s.filas.length > filas.length ? " Hay más municipios en la tabla." : "";
  return `${cab}: ${lista}. Criterio: ${s.criterio}.${SERVICIOS[s.servicio].metrica === "plazas" ? lineaRecta(s.servicio) : ""}${resto}${aprox ? ` Aviso${aprox}` : ""}`;
}

// ---------------------------------------------------------------- simulación
export function textoSimulacion(s: SalidaSimulacion): string {
  const f = FRASES[s.servicio];
  const def = SERVICIOS[s.servicio];
  const plazas = s.plazas === null ? "" : ` de ${enteroEs(s.plazas)} plazas`;
  const c = s.comparado_con_optimo;
  if (def.metrica === "plazas" && s.reduce !== undefined && s.plazas !== null) {
    if (s.reduce < 0.5) {
      return `${capitalizar(f.un)}${plazas} en ${s.lugar} no cubriría más plazas. ${s.por_que_nadie_gana ?? ""} ${s.detalle}${(c.reduce_optimo ?? 0) > 0 ? ` Para comparar, el mejor punto de la zona «${c.zona}» (${c.municipio_optimo ?? "sin nombre"}) aprovecha ${decimalCortoEs(c.reduce_optimo ?? 0)} de ${enteroEs(s.plazas)}.` : ""}`.replace(/\s+/g, " ").trim();
    }
    let cmp = "";
    if (c.pct === null) cmp = "";
    else if (c.supera) cmp = ` Es incluso más que el mejor punto que encuentra el modelo en la zona «${c.zona}» (aprovecha ${decimalCortoEs(c.reduce_optimo ?? 0)} de ${enteroEs(s.plazas)}).`;
    else cmp = ` El modelo aprovecha ${decimalCortoEs(c.reduce_optimo ?? 0)} de ${enteroEs(s.plazas)}${c.municipio_optimo ? ` en ${c.municipio_optimo}` : ""} (mejor punto de la zona «${c.zona}»); tu ubicación logra el ${pctEs(c.pct)} del óptimo.`;
    return `${capitalizar(f.un)}${plazas} en ${s.lugar} cubre ${decimalCortoEs(s.reduce)} plazas más (${fraseAprovechamiento(s.reduce, s.plazas)}). ${s.detalle}${cmp}${lineaRecta(s.servicio)}`;
  }
  if (s.ganan <= 0) {
    return `${capitalizar(f.un)}${plazas} en ${s.lugar} no mejoraría el acceso de nadie. ${s.por_que_nadie_gana ?? ""} ${s.detalle}${c.ganan_optimo > 0 ? ` Para comparar, el mejor punto de la zona «${c.zona}» (${c.municipio_optimo ?? "sin nombre"}) consigue ${enteroEs(c.ganan_optimo)}.` : ""}`.replace(/\s+/g, " ").trim();
  }
  let cmp = "";
  if (c.pct === null) cmp = "";
  else if (c.supera) cmp = ` Es incluso más que el mejor punto que encuentra el modelo en la zona «${c.zona}» (${enteroEs(c.ganan_optimo)}).`;
  else cmp = ` El mejor punto del modelo en la zona «${c.zona}»${c.municipio_optimo ? ` (${c.municipio_optimo})` : ""} consigue ${enteroEs(c.ganan_optimo)}, así que tu ubicación logra el ${pctEs(c.pct)} del óptimo.`;
  const sig = queSignifica(s, true);
  return `${capitalizar(f.un)}${plazas} en ${s.lugar} haría que ${enteroEs(s.ganan)} ${def.grupoEtiqueta} ${sig}. ${s.detalle}${cmp}${lineaRecta(s.servicio)}`;
}

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ---------------------------------------------------------------- ficha
export function textoFicha(s: SalidaFicha): string {
  const nivel = s.nivel === "municipio" ? "" : s.nivel === "distrito" ? " (distrito de Madrid)" : " (zona estadística)";
  const cuenta = s.servicios
    .map((f) => `${enteroEs(f.n)} ${f.n === 1 ? FRASES[f.id].singular : FRASES[f.id].plural}`)
    .join(", ");
  // Una residencia con 0 plazas por cubrir no es «donde más ayudaría» aunque salga algo por debajo de la media de su tamaño.
  const faltan = s.faltan.filter((id) => SERVICIOS[id].metrica !== "plazas" || (s.servicios.find((x) => x.id === id)?.plazas_faltan ?? 0) > 0);
  let falta: string;
  if (faltan.length === 0) {
    falta = "Frente a la referencia no sale por debajo en ningún servicio.";
  } else {
    const comparaCon = s.servicios.some((f) => f.mediana_tramo !== null) ? "municipios de su tamaño" : "la media de la Comunidad";
    const partes = faltan.slice(0, 2).map((id) => {
      const f = s.servicios.find((x) => x.id === id)!;
      const def = SERVICIOS[id];
      if (def.metrica === "plazas") {
        return `${FRASES[id].plural} (${porcentajeEs(f.pct_deficit)} de sus ${def.grupoEtiqueta} vive en zonas con menos de ${decimal2Es(f.umbral ?? 0)} plazas por cada 100 mayores (referencia: ${f.referencia_texto ?? "la media"})${f.ratio === null ? "" : `; aquí hay ${decimalEs(f.ratio)} plazas por cada 100`}${f.plazas_faltan ? (Math.round(f.plazas_faltan) === 1 ? "; habría sitio para una plaza más para llegar a esa referencia" : `; habría sitio para unas ${enteroEs(Math.round(f.plazas_faltan))} plazas más para llegar a esa referencia`) : ""})`;
      }
      return `${FRASES[id].plural} (frente a ${comparaCon}; ${f.aproximada ? "tiene centro dentro; cifra no fiable (secciones censales muy grandes)" : `el ${porcentajeEs(f.pct_deficit)} de sus ${def.grupoEtiqueta} vive a más de ${radioEs(f.radio_m)} del más cercano`})`;
    });
    falta = `Donde más ayudaría un centro nuevo: ${partes.join(" y ")}.`;
  }
  return `${s.nombre}${nivel} tiene ${enteroEs(s.poblacion)} habitantes (${s.anio_poblacion === ANIO_PROYECCION ? `proyección a ${s.anio_poblacion}` : `censo de ${s.anio_poblacion}`}). Dentro de su territorio hay ${cuenta}. ${falta}${s.ficha_de_hoy ? " La ficha de «Mi municipio» es siempre de hoy, con el censo de 2025; el año 2030 solo está en el simulador." : ""}`;
}

// ---------------------------------------------------------------- errores y resultado
export function textoError(e: ErrorHerramienta): string {
  return e.mensaje;
}

/** Aviso que abre toda respuesta calculada con la población de 2030: es una proyección, no un dato. */
export const AVISO_2030 = "Cifras de 2030, con la población proyectada por el INE (escenario central; el reparto por sección es un modelo) y con los centros que hay hoy.";

/** Texto de un resultado de herramienta. */
export function redactarResultado(r: ResultadoHerramienta): string {
  if (!r.ok) return textoError(r.error);
  const texto = redactarSalida(r);
  const a = r.herramienta === "mover_mapa" ? null : (r.salida as { anio_poblacion?: number }).anio_poblacion;
  return a === ANIO_PROYECCION ? `${AVISO_2030} ${texto}` : texto;
}

function redactarSalida(r: Extract<ResultadoHerramienta, { ok: true }>): string {
  switch (r.herramienta) {
    case "ranking_deficit": return textoRanking(r.salida);
    case "ubicacion_optima": return textoOptima(r.salida);
    case "simular_centro": return textoSimulacion(r.salida);
    case "ficha_municipio": return textoFicha(r.salida);
    case "mover_mapa": return `Te llevo a ${r.salida.nombre}.`;
  }
}
