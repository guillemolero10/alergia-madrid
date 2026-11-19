import json
from datetime import date
from pathlib import Path

import numpy as np
import pytest
import shapely

from alergia import ckan
from donde import comun, servicios as sv

DATOS = Path(__file__).parent / "datos"
CDMUNI = {"079": "mun:28079", "061": "mun:28061"}
PROHIBIDAS = ("titulares", "contacto_", "entidad_", "nif", "telefono", "correo", "e_mail", "email")


def csv(n):
    return ckan.leer_csv(DATOS / n)


@pytest.fixture(scope="module")
def asig():
    cuadrado = shapely.box(440000, 4474000, 441000, 4475000)  # 1 km2 en UTM
    return sv.Asignador(["2807901001"], [cuadrado])


def test_sanitarios_dedup_y_filtros():
    r = sv.centros_sanitarios(csv("sanitarios_recorte.csv"))
    # 3 filas del mismo hospital SERMAS -> 1 centro; el privado y la clinica dental no entran
    assert len(r["hospital"]) == 1 and r["hospital"][0]["titularidad"] == "publica"
    assert len(r["centro_salud"]) == 3  # centro de salud, consultorio y un centro de salud sin coordenadas
    assert {c["id"] for c in r["centro_salud"] + r["hospital"]}.isdisjoint({"x"})
    assert sum(1 for c in r["centro_salud"] if c["x"] is None) == 1
    assert r["hospital"][0]["nombre"].startswith("Hospital: ")


def test_sociales_clasificacion_y_privacidad():
    r = sv.centros_sociales(csv("sociales_recorte.csv"), CDMUNI)
    # Los centros de dia de mayores NO son un servicio (18-nov): van a «otros sociales» con su sector y tipo (2 + 3 = 5)
    assert set(r) == {"residencia", "otros_sociales"}
    assert len(r["residencia"]) == 5 and len(r["otros_sociales"]) == 5
    dia = [c for c in r["otros_sociales"] if c["tipo"] == "CENTROS DE DÍA" and c["sector"] == "Personas mayores"]
    assert len(dia) == 2 and {c["subtipo"] for c in dia} == {"CENTROS DE DÍA: OTROS", "HOGARES Y CLUBES"}
    assert sum(1 for c in r["otros_sociales"] if c["tipo"] == "CENTROS DE DÍA") == 3  # + 1 de «Mujer»
    assert all(c["plazas"] is None or isinstance(c["plazas"], int) for g in r.values() for c in g)
    assert {c["titularidad"] for c in r["residencia"]} <= {"publica", "privada", "concertada"}
    assert any(c["titularidad"] == "publica" for c in r["residencia"])  # PROPIA DE GESTION
    assert any(c["titularidad"] == "concertada" for c in r["residencia"])
    assert all("sector" in c and "tipo" in c for c in r["otros_sociales"])
    # «RESERVADO» (direccion protegida) o vacio = sin coordenadas
    assert sum(1 for g in r.values() for c in g if c["x"] is None) >= 3
    for g in r.values():
        for c in g:
            assert set(c) <= {"id", "nombre", "x", "y", "mun", "plazas", "titularidad", "sector", "tipo", "subtipo", "sensible"}


def test_farmacias_sin_titulares():
    r = sv.centros_farmacias(csv("farmacias_recorte.csv"))
    assert len(r) == 3 and all(set(c) == {"id", "nombre", "x", "y", "mun", "plazas", "titularidad"} for c in r)
    assert "TITULAR" not in json.dumps(r)
    assert r[0]["x"] == 440267.13  # coma decimal
    assert r[2]["x"] is None


def test_dea_codigo_repetido_se_conserva():
    r = sv.centros_dea(csv("dea_recorte.csv"), CDMUNI)
    ids = [c["id"] for c in r]
    assert len(ids) == len(set(ids)) == 4 and ids[-1] == "2018-1614#2"
    assert r[0]["titularidad"] == "privada"


def test_colegios_infantil_primaria_o_eso_publicos_o_concertados():
    base = {"m": "mun:28079", "la": 40.4, "lo": -3.7}
    col = {"centros": [
        {"c": "1", "n": "A", "e": "IP", "p": "pu", **base},
        {"c": "2", "n": "B", "e": "S", "p": "pu", **base},     # instituto (ESO): ahora entra
        {"c": "3", "n": "C", "e": "P", "p": "pr", **base},     # privado sin concierto: no
        {"c": "4", "n": "D", "e": "IPS", "p": "co", **base},    # varias etapas: un solo registro
        {"c": "5", "n": "E", "e": "S", "p": "co", **base},     # concertado solo con secundaria: entra
        {"c": "6", "n": "F", "e": "E", "p": "pu", **base},     # educacion especial: no
        {"c": "7", "n": "G", "e": "S", "p": "pr", **base},     # instituto privado: no
        {"c": "4", "n": "D", "e": "IPS", "p": "co", **base},    # codigo repetido: no duplica
    ]}
    r = sv.centros_colegios(col)
    assert [c["id"] for c in r] == ["1", "2", "4", "5"]
    assert {c["id"]: c["titularidad"] for c in r} == {"1": "publica", "2": "publica", "4": "concertada", "5": "concertada"}
    assert sv.ETAPAS_COLEGIO == {"I", "P", "S"} and sv.TITULARIDAD_COLEGIO == ("pu", "co")


