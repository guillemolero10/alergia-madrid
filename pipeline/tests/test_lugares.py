import json
import re
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
    assert len(d["municipios"]) == 179  # 28 con estacion + Madrid + 150 del IGN
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


# --- 179 municipios de la Comunidad ---
def test_alias_municipios_nuevos():
    assert cl.alias_de("El Álamo", ampliado=True) == ["el alamo", "alamo"]
    assert "rozas" in cl.alias_de("Las Rozas de Madrid", ampliado=True)  # alias manual de los 28, intacto
    assert "alalpardo" in cl.alias_de("Valdeolmos-Alalpardo", ampliado=True)
    assert cl.alias_de("Getafe") == ["getafe"]  # sin `ampliado` no cambia nada para los 28


def test_construir_anade_municipios_sin_estacion():
    est = cl.parsear_estaciones(ckan.leer_csv(DATOS / "estaciones_recorte.csv"))
    caps = cl.parsear_captadores(ckan.leer_csv(DATOS / "captadores_recorte.csv", "latin-1"), {"GETA", "AYTM", "FACF", "ALCA"})
    fuente = [
        {"ine": "28065", "nombre": "Getafe", "lat": 40.3, "lon": -3.7},  # ya existe: no se toca
        {"ine": "28052", "nombre": "Chinchón", "lat": 40.14, "lon": -3.42},
    ]
    r = cl.construir(est, caps, fuente)
    m = {x["id"]: x for x in r["municipios"]}
    assert m["mun:28065"]["lat"] != 40.3 and m["mun:28065"]["dist_estacion_km"] == 0.0
    ch = m["mun:28052"]
    assert ch["cobertura_aire"] == "lejana" and ch["dist_estacion_km"] > 5
    estacion = {e["id"]: e for e in r["estaciones"]}[ch["estacion"]]
    assert ch["dist_estacion_km"] == pytest.approx(haversine_km(40.14, -3.42, estacion["lat"], estacion["lon"]), abs=0.01)
    assert ch["alias"] == ["chinchon"]


def test_fuente_municipios_fuera_de_la_comunidad(tmp_path):
    f = tmp_path / "m.csv"
    f.write_text("ine,nombre,nucleo,habitantes,lat,lon\n28001,X,X,1,35.0,-3.7\n", encoding="utf-8")
    with pytest.raises(ValueError):
        cl.parsear_municipios_fuente(f)


@pytest.fixture(scope="module")
def lugares_reales():
    return json.loads((ESTATICOS / "lugares.json").read_text(encoding="utf-8"))


def test_lugares_json_179_municipios(lugares_reales):
    ms = lugares_reales["municipios"]
    ids = [m["id"] for m in ms]
    assert len(ms) == 179 and len(set(ids)) == 179
    assert all(re.fullmatch(r"mun:28\d{3}", i) for i in ids)
    for m in ms:
        assert 39.8 <= m["lat"] <= 41.2 and -4.6 <= m["lon"] <= -3.0, m["id"]
        assert m["nombre"] and m["alias"][0] == cl.sin_acentos(m["nombre"]).lower()


def test_lugares_json_asignaciones(lugares_reales):
    est = {e["id"]: e for e in lugares_reales["estaciones"]}
    cap = {c["id"]: c for c in lugares_reales["captadores"]}
    for m in lugares_reales["municipios"]:
        e = est[m["estacion"]]
        # la estacion asignada es la mas cercana de todas
        dmin = min(haversine_km(m["lat"], m["lon"], x["lat"], x["lon"]) for x in est.values())
        assert m["dist_estacion_km"] == pytest.approx(dmin, abs=0.01), m["id"]
        assert m["dist_estacion_km"] == pytest.approx(haversine_km(m["lat"], m["lon"], e["lat"], e["lon"]), abs=0.01)
        assert cap[m["captador"]]["activo"] is True
        assert m["cobertura_aire"] == ("lejana" if m["dist_estacion_km"] > cl.UMBRAL_LEJANA_KM else "buena")
    # los 28 originales y Madrid siguen igual
    por_id = {m["id"]: m for m in lugares_reales["municipios"]}
    assert por_id["mun:28065"]["estacion"] == "est:28065014" and por_id["mun:28065"]["dist_estacion_km"] == 0
    assert por_id["mun:28079"]["captador"] == "cap:AYTM" and por_id["mun:28079"]["cobertura_aire"] == "lejana"
    # cada estacion es la asignada a su propio municipio
    for e in est.values():
        ine = "mun:" + e["id"][4:9]
        if ine in por_id and ine != "mun:28079":
            assert por_id[ine]["estacion"] == e["id"] or por_id[ine]["dist_estacion_km"] == 0
