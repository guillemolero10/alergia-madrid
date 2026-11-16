import copy
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
DOS = [e for e in LUGARES["estaciones"] if e["id"] in ("est:28065014", "est:28005002")]  # coordenadas de los recortes
DOS.sort(key=lambda e: e["id"] != "est:28065014")  # Getafe primero, como en los recortes
GENERADO = datetime(2026, 11, 15, 13, 27, tzinfo=horas.MADRID)  # los recortes cubren 14-nov 00:00 -> 17-nov 23:00
METEO = json.loads((DATOS / "openmeteo_forecast_2puntos.json").read_text())
CAMS = json.loads((DATOS / "openmeteo_aire_2puntos.json").read_text())


def construir(cams=CAMS, meteo=METEO):
    return openmeteo.construir_pronostico(meteo, cams, DOS, GENERADO, U)


def test_estructura_48_horas_desde_la_hora_siguiente_y_valida():
    d = construir()
    ejecutar.validar_pronostico(d)
    assert len(d["horas"]) == 48 and len(d["zonas"]) == 2
    assert d["horas"][0] == "2026-11-15T14:00:00+01:00" and d["horas"][-1] == "2026-11-17T13:00:00+01:00"
    assert d["generado"] == "2026-11-15T13:27:00+01:00" and d["sin_pronostico"] == ["polen_cupresaceas", "polen_platano"]
    assert d["escala_niveles"] == ["sin_dato", "bajo", "medio", "alto"]
    for z in d["zonas"]:
        assert all(len(v) == 48 for v in (*z["valores"].values(), *z["niveles"].values()))
        assert set(z["niveles"]) >= {"aire", "polen", "global"}


def test_valores_coinciden_con_la_respuesta_de_la_api():
    d = construir()
    h = METEO[0]["hourly"]
    i = h["time"].index(int(datetime(2026, 11, 15, 14, tzinfo=horas.MADRID).timestamp()))
    z = d["zonas"][0]
    assert z["lugar"] == "est:28065014"
    assert z["valores"]["viento_kmh"][0] == round(h["wind_speed_10m"][i], 1)
    assert z["valores"]["viento_dir"][0] == int(round(h["wind_direction_10m"][i])) % 360
    assert z["valores"]["temp_c"][0] == round(h["temperature_2m"][i], 1)
    assert z["valores"]["lluvia_mm"][0] == round(h["precipitation"][i], 1)
    c = CAMS[0]["hourly"]
    j = c["time"].index(h["time"][i])
    assert z["valores"]["no2"][0] == round(c["nitrogen_dioxide"][j], 1) and z["valores"]["pm25"][0] == round(c["pm2_5"][j], 1)
    assert z["valores"]["polen_gramineas"][0] == c["grass_pollen"][j]


def test_niveles_son_maximos_de_aire_y_polen():
    z = construir()["zonas"][0]["niveles"]
    for i in range(48):
        assert z["aire"][i] == max(z[v][i] for v in ("no2", "o3", "pm10", "pm25"))
        assert z["polen"][i] == max(z[v][i] for v in z if v.startswith("polen_"))
        assert z["global"][i] == max(z["aire"][i], z["polen"][i])


def _con(var, f):
    cams = copy.deepcopy(CAMS)
    cams[0]["hourly"][var] = f(cams[0]["hourly"]["time"], cams[0]["hourly"][var])
    return construir(cams=cams)["zonas"][0]


def test_o3_usa_media_movil_de_8_horas_no_el_valor_horario():
    pico = int(datetime(2026, 11, 15, 20, tzinfo=horas.MADRID).timestamp())
    z = _con("ozone", lambda t, v: [150.0 if x == pico else 40.0 for x in t])  # una hora a 150 entre 40: media 8 h = 53,75
    i = 6  # las 20:00
    assert z["valores"]["o3"][i] == 150.0 and z["niveles"]["o3"][i] == 1  # bajo, pese a superar 130 esa hora
    z2 = _con("ozone", lambda t, v: [150.0] * len(v))
    assert set(z2["niveles"]["o3"]) == {3}


def test_pm_exige_12_horas_validas_de_24():
    t0 = int(datetime(2026, 11, 15, 14, tzinfo=horas.MADRID).timestamp())
    # solo hay valor desde 3 h antes de la primera hora del pronostico: ventana de 24 h con 4 valores -> sin_dato
    z = _con("pm10", lambda t, v: [60.0 if x >= t0 - 3 * 3600 else None for x in t])
    assert z["niveles"]["pm10"][0] == 0
    assert z["niveles"]["pm10"][12] == 3  # a las 02:00 del dia 16 ya hay 16 de 24 horas validas, media 60 > 50
    assert z["valores"]["pm10"][0] == 60.0


