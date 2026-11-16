import json
import subprocess

import pytest

from alergia import publicar


def git(d, *a):
    return subprocess.run(["git", "-C", str(d), *a], check=True, capture_output=True, text=True).stdout


@pytest.fixture
def repo(tmp_path):
    # Esquema de juguete: no depende de la forma exacta del esquema real.
    es = tmp_path / "esq.json"
    es.write_text(json.dumps({"type": "object", "required": ["capas"]}))
    d = tmp_path / "datos"
    (d / "cache").mkdir(parents=True)
    git(d, "init", "-q")
    (d / "estado_actual.json").write_text(json.dumps({"capas": {"aire": {"ultimo_dato": "2026-11-15T12:00:00+01:00"}}}))
    (d / "pronostico.json").write_text(json.dumps({"capas": {}}))
    (d / "cache" / "aire_48h.json").write_text("{}")
    (d / "cache" / "polen_mediciones.csv").write_text("x" * 100)
    return d, {"estado_actual.json": es, "pronostico.json": es}


def test_valida_y_lista_blanca(repo):
    d, esq = repo
    publicar.validar_directorio(d, esq)
    assert "cache/polen_mediciones.csv" not in publicar.lista_blanca(d)
    assert "cache/aire_48h.json" in publicar.lista_blanca(d)


def test_json_roto_no_pasa(repo):
    d, esq = repo
    (d / "estado_actual.json").write_text("{roto")
    with pytest.raises(publicar.ErrorPublicacion):
        publicar.validar_directorio(d, esq)


def test_sin_ultimo_dato_no_pasa(repo):
    d, esq = repo
    (d / "estado_actual.json").write_text(json.dumps({"capas": {"aire": {}}}))
    with pytest.raises(publicar.ErrorPublicacion):
        publicar.validar_directorio(d, esq)


def test_commit_solo_lista_blanca_y_sin_cambios(repo):
    d, _ = repo
    assert publicar.commit(d, "datos: prueba") is True
    assert git(d, "log", "-1", "--format=%an").strip() == "github-actions[bot]"
    assert "polen_mediciones.csv" not in git(d, "ls-files")
    assert publicar.commit(d, "datos: prueba") is False


def test_cli_codigo_1_con_esquema_real_y_json_invalido(tmp_path):
    (tmp_path / "estado_actual.json").write_text("{}")
    (tmp_path / "pronostico.json").write_text("{}")
    assert publicar.main([str(tmp_path)]) == 1
