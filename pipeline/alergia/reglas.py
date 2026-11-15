"""Reglas de riesgo: unico sitio donde se aplican los umbrales (la web y el chat solo leen niveles ya calculados).

Aire: cortes del Indice Nacional de Calidad del Aire (BOE) leidos de `datos-estaticos/umbrales.json`.
Polen: percentiles P75/P90 propios (2010-2019). Ver DATOS.md.
"""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from . import config

NIVELES = ("sin_dato", "bajo", "medio", "alto")  # de menor a mayor
POLEN_MAX_DIAS = 7  # el polen solo cuenta en el riesgo si tiene 7 dias o menos

# Clave `promedio` de umbrales.json -> etiqueta de `regla` en las observaciones.
REGLA_ETIQUETA = {"hora": "1h", "media_movil_8h": "media8h", "media_movil_24h": "media24h"}


def cargar_umbrales(ruta: Path | None = None) -> dict:
    return json.loads((ruta or config.ESTATICOS / "umbrales.json").read_text(encoding="utf-8"))


def promedio(umbrales: dict, variable: str) -> str:
    """`hora`, `media_movil_8h` o `media_movil_24h` segun umbrales.json."""
    return umbrales["aire"][variable]["promedio"]


def nivel_aire(variable: str, valor: float | None, umbrales: dict) -> str:
    """bajo si valor <= bajo_max; medio si valor <= medio_max; alto si mayor. `valor` ya es el del promedio que toca."""
    if valor is None:
        return "sin_dato"
    u = umbrales["aire"][variable]
    return "bajo" if valor <= u["bajo_max"] else ("medio" if valor <= u["medio_max"] else "alto")


def nivel_polen(valor: float | None, p75: float, p90: float) -> str:
    """bajo < P75 <= medio < P90 <= alto (valor diario en granos/m3)."""
    if valor is None:
        return "sin_dato"
    return "bajo" if valor < p75 else ("medio" if valor < p90 else "alto")


def maximo(niveles: list[str]) -> str:
    """Nivel mas alto de la lista (`sin_dato` si esta vacia o todos son `sin_dato`)."""
    return max(niveles, key=NIVELES.index, default="sin_dato")


def combinar(nivel_aire_: str, nivel_polen_: str) -> str:
    return maximo([nivel_aire_, nivel_polen_])


def _fecha(hora: str) -> date:
    return date.fromisoformat(hora[:10])


def riesgo_estacion(
    estacion: str,
    captador: str | None,
    obs_aire: list[dict],
    obs_polen: list[dict],
    hoy: date,
) -> dict:
    """Entrada de `riesgo[]` para una estacion.

    `obs_aire` y `obs_polen`: observaciones (con `nivel`, `variable`, `hora`) de la estacion y de su captador.
    El polen solo cuenta si su ultimo dato tiene <= 7 dias respecto a `hoy`; si no, `nivel_polen` = sin_dato.
    En empate, `peor_variable` es la primera de la lista (aire antes que polen).
    """
    polen_valido: list[dict] = []
    antig = None
    if obs_polen:
        antig = (hoy - max(_fecha(o["hora"]) for o in obs_polen)).days
        # Cada tipo cuenta solo si su propio dato tiene <= 7 dias (no basta con que lo tenga otro tipo).
        polen_valido = [o for o in obs_polen if (hoy - _fecha(o["hora"])).days <= POLEN_MAX_DIAS]
    n_aire = maximo([o["nivel"] for o in obs_aire])
    n_polen = maximo([o["nivel"] for o in polen_valido])
    nivel = combinar(n_aire, n_polen)
    peor = None
    if nivel != "sin_dato":
        peor = next(o["variable"] for o in [*obs_aire, *polen_valido] if o["nivel"] == nivel)
    return {
        "lugar": estacion,
        "nivel": nivel,
        "nivel_aire": n_aire,
        "nivel_polen": n_polen,
        "peor_variable": peor,
        "captador": captador,
        "polen_antiguedad_dias": antig,
    }
