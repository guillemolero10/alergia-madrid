import json
from pathlib import Path

import httpx
import pytest

from alergia import ckan, config, polen, reglas

DATOS = Path(__file__).parent / "datos"
U = reglas.cargar_umbrales()
FILAS = ckan.leer_csv_auto(DATOS / "polen_actual_recorte.csv")


def obs_de(filas):
    return {(o["lugar"], o["variable"]): o for o in polen.observaciones(filas, U)}


def test_tabla_de_tipos_son_25_y_cuadra_con_umbrales():
    assert len(config.POLEN_TIPOS) == 25
    assert set(config.POLEN_TIPOS) <= set(U["polen"]["tipos"])
    assert not {"otros", "pni"} & set(config.POLEN_TIPOS)
    assert config.POLEN_TIPOS["cupresaceas_taxaceas"] == "polen_cupresaceas" and config.POLEN_TIPOS["platano_de_paseo"] == "polen_platano"


def test_ultimo_dia_con_dato_y_fecha_como_hora():
    o = obs_de(FILAS)[("cap:GETA", "polen_gramineas")]
    assert o["hora"] == "2026-11-08" and o["valor"] == 0 and o["regla"] == "diario" and o["valor_regla"] == 0
    assert o["fuente"] == "ckan:mediciones_polen" and o["unidad"] == "granos/m³" and o["nivel"] == "bajo"
    assert obs_de(FILAS)[("cap:GETA", "polen_artemisia")]["hora"] == "2026-11-08"


def test_vacio_es_sin_dato_no_cero():
    antes_de_mayo = [f for f in FILAS if f["fecha_lectura"] < "2026-05"]  # GETA: 15-abr = 16 y los dias 16 y 17 vienen vacios
    o = obs_de(antes_de_mayo)[("cap:GETA", "polen_gramineas")]
    assert o["hora"] == "2026-04-15" and o["valor"] == 16
    solo_vacio = [f for f in FILAS if f["captador"] == "ALCA" and f["fecha_lectura"].startswith("2026-03-23")]
    assert polen.observaciones(solo_vacio, U) == []


def test_otros_y_pni_no_se_publican_y_los_demas_si():
    variables = {o["variable"] for o in polen.observaciones(FILAS, U)}
    assert variables == {"polen_gramineas", "polen_artemisia", "polen_olivo", "polen_platano"}
    assert obs_de(FILAS)[("cap:GETA", "polen_platano")]["valor"] == 1


def test_captador_sin_datos_no_genera_observaciones():
    assert not [o for o in polen.observaciones(FILAS, U) if o["lugar"] == "cap:LEGA"]  # LEGA no esta en el CSV de 2026


def test_nivel_con_cortes_palinocam_de_gramineas():
    g = U["polen"]["tipos"]["gramineas"]
    assert (g["medio_min"], g["alto_min"], g["metodo"]) == (26, 53, "oficial_palinocam")
    base = {"captador": "GETA", "fecha_lectura": "2026-05-19 00:00:00.0", "tipo_polinico": "Gramíneas"}
    nivel = lambda v: polen.observaciones([{**base, "granos_de_polen_x_metro_cubico": str(v)}], U)[0]["nivel"]
    assert [nivel(25), nivel(26), nivel(52), nivel(53), nivel(377)] == ["bajo", "medio", "medio", "alto", "alto"]


def test_valor_con_coma_decimal():
    f = {"captador": "GETA", "fecha_lectura": "2026-05-19 00:00:00.0", "tipo_polinico": "Olivo", "granos_de_polen_x_metro_cubico": "3,5"}
    assert polen.observaciones([f], U)[0]["valor"] == 3.5


def _cliente(peticiones, lm="2026-11-15T06:17:08.555559"):
    meta = json.loads((DATOS / "resource_show_polen.json").read_text())
    meta["result"]["last_modified"] = lm

    def h(req: httpx.Request) -> httpx.Response:
        peticiones.append(req.url.path)
        if req.url.path.endswith("resource_show"):
            return httpx.Response(200, json=meta)
        return httpx.Response(200, content=(DATOS / "polen_actual_recorte.csv").read_bytes())

    return httpx.Client(transport=httpx.MockTransport(h))


def test_descarga_solo_si_cambia_last_modified(tmp_path):
    p: list[str] = []
    with _cliente(p) as c:
        obs1, i1 = polen.actualizar(c, tmp_path, U)
        obs2, i2 = polen.actualizar(c, tmp_path, U)
    assert i1["descargado"] and not i2["descargado"] and obs1 == obs2
    assert sum(1 for x in p if x.endswith(".csv")) == 1
    with _cliente(p, lm="2026-11-16T06:17:08") as c:
        assert polen.actualizar(c, tmp_path, U)[1]["descargado"]


def test_fallo_http_lanza(tmp_path):
    with httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(503))) as c, pytest.raises(httpx.HTTPStatusError):
        polen.actualizar(c, tmp_path, U)
