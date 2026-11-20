import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AcercaDe, actualizacionTexto, fechaEs, META_VACIA, type MetaAcerca } from "./AcercaDe";
import { COMUNIDAD, FUENTES, URL_DEMO, URL_REPO } from "../lib/fuentes";

const META: MetaAcerca = {
  base: { secciones: 4518, habitantes: 7113886, mayores: 1342648, municipios: 179, distritos: 21, zonas: 8, generado: "2026-11-18" },
  centros: { residencia: { n: 518, actualizado: "2026-10-02", generado: "2026-11-18" }, dea: { n: 10551, actualizado: null, generado: "2026-11-18" } },
  error2030: { pond65: 1.3, pond75: 1.8, tip65: 3.3, tip75: 5.5 },
};

describe("«Qué es»: formato", () => {
  it("fechas en español y lo que no es fecha, tal cual", () => {
    expect(fechaEs("2026-11-18")).toBe("18 de noviembre de 2026");
    expect(fechaEs("2026-01-05T10:00:00Z")).toBe("5 de enero de 2026");
    expect(fechaEs("Edición de 2025")).toBe("Edición de 2025");
  });
  it("cuándo se actualizó cada fuente sale de los metadatos, no se escribe a mano", () => {
    expect(actualizacionTexto({ tipo: "servicio", servicio: "residencia" }, META)).toBe(
      "Actualizado en la fuente el 2 de octubre de 2026; copiado el 18 de noviembre de 2026",
    );
    expect(actualizacionTexto({ tipo: "servicio", servicio: "dea" }, META)).toBe("Copiado el 18 de noviembre de 2026");
    expect(actualizacionTexto({ tipo: "servicio", servicio: "farmacia" }, META)).toBe("Cargando…");
    expect(actualizacionTexto({ tipo: "base" }, META)).toBe("Copiado el 18 de noviembre de 2026");
    expect(actualizacionTexto({ tipo: "base" }, META_VACIA)).toBe("Cargando…");
    expect(actualizacionTexto({ tipo: "fija", texto: "Edición de 2025" }, META)).toBe("Edición de 2025");
  });
});

describe("«Qué es»: la página", () => {
  const html = renderToStaticMarkup(createElement(AcercaDe, { base: null, meta: META, onVolver: () => undefined, onProbar: () => undefined }));

  it("es un diálogo con su título y un solo <h1>", () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="acerca-titulo"');
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).not.toContain("<main");
  });
  it("cada fuente aparece enlazada, y las de la Comunidad son del portal", () => {
    for (const f of FUENTES) expect(html).toContain(`href="${f.url.replace(/&/g, "&amp;")}"`);
    expect(COMUNIDAD.length).toBeGreaterThanOrEqual(9);
    for (const f of COMUNIDAD) expect(f.url.startsWith("https://datos.comunidad.madrid/catalogo/dataset/")).toBe(true);
  });
  it("las cifras salen de los datos que recibe", () => {
    expect(html).toContain("4.518");
    expect(html).toContain("7.113.886");
    expect(html).toContain("1.342.648");
    expect(html).toContain("10.551");
    expect(html).toContain("1,3 %");
  });
  it("enlaza la demo y el repositorio", () => {
    expect(html).toContain(`href="${URL_DEMO}"`);
    expect(html).toContain(`href="${URL_REPO}"`);
  });
  it("cada entrada del índice apunta a una sección que existe", () => {
    const anclas = [...html.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1]);
    expect(anclas.length).toBe(7);
    for (const a of anclas) expect(html).toContain(`id="${a}"`);
  });
  it("tono de ayuda: nada de «déficit», «faltan» ni «peor» en los títulos", () => {
    const titulos = [...html.matchAll(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/g)].map((m) => m[1]).join(" ");
    expect(titulos).not.toMatch(/déficit|faltan|peor/i);
  });
});
