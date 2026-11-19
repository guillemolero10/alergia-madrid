// T4: el validador de cifras contra textos que escribiría un modelo. Los huecos y falsos positivos que encontró T4 están arreglados (ver «Arreglos» en docs/T4-informe.md).
import { describe, expect, it } from "vitest";
import { numerosDelTexto, numerosPermitidos, validarTexto } from "./validador";

// Lo que podría salir de las herramientas en una ubicación óptima de residencia (valores del caso 4 de referencia.json).
const SALIDA = { plazas: 94, puntos: [{ municipio: "Leganés", reduce: 93.82, ganan: 1581, pct: 0.68, lat: 40.3, lon: -3.7 }], umbral: 4.11, criterio: "mayores de 65 con menos de 4,11 plazas por cada 100" };
const permitidos = () => numerosPermitidos([SALIDA], []);
const pasa = (t: string) => validarTexto(t, permitidos()).ok;

describe("T4 validador: formatos españoles que SÍ deben pasar", () => {
  for (const t of ["Reduce en 93,8 las plazas que faltan.", "Son 94 plazas.", "+1.581 personas.", "El 68 % de los mayores.", "El 68% de los mayores.", "Unos 1,581 mil", "En 2030 será otra cosa.", "Son las 10:00.", "1) Parla 2) Pinto", "Referencia de 4,11 plazas por cada 100 mayores de 65."]) {
    it(`pasa: ${t}`, () => expect(pasa(t), t).toBe(true));
  }
});

describe("T4 validador: cifras inventadas que NO deben pasar", () => {
  for (const t of ["Beneficia a 12.345 mayores.", "Faltan 7.777 plazas.", "Son 93,1 plazas.", "El 45 % de los mayores.", "1.581.000 personas", "unas 500 residencias"]) {
    it(`rechaza: ${t}`, () => expect(pasa(t), t).toBe(false));
  }
  it("rechaza texto con coordenadas escritas a mano", () => expect(pasa("Ponla en 40,3012, -3,7011.")).toBe(false));
});

