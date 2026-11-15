import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import pytest

from alergia import aire, reglas
from alergia.aire import clave

DATOS = Path(__file__).parent / "datos"
RECORTE = DATOS / "aire_dia_recorte.csv"
U = reglas.cargar_umbrales()
UTC = timezone.utc


def pts(valores: dict[int, float], dia=date(2026, 11, 15), prov=False):
    """{n_hora: valor} -> serie {clave_utc: [valor, prov]} con hNN del dia indicado."""
    ini = datetime(dia.year, dia.month, dia.day, tzinfo=UTC)
    return {clave(ini + timedelta(hours=n)): [v, prov] for n, v in valores.items()}


def test_codigo_estacion():
    assert aire.codigo_estacion("28", "65", "14") == "est:28065014"
    assert aire.codigo_estacion("28", "102", "1") == "est:28102001"
    assert aire.codigo_estacion("28", "079", "004") == "est:28079004"


def test_parsear_recorte_real_con_bom_y_flags():
    assert RECORTE.read_bytes().startswith(b"\xef\xbb\xbf")  # BOM
    datos, cubierto = aire.parsear_csv(RECORTE)
    # solo magnitudes 8, 9, 10 y 14 (SO2, CO y NO se descartan)
    assert {v for (_, v) in datos} == {"no2", "pm25", "pm10", "o3"}
    assert ("est:28102001", "pm25") not in datos and ("est:28065014", "pm25") in datos
    assert len(datos) == 7 and len(cubierto) == 7
    no2 = datos[("est:28065014", "no2")]
    assert len(no2) == 11  # h01..h11 con dato, h12..h24 son N
    assert all(prov is True for _, prov in no2.values())  # todo T en el fichero del dia
    # h01 del 15-nov = 01:00 UTC
    assert clave(datetime(2026, 11, 15, 1, tzinfo=UTC)) in no2


def test_parsear_coma_decimal_flags_v_t_n_y_vacios(tmp_path):
    cab = "provincia;municipio;estacion;magnitud;punto_muestreo;ano;mes;dia;" + ";".join(f"h{n:02d};v{n:02d}" for n in range(1, 25))
    celdas = ["12,5;V", "13;T", ";N", "7;N", ";V", "8,25;T"] + [";N"] * 18
    csv = "﻿" + cab + "\n28;65;14;10;x;2026;11;15;" + ";".join(celdas) + "\n"
    ruta = tmp_path / "a.csv"
    ruta.write_text(csv, encoding="utf-8")
    datos, _ = aire.parsear_csv(ruta)
    p = datos[("est:28065014", "pm10")]
    v = {instante: x for instante, x in p.items()}
    assert v[clave(datetime(2026, 11, 15, 1, tzinfo=UTC))] == [12.5, False]  # coma decimal, V valido
    assert v[clave(datetime(2026, 11, 15, 2, tzinfo=UTC))] == [13.0, True]  # T provisional
    assert len(p) == 3  # h03 vacio+N, h04 con valor pero N, h05 vacio+V: sin dato; h06 8,25 T
    assert v[clave(datetime(2026, 11, 15, 6, tzinfo=UTC))] == [8.25, True]


def test_conversion_horaria_invierno_y_verano(tmp_path):
    cab = "provincia;municipio;estacion;magnitud;punto_muestreo;ano;mes;dia;" + ";".join(f"h{n:02d};v{n:02d}" for n in range(1, 25))
    fila = lambda m, d: f"28;65;14;8;x;2026;{m};{d};" + ";".join(["30;V"] * 24)
    for mes, dia, esperado in [(7, 1, "2026-07-01T02:00:00+02:00"), (1, 10, "2026-01-10T01:00:00+01:00")]:
        r = tmp_path / f"{mes}.csv"
        r.write_text(cab + "\n" + fila(mes, dia) + "\n", encoding="utf-8")
        datos, _ = aire.parsear_csv(r)
        obs = aire.observaciones({"est:28065014": {"no2": datos[("est:28065014", "no2")]}}, U)
        # ultima hora del dia: h24 = 00:00 UTC del dia siguiente
        assert obs[0]["hora"].endswith("+02:00" if mes == 7 else "+01:00")
        assert obs[0]["hora"] == (datetime(2026, mes, dia, tzinfo=UTC) + timedelta(days=1)).astimezone(
            __import__("alergia.horas", fromlist=["MADRID"]).MADRID).isoformat()


