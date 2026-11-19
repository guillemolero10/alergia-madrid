"""Secciones censales de la Comunidad de Madrid: poblacion por edad (INE) + geometria (INE) -> secciones.json y .geojson.

Fuentes (ver DATOS-DONDE.md):
- Poblacion: INE, Censo anual de poblacion, tabla 69213 (secciones x sexo x edad quinquenal, 1-ene-2021..2025), CC BY 4.0.
- Geometria: INE, seccionado 2025 (SHP ETRS89 UTM 30N), CC BY 4.0. Casa al 100 % con la poblacion de 2025.
- Zona estadistica (nuts4) por municipio: CKAN de la Comunidad, `municipio_comunidad_madrid`, CC BY 4.0.
"""
from __future__ import annotations

import csv
import json
import re
import zipfile
from datetime import date
from pathlib import Path

import numpy as np
import shapefile
import shapely
from shapely.geometry import shape as shp_shape

from alergia import ckan, config
from estatico.extraer_municipios import DS_MUNICIPIOS, RES_MUNICIPIOS_CSV

from . import comun

CPRO_MADRID = "28"
CAPITAL = "079"  # CMUN de Madrid capital
TOLERANCIA_M = 20.0  # simplificacion (metros, en UTM)
DECIMALES = 5  # coordenadas WGS84 (~1 m)

# 21 tramos del censo: 0-4 ... 95-99, 100+. Indice del tramo -> limite inferior de edad.
N_TRAMOS = 21
ETIQUETAS_TRAMOS = [f"{5 * i}-{5 * i + 4}" for i in range(20)] + ["100+"]
I_0_14 = slice(0, 3)  # 0-4, 5-9, 10-14
I_65_MAS = slice(13, N_TRAMOS)  # 65-69 ...
I_75_MAS = slice(15, N_TRAMOS)  # 75-79 ...


def tramo_de_etiqueta(edad: str) -> int | None:
    """«De 5 a 9 años» -> 1; «100 y más años» -> 20; «Todas las edades» -> None."""
    m = re.match(r"De (\d+) a \d+ años", edad.strip())
    if m:
        return int(m.group(1)) // 5
    if edad.strip().startswith("100 y"):
        return 20
    return None


def leer_censo(ruta: Path) -> dict[int, dict[str, np.ndarray]]:
    """{anio: {cusec: array de 21 tramos}} solo sexo «Total». Secciones que no existen ese anio no aparecen.

    Tambien comprueba que la suma de tramos coincide con «Todas las edades» (si el INE trae ambos).
    """
    res: dict[int, dict[str, np.ndarray]] = {}
    totales: dict[tuple[int, str], int] = {}
    with open(ruta, encoding="utf-8-sig", newline="") as f:
        lector = csv.reader(f, delimiter=";")
        cab = next(lector)
        assert cab[:7] == ["Provincias", "Municipios", "Secciones", "Sexo", "Edad", "Periodo", "Total"], cab
        for provincia, _mun, secc, sexo, edad, periodo, total in lector:
            if not secc or sexo != "Total":
                continue
            v = comun.entero_ine(total)
            if v is None:
                continue
            cusec = secc.split(" ", 1)[0]
            anio = int(periodo)
            t = tramo_de_etiqueta(edad)
            if t is None:
                totales[(anio, cusec)] = v
                continue
            res.setdefault(anio, {}).setdefault(cusec, np.zeros(N_TRAMOS, dtype=np.int64))[t] = v
    for (anio, cusec), tot in totales.items():
        suma = int(res.get(anio, {}).get(cusec, np.zeros(1)).sum())
        if suma != tot:
            raise ValueError(f"{cusec} {anio}: suma de tramos {suma} != total {tot}")
    return res


def grupos_edad(v: np.ndarray) -> dict[str, float]:
    """Grupos que se publican a partir de los 21 tramos. 3-16 es una ESTIMACION (reparto uniforme en el tramo)."""
    return {
        "total": float(v.sum()),
        "0_14": float(v[I_0_14].sum()),
        # 3 a 16 anos = 3/5 de 0-4 (3 y 4 anos) + 5-9 + 10-14 + 2/5 de 15-19 (15 y 16 anos). El INE solo da tramos de 5.
        "3_16": 0.6 * float(v[0]) + float(v[1]) + float(v[2]) + 0.4 * float(v[3]),
        "65_mas": float(v[I_65_MAS].sum()),
        "75_mas": float(v[I_75_MAS].sum()),
    }


