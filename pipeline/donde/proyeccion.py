"""«Madrid en 2030»: poblacion por seccion censal a 1-ene-2030 (tarea D7).

Fuentes (ver DATOS-DONDE.md, seccion D7):
- Total y estructura por edad de la Comunidad: INE, Proyecciones de Poblacion 2026-2076 (escenario central, publicadas el
  17-jun-2026), tal como las publica la Comunidad en `proyecciones_poblacion_por_sexo` (CC BY 4.0), poblacion a 1 de enero
  por tramos de 5 anos, de 2026 a 2041.
- Punto de partida por seccion: INE, Censo anual de poblacion 1-ene-2021..2025, tabla 69213 (serie de `secciones.py`).

Metodo (el total y la estructura por edad son OFICIALES; el reparto por secciones es un MODELO):
1. Cohortes: cada tramo de 5 anos pasa al siguiente (con h anos, una fraccion h/5 del tramo; los de 0-4 anos salen de los
   nacimientos, que se suponen iguales a los de hoy).
2. (Opcional, NO adoptada) Tendencia amortiguada: el crecimiento de cada municipio (y de cada seccion) que las cohortes NO
   explican en 2021-2025 se mantiene solo en parte (`LAMBDA_MUN`, `KAPPA_SEC`, a 0 porque la validacion no la respalda).
3. Calibracion: cada tramo de edad se escala para que la suma de las secciones sea exactamente la proyeccion oficial.
El backtest (`backtest`) aplica ESTE MISMO codigo desde un ano pasado y lo compara con lo observado y con 2 referencias ingenuas.
"""
from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from alergia import ckan, config

from . import comun
from .secciones import ETIQUETAS_TRAMOS, N_TRAMOS, grupos_edad

DS_PROYECCIONES = "proyecciones_poblacion_por_sexo"
RES_PROYECCIONES_CSV = "f7696f29-3be3-4ea6-b4d5-a2f06d65df49"
ANIO_BASE = 2025
ANIO_OBJETIVO = 2030
H = ANIO_OBJETIVO - ANIO_BASE  # 5 anos: con h = 5 cada tramo pasa EXACTO al siguiente
GRUPOS = ("total", "0_14", "3_16", "65_mas", "75_mas")

# Parametros del modelo PUBLICADO (ver DATOS-DONDE.md, D7). La tendencia amortiguada se probo y NO se adopta: con 2 anos de
# entrenamiento mejora algo el total (WAPE municipal 1,23 -> 1,01 %), con 1 ano lo empeora (1,81 -> 2,00 %) y no toca a los
# mayores; no es una mejora clara y se queda a 0. El backtest la sigue midiendo (`backtest`) para que se pueda comprobar.
LAMBDA_MUN = 0.0  # persistencia (0-1) de la tendencia municipal no explicada por las cohortes
KAPPA_SEC = 0.0  # peso de la desviacion de la seccion respecto de su municipio


# ----------------------------------------------------------------------------------------------------------------------
# Proyeccion oficial
# ----------------------------------------------------------------------------------------------------------------------
def tramo_oficial(concepto: str) -> int | None:
    """«...de personas de 5 a 9 años» -> 1; «...de 95 a  99 años» -> 19; «...100 años y más» -> 20; el total -> None."""
    m = re.search(r"de (\d+) a\s+\d+ años", concepto)
    if m:
        return int(m.group(1)) // 5
    if "100 años y más" in concepto:
        return 20
    return None


