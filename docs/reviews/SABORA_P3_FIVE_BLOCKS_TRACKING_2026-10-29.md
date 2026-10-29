# Sabora — seguimiento persistente P3

**PR:** #40 Draft

**Rama:** `integration/sabora-activation-readiness-20261028`

**Punto de partida P3:** `dbbf78bd8a0e6573c7e3dfd784af810757d59cfe`

La tabla se actualiza después de cada bloque. `PASS` acredita únicamente código, pruebas y CI del alcance aislado; no autoriza producción.

| Bloque | Estado | Commit remoto | CI | Evidencia | Riesgos pendientes |
| --- | --- | --- | --- | --- | --- |
| 1. Aislamiento | PASS | `8f9f4aacd5134de09ce5e0ba42dec768f31609f2` | [CI](https://github.com/jdlc86/CartaViva/actions/runs/40874075723), [bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/40874075712), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/40874075862), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/40874075711) | 1.047 tests; Compose, imagen, health y gates aislados | Inspección material y capacidad del VPS no autorizadas |
| 2. Seguridad operativa | PASS | `f3fdeb70c0e46036283b1b586f763d583af8d363` | [CI](https://github.com/jdlc86/CartaViva/actions/runs/40875878228), [bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/40875878834), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/40875878219), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/40875878879) | 1.050 tests; inventario, fail-closed, principales separados, lifecycle y artefactos sin credenciales | Secret manager y provisión operativa no autorizados |
| 3. Recuperación y continuidad | NOT_STARTED | — | — | — | — |
| 4. Validación funcional integral | NOT_STARTED | — | — | — | — |
| 5. Auditoría y cierre | NOT_STARTED | — | — | — | — |

## Bloque 1 — cierre validado

Se conserva el API `health-only`. Se añaden guardas para proyecto, servicio, red, puerto, ausencia de montajes/recursos compartidos, usuario no root, recursos, healthcheck, logs, reinicio y parada gradual. El contrato permite únicamente órdenes dirigidas al servicio `api`; rechaza `down`, podas, comodines, proyecto ajeno y operaciones sin servicio. No se ha ejecutado ninguna orden Docker sobre el VPS.

Validación local: `npm run check` PASS con 1.047 pruebas y builds de API, cliente y gestión; gate de aislamiento/configuración y `docker compose ... config --quiet` PASS. Los cuatro workflows del commit remoto concluyeron `SUCCESS`; el principal construyó la imagen, la ejecutó sin red ni puerto de host y comprobó `/health`. Permanecen dos avisos no bloqueantes de infraestructura de GitHub: migración de `ubuntu-latest` y acciones v4 ejecutadas sobre Node 24.

**Siguiente bloque:** inventario y controles reproducibles de seguridad operativa, sin provisionar secretos ni activar composiciones funcionales.

## Bloque 2 — cierre validado

Se inventaría la superficie completa de entorno y dependencias sensibles dormidas sin valores. Los gates exigen separación de los tres principales SQL conocidos, lifecycle de cada secreto/material de confianza, correspondencia exacta con `.env.example`, ausencia de entradas dormidas en Compose y cero credenciales materiales en artefactos productivos. La API sigue `health-only` y falla antes del listener ante cualquier entrada sensible.

Validación local: `npm run check` PASS con 1.050 pruebas, builds de API, cliente y gestión, y puerta de configuración segura. Validación remota del SHA funcional: cuatro workflows PASS; CI principal y bootstrap ejecutaron PostgreSQL 17 desechable, driver real, build de imagen y health aislado, y las suites cliente/gestión ejecutaron Chromium. Los avisos de GitHub sobre Node 20 forzado a Node 24 y la futura migración de `ubuntu-latest` no fueron fallos del código.

**Siguiente bloque:** recuperación y continuidad Sabora-only, cargas/locks representativos, medición reproducible y límites explícitos de Storage/PITR.

Retomar desde el último SHA remoto y el primer bloque que no figure `PASS`.
