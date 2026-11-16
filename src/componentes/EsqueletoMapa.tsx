/** Lo que se ve mientras llegan el código del mapa, el estilo y las teselas. Sus estilos van en App.css. */
export function EsqueletoMapa({ texto = "Cargando el mapa…" }: { texto?: string }) {
  return (
    <div className="esqueleto-mapa" role="status" aria-live="polite">
      <div className="esqueleto-mapa__radar" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{texto}</p>
    </div>
  );
}
