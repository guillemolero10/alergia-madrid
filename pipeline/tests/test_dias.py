"""Tests de `dias.py` sin red: CSV sinteticos en tmp_path y Open-Meteo simulado con httpx.MockTransport."""
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import jsonschema
import pytest

from alergia import aire, config, dias, ejecutar, horas, openmeteo, reglas

U = reglas.cargar_umbrales()
LUGARES = json.loads((config.ESTATICOS / "lugares.json").read_text(encoding="utf-8"))
REJILLA = openmeteo.cargar_rejilla()
DIA = date(2026, 5, 19)  # 14:00 en Madrid (CEST) = 12:00 UTC
UTC = timezone.utc
CAB_AIRE = "provincia;municipio;estacion;magnitud;punto_muestreo;ano;mes;dia;" + ";".join(f"h{n:02d};v{n:02d}" for n in range(1, 25))


def fila_aire(est: int, magnitud: int, d: date, valor: float, flag: str = "V") -> str:
    return f"28;65;{est};{magnitud};x;{d.year};{d.month:02d};{d.day:02d};" + ";".join(f"{valor};{flag}" for _ in range(24))


def csv_aire(ruta: Path) -> Path:
    filas = [CAB_AIRE]
    for d in (DIA - timedelta(days=1), DIA, DIA + timedelta(days=1)):
        filas.append(fila_aire(14, 8, d, 20))  # NO2
        filas.append(fila_aire(14, 14, d, 135 if d == DIA else 10))  # O3: alto solo el dia pedido
    ruta.write_text("\n".join(filas) + "\n", encoding="utf-8")
    return ruta


def csv_polen(ruta: Path) -> Path:
    ruta.write_text(
        "captador;fecha_lectura;tipo_polinico;granos_de_polen_x_metro_cubico\n"
        "GETA;2026-05-10 00:00:00.0;Gramíneas;5\n"
        "GETA;2026-05-18 00:00:00.0;Gramíneas;300\n"  # el dia anterior
        "GETA;2026-05-19 00:00:00.0;Gramíneas;377\n"
        "GETA;2026-05-20 00:00:00.0;Gramíneas;999\n"  # futuro respecto a la foto: no debe verse
        "GETA;2026-05-19 00:00:00.0;Olivo;\n",  # vacio = sin dato
        encoding="utf-8",
    )
    return ruta


def respuesta_om(n: int, t0: datetime, t1: datetime, claves: list[str], valor: float = 1.0) -> list[dict]:
    ts = []
    t = t0
    while t <= t1:
        ts.append(int(t.timestamp()))
        t += timedelta(hours=1)
    return [{"hourly": {"time": ts, **{k: [valor] * len(ts) for k in claves}}} for _ in range(n)]


def manejador(req: httpx.Request) -> httpx.Response:
    host = req.url.host
    n = len(req.url.params["latitude"].split(","))
    q = req.url.params
    ini = datetime.fromisoformat(q["start_date"]).replace(tzinfo=UTC)
    fin = datetime.fromisoformat(q["end_date"]).replace(tzinfo=UTC) + timedelta(hours=23)
    assert q["timezone"] == "GMT"  # las APIs historicas se piden en UTC
    if host.startswith("archive-api"):
        claves = [k for k in q["hourly"].split(",")]
        return httpx.Response(200, json=respuesta_om(n, ini, fin, claves, 12.0))
    assert host.startswith("air-quality-api")
    return httpx.Response(200, json=respuesta_om(n, ini, fin, q["hourly"].split(","), 5.0))


def cliente_mock(extra=None) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(extra or manejador))


@pytest.fixture
def csvs(tmp_path):
    return csv_aire(tmp_path / "aire.csv"), csv_polen(tmp_path / "polen.csv")


