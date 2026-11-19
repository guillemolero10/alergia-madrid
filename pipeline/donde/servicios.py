"""Servicios publicos geolocalizados: servicios/<id>.json x 7 + otros_sociales.json (D3).

Fuentes (CKAN de la Comunidad de Madrid, CC BY 4.0, ver DATOS-DONDE.md):
- centro_salud, hospital: `centros_servicios_establecimientos_sanitarios` (una fila por oferta asistencial: se deduplica por `centro_nro_registro`).
- residencia, otros_sociales: `atencion_social_registro_centros`. Los centros de dia de mayores NO son un servicio (decision del
  18-nov, ver DATOS-DONDE.md): van a `otros_sociales` con sector «Personas mayores» y tipo «CENTROS DE DÍA».
- farmacia: `oficinas_farmacia`. dea: `desfibriladores_externos_fuera_ambito_sanitario`.
- colegio: `datos-estaticos/colegios.json` (centros_educativos, ya construido por `estatico.construir_colegios`).
Datos personales: NUNCA se copian titulares, NIF, telefonos ni correos (se construye cada registro con una lista blanca de campos).
Coordenadas: UTM ETRS89 30N -> WGS84 con 5 decimales. Cada centro se comprueba contra las secciones censales del INE: dentro
de una seccion (o a menos de 200 m de una) o se descarta como fuera de la Comunidad.
"""
from __future__ import annotations

import json
from collections import Counter
from datetime import date
from pathlib import Path

import numpy as np
import shapely
from shapely import STRtree

from alergia import ckan, config
from estatico.construir_colegios import mapa_municipios
from estatico.extraer_municipios import DS_MUNICIPIOS

from . import comun

DS_SANITARIOS = "centros_servicios_establecimientos_sanitarios"
DS_SOCIALES = "atencion_social_registro_centros"
DS_FARMACIAS = "oficinas_farmacia"
DS_DEA = "desfibriladores_externos_fuera_ambito_sanitario"
URL_SANITARIOS = (
    "https://datos.comunidad.madrid/dataset/d8a0a444-adf5-4c04-8999-0eac3de52cb7/resource/"
    "2948b4da-8b39-42b7-b667-779a5284f39d/download/centros_servicios_establecimientos_sanitarios.csv"
)
URL_SOCIALES = (
    "https://datos.comunidad.madrid/dataset/b8cdb7f7-3185-4938-800a-fefda72333f5/resource/"
    "0d815439-396e-4975-983e-5bb421f617a0/download/atencion_social_registro_centros.csv"
)
URL_FARMACIAS = (
    "https://datos.comunidad.madrid/dataset/2d682b1d-e2e8-4c6f-b902-7a3f108e2fb9/resource/"
    "904a161b-f339-4296-be61-1ae914494c89/download/oficinas_farmacia.csv"
)
URL_DEA = (
    "https://datos.comunidad.madrid/dataset/d2478503-a4ae-4753-9540-9200071803c4/resource/"
    "94756e35-3059-451d-81a6-3427d2551de4/download/desfibriladores_externos_fuera_ambito_sanitario.csv"
)

SERVICIOS = ["centro_salud", "hospital", "residencia", "farmacia", "colegio", "dea"]
CON_PLAZAS = {"residencia"}
# Etapas del registro de centros (`e` de colegios.json) que dan servicio al grupo 3-16: Infantil (I), Primaria (P) y Secundaria (S,
# que incluye ESO). No hay un campo «imparte ESO» en la fuente: se deduce del tipo de centro (ver DATOS-DONDE.md).
ETAPAS_COLEGIO = frozenset({"I", "P", "S"})
TITULARIDAD_COLEGIO = ("pu", "co")  # publicos y concertados (los privados sin concierto no son un servicio publico)
RADIO_TOLERANCIA_M = 200.0  # un centro a menos de esto de una seccion se considera dentro (frontera / simplificacion)
FUNCIONAL_SERMAS = "Servicios o Institutos de Salud de las CC.AA"
TIPOS_CENTRO_SALUD = {"Centro de salud": "Centro de salud", "Consultorio de atención primaria": "Consultorio"}

