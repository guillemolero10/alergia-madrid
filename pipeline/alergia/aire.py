"""Calidad del aire del dia en curso (CSV de la Comunidad de Madrid) -> observaciones del esquema `estado_actual`.

Flujo: `resource_show` (last_modified + url) -> descarga del CSV si cambio -> ancho a largo (hNN/vNN) ->
fusion con `aire_48h.json` (48 h de historia) -> `serie` de 24 h, medias moviles y nivel.
No se usa `datastore_search` (devuelve 0 filas). Convencion horaria en `horas.py`.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

from . import ckan, config, horas, reglas

UTC = timezone.utc
FUENTE = "ckan:calidad_aire_datos_dia"
UNIDAD = "µg/m³"
MAGNITUDES = {8: "no2", 9: "pm25", 10: "pm10", 14: "o3"}
VALIDOS = {"V", "T"}  # V valido, T provisional; N = sin dato
HISTORIA_H = 48
SERIE_H = 24
# (horas de la ventana, minimo de horas validas): 8 h con 6 (75 %), 24 h con 12 (50 %, plan).
VENTANAS = {"media_movil_8h": (8, 6), "media_movil_24h": (24, 12)}
NOMBRE_CACHE = "aire_48h.json"

Serie = dict[str, list]  # {"2026-11-15T10:00:00Z": [valor, provisional]}


def codigo_estacion(provincia: str, municipio: str, estacion: str) -> str:
    """provincia + municipio (3 cifras) + estacion (3 cifras), p. ej. 28 + 065 + 014 -> `est:28065014`."""
    return f"est:{int(provincia):02d}{int(municipio):03d}{int(estacion):03d}"


def clave(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def instante(k: str) -> datetime:
    return datetime.fromisoformat(k)


def parsear_csv(ruta: Path) -> tuple[dict[tuple[str, str], Serie], set[tuple[str, str, date]]]:
    """CSV del dia -> ({(estacion, variable): {instante_utc: [valor, provisional]}}, {(estacion, variable, dia_utc)}).

    El segundo elemento lista lo que el fichero cubre (aunque todo sea N) para poder reemplazar la cache.
    """
    datos: dict[tuple[str, str], Serie] = {}
    cubierto: set[tuple[str, str, date]] = set()
    for f in ckan.leer_csv_auto(ruta):
        try:
            variable = MAGNITUDES.get(int(f["magnitud"]))
        except (KeyError, ValueError):
            continue
        if variable is None:
            continue
        est = codigo_estacion(f["provincia"], f["municipio"], f["estacion"])
        dia = date(int(f["ano"]), int(f["mes"]), int(f["dia"]))
        cubierto.add((est, variable, dia))
        pts = datos.setdefault((est, variable), {})
        for n in range(1, 25):
            if f.get(f"v{n:02d}", "").strip() not in VALIDOS:
                continue
            try:
                v = ckan.numero(f.get(f"h{n:02d}"))
            except ValueError:
                v = None
            if v is None or v < 0:
                continue
            pts[clave(horas.fin_de_hora(dia, n))] = [v, f[f"v{n:02d}"].strip() == "T"]
    return datos, cubierto


def fusionar(series: dict, nuevos: dict[tuple[str, str], Serie], cubierto: set[tuple[str, str, date]]) -> dict:
    """Mezcla el CSV del dia en la cache. El fichero manda sobre las horas de su dia (h01..h24 UTC) y deja las demas."""
    for est, variable, dia in cubierto:
        pts = series.setdefault(est, {}).setdefault(variable, {})
        ini = datetime(dia.year, dia.month, dia.day, tzinfo=UTC)
        for k in [k for k in pts if ini < instante(k) <= ini + timedelta(hours=24)]:
            del pts[k]
    for (est, variable), pts in nuevos.items():
        series.setdefault(est, {}).setdefault(variable, {}).update(pts)
    return series


def podar(series: dict, horas_historia: int = HISTORIA_H) -> dict:
    """Quita lo anterior a `horas_historia` h antes del ultimo dato de toda la cache."""
    todos = [instante(k) for v in series.values() for p in v.values() for k in p]
    if not todos:
        return series
    corte = max(todos) - timedelta(hours=horas_historia)
    for est in list(series):
        for var in list(series[est]):
            series[est][var] = {k: x for k, x in series[est][var].items() if instante(k) > corte}
            if not series[est][var]:
                del series[est][var]
        if not series[est]:
            del series[est]
    return series


def media_movil(pts: Serie, fin: datetime, horas_ventana: int, minimo: int) -> float | None:
    """Media de las `horas_ventana` horas que terminan en `fin` (incluida). None si hay menos de `minimo` validas."""
    vals = [pts[k][0] for i in range(horas_ventana) if (k := clave(fin - timedelta(hours=i))) in pts]
    return sum(vals) / len(vals) if len(vals) >= minimo else None


def _limpio(x: float) -> float | int:
    return int(x) if float(x).is_integer() else round(x, 1)


def observaciones(series: dict, umbrales: dict) -> list[dict]:
    """Una observacion por estacion y variable con su ultimo dato valido, serie de 24 h, valor de regla y nivel."""
    ultimos = [max(instante(k) for k in p) for v in series.values() for p in v.values() if p]
    if not ultimos:
        return []
    referencia = max(ultimos)
    res = []
    for est in sorted(series):
        for variable in sorted(series[est]):
            pts = series[est][variable]
            if not pts:
                continue
            fin = max(instante(k) for k in pts)
            if referencia - fin > timedelta(hours=24):
                continue  # serie abandonada
            valor, prov = pts[clave(fin)]
            prom = reglas.promedio(umbrales, variable)
            if prom == "hora":
                vr: float | None = valor
            else:
                vr = media_movil(pts, fin, *VENTANAS[prom])
            vr = None if vr is None else round(vr, 1)
            res.append(
                {
                    "lugar": est,
                    "variable": variable,
                    "valor": _limpio(valor),
                    "unidad": UNIDAD,
                    "hora": fin.astimezone(horas.MADRID).isoformat(),
                    "fuente": FUENTE,
                    "nivel": reglas.nivel_aire(variable, vr, umbrales),
                    "regla": reglas.REGLA_ETIQUETA[prom],
                    "valor_regla": None if vr is None else _limpio(vr),
                    "provisional": prov,
                    "serie": [
                        (None if (k := clave(fin - timedelta(hours=SERIE_H - 1 - i))) not in pts else _limpio(pts[k][0]))
                        for i in range(SERIE_H)
                    ],
                }
            )
    return res


def cargar_cache(ruta: Path) -> dict:
    try:
        d = json.loads(ruta.read_text(encoding="utf-8"))
        if d.get("version") == 1 and isinstance(d.get("series"), dict):
            return d
    except (OSError, ValueError):
        pass
    return {"version": 1, "last_modified": None, "series": {}}


def guardar_cache(ruta: Path, cache: dict) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".tmp")
    tmp.write_text(json.dumps(cache, separators=(",", ":")), encoding="utf-8")
    tmp.replace(ruta)


def resource_show(c: httpx.Client, recurso_id: str = config.RES_AIRE_DIA_CSV) -> dict:
    r = c.get(config.CKAN_BASE + "resource_show", params={"id": recurso_id})
    r.raise_for_status()
    d = r.json()
    if not d.get("success"):
        raise RuntimeError("resource_show sin exito")
    return d["result"]


def actualizar(c: httpx.Client, cache_dir: Path, umbrales: dict) -> tuple[list[dict], dict]:
    """Descarga (si cambio) y devuelve (observaciones, info). Lanza excepcion si la fuente falla."""
    ruta_cache = cache_dir / NOMBRE_CACHE
    cache = cargar_cache(ruta_cache)
    meta = resource_show(c)
    lm = meta["last_modified"]
    descargado = False
    if lm != cache["last_modified"] or not cache["series"]:
        r = c.get(meta["url"])
        r.raise_for_status()
        csv_ruta = cache_dir / "aire_dia.csv"
        csv_ruta.parent.mkdir(parents=True, exist_ok=True)
        csv_ruta.write_bytes(r.content)
        nuevos, cubierto = parsear_csv(csv_ruta)
        if not cubierto:
            raise RuntimeError("el CSV del aire no trae filas de las magnitudes esperadas")
        cache["series"] = podar(fusionar(cache["series"], nuevos, cubierto))
        cache["last_modified"] = lm
        guardar_cache(ruta_cache, cache)
        descargado = True
    obs = observaciones(cache["series"], umbrales)
    if not obs:
        raise RuntimeError("sin observaciones de aire")
    return obs, {"last_modified": lm, "descargado": descargado}
