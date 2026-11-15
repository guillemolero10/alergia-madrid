# AlergIA Madrid

Riesgo respiratorio en tiempo real para personas alérgicas y asmáticas en la Comunidad de Madrid. Proyecto para el datathon DATAMAD 2026. En construcción.

## Ejecutar el pipeline
Requiere [uv](https://docs.astral.sh/uv/).
```
uv run --project pipeline pytest
uv run --project pipeline python -m alergia.ejecutar --salida salida/
```
Genera `salida/estado_actual.json` (aire, viento y riesgo por estación). Detalle de fuentes, umbrales y convenciones en [DATOS.md](DATOS.md).

## Fuentes de datos
- Portal de datos abiertos de la Comunidad de Madrid ([datos.comunidad.madrid](https://datos.comunidad.madrid/catalogo/)): calidad del aire, estaciones y polen. Licencia CC BY 4.0. Fuente: «Comunidad de Madrid».
- [Open-Meteo](https://open-meteo.com): viento. Licencia CC BY 4.0.
- Umbrales del aire: Índice Nacional de Calidad del Aire (Orden TEC/351/2019 y Resolución de 2-sep-2020, BOE).

## Código reutilizado
`pipeline/alergia/ckan.py` se inspira en `MCP/servidor.py` de Alberto Abella ([github.com/albertoabellagarcia/DATAMAD2026](https://github.com/albertoabellagarcia/DATAMAD2026), material de la formación DATAMAD 2026). Se ha reescrito, sin copiar código.

## Uso de IA
El desarrollo se ha hecho con ayuda de asistentes de IA (permitido por las bases).

## Licencias
- Código: MIT ([LICENSE](LICENSE)).
- `datos-estaticos/*.json` y `pipeline/tests/datos/*` son datos derivados de las fuentes anteriores (CC BY 4.0) y mantienen su atribución.
