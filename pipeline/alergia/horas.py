"""Convencion horaria de los CSV de calidad del aire de la Comunidad de Madrid.

Conclusion (ver DATOS.md): `hNN` es la hora **UTC** y marca el **final** de la hora medida.
`h01` del dia D = medida entre D 00:00 y D 01:00 UTC. El dia (ano/mes/dia) tambien es el dia UTC.
La documentacion oficial solo dice «h01 hace referencia a la 1 de la manana»; la zona horaria se ha
deducido de los datos (ciclo del ozono y de NO2 con el cambio de hora verano/invierno).
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

MADRID = ZoneInfo("Europe/Madrid")


def fin_de_hora(dia: date, n: int) -> datetime:
    """Instante (aware, Europe/Madrid) en que termina la hora `hNN` del dia `dia` (n entre 1 y 24)."""
    if not 1 <= n <= 24:
        raise ValueError("n debe estar entre 1 y 24")
    base = datetime(dia.year, dia.month, dia.day, tzinfo=timezone.utc)
    return (base + timedelta(hours=n)).astimezone(MADRID)


def fin_de_hora_iso(dia: date, n: int) -> str:
    """Igual que `fin_de_hora` en ISO 8601 con el desfase de Madrid (p. ej. 2026-07-01T14:00:00+02:00)."""
    return fin_de_hora(dia, n).isoformat()