# Privacidad (R1, 18-nov): `otros_sociales` NO publica nombres, y los centros «sensibles» (donde viven o se alojan personas en
# situacion vulnerable: victimas de violencia de genero, menores acogidos, pisos tutelados, personas sin hogar, refugiados,
# presos y ex reclusos...) NO publican su coordenada exacta: se sustituye por el punto interior de su seccion censal. El municipio
# y el distrito siguen saliendo exactos (la seccion pertenece a uno solo). Criterio prudente, por tipo/subtipo/sector del registro.
TIPOS_SENSIBLES = frozenset({"CENTROS DE ACOGIDA", "CENTROS RESIDENCIALES"})
SUBTIPOS_SENSIBLES = frozenset({"PISOS TUTELADOS", "VIVIENDAS COMUNITARIAS", "OTRAS RESIDENCIAS"})
SECTORES_SENSIBLES = frozenset({
    "Mujer", "Presos y ex reclusos", "Refugiados y asilados", "Personas sin hogar", "(Inmigracion) Otros grupos en situación de necesidad",
    "Infancia", "Adolescencia", "Infancia y Adolescencia", "Familia", "Colectivos en situación de necesidad",
    "Otros grupos en situación de necesidad",
})
UMBRAL_DEA_APILADOS = 30  # mas de 30 DEA registrados en el mismo punto = equipos moviles dados de alta en una sede (ver centros_dea)

FUENTES = {
    "centro_salud": (DS_SANITARIOS, "Comunidad de Madrid, centros, servicios y establecimientos sanitarios"),
    "hospital": (DS_SANITARIOS, "Comunidad de Madrid, centros, servicios y establecimientos sanitarios"),
    "residencia": (DS_SOCIALES, "Comunidad de Madrid, registro de centros de atencion social"),
    "otros_sociales": (DS_SOCIALES, "Comunidad de Madrid, registro de centros de atencion social"),
    "farmacia": (DS_FARMACIAS, "Comunidad de Madrid, oficinas de farmacia"),
    "dea": (DS_DEA, "Comunidad de Madrid, desfibriladores externos fuera del ambito sanitario"),
    "colegio": ("centros_educativos", "Comunidad de Madrid, centros educativos"),
}


# ---------------------------------------------------------------- asignacion a secciones

class Asignador:
    """Comprueba que un punto UTM esta en la Comunidad y le asigna seccion y municipio (poligono del INE)."""

    def __init__(self, ids: list[str], geoms: list):
        self.ids = ids
        self.geoms = geoms
        self.arbol = STRtree(geoms)

    @classmethod
    def desde_intermedio(cls, ruta: Path) -> "Asignador":
        d = json.loads(ruta.read_text(encoding="utf-8"))
        return cls(d["ids"], [shapely.from_wkb(bytes.fromhex(h)) for h in d["wkb"]])

    def punto_interior(self, cusec: str) -> tuple[float, float]:
        """Punto interior (UTM) de una seccion: el mismo `representative_point` que publica `secciones.json`."""
        if not hasattr(self, "_indice"):
            self._indice = {i: k for k, i in enumerate(self.ids)}
            self._puntos: dict[str, tuple[float, float]] = {}
        if cusec not in self._puntos:
            p = self.geoms[self._indice[cusec]].representative_point()
            self._puntos[cusec] = (float(p.x), float(p.y))
        return self._puntos[cusec]

    def asignar(self, x: np.ndarray, y: np.ndarray) -> list[str | None]:
        """CUSEC de la seccion que contiene cada punto (o la mas cercana a menos de 200 m); None si esta fuera."""
        pts = shapely.points(x, y)
        res: list[str | None] = [None] * len(pts)
        if not len(pts):
            return res
        entrada, arbol = self.arbol.query(pts, predicate="within")
        for i, j in zip(entrada, arbol):
            if res[i] is None:
                res[i] = self.ids[j]
        faltan = [i for i, r in enumerate(res) if r is None]
        if faltan:
            e, a = self.arbol.query_nearest(pts[faltan], max_distance=RADIO_TOLERANCIA_M, all_matches=False)
            for i, j in zip(e, a):
                res[faltan[i]] = self.ids[j]
        return res