def test_aire_corta_en_la_foto_de_las_14h_y_usa_la_fuente_historica(csvs):
    obs = dias.estado_aire([csvs[0]], dias.corte(DIA), U)
    assert {o["variable"] for o in obs} == {"no2", "o3"}
    assert all(o["fuente"] == dias.FUENTE_AIRE_HIST for o in obs)
    o3 = next(o for o in obs if o["variable"] == "o3")
    # 14:00 Madrid = 12:00 UTC = h12 del dia D: nada posterior (el dia D+1 queda fuera)
    assert o3["hora"] == "2026-05-19T14:00:00+02:00"
    assert o3["valor_regla"] == 135 and o3["nivel"] == "alto" and o3["regla"] == "media8h"
    # serie de 24 h que acaba en h12 UTC: las 12 primeras horas son del dia anterior (valor 10), las 12 ultimas del dia D
    assert len(o3["serie"]) == 24 and o3["serie"][-1] == 135 and o3["serie"][0] == 10 and o3["serie"][11] == 10 and o3["serie"][12] == 135


def test_aire_sin_datos_hasta_la_fecha_lanza(csvs):
    with pytest.raises(RuntimeError):
        dias.estado_aire([csvs[0]], datetime(2026, 5, 10, 14, tzinfo=horas.MADRID) - timedelta(days=30), U)


def test_polen_ignora_el_futuro_y_toma_el_ultimo_valor_hasta_la_fecha(csvs):
    obs = dias.estado_polen(csvs[1], DIA, U)
    gram = [o for o in obs if o["variable"] == "polen_gramineas"]
    assert len(gram) == 1 and gram[0]["valor"] == 377 and gram[0]["hora"] == "2026-05-19" and gram[0]["nivel"] == "alto"
    assert not [o for o in obs if o["variable"] == "polen_olivo"]
    # el dia anterior no tiene dato mas reciente que el 18: devuelve el del 18
    assert dias.estado_polen(csvs[1], date(2026, 5, 18), U)[0]["valor"] == 300
    with pytest.raises(RuntimeError):
        dias.estado_polen(csvs[1], date(2026, 4, 1), U)


def test_viento_historico_en_utc_y_hora_de_madrid():
    def h(req):
        assert req.url.params["timezone"] == "GMT" and req.url.params["start_date"] == "2026-05-19"
        n = len(req.url.params["latitude"].split(","))
        t = int(datetime(2026, 5, 19, 12, tzinfo=UTC).timestamp())
        return httpx.Response(200, json=[{"hourly": {"time": [t - 3600, t], "wind_speed_10m": [1, 17.34], "wind_direction_10m": [0, 359.6]}}] * n)

    with cliente_mock(h) as c:
        v, ts = openmeteo.viento_historico(c, REJILLA, dias.corte(DIA))
    assert ts == "2026-05-19T14:00:00+02:00" and len(v) == len(REJILLA)
    assert v[0]["velocidad_kmh"] == 17.3 and v[0]["direccion_grados"] == 0  # 359.6 -> 360 -> 0


def test_viento_historico_sin_la_hora_lanza():
    def h(req):
        n = len(req.url.params["latitude"].split(","))
        return httpx.Response(200, json=[{"hourly": {"time": [1], "wind_speed_10m": [1], "wind_direction_10m": [1]}}] * n)

    with cliente_mock(h) as c, pytest.raises(ValueError):
        openmeteo.viento_historico(c, REJILLA, dias.corte(DIA))


def test_pronostico_historico_48h_desde_las_00_y_valida():
    with cliente_mock() as c:
        doc = openmeteo.pronostico_historico(c, LUGARES["estaciones"], DIA, U)
    ejecutar.validar_pronostico(doc)
    assert doc["modo"] == "historico" and len(doc["horas"]) == 48 and len(doc["zonas"]) == len(LUGARES["estaciones"])
    assert doc["horas"][0] == "2026-05-19T00:00:00+02:00" and doc["horas"][-1] == "2026-05-20T23:00:00+02:00"
    assert doc["fuentes"]["meteo"] == openmeteo.FUENTE_METEO_HIST
    z = doc["zonas"][0]
    assert all(len(v) == 48 for v in (*z["valores"].values(), *z["niveles"].values()))


