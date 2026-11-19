// Cobertura y déficit: distancia al centro más cercano (servicios sin plazas) y 2SFCA (servicios con plazas),
// simulación de un centro nuevo y óptimo voraz de máxima cobertura (MCLP). Funciones puras y sin DOM: se pueden
// ejecutar en un Web Worker pasándoles datos serializables (ver `calcularOptimo`).
import { proyectar, proyectarArrays, RejillaEspacial, tamanoCeldaCentros } from "./geo";
import { SERVICIOS, UMBRAL_DEFICIT_POR_DEFECTO, umbralFijo } from "./servicios";
import type {
  Centros,
  EstadoServicio,
  GrupoObjetivo,
  PuntoOptimo,
  ResultadoOptimo,
  ResultadoSimulacion,
  Secciones,
  ServicioId,
  UmbralDeficit,
} from "./tipos";

// ---------------------------------------------------------------- contexto de secciones (se calcula una vez)
export interface ContextoSecciones {
  secciones: Secciones;
  n: number;
  xs: Float64Array;
  ys: Float64Array;
  rejilla: RejillaEspacial;
  objetivos: Partial<Record<GrupoObjetivo, Float64Array>>;
}

const CACHE = new WeakMap<Secciones, ContextoSecciones>();

export function contextoSecciones(secciones: Secciones): ContextoSecciones {
  let ctx = CACHE.get(secciones);
  if (!ctx) {
    const { xs, ys } = proyectarArrays(secciones.lat, secciones.lon);
    ctx = { secciones, n: secciones.ids.length, xs, ys, rejilla: new RejillaEspacial(xs, ys, 1000), objetivos: {} };
    CACHE.set(secciones, ctx);
  }
  return ctx;
}

export function objetivoDe(secciones: Secciones, grupo: GrupoObjetivo): Float64Array {
  const ctx = contextoSecciones(secciones);
  let o = ctx.objetivos[grupo];
  if (!o) {
    const v = secciones.pob[grupo];
    o = new Float64Array(ctx.n);
    for (let i = 0; i < ctx.n; i++) o[i] = (v[i] as number) ?? 0;
    ctx.objetivos[grupo] = o;
  }
  return o;
}

// ---------------------------------------------------------------- estado
export interface OpcionesEstado {
  /** Radio del déficit o d0; por defecto, el del catálogo. */
  radio_m?: number;
  /** Solo servicios con plazas; por defecto `UMBRAL_DEFICIT_POR_DEFECTO`. */
  umbral?: UmbralDeficit;
}

function medianaPonderada(valores: Float64Array, pesos: Float64Array): number {
  const idx = Array.from({ length: valores.length }, (_, i) => i).filter((i) => (pesos[i] as number) > 0);
  idx.sort((a, b) => (valores[a] as number) - (valores[b] as number));
  let total = 0;
  for (const i of idx) total += pesos[i] as number;
  let acum = 0;
  for (const i of idx) {
    acum += pesos[i] as number;
    if (acum >= total / 2) return valores[i] as number;
  }
  return 0;
}

