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


def cliente(aire_ok=True, viento_ok=True):
    meta = json.loads((DATOS / "resource_show_aire_dia.json").read_text())
    om = json.loads((DATOS / "openmeteo_viento_2puntos.json").read_text())

    def h(req: httpx.Request) -> httpx.Response:
        p = req.url.path
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
    assert e["capas"]["viento"]["estado"] == "ok" and len(e["viento"]) == 42
    assert e["fecha_referencia"] == "2026-11-15T12:00:00+01:00"
    assert e["generado"] == "2026-11-15T13:40:00+01:00"
    assert len(e["riesgo"]) == 28
    getafe = next(r for r in e["riesgo"] if r["lugar"] == "est:28065014")
    assert getafe["nivel"] == "bajo" and getafe["captador"] == "cap:GETA" and getafe["nivel_polen"] == "sin_dato"
    sin_obs = next(r for r in e["riesgo"] if r["lugar"] == "est:28005002")
    assert sin_obs["nivel"] == "sin_dato"


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
    assert generar(tmp_path, aire_ok=False, viento_ok=False) is None


def test_nunca_menos_capas_que_el_anterior(tmp_path):
    e = generar(tmp_path)
    e["capas"]["polen"] = {"ultimo_dato": "2026-11-12", "fuente": "ckan:mediciones_polen", "estado": "ok"}
    ejecutar.publicar(e, tmp_path)
    solo_dos = generar(tmp_path)  # el previo trae polen: se conserva
    assert "polen" in solo_dos["capas"]
    del solo_dos["capas"]["polen"]
    with pytest.raises(RuntimeError, match="menos capas"):
        ejecutar.publicar(solo_dos, tmp_path)


def test_polen_previo_se_conserva_y_entra_en_el_riesgo(tmp_path):
    e = generar(tmp_path)
    e["capas"]["polen"] = {"ultimo_dato": "2026-11-12", "fuente": "ckan:mediciones_polen", "estado": "ok"}
    e["observaciones"].append({"lugar": "cap:GETA", "variable": "polen_gramineas", "valor": 50, "unidad": "granos/m³",
                               "hora": "2026-11-12", "fuente": "ckan:mediciones_polen", "nivel": "alto", "regla": "diario", "valor_regla": 50})
    ejecutar.publicar(e, tmp_path)
    nuevo = generar(tmp_path)
    getafe = next(r for r in nuevo["riesgo"] if r["lugar"] == "est:28065014")
    assert getafe["nivel"] == "alto" and getafe["peor_variable"] == "polen_gramineas" and getafe["polen_antiguedad_dias"] == 3


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
        lambda d: d["observaciones"][0].update(nivel="critico"),
        lambda d: d["observaciones"][0].update(hora="2026-11-15T12:00:00"),  # sin desfase
        lambda d: d["observaciones"][0]["serie"].pop(),
        lambda d: d.update(version=2),
    ):
        copia = json.loads(json.dumps(e))
        rompe(copia)
        with pytest.raises(jsonschema.ValidationError):
            ejecutar.validar(copia)
