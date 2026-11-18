/** Minúsculas y sin tildes: para buscar «Alcala» y encontrar «Alcalá» (y al revés). */
export function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}