export function calcularEstado(
  servicio: ServicioId,
  secciones: Secciones,
  centros: Centros,
  opciones: OpcionesEstado = {},
): EstadoServicio {
  const def = SERVICIOS[servicio];
  const radio = opciones.radio_m ?? def.radioDefecto;
  if (!(radio > 0)) throw new Error(`Radio no válido: ${radio}`);
  const ctx = contextoSecciones(secciones);
  const obj = objetivoDe(secciones, def.grupo);
  const n = ctx.n;
  const valor = new Float64Array(n);
  const deficit = new Uint8Array(n);
  const nC = centros.ids.length;
  const { xs: cx, ys: cy } = proyectarArrays(centros.lat, centros.lon);
  let totalObjetivo = 0;
  for (let i = 0; i < n; i++) totalObjetivo += obj[i] as number;

  let umbral = radio;
  let umbralModo: UmbralDeficit | null = null;
  let media: number | null = null;
  let r: Float64Array | null = null;
  let plazasTotales: number | null = null;

  if (def.metrica === "distancia") {
    if (nC === 0) valor.fill(Infinity);
    else {
      const g = new RejillaEspacial(cx, cy, tamanoCeldaCentros(cx, cy));
      for (let i = 0; i < n; i++) {
        const { d2 } = g.masCercano(ctx.xs[i] as number, ctx.ys[i] as number);
        valor[i] = Math.sqrt(d2);
      }
    }
    for (let i = 0; i < n; i++) deficit[i] = (valor[i] as number) > radio ? 1 : 0;
  } else {
    // 2SFCA (Luo y Wang, 2003)
    const plazas = new Float64Array(nC);
    plazasTotales = 0;
    for (let j = 0; j < nC; j++) {
      const p = centros.plazas?.[j];
      plazas[j] = p == null ? 0 : p;
      plazasTotales += plazas[j] as number;
    }
    r = new Float64Array(nC);
    for (let j = 0; j < nC; j++) {
      let pob = 0;
      ctx.rejilla.cadaVecino(cx[j] as number, cy[j] as number, radio, (i) => { pob += obj[i] as number; });
      r[j] = pob > 0 ? (plazas[j] as number) / pob : 0;
    }
    for (let j = 0; j < nC; j++) {
      const add = 100 * (r[j] as number);
      if (add > 0) ctx.rejilla.cadaVecino(cx[j] as number, cy[j] as number, radio, (i) => { valor[i]! += add; });
    }
    let suma = 0;
    for (let i = 0; i < n; i++) suma += (valor[i] as number) * (obj[i] as number);
    media = totalObjetivo > 0 ? suma / totalObjetivo : 0;
    umbralModo = opciones.umbral ?? UMBRAL_DEFICIT_POR_DEFECTO;
    if (umbralModo === "media") umbral = media;
    else if (umbralModo === "mediana") umbral = medianaPonderada(valor, obj);
    else {
      const f = umbralFijo(servicio, umbralModo);
      if (f == null) throw new Error(`El umbral «${String(umbralModo)}» no existe para ${servicio}`);
      umbral = f;
    }
    for (let i = 0; i < n; i++) deficit[i] = (valor[i] as number) < umbral ? 1 : 0;
  }

  let totalDeficit = 0;
  for (let i = 0; i < n; i++) if (deficit[i]) totalDeficit += obj[i] as number;

  return {
    servicio, metrica: def.metrica, radio_m: radio, grupo: def.grupo, valor, deficit, umbral, umbralModo, media, r,
    plazasTotales, totalObjetivo, totalDeficit, nCentros: nC, centros, secciones,
  };
}

/**
 * El valor numérico del umbral calculado con la población de HOY (`seccionesHoy`), para fijarlo al calcular otro año. Con 2030 hay
 * que mantener la referencia de hoy: si «media de la Comunidad» se recalculara con la población de 2030, el déficit desaparecería
 * por definición (la media siempre deja a la mitad por debajo). Solo servicios con plazas.
 */
export function umbralDeHoy(servicio: ServicioId, seccionesHoy: Secciones, centros: Centros, radio_m: number | undefined, modo: UmbralDeficit | undefined): number {
  const e = calcularEstado(servicio, seccionesHoy, centros, { ...(radio_m === undefined ? {} : { radio_m }), ...(modo === undefined ? {} : { umbral: modo }) });
  if (e.metrica !== "plazas") throw new Error(`«${servicio}» no tiene umbral de plazas`);
  return e.umbral;
}

