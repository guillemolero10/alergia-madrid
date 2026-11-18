"""Construye datos-estaticos/colegios.json: centros con alumnado menor de edad de la Comunidad de Madrid.

Uso:  uv run python -m estatico.construir_colegios [--salida datos-estaticos] [--cache salida/cache]
Fuente (CKAN datos.comunidad.madrid, CC BY 4.0): conjunto `centros_educativos` (CSV `;`, UTF-8 con BOM). Las
coordenadas UTM_X/UTM_Y estan en ETRS89 / UTM 30N (EPSG:25830; ver DATOS.md) y se pasan a WGS84 con pyproj.
Estaciones y captadores salen de datos-estaticos/lugares.json (sin red); el codigo de municipio de la Comunidad
(3 cifras) se traduce a INE con el CSV `municipio_comunidad_madrid` (el mismo que usa extraer_municipios).
"""
from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import date
from pathlib import Path

from pyproj import Transformer

from alergia import ckan, config
from estatico.construir_lugares import mas_cercano
from estatico.extraer_municipios import DS_MUNICIPIOS, RES_MUNICIPIOS_CSV

DS_CENTROS = "centros_educativos"
URL_CENTROS = (
    "https://datos.comunidad.madrid/dataset/c750856d-3166-4dac-8e80-d1b824c968b5/resource/"
    "28d60557-1d73-4281-ab08-6cfd3b2f5f83/download/centros_educativos.csv"
)
EPSG_ORIGEN = "EPSG:25830"  # ETRS89 / UTM 30N (verificado: DATOS.md)
BBOX = (39.8, 41.2, -4.6, -3.0)  # lat min/max, lon min/max de la Comunidad

# TIPO_ABRV incluidos -> (tipo corto, etapas: I infantil, P primaria, S secundaria/bachillerato, E especial).
INCLUIDOS: dict[str, tuple[str, str]] = {
    "CP INF-PRI": ("CEIP", "IP"),
    "CP PRI": ("CEIP", "P"),
    "CP INF-PRI-SEC": ("CEIPS", "IPS"),
    "IES": ("IES", "S"),
    "CP EE": ("CEE", "E"),
    "CPR EE": ("CEE", "E"),
    "CPR INF": ("COL", "I"),
    "CPR INF-PRI": ("COL", "IP"),
    "CPR PRI": ("COL", "P"),
    "CPR PRI-SEC": ("COL", "PS"),
    "CPR INF-SEC": ("COL", "IS"),
    "CPR INF-PRI-SEC": ("COL", "IPS"),
    "CPR ES": ("COL", "S"),
    "CREI": ("COL", "PS"),
    "CIMELPR PRSEC": ("CIM", "PS"),  # integrado de musica con primaria y secundaria
    "CIMPR SEC": ("CIM", "S"),
    "CEXTRAN ESP": ("EXT", "IPS"),  # solo los que parecen colegios (ver NO_COLEGIO_EXT)
}
# Centros extranjeros en Espana: mezcla de colegios internacionales con guarderias, escuelas de negocios y academias.
# Se excluyen por nombre (no hay campo de etapa).
NO_COLEGIO_EXT = re.compile(
    r"NURSERY|NIDO|KINDERPARADIES|MATERNELLE|MATERNA|MARKETING|BUSINESS|FORMACION|VATEL|ESNE|\bCEV\b|BELLEZA|"
    r"\bCHS\b|TUTOR|\bLMI\b|KORS|SIXTH FORM|IMAGEN|SENBAZURU|BREWSTER SPAIN|CAMINO\.|CENTRO DE FORMACION|"
    r"ESCUELA IRAQUI|LIBIO",
    re.I,
)
TITULARIDAD = {"PÚBLICO": "pu", "PRIVADO CONCERTADO": "co", "PRIVADO": "pr"}

