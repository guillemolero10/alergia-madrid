import json
from pathlib import Path

import pytest

from alergia import ckan
from alergia.geo import haversine_km
from estatico import construir_colegios as cc

DATOS = Path(__file__).parent / "datos"
LUGARES = {
    "estaciones": [
        {"id": "est:A", "lat": 40.40, "lon": -3.70},
        {"id": "est:B", "lat": 40.60, "lon": -3.40},
    ],
    "captadores": [
        {"id": "cap:X", "lat": 40.45, "lon": -3.65, "activo": True},
        {"id": "cap:Y", "lat": 40.60, "lon": -3.40, "activo": False},  # inactivo: no se asigna
    ],
    "municipios": [{"id": "mun:28079"}, {"id": "mun:28002"}],
}
CDMUNI = {"079": "mun:28079", "002": "mun:28002"}


def filas():
    return ckan.leer_csv(DATOS / "centros_recorte.csv")


def test_conversion_utm_caso_conocido():
    # Hastings School (Hortaleza, Madrid): UTM del CSV (442396, 4479564); OpenStreetMap la sitúa en 40.46487, -3.67925.
    lat, lon = cc.convertir(442396, 4479564)
    assert haversine_km(lat, lon, 40.4648689, -3.6792461) < 0.06  # 23 m con ETRS89; con ED50 serian 255 m
    # Puerta del Sol ~ (440 400, 4 474 300) en UTM 30N
    lat, lon = cc.convertir(440400, 4474300)
    assert haversine_km(lat, lon, 40.4168, -3.7038) < 1.0


def test_datum_es_etrs89_no_ed50():
    # Con ED50 (EPSG:23030) el mismo punto sale ~250 m al sur: confirma que se usa 25830 (ver DATOS.md).
    from pyproj import Transformer

    lon, lat = Transformer.from_crs("EPSG:23030", "EPSG:4326", always_xy=True).transform(440400, 4474300)
    lat2, lon2 = cc.convertir(440400, 4474300)
    assert 0.1 < haversine_km(lat, lon, lat2, lon2) < 0.4
    assert cc.EPSG_ORIGEN == "EPSG:25830"


def test_filtro_motivos():
    r = {f["CODIGO"]: cc.clasificar(f) for f in filas()}
    assert r["28000001"] == ("CEIP", "IP")
    assert r["28000002"] == ("CEIPS", "IPS")
    assert r["28000003"] == "no_alta"
    assert r["28000004"] == "tipo_excluido"  # escuela infantil 0-3
    assert r["28000005"] == "tipo_excluido"  # conservatorio
    assert r["28000006"] == "sin_coordenadas"
    assert r["28000007"] == ("EXT", "IPS")
    assert r["28000008"] == "extranjero_no_colegio"  # guarderia


def test_mapeo_municipio():
    m = cc.mapa_municipios(
        [
            {"municipio_codigo": "001", "municipio_codigo_ine": "280014"},
            {"municipio_codigo": "079", "municipio_codigo_ine": "280796"},
        ]
    )
    assert m == {"001": "mun:28001", "079": "mun:28079"}


def test_construir_asignaciones_y_descartes():
    centros, st = cc.construir(filas(), CDMUNI, LUGARES)
    por = {c["c"]: c for c in centros}
    assert set(por) == {"28000001", "28000002", "28000007"}
    assert st["descartes"]["fuera_comunidad"] == 1 and st["descartes"]["municipio_desconocido"] == 1
    c = por["28000001"]
    assert c["m"] == "mun:28079" and c["ea"] == "est:A" and c["ca"] == "cap:X"
    assert c["p"] == "pu" and c["la"] == round(c["la"], 5)
    # la distancia es la haversine a la estacion asignada, con 1 decimal
    est = LUGARES["estaciones"][0]
    assert c["de"] == pytest.approx(haversine_km(c["la"], c["lo"], est["lat"], est["lon"]), abs=0.06)
    assert por["28000002"]["m"] == "mun:28002"
    assert por["28000007"]["n"] == "Hastings School"  # sin el parentesis de nacionalidad


@pytest.mark.parametrize(
    "crudo, esperado",
    [
        ("JOSE DE ESPRONCEDA", "Jose de Espronceda"),
        ("NUESTRA SEÑORA DE LA PAZ", "Nuestra Señora de la Paz"),
        ("AMERICAN SCHOOL OF MADRID (EE.UU.)", "American School of Madrid (EE.UU.)"),
        ("KING¿S COLLEGE", "King's College"),
        ("SAN JOSE II", "San Jose II"),
        ("C.R.E. ANTONIO MOSQUETE", "C.R.E. Antonio Mosquete"),
    ],
)
def test_nombre_legible(crudo, esperado):
    assert cc.nombre_legible(crudo) == esperado


def test_json_generado_si_existe():
    ruta = Path(__file__).parents[2] / "datos-estaticos" / "colegios.json"
    if not ruta.exists():
        pytest.skip("colegios.json no generado")
    d = json.loads(ruta.read_text(encoding="utf-8"))
    lug = json.loads((ruta.parent / "lugares.json").read_text(encoding="utf-8"))
    ids_est = {e["id"] for e in lug["estaciones"]}
    ids_mun = {m["id"] for m in lug["municipios"]}
    c = d["centros"]
    assert len(c) > 1500 and len({x["c"] for x in c}) == len(c)
    assert all(x["ea"] in ids_est and x["m"] in ids_mun and cc.en_comunidad(x["la"], x["lo"]) for x in c)
    assert ruta.stat().st_size < 600_000