/** Plazas que faltan en la sección `i` para llegar al umbral (solo plazas): objetivo × (umbral − A_i) / 100 si A_i < umbral. */
export function plazasFaltanSeccion(estado: EstadoServicio, i: number, obj: Float64Array): number {
  if (estado.metrica !== "plazas") return 0;
  const d = estado.umbral - (estado.valor[i] as number);
  return d > 0 ? ((obj[i] as number) * d) / 100 : 0;
}

/**
 * Plazas que faltan para que todas las secciones lleguen al umbral. Cada plaza nueva aporta exactamente una plaza
 * a la suma de `objetivo × A_i / 100`, así que es el número de plazas necesarias si se repartieran solo entre
 * secciones deficitarias (cota inferior: una plaza real también llega a secciones que ya no lo necesitan).
 */
const FALTAN = new WeakMap<EstadoServicio, number>();

export function plazasQueFaltan(estado: EstadoServicio): number {
  if (estado.metrica !== "plazas") return 0;
  const hit = FALTAN.get(estado);
  if (hit !== undefined) return hit;
  const obj = objetivoDe(estado.secciones, estado.grupo);
  let t = 0;
  for (let i = 0; i < estado.valor.length; i++) t += plazasFaltanSeccion(estado, i, obj);
  FALTAN.set(estado, t);
  return t;
}

// ---------------------------------------------------------------- simulación
export interface PuntoSimulado {
  lat: number;
  lon: number;
  plazas?: number;
}

export function simular(estado: EstadoServicio, punto: PuntoSimulado): ResultadoSimulacion {
  if (!Number.isFinite(punto.lat) || !Number.isFinite(punto.lon)) {
    throw new RangeError(`Coordenadas no válidas: lat=${punto.lat}, lon=${punto.lon}`);
  }
  const ctx = contextoSecciones(estado.secciones);
  const obj = objetivoDe(estado.secciones, estado.grupo);
  const [x, y] = proyectar(punto.lat, punto.lon);
  const R = estado.radio_m;
  const idx: number[] = [];
  let ganan = 0;
  const res: Partial<ResultadoSimulacion> = {};

  if (estado.metrica === "distancia") {
    let w = 0, antes = 0, despues = 0;
    ctx.rejilla.cadaVecino(x, y, R, (i, d2) => {
      const o = obj[i] as number;
      const v = estado.valor[i] as number;
      if (estado.deficit[i]) { ganan += o; idx.push(i); }
      if (Number.isFinite(v) && o > 0) {
        w += o;
        antes += o * v;
        despues += o * Math.min(v, Math.sqrt(d2));
      }
    });
    if (w > 0) { res.distancia_media_antes = antes / w; res.distancia_media_despues = despues / w; }
  } else {
    const plazas = punto.plazas ?? SERVICIOS[estado.servicio].plazasDefecto ?? 0;
    let pob = 0;
    ctx.rejilla.cadaVecino(x, y, R, (i) => { pob += obj[i] as number; });
    const rNuevo = pob > 0 ? plazas / pob : 0;
    const add = 100 * rNuevo;
    const U = estado.umbral;
    let reduce = 0;
    const mejoran: number[] = [];
    ctx.rejilla.cadaVecino(x, y, R, (i) => {
      const a = estado.valor[i] as number;
      if (!(a < U)) return;
      // N: lo que baja `objetivo × max(0, U − A) / 100` en cada sección con el umbral fijo (el de hoy).
      const antes = U - a;
      const m = ((obj[i] as number) * (antes - Math.max(0, antes - add))) / 100;
      if (m > 0) { reduce += m; mejoran.push(i); }
      if (estado.deficit[i] && a + add >= U) {
        ganan += obj[i] as number;
        idx.push(i);
      }
    });
    mejoran.sort((a, b) => a - b);
    const faltanAntes = plazasQueFaltan(estado);
    res.rNuevo = rNuevo;
    res.objetivoEnRadio = pob;
    res.reduce = reduce;
    res.seccionesMejoran = mejoran;
    res.faltanAntes = faltanAntes;
    res.faltanDespues = faltanAntes - reduce;
  }
  idx.sort((a, b) => a - b);
  const cerca = ctx.rejilla.masCercano(x, y);
  return {
    ganan,
    secciones: idx,
    municipio: cerca.indice >= 0 ? (estado.secciones.mun[cerca.indice] as string) : null,
    distanciaSeccion_m: Math.sqrt(cerca.d2),
    deficitAntes: estado.totalDeficit,
    deficitDespues: estado.totalDeficit - ganan,
    ...res,
  };
}