def test_pronostico_historico_en_el_cambio_de_hora_sigue_siendo_00_a_00():
    d = date(2026, 3, 29)  # pasa de CET a CEST: ese dia tiene 23 h y las 48 h acaban a las 00:00 del 31 menos 1 h
    with cliente_mock() as c:
        doc = openmeteo.pronostico_historico(c, LUGARES["estaciones"][:3], d, U)
    assert doc["horas"][0] == "2026-03-29T00:00:00+01:00" and len(doc["horas"]) == 48


def test_pronostico_historico_si_la_api_no_cubre_lanza():
    def corto(req):
        n = len(req.url.params["latitude"].split(","))
        q = req.url.params
        ini = datetime.fromisoformat(q["start_date"]).replace(tzinfo=UTC)
        return httpx.Response(200, json=respuesta_om(n, ini, ini + timedelta(hours=10), q["hourly"].split(","), 1.0))

    with cliente_mock(corto) as c, pytest.raises(ValueError):
        openmeteo.pronostico_historico(c, LUGARES["estaciones"][:2], DIA, U)


def test_construir_estado_valida_y_es_historico(csvs):
    obs_a = dias.estado_aire([csvs[0]], dias.corte(DIA), U)
    obs_p = dias.estado_polen(csvs[1], DIA, U)
    viento = [{"lat": 40.0, "lon": -3.7, "velocidad_kmh": 10.0, "direccion_grados": 90}]
    est = dias.construir_estado(DIA, obs_a, obs_p, viento, "2026-05-19T14:00:00+02:00", LUGARES, generado=datetime(2026, 11, 16, 12, tzinfo=horas.MADRID))
    ejecutar.validar(est)
    assert est["modo"] == "historico" and est["fecha_referencia"] == "2026-05-19T14:00:00+02:00"
    assert est["capas"]["aire"]["estado"] == "ok" and est["capas"]["polen"]["ultimo_dato"] == "2026-05-19"
    getafe = next(r for r in est["riesgo"] if r["lugar"] == "est:28065014")
    assert getafe["nivel_aire"] == "alto" and getafe["nivel_polen"] == "alto" and getafe["polen_antiguedad_dias"] == 0


def test_polen_viejo_marca_capa_antigua_y_no_cuenta_en_el_riesgo(csvs):
    obs_a = dias.estado_aire([csvs[0]], dias.corte(DIA), U)
    obs_p = dias.estado_polen(csvs[1], date(2026, 5, 10), U)  # ultimo dato: 10-may -> 9 dias antes del 19
    est = dias.construir_estado(DIA, obs_a, obs_p, [], "2026-05-19T14:00:00+02:00", LUGARES)
    assert est["capas"]["polen"]["estado"] == "antiguo"
    assert next(r for r in est["riesgo"] if r["lugar"] == "est:28065014")["nivel_polen"] == "sin_dato"


def test_generar_dia_rechaza_fechas_futuras():
    with cliente_mock() as c, pytest.raises(ValueError):
        dias.generar_dia(c, date.today() + timedelta(days=1), Path("."), U, LUGARES, REJILLA)


def parchear_red(monkeypatch, tmp_path, aire_ok=True):
    """ckan.cliente -> cliente simulado; los CSV ya estan en la cache de tmp_path (sin descargas)."""
    (tmp_path / "cache").mkdir(parents=True, exist_ok=True)
    csv_aire(tmp_path / "cache" / "aire_hist_2026.csv")
    csv_polen(tmp_path / "cache" / "polen_hist_2026.csv")

    def h(req):
        host = req.url.host
        if host.startswith(("archive-api", "air-quality-api")):
            if host.startswith("archive-api") and "wind_speed_10m" in req.url.params["hourly"] and "precipitation" not in req.url.params["hourly"]:
                n = len(req.url.params["latitude"].split(","))
                t = int(datetime(2026, 5, 19, 12, tzinfo=UTC).timestamp())
                return httpx.Response(200, json=[{"hourly": {"time": [t], "wind_speed_10m": [10], "wind_direction_10m": [90]}}] * n)
            return manejador(req)
        return httpx.Response(500)

    monkeypatch.setattr(dias.ckan, "cliente", lambda: cliente_mock(h))
    if not aire_ok:
        (tmp_path / "cache" / "aire_hist_2026.csv").write_text("basura;sin;columnas\n1;2;3\n", encoding="utf-8")


