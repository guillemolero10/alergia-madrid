"""Tests de D4: `donde.referencia` (cifras de referencia para el motor de TypeScript).
Los de datos reales se saltan si `public/donde` no esta generado."""
import json
import math
from pathlib import Path

import numpy as np
import pytest

from donde import referencia as ref

PUBLICO = Path(__file__).resolve().parents[2] / "public" / "donde"
REF_JSON = Path(__file__).resolve().parents[1] / "donde" / "referencia.json"
hay_datos = (PUBLICO / "secciones.json").exists()
necesita_datos = pytest.mark.skipif(not hay_datos, reason="public/donde no generado")


@pytest.fixture(scope="module")
def datos():
    return ref.cargar_datos(PUBLICO)


@pytest.fixture(scope="module")
def r(datos):
    return ref.calcular(datos)


# ---------------------------------------------------------------- sinteticos (valores calculados a mano)
def test_proyeccion_valores_conocidos():
    x, y = ref.proyectar(40.42, 0.0)
    assert float(x) == 0.0 and float(y) == pytest.approx(6371008.8 * math.radians(40.42))
    x, y = ref.proyectar(40.42, 1.0)  # 1 grado de longitud a la latitud de referencia
    assert float(x) == pytest.approx(6371008.8 * math.radians(1) * math.cos(math.radians(40.42)))


def test_proyeccion_error_menor_del_1_por_ciento_frente_a_haversine():
    """Pares repartidos por la Comunidad (dentro de 80 km): el error relativo de la proyeccion local es < 1 %."""
    rng = np.random.default_rng(1)
    la = rng.uniform(39.9, 41.1, 300)
    lo = rng.uniform(-4.5, -3.1, 300)
    for i in range(0, 300, 2):
        h = ref.haversine(la[i], lo[i], la[i + 1], lo[i + 1])
        x, y = ref.proyectar([la[i], la[i + 1]], [lo[i], lo[i + 1]])
        p = math.hypot(x[1] - x[0], y[1] - y[0])
        assert abs(p - h) / h < 0.01


def test_distancia_y_deficit_en_un_caso_pequeno():
    xs = np.array([0.0, 1000.0, 2500.0, 5000.0])
    ys = np.zeros(4)
    dmin = ref.distancia_al_mas_cercano(xs, ys, np.array([0.0]), np.array([0.0]))
    assert dmin.tolist() == [0.0, 1000.0, 2500.0, 5000.0]
    assert ref.deficit_distancia(dmin, 1000.0).tolist() == [False, False, True, True]  # estrictamente mayor
    pob = np.array([10.0, 20.0, 30.0, 40.0])
    g, m = ref.ganan_distancia(dmin, pob, xs, ys, (4000.0, 0.0), 1500.0)  # centro nuevo en x = 4000, radio 1500
    assert m.tolist() == [False, False, True, True] and g == 70.0


def test_sfca_a_mano_y_media_ponderada():
    """3 secciones en linea (0, 4, 8 km), un centro de 30 plazas en x = 4 km, d0 = 5 km, mayores 10/20/30."""
    xs = np.array([0.0, 4000.0, 8000.0])
    ys = np.zeros(3)
    mayores = np.array([10.0, 20.0, 30.0])
    A, rr = ref.sfca(xs, ys, mayores, np.array([4000.0]), np.array([0.0]), np.array([30.0]), 5000.0)
    assert rr.tolist() == [pytest.approx(30 / 60)]            # las 3 estan a <= 5 km: 10 + 20 + 30 = 60
    assert A.tolist() == [pytest.approx(50.0)] * 3
    assert ref.umbral_media(A, mayores) == pytest.approx(50.0)
    # un centro lejano (x = 100 km) no cubre a nadie: r = 0 y no hay division por cero
    A0, r0 = ref.sfca(xs, ys, mayores, np.array([1e5]), np.array([0.0]), np.array([30.0]), 5000.0)
    assert r0.tolist() == [0.0] and A0.tolist() == [0.0] * 3
    # el borde d0 es inclusivo
    A1, _ = ref.sfca(xs, ys, mayores, np.array([5000.0]), np.array([0.0]), np.array([30.0]), 1000.0)
    assert A1.tolist() == [0.0, pytest.approx(150.0), 0.0]    # la de 4 km esta justo a 1000 m: entra; 30 plazas / 20 mayores
    A2, _ = ref.sfca(xs, ys, mayores, np.array([4000.0]), np.array([0.0]), np.array([30.0]), 4000.0)
    assert A2.tolist() == [pytest.approx(50.0)] * 3           # 4000 m exactos: entran las tres (60 mayores)
    A3, _ = ref.sfca(xs, ys, mayores, np.array([4000.0]), np.array([0.0]), np.array([30.0]), 3999.0)
    assert A3.tolist() == [0.0, pytest.approx(150.0), 0.0]    # a 3999 m solo la propia: 30 plazas / 20 mayores