def _mun_de_seccion(cusec: str) -> str:
    return f"mun:{cusec[:5]}"


# ---------------------------------------------------------------- registros -> centros (lista blanca de campos)

def _via(tipo: str, nombre: str, nro: str) -> str:
    return " ".join(p for p in (tipo.strip(), nombre.strip(), nro.strip()) if p and p != "0").strip()


def centros_sanitarios(filas: list[dict]) -> dict[str, list[dict]]:
    """{centro_salud: [...], hospital: [...]}; un registro por `centro_nro_registro`."""
    vistos: set[str] = set()
    res = {"centro_salud": [], "hospital": []}
    for f in filas:
        tipo = f["centro_tipo"].strip()
        es_cs = tipo in TIPOS_CENTRO_SALUD
        es_hosp = tipo == "Hospital general" and f["dependecia_funcional"].strip() == FUNCIONAL_SERMAS
        if not (es_cs or es_hosp):
            continue
        cid = f["centro_nro_registro"].strip()
        if cid in vistos:
            continue
        vistos.add(cid)
        etiqueta = TIPOS_CENTRO_SALUD.get(tipo, "Hospital")
        publica = f["dependecia_funcional"].strip() == FUNCIONAL_SERMAS
        res["centro_salud" if es_cs else "hospital"].append({
            "id": cid,
            "nombre": f"{etiqueta}: {_via(f['direccion_vial_tipo'], f['direccion_vial_nombre'], f['direccion_vial_nro'])} ({f['municipio_nombre'].strip()})",
            "x": comun.decimal_es(f["localizacion_coordenada_x"]), "y": comun.decimal_es(f["localizacion_coordenada_y"]),
            "mun": None, "plazas": None,
            "titularidad": "publica" if publica else "privada",
        })
    return res


def _titularidad_social(naturaleza: str, gestion: str) -> str:
    """Informativa: el registro no separa plazas concertadas dentro de un centro."""
    g = gestion.strip().upper()
    if g.startswith("PROPIA"):
        return "publica"
    if "CONCERTADAS" in g:
        return "concertada"
    return "privada"


def es_sensible(sector: str, tipo: str, subtipo: str) -> bool:
    """Centro de atencion social cuya ubicacion exacta no debe publicarse (ver TIPOS_SENSIBLES...)."""
    return tipo in TIPOS_SENSIBLES or subtipo in SUBTIPOS_SENSIBLES or sector in SECTORES_SENSIBLES


def centros_sociales(filas: list[dict], cdmuni_a_ine: dict[str, str]) -> dict[str, list[dict]]:
    res: dict[str, list[dict]] = {"residencia": [], "otros_sociales": []}
    for f in filas:
        sector, tipo = f["sector"].strip(), f["tipo"].strip()
        if sector == "Personas mayores" and tipo == "CENTROS RESIDENCIALES":
            clave = "residencia"
        else:  # incluidos los centros de dia de mayores (sector «Personas mayores»): solo cuentan en el recuento por sector
            clave = "otros_sociales"
        p = f["plazas_autorizadas_numero"].strip()
        c = {
            "id": f["numero_registro"].strip(), "nombre": f["denominacion"].strip(),
            "x": comun.decimal_es(f["direccion_coor_x"]), "y": comun.decimal_es(f["direccion_coor_y"]),
            "mun": cdmuni_a_ine.get(f["municipio_codigo"].strip().zfill(3)),
            "plazas": int(p) if p.isdigit() else None,
            "titularidad": _titularidad_social(f["entidad_naturaleza"], f["tipo_gestion"]),
        }
        if clave == "otros_sociales":
            # `subtipo` distingue p. ej. «CENTROS DE DÍA: OTROS» de «HOGARES Y CLUBES» (clubes de mayores, no atencion de dia)
            c["sector"], c["tipo"], c["subtipo"] = sector, tipo, f["subtipo"].strip()
            c["sensible"] = es_sensible(sector, tipo, c["subtipo"])
        res[clave].append(c)
    return res


