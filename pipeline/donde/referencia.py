"""Cifras de referencia (D4) para contrastar el motor de TypeScript (`src/lib/donde/`).

Implementacion INDEPENDIENTE: no comparte codigo ni estructuras con el motor de la web. Aqui no hay rejilla espacial ni
indices: se calcula por fuerza bruta (matriz completa seccion x centro con numpy), que es lo mas facil de verificar.
Lo unico que se comparte con TypeScript es la DEFINICION (plan, «Decisiones clave» y «Motor de calculo»):

- Proyeccion plana local: x = R * rad(lon) * cos(rad(40,42)), y = R * rad(lat), R = 6.371.008,8 m.
- Distancia en linea recta (euclidea sobre la proyeccion) entre el punto de cada seccion (`lat`/`lon`, punto interior del
  poligono) y cada centro.
- Servicios sin plazas: una seccion esta en deficit si su centro mas cercano esta a MAS de R metros (estricto, `>`).
  Personas afectadas = poblacion del grupo objetivo de esas secciones.
- Servicios con plazas (2SFCA, Luo y Wang 2003), con radio d0 y comparacion `<=`:
    r_j = plazas_j / (poblacion objetivo de las secciones a <= d0 del centro j)     (0 si no hay nadie)
    A_i = 100 * suma de r_j de los centros a <= d0 de la seccion i                   (plazas por cada 100 mayores)
  Umbral = media de A_i ponderada por la poblacion objetivo (coincide con 100 * plazas cubiertas / poblacion objetivo).
  Deficit: A_i < umbral (estricto).
- Servicios sin plazas: «ganan acceso» = poblacion objetivo de las secciones en deficit que quedan a <= R del punto nuevo.
- Servicios con plazas: la metrica es «reduce en N las plazas que faltan» (decision del 18-nov; sustituye a «X mayores ganan
  acceso», que daba absurdos porque muchas secciones estan justo bajo el umbral):
    F(A) = suma_i objetivo_i * max(0, U - A_i) / 100          (plazas que faltan; U = umbral FIJO, no se recalcula)
    N    = F(A antes) - F(A despues),   A'_i = A_i + 100 * r_nuevo  si la seccion i esta a <= d0 del punto, A'_i = A_i si no
  con r_nuevo = plazas / (poblacion objetivo a <= d0 del punto). Es la MISMA agregacion que `plazasQueFaltan` de la web (la cifra
  «faltan 10.689 plazas»). Siempre 0 <= N <= plazas: cada seccion cubierta baja como mucho objetivo_i * r_nuevo y esas suman plazas.
  El umbral U es la media ponderada de hoy (`media`) o una referencia fija del IMSERSO (4,05 Espana, 4,21 Madrid).
- Simular un centro nuevo en un punto: distancia -> las secciones en deficit a <= R del punto dejan de estarlo;
  2SFCA -> se suma 100 * r_nuevo a las secciones a <= d0 del punto y se mide N.
- Optimo voraz con n = 1 (MCLP): candidatos = puntos de las secciones con poblacion objetivo > 0 (opcionalmente solo de
  una zona estadistica; N se cuenta en TODA la Comunidad). Gana el de mas N (servicios por distancia: mas `ganan`); empate -> el
  que aparece antes en `secciones.json` (orden de `ids`). Con n > 1 (caso7): se repite actualizando A tras cada centro; una seccion
  ya elegida no se vuelve a elegir; se para si ningun candidato mejora (N > 0).

Uso:  uv run --project pipeline python -m donde.referencia [--datos public/donde] [--salida pipeline/donde/referencia.json]
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

from . import comun

R_TIERRA = 6371008.8
LAT_REF = 40.42  # latitud de referencia de la proyeccion (grados)
COS_REF = math.cos(math.radians(LAT_REF))

# Parametros de los 6 casos (los mismos que usara el test de TypeScript).
CASO1_RADIO_M = 2000.0      # centro de salud o consultorio
CASO2_RADIO_M = 1000.0      # farmacia
CASO3_D0_M = 10000.0        # residencias
CASO4_PLAZAS = 94           # residencia nueva (mediana)
CASO4_ZONA = "04"           # Sur Metropolitano
CASO5_PUNTO = (40.2420, -3.7000)  # lat, lon: centro de Pinto (punto fijo para el contraste)
CASO5_PLAZAS_RESIDENCIA = 94
CASO6_LIMITE = 5
# Referencias fijas del IMSERSO (informe a 31-dic-2024, ver DATOS-DONDE.md) para residencias: plazas por cada 100 mayores.
UMBRALES_IMSERSO_RESIDENCIA = {"imserso_espana": 4.05, "imserso_madrid": 4.21}


# ---------------------------------------------------------------- carga
def cargar_datos(directorio: Path) -> dict:
    """Lee `secciones.json`, `territorios.json` y `servicios/*.json` de public/donde."""
    d = Path(directorio)
    leer = lambda ruta: json.loads((d / ruta).read_text(encoding="utf-8"))
    return {
        "secciones": leer("secciones.json"),
        "territorios": leer("territorios.json"),
        "servicios": {s: leer(f"servicios/{s}.json") for s in ("centro_salud", "farmacia", "residencia")},
    }


# ---------------------------------------------------------------- geometria
def proyectar(lat, lon):
    """(lat, lon) en grados -> (x, y) en metros. Acepta escalares o arrays."""
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    return R_TIERRA * np.radians(lon) * COS_REF, R_TIERRA * np.radians(lat)


def matriz_distancias(xs, ys, xc, yc):
    """Distancia (m) de cada seccion (filas) a cada centro (columnas)."""
    return np.hypot(xs[:, None] - xc[None, :], ys[:, None] - yc[None, :])


def haversine(lat1, lon1, lat2, lon2):
    """Distancia ortodromica (m); solo para medir el error de la proyeccion local."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * R_TIERRA * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- servicios sin plazas