def leer_oficial(ruta: Path) -> dict[int, dict]:
    """{anio: {"tramos": array(21) (sexo Total), "total": int}} desde el CSV de la Comunidad.

    Comprueba que cada ano trae los 21 tramos. `total` es la cifra publicada: puede diferir en 1 de la suma de tramos
    (redondeo del INE); en 2030 son 7.582.868 y 7.582.867.
    """
    res: dict[int, dict] = {}
    for f in ckan.leer_csv(ruta):
        if f["Sexo"].strip() != "Total":
            continue
        anio = int(f["Año"])
        d = res.setdefault(anio, {"tramos": np.full(N_TRAMOS, -1, dtype=np.int64), "total": None})
        v = int(f["Valor"])
        t = tramo_oficial(f["Concepto"])
        if t is None:
            if not f["Concepto"].startswith("Total"):
                raise ValueError(f"concepto desconocido: {f['Concepto']}")
            d["total"] = v
        else:
            d["tramos"][t] = v
    for anio, d in res.items():
        if (d["tramos"] < 0).any() or d["total"] is None:
            raise ValueError(f"{anio}: faltan tramos o total en la proyeccion oficial")
    return res


def obtener_oficial(cache: Path = comun.CACHE) -> Path:
    with ckan.cliente() as c:
        p = ckan.package_show(c, DS_PROYECCIONES)
        if p.get("license_id") != "cc-by":
            raise ValueError(f"licencia inesperada: {p.get('license_id')}")
        return ckan.descargar(c, ckan.url_recurso(p, RES_PROYECCIONES_CSV), cache / "proyecciones_poblacion.csv")


# ----------------------------------------------------------------------------------------------------------------------
# Modelo
# ----------------------------------------------------------------------------------------------------------------------
def envejecer(base: np.ndarray, h: float, nacimientos: str = "hoy") -> np.ndarray:
    """Cohortes: `base[S, 21]` hoy -> `[S, 21]` dentro de h anos (0 <= h <= 5), sin migracion ni mortalidad.

    Dentro de cada tramo se supone una distribucion uniforme por edad: tras h anos, un tramo recibe (5-h)/5 de si mismo y
    h/5 del anterior. Con h = 5 (2025 -> 2030) no hay ninguna suposicion: el tramo t pasa entero al t+1. Los 0-4 anos salen
    de los nacimientos de h anos, supuestos iguales a los de hoy (0-4 / 5 por ano). El ultimo tramo (100+) es abierto.
    """
    if not 0 <= h <= 5:
        raise ValueError("h debe estar entre 0 y 5 anos")
    f = h / 5.0
    out = np.empty_like(base, dtype=float)
    if nacimientos == "hoy":  # nacimientos por ano de cada seccion = sus 0-4 de hoy / 5
        nac = base[:, 0] / 5.0
    elif nacimientos == "fertiles":  # reparto segun los 25-44 anos (padres), con el total de hoy
        ferti = base[:, 5:9].sum(axis=1)
        nac = ferti * (base[:, 0].sum() / 5.0) / ferti.sum()
    else:
        raise ValueError(nacimientos)
    out[:, 0] = (1 - f) * base[:, 0] + h * nac
    out[:, 1:20] = (1 - f) * base[:, 1:20] + f * base[:, 0:19]
    out[:, 20] = base[:, 20] + f * base[:, 19]
    return out


def calibrar(x: np.ndarray, objetivo: np.ndarray) -> np.ndarray:
    """Escala cada tramo (columna) para que la suma de las secciones sea exactamente `objetivo[t]`."""
    suma = x.sum(axis=0)
    if (suma <= 0).any():
        raise ValueError("un tramo sin poblacion no se puede calibrar")
    return x * (objetivo / suma)[None, :]


TRAMOS_TENDENCIA = slice(0, 13)  # la tendencia (vivienda nueva, migracion) solo se aplica a menores de 65: los mayores envejecen donde estan


def proyectar(base: np.ndarray, h: float, objetivo: np.ndarray, mult: np.ndarray | None = None,
              cols: slice = TRAMOS_TENDENCIA, nacimientos: str = "hoy") -> np.ndarray:
    """cohortes -> (multiplicador de tendencia por seccion, solo en `cols`) -> calibracion por tramo. `[S, 21]` reales."""
    x = envejecer(base, h, nacimientos)
    if mult is not None:
        x[:, cols] = x[:, cols] * mult[:, None]
    return calibrar(x, objetivo)


