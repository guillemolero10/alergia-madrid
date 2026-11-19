import json
import warnings
from datetime import date
from pathlib import Path

import numpy as np
import pytest
import shapely
from shapely.geometry import shape

from donde import comun, secciones as sc
from donde.territorios import DISTRITOS_MADRID

DATOS = Path(__file__).parent / "datos"
IDS = ["2800101001", "2807901040", "2807901056", "2810601052", "2810601056"]
ZONAS = {"28001": "06", "28079": "01", "28106": "04"}


@pytest.fixture(scope="module")
def censo():
    return sc.leer_censo(DATOS / "censo_recorte.csv")


@pytest.fixture(scope="module")
def geo():
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        return sc.leer_geometrias(DATOS / "secciones_recorte")


@pytest.fixture(scope="module")
def sec(censo, geo):
    return sc.construir(censo, *geo, ZONAS)


def test_numeros_del_ine():
    assert comun.entero_ine("7.113.886") == 7113886
    assert comun.entero_ine("70") == 70
    assert comun.entero_ine("") is None
    assert comun.decimal_es("440267,13") == 440267.13
    assert comun.decimal_es("RESERVADO") is None


def test_tramos():
    assert sc.tramo_de_etiqueta("De 0 a 4 años") == 0
    assert sc.tramo_de_etiqueta("De 65 a 69 años") == 13
    assert sc.tramo_de_etiqueta("De 95 a 99 años") == 19
    assert sc.tramo_de_etiqueta("100 y más años") == 20
    assert sc.tramo_de_etiqueta("Todas las edades") is None
    assert len(sc.ETIQUETAS_TRAMOS) == sc.N_TRAMOS == 21


def test_censo_solo_total_y_cinco_anios(censo):
    assert sorted(censo) == [2021, 2022, 2023, 2024, 2025]
    assert sorted(censo[2025]) == IDS  # las filas de provincia/municipio (sin seccion) y las de Hombres no cuentan
    v = censo[2025]["2800101001"]
    assert v.shape == (21,) and v.sum() == 70  # La Acebeda: 70 habitantes en 2025 (el INE lo da en «Todas las edades»)


def test_censo_detecta_tramos_que_no_suman(tmp_path):
    malo = tmp_path / "malo.csv"
    cab = "Provincias;Municipios;Secciones;Sexo;Edad;Periodo;Total\n"
    fila = "28 Madrid;28001 A;2800101001 A sección 01001;Total;{};2025;{}\n"
    malo.write_text(cab + fila.format("Todas las edades", "10") + fila.format("De 0 a 4 años", "4"), encoding="utf-8-sig")
    with pytest.raises(ValueError, match="suma de tramos"):
        sc.leer_censo(malo)


def test_grupos_de_edad_y_estimacion_3_16():
    v = np.zeros(21, dtype=np.int64)
    v[0], v[1], v[2], v[3] = 100, 200, 300, 400  # 0-4, 5-9, 10-14, 15-19
    v[13], v[15], v[20] = 50, 20, 5  # 65-69, 75-79, 100+
    g = sc.grupos_edad(v)
    assert g["total"] == 1075
    assert g["0_14"] == 600
    assert g["3_16"] == pytest.approx(0.6 * 100 + 200 + 300 + 0.4 * 400)  # 3/5 de 0-4 + 5-9 + 10-14 + 2/5 de 15-19
    assert g["65_mas"] == 75
    assert g["75_mas"] == 25


def test_geometrias_filtra_madrid_y_ordena(geo):
    attrs, geoms = geo
    assert [a["CUSEC"] for a in attrs] == IDS  # la seccion de Araba (CPRO 01) queda fuera
    assert all(g.is_valid and g.area > 0 for g in geoms)
    assert geoms[0].bounds[0] > 400000  # UTM 30N, no grados


def test_construir_une_poblacion_y_geometria(sec):
    assert sec["ids"] == IDS
    assert sec["mun"] == ["mun:28001", "mun:28079", "mun:28079", "mun:28106", "mun:28106"]
    assert sec["distrito"] == [None, "dis:2807901", "dis:2807901", None, None]  # distrito solo en la capital
    assert sec["zona"] == ["06", "01", "01", "04", "04"]
    assert len(sec["lat"]) == len(sec["lon"]) == len(sec["area_km2"]) == len(sec["grupos"]) == 5
    assert all(a > 0 for a in sec["area_km2"])


