"""Polen del anio en curso (CSV `mediciones_polen` de la Comunidad de Madrid) -> observaciones del esquema `estado_actual`.

Flujo: `resource_show` (last_modified + url) -> descarga del CSV solo si cambio -> ultimo dia con dato por
captador y tipo (vacio = sin dato; 0 si es dato) -> nivel con medio_min/alto_min de `umbrales.json`.
Las observaciones llevan `regla: "diario"` y `hora` = fecha AAAA-MM-DD (el polen es diario hasta junio y semanal despues).
"""
from __future__ import annotations

import json
import re
import unicodedata
from datetime import date
from pathlib import Path

import httpx

from . import ckan, config, reglas

FUENTE = "ckan:mediciones_polen"
UNIDAD = "granos/m³"
NOMBRE_CSV = "polen_mediciones.csv"
NOMBRE_META = "polen_mediciones.meta.json"


def slug(tipo: str) -> str:
    """Mismo criterio que `estatico.construir_umbrales.slug`: sin acentos, sin parentesis, a minusculas con `_`."""
    t = unicodedata.normalize("NFKD", tipo)
    t = "".join(ch for ch in t if not unicodedata.combining(ch)).lower()
    t = re.sub(r"\(.*?\)", "", t)
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


def _limpio(x: float) -> float | int:
    return int(x) if float(x).is_integer() else round(x, 1)


def ultimos_por_captador_y_tipo(filas: list[dict]) -> dict[tuple[str, str], tuple[date, float]]:
    """{(captador, slug): (fecha, valor)} con el ultimo dia que tiene valor. Los tipos no publicados se descartan."""
    res: dict[tuple[str, str], tuple[date, float]] = {}
    for f in filas:
        s = slug(f.get("tipo_polinico", ""))
        if s not in config.POLEN_TIPOS:
            continue
        try:
            v = ckan.numero(f.get("granos_de_polen_x_metro_cubico"))
            dia = date.fromisoformat(f["fecha_lectura"].strip()[:10])
        except (ValueError, KeyError):
            continue
        if v is None or v < 0:
            continue  # vacio = sin dato (no es lo mismo que 0)
        k = (f["captador"].strip(), s)
        if k not in res or dia > res[k][0]:
            res[k] = (dia, v)
    return res


def observaciones(filas: list[dict], umbrales: dict) -> list[dict]:
    tipos_u = umbrales["polen"]["tipos"]
    res = []
    for (cap, s), (dia, v) in sorted(ultimos_por_captador_y_tipo(filas).items()):
        u = tipos_u[s]
        res.append(
            {
                "lugar": f"cap:{cap}",
                "variable": config.POLEN_TIPOS[s],
                "valor": _limpio(v),
                "unidad": UNIDAD,
                "hora": dia.isoformat(),
                "fuente": FUENTE,
                "nivel": reglas.nivel_polen(v, u["medio_min"], u["alto_min"]),
                "regla": "diario",
                "valor_regla": _limpio(v),
            }
        )
    return res


def resource_show(c: httpx.Client, recurso_id: str = config.RES_POLEN_2026_CSV) -> dict:
    r = c.get(config.CKAN_BASE + "resource_show", params={"id": recurso_id})
    r.raise_for_status()
    d = r.json()
    if not d.get("success"):
        raise RuntimeError("resource_show sin exito")
    return d["result"]


def _leer_meta(ruta: Path) -> dict:
    try:
        return json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def actualizar(c: httpx.Client, cache_dir: Path, umbrales: dict) -> tuple[list[dict], dict]:
    """Descarga el CSV si cambio `last_modified` y devuelve (observaciones, info). Lanza excepcion si la fuente falla."""
    ruta_csv = cache_dir / NOMBRE_CSV
    ruta_meta = cache_dir / NOMBRE_META
    meta = resource_show(c)
    lm = meta["last_modified"]
    descargado = False
    if _leer_meta(ruta_meta).get("last_modified") != lm or not ruta_csv.exists():
        r = c.get(meta["url"])
        r.raise_for_status()
        cache_dir.mkdir(parents=True, exist_ok=True)
        tmp = ruta_csv.with_suffix(".tmp")
        tmp.write_bytes(r.content)
        tmp.replace(ruta_csv)
        ruta_meta.write_text(json.dumps({"last_modified": lm}), encoding="utf-8")
        descargado = True
    obs = observaciones(ckan.leer_csv_auto(ruta_csv), umbrales)
    if not obs:
        # Un CSV sin datos validos no debe pasar por bueno: si estaba en cache, se borra la marca para volver a bajarlo.
        ruta_meta.unlink(missing_ok=True)
        raise RuntimeError("el CSV de polen no trae observaciones")
    return obs, {"last_modified": lm, "descargado": descargado}
