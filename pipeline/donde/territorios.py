"""territorios.json: 179 municipios + 21 distritos de la capital + 11 zonas estadisticas, con contornos disueltos de las secciones.

Fuentes: nombres y punto de cada municipio de `datos-estaticos/lugares.json` (IGN + INE, ya usado en el aire); zonas del CKAN
`municipio_comunidad_madrid`; poblacion del Censo anual del INE 2025 (suma de secciones); contornos = union de las secciones
simplificadas del seccionado del INE 2025 (CC BY 4.0), sin depender de ninguna otra geometria.
"""
from __future__ import annotations

import json
from collections import defaultdict
from datetime import date
from pathlib import Path

import shapely

from alergia import ckan, config
from estatico.extraer_municipios import DS_MUNICIPIOS

from . import comun
from .secciones import a_geojson_wgs84, DECIMALES

# Distritos de Madrid capital (codigo INE de 2 cifras -> nombre oficial). Verificado contra el campo `direccion_distrito`
# del registro de centros sociales por punto en poligono (ver DATOS-DONDE.md y el test de coherencia).
DISTRITOS_MADRID = {
    "01": "Centro", "02": "Arganzuela", "03": "Retiro", "04": "Salamanca", "05": "Chamartín", "06": "Tetuán",
    "07": "Chamberí", "08": "Fuencarral-El Pardo", "09": "Moncloa-Aravaca", "10": "Latina", "11": "Carabanchel",
    "12": "Usera", "13": "Puente de Vallecas", "14": "Moratalaz", "15": "Ciudad Lineal", "16": "Hortaleza",
    "17": "Villaverde", "18": "Villa de Vallecas", "19": "Vicálvaro", "20": "San Blas-Canillejas", "21": "Barajas",
}

# Palabras con las que el usuario nombra una zona («en el sur»). Criterio propio, declarado; `sierra` apunta a 3 zonas
# y `norte` a 2 (resolverLugar devuelve todas las que coincidan).
ALIAS_ZONAS = {
    "01": ["capital", "madrid capital", "ciudad de madrid"],
    "02": ["norte"],
    "03": ["este", "corredor del henares"],
    "04": ["sur"],
    "05": ["oeste"],
    "06": ["sierra", "sierra norte", "norte"],
    "07": ["nordeste", "noreste"],
    "08": ["sudeste", "sureste"],
    "09": ["sudoeste", "suroeste"],
    "10": ["sierra", "sierra sur"],
    "11": ["sierra", "sierra central"],
}

TRAMOS_TAMANO = ["<2.000", "2.000-10.000", "10.001-50.000", "50.001-100.000", ">100.000"]


def tramo_tamano(poblacion: int) -> str:
    """Tramos de tamano del INE (los extremos del plan: «2.000-10.000» incluye el 2.000 y el 10.000)."""
    if poblacion < 2000:
        return TRAMOS_TAMANO[0]
    if poblacion <= 10000:
        return TRAMOS_TAMANO[1]
    if poblacion <= 50000:
        return TRAMOS_TAMANO[2]
    if poblacion <= 100000:
        return TRAMOS_TAMANO[3]
    return TRAMOS_TAMANO[4]


def _bbox_wgs84(g) -> list[float]:
    x0, y0, x1, y1 = g.bounds
    lons, lats = comun.a_wgs84([x0, x1], [y0, y1])
    return [round(float(lons[0]), DECIMALES), round(float(lats[0]), DECIMALES),
            round(float(lons[1]), DECIMALES), round(float(lats[1]), DECIMALES)]


def construir(sec: dict, lugares: dict, filas_municipios: list[dict], hoy: date | None = None) -> dict:
    """`sec` es la salida de `secciones.construir`; `lugares` el contenido de lugares.json."""
    por_mun: dict[str, list[int]] = defaultdict(list)
    por_dis: dict[str, list[int]] = defaultdict(list)
    for k, (m, d) in enumerate(zip(sec["mun"], sec["distrito"])):
        por_mun[m].append(k)
        if d:
            por_dis[d].append(k)
    pob = [g["total"] for g in sec["grupos"]]
    lug = {m["id"]: m for m in lugares["municipios"]}
    zonas_nombre = {f["nuts4_codigo"].strip(): f["nuts4_nombre"].strip() for f in filas_municipios}
    if set(por_mun) != set(lug):
        raise ValueError(f"municipios distintos: {sorted(set(por_mun) ^ set(lug))}")

    municipios, mun_geo = [], []
    for mid in sorted(por_mun):
        idx = por_mun[mid]
        g = shapely.union_all([sec["simples"][k] for k in idx])
        p = int(round(sum(pob[k] for k in idx)))
        l = lug[mid]
        municipios.append({
            "id": mid, "nombre": l["nombre"], "zona": sec["zona"][idx[0]], "tramo": tramo_tamano(p),
            "poblacion": p, "lat": l["lat"], "lon": l["lon"], "bbox": _bbox_wgs84(g),
        })
        mun_geo.append({"type": "Feature", "properties": {"id": mid}, "geometry": a_geojson_wgs84(g)})

    distritos, dis_geo = [], []
    for did in sorted(por_dis):
        idx = por_dis[did]
        cod = did[-2:]
        g = shapely.union_all([sec["simples"][k] for k in idx])
        punto = shapely.union_all([sec["geoms"][k] for k in idx]).representative_point()
        lon, lat = comun.a_wgs84(punto.x, punto.y)
        distritos.append({
            "id": did, "nombre": DISTRITOS_MADRID[cod], "poblacion": int(round(sum(pob[k] for k in idx))),
            "lat": round(float(lat), DECIMALES), "lon": round(float(lon), DECIMALES), "bbox": _bbox_wgs84(g),
        })
        dis_geo.append({"type": "Feature", "properties": {"id": did}, "geometry": a_geojson_wgs84(g)})

    zonas = [{"codigo": c, "nombre": zonas_nombre[c], "alias": ALIAS_ZONAS[c]} for c in sorted(zonas_nombre)]
    return {
        "version": comun.VERSION,
        "generado": (hoy or date.today()).isoformat(),
        "anio_poblacion": comun.ANIO_POBLACION,
        "fuentes": {
            "poblacion": "INE, Censo anual de poblacion, tabla 69213 (CC BY 4.0)",
            "contornos": "INE, seccionado 2025 (CC BY 4.0), union de las secciones simplificadas: " + comun.URL_SECCIONADO_INE,
            "nombres_y_puntos": "datos-estaticos/lugares.json (IGN y INE)",
            "zonas": "Comunidad de Madrid, municipio_comunidad_madrid (CC BY 4.0): " + config.CKAN_CATALOGO + DS_MUNICIPIOS,
        },
        "tramos_tamano": TRAMOS_TAMANO,
        "municipios": municipios,
        "distritos": distritos,
        "zonas": zonas,
        "municipios_geo": {"type": "FeatureCollection", "features": mun_geo},
        "distritos_geo": {"type": "FeatureCollection", "features": dis_geo},
    }


def main(salida: Path, sec: dict, cache: Path = comun.CACHE) -> dict:
    lugares = json.loads((config.ESTATICOS / "lugares.json").read_text(encoding="utf-8"))
    filas = ckan.leer_csv_auto(cache / "municipios_ckan.csv")
    t = construir(sec, lugares, filas)
    ruta = salida / "territorios.json"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(t, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(t['municipios'])} municipios, {len(t['distritos'])} distritos, {len(t['zonas'])} zonas")
    return t
