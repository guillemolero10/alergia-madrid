// «Otros servicios sociales» de la ficha: recuento por sector dentro de un municipio o distrito, sin semáforo.
import { distritoEn } from "./lugares";
import type { Centros, Territorios } from "./tipos";

export interface FilaSector {
  sector: string;
  n: number;
  /** Plazas que declara el registro (las que no trae cuentan 0). Los hogares y clubes no las llevan: es su aforo, no atención de día. */
  plazas: number;
}

/**
 * Un nombre honesto para cada subtipo de «Personas mayores»: el registro llama «centros de día» a los hogares y clubes de
 * mayores (centros sociales de convivencia, 211 con coordenadas), que no son atención de día, y a los centros de día de verdad
 * (312) los distingue con el subtipo «CENTROS DE DÍA: OTROS».
 */
export const HOGARES_Y_CLUBES = "Hogares y clubes de mayores";
export const CENTROS_DE_DIA = "Centros de día de mayores";

export function sectorDeCentro(sector: string | undefined, subtipo: string | undefined): string {
  const base = sectorLegible(sector);
  if (base !== "Personas mayores") return base;
  const st = (subtipo ?? "").toUpperCase();
  if (st === "HOGARES Y CLUBES") return HOGARES_Y_CLUBES;
  if (st === "CENTROS DE DÍA: OTROS" || st === "CENTROS DE DIA: OTROS") return CENTROS_DE_DIA;
  return base;
}

/** Une los sectores que el registro escribe de varias formas. */
export function sectorLegible(sector: string | undefined): string {
  const s = (sector ?? "").replace(/^\(Inmigraci[oó]n\)\s*/i, "").trim();
  if (!s) return "Otros grupos en situación de necesidad";
  if (/^(infancia|adolescencia|infancia y adolescencia)$/i.test(s)) return "Infancia y adolescencia";
  return s;
}

/** Centros por sector en el lugar (`mun:…` o `dis:…`), de más a menos; los empates, por orden alfabético. */
export function otrosSocialesDe(c: Centros, t: Territorios, lugar: string): FilaSector[] {
  const porSector = new Map<string, FilaSector>();
  const esDistrito = lugar.startsWith("dis:");
  for (let j = 0; j < c.ids.length; j++) {
    const m = c.mun[j] as string;
    if (esDistrito ? m !== "mun:28079" || distritoEn(t, c.lat[j] as number, c.lon[j] as number) !== lugar : m !== lugar) continue;
    const sector = sectorDeCentro(c.sector?.[j], c.subtipo?.[j]);
    const f = porSector.get(sector) ?? { sector, n: 0, plazas: 0 };
    f.n++;
    if (sector !== HOGARES_Y_CLUBES) f.plazas += c.plazas?.[j] ?? 0;
    porSector.set(sector, f);
  }
  return [...porSector.values()].sort((a, b) => b.n - a.n || a.sector.localeCompare(b.sector, "es"));
}
