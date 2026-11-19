"""Genera src/lib/donde/cruce.fixture.json: puntos al azar (semilla fija) calculados con la referencia en Python.
Uso: uv run --project pipeline python pipeline/tests/generar_cruce_donde.py"""
import json, random
from pathlib import Path
import numpy as np
from donde import referencia as R

raiz = Path(__file__).resolve().parents[2]
d = R.cargar_datos(raiz / "public/donde")
sec = d["secciones"]; terr = d["territorios"]
xs, ys = R.proyectar(sec["lat"], sec["lon"])
tot = np.asarray(sec["pob"]["total"], float); may = np.asarray(sec["pob"]["65_mas"], float)
rnd = random.Random(20261118)
def pt():
    k = rnd.randrange(len(xs))
    return round(sec["lat"][k] + rnd.uniform(-0.02, 0.02), 5), round(sec["lon"][k] + rnd.uniform(-0.02, 0.02), 5)
zona_de = {m["id"]: m["zona"] for m in terr["municipios"]}
out = {"distancia": [], "plazas": [], "optimo": []}
for serv, radio in (("centro_salud", 1500.0), ("farmacia", 800.0), ("centro_salud", 3000.0)):
    c = d["servicios"][serv]; xc, yc = R.proyectar(c["lat"], c["lon"])
    dmin = R.distancia_al_mas_cercano(xs, ys, xc, yc); df = R.deficit_distancia(dmin, radio)
    for _ in range(2):
        la, lo = pt(); p = R.proyectar(la, lo)
        g, _m = R.ganan_distancia(dmin, tot, xs, ys, p, radio)
        out["distancia"].append(dict(servicio=serv, radio=radio, lat=la, lon=lo, deficit_total=int(tot[df].sum()), ganan=int(g)))
c = d["servicios"]["residencia"]; xc, yc = R.proyectar(c["lat"], c["lon"])
pl = np.asarray([0 if v is None else v for v in c["plazas"]], float)
for d0 in (5000.0, 7000.0):
    A, _r = R.sfca(xs, ys, may, xc, yc, pl, d0); um = R.umbral_media(A, may)
    for plazas in (40.0, 150.0):
        la, lo = pt(); p = R.proyectar(la, lo)
        n_red, mejoran, _r = R.reduce_faltan(A, um, may, xs, ys, p, plazas, d0)
        out["plazas"].append(dict(d0=d0, plazas=plazas, lat=la, lon=lo, umbral=um, deficit_total=int(may[A < um].sum()),
                                  faltan=R.plazas_faltan(A, um, may), reduce=n_red, mejoran=mejoran))
    zonas = sorted({z for z in zona_de.values()})
    z = rnd.choice(zonas)
    cand = [i for i in range(len(xs)) if may[i] > 0 and zona_de.get(sec["mun"][i]) == z]
    res = R.ranking_candidatos(A, um, may, xs, ys, 100.0, d0, cand)
    voraz = R.optimo_voraz(A, um, may, xs, ys, 100.0, d0, cand, 2)
    out["optimo"].append(dict(d0=d0, zona=z, plazas=100.0, reduce=res[0][0], seccion=sec["ids"][res[0][1]],
                              segundo=res[1][0] if len(res) > 1 else None,
                              voraz2=[dict(seccion=sec["ids"][k], reduce=g, acumulado=ac) for g, k, ac in voraz]))
(raiz / "src/lib/donde/cruce.fixture.json").write_text(json.dumps(out, indent=1))
print(json.dumps(out)[:1500])
