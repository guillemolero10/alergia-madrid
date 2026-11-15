"""Construye datos-estaticos/umbrales.json.

Uso:  uv run --project pipeline python -m estatico.construir_umbrales [--salida datos-estaticos]

- Aire: cortes del Indice Nacional de Calidad del Aire, transcritos del BOE (Orden TEC/351/2019 y
  Resolucion de 2-sep-2020, BOE-A-2020-10426, que sustituye el anexo). NO se calculan: son constantes oficiales.
- Polen: percentiles P75 y P90 por tipo sobre los dias con valor > 0 de 2010-2019, juntando todos los captadores
  (conjunto mediciones_polen_historico). Aproximacion propia, no hay umbrales oficiales en cifras.
"""
from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import date
from pathlib import Path

from alergia import ckan, config
from alergia.reglas import nivel_polen  # noqa: F401  (se movio a reglas.py; se reexporta para los tests)
from estatico.construir_lugares import sin_acentos

BOE_2019 = "https://www.boe.es/eli/es/o/2019/03/18/tec351"
BOE_2020 = "https://www.boe.es/diario_boe/txt.php?id=BOE-A-2020-10426"
FECHA_CONSULTA_BOE = "2026-11-15"

CATEGORIAS = ["buena", "razonablemente_buena", "regular", "desfavorable", "muy_desfavorable", "extremadamente_desfavorable"]
# Maximo de cada banda (ug/m3), transcrito de la tabla del anexo de BOE-A-2020-10426 (pag. 75837).
BANDAS_INCA = {
    "no2": [40, 90, 120, 230, 340, 1000],
    "o3": [50, 100, 130, 240, 380, 800],
    "pm10": [20, 40, 50, 100, 150, 1200],
    "pm25": [10, 20, 25, 50, 75, 800],
}
# Agrupacion del plan: bajo = buena + razonablemente buena; medio = regular; alto = desfavorable o peor.
PROMEDIO = {
    "no2": ("hora", "media de la ultima hora"),
    "o3": ("media_movil_8h", "media movil de las ultimas 8 horas"),
    "pm10": ("media_movil_24h", "media movil de las ultimas 24 horas"),
    "pm25": ("media_movil_24h", "media movil de las ultimas 24 horas"),
}


def aire() -> dict:
    res = {}
    for var, maximos in BANDAS_INCA.items():
        clave, texto = PROMEDIO[var]
        res[var] = {
            "unidad": "ug/m3",
            "promedio": clave,
            "promedio_texto": texto,
            "bajo_max": maximos[1],  # <= : buena + razonablemente buena
            "medio_max": maximos[2],  # <= : regular; por encima = alto
            "bandas_inca": [{"categoria": c, "max": m} for c, m in zip(CATEGORIAS, maximos)],
        }
    return res


def slug(tipo: str) -> str:
    t = sin_acentos(tipo).lower()
    t = re.sub(r"\(.*?\)", "", t)
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


def percentil(valores: list[float], q: float) -> float:
    """Percentil con interpolacion lineal (equivalente a numpy.percentile, method='linear')."""
    v = sorted(valores)
    if not v:
        raise ValueError("sin valores")
    pos = (len(v) - 1) * q / 100
    i = int(pos)
    j = min(i + 1, len(v) - 1)
    return v[i] + (v[j] - v[i]) * (pos - i)


def acumular(filas: list[dict], destino: dict[str, list[float]], nombres: dict[str, str]) -> None:
    """Anade a `destino[slug]` los valores > 0 (vacio = sin dato, se ignora)."""
    for f in filas:
        v = ckan.numero(f["granos_de_polen_x_metro_cubico"])
        if v is None or v <= 0:
            continue
        s = slug(f["tipo_polinico"])
        nombres.setdefault(s, f["tipo_polinico"].strip())
        destino[s].append(v)


def umbrales_polen(valores: dict[str, list[float]], nombres: dict[str, str]) -> dict:
    return {
        s: {
            "nombre": nombres[s],
            "p75": round(percentil(v, 75), 1),
            "p90": round(percentil(v, 90), 1),
            "n_dias_positivos": len(v),
        }
        for s, v in sorted(valores.items())
    }


def main(salida: Path, cache: Path) -> None:
    valores: dict[str, list[float]] = defaultdict(list)
    nombres: dict[str, str] = {}
    with ckan.cliente() as c:
        urls = ckan.recursos_csv_por_anio(ckan.package_show(c, config.DS_POLEN_HISTORICO))
        for a in config.ANIOS_UMBRAL_POLEN:
            f = ckan.descargar(c, urls[a], cache / "polen" / f"{a}.csv")
            acumular(ckan.leer_csv_auto(f), valores, nombres)
    tipos = umbrales_polen(valores, nombres)
    datos = {
        "generado": date.today().isoformat(),
        "niveles": "bajo | medio | alto (sin_dato aparte)",
        "aire": {
            "fuente": {
                "norma": "Orden TEC/351/2019 (Indice Nacional de Calidad del Aire), anexo sustituido por la Resolucion de 2-sep-2020 (BOE-A-2020-10426, BOE 10-sep-2020)",
                "url": [BOE_2019, BOE_2020],
                "consultado": FECHA_CONSULTA_BOE,
                "agrupacion": "bajo = buena + razonablemente buena; medio = regular; alto = desfavorable o peor",
                "regla": "bajo si valor <= bajo_max; medio si valor <= medio_max; alto si mayor",
            },
            **aire(),
        },
        "polen": {
            "fuente": f"{config.CKAN_CATALOGO}{config.DS_POLEN_HISTORICO} (CC BY 4.0), CSV 2010-2019",
            "metodo": "P75 y P90 por tipo sobre los dias con valor > 0, juntando todos los captadores; bajo < P75 <= medio < P90 <= alto",
            "periodo": "2010-2019",
            "unidad": "granos/m3",
            "aproximacion_propia": True,
            "tipos": tipos,
        },
    }
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "umbrales.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    g = tipos["gramineas"]
    print(f"{len(tipos)} tipos de polen; gramineas P75={g['p75']} P90={g['p90']} (n={g['n_dias_positivos']})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=config.ESTATICOS)
    ap.add_argument("--cache", type=Path, default=config.CACHE)
    a = ap.parse_args()
    main(a.salida, a.cache)