def distancia_al_mas_cercano(xs, ys, xc, yc):
    """Distancia de cada seccion a su centro mas cercano (m). `inf` si no hay centros."""
    if len(xc) == 0:
        return np.full(len(xs), np.inf)
    return matriz_distancias(xs, ys, xc, yc).min(axis=1)


def deficit_distancia(dmin, radio_m):
    return dmin > radio_m


def ganan_distancia(dmin, objetivo, xs, ys, punto_xy, radio_m):
    """Personas del grupo objetivo que pasan a tener un centro a <= radio_m al abrir uno en `punto_xy`."""
    d_punto = np.hypot(xs - punto_xy[0], ys - punto_xy[1])
    ganan = (dmin > radio_m) & (d_punto <= radio_m)
    return float(objetivo[ganan].sum()), ganan


# ---------------------------------------------------------------- 2SFCA
def sfca(xs, ys, objetivo, xc, yc, plazas, d0_m):
    """Devuelve (A, r): A_i en plazas por cada 100 personas del grupo objetivo; r_j por centro."""
    if len(xc) == 0:
        return np.zeros(len(xs)), np.zeros(0)
    cerca = matriz_distancias(xs, ys, xc, yc) <= d0_m            # [seccion, centro]
    pob_centro = objetivo @ cerca                                 # objetivo en el radio de cada centro
    r = np.divide(plazas, pob_centro, out=np.zeros(len(plazas), dtype=float), where=pob_centro > 0)
    return 100.0 * (cerca @ r), r


def umbral_media(A, objetivo):
    """Media de A_i ponderada por el grupo objetivo."""
    return float((A * objetivo).sum() / objetivo.sum())


def r_nuevo(xs, ys, objetivo, punto_xy, plazas, d0_m):
    """r del centro nuevo y mascara de las secciones a <= d0 del punto."""
    cerca = np.hypot(xs - punto_xy[0], ys - punto_xy[1]) <= d0_m
    pob = float(objetivo[cerca].sum())
    return (plazas / pob if pob > 0 else 0.0), cerca


def plazas_faltan(A, umbral, objetivo):
    """F(A): plazas que faltan para que todas las secciones lleguen al umbral (mismo calculo que `plazasQueFaltan` de la web)."""
    return float((objetivo * np.maximum(0.0, umbral - A)).sum() / 100.0)


