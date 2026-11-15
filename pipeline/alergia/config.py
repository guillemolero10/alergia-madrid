"""Constantes comunes: URLs del portal de datos abiertos de la Comunidad de Madrid, ids de recursos, rutas."""
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]  # raiz del repositorio
CACHE = RAIZ / "salida" / "cache"  # descargas grandes (ignorada por git)
ESTATICOS = RAIZ / "datos-estaticos"

# Base de la API CKAN. La ruta /catalogo/api/... responde 307: hay que seguir redirecciones.
CKAN_BASE = "https://datos.comunidad.madrid/api/3/action/"
CKAN_CATALOGO = "https://datos.comunidad.madrid/catalogo/dataset/"

# Conjuntos (nombre CKAN) usados en los estaticos.
DS_ESTACIONES = "calidad_aire_estaciones"
DS_CAPTADORES = "captadores_polen"
DS_POLEN = "mediciones_polen"
DS_POLEN_HISTORICO = "mediciones_polen_historico"
DS_AIRE_DIA = "calidad_aire_datos_dia"
DS_AIRE_HISTORICO = "calidad_aire_datos_historico"

# Recursos concretos (id de recurso CKAN), verificados el 15-nov-2026.
RES_ESTACIONES_CSV = "c05f6436-783e-4b04-b0d2-47848daea984"
RES_CAPTADORES_CSV = "763f86ed-1f4d-4890-8ff8-a86910a2fe73"
RES_POLEN_2026_CSV = "1f2c4851-b69b-4daa-85ae-89f56cabc67d"  # mediciones_polen (anio en curso)
RES_AIRE_DIA_CSV = "ee75d31c-8042-4067-bbd7-739bb3eb8059"
RES_AIRE_HISTORICO_2026_CSV = "c28fc923-0591-4787-a133-17711249bfd5"

# Polen: tipo (como aparece en el CSV, ya normalizado) -> clave de `valores` del plan.
POLEN_CLAVES = {
    "gramineas": "polen_gramineas",
    "olivo": "polen_olivo",
    "abedul": "polen_abedul",
    "aliso": "polen_aliso",
    "artemisia": "polen_artemisia",
}

ANIOS_UMBRAL_POLEN = range(2010, 2020)  # 2010-2019, ambos incluidos