MINUSCULAS = {"de", "del", "la", "las", "los", "el", "y", "e", "a", "en", "con", "al", "por", "para", "o", "u", "of"}
SIGLAS = {"CEIP", "CEIPS", "IES", "CEE", "CP", "CPR", "EE", "UU", "EEUU", "II", "III", "IV", "VI", "VII", "VIII", "IX", "XI", "XII", "XIII", "SAT", "ONCE", "UNED", "CEU", "FP", "ESO", "KS", "ABC", "THP", "GBSB", "CASVI", "MV", "CEPA", "SEK", "SM", "JM", "CCC"}


def nombre_legible(texto: str, quitar_parentesis: bool = False) -> str:
    """MAYUSCULAS -> Titulo: preposiciones en minuscula, siglas y numeros romanos en mayuscula."""
    t = texto.replace("¿", "'").strip()
    if quitar_parentesis:
        t = re.sub(r"\s*\([^)]*\)\s*$", "", t)
    t = re.sub(r"\s+", " ", t)

    def palabra(w: str, primera: bool) -> str:
        if not w:
            return w
        pelada = re.sub(r"[^\wÀ-ÿ]", "", w)
        if pelada.upper() in SIGLAS:
            return w.upper()
        if "." in w.strip(".") and len(pelada) <= 5 and all(len(s) <= 2 for s in re.split(r"\.", w) if s):
            return w.upper()  # E.M., EE.UU.
        if not primera and pelada.lower() in MINUSCULAS:
            return w.lower()
        return w[:1].upper() + w[1:].lower()

    # Separa por espacios; dentro de cada token respeta guiones y parentesis iniciales.
    salida = []
    for i, tok in enumerate(t.split(" ")):
        partes = re.split(r"(-|/)", tok)
        sub = []
        for j, p in enumerate(partes):
            if p in ("-", "/"):
                sub.append(p)
                continue
            m = re.match(r"^(\(?)(.*)$", p)
            sub.append(m.group(1) + palabra(m.group(2), primera=(j > 0 or i == 0)))
        salida.append("".join(sub))
    return " ".join(salida)


def mapa_municipios(filas_ckan: list[dict]) -> dict[str, str]:
    """CDMUNI (3 cifras de la Comunidad) -> `mun:<INE 5 cifras>`. El CSV trae el INE con digito de control (6 cifras)."""
    return {f["municipio_codigo"].strip().zfill(3): "mun:" + f["municipio_codigo_ine"].strip()[:5] for f in filas_ckan}


def convertir(x: float, y: float, _t: dict = {}) -> tuple[float, float]:
    """UTM ETRS89 30N -> (lat, lon) WGS84 (la diferencia ETRS89/WGS84 es de centimetros)."""
    if "t" not in _t:
        _t["t"] = Transformer.from_crs(EPSG_ORIGEN, "EPSG:4326", always_xy=True)
    lon, lat = _t["t"].transform(x, y)
    return lat, lon


def en_comunidad(lat: float, lon: float) -> bool:
    return BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]


def _num(s: str) -> float | None:
    s = (s or "").strip().replace(",", ".")
    try:
        return float(s) if s else None
    except ValueError:
        return None


def clasificar(fila: dict) -> tuple[str, str] | str:
    """(tipo, etapas) si el centro entra; si no, el motivo de descarte."""
    if fila["SITUACIÓN"].strip() != "ALTA":
        return "no_alta"
    abrv = fila["TIPO_ABRV"].strip()
    if abrv not in INCLUIDOS:
        return "tipo_excluido"
    if abrv == "CEXTRAN ESP" and NO_COLEGIO_EXT.search(fila["CENTRO"]):
        return "extranjero_no_colegio"
    if _num(fila["UTM_X"]) is None or _num(fila["UTM_Y"]) is None:
        return "sin_coordenadas"
    return INCLUIDOS[abrv]


