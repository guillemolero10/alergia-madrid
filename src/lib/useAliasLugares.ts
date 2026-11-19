import { useEffect, useState } from "react";

const VACIO: Record<string, string[]> = {};

/** Alias de municipios, cargados en diferido (ver `aliasLugares.ts`). Mientras llegan, un objeto vacío y estable. */
export function useAliasLugares(): Record<string, string[]> {
  const [alias, setAlias] = useState(VACIO);
  useEffect(() => {
    let cancelado = false;
    const pedir = () =>
      void import("./aliasLugares").then(
        (m) => !cancelado && setAlias(m.ALIAS_LUGARES),
        () => undefined, // sin alias se busca solo por el nombre
      );
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(pedir, { timeout: 2500 });
      return () => {
        cancelado = true;
        window.cancelIdleCallback(id);
      };
    }
    const id = setTimeout(pedir, 800);
    return () => {
      cancelado = true;
      clearTimeout(id);
    };
  }, []);
  return alias;
}