def reduce_faltan(A, umbral, objetivo, xs, ys, punto_xy, plazas, d0_m):
    """N = F(A) - F(A') al abrir un centro de `plazas` en `punto_xy`. Devuelve (N, secciones_que_mejoran, r_nuevo)."""
    r, cerca = r_nuevo(xs, ys, objetivo, punto_xy, plazas, d0_m)
    antes = np.maximum(0.0, umbral - A)
    despues = np.maximum(0.0, umbral - (A + np.where(cerca, 100.0 * r, 0.0)))
    mejora = objetivo * (antes - despues) / 100.0
    return float(mejora.sum()), int((mejora > 0).sum()), r


# ---------------------------------------------------------------- optimo voraz
def ranking_candidatos(A, umbral, objetivo, xs, ys, plazas, d0_m, candidatos):
    """Evalua todos los candidatos (indices de seccion) y devuelve [(N, indice, faltan_local)] de mejor a peor.
    Orden: N (redondeado a 1e-6 plazas: asi dos implementaciones no desempatan por ruido de coma flotante) de mayor a menor;
    si empatan, mas `faltan_local` (plazas que faltan dentro del radio del candidato, tambien a 1e-6: donde mas hace falta);
    si vuelven a empatar, indice menor. Con muchos centros N llega al tope (= plazas) en toda una zona deficitaria y el segundo
    criterio es el que elige DONDE dentro de ella."""
    base = np.maximum(0.0, umbral - A)
    res = []
    for k in candidatos:
        cerca = np.hypot(xs - xs[k], ys - ys[k]) <= d0_m
        pob = objetivo[cerca].sum()
        rn = plazas / pob if pob > 0 else 0.0
        despues = np.maximum(0.0, umbral - (A + np.where(cerca, 100.0 * rn, 0.0)))
        res.append((float((objetivo * (base - despues)).sum() / 100.0), int(k), float((objetivo[cerca] * base[cerca]).sum() / 100.0)))
    res.sort(key=lambda t: (-round(t[0], 6), -round(t[2], 6), t[1]))
    return res


def optimo_voraz(A, umbral, objetivo, xs, ys, plazas, d0_m, candidatos, n):
    """Voraz sobre N. Devuelve [(N, indice, acumulado)] (menos de n si nadie mejora). No repite secciones."""
    A = A.copy()
    elegidos: set[int] = set()
    pasos = []
    acumulado = 0.0
    for _ in range(n):
        res = ranking_candidatos(A, umbral, objetivo, xs, ys, plazas, d0_m, [k for k in candidatos if k not in elegidos])
        if not res or round(res[0][0], 6) <= 0:
            break
        g, k, _loc = res[0]
        rn, cerca = r_nuevo(xs, ys, objetivo, (xs[k], ys[k]), plazas, d0_m)
        A = A + np.where(cerca, 100.0 * rn, 0.0)
        acumulado += g
        elegidos.add(k)
        pasos.append((g, k, acumulado))
    return pasos


def mediana_ponderada(valores, pesos):
    """Mediana ponderada (como `medianaPonderada` de la web): primer valor, de menor a mayor, cuyo peso acumulado llega a la mitad."""
    idx = [i for i in np.argsort(valores, kind="stable") if pesos[i] > 0]
    total = float(sum(pesos[i] for i in idx))
    acum = 0.0
    for i in idx:
        acum += float(pesos[i])
        if acum >= total / 2:
            return float(valores[i])
    return 0.0


# ---------------------------------------------------------------- agregados
def agregar_por(claves, valores_en_deficit, objetivo):
    """{clave: (objetivo_total, objetivo_en_deficit)} sumando por la clave de cada seccion."""
    out: dict = {}
    for c, d, o in zip(claves, valores_en_deficit, objetivo):
        if c is None:
            continue
        t, e = out.get(c, (0.0, 0.0))
        out[c] = (t + float(o), e + (float(o) if d else 0.0))
    return out


def ranking(claves, deficit, objetivo, nombres, orden, limite, filtro=None):
    """Ranking de territorios. orden='pct' (cuota en deficit; desempate por personas y clave) u 'personas'."""
    agg = agregar_por(claves, deficit, objetivo)
    filas = []
    for c, (t, e) in agg.items():
        if t <= 0 or (filtro is not None and not filtro(c)):
            continue
        filas.append({"lugar": c, "nombre": nombres.get(c, c), "objetivo": int(round(t)),
                      "en_deficit": int(round(e)), "pct": round(100 * e / t, 3)})
    if orden == "pct":
        filas.sort(key=lambda f: (-f["pct"], -f["en_deficit"], f["lugar"]))
    else:
        filas.sort(key=lambda f: (-f["en_deficit"], -f["pct"], f["lugar"]))
    return filas[:limite]


