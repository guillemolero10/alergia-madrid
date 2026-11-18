"""Genera datos-estaticos/municipios_fuente.csv: los 179 municipios de la Comunidad de Madrid con nombre oficial y punto.

Uso:  uv run --project pipeline python -m estatico.extraer_municipios [--salida datos-estaticos/municipios_fuente.csv]

Fuentes (API OGC del IGN, https://api-features.ign.es, licencia de uso IGN/CNIG con atribucion «© Instituto Geografico Nacional de Espana»):
- `administrativeunit` (INSPIRE Unidades administrativas): nombre oficial; el INE son las 5 ultimas cifras de `nationalcode`.
- `nuc` (Nucleos de poblacion, INE/IGN): punto (latitud, longitud) y habitantes. El punto del municipio es el del nucleo
  MAS POBLADO (empate: el primero por nombre), no el centroide del poligono: asi cae donde vive la gente.
La lista de los 179 codigos INE sale del CKAN de la Comunidad (conjunto `municipio_comunidad_madrid`, CC BY 4.0): el IGN
anade 2 unidades administrativas especiales (53057 Los Baldios, 53058 El Redeguelo) que no son municipios.
Los CSV de entrada son pequenos (unos cientos de KB); NO se descarga ninguna geometria.
"""
from __future__ import annotations

import argparse
import csv
import io
from pathlib import Path

from alergia import ckan, config

URL_UNIDADES = "https://api-features.ign.es/collections/administrativeunit/items"
URL_NUCLEOS = "https://api-features.ign.es/collections/nuc/items"
DS_MUNICIPIOS = "municipio_comunidad_madrid"
RES_MUNICIPIOS_CSV = "48010e29-caa0-46c5-ab6e-f498b2dc042f"
COLUMNAS = ["ine", "nombre", "nucleo", "habitantes", "lat", "lon"]


def _csv(texto: str, delimiter: str = ",") -> list[dict]:
    return list(csv.DictReader(io.StringIO(texto), delimiter=delimiter))


def codigos_ckan(filas: list[dict]) -> set[str]:
    """INE de 5 cifras (el CSV de la Comunidad trae el codigo de 6 con digito de control)."""
    return {f["municipio_codigo_ine"].strip()[:5] for f in filas}


def combinar(codigos: set[str], unidades: list[dict], nucleos: list[dict]) -> list[dict]:
    """Une nombre oficial (IGN) con el punto del nucleo mas poblado. Falla si falta alguno de los `codigos`."""
    nombres = {u["nationalcode"][-5:]: u["nameunit"].strip() for u in unidades if u["nationalcode"][-5:] in codigos}
    por_mun: dict[str, list[dict]] = {}
    for n in nucleos:
        por_mun.setdefault(n["codine"][:5], []).append(n)
    faltan = sorted(codigos - nombres.keys()) + sorted(c for c in codigos if c not in por_mun)
    if faltan:
        raise ValueError(f"municipios sin nombre o sin nucleo en el IGN: {faltan}")
    res = []
    for ine in sorted(codigos):
        n = min(por_mun[ine], key=lambda x: (-int(x["habitantes"] or 0), x["nombre"]))
        res.append(
            {
                "ine": ine,
                "nombre": nombres[ine],
                "nucleo": n["nombre"].strip(),
                "habitantes": int(n["habitantes"] or 0),
                "lat": round(float(n["latitud"]), 6),
                "lon": round(float(n["longitud"]), 6),
            }
        )
    return res


def main(salida: Path) -> None:
    with ckan.cliente() as c:
        p = ckan.package_show(c, DS_MUNICIPIOS)
        f = ckan.descargar(c, ckan.url_recurso(p, RES_MUNICIPIOS_CSV), config.CACHE / "municipios_ckan.csv")
        codigos = codigos_ckan(ckan.leer_csv_auto(f))
        r = c.get(URL_UNIDADES, params={"f": "csv", "limit": 300, "codnut3": "ES300", "nationallevelname": "Municipio"})
        r.raise_for_status()
        unidades = _csv(r.text)
        r = c.get(URL_NUCLEOS, params={"f": "csv", "limit": 2000, "cpro": 28})
        r.raise_for_status()
        nucleos = _csv(r.text)
    filas = combinar(codigos, unidades, nucleos)
    salida.parent.mkdir(parents=True, exist_ok=True)
    with salida.open("w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLUMNAS, lineterminator="\n")
        w.writeheader()
        w.writerows(filas)
    print(f"{len(filas)} municipios -> {salida}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=config.ESTATICOS / "municipios_fuente.csv")
    main(ap.parse_args().salida)