def test_centro_dia_no_es_un_servicio():
    assert "centro_dia" not in sv.SERVICIOS and "centro_dia" not in sv.FUENTES and sv.CON_PLAZAS == {"residencia"}


def test_asignador(asig):
    x = np.array([440500.0, 440950.0 + 100, 445000.0, 440500.0])
    y = np.array([4474500.0, 4474500.0, 4474500.0, 4474500.0])
    assert asig.asignar(x[:1], y[:1]) == ["2807901001"]  # dentro
    assert asig.asignar(np.array([441100.0]), np.array([4474500.0])) == ["2807901001"]  # a 100 m: dentro de la tolerancia
    assert asig.asignar(np.array([445000.0]), np.array([4474500.0])) == [None]  # a 4 km: fuera
    assert asig.asignar(np.array([]), np.array([])) == []


def test_preparar_descarta_y_cuenta(asig):
    centros = [
        {"id": "a", "nombre": "dentro", "x": 440500.0, "y": 4474500.0, "mun": None, "plazas": 10, "titularidad": None},
        {"id": "b", "nombre": "sin coord", "x": None, "y": None, "mun": None, "plazas": 40, "titularidad": None},
        {"id": "c", "nombre": "fuera", "x": 460000.0, "y": 4474500.0, "mun": None, "plazas": 5, "titularidad": None},
        {"id": "d", "nombre": "otro mun", "x": 440600.0, "y": 4474600.0, "mun": "mun:28002", "plazas": 7, "titularidad": None},
    ]
    sal, st = sv.preparar(centros, asig)
    assert [c["id"] for c in sal] == ["a", "d"]
    assert st["entrada"] == 4 and st["sin_coordenadas"] == 1 and st["fuera_comunidad"] == 1 and st["salida"] == 2
    assert st["plazas_sin_coordenadas"] == 40
    assert st["sin_municipio_registro"] == 1 and st["municipio_distinto_de_seccion"] == 1
    assert all(c["mun"] == "mun:28079" for c in sal)  # el municipio es el del poligono donde cae el punto
    assert all(40.3 < c["lat"] < 40.6 and -3.8 < c["lon"] < -3.6 for c in sal)  # UTM -> WGS84 (zona de Madrid)
    assert len(str(sal[0]["lat"]).split(".")[1]) <= 5


def test_preparar_colegios_con_latlon(asig):
    lon, lat = comun.a_wgs84(440500.0, 4474500.0)
    c = [{"id": "k", "nombre": "x", "lat": lat, "lon": lon, "mun": "mun:28079", "plazas": None, "titularidad": "publica"}]
    sal, st = sv.preparar(c, asig)
    assert st["salida"] == 1 and sal[0]["lat"] == round(lat, 5)


def test_json_de_servicio_con_y_sin_plazas(asig):
    r = sv.centros_sociales(csv("sociales_recorte.csv"), CDMUNI)
    ok = [dict(c, x=440500.0, y=4474500.0) for c in r["residencia"][:2]]
    sal, st = sv.preparar(ok, asig)
    j = sv.a_json("residencia", sal, st, "2026-11-15", hoy=date(2026, 11, 18))
    n = len(j["ids"])
    assert j["servicio"] == "residencia" and j["version"] == 1 and "CC BY 4.0" in j["fuente"]
    for col in ("nombres", "mun", "lat", "lon", "plazas", "titularidad"):
        assert len(j[col]) == n
    assert "plazas_descartadas_sin_coordenadas" in j
    f = sv.a_json("farmacia", sal, st, None)
    assert "plazas" not in f and "titularidad" not in f  # la farmacia no lleva ni plazas ni titularidad
    otros = sv.a_json("otros_sociales", [dict(c, mun="mun:28079", lat=40.4, lon=-3.7) for c in r["otros_sociales"]], st, None)
    assert len(otros["sector"]) == len(otros["tipo"]) == len(otros["subtipo"]) == 5