def test_observaciones_del_recorte():
    datos, cubierto = aire.parsear_csv(RECORTE)
    series = aire.fusionar({}, datos, cubierto)
    obs = aire.observaciones(series, U)
    assert len(obs) == 7
    getafe_no2 = next(o for o in obs if o["lugar"] == "est:28065014" and o["variable"] == "no2")
    assert getafe_no2["hora"] == "2026-11-15T12:00:00+01:00"  # h11 UTC = 12:00 Madrid
    assert getafe_no2["valor"] == 5 and getafe_no2["provisional"] is True and getafe_no2["regla"] == "1h"
    assert len(getafe_no2["serie"]) == 24 and getafe_no2["serie"][-1] == 5 and getafe_no2["serie"][0] is None
    assert getafe_no2["fuente"] == "ckan:calidad_aire_datos_dia" and getafe_no2["unidad"] == "µg/m³"
    o3 = next(o for o in obs if o["lugar"] == "est:28065014" and o["variable"] == "o3")
    assert o3["regla"] == "media8h"
    pm10 = next(o for o in obs if o["lugar"] == "est:28065014" and o["variable"] == "pm10")
    assert pm10["regla"] == "media24h"
    assert pm10["valor_regla"] is None and pm10["nivel"] == "sin_dato"  # solo 11 h validas (< 12): sin media de 24 h


def test_media_8h_con_huecos_minimo_6():
    fin = datetime(2026, 11, 15, 12, tzinfo=UTC)
    # horas 5..12 (8 h); 6 validas -> media; 5 validas -> None
    seis = pts({5: 100, 6: 100, 8: 100, 10: 130, 11: 130, 12: 130})
    assert aire.media_movil(seis, fin, 8, 6) == pytest.approx(115.0)
    cinco = pts({5: 100, 6: 100, 8: 100, 10: 130, 12: 130})
    assert aire.media_movil(cinco, fin, 8, 6) is None
    # una hora fuera de la ventana (h4) no cuenta
    assert aire.media_movil(pts({4: 999, 6: 1, 7: 1, 8: 1, 9: 1, 10: 1, 11: 1}), fin, 8, 6) == 1.0


def test_media_24h_con_huecos_minimo_12():
    fin = datetime(2026, 11, 15, 23, tzinfo=UTC)
    doce = pts({n: 60 for n in range(12, 24)})
    assert aire.media_movil(doce, fin, 24, 12) == 60
    once = pts({n: 60 for n in range(13, 24)})
    assert aire.media_movil(once, fin, 24, 12) is None


def test_nivel_por_media_movil_y_no_por_ultimo_valor():
    # o3: ultima hora 140 (alto si fuera horario) pero la media de 8 h es 101 -> medio
    serie = pts({5: 98, 6: 98, 7: 98, 8: 98, 9: 98, 10: 98, 11: 98, 12: 140})
    # media = (7*98 + 140)/8 = 103.25 -> medio
    obs = aire.observaciones({"est:28065014": {"o3": serie}}, U)[0]
    assert obs["valor"] == 140 and obs["valor_regla"] == 103.2 and obs["nivel"] == "medio"
    # pm10: ultima hora 60 pero media de 24 h 40 -> bajo
    s = pts({**{n: 38 for n in range(1, 24)}, 24: 62})
    ob = aire.observaciones({"est:28065014": {"pm10": s}}, U)[0]
    assert ob["valor"] == 62 and ob["nivel"] == "bajo" and ob["valor_regla"] == 39.0
    # sin horas suficientes -> sin_dato
    ob2 = aire.observaciones({"est:28065014": {"pm10": pts({n: 99 for n in range(1, 6)})}}, U)[0]
    assert ob2["nivel"] == "sin_dato" and ob2["valor_regla"] is None and ob2["valor"] == 99


