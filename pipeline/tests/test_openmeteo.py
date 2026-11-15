import json
from pathlib import Path

import httpx
import pytest

from alergia import openmeteo

DATOS = Path(__file__).parent / "datos"


def _transporte(peticiones):
    base = json.loads((DATOS / "openmeteo_viento_2puntos.json").read_text())

    def h(req: httpx.Request) -> httpx.Response:
        peticiones.append(req)
        n = len(req.url.params["latitude"].split(","))
        return httpx.Response(200, json=[base[i % 2] for i in range(n)])

    return httpx.MockTransport(h)


def test_rejilla_42_puntos_en_una_sola_peticion():
    puntos = openmeteo.cargar_rejilla()
    assert len(puntos) == 42
    peticiones: list[httpx.Request] = []
    with httpx.Client(transport=_transporte(peticiones)) as c:
        viento, ultimo = openmeteo.viento_actual(c, puntos)
    assert len(peticiones) == 1
    q = peticiones[0].url.params
    assert q["current"] == "wind_speed_10m,wind_direction_10m" and q["timezone"] == "Europe/Madrid"
    assert len(q["latitude"].split(",")) == 42
    assert len(viento) == 42
    assert viento[0] == {"lat": puntos[0]["lat"], "lon": puntos[0]["lon"], "velocidad_kmh": 17.2, "direccion_grados": 241}
    assert ultimo == "2026-11-15T13:15:00+01:00"  # hora local con desfase de Madrid


def test_error_si_faltan_puntos_o_hay_nulos():
    puntos = openmeteo.cargar_rejilla()[:2]
    base = json.loads((DATOS / "openmeteo_viento_2puntos.json").read_text())
    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=base[:1]))) as c, pytest.raises(ValueError):
        openmeteo.viento_actual(c, puntos)
    base[0]["current"]["wind_speed_10m"] = None
    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=base))) as c, pytest.raises(ValueError):
        openmeteo.viento_actual(c, puntos)