def indices_municipio(ids) -> tuple[np.ndarray, np.ndarray]:
    """(codigos de municipio unicos, indice de municipio de cada seccion). CUSEC[:5] = provincia + municipio."""
    cod = np.array([str(i)[:5] for i in ids])
    uni, idx = np.unique(cod, return_inverse=True)
    return uni, idx


def _suma_por(idx: np.ndarray, n: int, v: np.ndarray) -> np.ndarray:
    out = np.zeros(n)
    np.add.at(out, idx, v)
    return out


def multiplicador_tendencia(
    base0: np.ndarray, ids0, base1: np.ndarray, ids1, h_ent: float, h_proj: float, objetivo1: np.ndarray,
    lam: float, kappa: float, ids_proj, topes: tuple[float, float] = (0.5, 2.0), cols: slice = TRAMOS_TENDENCIA,
) -> np.ndarray:
    """Multiplicador de tendencia de cada seccion de `ids_proj` (los ids desde los que se proyecta).

    Entrenamiento: se proyecta base0 (ids0) hasta el momento de base1 (ids1) con el modelo SIN tendencia y calibrado a `objetivo1`
    y se mide el residuo observado/predicho:
    - por municipio (siempre fiable: los municipios no cambian de limites aunque se dividan sus secciones),
    - por seccion, solo en secciones «estables» (mismo codigo en los dos anos y el municipio no ha dividido ni fusionado
      ninguna seccion), porque en las demas el cambio de poblacion es un cambio de limites y no una tendencia.
    El residuo se mantiene en proporcion h_proj/h_ent, amortiguado: mult = rho_mun^(lam e) * (rho_sec/rho_mun)^(kappa e).
    """
    e = h_proj / h_ent
    pred = proyectar(base0, h_ent, objetivo1)[:, cols].sum(axis=1)
    uni0, i0 = indices_municipio(ids0)
    uni1, i1 = indices_municipio(ids1)
    union = np.array(sorted(set(uni0) | set(uni1)))
    pos = {c: k for k, c in enumerate(union)}
    m0 = np.array([pos[c] for c in uni0])[i0]
    m1 = np.array([pos[c] for c in uni1])[i1]
    pred_m = _suma_por(m0, len(union), pred)
    bobs = base1[:, cols].sum(axis=1)
    obs_m = _suma_por(m1, len(union), bobs)
    rho_m = np.where((pred_m > 0) & (obs_m > 0), obs_m / np.maximum(pred_m, 1e-9), 1.0)

    # secciones estables
    set0, set1 = set(map(str, ids0)), set(map(str, ids1))
    cambia = {str(i)[:5] for i in set0 ^ set1}
    mult = np.ones(len(ids_proj))
    p0 = {str(i): k for k, i in enumerate(ids0)}
    p1 = {str(i): k for k, i in enumerate(ids1)}
    for k, i in enumerate(map(str, ids_proj)):
        rm = rho_m[pos[i[:5]]] if i[:5] in pos else 1.0
        lm = e * lam * np.log(rm)
        ls = 0.0
        if kappa > 0 and i in p0 and i in p1 and i[:5] not in cambia and pred[p0[i]] > 0 and bobs[p1[i]] > 0:
            ls = e * kappa * (np.log(bobs[p1[i]] / pred[p0[i]]) - np.log(rm))
        mult[k] = np.exp(lm + ls)
    return np.clip(mult, *topes)


def redondear_a_objetivo(x: np.ndarray, objetivo: np.ndarray) -> np.ndarray:
    """Redondea a enteros cada columna con el metodo del resto mayor para que la suma sea EXACTAMENTE `objetivo[t]`."""
    x = np.asarray(x, dtype=float)
    out = np.floor(x).astype(np.int64)
    for t in range(x.shape[1]):
        faltan = int(objetivo[t]) - int(out[:, t].sum())
        if faltan < 0 or faltan > x.shape[0]:
            raise ValueError(f"tramo {t}: no se puede cuadrar ({faltan})")
        if faltan:
            resto = x[:, t] - out[:, t]
            out[np.argsort(-resto, kind="stable")[:faltan], t] += 1
    return out


