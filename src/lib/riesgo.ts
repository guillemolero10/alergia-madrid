import { NIVELES, type CapasVisibles, type Nivel, type Riesgo } from "./tipos";

// Paleta del semáforo. Pensada para fondo oscuro y para distinguirse también con daltonismo:
// verde azulado / ámbar / bermellón difieren en el eje azul-amarillo y en luminosidad, no solo en rojo-verde.
// El mapa añade además tamaño, número de anillos y ritmo del pulso; los paneles, siempre el texto del nivel.
export const COLOR_NIVEL: Record<Nivel, string> = {
  sin_dato: "#8b96ad",
  bajo: "#34d8a6",
  medio: "#ffc247",
  alto: "#ff5a5f",
};

export const ETIQUETA_NIVEL: Record<Nivel, string> = {
  sin_dato: "Sin dato",
  bajo: "Bajo",
  medio: "Medio",
  alto: "Alto",
};

export function esNivel(valor: unknown): valor is Nivel {
  return typeof valor === "string" && (NIVELES as readonly string[]).includes(valor);
}

/** Color del semáforo. Cualquier valor que no sea un nivel conocido se pinta como «sin dato» (gris). */
export function colorDeNivel(nivel: unknown): string {
  return esNivel(nivel) ? COLOR_NIVEL[nivel] : COLOR_NIVEL.sin_dato;
}

export function etiquetaDeNivel(nivel: unknown): string {
  return esNivel(nivel) ? ETIQUETA_NIVEL[nivel] : ETIQUETA_NIVEL.sin_dato;
}

/** Posición en la escala sin_dato < bajo < medio < alto. */
export function ordenDeNivel(nivel: unknown): number {
  return esNivel(nivel) ? NIVELES.indexOf(nivel) : 0;
}

export function nivelMaximo(niveles: readonly unknown[]): Nivel {
  let max: Nivel = "sin_dato";
  for (const n of niveles) {
    if (esNivel(n) && ordenDeNivel(n) > ordenDeNivel(max)) max = n;
  }
  return max;
}

/**
 * Nivel con el que se pinta una estación según las capas encendidas:
 * aire y polen → el global; solo una → el suyo; ninguna → `null` (la estación se atenúa).
 */
export function nivelVisible(riesgo: Riesgo | undefined, capas: Pick<CapasVisibles, "aire" | "polen">): Nivel | null {
  if (!capas.aire && !capas.polen) return null;
  if (!riesgo) return "sin_dato";
  if (capas.aire && capas.polen) return esNivel(riesgo.nivel) ? riesgo.nivel : "sin_dato";
  const parcial = capas.aire ? riesgo.nivel_aire : riesgo.nivel_polen;
  return esNivel(parcial) ? parcial : "sin_dato";
}

export type RecuentoNiveles = Record<Nivel, number>;

export function contarNiveles(niveles: readonly (Nivel | null)[]): RecuentoNiveles {
  const recuento: RecuentoNiveles = { sin_dato: 0, bajo: 0, medio: 0, alto: 0 };
  for (const n of niveles) if (n) recuento[n] += 1;
  return recuento;
}

/** Frase corta para la cabecera: «Riesgo bajo en las 28 estaciones» o «2 en alto · 5 en medio · 21 en bajo». */
export function resumirRecuento(recuento: RecuentoNiveles): string {
  const total = recuento.sin_dato + recuento.bajo + recuento.medio + recuento.alto;
  if (total === 0) return "Sin estaciones";
  for (const nivel of ["alto", "medio", "bajo"] as const) {
    if (recuento[nivel] === total) return `Riesgo ${nivel} en las ${total} estaciones`;
  }
  if (recuento.sin_dato === total) return `Sin dato en las ${total} estaciones`;
  const partes: string[] = [];
  for (const nivel of ["alto", "medio", "bajo"] as const) {
    if (recuento[nivel] > 0) partes.push(`${recuento[nivel]} en ${nivel}`);
  }
  if (recuento.sin_dato > 0) partes.push(`${recuento.sin_dato} sin dato`);
  return partes.join(" · ");
}

// --- nombres de variables ---

interface InfoVariable {
  corto: string;
  largo: string;
}

const VARIABLES_AIRE: Record<string, InfoVariable> = {
  no2: { corto: "NO₂", largo: "Dióxido de nitrógeno" },
  o3: { corto: "O₃", largo: "Ozono" },
  pm10: { corto: "PM10", largo: "Partículas de hasta 10 µm" },
  pm25: { corto: "PM2,5", largo: "Partículas finas, hasta 2,5 µm" },
};

// Nombres como los publica la Comunidad de Madrid (mediciones_polen), con el nombre común entre paréntesis
// cuando el oficial es el científico. Las claves son las de `observaciones[].variable` sin el prefijo `polen_`.
const POLENES: Record<string, string> = {
  abedul: "Abedul",
  aligustre: "Aligustre",
  aliso: "Aliso",
  arce: "Arce",
  artemisia: "Artemisia",
  castano: "Castaño",
  compuestas: "Compuestas",
  corylus: "Corylus (avellano)",
  cupresaceas: "Cupresáceas/Taxáceas",
  ericaceae: "Ericáceas",
  eucalipto: "Eucalipto",
  fresno: "Fresno",
  gramineas: "Gramíneas",
  moreras: "Moreras",
  olivo: "Olivo",
  olmos: "Olmos",
  pinos: "Pinos",
  plantago: "Plantago (llantén)",
  platano: "Plátano de paseo",
  populus: "Populus (chopos)",
  quenopodiaceas: "Quenopodiáceas/Amarantáceas",
  quercus: "Quercus (encinas y robles)",
  rumex: "Rumex (acederas)",
  sauces: "Sauces",
  urticaceae: "Urticáceas (ortigas)",
};

export function esPolen(variable: string): boolean {
  return variable.startsWith("polen_");
}

export function nombreVariable(variable: string): InfoVariable {
  const aire = VARIABLES_AIRE[variable];
  if (aire) return aire;
  if (esPolen(variable)) {
    const tipo = variable.slice("polen_".length);
    const nombre = POLENES[tipo] ?? capitalizar(tipo.replaceAll("_", " "));
    return { corto: nombre, largo: `Polen de ${nombre}` };
  }
  return { corto: variable.toUpperCase(), largo: variable };
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

const REGLAS: Record<string, string> = {
  "1h": "valor de la última hora",
  media8h: "media móvil de 8 h",
  media24h: "media móvil de 24 h",
  diario: "valor diario",
};

export function textoRegla(regla: string | undefined): string | null {
  return regla ? (REGLAS[regla] ?? null) : null;
}