// ---------------------------------------------------------------- óptimo voraz (MCLP)
export interface OpcionesOptimo {
  /** 1 a 3. */
  n?: number;
  /** Código(s) de zona estadística de los candidatos (`04`). Las ganancias se cuentan en toda la Comunidad. */
  zona?: string | string[];
  /** Id de municipio de los candidatos (`mun:28106`). */
  municipio?: string;
  /** Id de distrito de la capital (`dis:2807901`) de los candidatos. */
  distrito?: string;
  plazas?: number;
}

/**
 * Algoritmo voraz: en cada paso, el candidato (punto de una sección con grupo objetivo > 0) que más aporta; después se
 * actualiza el estado. Con n = 1 es exacto sobre los candidatos; con n > 1 garantiza al menos el 63 % del óptimo (1 − 1/e).
 * Si ningún candidato aporta nada, se detiene y devuelve menos de n puntos.
 *
 * - Servicios por distancia: aporta «personas que ganan acceso»; empate: la sección que aparece antes en `Secciones`.
 * - Servicios con plazas: aporta N = plazas que faltan que se reducen (umbral fijo). Orden, igual que `referencia.py`:
 *   N a 1e-6, después las plazas que faltan dentro del radio del candidato (a 1e-6: «donde más hace falta») y después el
 *   índice menor. Una sección elegida no se repite y se para si N a 1e-6 es 0.
 */
