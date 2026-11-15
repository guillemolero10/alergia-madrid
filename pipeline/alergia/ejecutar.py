"""Genera `estado_actual.json`.

Uso:  uv run --project pipeline python -m alergia.ejecutar --salida salida/

Cada fuente va en su propio try con 2 reintentos. Si una falla se conserva lo anterior con `estado: error`.
Nunca se escribe un JSON que no valide contra `docs/esquema/estado_actual.schema.json`, ni uno con menos capas
que el anterior. Si fallan todas las fuentes, el proceso termina con codigo 1 y no escribe nada.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable

import httpx
import jsonschema

from . import aire, ckan, config, horas, openmeteo, reglas

ESQUEMA = config.RAIZ / "docs" / "esquema" / "estado_actual.schema.json"
AIRE_ANTIGUO = timedelta(hours=3)  # plan: aire con mas de 3 h de retraso -> `antiguo`
VIENTO_ANTIGUO = timedelta(hours=2)  # plan: la web oculta las flechas con mas de 2 h
FUENTE_POLEN = "ckan:mediciones_polen"


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def con_reintentos(fn: Callable, reintentos: int = 2, espera: float = 3.0, dormir: Callable = time.sleep):
    """Llama a `fn`; ante cualquier excepcion reintenta `reintentos` veces con espera creciente."""
    for intento in range(reintentos + 1):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001 - cada fuente decide que hacer con el fallo final
            if intento == reintentos:
                raise
            log(f"  intento {intento + 1} fallido ({type(e).__name__}); reintento")
            dormir(espera * (intento + 1))


def validar(estado: dict, esquema: Path = ESQUEMA) -> None:
    jsonschema.validate(estado, json.loads(esquema.read_text(encoding="utf-8")))


def cargar_previo(ruta: Path) -> dict | None:
    try:
        previo = json.loads(ruta.read_text(encoding="utf-8"))
        validar(previo)
        return previo
    except (OSError, ValueError, jsonschema.ValidationError):
        return None


def _max_hora(obs: list[dict]) -> str:
    return max((o["hora"] for o in obs), key=datetime.fromisoformat)


def generar(
    salida: Path,
    c: httpx.Client,
    ahora: datetime,
    umbrales: dict,
    lugares: dict,
    rejilla: list[dict],
    dormir: Callable = time.sleep,
) -> dict | None:
    """Devuelve el estado nuevo, o None si todas las fuentes fallaron (no hay nada que publicar)."""
    previo = cargar_previo(salida / "estado_actual.json")
    pcapas = (previo or {}).get("capas", {})
    pobs = (previo or {}).get("observaciones", [])
    capas: dict[str, dict] = {}
    n_ok = 0

    # --- Aire
    obs_aire: list[dict] = []
    try:
        obs_aire, info = con_reintentos(lambda: aire.actualizar(c, salida / "cache", umbrales), dormir=dormir)
        ultimo = _max_hora(obs_aire)
        antiguo = ahora - datetime.fromisoformat(ultimo) > AIRE_ANTIGUO
        capas["aire"] = {"ultimo_dato": ultimo, "fuente": aire.FUENTE, "estado": "antiguo" if antiguo else "ok"}
        n_ok += 1
        log(f"aire: {len(obs_aire)} observaciones, ultimo dato {ultimo} ({'descargado' if info['descargado'] else 'sin cambios'})")
    except Exception as e:  # noqa: BLE001
        log(f"aire: FALLO ({type(e).__name__}: {e})")
        if "aire" in pcapas:
            capas["aire"] = {**pcapas["aire"], "estado": "error"}
            obs_aire = [o for o in pobs if o["fuente"] == aire.FUENTE]

    # --- Polen: lo implementa la tarea 5. Si el estado anterior ya lo traia, se conserva tal cual.
    obs_polen: list[dict] = []
    if "polen" in pcapas:
        capas["polen"] = pcapas["polen"]
        obs_polen = [o for o in pobs if o["fuente"] == FUENTE_POLEN]

    # --- Viento
    viento: list[dict] = (previo or {}).get("viento", [])
    try:
        viento, ultimo_v = con_reintentos(lambda: openmeteo.viento_actual(c, rejilla), dormir=dormir)
        antiguo = ahora - datetime.fromisoformat(ultimo_v) > VIENTO_ANTIGUO
        capas["viento"] = {"ultimo_dato": ultimo_v, "fuente": openmeteo.FUENTE_VIENTO, "estado": "antiguo" if antiguo else "ok"}
        n_ok += 1
        log(f"viento: {len(viento)} puntos, ultimo dato {ultimo_v}")
    except Exception as e:  # noqa: BLE001
        log(f"viento: FALLO ({type(e).__name__}: {e})")
        if "viento" in pcapas:
            capas["viento"] = {**pcapas["viento"], "estado": "error"}
        else:
            viento = []

    if n_ok == 0:
        return None

    riesgo = [
        reglas.riesgo_estacion(
            e["id"],
            e.get("captador"),
            [o for o in obs_aire if o["lugar"] == e["id"]],
            [o for o in obs_polen if o["lugar"] == e.get("captador")],
            ahora.astimezone(horas.MADRID).date(),
        )
        for e in lugares["estaciones"]
    ]
    ref = capas["aire"]["ultimo_dato"] if "aire" in capas else capas["viento"]["ultimo_dato"]
    return {
        "version": 1,
        "generado": ahora.astimezone(horas.MADRID).isoformat(timespec="seconds"),
        "modo": "tiempo_real",
        "fecha_referencia": ref,
        "capas": capas,
        "observaciones": [*obs_aire, *obs_polen],
        "riesgo": riesgo,
        "viento": viento,
    }


def publicar(estado: dict, salida: Path) -> None:
    """Valida y escribe de forma atomica; nunca deja un fichero a medias ni con menos capas que el anterior."""
    validar(estado)
    previo = cargar_previo(salida / "estado_actual.json")
    if previo and len(estado["capas"]) < len(previo["capas"]):
        raise RuntimeError("el estado nuevo tiene menos capas que el anterior; no se publica")
    salida.mkdir(parents=True, exist_ok=True)
    destino = salida / "estado_actual.json"
    tmp = destino.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(destino)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Genera estado_actual.json")
    ap.add_argument("--salida", type=Path, default=config.RAIZ / "salida")
    a = ap.parse_args(argv)
    umbrales = reglas.cargar_umbrales()
    lugares = json.loads((config.ESTATICOS / "lugares.json").read_text(encoding="utf-8"))
    rejilla = openmeteo.cargar_rejilla()
    with ckan.cliente() as c:
        estado = generar(a.salida, c, datetime.now(horas.MADRID), umbrales, lugares, rejilla)
    if estado is None:
        log("todas las fuentes fallaron: no se escribe nada")
        return 1
    try:
        publicar(estado, a.salida)
    except (jsonschema.ValidationError, RuntimeError) as e:
        log(f"no se publica: {str(e).splitlines()[0]}")
        return 1
    log(f"escrito {a.salida / 'estado_actual.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
