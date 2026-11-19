"""Comprobaciones sobre `public/donde/` ya generado (criterios de aceptacion de D2 y D3). Se saltan si no esta generado:
   uv run --project pipeline python -m donde.construir --salida public/donde"""
import json
import re
from pathlib import Path

import pytest

PUBLICO = Path(__file__).resolve().parents[2] / "public" / "donde"
pytestmark = pytest.mark.skipif(not (PUBLICO / "secciones.json").exists(), reason="public/donde no generado")
SERVICIOS = ["centro_salud", "hospital", "residencia", "farmacia", "colegio", "dea"]


def cargar(ruta):
    return json.loads((PUBLICO / ruta).read_text(encoding="utf-8"))


def test_secciones_cifras_del_censo_2025():
    s = cargar("secciones.json")
    n = len(s["ids"])
    assert n == 4518 and len(set(s["ids"])) == n
    assert sum(s["pob"]["total"]) == pytest.approx(7_113_886, rel=0.005)
    assert sum(s["pob"]["65_mas"]) == pytest.approx(1_342_648, rel=0.01)
    assert sum(s["pob"]["0_14"]) == pytest.approx(943_976, rel=0.005)
    for col in ("mun", "distrito", "zona", "lat", "lon", "area_km2"):
        assert len(s[col]) == n
    for k, arr in s["pob"].items():
        assert len(arr) == n and min(arr) >= 0, k
    assert all(39.8 < la < 41.2 and -4.6 < lo < -3.0 for la, lo in zip(s["lat"], s["lon"]))
    assert (PUBLICO / "secciones.json").stat().st_size < 600_000
    assert sum(1 for d in s["distrito"] if d) == sum(1 for m in s["mun"] if m == "mun:28079")


def test_geojson_menor_de_3mb_y_casa_con_secciones():
    assert (PUBLICO / "secciones.geojson").stat().st_size < 3_000_000
    g = cargar("secciones.geojson")
    assert [f["properties"]["id"] for f in g["features"]] == cargar("secciones.json")["ids"]


def test_territorios():
    t = cargar("territorios.json")
    assert len(t["municipios"]) == 179 and len(t["distritos"]) == 21 and len(t["zonas"]) == 11
    parla = next(m for m in t["municipios"] if m["nombre"] == "Parla")
    assert parla["zona"] == "04"
    assert sum(m["poblacion"] for m in t["municipios"]) == pytest.approx(7_113_886, rel=0.005)
    assert next(d for d in t["distritos"] if d["id"] == "dis:2807901")["nombre"] == "Centro"
    assert len(t["municipios_geo"]["features"]) == 179 and len(t["distritos_geo"]["features"]) == 21


def test_recuentos_de_servicios():
    s = {k: cargar(f"servicios/{k}.json") for k in SERVICIOS}
    otros = cargar("servicios/otros_sociales.json")
    n = {k: len(v["ids"]) for k, v in s.items()}
    assert n["centro_salud"] + s["centro_salud"]["descartados_sin_coordenadas"] == 429
    assert n["hospital"] == 25
    assert n["residencia"] + s["residencia"]["descartados_sin_coordenadas"] == 518
    assert s["residencia"]["descartados_sin_coordenadas"] <= 18
    assert sum(p or 0 for p in s["residencia"]["plazas"]) + s["residencia"]["plazas_descartadas_sin_coordenadas"] == pytest.approx(57_890, rel=0.01)
    assert 2954 <= n["farmacia"] + s["farmacia"]["descartados_sin_coordenadas"] <= 2958 + 4
    # 13.680 DEA en el registro; los puntos con mas de 30 se agrupan en un registro (R1, ver test_dea_apilados...)
    assert sum(s["dea"]["equipos"]) + s["dea"]["descartados_sin_coordenadas"] == 13_680
    assert n["dea"] == 10_551
    assert len(otros["ids"]) > 1000
    # ids opacos: el numero de registro permitiria buscar en el CKAN la direccion de los centros generalizados (T3, F-4)
    assert all(re.fullmatch(r"s\d{4}", i) for i in otros["ids"])
    for k, v in {**s, "otros_sociales": otros}.items():
        assert v["descartados_fuera_comunidad"] == 0, k
        assert all(39.8 < la < 41.2 and -4.6 < lo < -3.0 for la, lo in zip(v["lat"], v["lon"])), k
        assert len(v["ids"]) == len(set(v["ids"])), k


