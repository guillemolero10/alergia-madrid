from datetime import date

import pytest

from alergia import reglas

U = reglas.cargar_umbrales()


@pytest.mark.parametrize(
    "var,valor,esperado",
    [
        ("no2", 90, "bajo"), ("no2", 91, "medio"), ("no2", 120, "medio"), ("no2", 121, "alto"),
        ("o3", 100, "bajo"), ("o3", 101, "medio"), ("o3", 130, "medio"), ("o3", 131, "alto"),
        ("pm10", 40, "bajo"), ("pm10", 41, "medio"), ("pm10", 50, "medio"), ("pm10", 51, "alto"),
        ("pm25", 20, "bajo"), ("pm25", 21, "medio"), ("pm25", 25, "medio"), ("pm25", 26, "alto"),
        ("no2", 0, "bajo"), ("no2", None, "sin_dato"),
        ("pm10", 40.5, "medio"),  # entre 40 y 41: se trata como medio (criterio prudente)
    ],
)
def test_cortes_aire(var, valor, esperado):
    assert reglas.nivel_aire(var, valor, U) == esperado


def test_promedios_de_umbrales():
    assert reglas.promedio(U, "no2") == "hora"
    assert reglas.promedio(U, "o3") == "media_movil_8h"
    assert reglas.promedio(U, "pm10") == "media_movil_24h"
    assert reglas.promedio(U, "pm25") == "media_movil_24h"


def test_nivel_polen_cortes_exactos():
    assert reglas.nivel_polen(None, 11, 41) == "sin_dato"
    assert reglas.nivel_polen(10.9, 11, 41) == "bajo"
    assert reglas.nivel_polen(11, 11, 41) == "medio"
    assert reglas.nivel_polen(40.9, 11, 41) == "medio"
    assert reglas.nivel_polen(41, 11, 41) == "alto"


def test_combinar_y_maximo():
    assert reglas.combinar("bajo", "alto") == "alto"
    assert reglas.combinar("medio", "bajo") == "medio"
    assert reglas.combinar("sin_dato", "bajo") == "bajo"
    assert reglas.combinar("sin_dato", "sin_dato") == "sin_dato"
    assert reglas.maximo([]) == "sin_dato"


def _o(variable, nivel, hora="2026-11-15T13:00:00+01:00"):
    return {"variable": variable, "nivel": nivel, "hora": hora}


HOY = date(2026, 11, 15)


def test_riesgo_solo_aire():
    r = reglas.riesgo_estacion("est:28065014", "cap:GETA", [_o("no2", "bajo"), _o("o3", "medio")], [], HOY)
    assert r == {
        "lugar": "est:28065014", "nivel": "medio", "nivel_aire": "medio", "nivel_polen": "sin_dato",
        "peor_variable": "o3", "captador": "cap:GETA", "polen_antiguedad_dias": None,
    }


def test_riesgo_polen_dentro_de_7_dias_gana_al_aire():
    polen = [_o("polen_gramineas", "alto", "2026-11-08")]  # 7 dias: cuenta
    r = reglas.riesgo_estacion("est:1", "cap:GETA", [_o("no2", "bajo")], polen, HOY)
    assert (r["nivel"], r["nivel_polen"], r["peor_variable"], r["polen_antiguedad_dias"]) == ("alto", "alto", "polen_gramineas", 7)


def test_riesgo_polen_con_mas_de_7_dias_no_cuenta():
    polen = [_o("polen_gramineas", "alto", "2026-11-07")]  # 8 dias
    r = reglas.riesgo_estacion("est:1", "cap:GETA", [_o("no2", "bajo")], polen, HOY)
    assert (r["nivel"], r["nivel_polen"], r["peor_variable"], r["polen_antiguedad_dias"]) == ("bajo", "sin_dato", "no2", 8)


def test_riesgo_polen_cada_tipo_con_su_antiguedad():
    # Olivo reciente (bajo) y gramíneas de hace 30 días (alto): las gramíneas no deben contar.
    polen = [_o("polen_olivo", "bajo", "2026-11-13"), _o("polen_gramineas", "alto", "2026-10-16")]
    r = reglas.riesgo_estacion("est:1", "cap:GETA", [_o("no2", "bajo")], polen, HOY)
    assert (r["nivel"], r["nivel_polen"], r["polen_antiguedad_dias"]) == ("bajo", "bajo", 2)


def test_riesgo_sin_nada():
    r = reglas.riesgo_estacion("est:1", None, [], [], HOY)
    assert r["nivel"] == "sin_dato" and r["peor_variable"] is None


def test_riesgo_aire_sin_dato_y_polen_valido():
    r = reglas.riesgo_estacion("est:1", "cap:X", [_o("o3", "sin_dato")], [_o("polen_olivo", "medio", "2026-11-14")], HOY)
    assert r["nivel_aire"] == "sin_dato" and r["nivel"] == "medio" and r["peor_variable"] == "polen_olivo"
