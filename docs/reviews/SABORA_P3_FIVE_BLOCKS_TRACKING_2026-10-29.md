# Sabora — seguimiento persistente P3

**PR:** #40 Draft

**Rama:** `integration/sabora-activation-readiness-20261028`

**Punto de partida P3:** `dbbf78bd8a0e6573c7e3dfd784af810757d59cfe`

La tabla se actualiza después de cada bloque. `PASS` acredita únicamente código, pruebas y CI del alcance aislado; no autoriza producción.

| Bloque | Estado | Commit remoto | CI | Evidencia | Riesgos pendientes |
| --- | --- | --- | --- | --- | --- |
| 1. Aislamiento | IN_PROGRESS | Pendiente de publicación | Pendiente | Gate de Compose/Dockerfile, comandos exactos y runbook | Inspección material y capacidad del VPS no autorizadas |
| 2. Seguridad operativa | NOT_STARTED | — | — | — | — |
| 3. Recuperación y continuidad | NOT_STARTED | — | — | — | — |
| 4. Validación funcional integral | NOT_STARTED | — | — | — | — |
| 5. Auditoría y cierre | NOT_STARTED | — | — | — | — |

## Bloque 1 — alcance implementado antes de CI

Se conserva el API `health-only`. Se añaden guardas para proyecto, servicio, red, puerto, ausencia de montajes/recursos compartidos, usuario no root, recursos, healthcheck, logs, reinicio y parada gradual. El contrato permite únicamente órdenes dirigidas al servicio `api`; rechaza `down`, podas, comodines, proyecto ajeno y operaciones sin servicio. No se ha ejecutado ninguna orden Docker sobre el VPS.

Retomar desde el último SHA remoto y el primer bloque que no figure `PASS`.
