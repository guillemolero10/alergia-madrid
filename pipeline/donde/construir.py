"""Construye public/donde/ (secciones, territorios y servicios).

Uso:  uv run --project pipeline python -m donde.construir --salida public/donde
Descarga (una vez, a salida/cache/, fuera de git): censo del INE (148 MB), seccionado del INE (60 MB) y los CSV del CKAN (~12 MB).
Escribe tambien salida/donde/ (intermedios: serie de poblacion 2021-2025, geometrias UTM e informe), que NO van a public/.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from . import comun, proyeccion, secciones, servicios, territorios


def main(salida: Path, cache: Path = comun.CACHE, intermedios: Path = comun.INTERMEDIOS) -> dict:
    sec = secciones.main(salida, cache, intermedios)
    terr = territorios.main(salida, sec, cache)
    informe_serv = servicios.main(salida, cache, intermedios)
    proy = proyeccion.main(salida, cache, intermedios)  # D7: secciones_2030.json (necesita secciones, territorios y servicios)
    informe = {
        "secciones": len(sec["ids"]),
        "poblacion_total": round(sum(g["total"] for g in sec["grupos"])),
        "poblacion_65_mas": round(sum(g["65_mas"] for g in sec["grupos"])),
        "municipios": len(terr["municipios"]), "distritos": len(terr["distritos"]),
        "servicios": informe_serv,
        "proyeccion_2030": proy,
    }
    intermedios.mkdir(parents=True, exist_ok=True)
    (intermedios / "informe.json").write_text(json.dumps(informe, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return informe


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--salida", type=Path, default=comun.PUBLICO)
    ap.add_argument("--cache", type=Path, default=comun.CACHE)
    a = ap.parse_args()
    main(a.salida, a.cache)