# ----------------------------------------------------------------------------------------------------------------------
# Referencias ingenuas
# ----------------------------------------------------------------------------------------------------------------------
def ref_igual_que_hoy(base: np.ndarray) -> np.ndarray:
    return base.astype(float)


def ref_crecimiento_uniforme(base: np.ndarray, objetivo: np.ndarray) -> np.ndarray:
    """Cada seccion crece como la Comunidad entera EN CADA GRUPO (total, 65+, 75+): la estructura por edad de la Comunidad
    ya es la oficial, pero todas las secciones envejecen y crecen por igual (sin cohortes). Devuelve `[S, 21]` con el factor
    de cada tramo (un factor por tramo, igual para todas las secciones)."""
    return calibrar(base.astype(float), objetivo)


# ----------------------------------------------------------------------------------------------------------------------
# Serie del censo y backtest
# ----------------------------------------------------------------------------------------------------------------------
def cargar_serie(ruta: Path) -> dict:
    """`salida/donde/poblacion_serie_2021_2025.npz` -> {"ids": [str], "anios": [int], "matriz": float[S, A, 21] (-1 = no existe)}."""
    z = np.load(ruta)
    return {"ids": [str(i) for i in z["ids"]], "anios": [int(a) for a in z["anios"]], "matriz": z["matriz"].astype(float)}


def _en_anio(serie: dict, anio: int) -> tuple[list[str], np.ndarray]:
    k = serie["anios"].index(anio)
    ok = serie["matriz"][:, k, 0] >= 0
    return [i for i, o in zip(serie["ids"], ok) if o], serie["matriz"][ok, k, :]


METRICAS = ("wape", "mape", "mediana", "p80", "p90", "sesgo")


def _metricas(pred: np.ndarray, obs: np.ndarray) -> dict:
    """WAPE = sum|e| / sum(obs) (pondera por tamano); MAPE y percentiles del error absoluto relativo por unidad (todas pesan igual,
    se ignoran las de observado 0); sesgo = sum(pred)/sum(obs) - 1."""
    k = obs > 0
    ape = np.abs(pred[k] - obs[k]) / obs[k]
    return {
        "n": int(k.sum()), "wape": float(np.abs(pred - obs).sum() / obs.sum()), "mape": float(ape.mean()),
        "mediana": float(np.median(ape)), "p80": float(np.percentile(ape, 80)), "p90": float(np.percentile(ape, 90)),
        "sesgo": float(pred.sum() / obs.sum() - 1),
    }


def _tramo_tamano(p: float) -> str:
    # mismas clases que territorios.tramo_tamano
    return "<2.000" if p < 2000 else "2.000-10.000" if p <= 10000 else "10.000-50.000" if p <= 50000 else ">50.000"


def metodos_backtest(lam: float = 0.0, kappa: float = 0.0) -> dict:
    """Los metodos que se comparan. Todos reciben (serie, a0, base[S0,21], ids0, ids1, base1, h, objetivo[21]) y devuelven `[S0,21]`."""

    def modelo(serie, a0, b0, i0, i1, b1, h, obj):
        mult = None
        if lam > 0 or kappa > 0:
            ip, bp = _en_anio(serie, a0 - h)  # entrena con los h anos anteriores (mismo horizonte)
            mult = multiplicador_tendencia(bp, ip, b0, i0, h, h, b0.sum(axis=0), lam, kappa, i0)
        return proyectar(b0, h, obj, mult)

    return {
        "modelo": modelo,
        "igual_que_hoy": lambda serie, a0, b0, i0, i1, b1, h, obj: ref_igual_que_hoy(b0),
        "uniforme_total": lambda serie, a0, b0, i0, i1, b1, h, obj: b0 * (obj.sum() / b0.sum()),
        "uniforme_por_tramo": lambda serie, a0, b0, i0, i1, b1, h, obj: ref_crecimiento_uniforme(b0, obj),
    }