def construir(filas: list[dict], cdmuni_a_ine: dict[str, str], lugares: dict) -> tuple[list[dict], dict]:
    """Devuelve (centros, estadisticas). `lugares` es el contenido de lugares.json."""
    estaciones = lugares["estaciones"]
    activos = [c for c in lugares["captadores"] if c["activo"]]
    ids_mun = {m["id"] for m in lugares["municipios"]}
    descartes: Counter = Counter()
    excl_tipos: Counter = Counter()
    centros = []
    for f in filas:
        r = clasificar(f)
        if isinstance(r, str):
            descartes[r] += 1
            if r == "tipo_excluido" and f["SITUACIÓN"].strip() == "ALTA":
                excl_tipos[f["TIPO_ABRV"].strip()] += 1
            continue
        tipo, etapas = r
        mun = cdmuni_a_ine.get(f["CDMUNI"].strip().zfill(3))
        if mun is None or mun not in ids_mun:
            descartes["municipio_desconocido"] += 1
            continue
        lat, lon = convertir(_num(f["UTM_X"]), _num(f["UTM_Y"]))
        if not en_comunidad(lat, lon):
            descartes["fuera_comunidad"] += 1
            continue
        est, de = mas_cercano(lat, lon, estaciones)
        cap, dc = mas_cercano(lat, lon, activos)
        centros.append(
            {
                "c": f["CODIGO"].strip(),
                "n": nombre_legible(f["CENTRO"], quitar_parentesis=(tipo == "EXT")),
                "t": tipo,
                "e": etapas,
                "p": TITULARIDAD[f["TITULARIDAD"].strip()],
                "m": mun,
                "la": round(lat, 5),
                "lo": round(lon, 5),
                "ea": est["id"],
                "de": round(de, 1),
                "ca": cap["id"],
                "dc": round(dc, 1),
            }
        )
    centros.sort(key=lambda c: c["c"])
    return centros, {"descartes": dict(descartes), "tipos_excluidos_alta": dict(excl_tipos)}


def escribir(ruta: Path, meta: dict, centros: list[dict]) -> None:
    """Un centro por linea (diffs legibles) y separadores compactos."""
    cab = json.dumps(meta, ensure_ascii=False, separators=(",", ":"))
    cuerpo = ",\n".join(json.dumps(c, ensure_ascii=False, separators=(",", ":")) for c in centros)
    ruta.write_text(cab[:-1] + ',"centros":[\n' + cuerpo + "\n]}\n", encoding="utf-8")


def main(salida: Path, cache: Path) -> None:
    lugares = json.loads((salida / "lugares.json").read_text(encoding="utf-8"))
    with ckan.cliente() as c:
        f_cen = ckan.descargar(c, URL_CENTROS, cache / "centros_educativos.csv")
        p = ckan.package_show(c, DS_MUNICIPIOS)
        f_mun = ckan.descargar(c, ckan.url_recurso(p, RES_MUNICIPIOS_CSV), cache / "municipios_ckan.csv")
    filas = ckan.leer_csv(f_cen)
    cdmuni = mapa_municipios(ckan.leer_csv_auto(f_mun))
    centros, stats = construir(filas, cdmuni, lugares)
    meta = {
        "generado": date.today().isoformat(),
        "fuente": f"{config.CKAN_CATALOGO}{DS_CENTROS} (CC BY 4.0). Coordenadas UTM ETRS89 30N (EPSG:25830) convertidas a WGS84.",
        "claves": "c codigo, n nombre, t tipo (CEIP/CEIPS/IES/CEE/COL/CIM/EXT), e etapas (I,P,S,E), p titularidad (pu/co/pr), m municipio, la/lo lat/lon, ea/de estacion de aire y km, ca/dc captador de polen activo y km",
    }
    salida.mkdir(parents=True, exist_ok=True)
    escribir(salida / "colegios.json", meta, centros)
    print(f"{len(filas)} filas -> {len(centros)} centros. Descartes: {stats['descartes']}")
    print("Tipos ALTA excluidos:", stats["tipos_excluidos_alta"])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=config.ESTATICOS)
    ap.add_argument("--cache", type=Path, default=config.CACHE)
    a = ap.parse_args()
    main(a.salida, a.cache)