def test_punto_interior_cae_dentro_de_su_seccion(sec):
    from pyproj import Transformer

    t = Transformer.from_crs("EPSG:4326", comun.EPSG_UTM, always_xy=True)
    for orig, la, lo in zip(sec["geoms"], sec["lat"], sec["lon"]):
        x, y = t.transform(lo, la)
        assert orig.buffer(2).contains(shapely.Point(x, y))


def test_censo_y_seccionado_que_no_casan_fallan(censo, geo):
    attrs, geoms = geo
    with pytest.raises(ValueError, match="no coinciden"):
        sc.construir(censo, attrs[:-1], geoms[:-1], ZONAS)


def test_municipio_sin_zona_falla(censo, geo):
    with pytest.raises(ValueError, match="sin zona"):
        sc.construir(censo, *geo, {"28001": "06"})


def test_json_secciones(sec):
    j = sc.a_json(sec, hoy=date(2026, 11, 18))
    assert j["version"] == 1 and j["anio_poblacion"] == 2025 and j["generado"] == "2026-11-18"
    assert set(j["pob"]) == {"total", "0_14", "3_16", "65_mas", "75_mas"}
    n = len(j["ids"])
    for col in ("mun", "distrito", "zona", "lat", "lon", "area_km2"):
        assert len(j[col]) == n
    for col, arr in j["pob"].items():
        assert len(arr) == n and min(arr) >= 0, col
    assert j["pob"]["total"][0] == 70
    assert all(a <= b for a, b in zip(j["pob"]["65_mas"], j["pob"]["total"]))
    assert all(a <= b for a, b in zip(j["pob"]["75_mas"], j["pob"]["65_mas"]))
    assert "estimado" in j["metodo_edades"] and "3_16" in j["metodo_edades"]
    json.dumps(j)  # serializable


def test_geojson_secciones(sec):
    gj = sc.a_geojson(sec)
    assert [f["properties"] for f in gj["features"]] == [{"id": i} for i in IDS]  # solo la propiedad `id`
    for f in gj["features"]:
        g = shape(f["geometry"])
        assert g.is_valid and not g.is_empty
        x0, y0, x1, y1 = g.bounds
        assert -4.6 < x0 < x1 < -3.0 and 39.8 < y0 < y1 < 41.2  # WGS84, dentro de la Comunidad
    # 5 decimales como maximo
    texto = json.dumps(gj)
    import re

    assert not re.search(r"\d\.\d{6,}", texto)


def test_simplificacion_conserva_area_y_validez(sec):
    for orig, simple in zip(sec["geoms"], sec["simples"]):
        assert simple.is_valid
        # el area solo puede cambiar en una franja de ancho `tolerancia` a lo largo del perimetro
        assert abs(simple.area - orig.area) <= orig.length * sc.TOLERANCIA_M


def test_simplificacion_no_deja_huecos_entre_vecinas():
    # Dos cuadrados que comparten un borde en zigzag: simplificados como cobertura, el borde comun coincide.
    a = shapely.Polygon([(0, 0), (100, 0), (100, 50), (101, 100), (100, 150), (100, 200), (0, 200)])
    b = shapely.Polygon([(100, 0), (200, 0), (200, 200), (100, 200), (100, 150), (101, 100), (100, 50)])
    sa, sb = sc.simplificar([a, b], 5.0)
    assert sa.intersection(sb).length == pytest.approx(200, rel=0.02)
    assert shapely.union_all([sa, sb]).area == pytest.approx(a.area + b.area)  # sin huecos ni solapes


def test_serie_2021_2025(censo):
    s = sc.serie_poblacion(censo)
    m = s["matriz"]
    assert m.shape == (len(s["ids"]), 5, 21) and list(s["anios"]) == [2021, 2022, 2023, 2024, 2025]
    i = list(s["ids"]).index("2800101001")
    assert m[i, 4].sum() == 70
    assert list(s["tramos"][:3]) == ["0-4", "5-9", "10-14"] and s["tramos"][-1] == "100+"
    assert (m >= -1).all()


def test_distritos_de_madrid():
    assert sorted(DISTRITOS_MADRID) == [f"{i:02d}" for i in range(1, 22)]
    assert DISTRITOS_MADRID["01"] == "Centro" and DISTRITOS_MADRID["21"] == "Barajas"