def test_plazas_faltan_y_reduce_faltan_a_mano():
    """Secciones en 0, 10, 20 km, mayores 10/20/30, sin centros (A = 0) y umbral U = 100 plazas por 100 mayores.
    F antes = 100 * 60 / 100 = 60 plazas. Un centro de 50 plazas, d0 = 10 km:
    - en x = 10 km cubre 60 mayores -> r = 50/60 -> A' = 83,3 < U -> F despues = 10 -> N = 50 (= plazas: ninguna se «desperdicia»);
    - en x = 20 km cubre 50 mayores (secciones de 10 y 20 km) -> r = 1 -> A' = 100 = U -> N = 50;
    - en x = 0 cubre 30 mayores -> A' = 166,7 > U: se pasa del umbral -> N = 30 < 50 plazas."""
    xs = np.array([0.0, 10000.0, 20000.0])
    ys = np.zeros(3)
    may = np.array([10.0, 20.0, 30.0])
    A = np.zeros(3)
    assert ref.plazas_faltan(A, 100.0, may) == pytest.approx(60.0)
    assert ref.plazas_faltan(np.array([150.0, 50.0, 100.0]), 100.0, may) == pytest.approx(10.0)  # solo la de 10 km: 20 * 50 / 100
    n, mejoran, r = ref.reduce_faltan(A, 100.0, may, xs, ys, (10000.0, 0.0), 50.0, 10000.0)
    assert n == pytest.approx(50.0) and mejoran == 3 and r == pytest.approx(50 / 60)
    assert ref.reduce_faltan(A, 100.0, may, xs, ys, (20000.0, 0.0), 50.0, 10000.0)[0] == pytest.approx(50.0)
    assert ref.reduce_faltan(A, 100.0, may, xs, ys, (0.0, 0.0), 50.0, 10000.0)[0] == pytest.approx(30.0)
    # N es la diferencia de los totales F(antes) - F(despues)
    r0, cerca = ref.r_nuevo(xs, ys, may, (10000.0, 0.0), 50.0, 10000.0)
    assert ref.plazas_faltan(A, 100.0, may) - ref.plazas_faltan(A + 100 * r0 * cerca, 100.0, may) == pytest.approx(50.0)
    # con plazas = 0 no se reduce nada; si nadie esta en deficit (U = 0) tampoco
    assert ref.reduce_faltan(A, 100.0, may, xs, ys, (10000.0, 0.0), 0.0, 10000.0)[0] == 0.0
    assert ref.reduce_faltan(A, 0.0, may, xs, ys, (10000.0, 0.0), 50.0, 10000.0)[0] == 0.0
    # ranking: N empata (50) en x = 10 y x = 20 km; gana el de mas «faltan local» (60 frente a 50); despues x = 0 (N = 30)
    res = ref.ranking_candidatos(A, 100.0, may, xs, ys, 50.0, 10000.0, [0, 1, 2])
    assert [(round(g, 6), k, round(loc, 6)) for g, k, loc in res] == [(50.0, 1, 60.0), (50.0, 2, 50.0), (30.0, 0, 30.0)]
    # empate total (misma N, mismo faltan local): gana el indice menor
    iguales = ref.ranking_candidatos(np.zeros(2), 100.0, np.array([5.0, 5.0]), np.array([0.0, 10.0]), np.zeros(2), 5.0, 1e9, [1, 0])
    assert [k for _, k, _ in iguales] == [0, 1]