def test_ninguna_columna_personal_en_las_salidas(asig):
    """Los recortes traen NIF, telefonos, correos y titulares (falsos): no pueden salir en el JSON."""
    todos = {}
    todos["res"] = sv.centros_sociales(csv("sociales_recorte.csv"), CDMUNI)
    todos["san"] = sv.centros_sanitarios(csv("sanitarios_recorte.csv"))
    todos["far"] = {"f": sv.centros_farmacias(csv("farmacias_recorte.csv"))}
    todos["dea"] = {"d": sv.centros_dea(csv("dea_recorte.csv"), CDMUNI)}
    for grupo in todos.values():
        for k, centros in grupo.items():
            ok = [dict(c, x=440500.0, y=4474500.0) for c in centros]
            sal, st = sv.preparar(ok, asig)
            texto = json.dumps(sv.a_json("otros_sociales" if k == "otros_sociales" else "dea", sal, st, None))
            claves = json.loads(texto).keys()
            for p in PROHIBIDAS:
                assert not any(p in c for c in claves), (k, p)
            for valor in ("example.org", "G00000000", "Q0000000A", "600 00 00 00", "TITULAR DE PRUEBA"):
                assert valor not in texto


def test_es_sensible_criterio_prudente():
    for sector, tipo, sub in [("Mujer", "CENTROS DE ACOGIDA", "CENTROS DE MUJERES MALTRATADAS"),
                              ("Infancia", "CENTROS DE ACOGIDA", "CENTROS DE ACOGIDA DE MENORES"),
                              ("Familia", "CENTROS RESIDENCIALES", "PISOS TUTELADOS"),
                              ("Personas sin hogar", "CENTROS DE DÍA", "CENTROS DE DÍA: OTROS"),
                              ("Personas con enfermedad mental crónica", "CENTROS RESIDENCIALES", "VIVIENDAS COMUNITARIAS"),
                              ("Presos y ex reclusos", "CENTROS RESIDENCIALES", "PISOS TUTELADOS")]:
        assert sv.es_sensible(sector, tipo, sub), (sector, tipo, sub)
    for sector, tipo, sub in [("Personas mayores", "CENTROS DE DÍA", "HOGARES Y CLUBES"),
                              ("Personas mayores", "CENTROS DE DÍA", "CENTROS DE DÍA: OTROS"),
                              ("Personas con discapacidad intelectual", "CENTROS OCUPACIONALES", "CENTROS OCUPACIONALES GENÉRICOS")]:
        assert not sv.es_sensible(sector, tipo, sub), (sector, tipo, sub)


def test_preparar_generaliza_sensibles_al_punto_de_la_seccion(asig):
    base = {"x": 440123.0, "y": 4474321.0, "mun": None, "plazas": 5, "titularidad": None}
    centros = [dict(base, id="s", nombre="CASA DE ACOGIDA X", sensible=True), dict(base, id="n", nombre="CLUB", sensible=False)]
    sal, st = sv.preparar(centros, asig)
    por = {c["id"]: c for c in sal}
    px, py = asig.punto_interior("2807901001")
    lon, lat = comun.a_wgs84(px, py)
    assert (por["s"]["lat"], por["s"]["lon"]) == (round(lat, 5), round(lon, 5))
    assert (por["n"]["lat"], por["n"]["lon"]) != (por["s"]["lat"], por["s"]["lon"])
    assert por["s"]["mun"] == por["n"]["mun"] == "mun:28079" and st["ubicacion_generalizada"] == 1


def test_a_json_otros_sociales_sin_nombres():
    c = [{"id": "1", "nombre": "CENTRO DE EMERGENCIA SECRETO", "mun": "mun:28079", "lat": 40.4, "lon": -3.7, "plazas": 4,
          "titularidad": "publica", "sector": "Mujer", "tipo": "CENTROS DE ACOGIDA", "subtipo": "X"}]
    j = sv.a_json("otros_sociales", c, {"sin_coordenadas": 0, "fuera_comunidad": 0, "plazas_sin_coordenadas": 0}, None)
    assert "nombres" not in j and "SECRETO" not in json.dumps(j)


def test_agrupar_apilados_por_encima_del_umbral():
    def dea(i, lat, lon, tit="publica"):
        return {"id": f"d{i:04d}", "nombre": "x", "mun": "mun:28079", "lat": lat, "lon": lon, "plazas": None, "titularidad": tit}
    centros = [dea(i, 40.4, -3.6) for i in range(31)] + [dea(100 + i, 40.5, -3.5) for i in range(30)] + [dea(200, 40.6, -3.4)]
    res, st = sv.agrupar_apilados(centros)
    assert len(res) == 1 + 30 + 1                      # 31 apilados -> 1; 30 (= umbral) se conservan
    assert st["puntos_agrupados"] == 1 and st["equipos_agrupados"] == 31 and st["registros_antes"] == 62
    assert st["registros_despues"] == 32 and st["grupos"][0]["equipos"] == 31
    assert sum(c["equipos"] for c in res) == 62
