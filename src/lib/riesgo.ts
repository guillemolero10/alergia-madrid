import { NIVELES, type CapasVisibles, type Nivel, type Riesgo } from "./tipos";

// Paleta del semáforo: colores planos pensados para el mapa claro (tierra crema #f3efe6).
// Para distinguirse también con daltonismo, el verde tira a azulado (se separa del ámbar y del rojo en el eje
// azul-amarillo) y el ámbar es mucho más luminoso que el rojo. El mapa añade además el tamaño del símbolo y
// los paneles, siempre el texto del nivel. El ámbar no llega a 3:1 sobre crema por sí solo: por eso todos los
// símbolos llevan un contorno fino de tinta (ver Mapa.css).
export const COLOR_NIVEL: Record<Nivel, string> = {
  sin_dato: "#7f858e",
  bajo: "#24896b",
  medio: "#e0a100",
  alto: "#c8372d",
};

/**
 * Versión oscura de cada color para escribir texto sobre los paneles (#fffdf8) con contraste AA (4,5:1).
 * Son los `--nivel-*-tinta` de base.css.
 */
export const TINTA_NIVEL: Record<Nivel, string> = {
  sin_dato: "#5c6168",
  bajo: "#1b6b52",
  medio: "#8a5a00",
  alto: "#a8281f",
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