def test_n_nunca_supera_las_plazas_del_centro_nuevo():
    """Propiedad (2SFCA): cada seccion cubierta baja como mucho objetivo * r_nuevo; sumadas son `plazas`. Se prueba al azar."""
    rng = np.random.default_rng(7)
    for _ in range(40):
        n = int(rng.integers(3, 60))
        xs, ys = rng.uniform(0, 30000, n), rng.uniform(0, 30000, n)
        obj = rng.integers(0, 400, n).astype(float)
        xc, yc = rng.uniform(0, 30000, 5), rng.uniform(0, 30000, 5)
        A, _ = ref.sfca(xs, ys, obj, xc, yc, rng.integers(10, 150, 5).astype(float), 8000.0)
        u = float(rng.uniform(0, 12))
        plazas = float(rng.integers(1, 200))
        d0 = float(rng.choice([1000.0, 5000.0, 10000.0]))
        for k in range(n):
            g, _, _ = ref.reduce_faltan(A, u, obj, xs, ys, (xs[k], ys[k]), plazas, d0)
            assert -1e-9 <= g <= plazas + 1e-9


def test_optimo_voraz_n_pasos_no_repite_y_acumula():
    """d0 = 1 km y secciones a 10 km: cada centro de 20 plazas solo cubre su seccion (U = 100, A = 0, mayores 10/20/30/40).
    N = 10 (seccion 0: se pasa del umbral), 20, 20, 20 (la de 30 queda a 66,7 y la de 40 a 50). Empate en N entre 1, 2 y 3:
    gana la que mas falta (40 > 30 > 20), y no se repite ninguna."""
    xs = np.array([0.0, 10000.0, 20000.0, 30000.0])
    ys = np.zeros(4)
    may = np.array([10.0, 20.0, 30.0, 40.0])
    A = np.zeros(4)
    pasos = ref.optimo_voraz(A, 100.0, may, xs, ys, 20.0, 1000.0, [0, 1, 2, 3], 3)
    assert [(round(g, 6), k, round(a, 6)) for g, k, a in pasos] == [(20.0, 3, 20.0), (20.0, 2, 40.0), (20.0, 1, 60.0)]
    # si ya nadie esta en deficit, no hay pasos
    assert ref.optimo_voraz(np.full(4, 500.0), 100.0, may, xs, ys, 20.0, 1000.0, [0, 1, 2, 3], 3) == []
    # n mayor que los candidatos utiles: se detiene sin repetir
    assert len(ref.optimo_voraz(A, 100.0, may, xs, ys, 20.0, 1000.0, [0, 1], 3)) == 2


def test_ranking_desempates_y_filtro():
    claves = ["a", "a", "b", "c", None]
    deficit = [True, False, True, True, True]
    obj = [10.0, 10.0, 5.0, 5.0, 99.0]
    nom = {"a": "A", "b": "B", "c": "C"}
    por_pct = ref.ranking(claves, deficit, obj, nom, "pct", 5)
    assert [f["lugar"] for f in por_pct] == ["b", "c", "a"]       # b y c 100 % (empate por personas y por id); a 50 %
    por_per = ref.ranking(claves, deficit, obj, nom, "personas", 5)
    assert [f["lugar"] for f in por_per] == ["a", "b", "c"]
    assert [f["lugar"] for f in ref.ranking(claves, deficit, obj, nom, "pct", 1, filtro=lambda c: c != "b")] == ["c"]


# ---------------------------------------------------------------- datos reales
@necesita_datos
def test_caso4_cae_en_un_municipio_de_la_zona_04(r, datos):
    """Criterio de aceptacion de D4."""
    c4 = r["caso4"]
    zona = {m["id"]: m["zona"] for m in datos["territorios"]["municipios"]}
    assert c4["municipio"] in zona and zona[c4["municipio"]] == "04"
    assert c4["zona"] == "04" and c4["zona_candidatos"] == "04" and c4["reduce_faltan"] > 0
    assert 39.8 < c4["lat"] < 41.2 and -4.6 < c4["lon"] < -3.0
    assert c4["faltan_despues"] == pytest.approx(c4["faltan_antes"] - c4["reduce_faltan"], abs=1e-3)