describe("T4 validador: huecos cerrados", () => {
  it("T4-1: una cifra inventada dentro de «comillas latinas» se comprueba; un nombre con su número (que sale de la herramienta) pasa", () => {
    expect(pasa("Se beneficiarían «12.345 mayores» más.")).toBe(false);
    expect(pasa("Faltan «7.777 plazas» en Parla.")).toBe(false);
    expect(pasa("Quedan «12.345».")).toBe(false);
    const perm = numerosPermitidos([{ nombre: "Residencia 12 de Octubre", plazas: 94 }], []);
    expect(validarTexto("La «Residencia 12 de Octubre» tiene 94 plazas.", perm).ok).toBe(true);
    expect(validarTexto("La «Residencia 13 de Octubre» tiene 94 plazas.", perm).ok).toBe(false);
  });
  it("T4-2: un entero de 2000 a 2039 solo es un año si es 2025/2030 con contexto de año; lo demás se comprueba", () => {
    expect(pasa("Faltan 2024 plazas.")).toBe(false);
    expect(pasa("Beneficia a 2010 mayores.")).toBe(false);
    expect(pasa("Faltan 2025 plazas.")).toBe(false); // sin contexto de año y seguido de un sustantivo contado
    expect(pasa("Hay 2030 mayores.")).toBe(false);
    expect(pasa("Son 2.024 plazas.")).toBe(false);
    expect(pasa("Son 2000 mayores.")).toBe(false);
    for (const t of ["En 2030 será otra cosa.", "Con datos de 2025.", "Para el año 2030.", "Hoy (2025) falta menos.", "Proyección a 2030.", "Censo de 2025: Parla."]) expect(pasa(t), t).toBe(true);
    expect(pasa("En 2024 había menos.")).toBe(false); // 2024 no es un año de la app
  });
  it("T4-2: un número 2000-2039 que escribió el usuario o sale de las herramientas sí vale", () => {
    const perm = numerosPermitidos([{ plazas: 2024 }], ["¿y si son 2010 personas?"]);
    expect(validarTexto("Son 2024 plazas.", perm).ok).toBe(true);
    expect(validarTexto("Hablas de 2010 personas.", perm).ok).toBe(true);
  });
  it("T4-3: sin tolerancia de ±1 sobre un entero; el redondeo es el de los decimales escritos (94 y 93,8 por 93,82; 95 no)", () => {
    expect(pasa("Ganan 1.582 personas.")).toBe(false);
    expect(pasa("Ganan 1.580 personas.")).toBe(false);
    expect(pasa("Es el 69 % de los mayores.")).toBe(false);
    expect(pasa("Es el 67 % de los mayores.")).toBe(false);
    expect(pasa("Ganan 1.581 personas.")).toBe(true);
    for (const t of ["Reduce en 94 las plazas.", "Reduce en 93,8 las plazas.", "Reduce en 93,82 las plazas."]) expect(pasa(t), t).toBe(true);
    for (const t of ["Reduce en 95 las plazas.", "Reduce en 93 las plazas.", "Reduce en 93,9 las plazas.", "Reduce en 93,7 las plazas."]) expect(pasa(t), t).toBe(false);
  });
  it("T4-4: números con letras por encima de «diez» y «mil/millón» sueltos se rechazan; hasta diez pasan", () => {
    for (const t of ["Beneficia a unos mil quinientos mayores.", "Faltan doscientas mil plazas.", "Cuesta tres millones de euros.", "Hay veinte residencias.", "Hay veintiuna.", "Unos cien centros.", "Son quinientos.", "Hay docenas de centros.", "Miles de mayores.", "Un millón de personas.", "Treinta y cinco plazas.", "Hay once."]) {
      expect(pasa(t), t).toBe(false);
    }
    for (const t of ["Hay dos residencias y tres colegios.", "Solo uno.", "Diez km.", "Ciencia de datos.", "Una cierta cantidad.", "Es milagroso."]) expect(pasa(t), t).toBe(true);
    expect(validarTexto("Hay mil plazas.", permitidos())).toMatchObject({ ok: false, motivo: "cifras", detalle: "mil" });
  });
  it("T4-5: ningún dominio, correo ni ruta pasa; las frases normales sí", () => {
    for (const t of ["Más en bit.ly/abc", "Mira ejemplo.dev", "Entra en evil.xyz/a", "Escribe a mailto:a@b.c", "Más info en gob.madrid", "Escribe a hola@correo.es", "EJEMPLO.COM", "ftp://x", "tel:123", "//evil", "www.parla", "Mira datos.comunidad.madrid", "Mira sitio.web/ruta"]) expect(pasa(t), t).toBe(false);
    for (const t of ["Parla, Pinto y Getafe.", "Ve a Parla. Después a Pinto.", "Hay 4,11 plazas.", "Sale 93,8.", "Madrid.Hay", "Parla.El mapa."]) expect(pasa(t.replace("Hay 4,11 plazas.", "Son 94 plazas.").replace("Sale 93,8.", "Son 94 plazas.")), t).toBe(true);
  });
  it("T4-8: un número que no cabe en un number (400 cifras) se rechaza, también con «mil»", () => {
    expect(pasa("Hay " + "9".repeat(400) + " plazas")).toBe(false);
    expect(pasa("Hay " + "9".repeat(400) + " mil plazas")).toBe(false);
    expect(pasa("Hay 1" + "0".repeat(30) + " plazas")).toBe(false); // finito pero no sale de las herramientas
    expect(numerosDelTexto("Hay " + "9".repeat(400))).toEqual([Infinity]);
  });
});

