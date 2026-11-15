import json
from pathlib import Path

import pytest

from alergia import ckan, config
from alergia.geo import haversine_km
from estatico import construir_lugares as cl

DATOS = Path(__file__).parent / "datos"


def test_haversine():
    # Madrid (Sol) - Getafe: ~11 km; distancia a si mismo = 0
    assert haversine_km(40.4168, -3.7038, 40.4168, -3.7038) == 0
    assert 10 < haversine_km(40.4168, -3.7038, 40.3146, -3.7169) < 13


def test_estaciones_recorte_comas_y_puntos():
    est = {e["id"]: e for e in cl.parsear_estaciones(ckan.leer_csv(DATOS / "estaciones_recorte.csv"))}
    assert est["est:28065014"]["lat"] == pytest.approx(40.314577)
    # Rascafria usa punto decimal; San Sebastian de los Reyes tiene un campo con ';' entre comillas
    assert est["est:28120001"]["lon"] == pytest.approx(-3.9612)
    assert est["est:28134002"]["lat"] == pytest.approx(40.569722)
    # Arganda mide ozono con el analizador O3Q
    assert "o3" in est["est:28014002"]["mide"]


def test_captadores_latin1_y_cabecera_con_espacio():
    filas = ckan.leer_csv(DATOS / "captadores_recorte.csv", encoding="latin-1")
    assert "direccion_localidad" in filas[0]  # la cabecera original lleva espacio final
    caps = {c["id"]: c for c in cl.parsear_captadores(filas, {"GETA", "AYTM", "FACF", "ALCA"})}
    assert caps["cap:GETA"]["localidad"] == "Getafe"
    assert caps["cap:GETA"]["activo"] is True and caps["cap:LEGA"]["activo"] is False
    assert caps["cap:ALCA"]["nombre"] == "Alcalá de Henares"


def test_captadores_activos_por_anio():
    filas = ckan.leer_csv(DATOS / "polen_2026_recorte.csv")
    assert cl.captadores_con_datos(filas, 2026) == {"GETA", "ALCA", "AYTM", "FACF"}
    assert cl.captadores_con_datos(filas, 2025) == set()


def test_emparejamiento_getafe_y_madrid():
    est = cl.parsear_estaciones(ckan.leer_csv(DATOS / "estaciones_recorte.csv"))
    caps = cl.parsear_captadores(ckan.leer_csv(DATOS / "captadores_recorte.csv", "latin-1"), {"GETA", "AYTM", "FACF", "ALCA"})
    r = cl.construir(est, caps)
    e = {x["id"]: x for x in r["estaciones"]}
    m = {x["id"]: x for x in r["municipios"]}
    assert e["est:28065014"]["captador"] == "cap:GETA"
    # Leganes no esta en el recorte de estaciones, pero el captador LEGA (inactivo) nunca se asigna
    assert all(x["captador"] != "cap:LEGA" for x in r["estaciones"] + r["municipios"])
    assert m["mun:28079"]["cobertura_aire"] == "lejana" and m["mun:28079"]["dist_estacion_km"] > 5
    assert m["mun:28065"]["cobertura_aire"] == "buena"


def test_rejilla_42_puntos():
    r = cl.rejilla()["puntos"]
    assert len(r) == 42
    assert {p["lat"] for p in r} == {39.9, 40.15, 40.4, 40.65, 40.9, 41.15}
    assert {p["lon"] for p in r} == {-4.55, -4.3, -4.05, -3.8, -3.55, -3.3, -3.05}


# --- aceptacion sobre los ficheros generados y versionados ---
ESTATICOS = config.ESTATICOS


def test_lugares_json_aceptacion():
    d = json.loads((ESTATICOS / "lugares.json").read_text(encoding="utf-8"))
    assert len(d["estaciones"]) == 28 and len(d["captadores"]) == 11
    assert len(d["municipios"]) == 29
    e = {x["id"]: x for x in d["estaciones"]}
    m = {x["id"]: x for x in d["municipios"]}
    assert e["est:28065014"]["captador"] == "cap:GETA"
    assert m["mun:28079"]["cobertura_aire"] == "lejana"
    assert [c["activo"] for c in d["captadores"] if c["id"] == "cap:LEGA"] == [False]
    assert sum(c["activo"] for c in d["captadores"]) == 10
    for x in d["estaciones"]:
        assert {"id", "nombre", "municipio", "lat", "lon", "tipo", "mide", "captador", "dist_captador_km"} <= x.keys()


def test_rejilla_json():
    d = json.loads((ESTATICOS / "rejilla_viento.json").read_text())
    assert len(d["puntos"]) == 42