@necesita_datos
def test_caso4_es_el_maximo_sobre_los_candidatos(r, datos):
    """Fuerza bruta distinta del optimizador: N de cada candidato como diferencia de los totales F(antes) - F(despues)."""
    sec = datos["secciones"]
    xs, ys = ref.proyectar(sec["lat"], sec["lon"])
    may = np.asarray(sec["pob"]["65_mas"], float)
    zona = {m["id"]: m["zona"] for m in datos["territorios"]["municipios"]}
    re_ = datos["servicios"]["residencia"]
    xr, yr = ref.proyectar(re_["lat"], re_["lon"])
    pl = np.asarray([0 if v is None else v for v in re_["plazas"]], float)
    A, _ = ref.sfca(xs, ys, may, xr, yr, pl, ref.CASO3_D0_M)
    um = ref.umbral_media(A, may)
    f0 = ref.plazas_faltan(A, um, may)
    cand = [i for i in range(len(xs)) if may[i] > 0 and zona[sec["mun"][i]] == "04"]

    def n_de(k):
        rn, cerca = ref.r_nuevo(xs, ys, may, (xs[k], ys[k]), 94.0, ref.CASO3_D0_M)
        return f0 - ref.plazas_faltan(A + np.where(cerca, 100 * rn, 0.0), um, may)

    ns = [n_de(i) for i in cand]
    assert max(ns) == pytest.approx(r["caso4"]["reduce_faltan"], abs=1e-5)
    assert n_de(sec["ids"].index(r["caso4"]["seccion"])) == pytest.approx(r["caso4"]["reduce_faltan"], abs=1e-5)
    assert len(cand) == r["caso4"]["candidatos"]
    assert f0 == pytest.approx(r["caso4"]["faltan_antes"], abs=1e-3)
    # las alternativas no mejoran al optimo; el optimo de la Comunidad entera tampoco es peor que el de la zona
    assert all(a["reduce_faltan"] <= r["caso4"]["reduce_faltan"] + 1e-9 for a in r["caso4"]["alternativas"])
    assert r["caso4b"]["reduce_faltan"] >= r["caso4"]["reduce_faltan"] and r["caso4b"]["candidatos"] == len(xs)


@necesita_datos
def test_n_menor_o_igual_que_las_plazas_en_todas_las_secciones_y_referencias(datos):
    """Comprobacion con los datos reales: para CADA seccion como punto, para varios tamanos y para las 4 referencias, 0 <= N <= plazas."""
    sec = datos["secciones"]
    xs, ys = ref.proyectar(sec["lat"], sec["lon"])
    may = np.asarray(sec["pob"]["65_mas"], float)
    re_ = datos["servicios"]["residencia"]
    xr, yr = ref.proyectar(re_["lat"], re_["lon"])
    pl = np.asarray([0 if v is None else v for v in re_["plazas"]], float)
    A, _ = ref.sfca(xs, ys, may, xr, yr, pl, ref.CASO3_D0_M)
    umbrales = [ref.umbral_media(A, may), ref.mediana_ponderada(A, may), 4.05, 4.21]
    for u in umbrales:
        for plazas in (25.0, 94.0, 200.0):
            ns = [ref.reduce_faltan(A, u, may, xs, ys, (xs[k], ys[k]), plazas, ref.CASO3_D0_M)[0] for k in range(0, len(xs), 7)]
            assert min(ns) >= -1e-9 and max(ns) <= plazas + 1e-6


@necesita_datos
def test_caso7_voraz_n3(r):
    for z in ("zona_04", "comunidad"):
        pasos = r["caso7"][z]
        assert len(pasos) == 3 and len({p["seccion"] for p in pasos}) == 3
        assert pasos[-1]["acumulado"] == pytest.approx(sum(p["reduce_faltan"] for p in pasos), abs=1e-5)
        assert all(0 < p["reduce_faltan"] <= 94 + 1e-9 for p in pasos)
    assert r["caso7"]["zona_04"][0]["seccion"] == r["caso4"]["seccion"]
    assert r["caso7"]["comunidad"][0]["seccion"] == r["caso4b"]["seccion"]


