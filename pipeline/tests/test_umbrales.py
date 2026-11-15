import json
from pathlib import Path

import pytest

from alergia import ckan, config
from estatico import construir_umbrales as cu

DATOS = Path(__file__).parent / "datos"


def test_aire_cortes_segun_boe_2020():
    a = cu.aire()
    assert (a["no2"]["bajo_max"], a["no2"]["medio_max"]) == (90, 120)
    assert (a["o3"]["bajo_max"], a["o3"]["medio_max"]) == (100, 130)
    assert (a["pm10"]["bajo_max"], a["pm10"]["medio_max"]) == (40, 50)
    assert (a["pm25"]["bajo_max"], a["pm25"]["medio_max"]) == (20, 25)
    # O3 usa media movil de 8 h (BOE 2020), no el valor horario
    assert a["o3"]["promedio"] == "media_movil_8h" and a["no2"]["promedio"] == "hora"
    assert a["pm10"]["promedio"] == a["pm25"]["promedio"] == "media_movil_24h"
    for v in a.values():
        m = [b["max"] for b in v["bandas_inca"]]
        assert m == sorted(m) and len(m) == 6


def test_percentil_como_numpy_linear():
    assert cu.percentil([1, 2, 3, 4], 50) == 2.5
    assert cu.percentil([10], 90) == 10
    assert cu.percentil(list(range(101)), 90) == pytest.approx(90)
    with pytest.raises(ValueError):
        cu.percentil([], 50)


def test_slug_y_acumulado_latin1():
    assert cu.slug("Gramíneas") == "gramineas"
    assert cu.slug("PNI (Polen no identificado)") == "pni"
    assert cu.slug("Cupresáceas/Taxáceas") == "cupresaceas_taxaceas"
    assert cu.slug("Plátano de paseo") == "platano_de_paseo"
    vals, nom = {}, {}
    from collections import defaultdict

    vals = defaultdict(list)
    cu.acumular(ckan.leer_csv_auto(DATOS / "polen_2019_recorte.csv"), vals, nom)
    assert "gramineas" in vals and nom["platano_de_paseo"] == "Plátano de paseo"
    assert all(x > 0 for l in vals.values() for x in l)  # solo > 0


def test_nivel_polen():
    assert cu.nivel_polen(None, 11, 41) == "sin_dato"
    assert cu.nivel_polen(10.9, 11, 41) == "bajo"
    assert cu.nivel_polen(11, 11, 41) == "medio"
    assert cu.nivel_polen(41, 11, 41) == "alto"


def test_gramineas_19_mayo_2026_es_alto():
    u = json.loads((config.ESTATICOS / "umbrales.json").read_text(encoding="utf-8"))
    g = u["polen"]["tipos"]["gramineas"]
    filas = [f for f in ckan.leer_csv(DATOS / "polen_2026_recorte.csv") if f["fecha_lectura"].startswith("2026-05-19")]
    vs = [float(f["granos_de_polen_x_metro_cubico"]) for f in filas]
    media = sum(vs) / len(vs)
    assert media > g["p90"]
    assert cu.nivel_polen(media, g["p75"], g["p90"]) == "alto"
    assert all(cu.nivel_polen(v, g["p75"], g["p90"]) in ("medio", "alto") for v in vs)


def test_umbrales_json_completo():
    u = json.loads((config.ESTATICOS / "umbrales.json").read_text(encoding="utf-8"))
    for s in config.POLEN_CLAVES:
        t = u["polen"]["tipos"][s]
        assert 0 < t["p75"] <= t["p90"] and t["n_dias_positivos"] > 100
    assert u["polen"]["periodo"] == "2010-2019"
