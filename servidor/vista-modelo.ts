// Lo que VE el modelo de cada resultado de herramienta (I3). El motor devuelve números crudos (93.78, 189814, 2000) y nombres técnicos
// («deficit», «umbral», «radio_m»); con eso el modelo escribía «93.78», «189814 habitantes» o «umbral de 2000». Aquí cada cifra llega
// YA formateada en español y con su unidad («93,8 plazas», «189.814 habitantes», «10 km») y con nombres neutros (sin «déficit»).
//
// Es solo una presentación: el validador (`validador.ts`) sigue comparando el texto del modelo con las salidas CRUDAS de las
// herramientas, así que una cifra inventada se rechaza igual. Cada cifra de aquí es la del motor redondeada como la escribe la web
// (`enteroEs`, `decimalCortoEs`, `porcentajeEs`), por lo que el validador la acepta («93,8» por 93,78; «10.048» por 10048,11).
// Sin coordenadas (el modelo no las escribe), sin enlaces y sin los campos de filas «aproximadas» (cifra no fiable).
import type { FilaFichaSalida, ResultadoHerramienta, SalidaFicha, SalidaOptima, SalidaRanking, SalidaSimulacion } from "../src/lib/donde/herramientas";
import { decimalEs, enteroEs, porcentajeEs, radioEs } from "../src/lib/donde/panelDonde";
import { SERVICIOS } from "../src/lib/donde/servicios";
import type { ServicioId } from "../src/lib/donde/tipos";
import { decimalCortoEs, pctEs } from "../src/lib/donde/tuDecides";

type Objeto = Record<string, unknown>;

const personas = (n: number, s: ServicioId) => `${enteroEs(n)} ${SERVICIOS[s].grupoEtiqueta}`;
const plazas = (n: number) => `${decimalCortoEs(n)} ${Math.round(n * 10) / 10 === 1 ? "plaza" : "plazas"}`;
const plazasEnteras = (n: number) => `${enteroEs(n)} ${Math.round(n) === 1 ? "plaza" : "plazas"}`;
/**
 * Porcentaje para el modelo. Por debajo del 0,1 % no se da cifra (R5-M2): «menos del 0,1 %» lleva un número que no sale de las
 * herramientas y el validador lo rechazaría.
 */
const pctModelo = (n: number) => (n > 0 && n < 0.1 ? "una parte mínima" : porcentajeEs(n));
/** «100 %» y «67 %» si es redondo; «48,7 %» si no (el motor da 100 como 100,0 y suena a medición). */
const pct = (n: number) => (Number.isInteger(n) ? `${enteroEs(n)} %` : pctModelo(n));
const esPlazas = (s: ServicioId) => SERVICIOS[s].metrica === "plazas";

function cabecera(s: { anio_poblacion: number; servicio: ServicioId; radio_m: number; criterio: string; ambito: { tipo: string; nombre: string } }): Objeto {
  return {
    servicio: SERVICIOS[s.servicio].nombre,
    ...(esPlazas(s.servicio) ? { tipo_de_cifra: "plazas de residencia (no personas)" } : { tipo_de_cifra: `${SERVICIOS[s.servicio].grupoEtiqueta} a más de ${radioEs(s.radio_m)} del centro más cercano` }),
    anio: s.anio_poblacion,
    ...(s.anio_poblacion === 2030 ? { es_proyeccion: "sí: población de 2030 proyectada, con los centros de hoy" } : {}),
    radio: radioEs(s.radio_m),
    criterio: s.criterio,
    ambito: s.ambito.tipo === "comunidad" ? "toda la Comunidad de Madrid" : `${s.ambito.tipo} ${s.ambito.nombre}`,
  };
}

