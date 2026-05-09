# Documentación del repositorio

Esta carpeta agrupa el material de documentación del proyecto **hack-dev3pack** fuera del `README.md` raíz.

## Estructura

| Ruta | Quién lo ve | Propósito |
| --- | --- | --- |
| [`public/`](./public/README.md) | Cualquiera; va en GitHub | Guías, decisiones de arquitectura “presentables”, notas para jueces o colaboradores externos. |
| `internal/` | Solo el equipo en máquinas locales | Notas de trabajo, checklist de hackathon, borradores; **no se versiona** (ver `.gitignore`). |

## Qué va aquí y qué no

- **Sí** en `docs/public/`: flujos de demo, glosario, FAQs, capturas pensadas para el repo, enlaces a recursos públicos.
- **No** en paths públicos: llaves, tokens, RPC privados, datos personales, ni nada que deba quedar solo en el equipo.

Para el detalle de cada subcarpeta, abre el README correspondiente (`public` o `internal`).