describe("T4 validador: cifras del método y redondeos naturales (sin abrir hueco)", () => {
  it("T4-6: edades, 3 a 16, 6 servicios, «por cada 100» y radios valen con su contexto", () => {
    for (const t of ["Hablo de mayores de 75 años.", "Hay 6 servicios.", "Los colegios cubren de 3 a 16 años.", "Los mayores de 65 años.", "Tramos de 5 años.", "Población de 75 y más.", "Con 4,11 plazas por cada 100 mayores.", "A menos de 2 km.", "A menos de 500 m.", "A menos de 1,5 km.", "A menos de 10 km.", "A menos de 15 km.", "Mayores de 65."]) {
      expect(validarTexto(t, numerosPermitidos([{ umbral: 4.11 }], [])).ok, t).toBe(true);
    }
  });
  it("T4-6: las mismas cifras SIN su contexto son inventadas", () => {
    for (const t of ["Hay 75 residencias.", "Faltan 65 plazas.", "Hay 6 residencias.", "Son 16 centros.", "Hay 3 hospitales nuevos de 100 camas.", "A 7 km.", "Hay 5 millones de plazas.", "Faltan 2 plazas.", "Faltan 100 plazas."]) {
      expect(validarTexto(t, numerosPermitidos([], [])).ok, t).toBe(false);
    }
    expect(pasa("Hay 0 plazas y 1 residencia.")).toBe(true); // 0 y 1 valen siempre
  });
  it("T4-6b: «1,3 millones» y «7,1 millones» valen si redondean una cifra de las herramientas con los decimales escritos", () => {
    const perm = numerosPermitidos([{ mayores_65: 1342648, poblacion: 7113886, faltan: 10689 }], []);
    for (const t of ["Hay 1,3 millones de mayores de 65 años.", "La Comunidad tiene 7,1 millones de habitantes.", "Hay 1 millón de mayores.", "Hay 1,34 millones.", "Faltan 11 mil plazas.", "Faltan 10,7 mil plazas.", "Hay 7 millones de habitantes."]) {
      expect(validarTexto(t, perm).ok, t).toBe(true);
    }
    for (const t of ["Hay 1,4 millones de mayores.", "Hay 2 millones de mayores.", "Hay 7,2 millones de habitantes.", "Faltan 10 mil plazas.", "Faltan 12 mil plazas.", "Hay 3 millones de habitantes.", "Faltan 5 millones."]) {
      expect(validarTexto(t, perm).ok, t).toBe(false);
    }
  });
  it("T4-6: el «99 %» que escribe la propia app para un 99,8 pasa; si el valor es 100 exacto o no existe, no", () => {
    expect(validarTexto("El 99 % de sus plazas.", numerosPermitidos([{ pct: 99.8 }], [])).ok).toBe(true);
    expect(validarTexto("El 99 % de sus plazas.", numerosPermitidos([{ pct: 100 }], [])).ok).toBe(false);
    expect(validarTexto("El 99 % de sus plazas.", numerosPermitidos([{ pct: 87 }], [])).ok).toBe(false);
  });
  it("T4-7: «1 581» con espacio normal, duro o fino como separador de miles se lee como 1.581", () => {
    expect(numerosDelTexto("Ganan 1 581 personas")).toEqual([1581]);
    expect(numerosDelTexto("Ganan 1 581 personas")).toEqual([1581]);
    expect(numerosDelTexto("Ganan 1 581 personas")).toEqual([1581]);
    expect(numerosDelTexto("Ganan 1 581 personas")).toEqual([1581]);
    expect(numerosDelTexto("Son 1 342 648 mayores")).toEqual([1342648]);
    expect(numerosDelTexto("Son 12 345,5")).toEqual([12345.5]);
    expect(pasa("Ganan 1 581 personas.")).toBe(true);
    expect(pasa("Ganan 12 345 personas.")).toBe(false);
  });
  it("tabla de formatos: 1.581, 1581, 4.11 (decimal a la inglesa), 4,11, 78 %, 78%", () => {
    expect(numerosDelTexto("1.581 | 1581 | 4.11 | 4,11 | 78 % | 78% | 0,5")).toEqual([1581, 1581, 4.11, 4.11, 78, 78, 0.5]);
  });
});

describe("T4 validador: casos límite sin romper", () => {
  it("no lanza con basura", () => {
    for (const t of ["", " ", "\u0000", "9".repeat(5000), "1.".repeat(900), "1,".repeat(900), "💥".repeat(900), "0,0000000000001", "1e400", "١٢٣"]) {
      expect(() => validarTexto(t, permitidos()), t.slice(0, 10)).not.toThrow();
    }
  });
  it("0 y cifras pequeñas habituales", () => {
    expect(pasa("No hay ninguna: 0 plazas.")).toBe(true);
  });
  it("tiempo razonable con un texto de 2.000 caracteres lleno de números", () => {
    const t = Array.from({ length: 400 }, (_, i) => String(i % 10)).join(" ");
    const t0 = performance.now();
    validarTexto(t.slice(0, 2000), permitidos());
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("R3: filas aproximadas", () => {
  it("el texto no puede citar el porcentaje de una fila aproximada, pero sí el de una normal", () => {
    const salida = { filas: [{ nombre: "San Martín", pct: 100, en_deficit: 9302, objetivo: 9302, aproximada: true }, { nombre: "Getafe", pct: 12.5, en_deficit: 900, objetivo: 7200 }] };
    const perm = numerosPermitidos([salida], []);
    expect(validarTexto("San Martín tiene centro dentro y la cifra no es fiable. En Getafe, el 12,5 %.", perm).ok).toBe(true);
    expect(validarTexto("En San Martín el 100 % de los vecinos vive lejos (9.302).", perm).ok).toBe(false);
  });
});
