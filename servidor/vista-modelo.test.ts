// Lo que ve el modelo (I3): cifras en español con unidad, sin nombres con «déficit», sin coordenadas, sin enlaces, y compatible con el validador.
import { describe, expect, it } from "vitest";
import { ALIAS_LUGARES } from "../src/lib/aliasLugares";
import { crearEntorno, ejecutarHerramienta } from "../src/lib/donde/herramientas";
import { revisarFormato } from "./evaluacion";
import { numerosPermitidos, paraElModelo, validarTexto } from "./validador";
import { vistaParaModelo } from "./vista-modelo";

async function ver(nombre: string, entrada: unknown) {
  const { crearCargadorNode } = await import("./datos");
  const c = crearCargadorNode(process.cwd(), import.meta.url);
  const d = await c.datos(2025);
  const e = crearEntorno(d, { cargarServicio: c.cargarServicio, aliasLugares: ALIAS_LUGARES, contexto: { vista: "donde", servicio: null, radio_m: null, lugar: null }, seccionesHoy: d.secciones, datosHoy: d });
  const r = await ejecutarHerramienta(nombre, entrada, e);
  return { r, texto: JSON.stringify(paraElModelo(vistaParaModelo(r))) };
}

describe("vista para el modelo", () => {
  it("residencia: plazas (no personas) con coma decimal y unidad; sin «deficit», coordenadas ni enlaces", async () => {
    const { texto } = await ver("ubicacion_optima", { servicio: "residencia", zona: "sur", plazas: 94 });
    expect(texto).toContain('"plazas_que_pasan_a_estar_cubiertas":"93,8 plazas"');
    expect(texto).toContain('"plazas_del_centro":"94 plazas"');
    expect(texto).not.toMatch(/deficit|déficit|"lat"|"lon"|https?:/i);
    expect(texto).not.toContain("ganan");
    expect(texto).toContain('"radio":"10 km"');
  });
  it("distancia: miles con punto y el grupo como unidad; el radio en km/m, nunca como «umbral»", async () => {
    const { texto } = await ver("ranking_deficit", { servicio: "hospital", zona: "sierra" });
    expect(texto).toMatch(/"personas_en_zonas_con_margen_de_mejora":"[\d.]+ habitantes"/);
    expect(texto).toMatch(/9\.459 habitantes/);
    expect(texto).toContain('"porcentaje":"100 %"');
    expect(texto).not.toMatch(/umbral|"radio_m"/);
  });
  it("una ficha sin nadie lejos del centro lo dice en positivo (no «0 habitantes (0,0 %)»)", async () => {
    const { texto } = await ver("ficha_municipio", { lugar: "Parla" });
    expect(texto).toContain("todos los habitantes viven a menos de 15 km de uno");
    expect(texto).not.toContain("0,0 %");
    expect(texto).not.toMatch(/deficit|"url"|https?:/i);
  });
  it("las cifras que enseña son aceptadas por el validador (el modelo que las copia no se rechaza) y las inventadas no", async () => {
    const { r } = await ver("ubicacion_optima", { servicio: "residencia", zona: "sur", plazas: 94 });
    if (!r.ok) throw new Error("sin salida");
    const permitidos = numerosPermitidos([r.salida]);
    expect(validarTexto("Propone Getafe: pasan a estar cubiertas 93,8 plazas, un aprovechamiento del 99,8 %. Quedan por cubrir 9.954 plazas.", permitidos)).toEqual({ ok: true });
    expect(validarTexto("Pasan a estar cubiertas 120 plazas.", permitidos).ok).toBe(false);
    expect(revisarFormato("93,8 plazas, 10.048 plazas, 9.954 plazas")).toEqual([]);
  });
  it("los errores y mover_mapa pasan tal cual", async () => {
    const { r } = await ver("ficha_municipio", { lugar: "zzzzqqqq" });
    expect(vistaParaModelo(r)).toMatchObject({ ok: false, error: { codigo: "lugar" } });
  });
});
