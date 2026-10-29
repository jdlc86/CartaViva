# Sabora — seguimiento persistente P3

**PR:** #40 Draft

**Rama:** `integration/sabora-activation-readiness-20261028`

**Punto de partida P3:** `dbbf78bd8a0e6573c7e3dfd784af810757d59cfe`

La tabla se actualiza después de cada bloque. `PASS` acredita únicamente código, pruebas y CI del alcance aislado; no autoriza producción.

| Bloque | Estado | Commit remoto | CI | Evidencia | Riesgos pendientes |
| --- | --- | --- | --- | --- | --- |
| 1. Aislamiento | PASS | `8f9f4aacd5134de09ce5e0ba42dec768f31609f2` | [CI](https://github.com/jdlc86/CartaViva/actions/runs/40874075723), [bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/40874075712), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/40874075862), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/40874075711) | 1.047 tests; Compose, imagen, health y gates aislados | Inspección material y capacidad del VPS no autorizadas |
| 2. Seguridad operativa | NOT_STARTED | — | — | — | — |
| 3. Recuperación y continuidad | NOT_STARTED | — | — | — | — |
| 4. Validación funcional integral | NOT_STARTED | — | — | — | — |
| 5. Auditoría y cierre | NOT_STARTED | — | — | — | — |

## Bloque 1 — cierre validado

Se conserva el API `health-only`. Se añaden guardas para proyecto, servicio, red, puerto, ausencia de montajes/recursos compartidos, usuario no root, recursos, healthcheck, logs, reinicio y parada gradual. El contrato permite únicamente órdenes dirigidas al servicio `api`; rechaza `down`, podas, comodines, proyecto ajeno y operaciones sin servicio. No se ha ejecutado ninguna orden Docker sobre el VPS.

Validación local: `npm run check` PASS con 1.047 pruebas y builds de API, cliente y gestión; gate de aislamiento/configuración y `docker compose ... config --quiet` PASS. Los cuatro workflows del commit remoto concluyeron `SUCCESS`; el principal construyó la imagen, la ejecutó sin red ni puerto de host y comprobó `/health`. Permanecen dos avisos no bloqueantes de infraestructura de GitHub: migración de `ubuntu-latest` y acciones v4 ejecutadas sobre Node 24.

**Siguiente bloque:** inventario y controles reproducibles de seguridad operativa, sin provisionar secretos ni activar composiciones funcionales.

Retomar desde el último SHA remoto y el primer bloque que no figure `PASS`.
