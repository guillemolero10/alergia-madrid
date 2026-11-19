import { describe, expect, it } from "vitest";
import { EJEMPLOS, guardarCerrado, leerCerrado } from "./EmpiezaAqui";

describe("Empieza aquí", () => {
  it("tres ejemplos, con textos sin cifras escritas a mano (el resultado sale del motor)", () => {
    expect(EJEMPLOS.map((e) => e.id)).toEqual(["pinto", "2030", "municipio"]);
    for (const e of EJEMPLOS.filter((x) => x.id !== "2030")) expect(`${e.titulo} ${e.detalle}`).not.toMatch(/\d/);
    // «Madrid en 2030» lleva el año en el titular, pero ninguna cifra de resultado
    expect(EJEMPLOS.find((e) => e.id === "2030")!.detalle).not.toMatch(/\d/);
  });
  it("sin localStorage (modo privado, bloqueado o sin navegador) no falla: se ve abierto", () => {
    expect(leerCerrado()).toBe(false);
    expect(() => guardarCerrado(true)).not.toThrow();
    expect(leerCerrado()).toBe(false);
  });
  it("recuerda lo cerrado cuando hay almacenamiento", () => {
    const almacen = new Map<string, string>();
    const falso = { getItem: (k: string) => almacen.get(k) ?? null, setItem: (k: string, v: string) => void almacen.set(k, v), removeItem: (k: string) => void almacen.delete(k) };
    (globalThis as unknown as { window: unknown }).window = { localStorage: falso };
    try {
      expect(leerCerrado()).toBe(false);
      guardarCerrado(true);
      expect(leerCerrado()).toBe(true);
      guardarCerrado(false);
      expect(leerCerrado()).toBe(false);
    } finally {
      delete (globalThis as unknown as { window?: unknown }).window;
    }
  });
});

describe("bloquearClics (I-1: el doble clic no cae sobre otro botón)", () => {
  it("traga los clics durante el plazo y deja pasar los de después", async () => {
    const { bloquearClics } = await import("./EmpiezaAqui");
    const destino = new EventTarget();
    let llegan = 0;
    const alMismoNivel = () => llegan++;
    // un oyente normal (burbujeo) en el mismo destino no ve el clic tragado en captura
    const hijo = destino;
    hijo.addEventListener("click", alMismoNivel);
    const quitar = bloquearClics(destino, 30);
    const clic = () => destino.dispatchEvent(new Event("click", { cancelable: true }));
    expect(clic()).toBe(false); // preventDefault
    await new Promise((r) => setTimeout(r, 60));
    expect(clic()).toBe(true);
    quitar();
  });
});
