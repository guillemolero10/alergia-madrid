import json
from datetime import datetime
from pathlib import Path

import httpx
import jsonschema
import pytest

from alergia import config, ejecutar, horas, openmeteo, reglas

DATOS = Path(__file__).parent / "datos"
U = reglas.cargar_umbrales()
LUGARES = json.loads((config.ESTATICOS / "lugares.json").read_text(encoding="utf-8"))
REJILLA = openmeteo.cargar_rejilla()
AHORA = datetime(2026, 11, 15, 13, 40, tzinfo=horas.MADRID)
sin_espera = lambda s: None


def cliente(aire_ok=True, viento_ok=True, polen_ok=True):
    meta = json.loads((DATOS / "resource_show_aire_dia.json").read_text())
    om = json.loads((DATOS / "openmeteo_viento_2puntos.json").read_text())

    def h(req: httpx.Request) -> httpx.Response:
        p = req.url.path
        if "mediciones_polen" in p or (p.endswith("resource_show") and req.url.params["id"] == config.RES_POLEN_2026_CSV):
            if not polen_ok:
                return httpx.Response(503)
            if p.endswith("resource_show"):
                return httpx.Response(200, content=(DATOS / "resource_show_polen.json").read_bytes())
            return httpx.Response(200, content=(DATOS / "polen_actual_recorte.csv").read_bytes())
        if "calidad_aire" in p or p.endswith("resource_show") or p.endswith(".csv"):
            if not aire_ok:
                return httpx.Response(503)
            return httpx.Response(200, json=meta) if p.endswith("resource_show") else httpx.Response(200, content=(DATOS / "aire_dia_recorte.csv").read_bytes())
        if "open-meteo" in str(req.url.host):
            if not viento_ok:
                return httpx.Response(500)
            n = len(req.url.params["latitude"].split(","))
            return httpx.Response(200, json=[om[i % 2] for i in range(n)])
        return httpx.Response(404)

    return httpx.Client(transport=httpx.MockTransport(h))


def generar(tmp_path, ahora=AHORA, **kw):
    with cliente(**kw) as c:
        return ejecutar.generar(tmp_path, c, ahora, U, LUGARES, REJILLA, dormir=sin_espera)


def test_estado_valido_y_completo(tmp_path):
    e = generar(tmp_path)
    ejecutar.validar(e)
    assert e["version"] == 1 and e["modo"] == "tiempo_real"
    assert e["capas"]["aire"] == {"ultimo_dato": "2026-11-15T12:00:00+01:00", "fuente": "ckan:calidad_aire_datos_dia", "estado": "ok"}
    assert e["capas"]["polen"] == {"ultimo_dato": "2026-11-11", "fuente": "ckan:mediciones_polen", "estado": "ok"}
    assert e["capas"]["viento"]["estado"] == "ok" and len(e["viento"]) == 42
    assert e["fecha_referencia"] == "2026-11-15T12:00:00+01:00"
    assert e["generado"] == "2026-11-15T13:40:00+01:00"
    assert len(e["riesgo"]) == 28
    getafe = next(r for r in e["riesgo"] if r["lugar"] == "est:28065014")
    obs_geta = next(o for o in e["observaciones"] if o["lugar"] == "cap:GETA" and o["variable"] == "polen_gramineas")
    assert obs_geta["hora"] == "2026-11-08" and obs_geta["regla"] == "diario"
    assert getafe["nivel_aire"] == "bajo" and getafe["captador"] == "cap:GETA" and getafe["polen_antiguedad_dias"] == 7
    # artemisia = 2 granos el 8-nov (7 dias: aun cuenta): muy por debajo del corte medio (26) -> bajo, ya no medio
    assert getafe["nivel_polen"] == "bajo" and getafe["nivel"] == "bajo"
    sin_obs = next(r for r in e["riesgo"] if r["lugar"] == "est:28005002")
    assert sin_obs["nivel_aire"] == "sin_dato"  # sin aire; el polen de su captador (ALCA) si cuenta


def test_aire_antiguo_si_pasan_mas_de_3_h(tmp_path):
    e = generar(tmp_path, ahora=datetime(2026, 11, 15, 15, 30, tzinfo=horas.MADRID))  # ultimo dato 12:00 -> 3,5 h
    assert e["capas"]["aire"]["estado"] == "antiguo"
    e2 = generar(tmp_path / "otro", ahora=datetime(2026, 11, 15, 14, 59, tzinfo=horas.MADRID))
    assert e2["capas"]["aire"]["estado"] == "ok"


def test_publicar_escribe_json_que_valida(tmp_path):
    ejecutar.publicar(generar(tmp_path), tmp_path)
    d = json.loads((tmp_path / "estado_actual.json").read_text(encoding="utf-8"))
    ejecutar.validar(d)


def test_fallo_de_una_fuente_conserva_lo_anterior(tmp_path):
    primero = generar(tmp_path)
    ejecutar.publicar(primero, tmp_path)
    segundo = generar(tmp_path / ".", aire_ok=False)
    assert segundo["capas"]["aire"]["estado"] == "error"
    assert segundo["capas"]["aire"]["ultimo_dato"] == primero["capas"]["aire"]["ultimo_dato"]
    assert segundo["observaciones"] == primero["observaciones"]
    assert segundo["capas"]["viento"]["estado"] == "ok"
    ejecutar.validar(segundo)
    tercero = generar(tmp_path, viento_ok=False)
    assert tercero["capas"]["viento"]["estado"] == "error" and tercero["viento"] == primero["viento"]
    assert tercero["capas"]["aire"]["estado"] == "ok"


