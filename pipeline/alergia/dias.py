"""Congela dias pasados para la web («como estaba el dia X»).

Uso:  uv run --project pipeline python -m alergia.dias 2026-05-19 [mas fechas] [--salida salida/]

Por fecha escribe `<salida>/dias/<fecha>/estado.json` y `pronostico.json` con el mismo esquema que `estado_actual.json`
y `pronostico.json` (`modo: "historico"`) y actualiza `<salida>/dias/indice.json`. Reutiliza `aire`, `polen`,
`openmeteo` y `reglas`: no hay umbrales ni reglas propias.

- Estado = foto del dia a las 14:00 hora de Madrid. Aire: CSV anual de `calidad_aire_datos_historico`; polen:
  `mediciones_polen` del anio (dato del dia o el mas reciente anterior; las reglas lo ignoran si tiene mas de 7 dias);
  viento: archive-api de Open-Meteo.
- Pronostico = 48 h desde las 00:00 de ese dia (CAMS `air-quality` + meteo de archive-api).
- Si una fuente falla o un JSON no valida se aborta SIN escribir nada (ni siquiera las fechas que si salieron).
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx

from . import aire, ckan, config, ejecutar, horas, openmeteo, polen, reglas

UTC = timezone.utc
HORA_FOTO = 14  # hora local de Madrid de la foto
FUENTE_AIRE_HIST = "ckan:calidad_aire_datos_historico"
INDICE = "indice.json"

# Fechas elegidas con los datos reales de 2026 (cifras de Getafe/GETA salvo que se diga otra cosa; ver DATOS.md,
# seccion «Dias congelados»). Umbrales de umbrales.json. Cualquier otra fecha sale con titulo generico.
DESTACADOS: dict[str, dict[str, str]] = {
    "2026-02-26": {
        "titulo": "Pico de cupresáceas",
        "nota": "Cupresáceas a 1.974 granos/m³ en Getafe (el nivel alto empieza en 171), el máximo de 2026 en Getafe.",
    },
    "2026-03-25": {
        "titulo": "Pico de plátano",
        "nota": "Plátano de paseo a 6.302 granos/m³ en Getafe (alto desde 248), el máximo de 2026 en Getafe.",
    },
    "2026-04-30": {
        "titulo": "Pico de olivo",
        "nota": "Olivo a 1.076 granos/m³ en Getafe y 1.475 en Madrid capital (alto desde 74): el día de más olivo del año.",
    },
    "2026-05-19": {
        "titulo": "Pico de gramíneas",
        "nota": "Gramíneas a 377 granos/m³ en Getafe (alto desde 53): el máximo de 2026 en Getafe y nivel alto en los 10 captadores de la red.",
    },
    "2026-07-24": {
        "titulo": "Ozono de verano",
        "nota": "Ozono (media de 8 h) a 133,5 µg/m³ en Rascafría a las 14:00 (alto por encima de 130) y 10 estaciones por encima de 100.",
    },
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr)


def corte(fecha: date) -> datetime:
    return datetime(fecha.year, fecha.month, fecha.day, HORA_FOTO, tzinfo=horas.MADRID)


# ---------------------------------------------------------------- descargas (con cache en salida/cache)
def url_anual(c: httpx.Client, dataset: str, anio: int, fijo: tuple[int, str] | None = None) -> str:
    """URL del CSV de `anio`. `fijo` = (anio, id de recurso) para el anio en curso, cuyo id ya esta verificado."""
    if fijo and anio == fijo[0]:
        r = c.get(config.CKAN_BASE + "resource_show", params={"id": fijo[1]})
        r.raise_for_status()
        d = r.json()
        if not d.get("success"):
            raise RuntimeError("resource_show sin exito")
        return d["result"]["url"]
    urls = ckan.recursos_csv_por_anio(ckan.package_show(c, dataset))
    if anio not in urls:
        raise KeyError(f"{dataset} no tiene CSV de {anio}")
    return urls[anio]


def csv_anual(c: httpx.Client, cache_dir: Path, nombre: str, dataset: str, anio: int, fijo=None, forzar: bool = False) -> Path:
    destino = cache_dir / f"{nombre}_{anio}.csv"
    if destino.exists() and not forzar:
        return destino
    return ckan.descargar(c, url_anual(c, dataset, anio, fijo), destino, forzar=True)


# ---------------------------------------------------------------- aire
def series_aire(rutas: list[Path], fin: datetime) -> dict:
    """{estacion: {variable: {instante: [valor, provisional]}}} con las 48 h que terminan en `fin` (incluido)."""
    ini = fin - timedelta(hours=aire.HISTORIA_H)
    dias = {(ini.astimezone(UTC) + timedelta(days=n)).date() for n in range(4)}
    series: dict = {}
    for ruta in rutas:
        datos, _ = aire.parsear_csv(ruta, dias)
        for (est, variable), pts in datos.items():
            ok = {k: v for k, v in pts.items() if ini < aire.instante(k) <= fin}
            if ok:
                series.setdefault(est, {}).setdefault(variable, {}).update(ok)
    return series


def estado_aire(rutas: list[Path], fin: datetime, umbrales: dict) -> list[dict]:
    obs = aire.observaciones(series_aire(rutas, fin), umbrales)
    if not obs:
        raise RuntimeError(f"el CSV historico no trae datos de aire hasta {fin.isoformat()}")
    for o in obs:
        o["fuente"] = FUENTE_AIRE_HIST
    return obs


# ---------------------------------------------------------------- polen
def estado_polen(ruta: Path, dia: date, umbrales: dict) -> list[dict]:
    filas = []
    for f in ckan.leer_csv_auto(ruta):
        try:
            if date.fromisoformat(f["fecha_lectura"].strip()[:10]) <= dia:
                filas.append(f)
        except (KeyError, ValueError):
            continue
    obs = polen.observaciones(filas, umbrales)
    if not obs:
        raise RuntimeError(f"el CSV de polen no trae datos hasta {dia}")
    return obs


# ---------------------------------------------------------------- composicion
def construir_estado(
    dia: date,
    obs_aire: list[dict],
    obs_polen: list[dict],
    viento: list[dict],
    instante_viento: str,
    lugares: dict,
    generado: datetime | None = None,
) -> dict:
    """Mismo documento que `ejecutar.generar`, con `modo: historico` y la fecha de referencia del dia congelado."""
    fin = corte(dia)
    ultimo_aire = max((o["hora"] for o in obs_aire), key=datetime.fromisoformat)
    ultimo_polen = max(o["hora"] for o in obs_polen)
    capas = {
        "aire": {
            "ultimo_dato": ultimo_aire,
            "fuente": FUENTE_AIRE_HIST,
            "estado": "antiguo" if fin - datetime.fromisoformat(ultimo_aire) > ejecutar.AIRE_ANTIGUO else "ok",
        },
        "polen": {
            "ultimo_dato": ultimo_polen,
            "fuente": polen.FUENTE,
            "estado": "antiguo" if dia - date.fromisoformat(ultimo_polen) > ejecutar.POLEN_ANTIGUO else "ok",
        },
        "viento": {"ultimo_dato": instante_viento, "fuente": openmeteo.FUENTE_VIENTO_HIST, "estado": "ok"},
    }
    riesgo = [
        reglas.riesgo_estacion(
            e["id"],
            e.get("captador"),
            [o for o in obs_aire if o["lugar"] == e["id"]],
            [o for o in obs_polen if o["lugar"] == e.get("captador")],
            dia,
        )
        for e in lugares["estaciones"]
    ]
    return {
        "version": 1,
        "generado": (generado or datetime.now(horas.MADRID)).astimezone(horas.MADRID).isoformat(timespec="seconds"),
        "modo": "historico",
        "fecha_referencia": ultimo_aire,
        "capas": capas,
        "observaciones": [*obs_aire, *obs_polen],
        "riesgo": riesgo,
        "viento": viento,
    }


def generar_dia(c: httpx.Client, dia: date, cache_dir: Path, umbrales: dict, lugares: dict, rejilla: list[dict]) -> tuple[dict, dict]:
    """-> (estado, pronostico) ya validados. Lanza excepcion si falla una fuente o un esquema."""
    fin = corte(dia)
    if fin >= datetime.now(horas.MADRID):
        raise ValueError(f"{dia} no es un dia pasado")
    anios = sorted({fin.astimezone(UTC).year, (fin - timedelta(hours=aire.HISTORIA_H)).astimezone(UTC).year})
    rutas = [csv_anual(c, cache_dir, "aire_hist", config.DS_AIRE_HISTORICO, a, (2026, config.RES_AIRE_HISTORICO_2026_CSV)) for a in anios]
    obs_aire = estado_aire(rutas, fin, umbrales)
    ruta_polen = csv_anual(c, cache_dir, "polen_hist", config.DS_POLEN_HISTORICO, dia.year, (2026, config.RES_POLEN_2026_CSV))
    obs_polen = estado_polen(ruta_polen, dia, umbrales)
    viento, ts = ejecutar.con_reintentos(lambda: openmeteo.viento_historico(c, rejilla, fin))
    estado = construir_estado(dia, obs_aire, obs_polen, viento, ts, lugares)
    ejecutar.validar(estado)
    pron = ejecutar.con_reintentos(lambda: openmeteo.pronostico_historico(c, lugares["estaciones"], dia, umbrales))
    ejecutar.validar_pronostico(pron)
    return estado, pron


# ---------------------------------------------------------------- escritura
def _escribir(ruta: Path, doc: dict) -> None:
    ruta.parent.mkdir(parents=True, exist_ok=True)
    tmp = ruta.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    tmp.replace(ruta)


def entrada_indice(fecha: str) -> dict:
    d = DESTACADOS.get(fecha, {})
    return {"fecha": fecha, "titulo": d.get("titulo", f"Día {fecha}"), "nota": d.get("nota", "Foto histórica de ese día a las 14:00.")}


def actualizar_indice(salida: Path, fechas: list[str]) -> list[dict]:
    ruta = salida / "dias" / INDICE
    try:
        previo = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        previo = []
    por_fecha = {e["fecha"]: e for e in previo if isinstance(e, dict) and "fecha" in e}
    for f in fechas:
        por_fecha[f] = entrada_indice(f)
    return [por_fecha[f] for f in sorted(por_fecha)]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Congela dias pasados en salida/dias/<fecha>/")
    ap.add_argument("fechas", nargs="+", help="AAAA-MM-DD")
    ap.add_argument("--salida", type=Path, default=config.RAIZ / "salida")
    a = ap.parse_args(argv)
    try:
        dias = sorted({date.fromisoformat(f) for f in a.fechas})
    except ValueError as e:
        log(f"fecha invalida: {e}")
        return 2
    umbrales = reglas.cargar_umbrales()
    lugares = json.loads((config.ESTATICOS / "lugares.json").read_text(encoding="utf-8"))
    rejilla = openmeteo.cargar_rejilla()
    listos: dict[date, tuple[dict, dict]] = {}
    try:
        with ckan.cliente() as c:
            for d in dias:
                log(f"{d}: generando")
                listos[d] = generar_dia(c, d, a.salida / "cache", umbrales, lugares, rejilla)
    except Exception as e:  # noqa: BLE001 - cualquier fallo aborta antes de escribir
        log(f"ABORTA, no se escribe nada ({type(e).__name__}: {str(e).splitlines()[0][:200] if str(e) else ''})")
        return 1
    indice = actualizar_indice(a.salida, [d.isoformat() for d in dias])
    for d, (estado, pron) in listos.items():
        base = a.salida / "dias" / d.isoformat()
        _escribir(base / "estado.json", estado)
        _escribir(base / "pronostico.json", pron)
        log(f"{d}: escrito {base}")
    _escribir(a.salida / "dias" / INDICE, indice)
    return 0


if __name__ == "__main__":
    sys.exit(main())
