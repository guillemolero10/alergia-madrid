"""Constantes y utilidades comunes del pipeline de «¿Dónde hace falta?»."""
from __future__ import annotations

import re
from pathlib import Path

from pyproj import Transformer

from alergia import config

RAIZ = config.RAIZ
CACHE = config.CACHE  # descargas grandes (ignoradas por git)
INTERMEDIOS = RAIZ / "salida" / "donde"  # ficheros intermedios (no van a public/)
PUBLICO = RAIZ / "public" / "donde"

VERSION = 1
EPSG_UTM = "EPSG:25830"  # ETRS89 / UTM 30N (seccionado del INE y coordenadas de los registros de la Comunidad)
BBOX_COMUNIDAD = (39.8, 41.2, -4.6, -3.0)  # lat min/max, lon min/max (misma caja que colegios)
ANIO_POBLACION = 2025

URL_CENSO_INE = "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69213.csv?nocab=1"
URL_SECCIONADO_INE = "https://www.ine.es/prodyser/cartografia/seccionado_2025.zip"
URL_INE_LICENCIA = "https://ine.es/dyngs/AYU/index.htm?cid=125"

_T: dict = {}


def a_wgs84(x, y):
    """UTM 30N ETRS89 -> (lon, lat) WGS84. Acepta escalares o arrays."""
    if "t" not in _T:
        _T["t"] = Transformer.from_crs(EPSG_UTM, "EPSG:4326", always_xy=True)
    return _T["t"].transform(x, y)


def entero_ine(s: str | None) -> int | None:
    """«7.113.886» -> 7113886; vacio -> None."""
    s = (s or "").strip()
    if not s:
        return None
    return int(s.replace(".", ""))


def decimal_es(s: str | None) -> float | None:
    """«440267,13» o «440267.13» -> float; vacio -> None."""
    s = (s or "").strip()
    if not s:
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:  # p. ej. «RESERVADO» (direcciones protegidas del registro social): equivale a sin coordenadas
        return None


def sin_tildes_minus(texto: str) -> str:
    import unicodedata

    t = unicodedata.normalize("NFD", texto.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t).strip()


def asegurar_descarga(url: str, destino: Path) -> Path:
    """Descarga `url` a `destino` si no esta ya en cache (usa el cliente del pipeline del aire)."""
    from alergia import ckan

    with ckan.cliente() as c:
        return ckan.descargar(c, url, destino)