def evaluar_escenario(serie: dict, a0: int, a1: int, metodo, perturbacion: float = 0.0) -> dict:
    """Aplica `metodo` desde el ano a0 y lo compara con lo observado en a1. El objetivo de la calibracion es la estructura
    por edad OBSERVADA de toda la Comunidad en a1 (hace de «proyeccion oficial perfecta»), multiplicada por 1+perturbacion.

    - Municipio (179): prediccion = suma de las secciones de a0; observado = suma de todas las de a1 (los municipios no cambian
      de limites aunque se dividan sus secciones).
    - Distrito censal (CUSEC[:7], unos 800): igual que el municipio, mas fino y tambien inmune a que una seccion se divida.
    - Seccion («seccion»): las que tienen el mismo codigo en a0 y a1. Ojo: si una se divide, la que conserva el codigo pierde
      poblacion en la nueva y eso penaliza por igual a todos los metodos. «seccion_estable»: ademas su municipio no ha dividido
      ni fusionado ninguna seccion (pocas, pequenas y rurales: `poblacion_estable`), el caso limpio.
    Devuelve {"nivel": {"grupo": metricas}} con nivel en {municipio, distrito, seccion, seccion_estable} y grupo en `GRUPOS`.
    """
    i0, b0 = _en_anio(serie, a0)
    i1, b1 = _en_anio(serie, a1)
    obj = b1.sum(axis=0) * (1 + perturbacion)
    pred = metodo(serie, a0, b0, i0, i1, b1, a1 - a0, obj)
    if not np.isfinite(pred).all() or (pred < 0).any():
        raise ValueError("prediccion con NaN o negativos")
    p1 = {i: k for k, i in enumerate(i1)}
    cambia = {i[:5] for i in set(i0) ^ set(i1)}
    comp = np.array([i in p1 for i in i0])
    est = np.array([i in p1 and i[:5] not in cambia for i in i0])
    gp, go, gb = grupos_de(pred), grupos_de(b1), grupos_de(b0)
    res: dict = {"municipio": {}, "distrito": {}, "seccion": {}, "seccion_estable": {},
                 "n_secciones_comparables": int(comp.sum()), "n_secciones_estables": int(est.sum()),
                 "poblacion_estable": float(b1[[p1[i] for i in np.array(i0)[est]]].sum() / b1.sum())}
    agregados = {}
    for nivel, n in (("municipio", 5), ("distrito", 7)):
        uni = sorted({i[:n] for i in i0} | {i[:n] for i in i1})
        pos = {c: k for k, c in enumerate(uni)}
        m0 = np.array([pos[i[:n]] for i in i0])
        m1 = np.array([pos[i[:n]] for i in i1])
        agregados[nivel] = (uni, m0, m1)
        tam_base = _suma_por(m0, len(uni), gb["total"])
        ok = tam_base > 0  # unidades que existian en a0
        for g in GRUPOS:
            pm, om = _suma_por(m0, len(uni), gp[g]), _suma_por(m1, len(uni), go[g])
            res[nivel][g] = _metricas(pm[ok], om[ok])
        if nivel == "municipio":
            clase = np.array([_tramo_tamano(x) for x in tam_base])
            res["municipio_por_tamano"] = {}
            for g in GRUPOS:
                pm, om = _suma_por(m0, len(uni), gp[g]), _suma_por(m1, len(uni), go[g])
                for c in sorted(set(clase[ok])):
                    sel = ok & (clase == c)
                    mt = _metricas(pm[sel], om[sel])
                    res["municipio_por_tamano"].setdefault(c, {})[g] = {"n": int(sel.sum()), "mediana": mt["mediana"], "p80": mt["p80"]}
    uni, m0, m1 = agregados["municipio"]
    res["peores_municipios"] = {}
    for g in ("total", "65_mas", "75_mas"):
        pm, om = _suma_por(m0, len(uni), gp[g]), _suma_por(m1, len(uni), go[g])
        err = np.where(om > 0, (pm - om) / np.maximum(om, 1), 0.0)
        peor = np.argsort(-np.abs(err) * (om >= 2000 if g == "total" else om >= 300), kind="stable")[:5]  # solo unidades no diminutas
        res["peores_municipios"][g] = [[uni[k], float(pm[k]), float(om[k]), float(err[k])] for k in peor]
    for nombre, sel in (("seccion", comp), ("seccion_estable", est)):
        k1 = np.array([p1[i] for i in np.array(i0)[sel]])
        for g in GRUPOS:
            res[nombre][g] = _metricas(gp[g][sel], go[g][k1])
    return res


