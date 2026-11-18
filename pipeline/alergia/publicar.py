"""Valida la salida del pipeline y hace commit en un checkout de la rama `datos`.

Uso:  python -m alergia.publicar DIR [--commit] [--mensaje TEXTO]

DIR es el checkout de `datos` donde se ejecuto `alergia.ejecutar --salida DIR`. Antes de tocar git:
- `estado_actual.json` y `pronostico.json` deben existir y validar contra `docs/esquema/*.schema.json`;
- `estado_actual.json` debe tener `capas.aire.ultimo_dato`.
Si existe `dias/` (dias congelados por `alergia.dias`) tambien se validan `dias/indice.json` y, por cada fecha del
indice, `dias/<fecha>/estado.json` y `pronostico.json` contra los mismos esquemas.
Solo se anaden a git los ficheros de la lista blanca (nunca los CSV de `cache/`). Sin cambios no hay commit.
Con error de validacion termina con codigo 1 y no hace nada (queda publicado el ultimo JSON valido).
No sube nada: el push lo hace el workflow.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

import jsonschema

from . import config

ESQUEMAS = {
    "estado_actual.json": config.RAIZ / "docs" / "esquema" / "estado_actual.schema.json",
    "pronostico.json": config.RAIZ / "docs" / "esquema" / "pronostico.schema.json",
}
OPCIONALES = ["cache/aire_48h.json", "cache/polen_mediciones.meta.json"]
AUTOR = ("github-actions[bot]", "41898282+github-actions[bot]@users.noreply.github.com")


class ErrorPublicacion(Exception):
    pass


def validar_directorio(d: Path, esquemas: dict[str, Path] = ESQUEMAS, con_dias: bool = True) -> None:
    for nombre, esquema in esquemas.items():
        try:
            doc = json.loads((d / nombre).read_text(encoding="utf-8"))
        except FileNotFoundError:
            raise ErrorPublicacion(f"falta {nombre}") from None
        except ValueError as e:
            raise ErrorPublicacion(f"{nombre} no es JSON valido: {e}") from None
        try:
            jsonschema.validate(doc, json.loads(esquema.read_text(encoding="utf-8")))
        except jsonschema.ValidationError as e:
            raise ErrorPublicacion(f"{nombre} no valida: {str(e.message)[:200]}") from None
        if nombre == "estado_actual.json":
            aire = doc.get("capas", {}).get("aire", {}) if isinstance(doc, dict) else {}
            if not aire.get("ultimo_dato"):
                raise ErrorPublicacion(f"{nombre} sin capas.aire.ultimo_dato")
    if con_dias:
        validar_dias(d)


def ficheros_dias(d: Path) -> list[str]:
    """`dias/indice.json` + estado y pronostico de cada fecha que figura en el indice (vacio si no hay `dias/`)."""
    ind = d / "dias" / "indice.json"
    if not ind.is_file():
        return []
    try:
        fechas = [e["fecha"] for e in json.loads(ind.read_text(encoding="utf-8"))]
    except (ValueError, KeyError, TypeError):
        raise ErrorPublicacion("dias/indice.json no es una lista de {fecha, titulo, nota}") from None
    for f in fechas:
        if not isinstance(f, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", f):
            raise ErrorPublicacion(f"dias/indice.json: fecha invalida {f!r}")
    return ["dias/indice.json", *[f"dias/{f}/{n}" for f in fechas for n in ("estado.json", "pronostico.json")]]


def validar_dias(d: Path) -> None:
    for rel in ficheros_dias(d)[1:]:
        validar_directorio(d, {rel: ESQUEMAS[rel.rsplit("/", 1)[1].replace("estado.json", "estado_actual.json")]}, con_dias=False)


def lista_blanca(d: Path) -> list[str]:
    return [*ESQUEMAS, *[f for f in OPCIONALES if (d / f).is_file()], *ficheros_dias(d)]


def _git(d: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(d), *args], check=True, capture_output=True, text=True)
    return r.stdout


def commit(d: Path, mensaje: str) -> bool:
    """Anade la lista blanca y crea un commit si hay cambios. Devuelve True si lo creo."""
    # `git -C` sube por las carpetas: sin esta comprobacion, un DIR que no sea un checkout propio
    # haria el commit en el repo padre (p. ej. en `main`).
    if Path(_git(d, "rev-parse", "--show-toplevel").strip()).resolve() != d.resolve():
        raise ErrorPublicacion(f"{d} no es la raiz de un checkout git propio (rama datos)")
    _git(d, "add", "--", *lista_blanca(d))
    if not _git(d, "diff", "--cached", "--name-only").strip():
        return False
    _git(d, "-c", f"user.name={AUTOR[0]}", "-c", f"user.email={AUTOR[1]}", "commit", "-q", "-m", mensaje)
    return True


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Valida y hace commit de los JSON en la rama datos")
    ap.add_argument("dir", type=Path)
    ap.add_argument("--commit", action="store_true")
    ap.add_argument("--mensaje", default="datos: actualizacion")
    a = ap.parse_args(argv)
    try:
        validar_directorio(a.dir)
        if a.commit:
            print("commit creado" if commit(a.dir, a.mensaje) else "sin cambios")
        else:
            print("valido: " + ", ".join(lista_blanca(a.dir)))
    except ErrorPublicacion as e:
        print(f"no se publica: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
