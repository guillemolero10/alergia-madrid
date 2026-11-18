/** Lo que se ve mientras llegan el código del mapa, el estilo y las teselas. Sus estilos van en App.css. */
export function EsqueletoMapa({ texto = "Cargando el mapa…" }: { texto?: string }) {
  return (
    <div className="esqueleto-mapa" role="status" aria-live="polite">
      <span className="esqueleto-mapa__giro" aria-hidden="true" />
      <p>{texto}</p>
    </div>
  );
}