def test_polen_nulo_es_sin_dato_y_se_aplican_cortes_medio_alto():
    z = _con("grass_pollen", lambda t, v: [None if i % 2 else (50.0 if i % 4 == 0 else 20.0) for i, _ in enumerate(v)])
    niveles = set(z["niveles"]["polen_gramineas"])
    assert niveles <= {0, 1, 2}  # 20 -> bajo (1), 50 -> medio (2); 53 seria alto
    assert 0 in niveles
    z = _con("grass_pollen", lambda t, v: [25.9] * len(v))
    assert set(z["niveles"]["polen_gramineas"]) == {1}
    z = _con("grass_pollen", lambda t, v: [26.0] * len(v))
    assert set(z["niveles"]["polen_gramineas"]) == {2}
    z = _con("grass_pollen", lambda t, v: [53.0] * len(v))
    assert set(z["niveles"]["polen_gramineas"]) == {3}


def test_faltan_horas_lanza_error():
    cams = copy.deepcopy(CAMS)
    for k in cams[0]["hourly"]:
        cams[0]["hourly"][k] = cams[0]["hourly"][k][:-30]
    with pytest.raises(ValueError, match="no cubre"):
        construir(cams=cams)


def _sintetico(inicio_utc: int, n: int) -> dict:
    t = [inicio_utc + 3600 * i for i in range(n)]
    return {"hourly": {"time": t, **{k: [1.0] * n for k in (*openmeteo.CAMS_AIRE, *openmeteo.CAMS_POLEN, *openmeteo.METEO)}}}


def test_cambio_de_hora_de_octubre_mantiene_48_horas_absolutas():
    gen = datetime(2026, 10, 24, 22, 10, tzinfo=horas.MADRID)  # el 25-oct a las 03:00 los relojes pasan a las 02:00
    ini = int(datetime(2026, 10, 23, tzinfo=horas.MADRID).timestamp())
    p = _sintetico(ini, 24 * 6)
    d = openmeteo.construir_pronostico([p], [p], DOS[:1], gen, U)
    assert len(d["horas"]) == 48 and len(set(d["horas"])) == 48
    desfases = [h[-6:] for h in d["horas"]]
    assert desfases[0] == "+02:00" and desfases[-1] == "+01:00" and desfases.count("+02:00") + desfases.count("+01:00") == 48
    sec = [datetime.fromisoformat(h).timestamp() for h in d["horas"]]
    assert all(b - a == 3600 for a, b in zip(sec, sec[1:]))  # sin saltos ni repetidos


def _transporte(peticiones, fallo=None):
    def h(req: httpx.Request) -> httpx.Response:
        peticiones.append(req)
        if fallo:
            return httpx.Response(fallo)
        return httpx.Response(200, json=METEO if "api.open-meteo.com" in str(req.url.host) and "air-quality" not in str(req.url.host) else CAMS)

    return httpx.MockTransport(h)


def test_dos_peticiones_con_los_parametros_del_plan():
    pet: list[httpx.Request] = []
    with httpx.Client(transport=_transporte(pet)) as c:
        d = openmeteo.pronostico(c, DOS, GENERADO, U)
    assert len(pet) == 2 and len(d["zonas"]) == 2
    meteo, aire = sorted(pet, key=lambda r: "air-quality" in str(r.url.host))
    assert meteo.url.params["hourly"] == "wind_speed_10m,wind_direction_10m,precipitation,temperature_2m"
    assert aire.url.params["hourly"] == "pm10,pm2_5,nitrogen_dioxide,ozone,grass_pollen,olive_pollen,birch_pollen,alder_pollen,mugwort_pollen"
    for r in pet:
        assert r.url.params["forecast_days"] == "3" and r.url.params["timezone"] == "Europe/Madrid"
        assert r.url.params["latitude"].split(",")[0] == str(DOS[0]["lat"])
    assert aire.url.params["past_days"] == "1"  # ventana previa para las medias moviles


def test_publicar_pronostico_valida_y_no_toca_el_anterior(tmp_path):
    d = construir()
    ejecutar.publicar_pronostico(d, tmp_path)
    antes = (tmp_path / "pronostico.json").read_text(encoding="utf-8")
    assert json.loads(antes)["horas"] == d["horas"]
    roto = copy.deepcopy(d)
    roto["horas"].pop()
    with pytest.raises(jsonschema.ValidationError):
        ejecutar.publicar_pronostico(roto, tmp_path)
    assert (tmp_path / "pronostico.json").read_text(encoding="utf-8") == antes


def test_fallo_de_la_api_lanza_y_no_escribe(tmp_path):
    pet: list[httpx.Request] = []
    with httpx.Client(transport=_transporte(pet, fallo=500)) as c, pytest.raises(httpx.HTTPStatusError):
        ejecutar.generar_pronostico(c, GENERADO, U, {"estaciones": DOS}, dormir=lambda s: None)
    assert len(pet) == 3  # intento + 2 reintentos
    assert not (tmp_path / "pronostico.json").exists()


def test_main_conserva_el_pronostico_anterior_si_falla(tmp_path, monkeypatch):
    antes = '{"x":1}'
    (tmp_path / "pronostico.json").write_text(antes)
    monkeypatch.setattr(ejecutar, "generar_pronostico", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("x")))
    monkeypatch.setattr(ejecutar, "generar", lambda *a, **k: None)
    assert ejecutar.main(["--salida", str(tmp_path)]) == 1  # sin estado tampoco hay nada que publicar
    assert (tmp_path / "pronostico.json").read_text() == antes
