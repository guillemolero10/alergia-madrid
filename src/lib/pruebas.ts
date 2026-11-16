// Datos mínimos para las pruebas (no se empaquetan en la web: solo los importan los *.test.ts).
import type { EstadoActual, Lugares } from "./tipos";

export const LUGARES_PRUEBA: Lugares = {
  estaciones: [
    { id: "est:28065014", nombre: "Getafe", municipio: "Getafe", lat: 40.3146, lon: -3.7169, tipo: "trafico", mide: ["no2", "o3"], captador: "cap:GETA", dist_captador_km: 1.46 },
    { id: "est:28115003", nombre: "Pozuelo de Alarcón", municipio: "Pozuelo de Alarcón", lat: 40.4466, lon: -3.808, tipo: "trafico", mide: ["no2"], captador: "cap:FACF", dist_captador_km: 6.92 },
  ],
  captadores: [
    { id: "cap:GETA", nombre: "Getafe", localidad: "Getafe", lat: 40.3102, lon: -3.7331, activo: true },
    { id: "cap:FACF", nombre: "Madrid-Ciudad Universitaria", localidad: "Madrid", lat: 40.4454, lon: -3.7263, activo: true },
    { id: "cap:AYTM", nombre: "Madrid-Arganzuela", localidad: "Madrid", lat: 40.4025, lon: -3.6955, activo: true },
    { id: "cap:LEGA", nombre: "Leganés", localidad: "Leganés", lat: 40.3284, lon: -3.7656, activo: false },
  ],
  municipios: [
    { id: "mun:28065", nombre: "Getafe", alias: ["getafe"], lat: 40.3146, lon: -3.7169, estacion: "est:28065014", dist_estacion_km: 0, captador: "cap:GETA", dist_captador_km: 1.46, cobertura_aire: "buena" },
    { id: "mun:28079", nombre: "Madrid", alias: ["madrid"], lat: 40.4168, lon: -3.7038, estacion: "est:28115003", dist_estacion_km: 9.42, captador: "cap:AYTM", dist_captador_km: 1.74, cobertura_aire: "lejana" },
  ],
};

const serie = (ultimo: number) => [...Array<null>(12).fill(null), 4, 3, 1, 2, 1, 1, 1, 1, 1, 1, 1, ultimo];

/** Estado sin la capa `polen` (como los JSON anteriores a la tarea 5): la web tiene que aguantarlo. */
export function estadoSinPolen(): EstadoActual {
  const hora = "2026-11-15T13:00:00+01:00";
  const fuente = "ckan:calidad_aire_datos_dia";
  return {
    version: 1,
    generado: "2026-11-15T13:26:15+01:00",
    modo: "tiempo_real",
    fecha_referencia: hora,
    capas: {
      aire: { ultimo_dato: hora, fuente, estado: "ok" },
      viento: { ultimo_dato: "2026-11-15T13:15:00+01:00", fuente: "open-meteo:forecast", estado: "ok" },
    },
    observaciones: [
      { lugar: "est:28065014", variable: "o3", valor: 48, unidad: "µg/m³", hora, fuente, nivel: "bajo", regla: "media8h", valor_regla: 41.5, provisional: true, serie: serie(48) },
      { lugar: "est:28065014", variable: "no2", valor: 23, unidad: "µg/m³", hora, fuente, nivel: "bajo", regla: "1h", valor_regla: 23, provisional: true, serie: serie(23) },
      { lugar: "est:28115003", variable: "no2", valor: 95, unidad: "µg/m³", hora, fuente, nivel: "medio", regla: "1h", valor_regla: 95, provisional: true, serie: serie(95) },
    ],
    riesgo: [
      { lugar: "est:28065014", nivel: "bajo", nivel_aire: "bajo", nivel_polen: "sin_dato", peor_variable: "no2", captador: "cap:GETA", polen_antiguedad_dias: null },
      { lugar: "est:28115003", nivel: "medio", nivel_aire: "medio", nivel_polen: "sin_dato", peor_variable: "no2", captador: "cap:FACF", polen_antiguedad_dias: null },
    ],
    viento: [
      { lat: 40.0, lon: -4.0, velocidad_kmh: 10, direccion_grados: 270 },
      { lat: 40.0, lon: -3.5, velocidad_kmh: 20, direccion_grados: 270 },
      { lat: 40.5, lon: -4.0, velocidad_kmh: 10, direccion_grados: 180 },
      { lat: 40.5, lon: -3.5, velocidad_kmh: 20, direccion_grados: 180 },
    ],
  };
}

/** El mismo estado con la capa `polen`: gramíneas altas en Getafe (hace 2 días) y polen en Arganzuela. */
export function estadoConPolen(): EstadoActual {
  const estado = estadoSinPolen();
  const fuente = "ckan:mediciones_polen";
  estado.capas.polen = { ultimo_dato: "2026-11-13", fuente, estado: "ok" };
  estado.observaciones.push(
    { lugar: "cap:GETA", variable: "polen_gramineas", valor: 60, unidad: "granos/m³", hora: "2026-11-13", fuente, nivel: "alto", regla: "diario", valor_regla: 60 },
    { lugar: "cap:GETA", variable: "polen_olivo", valor: 0, unidad: "granos/m³", hora: "2026-11-13", fuente, nivel: "bajo", regla: "diario", valor_regla: 0 },
    { lugar: "cap:GETA", variable: "polen_artemisia", valor: 2, unidad: "granos/m³", hora: "2026-11-13", fuente, nivel: "medio", regla: "diario", valor_regla: 2 },
    { lugar: "cap:AYTM", variable: "polen_gramineas", valor: 70, unidad: "granos/m³", hora: "2026-11-12", fuente, nivel: "alto", regla: "diario", valor_regla: 70 },
  );
  estado.riesgo[0] = { lugar: "est:28065014", nivel: "alto", nivel_aire: "bajo", nivel_polen: "alto", peor_variable: "polen_gramineas", captador: "cap:GETA", polen_antiguedad_dias: 2 };
  return estado;
}