def centros_farmacias(filas: list[dict]) -> list[dict]:
    return [{
        "id": f["FARMACIA_NRO_SOE"].strip(),
        "nombre": f"Farmacia: {_via(f['DIRECCION_VIAL_TIPO'], f['DIRECCION_VIAL_NOMBRE'], f['DIRECCION_VIAL_NRO'])} ({f['MUNICIPIO_NOMBRE'].strip()})",
        "x": comun.decimal_es(f["LOCALIZACION_COORDENADA_X"]), "y": comun.decimal_es(f["LOCALIZACION_COORDENADA_Y"]),
        "mun": None, "plazas": None, "titularidad": None,
    } for f in filas]


def centros_dea(filas: list[dict], cdmuni_a_ine: dict[str, str]) -> list[dict]:
    """Un DEA por fila. `codigo_dea` esta repetido en una fila: se desambigua con un sufijo para conservar los 13.680."""
    res, vistos = [], Counter()
    for f in filas:
        cod = f["codigo_dea"].strip()
        vistos[cod] += 1
        cid = cod if vistos[cod] == 1 else f"{cod}#{vistos[cod]}"
        res.append({
            "id": cid,
            "nombre": f"{f['tipo_establecimiento'].strip()}: {_via(f['direccion_via_codigo'], f['direccion_via_nombre'], f['direccion_portal_numero'])}",
            "x": comun.decimal_es(f["direccion_coordenada_x"]), "y": comun.decimal_es(f["direccion_coordenada_y"]),
            "mun": cdmuni_a_ine.get(f["municipio_codigo"].strip().zfill(3)), "plazas": None,
            "titularidad": {"Pública": "publica", "Privada": "privada"}.get(f["tipo_titularidad"].strip()),
        })
    return res


def agrupar_apilados(centros: list[dict], umbral: int = UMBRAL_DEA_APILADOS) -> tuple[list[dict], dict]:
    """Agrupa en UN registro los puntos (lat/lon ya redondeados) con mas de `umbral` DEA.

    Cientos de DEA dados de alta en el mismo portal son equipos moviles (p. ej. flotas) registrados en una sede, no desfibriladores
    fijos en ese sitio: contarlos uno a uno inflaba el ratio de un distrito (Retiro: 2.200 en una calle). Para la cobertura por
    distancia no cambia nada (el punto sigue ahi). Se conserva el primer id (por orden), su nombre y la titularidad mayoritaria, y
    `equipos` guarda cuantos se agruparon. Devuelve (centros, stats) con `stats["agrupados"]` listo para el JSON.
    """
    por_punto: dict[tuple[float, float], list[dict]] = {}
    for c in centros:
        por_punto.setdefault((c["lat"], c["lon"]), []).append(c)
    res, grupos = [], []
    for punto, g in por_punto.items():
        if len(g) > umbral:
            tit = Counter(c["titularidad"] for c in g).most_common(1)[0][0]
            r = dict(g[0], titularidad=tit, equipos=len(g))
            res.append(r)
            grupos.append({"id": r["id"], "mun": r["mun"], "lat": punto[0], "lon": punto[1], "equipos": len(g)})
        else:
            res.extend(dict(c, equipos=1) for c in g)
    res.sort(key=lambda c: c["id"])
    grupos.sort(key=lambda x: -x["equipos"])
    stats = {"umbral": umbral, "puntos_agrupados": len(grupos), "equipos_agrupados": sum(x["equipos"] for x in grupos),
             "registros_antes": len(centros), "registros_despues": len(res), "grupos": grupos}
    return res, stats


def centros_colegios(colegios: dict) -> list[dict]:
    """Colegios con Infantil, Primaria o Secundaria (ESO), publicos o concertados (ya en WGS84: se marca `lat`/`lon`).
    Un centro con varias etapas es UN registro (el JSON de colegios ya trae un centro por codigo)."""
    res = []
    vistos: set[str] = set()
    for c in colegios["centros"]:
        if c["p"] not in TITULARIDAD_COLEGIO or not (ETAPAS_COLEGIO & set(c["e"])) or c["c"] in vistos:
            continue
        vistos.add(c["c"])
        res.append({
            "id": c["c"], "nombre": c["n"], "lat": c["la"], "lon": c["lo"], "mun": c["m"], "plazas": None,
            "titularidad": {"pu": "publica", "co": "concertada"}[c["p"]],
        })
    return res


