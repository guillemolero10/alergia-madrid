"""Construye datos-estaticos/lugares.json y datos-estaticos/rejilla_viento.json.

Uso:  uv run --project pipeline python -m estatico.construir_lugares [--salida datos-estaticos]
Fuentes (CKAN datos.comunidad.madrid, CC BY 4.0): calidad_aire_estaciones, captadores_polen,
mediciones_polen (solo para saber que captadores tienen datos en el anio en curso).
"""
from __future__ import annotations

import argparse
import json
import unicodedata
from datetime import date
from pathlib import Path

from alergia import ckan, config
from alergia.geo import haversine_km

UMBRAL_LEJANA_KM = 5.0
MADRID_ID = "mun:28079"
# Madrid capital no tiene estacion en la red de la Comunidad. Coordenada aproximada del centro (Puerta del Sol),
# introducida a mano (no sale de ninguna fuente CKAN).
MADRID = {"nombre": "Madrid", "lat": 40.4168, "lon": -3.7038}

# Nombre oficial del municipio cuando difiere del texto del CSV de estaciones.
NOMBRES_MUNICIPIO = {
    "Collado-Villalba": "Collado Villalba",
    "Rivas Vaciamadrid": "Rivas-Vaciamadrid",
    "Orusco del Tajuña": "Orusco de Tajuña",
    "Las Rozas": "Las Rozas de Madrid",
    "El Atazar": "El Atazar",
}
ALIAS_EXTRA = {
    "Alcalá de Henares": ["alcala"],
    "Collado Villalba": ["villalba"],
    "Las Rozas de Madrid": ["rozas", "las rozas"],
    "San Sebastián de los Reyes": ["sanse"],
    "Rivas-Vaciamadrid": ["rivas"],
    "Torrejón de Ardoz": ["torrejon"],
    "Pozuelo de Alarcón": ["pozuelo"],
    "El Atazar": ["atazar"],
    "Rascafría": ["puerto de cotos", "cotos"],
    "San Martín de Valdeiglesias": ["san martin"],
    "Villarejo de Salvanés": ["villarejo"],
    "Arganda del Rey": ["arganda"],
    "Orusco de Tajuña": ["orusco"],
    "Guadalix de la Sierra": ["guadalix"],
    "Colmenar Viejo": ["colmenar"],
    "Villa del Prado": ["villa del prado"],
    "Madrid": ["madrid capital", "la capital"],
}
# Columnas de analizador del CSV de estaciones -> nombre en `mide`.
ANALIZADORES = {
    "estacion_analizador_NO2": "no2",
    "estacion_analizador_O3": "o3",
    "estacion_analizador_O3Q": "o3",  # ozono por quimioluminiscencia (Arganda del Rey); misma magnitud 14
    "estacion_analizador_PM10": "pm10",
    "estacion_analizador_PM2_5": "pm25",
    "estacion_analizador_PM1": "pm1",
    "estacion_analizador_SO2": "so2",
}


