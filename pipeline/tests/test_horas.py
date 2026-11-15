"""Convencion horaria de los CSV de aire: hNN = hora UTC, marca el FINAL de la hora (ver DATOS.md)."""
import csv
from collections import defaultdict
from datetime import date
from pathlib import Path

from alergia.horas import fin_de_hora_iso

DATOS = Path(__file__).parent / "datos"


def test_fin_de_hora_invierno_y_verano():
    assert fin_de_hora_iso(date(2026, 1, 15), 1) == "2026-01-15T02:00:00+01:00"  # h01 = 00-01 UTC = 01-02 CET
    assert fin_de_hora_iso(date(2026, 7, 1), 14) == "2026-07-01T16:00:00+02:00"
    assert fin_de_hora_iso(date(2026, 11, 15), 11) == "2026-11-15T12:00:00+01:00"
    # h24 cruza a medianoche UTC: ya es el dia siguiente en hora de Madrid
    assert fin_de_hora_iso(date(2026, 1, 15), 24) == "2026-01-16T01:00:00+01:00"


def test_cambio_de_hora_no_rompe():
    # 2026-03-29: Madrid pasa de CET a CEST a las 02:00 (01:00 UTC)
    assert fin_de_hora_iso(date(2026, 3, 29), 1) == "2026-03-29T03:00:00+02:00"
    assert fin_de_hora_iso(date(2026, 3, 29), 24) == "2026-03-30T02:00:00+02:00"


def _pico_no2_manana(desde: date, hasta: date) -> int:
    """Hora hNN con maximo de NO2 medio (dias laborables, 05-12 h) en la ventana dada."""
    suma, n = defaultdict(float), defaultdict(int)
    with open(DATOS / "aire_no2_cambio_hora_marzo2025.csv", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f, delimiter=";"):
            d = date(int(r["ano"]), int(r["mes"]), int(r["dia"]))
            if not desde <= d <= hasta:
                continue
            for h in range(5, 13):
                if r[f"v{h:02d}"] == "V" and r[f"h{h:02d}"]:
                    suma[h] += float(r[f"h{h:02d}"].replace(",", "."))
                    n[h] += 1
    medias = {h: suma[h] / n[h] for h in n}
    return max(medias, key=medias.get)


def test_datos_reales_hora_fija_sin_cambio_de_hora():
    """El pico de NO2 de la manana lo marca el trafico, anclado al reloj LOCAL. Si hNN fuera hora local,
    el pico seria la misma hNN antes y despues del cambio a horario de verano (30-mar-2025). Observado:
    se adelanta una hora (h08 -> h07), luego hNN es una hora fija (UTC), no la local."""
    antes = _pico_no2_manana(date(2025, 3, 10), date(2025, 3, 28))
    despues = _pico_no2_manana(date(2025, 4, 1), date(2025, 4, 19))
    assert antes == despues + 1