def backtest(serie: dict) -> dict:
    """Validacion completa. Todo sale del mismo codigo que proyecta 2030 (`proyectar`), desde anos pasados, y se compara con
    lo observado del Censo anual del INE y con 2 referencias ingenuas.

    - `principal`: 2021 -> 2025 (4 anos; el horizonte real es 5), modelo publicado (sin tendencia) y las 3 referencias.
    - `horizonte`: error del modelo segun los anos (1 a 4) siempre hasta 2025.
    - `tendencia`: prueba de la tendencia amortiguada (no adoptada), entrenando con 2 anos (2021-23 -> 2025) y con 1 (2021-22 -> 2023).
    - `sensibilidad`: la calibracion con un total oficial desviado un 2 % en todas las edades.
    """
    M = metodos_backtest()
    out: dict = {"principal": {}, "horizonte": {}, "tendencia": {}, "sensibilidad": {}}
    for n, f in M.items():
        out["principal"][n] = evaluar_escenario(serie, 2021, 2025, f)
    for a0 in (2024, 2023, 2022, 2021):
        out["horizonte"][str(2025 - a0)] = {n: evaluar_escenario(serie, a0, 2025, M[n]) for n in ("modelo", "uniforme_por_tramo")}
    for etiqueta, a0, a1 in (("entrena_2_anos_proyecta_2", 2023, 2025), ("entrena_1_ano_proyecta_1", 2022, 2023)):
        out["tendencia"][etiqueta] = {
            nombre: evaluar_escenario(serie, a0, a1, metodos_backtest(lam, 0.0)["modelo"])
            for nombre, lam in (("sin_tendencia", 0.0), ("lambda_0_5", 0.5), ("lambda_1", 1.0))}
        for n in ("igual_que_hoy", "uniforme_total", "uniforme_por_tramo"):
            out["tendencia"][etiqueta][n] = evaluar_escenario(serie, a0, a1, M[n])
    for e in (-0.02, 0.02):
        out["sensibilidad"][f"{e:+.0%}"] = evaluar_escenario(serie, 2021, 2025, M["modelo"], perturbacion=e)
    return out


def resumen_validacion(bt: dict) -> dict:
    """Version corta para secciones_2030.json: errores del modelo y de las 2 referencias, 2021 -> 2025."""
    r: dict = {"escenario": "2021 -> 2025 (4 anos), calibrando con la estructura observada de 2025 como si fuera la proyeccion oficial",
               "nota": "WAPE = error absoluto total / total observado; mediana y p80 = error relativo por municipio o seccion"}
    for niv in ("municipio", "distrito", "seccion", "seccion_estable"):
        r[niv] = {
            g: {n: {k: round(bt["principal"][n][niv][g][k], 4) for k in ("wape", "mediana", "p80")}
                for n in ("modelo", "igual_que_hoy", "uniforme_total", "uniforme_por_tramo")}
            for g in GRUPOS}
    return r


# ----------------------------------------------------------------------------------------------------------------------
# Proyeccion a 2030
# ----------------------------------------------------------------------------------------------------------------------
def proyectar_2030(serie: dict, oficial: dict[int, dict]) -> dict:
    """Poblacion a 1-ene-2030 por seccion (las de 2025) y por tramo (enteros). La suma de cada tramo es exactamente la oficial."""
    ids, b25 = _en_anio(serie, ANIO_BASE)
    objetivo = oficial[ANIO_OBJETIVO]["tramos"].astype(float)
    mult = None
    if LAMBDA_MUN > 0 or KAPPA_SEC > 0:
        i21, b21 = _en_anio(serie, ANIO_BASE - 4)
        mult = multiplicador_tendencia(b21, i21, b25, ids, 4, H, b25.sum(axis=0), LAMBDA_MUN, KAPPA_SEC, ids)
    real = proyectar(b25, H, objetivo, mult)
    ent = redondear_a_objetivo(real, oficial[ANIO_OBJETIVO]["tramos"])
    factores = objetivo / envejecer(b25, H).sum(axis=0)
    return {"ids": ids, "base": b25, "real": real, "tramos": ent, "factores_calibracion": factores}


