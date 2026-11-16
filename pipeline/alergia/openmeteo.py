"""Open-Meteo (CC BY 4.0, sin clave).

- Viento actual en la rejilla (42 puntos, una sola peticion).
- Pronostico de 48 h (`pronostico.json`): meteo (`/v1/forecast`) y aire + polen CAMS (`/v1/air-quality`) en las 28
  coordenadas de estacion, una peticion por API. Se pide `timeformat=unixtime` para no depender de horas locales
  ambiguas en los cambios de hora; las medias moviles se calculan por instante.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import httpx

from . import aire, config, horas, reglas

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


# ---------------------------------------------------------------- pronostico (48 h)
URL_AIRE = "https://air-quality-api.open-meteo.com/v1/air-quality"
FUENTE_METEO = "open-meteo:forecast"
FUENTE_AIRE = "open-meteo:air-quality (CAMS Europa)"
HORAS_PRONOSTICO = 48
SIN_PRONOSTICO = ["polen_cupresaceas", "polen_platano"]  # CAMS no los modela

HOURLY_METEO = "wind_speed_10m,wind_direction_10m,precipitation,temperature_2m"
HOURLY_AIRE = "pm10,pm2_5,nitrogen_dioxide,ozone,grass_pollen,olive_pollen,birch_pollen,alder_pollen,mugwort_pollen"
# Variable de CAMS -> variable de `valores`
CAMS_AIRE = {"nitrogen_dioxide": "no2", "ozone": "o3", "pm10": "pm10", "pm2_5": "pm25"}
CAMS_POLEN = {
    "grass_pollen": "polen_gramineas",
    "olive_pollen": "polen_olivo",
    "birch_pollen": "polen_abedul",
    "alder_pollen": "polen_aliso",
    "mugwort_pollen": "polen_artemisia",
}
METEO = {"wind_speed_10m": "viento_kmh", "wind_direction_10m": "viento_dir", "precipitation": "lluvia_mm", "temperature_2m": "temp_c"}
UNIDADES = {
    "no2": "µg/m³", "o3": "µg/m³", "pm10": "µg/m³", "pm25": "µg/m³",
    **{v: "granos/m³" for v in CAMS_POLEN.values()},
    "viento_kmh": "km/h", "viento_dir": "°", "lluvia_mm": "mm", "temp_c": "°C",
}
UTC = timezone.utc


def _pedir_horario(c: httpx.Client, url: str, estaciones: list[dict], hourly: str, **extra) -> list[dict]:
    r = c.get(
        url,
        params={
            "latitude": ",".join(str(e["lat"]) for e in estaciones),
            "longitude": ",".join(str(e["lon"]) for e in estaciones),
            "hourly": hourly,
            "forecast_days": 3,
            "timezone": "Europe/Madrid",
            "timeformat": "unixtime",
            **extra,
        },
    )
    r.raise_for_status()
    d = r.json()
    if isinstance(d, dict):  # con una sola coordenada la API devuelve un objeto
        d = [d]
    if len(d) != len(estaciones):
        raise ValueError(f"Open-Meteo devolvio {len(d)} puntos y se pidieron {len(estaciones)}")
    return d


def _por_instante(punto: dict, claves: list[str]) -> dict[str, dict[int, float | None]]:
    h = punto["hourly"]
    return {k: dict(zip(h["time"], h[k])) for k in claves}


def _media(serie: dict[int, float | None], t: int, n: int, minimo: int) -> float | None:
    """Media de las `n` horas que terminan en el instante `t` (incluido); None si hay menos de `minimo` validas."""
    vals = [v for i in range(n) if (v := serie.get(t - 3600 * i)) is not None]
    return round(sum(vals) / len(vals), 1) if len(vals) >= minimo else None


def _redondeo(v: float | None, dec: int = 1) -> float | None:
    return None if v is None else round(float(v), dec)


def construir_pronostico(meteo: list[dict], cams: list[dict], estaciones: list[dict], generado: datetime, umbrales: dict) -> dict:
    """Une las dos respuestas en el documento `pronostico.json`. Lanza ValueError si faltan horas o variables."""
    inicio = int(generado.astimezone(UTC).replace(minute=0, second=0, microsecond=0).timestamp()) + 3600
    instantes = [inicio + 3600 * i for i in range(HORAS_PRONOSTICO)]
    tipos_u = umbrales["polen"]["tipos"]
    zonas = []
    for est, pm, pa in zip(estaciones, meteo, cams):
        m = _por_instante(pm, list(METEO))
        a = _por_instante(pa, [*CAMS_AIRE, *CAMS_POLEN])
        for serie in (*m.values(), *a.values()):
            if any(t not in serie for t in instantes):
                raise ValueError(f"Open-Meteo no cubre las {HORAS_PRONOSTICO} h siguientes en {est['id']}")
        valores: dict[str, list] = {}
        niveles: dict[str, list[int]] = {}
        for k, var in CAMS_AIRE.items():
            valores[var] = [_redondeo(a[k][t]) for t in instantes]
            prom = reglas.promedio(umbrales, var)
            if prom == "hora":
                comp = [_redondeo(a[k][t]) for t in instantes]
            else:
                ventana, minimo = aire.VENTANAS[prom]
                comp = [_media(a[k], t, ventana, minimo) for t in instantes]
            niveles[var] = [reglas.NIVELES.index(reglas.nivel_aire(var, x, umbrales)) for x in comp]
        for k, var in CAMS_POLEN.items():
            valores[var] = [_redondeo(a[k][t]) for t in instantes]
            u = tipos_u[var.removeprefix("polen_")]
            niveles[var] = [reglas.NIVELES.index(reglas.nivel_polen(x, u["medio_min"], u["alto_min"])) for x in valores[var]]
        for k, var in METEO.items():
            if var == "viento_dir":
                valores[var] = [None if m[k][t] is None else int(round(m[k][t])) % 360 for t in instantes]
            else:
                valores[var] = [_redondeo(m[k][t]) for t in instantes]
        niveles["aire"] = [max(col) for col in zip(*(niveles[v] for v in CAMS_AIRE.values()))]
        niveles["polen"] = [max(col) for col in zip(*(niveles[v] for v in CAMS_POLEN.values()))]
        niveles["global"] = [max(x, y) for x, y in zip(niveles["aire"], niveles["polen"])]
        zonas.append({"lugar": est["id"], "valores": valores, "niveles": niveles})
    return {
        "version": 1,
        "generado": generado.astimezone(horas.MADRID).isoformat(timespec="seconds"),
        "modo": "tiempo_real",
        "fuentes": {"meteo": FUENTE_METEO, "aire_polen": FUENTE_AIRE},
        "escala_niveles": list(reglas.NIVELES),
        "horas": [datetime.fromtimestamp(t, horas.MADRID).isoformat(timespec="seconds") for t in instantes],
        "unidades": UNIDADES,
        "sin_pronostico": SIN_PRONOSTICO,
        "zonas": zonas,
    }


def pronostico(c: httpx.Client, estaciones: list[dict], generado: datetime, umbrales: dict) -> dict:
    """Dos peticiones (meteo y aire+polen) para las coordenadas de `estaciones`. `past_days=1` en CAMS da la ventana de
    24 h previa a la primera hora del pronostico para las medias moviles."""
    meteo = _pedir_horario(c, URL_FORECAST, estaciones, HOURLY_METEO)
    cams = _pedir_horario(c, URL_AIRE, estaciones, HOURLY_AIRE, past_days=1)
    return construir_pronostico(meteo, cams, estaciones, generado, umbrales)
