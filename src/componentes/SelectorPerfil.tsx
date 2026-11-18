import { useEffect, useId, useMemo, useRef, useState } from "react";
import "./SelectorPerfil.css";
import { nombrePolen, POLENES_CON_PREVISION, POLENES_SIN_PREVISION, type Afeccion, type Perfil } from "../lib/franja";
import { LEJOS_KM, municipioMasCercano } from "../lib/perfil";
import type { Municipio } from "../lib/tipos";

interface Props {
  perfil: Perfil;
  municipios: readonly Municipio[];
  onCambiar: (perfil: Perfil) => void;
}

const OPCIONES: { valor: Afeccion; texto: string }[] = [
  { valor: "aire", texto: "Asma o EPOC" },
  { valor: "polen", texto: "Alergia al polen" },
  { valor: "ambos", texto: "Las dos" },
];

const sinTildes = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export function SelectorPerfil({ perfil, municipios, onCambiar }: Props) {
  return (
    <form className="perfil" onSubmit={(e) => e.preventDefault()} aria-label="Tu perfil">
      <SelectorMunicipio
        municipios={municipios}
        valor={perfil.municipio}
        onElegir={(municipio) => onCambiar({ ...perfil, municipio })}
      />

      <fieldset className="perfil__grupo">
        <legend className="perfil__rotulo">¿Qué te afecta?</legend>
        <div className="segmentos">
          {OPCIONES.map((o) => (
            <label key={o.valor} className={`segmento${perfil.afecta === o.valor ? " segmento--activo" : ""}`}>
              <input
                type="radio"
                name="afecta"
                value={o.valor}
                checked={perfil.afecta === o.valor}
                onChange={() => onCambiar({ ...perfil, afecta: o.valor })}
              />
              <span>{o.texto}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {perfil.afecta !== "aire" && (
        <fieldset className="perfil__grupo">
          <legend className="perfil__rotulo">Tu polen</legend>
          <div className="chips-polen">
            {[...POLENES_CON_PREVISION, ...POLENES_SIN_PREVISION].map((tipo) => {
              const marcado = perfil.polenes.includes(tipo);
              return (
                <label key={tipo} className={`chip-polen${marcado ? " chip-polen--marcado" : ""}`}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() =>
                      onCambiar({ ...perfil, polenes: marcado ? perfil.polenes.filter((t) => t !== tipo) : [...perfil.polenes, tipo] })
                    }
                  />
                  <span>{nombrePolen(tipo)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
    </form>
  );
}

function SelectorMunicipio({ municipios, valor, onElegir }: { municipios: readonly Municipio[]; valor: string; onElegir: (id: string) => void }) {
  const id = useId();
  const actual = municipios.find((m) => m.id === valor);
  const [texto, setTexto] = useState(actual?.nombre ?? "");
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(0);
  const caja = useRef<HTMLDivElement>(null);

  // Si el municipio cambia desde fuera (clic en el mapa), el campo lo refleja.
  useEffect(() => {
    setTexto(actual?.nombre ?? "");
  }, [actual?.nombre]);

  const filtrados = useMemo(() => {
    const q = sinTildes(texto.trim());
    const ordenados = [...municipios].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (!q || q === sinTildes(actual?.nombre ?? "")) return ordenados;
    // Primero los que empiezan por lo escrito, después los que lo contienen.
    const nombres = (m: Municipio) => [m.nombre, ...m.alias].map(sinTildes);
    const empieza = ordenados.filter((m) => nombres(m).some((n) => n.startsWith(q)));
    const contiene = ordenados.filter((m) => !empieza.includes(m) && nombres(m).some((n) => n.includes(q)));
    return [...empieza, ...contiene];
  }, [texto, municipios, actual?.nombre]);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!caja.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  });

  function cerrar() {
    setAbierto(false);
    setTexto(actual?.nombre ?? "");
  }
  function elegir(m: Municipio) {
    onElegir(m.id);
    setTexto(m.nombre);
    setAbierto(false);
  }

  return (
    <div className="perfil__grupo" ref={caja}>
      <label className="perfil__rotulo" htmlFor={id}>
        ¿Dónde estás?
      </label>
      <div className="combo">
        <input
          id={id}
          className="combo__campo"
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          aria-expanded={abierto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={abierto && filtrados[activo] ? `${id}-${filtrados[activo]!.id}` : undefined}
          placeholder="Busca tu municipio"
          value={texto}
          onFocus={(e) => {
            setAbierto(true);
            setActivo(Math.max(0, filtrados.findIndex((m) => m.id === valor)));
            e.currentTarget.select();
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            setAbierto(true);
            setActivo(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAbierto(true);
              setActivo((a) => Math.min(a + 1, filtrados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && abierto && filtrados[activo]) {
              e.preventDefault();
              elegir(filtrados[activo]!);
            } else if (e.key === "Escape" && abierto) {
              e.preventDefault();
              cerrar();
            }
          }}
        />
        {abierto && (
          <ul className="combo__lista" role="listbox" id={`${id}-lista`} aria-label="Municipios">
            {filtrados.length === 0 && <li className="combo__vacio">Ningún municipio coincide.</li>}
            {filtrados.map((m, i) => (
              <li
                key={m.id}
                id={`${id}-${m.id}`}
                role="option"
                aria-selected={m.id === valor}
                className={`combo__opcion${i === activo ? " combo__opcion--activa" : ""}${m.id === valor ? " combo__opcion--actual" : ""}`}
                // pointerdown evita que el campo pierda el foco antes de elegir
                onPointerDown={(e) => {
                  e.preventDefault();
                  elegir(m);
                }}
                onPointerEnter={() => setActivo(i)}
              >
                {m.nombre}
              </li>
            ))}
          </ul>
        )}
      </div>
      <BotonUbicacion municipios={municipios} onElegir={(m) => elegir(m)} />
    </div>
  );
}

type EstadoUbicacion =
  | { tipo: "inicio" }
  | { tipo: "buscando" }
  | { tipo: "hecho"; texto: string }
  | { tipo: "error"; texto: string };

/** «Usar mi ubicación»: pide la posición al navegador (no sale del dispositivo) y elige el municipio más cercano. */
function BotonUbicacion({ municipios, onElegir }: { municipios: readonly Municipio[]; onElegir: (m: Municipio) => void }) {
  const [estado, setEstado] = useState<EstadoUbicacion>({ tipo: "inicio" });
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return null;

  function localizar() {
    setEstado({ tipo: "buscando" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const r = municipioMasCercano(pos.coords.latitude, pos.coords.longitude, municipios);
        if (!r) return setEstado({ tipo: "error", texto: "No hay municipios con datos." });
        onElegir(r.municipio);
        const km = r.km < 1 ? "menos de 1 km" : `${Math.round(r.km)} km`;
        setEstado(
          r.km > LEJOS_KM
            ? { tipo: "hecho", texto: `Estás fuera de la zona con datos. El punto más cercano es ${r.municipio.nombre}, a ${km}.` }
            : { tipo: "hecho", texto: `Tu municipio con datos más cercano: ${r.municipio.nombre} (a ${km}).` },
        );
      },
      (err) =>
        setEstado({
          tipo: "error",
          texto:
            err.code === err.PERMISSION_DENIED
              ? "No has dado permiso de ubicación. Puedes buscar tu municipio arriba."
              : "No se ha podido obtener tu ubicación. Busca tu municipio arriba.",
        }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }

  return (
    <div className="ubicacion">
      <button type="button" className="ubicacion__boton" onClick={localizar} disabled={estado.tipo === "buscando"}>
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v2.5M8 12.5V15M1 8h2.5M12.5 8H15" />
        </svg>
        {estado.tipo === "buscando" ? "Buscando tu ubicación…" : "Usar mi ubicación"}
      </button>
      <p className={`ubicacion__nota${estado.tipo === "error" ? " ubicacion__nota--error" : ""}`} aria-live="polite">
        {estado.tipo === "hecho" || estado.tipo === "error" ? estado.texto : ""}
      </p>
    </div>
  );
}