def sin_acentos(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def alias_de(nombre: str) -> list[str]:
    base = sin_acentos(nombre).lower()
    res = [base] + ALIAS_EXTRA.get(nombre, [])
    return list(dict.fromkeys(res))


def mide_de(f: dict) -> list[str]:
    res = []
    for col, nombre in ANALIZADORES.items():
        if f.get(col, "").strip().lower() == "si" and nombre not in res:
            res.append(nombre)
    return res


def parsear_estaciones(filas: list[dict]) -> list[dict]:
    est = []
    for f in filas:
        cod = f["estacion_codigo"].strip()
        lat = ckan.numero(f["estacion_coord_latitud"])
        lon = ckan.numero(f["estacion_coord_longitud"])
        # Comprobacion: Comunidad de Madrid (lat 39,8-41,2; lon -4,6 a -3,0). Si no, hay un dato mal capturado.
        if not (39.8 <= lat <= 41.2 and -4.6 <= lon <= -3.0):
            raise ValueError(f"estacion {cod}: coordenadas fuera de la Comunidad ({lat}, {lon})")
        muni = NOMBRES_MUNICIPIO.get(f["estacion_municipio"].strip(), f["estacion_municipio"].strip())
        est.append(
            {
                "id": f"est:{cod}",
                "nombre": muni,
                "municipio": muni,
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "tipo": sin_acentos(f["estacion_tipo_estacion"].strip()).lower(),  # trafico | fondo | industrial
                "mide": mide_de(f),
                "_ine": "mun:" + cod[:5],
            }
        )
    return sorted(est, key=lambda e: e["id"])


def parsear_captadores(filas: list[dict], activos: set[str]) -> list[dict]:
    cap = []
    for f in filas:
        cod = f["codigo"].strip()
        cap.append(
            {
                "id": f"cap:{cod}",
                "nombre": f["nombre"].strip(),
                "localidad": f["direccion_localidad"].strip(),
                "lat": round(ckan.numero(f["lat_epsg4258"]), 6),
                "lon": round(ckan.numero(f["long_epsg4258"]), 6),
                "activo": cod in activos,
            }
        )
    return sorted(cap, key=lambda c: c["id"])


def mas_cercano(lat: float, lon: float, lugares: list[dict]) -> tuple[dict, float]:
    d, l = min(((haversine_km(lat, lon, x["lat"], x["lon"]), x) for x in lugares), key=lambda t: t[0])
    return l, round(d, 2)


def construir(estaciones: list[dict], captadores: list[dict]) -> dict:
    """Empareja por haversine. Cada estacion/municipio se asocia al captador ACTIVO mas cercano
    (un captador sin datos en el anio en curso no sirve para el riesgo)."""
    activos = [c for c in captadores if c["activo"]]
    for e in estaciones:
        cap, d = mas_cercano(e["lat"], e["lon"], activos)
        e["captador"], e["dist_captador_km"] = cap["id"], d
    municipios = []
    for e in estaciones:
        # Punto del municipio = coordenada de su estacion (no hay centroides en las fuentes).
        cap, dc = mas_cercano(e["lat"], e["lon"], activos)
        municipios.append(
            {
                "id": e["_ine"],
                "nombre": e["municipio"],
                "alias": alias_de(e["municipio"]),
                "lat": e["lat"],
                "lon": e["lon"],
                "estacion": e["id"],
                "dist_estacion_km": 0.0,
                "captador": cap["id"],
                "dist_captador_km": dc,
                "cobertura_aire": "buena",
            }
        )
    est_m, de = mas_cercano(MADRID["lat"], MADRID["lon"], estaciones)
    cap_m, dc = mas_cercano(MADRID["lat"], MADRID["lon"], activos)
    municipios.append(
        {
            "id": MADRID_ID,
            "nombre": MADRID["nombre"],
            "alias": alias_de("Madrid"),
            "lat": MADRID["lat"],
            "lon": MADRID["lon"],
            "estacion": est_m["id"],
            "dist_estacion_km": de,
            "captador": cap_m["id"],
            "dist_captador_km": dc,
            "cobertura_aire": "lejana" if de > UMBRAL_LEJANA_KM else "buena",
        }
    )
    municipios.sort(key=lambda m: m["id"])
    for e in estaciones:
        del e["_ine"]
    return {"estaciones": estaciones, "captadores": captadores, "municipios": municipios}


def captadores_con_datos(filas_polen: list[dict], anio: int) -> set[str]:
    """Captadores con al menos un valor no vacio en el anio."""
    res = set()
    for f in filas_polen:
        if f["fecha_lectura"].startswith(str(anio)) and f["granos_de_polen_x_metro_cubico"].strip():
            res.add(f["captador"].strip())
    return res


def rejilla() -> dict:
    """42 puntos cada 0,25 grados: lat 39,90-41,15 (6 valores) x lon -4,55 a -3,05 (7 valores)."""
    lats = [round(39.90 + 0.25 * i, 2) for i in range(6)]
    lons = [round(-4.55 + 0.25 * j, 2) for j in range(7)]
    puntos = [{"lat": la, "lon": lo} for la in lats for lo in lons]
    assert len(puntos) == 42 and lats[-1] == 41.15 and lons[-1] == -3.05
    return {"paso_grados": 0.25, "puntos": puntos}


def main(salida: Path, cache: Path) -> None:
    anio = date.today().year
    with ckan.cliente() as c:
        p_est = ckan.package_show(c, config.DS_ESTACIONES)
        p_cap = ckan.package_show(c, config.DS_CAPTADORES)
        p_pol = ckan.package_show(c, config.DS_POLEN)
        f_est = ckan.descargar(c, ckan.url_recurso(p_est, config.RES_ESTACIONES_CSV), cache / "estaciones.csv")
        f_cap = ckan.descargar(c, ckan.url_recurso(p_cap, config.RES_CAPTADORES_CSV), cache / "captadores.csv")
        f_pol = ckan.descargar(c, ckan.url_recurso(p_pol, config.RES_POLEN_2026_CSV), cache / "polen_actual.csv")
    est = parsear_estaciones(ckan.leer_csv(f_est))
    activos = captadores_con_datos(ckan.leer_csv(f_pol), anio)
    cap = parsear_captadores(ckan.leer_csv(f_cap, encoding="latin-1"), activos)
    datos = construir(est, cap)
    datos = {
        "generado": date.today().isoformat(),
        "fuentes": {
            "estaciones": f"{config.CKAN_CATALOGO}{config.DS_ESTACIONES} (CC BY 4.0)",
            "captadores": f"{config.CKAN_CATALOGO}{config.DS_CAPTADORES} (CC BY 4.0)",
            "captador_activo": f"{config.CKAN_CATALOGO}{config.DS_POLEN}: con datos no vacios en {anio}",
            "madrid_capital": "coordenada aproximada introducida a mano (Puerta del Sol); no hay estacion de la Comunidad en la capital",
        },
        **datos,
    }
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "lugares.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (salida / "rejilla_viento.json").write_text(json.dumps(rejilla(), indent=2) + "\n", encoding="utf-8")
    print(f"{len(est)} estaciones, {len(cap)} captadores ({len(activos)} activos), {len(datos['municipios'])} municipios")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=config.ESTATICOS)
    ap.add_argument("--cache", type=Path, default=config.CACHE)
    a = ap.parse_args()
    main(a.salida, a.cache)