def ranking_plazas_faltan(claves, A, umbral, objetivo, nombres, limite, filtro=None):
    """Ranking de territorios por plazas que faltan (F por territorio); desempate por clave."""
    falta = objetivo * np.maximum(0.0, umbral - A) / 100.0
    tot: dict = {}
    obj: dict = {}
    for c, f, o in zip(claves, falta, objetivo):
        if c is None:
            continue
        tot[c] = tot.get(c, 0.0) + float(f)
        obj[c] = obj.get(c, 0.0) + float(o)
    filas = [{"lugar": c, "nombre": nombres.get(c, c), "objetivo": int(round(obj[c])), "plazas_faltan": round(t, 4)}
             for c, t in tot.items() if obj[c] > 0 and (filtro is None or filtro(c))]
    filas.sort(key=lambda f: (-f["plazas_faltan"], f["lugar"]))
    return filas[:limite]


# ---------------------------------------------------------------- los casos
def calcular(datos: dict) -> dict:
    sec = datos["secciones"]
    terr = datos["territorios"]
    serv = datos["servicios"]
    xs, ys = proyectar(sec["lat"], sec["lon"])
    total = np.asarray(sec["pob"]["total"], dtype=float)
    mayores = np.asarray(sec["pob"]["65_mas"], dtype=float)
    mun = sec["mun"]
    nombres_mun = {m["id"]: m["nombre"] for m in terr["municipios"]}
    zona_de_mun = {m["id"]: m["zona"] for m in terr["municipios"]}
    pob_total = float(total.sum())
    pob_mayores = float(mayores.sum())

    def centros(s):
        c = serv[s]
        x, y = proyectar(c["lat"], c["lon"])
        return x, y, c

    # Caso 1: centro de salud a mas de 2 km
    xc, yc, cs = centros("centro_salud")
    dmin_cs = distancia_al_mas_cercano(xs, ys, xc, yc)
    d1 = deficit_distancia(dmin_cs, CASO1_RADIO_M)
    caso1 = {
        "servicio": "centro_salud", "radio_m": CASO1_RADIO_M, "criterio": "distancia recta al centro mas cercano > radio",
        "centros": len(cs["ids"]), "poblacion_total": int(pob_total),
        "personas": int(total[d1].sum()), "pct": round(100 * total[d1].sum() / pob_total, 3),
        "secciones_en_deficit": int(d1.sum()),
        "secciones_a_menos_de_10m_del_radio": int((np.abs(dmin_cs - CASO1_RADIO_M) < 10).sum()),
        "sensibilidad_personas": {  # por si el motor de TS difiere en un borde de distancia
            "radio_x0.99": int(total[deficit_distancia(dmin_cs, CASO1_RADIO_M * 0.99)].sum()),
            "radio_x1.01": int(total[deficit_distancia(dmin_cs, CASO1_RADIO_M * 1.01)].sum()),
        },
    }

    # Caso 2: farmacia a mas de 1 km
    xf, yf, fa = centros("farmacia")
    dmin_fa = distancia_al_mas_cercano(xs, ys, xf, yf)
    d2 = deficit_distancia(dmin_fa, CASO2_RADIO_M)
    caso2 = {
        "servicio": "farmacia", "radio_m": CASO2_RADIO_M, "criterio": "distancia recta al centro mas cercano > radio",
        "centros": len(fa["ids"]), "poblacion_total": int(pob_total),
        "personas": int(total[d2].sum()), "pct": round(100 * total[d2].sum() / pob_total, 3),
        "secciones_en_deficit": int(d2.sum()),
        "secciones_a_menos_de_10m_del_radio": int((np.abs(dmin_fa - CASO2_RADIO_M) < 10).sum()),
        "sensibilidad_personas": {
            "radio_x0.99": int(total[deficit_distancia(dmin_fa, CASO2_RADIO_M * 0.99)].sum()),
            "radio_x1.01": int(total[deficit_distancia(dmin_fa, CASO2_RADIO_M * 1.01)].sum()),
        },
    }

    # Caso 3: residencias, 2SFCA con d0 = 10 km
    xr, yr, re_ = centros("residencia")
    # Un centro del registro no trae plazas (null): cuenta como 0 plazas (el motor de TS debe hacer lo mismo).
    sin_plazas = sum(1 for v in re_["plazas"] if v is None)
    plazas_r = np.asarray([0 if v is None else v for v in re_["plazas"]], dtype=float)
    A, r = sfca(xs, ys, mayores, xr, yr, plazas_r, CASO3_D0_M)
    umbral = umbral_media(A, mayores)
    d3 = A < umbral
    # Umbrales U que ofrece la web (el de por defecto es `media`). Se calculan UNA vez, con los datos de hoy.
    umbrales = {"media": umbral, "mediana": mediana_ponderada(A, mayores), **UMBRALES_IMSERSO_RESIDENCIA}
    caso3 = {
        "servicio": "residencia", "d0_m": CASO3_D0_M, "criterio": "2SFCA, A_i < media ponderada por mayores de 65",
        "centros": len(re_["ids"]), "centros_con_plazas_null_tratados_como_0": sin_plazas, "plazas_totales": int(plazas_r.sum()), "mayores_total": int(pob_mayores),
        "umbral_plazas_por_100_mayores": round(umbral, 6),
        "plazas_por_100_mayores_comunidad_simple": round(100 * plazas_r.sum() / pob_mayores, 6),
        "personas": int(mayores[d3].sum()), "pct": round(100 * mayores[d3].sum() / pob_mayores, 3),
        "secciones_en_deficit": int(d3.sum()),
        "A_min": round(float(A.min()), 6), "A_max": round(float(A.max()), 6),
        "umbrales": {k: round(v, 6) for k, v in umbrales.items()},
        "plazas_faltan": {  # F(A) con cada umbral: la cifra «faltan N plazas» de la web (la de `media` es la principal)
            k: round(plazas_faltan(A, u, mayores), 4) for k, u in umbrales.items()},
        "sensibilidad_personas": {  # umbral +-1 %
            "umbral_x0.99": int(mayores[A < umbral * 0.99].sum()),
            "umbral_x1.01": int(mayores[A < umbral * 1.01].sum()),
        },
    }

    # Caso 4: optimo voraz n = 1 que maximiza N (plazas que faltan que se reducen), residencia de 94 plazas
    plz4 = float(CASO4_PLAZAS)
    cand_zona = [i for i in range(len(xs)) if mayores[i] > 0 and zona_de_mun.get(mun[i]) == CASO4_ZONA]
    cand_todos = [i for i in range(len(xs)) if mayores[i] > 0]
    faltan_media = plazas_faltan(A, umbral, mayores)

    def punto(n_red, k, u=None):
        u = umbral if u is None else u
        n_chk, mejoran, rn = reduce_faltan(A, u, mayores, xs, ys, (xs[k], ys[k]), plz4, CASO3_D0_M)
        return {"seccion": sec["ids"][k], "municipio": mun[k], "municipio_nombre": nombres_mun.get(mun[k]),
                "zona": zona_de_mun.get(mun[k]), "lat": sec["lat"][k], "lon": sec["lon"][k],
                "reduce_faltan": round(n_red, 6), "secciones_que_mejoran": mejoran, "r_nuevo": round(rn, 8)}

    def optimo_n1(cand, u):
        res = ranking_candidatos(A, u, mayores, xs, ys, plz4, CASO3_D0_M, cand)
        return res

    CRITERIO_N = ("maximo de N = plazas que faltan antes - plazas que faltan despues, con el umbral fijo de hoy; candidatos = puntos de "
                  "las secciones con mayores > 0 (de la zona, o de toda la Comunidad); N se cuenta en toda la Comunidad")
    res4 = optimo_n1(cand_zona, umbral)
    n4, k4, _ = res4[0]
    caso4 = {
        "servicio": "residencia", "d0_m": CASO3_D0_M, "plazas": CASO4_PLAZAS, "n": 1, "zona_candidatos": CASO4_ZONA, "referencia": "media",
        "umbral": round(umbral, 6), "candidatos": len(cand_zona), "criterio": CRITERIO_N,
        **punto(n4, k4),
        "faltan_antes": round(faltan_media, 4), "faltan_despues": round(faltan_media - n4, 4),
        "pct_del_maximo_posible": round(100 * n4 / plz4, 3),
        "alternativas": [punto(g, k) for g, k, _ in res4[1:4]],  # 2.a-4.a mejores, por si el empate o la geometria difieren
        "por_referencia": {},
        "nota": "el motor TS debe dar la misma seccion (o una alternativa con el mismo N, tolerancia relativa 1e-6) y el mismo N",
    }
    for nombre, u in umbrales.items():
        g, k, _ = optimo_n1(cand_zona, u)[0]
        caso4["por_referencia"][nombre] = {"umbral": round(u, 6), "faltan_antes": round(plazas_faltan(A, u, mayores), 4), **punto(g, k, u)}

    res4b = optimo_n1(cand_todos, umbral)
    n4b, k4b, _ = res4b[0]
    caso4b = {
        "servicio": "residencia", "d0_m": CASO3_D0_M, "plazas": CASO4_PLAZAS, "n": 1, "zona_candidatos": None, "referencia": "media",
        "umbral": round(umbral, 6), "candidatos": len(cand_todos), "criterio": CRITERIO_N,
        **punto(n4b, k4b),
        "faltan_antes": round(faltan_media, 4), "faltan_despues": round(faltan_media - n4b, 4),
        "pct_del_maximo_posible": round(100 * n4b / plz4, 3),
        "alternativas": [punto(g, k) for g, k, _ in res4b[1:4]],
        "por_referencia": {},
    }
    for nombre, u in umbrales.items():
        g, k, _ = optimo_n1(cand_todos, u)[0]
        caso4b["por_referencia"][nombre] = {"umbral": round(u, 6), "faltan_antes": round(plazas_faltan(A, u, mayores), 4), **punto(g, k, u)}

    # Caso 5: lo que gana un centro colocado en un punto fijo
    p5 = tuple(float(v) for v in proyectar(*CASO5_PUNTO))
    g5, m5 = ganan_distancia(dmin_cs, total, xs, ys, p5, CASO1_RADIO_M)
    n5, mejoran5, r5 = reduce_faltan(A, umbral, mayores, xs, ys, p5, plz4, CASO3_D0_M)
    _, cerca5 = r_nuevo(xs, ys, mayores, p5, plz4, CASO3_D0_M)
    sec_pto = int(np.argmin(np.hypot(xs - p5[0], ys - p5[1])))
    por_ref5 = {}
    for nombre, u in umbrales.items():
        nn, mm, _ = reduce_faltan(A, u, mayores, xs, ys, p5, plz4, CASO3_D0_M)
        por_ref5[nombre] = {"umbral": round(u, 6), "faltan_antes": round(plazas_faltan(A, u, mayores), 4),
                            "reduce_faltan": round(nn, 6), "secciones_que_mejoran": mm,
                            "pct_del_optimo_zona_04": round(100 * nn / caso4["por_referencia"][nombre]["reduce_faltan"], 3)}
    caso5 = {
        "punto": {"lat": CASO5_PUNTO[0], "lon": CASO5_PUNTO[1]},
        "seccion_mas_cercana": sec["ids"][sec_pto], "municipio_mas_cercano": nombres_mun.get(mun[sec_pto]),
        "centro_salud": {
            "radio_m": CASO1_RADIO_M, "ganan": int(round(g5)), "secciones_que_ganan": int(m5.sum()),
            "deficit_antes": caso1["personas"], "deficit_despues": caso1["personas"] - int(round(g5)),
            "margen_minimo_m": round(float(np.min(np.abs(np.hypot(xs - p5[0], ys - p5[1])[dmin_cs > CASO1_RADIO_M] - CASO1_RADIO_M))), 1),
            "distancia_al_centro_mas_cercano_actual_m": round(float(np.hypot(xc - p5[0], yc - p5[1]).min()), 1),
        },
        "residencia": {  # el plan (F4) pide contrastar el simulador de residencias con este mismo punto
            "d0_m": CASO3_D0_M, "plazas": CASO5_PLAZAS_RESIDENCIA, "referencia": "media", "umbral": round(umbral, 6),
            "r_nuevo": round(r5, 8), "mayores_a_menos_de_d0": int(mayores[cerca5].sum()),
            "reduce_faltan": round(n5, 6), "secciones_que_mejoran": mejoran5,
            "faltan_antes": round(faltan_media, 4), "faltan_despues": round(faltan_media - n5, 4),
            "pct_del_maximo_posible": round(100 * n5 / plz4, 3),
            "pct_del_optimo_zona_04": round(100 * n5 / n4, 3) if n4 else None,
            "por_referencia": por_ref5,
        },
    }

    # Caso 6: ranking de municipios en residencias (por 65+ en deficit)
    f6_pct = ranking(mun, d3, mayores, nombres_mun, "pct", CASO6_LIMITE)
    f6_per = ranking(mun, d3, mayores, nombres_mun, "personas", CASO6_LIMITE)
    f6_z04 = ranking(mun, d3, mayores, nombres_mun, "personas", CASO6_LIMITE, filtro=lambda c: zona_de_mun.get(c) == CASO4_ZONA)
    caso6 = {
        "servicio": "residencia", "d0_m": CASO3_D0_M, "nivel": "municipio", "limite": CASO6_LIMITE,
        "criterio": "objetivo = mayores de 65; en_deficit = mayores en secciones con A_i < umbral; pct = en_deficit / objetivo del municipio. Desempates: pct -> personas -> id (o al reves segun el orden)",
        "por_pct": f6_pct, "por_personas": f6_per, "zona_04_por_personas": f6_z04,
        "por_plazas_faltan": ranking_plazas_faltan(mun, A, umbral, mayores, nombres_mun, CASO6_LIMITE),
        "zona_04_por_plazas_faltan": ranking_plazas_faltan(mun, A, umbral, mayores, nombres_mun, CASO6_LIMITE,
                                                           filtro=lambda c: zona_de_mun.get(c) == CASO4_ZONA),
    }

    # Caso 7: optimo voraz con n = 3 (residencia de 94 plazas, N acumulado), zona 04 y toda la Comunidad
    def pasos(cand):
        return [{"seccion": sec["ids"][k], "municipio_nombre": nombres_mun.get(mun[k]), "lat": sec["lat"][k], "lon": sec["lon"][k],
                 "reduce_faltan": round(g, 6), "acumulado": round(ac, 6)} for g, k, ac in optimo_voraz(A, umbral, mayores, xs, ys, plz4, CASO3_D0_M, cand, 3)]

    caso7 = {
        "servicio": "residencia", "d0_m": CASO3_D0_M, "plazas": CASO4_PLAZAS, "n": 3, "referencia": "media", "umbral": round(umbral, 6),
        "criterio": "voraz sobre N: tras cada centro se suma 100*r_nuevo a A en su radio; una seccion elegida no se repite; para si N <= 0",
        "zona_04": pasos(cand_zona), "comunidad": pasos(cand_todos),
    }

    return {
        "version": 2,
        "generado": sec.get("generado", ""),
        "implementacion": "pipeline/donde/referencia.py (independiente del motor TypeScript; fuerza bruta con numpy)",
        "proyeccion": {"R_m": R_TIERRA, "lat_ref": LAT_REF, "formula": "x = R*rad(lon)*cos(rad(lat_ref)); y = R*rad(lat)"},
        "datos": {"secciones": len(sec["ids"]), "anio_poblacion": sec["anio_poblacion"],
                  "poblacion_total": int(pob_total), "mayores_65": int(pob_mayores)},
        "caso1": caso1, "caso2": caso2, "caso3": caso3, "caso4": caso4, "caso4b": caso4b, "caso5": caso5, "caso6": caso6, "caso7": caso7,
    }


def main(datos_dir: Path | None = None, salida: Path | None = None) -> dict:
    datos_dir = Path(datos_dir) if datos_dir else comun.PUBLICO
    salida = Path(salida) if salida else Path(__file__).resolve().parent / "referencia.json"
    resultado = calcular(cargar_datos(datos_dir))
    salida.write_text(json.dumps(resultado, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return resultado


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--datos", default=None, help="directorio con secciones.json, territorios.json y servicios/ (por defecto public/donde)")
    ap.add_argument("--salida", default=None, help="referencia.json de salida (por defecto pipeline/donde/referencia.json)")
    a = ap.parse_args()
    out = main(a.datos, a.salida)
    for k in ("caso1", "caso2", "caso3", "caso4", "caso4b", "caso5", "caso6", "caso7"):
        print(k, json.dumps(out[k], ensure_ascii=False)[:300])
