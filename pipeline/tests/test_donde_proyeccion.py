"""D7: «Madrid en 2030» (proyeccion por seccion, calibracion a la proyeccion oficial y backtest)."""
import hashlib
import json
from pathlib import Path

import numpy as np
import pytest

from donde import comun, proyeccion as P

DATOS = Path(__file__).parent / "datos"
RAIZ = Path(__file__).resolve().parents[2]
PUBLICO = RAIZ / "public" / "donde"
SERIE = comun.INTERMEDIOS / "poblacion_serie_2021_2025.npz"
OFICIAL = DATOS / "proyecciones_oficial.csv"  # copia de proyecciones_poblacion_por_sexo (CKAN, 24-06-2026)


@pytest.fixture(scope="module")
def oficial():
    return P.leer_oficial(OFICIAL)


def sintetica(n_sec=60, seed=3):
    """Serie 2021-2025 inventada: cohortes que envejecen un ano mas ruido de migracion. Municipios 28001, 28002 y 28003."""
    rng = np.random.default_rng(seed)
    ids = [f"28{m:03d}{d:02d}{s:03d}" for m in (1, 2, 3) for d in (1, 2) for s in range(1, n_sec // 6 + 1)]
    perfil = np.linspace(1.0, 0.2, 21)
    base = rng.integers(20, 200, size=(len(ids), 1)) * perfil[None, :] * rng.uniform(0.8, 1.2, size=(len(ids), 21))
    m = np.zeros((len(ids), 5, 21))
    m[:, 0] = np.round(base)
    for a in range(1, 5):
        m[:, a] = np.round(P.envejecer(m[:, a - 1], 1) * rng.uniform(0.98, 1.04, size=(len(ids), 21)))
    return {"ids": ids, "anios": [2021, 2022, 2023, 2024, 2025], "matriz": m}


def test_tramo_oficial():
    assert P.tramo_oficial("Proyecciones de población de personas de 0 a 4 años") == 0
    assert P.tramo_oficial("Proyecciones de población de personas de 5 a 9 años") == 1
    assert P.tramo_oficial("Proyecciones de población de personas de 95 a  99 años") == 19  # doble espacio de la fuente
    assert P.tramo_oficial("Proyecciones de población de personas de 100 años y más") == 20
    assert P.tramo_oficial("Total proyecciones de población") is None


def test_leer_oficial_2030(oficial):
    assert sorted(oficial) == list(range(2026, 2042))
    d = oficial[2030]
    assert d["total"] == 7_582_868 and int(d["tramos"].sum()) == 7_582_867  # el INE publica un total que difiere en 1 de la suma
    assert int(d["tramos"][13:].sum()) == 1_531_180  # 65 o mas
    assert int(d["tramos"][15:].sum()) == 758_334  # 75 o mas
    for y, v in oficial.items():
        assert (v["tramos"] > 0).all() and abs(int(v["tramos"].sum()) - v["total"]) <= 5, y  # redondeo del INE


def test_leer_oficial_falla_si_faltan_tramos(tmp_path):
    lineas = OFICIAL.read_text(encoding="utf-8-sig").splitlines()
    malo = tmp_path / "p.csv"
    malo.write_text("\n".join(l for l in lineas if not ("2030;" in l and "de 25 a 29" in l and ";Total;" in l)), encoding="utf-8")
    with pytest.raises(ValueError, match="faltan"):
        P.leer_oficial(malo)


def test_envejecer_h5_desplaza_cada_tramo():
    base = np.arange(1, 22, dtype=float)[None, :] * np.array([[10.0]])
    x = P.envejecer(base, 5)
    assert np.allclose(x[0, 1:20], base[0, 0:19])  # el tramo t pasa entero al t+1
    assert x[0, 0] == pytest.approx(base[0, 0])  # nacimientos de 5 anos = 5 * (0-4 / 5)
    assert x[0, 20] == pytest.approx(base[0, 20] + base[0, 19])  # 100+ es abierto
    assert np.allclose(P.envejecer(base, 0), base)
    with pytest.raises(ValueError):
        P.envejecer(base, 6)


def test_calibrar_y_redondeo_cuadran_exactamente():
    rng = np.random.default_rng(0)
    x = rng.uniform(0, 100, size=(50, 21))
    obj = rng.integers(2000, 3000, size=21)
    y = P.calibrar(x, obj.astype(float))
    assert np.allclose(y.sum(axis=0), obj)
    r = P.redondear_a_objetivo(y, obj)
    assert (r.sum(axis=0) == obj).all() and (r >= 0).all() and np.abs(r - y).max() < 1.0 + 1e-9
    with pytest.raises(ValueError):
        P.calibrar(np.zeros((3, 21)), obj.astype(float))
    with pytest.raises(ValueError):
        P.redondear_a_objetivo(np.zeros((2, 21)), np.full(21, 10))  # 10 personas en 2 secciones: imposible cuadrar con +1 maximo


def test_proyectar_con_y_sin_tendencia_cuadra():
    s = sintetica()
    ids, b = s["ids"], s["matriz"][:, 4]
    obj = b.sum(axis=0) * 1.05
    assert np.allclose(P.proyectar(b, 5, obj).sum(axis=0), obj)
    mult = P.multiplicador_tendencia(s["matriz"][:, 0], ids, b, ids, 4, 5, b.sum(axis=0), 0.5, 0.5, ids)
    assert mult.shape == (len(ids),) and (mult >= 0.5).all() and (mult <= 2.0).all()
    y = P.proyectar(b, 5, obj, mult)
    assert np.allclose(y.sum(axis=0), obj) and (y >= 0).all()


def test_metricas():
    m = P._metricas(np.array([110.0, 90.0, 50.0]), np.array([100.0, 100.0, 100.0]))
    assert m["wape"] == pytest.approx(70 / 300) and m["mediana"] == pytest.approx(0.10) and m["sesgo"] == pytest.approx(-50 / 300)


def test_backtest_sintetico_reproducible_y_gana_en_mayores():
    s = sintetica()
    a = P.backtest(s)
    b = P.backtest(s)
    assert json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)  # mismo codigo, mismo resultado
    m, hoy = a["principal"]["modelo"], a["principal"]["igual_que_hoy"]
    assert m["municipio"]["65_mas"]["wape"] < hoy["municipio"]["65_mas"]["wape"]
    assert m["n_secciones_comparables"] == len(s["ids"])
    assert set(a) == {"principal", "horizonte", "tendencia", "sensibilidad"} and set(a["horizonte"]) == {"1", "2", "3", "4"}


def test_backtest_prediccion_invalida_falla():
    s = sintetica()
    with pytest.raises(ValueError, match="NaN"):
        P.evaluar_escenario(s, 2021, 2025, lambda serie, a0, b0, *r: np.full_like(b0, np.nan))


# -- Con los datos reales (se saltan si no estan generados: uv run --project pipeline python -m donde.construir --salida public/donde)
real = pytest.mark.skipif(not (SERIE.exists() and (PUBLICO / "secciones_2030.json").exists()), reason="D7 no generado")


@real
def test_2030_cuadra_con_la_oficial(oficial):
    serie = P.cargar_serie(SERIE)
    res = P.proyectar_2030(serie, oficial)
    P.comprobar(res, oficial)
    assert len(res["ids"]) == 4518 and np.isfinite(res["real"]).all() and (res["tramos"] >= 0).all()
    assert (res["tramos"].sum(axis=0) == oficial[2030]["tramos"]).all()


@real
def test_secciones_2030_json(oficial):
    d = json.loads((PUBLICO / "secciones_2030.json").read_text(encoding="utf-8"))
    s = json.loads((PUBLICO / "secciones.json").read_text(encoding="utf-8"))
    assert d["n"] == 4518 == len(s["ids"]) and d["anio"] == 2030 and d["anio_base"] == 2025
    assert d["ids_sha1"] == hashlib.sha1("\n".join(s["ids"]).encode()).hexdigest()  # mismo orden de secciones
    assert set(d["pob"]) == set(s["pob"]) == {"total", "0_14", "3_16", "65_mas", "75_mas"}
    for k, v in d["pob"].items():
        assert len(v) == 4518 and min(v) >= 0 and all(isinstance(x, int) for x in v), k
    t = oficial[2030]["tramos"]
    assert sum(d["pob"]["total"]) == int(t.sum()) == 7_582_867
    assert sum(d["pob"]["0_14"]) == int(t[:3].sum())
    assert sum(d["pob"]["65_mas"]) == int(t[13:].sum()) == 1_531_180
    assert sum(d["pob"]["75_mas"]) == int(t[15:].sum())
    assert sum(d["pob"]["3_16"]) == pytest.approx(0.6 * t[0] + t[1] + t[2] + 0.4 * t[3], abs=4518 * 0.5)  # redondeo por seccion
    assert d["total_tramos_vs_publicado"] == [7_582_867, 7_582_868]
    assert (PUBLICO / "secciones_2030.json").stat().st_size < 150_000


@real
def test_la_validacion_publicada_se_reproduce_y_el_modelo_gana(oficial):
    d = json.loads((PUBLICO / "secciones_2030.json").read_text(encoding="utf-8"))
    bt = P.backtest(P.cargar_serie(SERIE))
    assert d["validacion"] == json.loads(json.dumps(P.resumen_validacion(bt)))
    mun = bt["principal"]
    for g in ("65_mas", "75_mas", "0_14"):  # las afirmaciones de la web: gana a las 2 referencias, con claridad
        m = mun["modelo"]["municipio"][g]
        for ref in ("igual_que_hoy", "uniforme_total"):
            assert m["wape"] < 0.6 * mun[ref]["municipio"][g]["wape"], (g, ref)
            assert m["mediana"] < mun[ref]["municipio"][g]["mediana"], (g, ref)
    assert mun["modelo"]["municipio"]["65_mas"]["wape"] < 0.02 and mun["modelo"]["municipio"]["75_mas"]["wape"] < 0.025
    # el total NO gana a «crecimiento uniforme» (se declara): que no se vuelva a decir lo contrario sin cambiar esto
    assert mun["modelo"]["municipio"]["total"]["wape"] >= mun["uniforme_total"]["municipio"]["total"]["wape"]