def extraer_seccionado(zip_ruta: Path, destino: Path) -> Path:
    """Extrae los 4 ficheros del SHP con nombre fijo (el zip trae «Espa?a_...» con la n rota). Devuelve el prefijo."""
    prefijo = destino / "SECC_CE_20250101"
    if prefijo.with_suffix(".shp").exists():
        return prefijo
    destino.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_ruta) as z:
        for n in z.namelist():
            ext = n.rsplit(".", 1)[-1].lower()
            if not n.endswith("/") and ext in {"shp", "shx", "dbf", "prj", "cpg"}:
                prefijo.with_suffix("." + ext).write_bytes(z.read(n))
    return prefijo


def leer_geometrias(prefijo: Path, cpro: str = CPRO_MADRID) -> tuple[list[dict], list]:
    """(atributos, geometrias shapely en UTM 30N) de las secciones de la provincia `cpro`, en el orden de CUSEC."""
    sf = shapefile.Reader(str(prefijo), encoding="1252")  # el .cpg del INE declara 1252
    nombres = [c[0] for c in sf.fields[1:]]
    attrs, geoms = [], []
    for i, rec in enumerate(sf.iterRecords()):
        d = dict(zip(nombres, rec))
        if d["CPRO"] != cpro:
            continue
        g = shp_shape(sf.shape(i).__geo_interface__)
        if not g.is_valid:
            g = shapely.make_valid(g)
        attrs.append(d)
        geoms.append(g)
    orden = sorted(range(len(attrs)), key=lambda k: attrs[k]["CUSEC"])
    return [attrs[k] for k in orden], [geoms[k] for k in orden]


def simplificar(geoms: list, tolerancia: float = TOLERANCIA_M) -> list:
    """Simplifica como una cobertura: las fronteras compartidas se simplifican igual en las dos secciones
    (no aparecen huecos ni solapes entre vecinas), a diferencia de simplificar cada poligono por separado."""
    return list(shapely.coverage_simplify(np.array(geoms, dtype=object), tolerancia, simplify_boundary=True))


def _redondear(g):
    # set_precision ajusta a la rejilla de 1e-5 grados sin crear anillos invalidos (np.round los dejaba autotocados)
    return shapely.set_precision(g, 10.0**-DECIMALES)


def a_geojson_wgs84(g) -> dict:
    """Geometria UTM -> geometria GeoJSON en WGS84 con 5 decimales."""
    def tr(coords):
        x, y = comun.a_wgs84(coords[:, 0], coords[:, 1])
        return np.column_stack([x, y])

    return shapely.geometry.mapping(_redondear(shapely.transform(g, tr)))


def zonas_por_municipio(ruta_csv: Path) -> dict[str, str]:
    """INE de 5 cifras -> codigo nuts4 («04» = Sur Metropolitano)."""
    return {f["municipio_codigo_ine"].strip()[:5]: f["nuts4_codigo"].strip() for f in ckan.leer_csv_auto(ruta_csv)}


def obtener_entradas(cache: Path = comun.CACHE) -> dict[str, Path]:
    """Descarga (si no estan en cache) el censo del INE (148 MB), el seccionado (60 MB) y la tabla de municipios."""
    censo = comun.asegurar_descarga(comun.URL_CENSO_INE, cache / "ine_censo_69213.csv")
    zip_ = comun.asegurar_descarga(comun.URL_SECCIONADO_INE, cache / "ine_seccionado_2025.zip")
    with ckan.cliente() as c:
        p = ckan.package_show(c, DS_MUNICIPIOS)
        mun = ckan.descargar(c, ckan.url_recurso(p, RES_MUNICIPIOS_CSV), cache / "municipios_ckan.csv")
    return {"censo": censo, "zip": zip_, "municipios": mun}


def construir(censo: dict[int, dict[str, np.ndarray]], attrs: list[dict], geoms: list, zonas: dict[str, str]) -> dict:
    """Une poblacion y geometria. Devuelve todo lo que necesitan secciones.json, geojson, territorios y servicios."""
    anio = comun.ANIO_POBLACION
    pob25 = censo[anio]
    ids = [a["CUSEC"] for a in attrs]
    if set(ids) != set(pob25):
        raise ValueError(f"las secciones del censo {anio} y del seccionado no coinciden: "
                         f"{len(set(pob25) - set(ids))} sin geometria, {len(set(ids) - set(pob25))} sin poblacion")
    simples = simplificar(geoms)
    puntos = [g.representative_point() for g in geoms]  # punto interior de la geometria original, no el centroide
    lon, lat = comun.a_wgs84(np.array([p.x for p in puntos]), np.array([p.y for p in puntos]))
    area_km2 = [g.area / 1e6 for g in geoms]
    grupos = [grupos_edad(pob25[i]) for i in ids]
    mun = [f"mun:{a['CUMUN']}" for a in attrs]
    distrito = [f"dis:{a['CUDIS']}" if a["CMUN"] == CAPITAL else None for a in attrs]
    zona = []
    for a in attrs:
        if a["CUMUN"] not in zonas:
            raise ValueError(f"municipio {a['CUMUN']} sin zona estadistica")
        zona.append(zonas[a["CUMUN"]])
    return {
        "ids": ids, "mun": mun, "distrito": distrito, "zona": zona,
        "lat": [round(float(x), DECIMALES) for x in lat], "lon": [round(float(x), DECIMALES) for x in lon],
        "area_km2": [round(a, 2) for a in area_km2],
        "grupos": grupos, "geoms": geoms, "simples": simples, "nombres_mun": {a["CUMUN"]: a["NMUN"] for a in attrs},
    }


