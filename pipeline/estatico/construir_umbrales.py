"""Construye datos-estaticos/umbrales.json.

Uso:  uv run --project pipeline python -m estatico.construir_umbrales [--salida datos-estaticos]

- Aire: cortes del Indice Nacional de Calidad del Aire, transcritos del BOE (Orden TEC/351/2019 y
  Resolucion de 2-sep-2020, BOE-A-2020-10426, que sustituye el anexo). NO se calculan: son constantes oficiales.
- Polen (cortes `medio_min` / `alto_min` por tipo; bajo < medio_min <= medio < alto_min <= alto), por orden de prioridad:
  1. `oficial_palinocam`: umbrales vigentes de la Red PALINOCAM (Comunidad de Madrid, calculados con 2010-2019),
     tabla 15 del informe del Ayuntamiento de Madrid. Medio = P95 (P90 en CUPR, POAC, QUER); alto = P97 (P95 en esos tres).
     El nivel «muy alto» de la Red se agrupa en `alto`.
  2. `clinico_rea`: categorias de la Red Espanola de Aerobiologia (umbral de concentracion para que un porcentaje
     bajo/medio/alto de la poblacion sensible tenga sintomas), para tipos que PALINOCAM no publica.
  3. `percentil_con_suelo`: resto. P75/P90 de 2010-2019 (dias con valor > 0) con un suelo absoluto PROPIO
     (SUELO_MEDIO / SUELO_ALTO): unos pocos granos nunca dan medio o alto.
  P75, P90 y n_dias_positivos se guardan para todos los tipos como referencia.
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


# --- Polen -------------------------------------------------------------------------------------------------------
URL_PALINOCAM = (
    "https://airedemadrid.madrid.es/UnidadesDescentralizadas/Sostenibilidad/CalidadAire/Portal/02_Actuaciones/"
    "02%20Ficheros/Informe_Analisis_Polen_Noviembre_2025.pdf"
)
FUENTE_PALINOCAM = (
    "Umbrales vigentes de la Red PALINOCAM (Comunidad de Madrid, series 2010-2019), Tabla 15 de «Informe de resultados del "
    f"polen atmosferico medido en el centro del municipio de Madrid», Ayuntamiento de Madrid, nov-2025, p. 26: {URL_PALINOCAM} "
    "(consultado 2026-11-15). Medio = P95 (P90 en CUPR, POAC, QUER); alto = P97 (P95 en esos tres); «muy alto» (P99) se agrupa en alto."
)
URL_REA_EUSKADI = "https://www.euskadi.eus/contenidos/informacion/informes_polen/eu_def/adjuntos/Informe-polen-2004-2019.pdf"
URL_REA_ZARAGOZA = "https://www.zaragoza.es/sede/servicio/informacion-polen/"
FUENTE_REA_EUSKADI = (
    "Criterios REA (Manual de Calidad y Gestion de la Red Espanola de Aerobiologia) tal como los recoge el Gobierno Vasco, "
    f"Informe polen 2004-2019, tabla de criterios: {URL_REA_EUSKADI} (consultado 2026-11-15)"
)
FUENTE_REA_ZARAGOZA = (
    "Criterios REA (grupo gramineas, llantenes, artemisa y cenizos: 1-25 / 26-50 / >50) segun el Ayuntamiento de Zaragoza: "
    f"{URL_REA_ZARAGOZA} (consultado 2026-11-15)"
)

# slug -> (medio_min, alto_min) en granos/m3 diarios, transcritos de la Tabla 15 (Medio, Alto).
PALINOCAM = {
    "arce": (14, 27),
    "quenopodiaceas_amarantaceas": (8, 10),
    "cupresaceas_taxaceas": (59, 171),
    "fresno": (20, 33),
    "moreras": (15, 33),
    "olivo": (34, 74),
    "pinos": (54, 88),
    "plantago": (21, 32),
    "platano_de_paseo": (81, 248),
    "gramineas": (26, 53),
    "populus": (24, 46),
    "quercus": (55, 164),
    "rumex": (9, 14),
    "olmos": (18, 38),
    "urticaceae": (10, 13),
}
# slug -> (medio_min, alto_min, fuente). REA: bajo 1-30, moderado 31-50, alto >50 se guarda como (31, 51) (valores enteros).
REA = {
    "abedul": (31, 51, FUENTE_REA_EUSKADI + ": Betula 1-30 / 31-50 / >50"),
    "aliso": (31, 51, FUENTE_REA_EUSKADI + ": Alnus 1-30 / 31-50 / >50"),
    "aligustre": (31, 51, FUENTE_REA_EUSKADI + ": Ligustrum 1-30 / 31-50 / >50"),
    "castano": (31, 51, FUENTE_REA_EUSKADI + ": Castanea 1-30 / 31-50 / >50"),
    "corylus": (31, 51, FUENTE_REA_EUSKADI + ": Corylus 1-30 / 31-50 / >50"),
    "artemisia": (26, 51, FUENTE_REA_ZARAGOZA + " (Artemisa)"),
}
# Referencia REA para tipos que ya usan PALINOCAM (solo informativo, no se aplica).
REFERENCIA_REA = {
    "gramineas": [26, 51],
    "olivo": [51, 201],
    "cupresaceas_taxaceas": [51, 201],
    "platano_de_paseo": [51, 201],
    "plantago": [26, 51],
}
# Suelo absoluto PROPIO para tipos sin umbral publicado (criterio de AlergIA, no de ninguna autoridad):
# medio exige >= 10 granos/m3 (igual que el corte «medio» publicado mas bajo de PALINOCAM entre las herbaceas,
# urticaceas = 10; amarantos 8, rumex 9) y alto >= 30 (corte «alto» REA mas bajo, urticaceas > 30).
SUELO_MEDIO = 10
SUELO_ALTO = 30


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
    res = {}
    for s, v in sorted(valores.items()):
        p75, p90 = round(percentil(v, 75), 1), round(percentil(v, 90), 1)
        t = {"nombre": nombres[s], "p75": p75, "p90": p90, "n_dias_positivos": len(v)}
        if s in PALINOCAM:
            t |= {"metodo": "oficial_palinocam", "medio_min": PALINOCAM[s][0], "alto_min": PALINOCAM[s][1], "fuente": FUENTE_PALINOCAM}
            if s in REFERENCIA_REA:
                t["referencia_rea"] = {"medio_min": REFERENCIA_REA[s][0], "alto_min": REFERENCIA_REA[s][1], "fuente": FUENTE_REA_EUSKADI}
        elif s in REA:
            t |= {"metodo": "clinico_rea", "medio_min": REA[s][0], "alto_min": REA[s][1], "fuente": REA[s][2]}
        else:
            t |= {
                "metodo": "percentil_con_suelo",
                "medio_min": max(p75, SUELO_MEDIO),
                "alto_min": max(p90, SUELO_ALTO),
                "fuente": (
                    f"Criterio propio: P75/P90 de 2010-2019 (dias > 0) con suelo absoluto de {SUELO_MEDIO} (medio) y {SUELO_ALTO} (alto) "
                    "granos/m3; no hay umbral publicado para este tipo"
                ),
            }
        res[s] = t
    return res


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
            "fuente": f"{config.CKAN_CATALOGO}{config.DS_POLEN_HISTORICO} (CC BY 4.0), CSV 2010-2019 (solo para P75/P90)",
            "metodo": (
                "Por tipo: bajo < medio_min <= medio < alto_min <= alto (valor diario). `metodo` de cada tipo: oficial_palinocam, "
                "clinico_rea o percentil_con_suelo (P75/P90 2010-2019 de dias > 0, juntando captadores, con suelo propio)"
            ),
            "periodo": "2010-2019",
            "unidad": "granos/m3",
            "suelo_propio": {"medio": SUELO_MEDIO, "alto": SUELO_ALTO, "nota": "criterio propio de AlergIA, solo para tipos sin umbral publicado"},
            "tipos": tipos,
        },
    }
    salida.mkdir(parents=True, exist_ok=True)
    (salida / "umbrales.json").write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    g = tipos["gramineas"]
    print(f"{len(tipos)} tipos de polen; gramineas medio>={g['medio_min']} alto>={g['alto_min']} ({g['metodo']})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=config.ESTATICOS)
    ap.add_argument("--cache", type=Path, default=config.CACHE)
    a = ap.parse_args()
    main(a.salida, a.cache)