# ---------------------------------------------------------------- salida

def preparar(centros: list[dict], asig: Asignador) -> tuple[list[dict], dict]:
    """Convierte coordenadas, descarta lo que no tiene o cae fuera de la Comunidad y rellena el municipio."""
    stats = {"entrada": len(centros), "sin_coordenadas": 0, "fuera_comunidad": 0, "plazas_sin_coordenadas": 0,
             "municipio_distinto_de_seccion": 0, "sin_municipio_registro": 0, "ubicacion_generalizada": 0}
    # puntos en UTM para la comprobacion; los que ya vienen en WGS84 (colegios) se pasan a UTM
    for c in centros:
        if "x" in c:
            if c["x"] is None or c["y"] is None:
                c["_sin"] = True
        elif "lat" in c:
            from pyproj import Transformer

            t = comun._T.setdefault("inv", Transformer.from_crs("EPSG:4326", comun.EPSG_UTM, always_xy=True))
            c["x"], c["y"] = t.transform(c["lon"], c["lat"])
    validos = []
    for c in centros:
        if c.pop("_sin", False):
            stats["sin_coordenadas"] += 1
            stats["plazas_sin_coordenadas"] += c.get("plazas") or 0
        else:
            validos.append(c)
    secs = asig.asignar(np.array([c["x"] for c in validos]), np.array([c["y"] for c in validos]))
    salida = []
    for c, s in zip(validos, secs):
        if s is None:
            stats["fuera_comunidad"] += 1
            continue
        mun_sec = _mun_de_seccion(s)
        # El municipio es el del poligono donde cae el punto (lo que se ve en el mapa). El del registro solo se usa para
        # contar las discrepancias (en los DEA hay ~200: la mayoria a kilometros, coordenadas o municipio mal registrados).
        if c["mun"] is None:
            stats["sin_municipio_registro"] += 1
        elif c["mun"] != mun_sec:
            stats["municipio_distinto_de_seccion"] += 1
        c["mun"] = mun_sec
        if c.pop("sensible", False):  # no se publica la direccion: el punto interior de la seccion censal
            c["x"], c["y"] = asig.punto_interior(s)
            c.pop("lat", None), c.pop("lon", None)
            stats["ubicacion_generalizada"] += 1
        if "lat" not in c:
            lon, lat = comun.a_wgs84(c["x"], c["y"])
            c["lat"], c["lon"] = lat, lon
        c["lat"], c["lon"] = round(float(c["lat"]), 5), round(float(c["lon"]), 5)
        salida.append(c)
    salida.sort(key=lambda c: c["id"])
    stats["salida"] = len(salida)
    return salida, stats


def a_json(servicio: str, centros: list[dict], stats: dict, actualizado_fuente: str | None, hoy: date | None = None) -> dict:
    ds, nombre_fuente = FUENTES[servicio]
    out = {
        "version": comun.VERSION, "servicio": servicio, "generado": (hoy or date.today()).isoformat(),
        "fuente": f"{config.CKAN_CATALOGO}{ds} (CC BY 4.0)", "fuente_nombre": nombre_fuente,
        "actualizado_fuente": actualizado_fuente,
        "descartados_sin_coordenadas": stats["sin_coordenadas"], "descartados_fuera_comunidad": stats["fuera_comunidad"],
        # otros_sociales: ids opacos (la web solo cuenta); el numero de registro permitiria localizar en el CKAN la direccion
        # de los centros sensibles cuya ubicacion se generaliza (T3, F-4)
        "ids": ([f"s{k + 1:04d}" for k in range(len(centros))] if servicio == "otros_sociales" else [c["id"] for c in centros]),
        **({} if servicio == "otros_sociales" else {"nombres": [c["nombre"] for c in centros]}),  # otros_sociales no publica nombres (R1)
        "mun": [c["mun"] for c in centros], "lat": [c["lat"] for c in centros], "lon": [c["lon"] for c in centros],
    }
    if servicio == "otros_sociales":  # la web solo cuenta por sector
        out["ubicacion_generalizada"] = stats.get("ubicacion_generalizada", 0)
        out["ubicacion_generalizada_nota"] = (
            "Los centros de acogida, pisos tutelados, viviendas comunitarias y otros servicios con personas en situacion vulnerable "
            "no publican su direccion: lat/lon es el punto interior de su seccion censal (municipio y distrito exactos).")
    if "agrupados" in stats:
        out["dea_apilados"] = stats["agrupados"]
        out["equipos"] = [c.get("equipos", 1) for c in centros]
    if servicio in CON_PLAZAS or servicio == "otros_sociales":
        out["plazas"] = [c["plazas"] for c in centros]
        out["plazas_descartadas_sin_coordenadas"] = stats["plazas_sin_coordenadas"]
    if servicio != "farmacia":
        out["titularidad"] = [c["titularidad"] for c in centros]
    if servicio == "otros_sociales":
        out["sector"] = [c["sector"] for c in centros]
        out["tipo"] = [c["tipo"] for c in centros]
        out["subtipo"] = [c["subtipo"] for c in centros]
    return out


