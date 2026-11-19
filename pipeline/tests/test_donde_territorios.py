import json
import warnings
from pathlib import Path

import pytest

from donde import secciones as sc, territorios as tt

DATOS = Path(__file__).parent / "datos"
ZONAS = {"28001": "06", "28079": "01", "28106": "04"}
LUGARES = {"municipios": [
    {"id": "mun:28001", "nombre": "La Acebeda", "lat": 41.08685, "lon": -3.62479},
    {"id": "mun:28079", "nombre": "Madrid", "lat": 40.4165, "lon": -3.7026},
    {"id": "mun:28106", "nombre": "Parla", "lat": 40.2361, "lon": -3.7676},
]}
FILAS = [{"nuts4_codigo": c, "nuts4_nombre": n} for c, n in
         [("01", "Municipio de Madrid"), ("04", "Sur Metropolitano"), ("06", "Sierra Norte")]]


@pytest.fixture(scope="module")
def terr():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sec = sc.construir(sc.leer_censo(DATOS / "censo_recorte.csv"), *sc.leer_geometrias(DATOS / "secciones_recorte"), ZONAS)
    return tt.construir(sec, LUGARES, FILAS)


def test_tramos_de_tamano():
    assert tt.tramo_tamano(1999) == "<2.000"
    assert tt.tramo_tamano(2000) == "2.000-10.000" and tt.tramo_tamano(10000) == "2.000-10.000"
    assert tt.tramo_tamano(10001) == "10.001-50.000" and tt.tramo_tamano(50000) == "10.001-50.000"
    assert tt.tramo_tamano(50001) == "50.001-100.000" and tt.tramo_tamano(100000) == "50.001-100.000"
    assert tt.tramo_tamano(100001) == ">100.000"


def test_municipios_y_distritos(terr):
    m = {x["id"]: x for x in terr["municipios"]}
    assert set(m) == {"mun:28001", "mun:28079", "mun:28106"}
    assert m["mun:28001"]["poblacion"] == 70 and m["mun:28001"]["tramo"] == "<2.000"
    assert m["mun:28106"]["zona"] == "04" and m["mun:28106"]["nombre"] == "Parla"
    assert m["mun:28001"]["lat"] == 41.08685  # punto del nucleo de lugares.json
    w, s, e, n = m["mun:28106"]["bbox"]
    assert w < e and s < n and -4.6 < w and e < -3.0  # [oeste, sur, este, norte] en WGS84
    d = terr["distritos"]
    assert [x["id"] for x in d] == ["dis:2807901"] and d[0]["nombre"] == "Centro"
    assert d[0]["poblacion"] == m["mun:28079"]["poblacion"]  # las dos secciones del recorte son del distrito Centro


def test_zonas_y_alias(terr):
    z = {x["codigo"]: x for x in terr["zonas"]}
    assert z["04"]["nombre"] == "Sur Metropolitano" and "sur" in z["04"]["alias"]
    assert "sierra" in tt.ALIAS_ZONAS["06"] and "sierra" in tt.ALIAS_ZONAS["10"] and "sierra" in tt.ALIAS_ZONAS["11"]
    assert set(tt.ALIAS_ZONAS) == {f"{i:02d}" for i in range(1, 12)}


def test_contornos_disueltos(terr):
    assert [f["properties"]["id"] for f in terr["municipios_geo"]["features"]] == ["mun:28001", "mun:28079", "mun:28106"]
    assert [f["properties"]["id"] for f in terr["distritos_geo"]["features"]] == ["dis:2807901"]
    for f in terr["municipios_geo"]["features"]:
        assert f["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_municipios_distintos_de_lugares_falla():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        sec = sc.construir(sc.leer_censo(DATOS / "censo_recorte.csv"), *sc.leer_geometrias(DATOS / "secciones_recorte"), ZONAS)
    with pytest.raises(ValueError, match="municipios distintos"):
        tt.construir(sec, {"municipios": LUGARES["municipios"][:2]}, FILAS)


def test_serializable(terr):
    assert terr["version"] == 1 and "fuentes" in terr
    json.dumps(terr)
