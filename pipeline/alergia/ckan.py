"""Cliente minimo del CKAN de datos.comunidad.madrid (idea tomada de `servidor.py` de Alberto Abella, DATAMAD 2026)."""
from __future__ import annotations

import csv
import io
from pathlib import Path

import httpx

from . import config

TIMEOUT = httpx.Timeout(60.0)
CABECERAS = {"User-Agent": "alergia-madrid-pipeline/0.1 (datos abiertos; DATAMAD 2026)"}


def cliente() -> httpx.Client:
    return httpx.Client(follow_redirects=True, timeout=TIMEOUT, headers=CABECERAS)


def package_show(c: httpx.Client, nombre: str) -> dict:
    for intento in range(3):
        try:
            r = c.get(config.CKAN_BASE + "package_show", params={"id": nombre})
            r.raise_for_status()
            return r.json()["result"]
        except httpx.HTTPError:
            if intento == 2:
                raise
    raise RuntimeError("inalcanzable")


def url_recurso(paquete: dict, recurso_id: str) -> str:
    for r in paquete["resources"]:
        if r["id"] == recurso_id:
            return r["url"]
    raise KeyError(f"recurso {recurso_id} no esta en {paquete['name']}")


def recursos_csv_por_anio(paquete: dict) -> dict[int, str]:
    """{anio: url} para los recursos CSV cuyo nombre es un anio (2010, 2011...)."""
    return {
        int(r["name"]): r["url"]
        for r in paquete["resources"]
        if r["format"].upper() == "CSV" and r["name"].strip().isdigit()
    }


def descargar(c: httpx.Client, url: str, destino: Path, forzar: bool = False) -> Path:
    """Descarga `url` a `destino` si no existe ya (cache)."""
    if destino.exists() and not forzar:
        return destino
    destino.parent.mkdir(parents=True, exist_ok=True)
    for intento in range(3):
        try:
            r = c.get(url)
            r.raise_for_status()
            destino.write_bytes(r.content)
            return destino
        except httpx.HTTPError:
            if intento == 2:
                raise
    raise RuntimeError("inalcanzable")


def leer_csv(ruta: Path, encoding: str = "utf-8-sig") -> list[dict]:
    """CSV de la Comunidad: separador `;`. Las cabeceras se limpian de espacios (captadores_polen trae `direccion_localidad `)."""
    texto = ruta.read_bytes().decode(encoding)
    lector = csv.reader(io.StringIO(texto), delimiter=";")
    cab = [h.strip().lstrip("﻿") for h in next(lector)]
    return [dict(zip(cab, fila)) for fila in lector if fila]


def leer_csv_auto(ruta: Path) -> list[dict]:
    """Prueba UTF-8 (con BOM) y, si falla, Latin-1. Los CSV de polen 2010-2019 y captadores_polen van en Latin-1."""
    try:
        return leer_csv(ruta, "utf-8-sig")
    except UnicodeDecodeError:
        return leer_csv(ruta, "latin-1")


def numero(s: str | None) -> float | None:
    """Numero con coma o punto decimal; vacio -> None. (Las coordenadas de las estaciones mezclan ambos.)"""
    if s is None:
        return None
    s = s.strip()
    return float(s.replace(",", ".")) if s else None