function ranking(s: SalidaRanking): Objeto {
  const plazasSrv = esPlazas(s.servicio);
  const orden = s.orden === "faltan" ? "plazas por cubrir (de más a menos)" : s.orden === "personas" ? "número de personas (de más a menos)" : "porcentaje de personas (de más a menos)";
  return {
    ...cabecera(s),
    nivel: s.nivel,
    ordenado_por: `${orden}; las filas van en ese orden`,
    filas: s.filas.map((f): Objeto => {
      if (f.aproximada) return { nombre: f.nombre, nota: "tiene un centro dentro y sus secciones censales son muy grandes: no hay cifra fiable, no cites cifras de esta fila" };
      return {
        nombre: f.nombre,
        ...(plazasSrv && f.plazas_faltan !== undefined ? { plazas_por_cubrir: plazasEnteras(f.plazas_faltan) } : {}),
        personas_en_zonas_con_margen_de_mejora: personas(f.en_deficit, s.servicio),
        total_del_municipio: personas(f.objetivo, s.servicio),
        porcentaje: pct(f.pct),
        ...(plazasSrv && f.ratio !== null ? { plazas_por_cada_100_mayores: decimalEs(f.ratio) } : {}),
      };
    }),
    total_en_la_comunidad: `${personas(s.total_deficit, s.servicio)} en zonas con margen de mejora, de ${personas(s.total_objetivo, s.servicio)}`,
  };
}

function optima(s: SalidaOptima): Objeto {
  const pl = esPlazas(s.servicio);
  if (s.puntos.length === 0) return { ...cabecera(s), sin_resultado: "no hay ningún punto que mejore el acceso de nadie con este criterio" };
  return {
    ...cabecera(s),
    plazas_del_centro: s.plazas === null ? null : plazasEnteras(s.plazas),
    puntos: s.puntos.map((p): Objeto => ({
      municipio: p.municipio,
      ...(pl
        ? {
            plazas_que_pasan_a_estar_cubiertas: plazas(p.reduce ?? 0),
            ...(p.pct_plazas_utiles !== undefined ? { aprovechamiento_de_las_plazas_del_centro: pct(p.pct_plazas_utiles) } : {}),
          }
        : { personas_que_ganan_acceso: personas(p.ganan, s.servicio), ...(s.puntos.length > 1 ? { acumulado_hasta_este_punto: personas(p.acumulado, s.servicio) } : {}) }),
    })),
    ...(pl
      ? {
          ...(s.puntos.length > 1 ? { total_plazas_que_pasan_a_estar_cubiertas: plazas(s.reduce_total ?? 0) } : {}),
          plazas_por_cubrir_en_toda_la_comunidad_antes: plazasEnteras(s.faltan_antes ?? 0),
          plazas_por_cubrir_en_toda_la_comunidad_despues: plazasEnteras(s.faltan_despues ?? 0),
        }
      : {
          personas_con_margen_de_mejora_en_la_comunidad_antes: personas(s.deficit_antes, s.servicio),
          personas_con_margen_de_mejora_en_la_comunidad_despues: personas(s.deficit_despues, s.servicio),
        }),
    ...(s.n_pedido > s.n ? { aviso: `solo se calculan ${s.n} puntos a la vez` } : {}),
  };
}

function simulacion(s: SalidaSimulacion): Objeto {
  const pl = esPlazas(s.servicio);
  const c = s.comparado_con_optimo;
  return {
    ...cabecera(s),
    lugar: s.lugar,
    plazas_del_centro: s.plazas === null ? null : plazasEnteras(s.plazas),
    ...(pl
      ? {
          plazas_que_pasan_a_estar_cubiertas: plazas(s.reduce ?? 0),
          ...(s.pct_plazas_utiles !== undefined ? { aprovechamiento_de_las_plazas_del_centro: pct(s.pct_plazas_utiles) } : {}),
        }
      : { personas_que_ganan_acceso: personas(s.ganan, s.servicio) }),
    detalle: s.detalle,
    ...(s.por_que_nadie_gana ? { por_que_no_cambia_nada: s.por_que_nadie_gana } : {}),
    mejor_punto_del_modelo: {
      zona: c.zona,
      municipio: c.municipio_optimo,
      ...(pl ? { plazas_que_pasan_a_estar_cubiertas: plazas(c.reduce_optimo ?? 0) } : { personas_que_ganan_acceso: personas(c.ganan_optimo, s.servicio) }),
      ...(c.pct === null ? {} : { este_lugar_logra_el: c.supera ? "más que el mejor punto del modelo" : pctEs(c.pct) + " del mejor punto" }),
    },
  };
}