def comprobar(res: dict, oficial: dict[int, dict]) -> None:
    """Falla si algo no cuadra: tramos exactos, sin negativos ni NaN, 4.518 secciones."""
    t = res["tramos"]
    if not np.isfinite(res["real"]).all() or (t < 0).any():
        raise ValueError("proyeccion con NaN o negativos")
    if not (t.sum(axis=0) == oficial[ANIO_OBJETIVO]["tramos"]).all():
        raise ValueError("la suma por tramo no cuadra con la proyeccion oficial")
    if len(res["ids"]) != 4518:
        raise ValueError(f"se esperaban 4.518 secciones y hay {len(res['ids'])}")


def grupos_de(matriz: np.ndarray) -> dict[str, np.ndarray]:
    """`[S, 21]` -> {grupo: array[S]} con los grupos de `secciones.grupos_edad` (3_16 estimado y no redondeado)."""
    g = [grupos_edad(v) for v in matriz]
    return {k: np.array([x[k] for x in g]) for k in GRUPOS}


def a_json(res: dict, oficial: dict[int, dict], validacion: dict, hoy=None) -> dict:
    """`secciones_2030.json`: mismos 5 grupos y mismo orden de secciones que `secciones.json` (`ids_sha1` para comprobarlo)."""
    import hashlib
    from datetime import date

    g = grupos_de(res["tramos"].astype(float))
    g25 = grupos_de(res["base"])
    of = oficial[ANIO_OBJETIVO]
    return {
        "version": comun.VERSION,
        "generado": (hoy or date.today()).isoformat(),
        "anio": ANIO_OBJETIVO, "anio_base": ANIO_BASE, "fecha_referencia": "1 de enero de 2030",
        "n": len(res["ids"]),
        "ids_sha1": hashlib.sha1("\n".join(res["ids"]).encode()).hexdigest(),
        "orden": "las secciones van en el mismo orden que `ids` de secciones.json (comprobar `ids_sha1`)",
        "fuente_oficial": "INE, Proyecciones de Poblacion 2026-2076 (escenario central, 17-jun-2026), publicadas por la Comunidad de Madrid "
                          "como `proyecciones_poblacion_por_sexo` (CC BY 4.0, actualizado el 24-06-2026): "
                          + config.CKAN_CATALOGO + DS_PROYECCIONES,
        "metodo": "Total y estructura por edad de la Comunidad: oficiales (cada tramo de 5 anos cuadra exactamente). Reparto por seccion: "
                  "MODELO de cohortes (cada tramo de edad de 2025 pasa al siguiente; los 0-4 anos salen de los nacimientos de hoy) y calibracion "
                  "por tramo a la proyeccion oficial. No incluye vivienda nueva ni cambios locales de migracion.",
        "metodo_edades": "directo (0_14, 65_mas, 75_mas); 3_16 estimado (3/5 de 0-4 + 5-9 + 10-14 + 2/5 de 15-19)",
        "total_tramos_vs_publicado": [int(res["tramos"].sum()), of["total"]],
        "comunidad": {
            # suma de las cifras ya redondeadas por seccion (igual que las que lee la web)
            str(ANIO_BASE): {k: int(sum(int(round(x)) for x in g25[k])) for k in GRUPOS},
            str(ANIO_OBJETIVO): {k: int(sum(int(round(x)) for x in g[k])) for k in GRUPOS},
        },
        "pob": {k: [int(round(x)) for x in g[k]] for k in GRUPOS},
        "validacion": validacion,
    }


