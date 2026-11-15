"""Open-Meteo (CC BY 4.0, sin clave). Aqui: viento actual en la rejilla (42 puntos, una sola peticion).
El pronostico (meteo y CAMS) llega en la tarea 5.
"""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import httpx

from . import config, horas

URL_FORECAST = "https://api.open-meteo.com/v1/forecast"
FUENTE_VIENTO = "open-meteo:forecast"


def cargar_rejilla(ruta: Path | None = None) -> list[dict]:
    return json.loads((ruta or config.ESTATICOS / "rejilla_viento.json").read_text(encoding="utf-8"))["puntos"]


def viento_actual(c: httpx.Client, puntos: list[dict]) -> tuple[list[dict], str]:
    """-> (viento[], hora ISO del dato mas reciente). `lat`/`lon` son los de la rejilla pedida (no los ajustados por la API)."""
    r = c.get(
        URL_FORECAST,
        params={
            "latitude": ",".join(str(p["lat"]) for p in puntos),
            "longitude": ",".join(str(p["lon"]) for p in puntos),
            "current": "wind_speed_10m,wind_direction_10m",
            "timezone": "Europe/Madrid",
        },
    )
    r.raise_for_status()
    d = r.json()
    if isinstance(d, dict):  # con un solo punto la API devuelve un objeto, no una lista
        d = [d]
    if len(d) != len(puntos):
        raise ValueError(f"Open-Meteo devolvio {len(d)} puntos y se pidieron {len(puntos)}")
    salida, tiempos = [], []
    for p, item in zip(puntos, d):
        cur = item["current"]
        v, ang = cur["wind_speed_10m"], cur["wind_direction_10m"]
        if v is None or ang is None:
            raise ValueError("Open-Meteo devolvio viento nulo")
        salida.append({"lat": p["lat"], "lon": p["lon"], "velocidad_kmh": round(float(v), 1), "direccion_grados": int(round(ang)) % 360})
        tiempos.append(datetime.fromisoformat(cur["time"]).replace(tzinfo=horas.MADRID))  # hora local de Madrid (timezone pedido)
    return salida, max(tiempos).isoformat(timespec="seconds")