function filaFicha(f: FilaFichaSalida): Objeto {
  const s = f.id;
  const base: Objeto = { servicio: f.nombre, centros_dentro: f.n };
  if (f.aproximada) return { ...base, nota: "tiene un centro dentro y sus secciones censales son muy grandes: no hay cifra fiable de personas lejos del centro" };
  if (esPlazas(s)) {
    return {
      ...base,
      ...(f.plazas !== undefined ? { plazas: plazasEnteras(f.plazas) } : {}),
      ...(f.ratio !== null ? { plazas_por_cada_100_mayores: decimalEs(f.ratio) } : {}),
      ...(f.media_comunidad !== null ? { media_de_la_comunidad_por_cada_100_mayores: decimalEs(f.media_comunidad) } : {}),
      referencia_usada: f.referencia_texto ?? "media de la Comunidad",
      mayores_en_zonas_por_debajo_de_la_referencia: f.personas_deficit === 0 ? "ninguno" : `${personas(f.personas_deficit, s)} (${pctModelo(f.pct_deficit)})`,
      ...(f.plazas_faltan ? { plazas_por_cubrir_para_llegar_a_la_referencia: plazasEnteras(Math.round(f.plazas_faltan)) } : {}),
    };
  }
  return {
    ...base,
    ...(f.ratio !== null ? { habitantes_por_centro: enteroEs(f.ratio) } : {}),
    ...(f.personas_deficit === 0
      ? { cobertura: `completa: todos los ${SERVICIOS[s].grupoEtiqueta} a menos de ${radioEs(f.radio_m)} de uno` }
      : { personas_a_mas_de_la_distancia_maxima: `${personas(f.personas_deficit, s)} (${pctModelo(f.pct_deficit)}) viven a más de ${radioEs(f.radio_m)} del más cercano` }),
    ...(f.cubierto_desde_fuera ? { nota: "lo cubren los municipios de al lado" } : {}),
    comparado_con_municipios_de_su_tamano_o_la_media: f.comparacion === "por_debajo" ? "por debajo" : f.comparacion === "por_encima" ? "por encima" : "en la media",
  };
}

function ficha(s: SalidaFicha): Objeto {
  const ayudaria = s.faltan.filter((id) => !esPlazas(id) || (s.servicios.find((x) => x.id === id)?.plazas_faltan ?? 0) > 0).slice(0, 2);
  return {
    nombre: s.nombre,
    nivel: s.nivel,
    habitantes: enteroEs(s.poblacion),
    anio: s.anio_poblacion,
    servicios: s.servicios.map(filaFicha),
    donde_mas_ayudaria_un_centro_nuevo: ayudaria.map((id) => SERVICIOS[id].nombre),
    ...(s.ficha_de_hoy ? { aviso: "esta ficha es siempre de hoy (censo de 2025); el año 2030 solo está en el simulador" } : {}),
  };
}

/** El resultado de una herramienta tal como se lo enseñamos al modelo (objeto listo para `JSON.stringify`). */
export function vistaParaModelo(r: ResultadoHerramienta): unknown {
  if (!r.ok) return { ok: false, error: r.error };
  switch (r.herramienta) {
    case "ranking_deficit": return { ok: true, salida: ranking(r.salida) };
    case "ubicacion_optima": return { ok: true, salida: optima(r.salida) };
    case "simular_centro": return { ok: true, salida: simulacion(r.salida) };
    case "ficha_municipio": return { ok: true, salida: ficha(r.salida) };
    default: return { ok: true, salida: r.salida };
  }
}