def cifras(res: dict, oficial: dict[int, dict], sec_json: dict, terr: dict, residencia: dict) -> dict:
    """Cifras para la presentacion (Comunidad: oficiales; municipios: modelo)."""
    g30, g25 = grupos_de(res["tramos"].astype(float)), grupos_de(res["base"])
    c25 = {k: float(g25[k].sum()) for k in GRUPOS}
    c30 = {k: float(g30[k].sum()) for k in GRUPOS}
    plazas = float(sum(p or 0 for p in residencia["plazas"]) + residencia.get("plazas_descartadas_sin_coordenadas", 0))
    ratio_hoy = plazas / c25["65_mas"]
    nombres = {m["id"]: m["nombre"] for m in terr["municipios"]}
    mun = np.array(sec_json["mun"])
    filas = []
    for m in sorted(set(mun)):
        k = mun == m
        a75, b75 = float(g25["75_mas"][k].sum()), float(g30["75_mas"][k].sum())
        a65, b65 = float(g25["65_mas"][k].sum()), float(g30["65_mas"][k].sum())
        filas.append({"id": m, "nombre": nombres[m], "pob_2025": float(g25["total"][k].sum()), "pob_2030": float(g30["total"][k].sum()),
                      "65_2025": a65, "65_2030": b65, "75_2025": a75, "75_2030": b75})
    return {
        "mayores_65": [c25["65_mas"], c30["65_mas"], c30["65_mas"] - c25["65_mas"], c30["65_mas"] / c25["65_mas"] - 1],
        "mayores_75": [c25["75_mas"], c30["75_mas"], c30["75_mas"] - c25["75_mas"], c30["75_mas"] / c25["75_mas"] - 1],
        "menores_0_14": [c25["0_14"], c30["0_14"], c30["0_14"] - c25["0_14"], c30["0_14"] / c25["0_14"] - 1],
        "total": [c25["total"], c30["total"], c30["total"] - c25["total"], c30["total"] / c25["total"] - 1],
        "plazas_residencia_hoy": plazas, "plazas_por_100_mayores_hoy": 100 * ratio_hoy,
        "plazas_para_mantener_la_media_en_2030": ratio_hoy * c30["65_mas"], "plazas_mas": ratio_hoy * c30["65_mas"] - plazas,
        "municipios": filas,
    }


def main(salida: Path, cache: Path = comun.CACHE, intermedios: Path = comun.INTERMEDIOS) -> dict:
    """Lee la serie (la escribe `secciones.main`), el CSV oficial (CKAN) y `salida/secciones.json`; escribe `secciones_2030.json`
    en `salida` y `proyeccion_backtest.json` y `proyeccion_cifras.json` en `intermedios`."""
    from .secciones import escribir_json

    serie = cargar_serie(intermedios / "poblacion_serie_2021_2025.npz")
    oficial = leer_oficial(obtener_oficial(cache))
    sec = json.loads((salida / "secciones.json").read_text(encoding="utf-8"))
    res = proyectar_2030(serie, oficial)
    comprobar(res, oficial)
    if res["ids"] != sec["ids"]:
        raise ValueError("las secciones de la serie y de secciones.json no coinciden")
    bt = backtest(serie)
    escribir_json(salida / "secciones_2030.json", a_json(res, oficial, resumen_validacion(bt)))
    intermedios.mkdir(parents=True, exist_ok=True)
    escribir_json(intermedios / "proyeccion_backtest.json", bt)
    terr = json.loads((salida / "territorios.json").read_text(encoding="utf-8"))
    resid = json.loads((salida / "servicios" / "residencia.json").read_text(encoding="utf-8"))
    cf = cifras(res, oficial, sec, terr, resid)
    escribir_json(intermedios / "proyeccion_cifras.json", cf)
    print(f"2030: {int(res['tramos'].sum()):,} habitantes, 65+ {cf['mayores_65'][1]:,.0f}")
    return {"total_2030": int(res["tramos"].sum()), "mayores_65_2030": int(round(cf["mayores_65"][1]))}


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=comun.PUBLICO)
    main(ap.parse_args().salida)