def test_centros_de_dia_ya_no_son_servicio_pero_cuentan_en_otros_sociales():
    """18-nov: el registro da ~5 plazas de «centro de dia» por 100 mayores frente a 1,22 (Madrid) / 1,06 (Espana) del IMSERSO.
    Causa: 230 de los 553 centros (54.999 de 71.990 plazas) son «HOGARES Y CLUBES» (clubes de mayores)."""
    assert not (PUBLICO / "servicios" / "centro_dia.json").exists()
    o = cargar("servicios/otros_sociales.json")
    n = len(o["ids"])
    assert all(len(o[k]) == n for k in ("sector", "tipo", "subtipo", "plazas"))
    mayores_dia = [i for i in range(n) if o["sector"][i] == "Personas mayores" and o["tipo"][i] == "CENTROS DE DÍA"]
    assert len(mayores_dia) == 523                      # 553 en el registro, 30 sin coordenadas
    assert sum(o["sector"][i] == "Personas mayores" for i in range(n)) == 524  # + 1 centro de rehabilitacion
    assert sum(o["plazas"][i] or 0 for i in mayores_dia) == 66_846
    assert {o["subtipo"][i] for i in mayores_dia} == {"CENTROS DE DÍA: OTROS", "HOGARES Y CLUBES"}
    otros = [i for i in mayores_dia if o["subtipo"][i] == "CENTROS DE DÍA: OTROS"]
    assert sum(o["plazas"][i] or 0 for i in otros) < 17_000   # unas 16.991 con las sin coordenadas: casa con el IMSERSO (16.393)
    assert n == 1875 and o["descartados_sin_coordenadas"] == 240  # 210 de antes + 30 de dia


def test_colegios_incluyen_eso_sin_duplicados():
    c = cargar("servicios/colegio.json")
    assert len(c["ids"]) == len(set(c["ids"])) == 1620      # 1.264 de Infantil/Primaria + 356 de solo ESO/Bachillerato
    assert set(c["titularidad"]) == {"publica", "concertada"}
    assert c["titularidad"].count("publica") == 1158 and c["titularidad"].count("concertada") == 462
    assert c["descartados_sin_coordenadas"] == 0


def test_ninguna_columna_personal_en_public_donde():
    prohibidas = re.compile(r'"(titulares?\w*|contacto_\w+|entidad_\w+|nif\w*|telefono\w*|correo\w*|e_mail\w*|email\w*)"\s*:', re.I)
    arroba = re.compile(r"[\w.]+@[\w.]+\.\w+")
    for ruta in PUBLICO.rglob("*.json"):
        texto = ruta.read_text(encoding="utf-8")
        assert not prohibidas.search(texto), ruta.name
        assert not arroba.search(texto), ruta.name


SENSIBLES = ("CENTROS DE MUJERES MALTRATADAS", "CENTROS DE ACOGIDA DE MENORES", "PISOS TUTELADOS", "VIVIENDAS COMUNITARIAS")


def test_otros_sociales_sin_nombres_y_sensibles_con_punto_de_seccion():
    """R1: sin nombres; los centros sensibles salen con el punto interior de su seccion censal (municipio y distrito exactos)."""
    o = cargar("servicios/otros_sociales.json")
    assert "nombres" not in o
    texto = json.dumps(o, ensure_ascii=False)
    assert "MARIA PINEDA" not in texto and "MENAS" not in texto
    s = cargar("secciones.json")
    puntos = {(round(la, 5), round(lo, 5)): (m, d) for la, lo, m, d in zip(s["lat"], s["lon"], s["mun"], s["distrito"])}
    n = len(o["ids"])
    assert o["ubicacion_generalizada"] == 1067 and o["ubicacion_generalizada_nota"]
    sensibles = [i for i in range(n) if o["subtipo"][i] in SENSIBLES or o["tipo"][i] == "CENTROS DE ACOGIDA"
                 or o["sector"][i] in ("Mujer", "Presos y ex reclusos", "Refugiados y asilados", "Personas sin hogar")]
    assert len(sensibles) > 700
    for i in sensibles:
        assert (o["lat"][i], o["lon"][i]) in puntos, o["ids"][i]          # es exactamente el punto interior de una seccion
        assert puntos[(o["lat"][i], o["lon"][i])][0] == o["mun"][i]       # y su municipio es el del centro
    # los centros de dia de mayores (no sensibles) conservan su ubicacion: la mayoria NO cae en un punto de seccion
    mayores = [i for i in range(n) if o["sector"][i] == "Personas mayores" and o["tipo"][i] == "CENTROS DE DÍA"]
    assert sum((o["lat"][i], o["lon"][i]) in puntos for i in mayores) < 0.2 * len(mayores)


def test_dea_apilados_agrupados_y_declarados():
    d = cargar("servicios/dea.json")
    a = d["dea_apilados"]
    assert a["umbral"] == 30 and a["registros_antes"] == 13_680 and a["registros_despues"] == len(d["ids"])
    assert a["puntos_agrupados"] == len(a["grupos"]) == 6 and a["equipos_agrupados"] == 3135
    assert len(d["equipos"]) == len(d["ids"]) and sum(d["equipos"]) == 13_680
    from collections import Counter
    c = Counter(zip(d["lat"], d["lon"]))
    assert max(c.values()) == 1 or max(c.values()) <= 30               # ya no hay mas de 30 registros en un punto
    assert max(d["equipos"]) == 2200 and sum(1 for e in d["equipos"] if e > 30) == 6
    retiro = (40.40012, -3.67523)
    i = [j for j in range(len(d["ids"])) if (d["lat"][j], d["lon"][j]) == retiro]
    assert len(i) == 1 and d["equipos"][i[0]] == 2200