def a_json(sec: dict, hoy: date | None = None) -> dict:
    """secciones.json: arrays por columnas. Las poblaciones se redondean a entero (solo 3-16 es fraccionaria)."""
    g = sec["grupos"]
    pob = {k: [int(round(x[k])) for x in g] for k in ("total", "0_14", "3_16", "65_mas", "75_mas")}
    return {
        "version": comun.VERSION,
        "generado": (hoy or date.today()).isoformat(),
        "anio_poblacion": comun.ANIO_POBLACION,
        "fuente_poblacion": "INE, Censo anual de poblacion (1-ene-2025), tabla 69213, CC BY 4.0: "
                            "https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/69213.csv?nocab=1",
        "metodo_edades": "directo (0_14, 65_mas, 75_mas); 3_16 estimado (3/5 de 0-4 + 5-9 + 10-14 + 2/5 de 15-19, reparto uniforme en el tramo)",
        "fuentes": {
            "poblacion": "INE, Censo anual de poblacion, tabla 69213 (CC BY 4.0)",
            "geometria": "INE, seccionado 2025 (CC BY 4.0): " + comun.URL_SECCIONADO_INE,
            "zona": "Comunidad de Madrid, municipio_comunidad_madrid (CC BY 4.0): " + config.CKAN_CATALOGO + DS_MUNICIPIOS,
        },
        "ids": sec["ids"], "mun": sec["mun"], "distrito": sec["distrito"], "zona": sec["zona"],
        "lat": sec["lat"], "lon": sec["lon"], "area_km2": sec["area_km2"],
        "pob": pob,
    }


def a_geojson(sec: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "features": [
            {"type": "Feature", "properties": {"id": i}, "geometry": a_geojson_wgs84(g)}
            for i, g in zip(sec["ids"], sec["simples"])
        ],
    }


def serie_poblacion(censo: dict[int, dict[str, np.ndarray]]) -> dict:
    """Serie 2021-2025 por seccion y tramo de edad (sexo total) para la proyeccion a 2030 (D7).

    matriz[i, a, t] = habitantes de la seccion ids[i] en el anio anios[a] y el tramo t; -1 si la seccion no existe ese anio.
    Incluye todas las secciones que existieron en algun anio (las de 2021 que cambian de codigo estan en ids).
    """
    anios = sorted(censo)
    ids = sorted({i for a in anios for i in censo[a]})
    pos = {i: k for k, i in enumerate(ids)}
    m = np.full((len(ids), len(anios), N_TRAMOS), -1, dtype=np.int32)
    for a, anio in enumerate(anios):
        for i, v in censo[anio].items():
            m[pos[i], a, :] = v
    return {"ids": np.array(ids), "anios": np.array(anios), "tramos": np.array(ETIQUETAS_TRAMOS), "matriz": m}


def escribir_json(ruta: Path, obj: dict) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def main(salida: Path, cache: Path = comun.CACHE, intermedios: Path = comun.INTERMEDIOS) -> dict:
    ent = obtener_entradas(cache)
    censo = leer_censo(ent["censo"])
    prefijo = extraer_seccionado(ent["zip"], cache / "ine_seccionado_2025")
    attrs, geoms = leer_geometrias(prefijo)
    sec = construir(censo, attrs, geoms, zonas_por_municipio(ent["municipios"]))
    escribir_json(salida / "secciones.json", a_json(sec))
    escribir_json(salida / "secciones.geojson", a_geojson(sec))
    intermedios.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(intermedios / "poblacion_serie_2021_2025.npz", **serie_poblacion(censo))
    # Geometria original en UTM para asignar centros a secciones (servicios.py): WKB en hex.
    escribir_json(intermedios / "secciones_utm.json", {"ids": sec["ids"], "wkb": [g.wkb_hex for g in geoms]})
    print(f"{len(sec['ids'])} secciones, poblacion {sum(g['total'] for g in sec['grupos']):,.0f}")
    return sec


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=comun.PUBLICO)
    main(ap.parse_args().salida)