def test_fallo_de_viento_sin_previo_no_publica_un_json_invalido(tmp_path):
    e = generar(tmp_path, viento_ok=False)  # sin estado previo: no hay capa viento
    assert "viento" not in e["capas"]
    with pytest.raises(jsonschema.ValidationError):
        ejecutar.publicar(e, tmp_path)
    assert not (tmp_path / "estado_actual.json").exists()


def test_todas_las_fuentes_fallan_no_devuelve_nada(tmp_path):
    assert generar(tmp_path, aire_ok=False, viento_ok=False, polen_ok=False) is None


def test_nunca_menos_capas_que_el_anterior(tmp_path):
    ejecutar.publicar(generar(tmp_path), tmp_path)
    solo_dos = generar(tmp_path, polen_ok=False)  # el previo trae polen: se conserva
    assert "polen" in solo_dos["capas"]
    del solo_dos["capas"]["polen"]
    with pytest.raises(jsonschema.ValidationError):  # las tres capas son obligatorias: el esquema ya lo impide
        ejecutar.publicar(solo_dos, tmp_path)


def _previo_con_polen(tmp_path, ultimo, estado="ok", valor=50, nivel="alto"):
    e = generar(tmp_path)
    e["capas"]["polen"] = {"ultimo_dato": ultimo, "fuente": "ckan:mediciones_polen", "estado": estado}
    e["observaciones"] = [o for o in e["observaciones"] if o["fuente"] != "ckan:mediciones_polen"]
    e["observaciones"].append({"lugar": "cap:GETA", "variable": "polen_gramineas", "valor": valor, "unidad": "granos/m³",
                               "hora": ultimo, "fuente": "ckan:mediciones_polen", "nivel": nivel, "regla": "diario", "valor_regla": valor})
    ejecutar.publicar(e, tmp_path)


def test_polen_previo_se_conserva_si_falla_la_fuente_y_pasa_a_error(tmp_path):
    _previo_con_polen(tmp_path, "2026-11-12")
    nuevo = generar(tmp_path, polen_ok=False)
    assert nuevo["capas"]["polen"] == {"ultimo_dato": "2026-11-12", "fuente": "ckan:mediciones_polen", "estado": "error"}  # no `ok`
    getafe = next(r for r in nuevo["riesgo"] if r["lugar"] == "est:28065014")
    assert getafe["nivel"] == "alto" and getafe["peor_variable"] == "polen_gramineas" and getafe["polen_antiguedad_dias"] == 3
    ejecutar.validar(nuevo)


def test_polen_heredado_con_mas_de_7_dias_pasa_a_antiguo_y_no_cuenta(tmp_path):
    _previo_con_polen(tmp_path, "2026-11-07")  # 8 dias antes de AHORA
    nuevo = generar(tmp_path, polen_ok=False)
    assert nuevo["capas"]["polen"]["estado"] == "antiguo"
    getafe = next(r for r in nuevo["riesgo"] if r["lugar"] == "est:28065014")
    assert getafe["nivel_polen"] == "sin_dato" and getafe["nivel"] == "bajo" and getafe["polen_antiguedad_dias"] == 8


def test_polen_con_mas_de_7_dias_en_la_fuente_marca_antiguo(tmp_path):
    e = generar(tmp_path, ahora=datetime(2026, 11, 16, 13, 40, tzinfo=horas.MADRID))  # ultimo dato 11-nov: 5 dias
    assert e["capas"]["polen"]["estado"] == "ok"
    e = generar(tmp_path / "x", ahora=datetime(2026, 11, 20, 13, 40, tzinfo=horas.MADRID))  # 9 dias
    assert e["capas"]["polen"]["estado"] == "antiguo"


def test_estado_previo_que_no_valida_se_registra_en_el_log(tmp_path, capsys):
    (tmp_path / "estado_actual.json").write_text(json.dumps({"version": 1}), encoding="utf-8")
    generar(tmp_path)
    assert "no valida contra el esquema" in capsys.readouterr().err


def test_fallo_solo_de_polen_no_impide_publicar_si_hay_previo(tmp_path):
    _previo_con_polen(tmp_path, "2026-11-12")
    assert generar(tmp_path, polen_ok=False, aire_ok=False, viento_ok=False) is None  # sin ninguna fuente viva no se publica


def test_sin_polen_ni_previo_el_esquema_rechaza_el_estado(tmp_path):
    e = generar(tmp_path, polen_ok=False)
    assert "polen" not in e["capas"]
    with pytest.raises(jsonschema.ValidationError):
        ejecutar.publicar(e, tmp_path)


def test_reintentos(tmp_path):
    n = {"v": 0}

    def f():
        n["v"] += 1
        if n["v"] < 3:
            raise httpx.ConnectError("x")
        return "ok"

    assert ejecutar.con_reintentos(f, reintentos=2, dormir=sin_espera) == "ok" and n["v"] == 3
    n["v"] = -10
    with pytest.raises(httpx.ConnectError):
        ejecutar.con_reintentos(f, reintentos=2, dormir=sin_espera)


def test_esquema_rechaza_estados_rotos(tmp_path):
    e = generar(tmp_path)
    for rompe in (
        lambda d: d["capas"].pop("aire"),
        lambda d: d["capas"].pop("polen"),
        lambda d: d["observaciones"][0].update(nivel="critico"),
        lambda d: d["observaciones"][0].update(hora="2026-11-15T12:00:00"),  # sin desfase
        lambda d: d["observaciones"][0]["serie"].pop(),
        lambda d: d.update(version=2),
    ):
        copia = json.loads(json.dumps(e))
        rompe(copia)
        with pytest.raises(jsonschema.ValidationError):
            ejecutar.validar(copia)
