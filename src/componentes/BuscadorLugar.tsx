import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { buscarLugar, sugerirLugares, type Candidato } from "../lib/donde/buscador";
import type { Territorios } from "../lib/donde/tipos";
import { enteroEs } from "../lib/donde/panelDonde";

interface Props {
  territorios: Territorios;
  /** Alias por id de municipio (`lugares.json`). */
  alias: Record<string, string[]>;
  onElegir: (id: string) => void;
  /** Texto de la etiqueta del campo. */
  etiqueta?: string;
}

/**
 * Buscador de municipio o distrito con lista de sugerencias (patrón «combobox» con lista: el foco se queda en el campo y las
 * flechas mueven la opción activa). Sin tildes ni mayúsculas, con erratas, alias («Sanse») y distritos de la capital.
 */
export function BuscadorLugar({ territorios, alias, onElegir, etiqueta = "Busca tu municipio o un distrito de Madrid" }: Props) {
  const id = useId();
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [aviso, setAviso] = useState<{ texto: string; sugerencias: Candidato[] } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const candidatos = useMemo(() => sugerirLugares(territorios, texto, alias, 7), [territorios, texto, alias]);
  const visible = abierto && texto.trim().length > 0 && candidatos.length > 0;
  const idLista = `${id}-lista`;
  const idOpcion = (i: number) => `${id}-op-${i}`;

  function elegir(c: Candidato) {
    setTexto("");
    setAbierto(false);
    setActiva(-1);
    setAviso(null);
    onElegir(c.id);
  }

  function enviar() {
    if (visible && activa >= 0 && candidatos[activa]) return elegir(candidatos[activa] as Candidato);
    if (!texto.trim()) {
      setAviso({ texto: "Escribe el nombre de tu municipio o de un distrito de Madrid.", sugerencias: [] });
      return;
    }
    const r = buscarLugar(territorios, texto, alias);
    if (r.tipo === "lugar") return elegir(r.lugar);
    setAbierto(false);
    if (r.tipo === "zona") {
      setAviso({ texto: `«${r.nombre}» es una zona con varios municipios. Elige uno de ellos o pregúntale al agente por la zona.`, sugerencias: [] });
    } else if (r.sugerencias.length) {
      setAviso({ texto: `¿Cuál de estos quieres? Hay varios parecidos a «${texto.trim()}».`, sugerencias: r.sugerencias });
    } else {
      setAviso({ texto: `No encuentro «${texto.trim()}». Prueba con otro nombre o sin abreviar; también valen los distritos de Madrid («Centro», «Usera»…).`, sugerencias: [] });
    }
  }

  function alTeclear(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && candidatos.length) {
      e.preventDefault();
      setAbierto(true);
      setActiva((a) => (a + 1) % candidatos.length);
    } else if (e.key === "ArrowUp" && candidatos.length) {
      e.preventDefault();
      setAbierto(true);
      setActiva((a) => (a <= 0 ? candidatos.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      if (visible) {
        e.preventDefault();
        setAbierto(false);
        setActiva(-1);
      } else if (texto) {
        setTexto("");
        setAviso(null);
      }
    } else if (e.key === "Home" && visible) {
      e.preventDefault();
      setActiva(0);
    } else if (e.key === "End" && visible) {
      e.preventDefault();
      setActiva(candidatos.length - 1);
    }
  }

  return (
    <form
      className="buscador"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <label className="buscador__etiqueta" htmlFor={`${id}-campo`}>
        {etiqueta}
      </label>
      <div className="buscador__fila">
        <div className="buscador__campo">
          <input
            ref={entrada}
            id={`${id}-campo`}
            className="buscador__entrada"
            type="text"
            role="combobox"
            aria-expanded={visible}
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={visible && activa >= 0 ? idOpcion(activa) : undefined}
            aria-describedby={`${id}-ayuda`}
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
            enterKeyHint="search"
            placeholder="Por ejemplo: Getafe, La Acebeda o Centro"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAbierto(true);
              setActiva(-1);
              setAviso(null);
            }}
            onFocus={() => setAbierto(true)}
            onBlur={() => {
              setAbierto(false);
              setActiva(-1);
            }}
            onKeyDown={alTeclear}
          />
          <ul id={idLista} className="buscador__lista" role="listbox" aria-label="Sugerencias" hidden={!visible}>
            {visible &&
              candidatos.map((c, i) => (
                <li
                  key={c.id}
                  id={idOpcion(i)}
                  role="option"
                  aria-selected={i === activa}
                  className="buscador__opcion"
                  // El clic se resuelve en mousedown para que el campo no pierda el foco (y cierre la lista) antes.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    elegir(c);
                  }}
                  onMouseMove={() => i !== activa && setActiva(i)}
                >
                  <span className="buscador__nombre">{c.nombre}</span>
                  <span className="buscador__detalle">
                    {c.detalle} · {enteroEs(c.poblacion)} hab.
                  </span>
                </li>
              ))}
          </ul>
        </div>
        <button type="submit" className="boton boton--buscar">
          Ver ficha
        </button>
      </div>
      <p id={`${id}-ayuda`} className="solo-lectores">
        Escribe y elige de la lista con las flechas y Intro, o pulsa Ver ficha.
      </p>
      <p className="solo-lectores" role="status" aria-live="polite">
        {visible ? `${candidatos.length} ${candidatos.length === 1 ? "sugerencia" : "sugerencias"}. Usa las flechas para moverte por la lista.` : ""}
      </p>
      {!aviso && texto.trim().length >= 2 && candidatos.length === 0 && (
        <p className="buscador__sin" role="status">
          Sin resultados para «{texto.trim()}». Prueba con otro nombre o sin abreviar.
        </p>
      )}
      {aviso && (
        <div className="buscador__aviso" role="alert">
          <p>{aviso.texto}</p>
          {aviso.sugerencias.length > 0 && (
            <ul className="buscador__sugerencias">
              {aviso.sugerencias.map((c) => (
                <li key={c.id}>
                  <button type="button" className="boton" onClick={() => elegir(c)}>
                    {c.nombre}
                    <span className="buscador__detalle">{c.detalle}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