def test_cli_escribe_estado_pronostico_e_indice_validos(monkeypatch, tmp_path):
    parchear_red(monkeypatch, tmp_path)
    assert dias.main(["2026-05-19", "--salida", str(tmp_path)]) == 0
    ejecutar.validar(json.loads((tmp_path / "dias/2026-05-19/estado.json").read_text()))
    ejecutar.validar_pronostico(json.loads((tmp_path / "dias/2026-05-19/pronostico.json").read_text()))
    ind = json.loads((tmp_path / "dias/indice.json").read_text())
    assert ind == [{"fecha": "2026-05-19", "titulo": "Pico de gramíneas", "nota": dias.DESTACADOS["2026-05-19"]["nota"]}]


def test_cli_aborta_sin_escribir_nada_si_una_fuente_falla(monkeypatch, tmp_path):
    parchear_red(monkeypatch, tmp_path, aire_ok=False)
    assert dias.main(["2026-05-19", "--salida", str(tmp_path)]) == 1
    assert not (tmp_path / "dias").exists()


def test_cli_fecha_invalida(tmp_path):
    assert dias.main(["19-05-2026", "--salida", str(tmp_path)]) == 2


def test_indice_mezcla_y_ordena(tmp_path):
    (tmp_path / "dias").mkdir()
    (tmp_path / "dias" / "indice.json").write_text(json.dumps([{"fecha": "2026-07-24", "titulo": "Ozono de verano", "nota": "x"}]))
    ind = dias.actualizar_indice(tmp_path, ["2026-02-26", "2026-07-24"])
    assert [e["fecha"] for e in ind] == ["2026-02-26", "2026-07-24"]
    assert ind[0]["titulo"] == "Pico de cupresáceas" and ind[1]["nota"] == dias.DESTACADOS["2026-07-24"]["nota"]
    assert dias.entrada_indice("2020-01-01")["titulo"] == "Día 2020-01-01"


def test_parsear_csv_con_filtro_de_dias_no_cambia_el_resultado_sin_filtro(csvs):
    todo, _ = aire.parsear_csv(csvs[0])
    solo, cub = aire.parsear_csv(csvs[0], {DIA})
    assert {d for _, _, d in cub} == {DIA}
    assert len(solo[("est:28065014", "o3")]) == 24 and len(todo[("est:28065014", "o3")]) == 72


def test_publicar_valida_y_lista_los_dias_congelados(monkeypatch, tmp_path):
    from alergia import publicar

    parchear_red(monkeypatch, tmp_path)
    assert dias.main(["2026-05-19", "--salida", str(tmp_path)]) == 0
    # el directorio de la rama datos tambien necesita los JSON de «ahora»: se usan los del dia como sustitutos
    for n, destino in (("estado.json", "estado_actual.json"), ("pronostico.json", "pronostico.json")):
        (tmp_path / destino).write_text((tmp_path / "dias/2026-05-19" / n).read_text())
    publicar.validar_directorio(tmp_path)
    lb = publicar.lista_blanca(tmp_path)
    assert {"dias/indice.json", "dias/2026-05-19/estado.json", "dias/2026-05-19/pronostico.json"} <= set(lb)
    assert not any(f.startswith("cache/aire_hist") for f in lb)
    # un dia que no valida bloquea toda la publicacion
    (tmp_path / "dias/2026-05-19/estado.json").write_text('{"version": 1}')
    with pytest.raises(publicar.ErrorPublicacion):
        publicar.validar_directorio(tmp_path)


def test_publicar_rechaza_un_indice_con_fechas_raras(tmp_path):
    from alergia import publicar

    (tmp_path / "dias").mkdir()
    (tmp_path / "dias/indice.json").write_text(json.dumps([{"fecha": "../../x", "titulo": "a", "nota": "b"}]))
    with pytest.raises(publicar.ErrorPublicacion):
        publicar.ficheros_dias(tmp_path)
    assert publicar.ficheros_dias(tmp_path / "no_existe") == []
