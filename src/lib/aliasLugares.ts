// Alias de los municipios («sanse», «alcala»…) tomados de `datos-estaticos/lugares.json`. Se carga en un trozo aparte (72 kB) y
// solo lo pide la web después de pintar: sin él, el buscador y el agente funcionan igual, solo que sin los apodos.
import { municipios } from "../../datos-estaticos/lugares.json";
import { aliasDeLugares } from "./donde/buscador";

export const ALIAS_LUGARES: Record<string, string[]> = aliasDeLugares({ municipios: municipios as { id: string; alias?: string[] }[] });