@necesita_datos
def test_caso3_la_media_ponderada_es_plazas_entre_mayores(r):
    """Propiedad del 2SFCA: sum(P_i A_i) / sum(P_i) = 100 * plazas / poblacion objetivo."""
    c3 = r["caso3"]
    assert c3["umbral_plazas_por_100_mayores"] == pytest.approx(c3["plazas_por_100_mayores_comunidad_simple"], rel=1e-6)
    assert c3["plazas_totales"] == 55195 and c3["centros"] == 500
    # la cifra «faltan N plazas» que enseña la web (media / IMSERSO Espana / IMSERSO Madrid)
    f = c3["plazas_faltan"]
    assert f["media"] == pytest.approx(10_688.8, abs=0.1) and f["imserso_espana"] == pytest.approx(10_048.1, abs=0.1)
    assert f["imserso_madrid"] == pytest.approx(11_737.2, abs=0.1)
    assert c3["umbrales"]["imserso_espana"] == 4.05 and c3["umbrales"]["imserso_madrid"] == 4.21
    assert 0 < c3["personas"] < c3["mayores_total"] and c3["A_min"] >= 0


@necesita_datos
def test_casos_1_y_2_cifras_coherentes(r):
    for c in (r["caso1"], r["caso2"]):
        assert 0 < c["personas"] < c["poblacion_total"]
        assert c["pct"] == pytest.approx(100 * c["personas"] / c["poblacion_total"], abs=0.001)
        s = c["sensibilidad_personas"]
        radios = sorted(s)  # radio_x0.99 (mas deficit) y radio_x1.01 (menos)
        assert s["radio_x1.01"] <= c["personas"] <= s["radio_x0.99"], radios
    assert r["caso1"]["centros"] == 421 and r["caso2"]["centros"] == 2954


@necesita_datos
def test_caso5_centro_de_salud_en_punto_fijo(r):
    c5 = r["caso5"]
    assert c5["centro_salud"]["ganan"] > 0
    assert c5["centro_salud"]["deficit_despues"] == r["caso1"]["personas"] - c5["centro_salud"]["ganan"]
    res = c5["residencia"]
    assert 0 < res["reduce_faltan"] <= res["plazas"] == 94
    assert res["faltan_despues"] == pytest.approx(r["caso3"]["plazas_faltan"]["media"] - res["reduce_faltan"], abs=1e-3)
    assert res["reduce_faltan"] <= r["caso4"]["reduce_faltan"] + 1e-9   # un punto cualquiera de la zona no supera al optimo de la zona
    assert res["pct_del_optimo_zona_04"] == pytest.approx(100 * res["reduce_faltan"] / r["caso4"]["reduce_faltan"], abs=1e-3)
    assert set(res["por_referencia"]) == {"media", "mediana", "imserso_espana", "imserso_madrid"}


@necesita_datos
def test_caso6_ranking(r, datos):
    c6 = r["caso6"]
    for clave in ("por_pct", "por_personas", "zona_04_por_personas"):
        filas = c6[clave]
        assert len(filas) == 5 and len({f["lugar"] for f in filas}) == 5
        assert all(0 <= f["en_deficit"] <= f["objetivo"] for f in filas)
    pct = [f["pct"] for f in c6["por_pct"]]
    assert pct == sorted(pct, reverse=True)
    per = [f["en_deficit"] for f in c6["por_personas"]]
    assert per == sorted(per, reverse=True)
    zona = {m["id"]: m["zona"] for m in datos["territorios"]["municipios"]}
    assert all(zona[f["lugar"]] == "04" for f in c6["zona_04_por_personas"])
    for clave in ("por_plazas_faltan", "zona_04_por_plazas_faltan"):
        v = [f["plazas_faltan"] for f in c6[clave]]
        assert len(v) == 5 and v == sorted(v, reverse=True)
    assert all(zona[f["lugar"]] == "04" for f in c6["zona_04_por_plazas_faltan"])


@necesita_datos
def test_referencia_json_coincide_con_el_codigo(r):
    """El fichero versionado debe ser el que genera el codigo con los datos actuales (si no: reejecutar `donde.referencia`)."""
    assert REF_JSON.exists()
    escrito = json.loads(REF_JSON.read_text(encoding="utf-8"))
    assert escrito == json.loads(json.dumps(r, ensure_ascii=False))