def test_serie_24h_con_huecos_alineada_a_la_ultima_hora():
    s = pts({10: 5, 12: 7})
    obs = aire.observaciones({"est:28065014": {"no2": s}}, U)[0]
    assert len(obs["serie"]) == 24
    assert obs["serie"][-1] == 7 and obs["serie"][-2] is None and obs["serie"][-3] == 5
    assert obs["serie"].count(None) == 22


def test_fusion_con_cache_y_poda_48h():
    ayer = pts({n: 1 for n in range(1, 25)}, date(2026, 11, 14))
    hoy_csv = pts({1: 2, 2: 3}, date(2026, 11, 15))
    series = {"est:28065014": {"no2": dict(ayer)}}
    series = aire.fusionar(series, {("est:28065014", "no2"): hoy_csv}, {("est:28065014", "no2", date(2026, 11, 15))})
    assert len(series["est:28065014"]["no2"]) == 26
    # el CSV manda sobre su dia: una hora que antes tenia dato y ahora es N desaparece
    series = aire.fusionar(series, {("est:28065014", "no2"): pts({1: 2})}, {("est:28065014", "no2", date(2026, 11, 15))})
    assert len(series["est:28065014"]["no2"]) == 25
    # poda: dentro de 3 dias, lo de ayer sale
    series["est:28065014"]["no2"].update(pts({1: 9}, date(2026, 11, 17)))
    series = aire.podar(series)
    assert all(instante(k) > datetime(2026, 11, 15, 1, tzinfo=UTC) for k in series["est:28065014"]["no2"])


def instante(k):
    return aire.instante(k)


def test_serie_abandonada_se_descarta():
    s = {"est:1": {"no2": pts({1: 5}, date(2026, 11, 13))}, "est:2": {"no2": pts({1: 5}, date(2026, 11, 15))}}
    assert [o["lugar"] for o in aire.observaciones(s, U)] == ["est:2"]


def _transporte(last_modified="2026-11-15T12:20:10.850986", csv=RECORTE, contador=None):
    meta = json.loads((DATOS / "resource_show_aire_dia.json").read_text())
    meta["result"]["last_modified"] = last_modified

    def h(req: httpx.Request) -> httpx.Response:
        if contador is not None:
            contador.append(req.url.path)
        if req.url.path.endswith("resource_show"):
            return httpx.Response(200, json=meta)
        if req.url.path.endswith(".csv"):
            return httpx.Response(200, content=csv.read_bytes())
        return httpx.Response(404)

    return httpx.MockTransport(h)


def test_actualizar_descarga_y_salta_si_no_cambio(tmp_path):
    llamadas: list[str] = []
    with httpx.Client(transport=_transporte(contador=llamadas)) as c:
        obs, info = aire.actualizar(c, tmp_path, U)
        assert info["descargado"] and len(obs) == 7 and any(p.endswith(".csv") for p in llamadas)
        llamadas.clear()
        obs2, info2 = aire.actualizar(c, tmp_path, U)
        assert not info2["descargado"] and obs2 == obs
        assert not any(p.endswith(".csv") for p in llamadas)  # no se descarga el CSV
    assert (tmp_path / "aire_48h.json").exists()
    with httpx.Client(transport=_transporte(last_modified="2026-11-15T13:20:00")) as c:
        assert aire.actualizar(c, tmp_path, U)[1]["descargado"]  # last_modified cambio


def test_actualizar_propaga_error_http(tmp_path):
    t = httpx.MockTransport(lambda r: httpx.Response(500))
    with httpx.Client(transport=t) as c, pytest.raises(httpx.HTTPStatusError):
        aire.actualizar(c, tmp_path, U)