export function optimo(estado: EstadoServicio, opciones: OpcionesOptimo = {}): ResultadoOptimo {
  const nPedido = Number.isFinite(opciones.n) ? Math.floor(opciones.n as number) : 1;
  const nPuntos = Math.min(3, Math.max(1, nPedido));
  const ctx = contextoSecciones(estado.secciones);
  const obj = objetivoDe(estado.secciones, estado.grupo);
  const N = ctx.n;
  const R = estado.radio_m;
  const esPlazas = estado.metrica === "plazas";
  const plazas = opciones.plazas ?? SERVICIOS[estado.servicio].plazasDefecto ?? 0;
  const zonas = opciones.zona == null ? null : new Set(Array.isArray(opciones.zona) ? opciones.zona : [opciones.zona]);

  const cand: number[] = [];
  for (let i = 0; i < N; i++) {
    if ((obj[i] as number) <= 0) continue;
    if (zonas && !zonas.has(estado.secciones.zona[i] as string)) continue;
    if (opciones.municipio && estado.secciones.mun[i] !== opciones.municipio) continue;
    if (opciones.distrito && estado.secciones.distrito[i] !== opciones.distrito) continue;
    cand.push(i);
  }

  const deficit = Uint8Array.from(estado.deficit);
  const A = esPlazas ? Float64Array.from(estado.valor) : null;
  const addCand = new Float64Array(cand.length);
  if (esPlazas) {
    for (let k = 0; k < cand.length; k++) {
      const c = cand[k] as number;
      let pob = 0;
      ctx.rejilla.cadaVecino(ctx.xs[c] as number, ctx.ys[c] as number, R, (i) => { pob += obj[i] as number; });
      addCand[k] = pob > 0 ? (100 * plazas) / pob : 0;
    }
  }

  const U = estado.umbral;
  const elegidas = new Set<number>();
  const puntos: PuntoOptimo[] = [];
  let acumulado = 0;
  let reduceTotal = 0;
  for (let paso = 0; paso < nPuntos && cand.length > 0; paso++) {
    const defIdx: number[] = [];
    for (let i = 0; i < N; i++) if (deficit[i]) defIdx.push(i);
    if (defIdx.length === 0) break;
    const gd = new RejillaEspacial(ctx.xs, ctx.ys, Math.max(500, R / 2), defIdx);
    let mejor = -1, mejorG = 0, mejorN6 = 0, mejorL6 = 0, mejorN = 0;
    for (let k = 0; k < cand.length; k++) {
      const c = cand[k] as number;
      if (esPlazas && elegidas.has(c)) continue;
      if (!esPlazas) {
        let g = 0;
        gd.cadaVecino(ctx.xs[c] as number, ctx.ys[c] as number, R, (i) => { g += obj[i] as number; });
        if (g > mejorG) { mejorG = g; mejor = k; }
        continue;
      }
      // N del candidato y plazas que faltan dentro de su radio (criterio de desempate).
      let nC = 0, local = 0;
      const add = addCand[k] as number;
      gd.cadaVecino(ctx.xs[c] as number, ctx.ys[c] as number, R, (i) => {
        const base = U - (A![i] as number);
        if (!(base > 0)) return;
        const o = obj[i] as number;
        nC += (o * (base - Math.max(0, base - add))) / 100;
        local += (o * base) / 100;
      });
      const n6 = Math.round(nC * 1e6);
      const l6 = Math.round(local * 1e6);
      if (mejor < 0 || n6 > mejorN6 || (n6 === mejorN6 && l6 > mejorL6)) { mejor = k; mejorN6 = n6; mejorL6 = l6; mejorN = nC; }
    }
    if (mejor < 0) break;
    if (esPlazas && mejorN6 <= 0) break;
    if (!esPlazas && !(mejorG > 0)) break;
    const c = cand[mejor] as number;
    const add = addCand[mejor] as number;
    let ganan = 0;
    if (esPlazas) {
      ctx.rejilla.cadaVecino(ctx.xs[c] as number, ctx.ys[c] as number, R, (i) => {
        if (deficit[i] && (A![i] as number) + add >= U) ganan += obj[i] as number;
        A![i]! += add;
        deficit[i] = (A![i] as number) < U ? 1 : 0;
      });
      elegidas.add(c);
      reduceTotal += mejorN;
    } else {
      gd.cadaVecino(ctx.xs[c] as number, ctx.ys[c] as number, R, (i) => { deficit[i] = 0; });
      ganan = mejorG;
    }
    acumulado += ganan;
    const punto: PuntoOptimo = {
      lat: estado.secciones.lat[c] as number,
      lon: estado.secciones.lon[c] as number,
      seccion: estado.secciones.ids[c] as string,
      indice: c,
      municipio: estado.secciones.mun[c] as string,
      ganan,
      acumulado,
    };
    if (esPlazas) { punto.reduce = mejorN; punto.reduceAcumulado = reduceTotal; }
    puntos.push(punto);
  }
  const res: ResultadoOptimo = { puntos, deficitAntes: estado.totalDeficit, deficitDespues: estado.totalDeficit - acumulado, candidatos: cand.length };
  if (esPlazas) {
    const antes = plazasQueFaltan(estado);
    res.reduce = reduceTotal;
    res.faltanAntes = antes;
    res.faltanDespues = antes - reduceTotal;
  }
  return res;
}

/**
 * Para el Web Worker: todo son datos serializables (JSON y números) y devuelve un objeto plano. El worker recibe
 * `secciones` y `centros` una vez y llama a esto con cada petición.
 */
export function calcularOptimo(
  servicio: ServicioId,
  secciones: Secciones,
  centros: Centros,
  estado: OpcionesEstado,
  opciones: OpcionesOptimo,
): ResultadoOptimo {
  return optimo(calcularEstado(servicio, secciones, centros, estado), opciones);
}