def _fecha_fuente(c, dataset: str) -> str | None:
    try:
        return ckan.package_show(c, dataset)["metadata_modified"][:10]
    except Exception:  # sin red: el campo es informativo
        return None


def obtener_entradas(cache: Path = comun.CACHE) -> dict[str, Path]:
    with ckan.cliente() as c:
        e = {
            "sanitarios": ckan.descargar(c, URL_SANITARIOS, cache / "sanitarios.csv"),
            "sociales": ckan.descargar(c, URL_SOCIALES, cache / "sociales.csv"),
            "farmacias": ckan.descargar(c, URL_FARMACIAS, cache / "farmacias.csv"),
            "dea": ckan.descargar(c, URL_DEA, cache / "desfibriladores.csv"),
        }
        p = ckan.package_show(c, DS_MUNICIPIOS)
        from estatico.extraer_municipios import RES_MUNICIPIOS_CSV

        e["municipios"] = ckan.descargar(c, ckan.url_recurso(p, RES_MUNICIPIOS_CSV), cache / "municipios_ckan.csv")
        e["fechas"] = {d: _fecha_fuente(c, d) for d in (DS_SANITARIOS, DS_SOCIALES, DS_FARMACIAS, DS_DEA, "centros_educativos")}
    return e


def construir_todos(entradas: dict, colegios: dict, asig: Asignador) -> dict[str, tuple[list[dict], dict]]:
    cdmuni = mapa_municipios(ckan.leer_csv_auto(entradas["municipios"]))
    sanit = centros_sanitarios(ckan.leer_csv(entradas["sanitarios"]))
    soc = centros_sociales(ckan.leer_csv(entradas["sociales"]), cdmuni)
    crudos = {
        **sanit, **soc,
        "farmacia": centros_farmacias(ckan.leer_csv(entradas["farmacias"])),
        "colegio": centros_colegios(colegios),
        "dea": centros_dea(ckan.leer_csv(entradas["dea"]), cdmuni),
    }
    res = {k: preparar(v, asig) for k, v in crudos.items()}
    centros, stats = res["dea"]
    centros, agr = agrupar_apilados(centros)
    res["dea"] = (centros, {**stats, "agrupados": agr, "salida": len(centros)})
    return res


def main(salida: Path, cache: Path = comun.CACHE, intermedios: Path = comun.INTERMEDIOS) -> dict:
    ent = obtener_entradas(cache)
    asig = Asignador.desde_intermedio(intermedios / "secciones_utm.json")
    colegios = json.loads((config.ESTATICOS / "colegios.json").read_text(encoding="utf-8"))
    res = construir_todos(ent, colegios, asig)
    carpeta = salida / "servicios"
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / "centro_dia.json").unlink(missing_ok=True)  # ya no es un servicio (18-nov): evita servir un fichero obsoleto
    informe = {}
    for k, (centros, stats) in res.items():
        ds = FUENTES[k][0]
        obj = a_json(k, centros, stats, ent["fechas"].get(ds))
        (carpeta / f"{k}.json").write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        informe[k] = {**stats, "plazas_total": sum(c["plazas"] or 0 for c in centros) if k in CON_PLAZAS else None}
        print(k, informe[k])
    return informe
