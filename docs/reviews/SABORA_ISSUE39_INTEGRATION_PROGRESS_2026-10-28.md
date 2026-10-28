# Informe parcial verificable — Issue #39, 28-10-2026

## Alcance implementado
- Cadena de ascendencia confirmada mediante GitHub compare: PR #15 es ancestro de H6 y de la rama de integración (54 commits adelante, 0 detrás en el momento de la comprobación). No hay dos líneas cliente divergentes que fusionar.
- Matriz de dependencias, orden candidato de migraciones y runbook de preflight, aislamiento y reversión documentados.
- `scripts/ci/activation-readiness-preflight.mjs`: control fail-closed de artefactos y ejemplos ejecutables peligrosos en runbook; `tests/activation-readiness-preflight.test.mjs` con seis casos, uno sobre archivos reales.
- `apps/api/src/staff-contact-reconciliation-plan.mjs`: planificador offline sin conexiones, sin correo en claro, sin escritura, que distingue identidades verificadas, pendientes y revocadas; `tests/staff-contact-reconciliation-plan.test.mjs` con cinco casos.

## Evidencia CI
Commit `ff4dff48b720763c00d71debf2408347c55c8522`: GitHub Actions `Sabora CI` y `Bootstrap Sabora lockfile` ambos **completed/success**.
Commits posteriores `a4afb6454c64d36381580bc67bbfede3f72c8f8b` y `0141f39f1ae0a1e211b1af80a07ca03088710a18`: **sin resultados de CI verificados todavía** al redactar este informe. No declarar sus pruebas superadas sin ejecución.

## Pendientes para cierre integral
1. Procedimiento de verificación y persistencia de correo aportado por titular, con autorización normativa y ensayos PG17 aislados; el planificador no constituye reconciliación ejecutada.
2. Preflight de secretos, rutas y privilegios para activación candidata, sin montar endpoints operativos.
3. Suite integrada cliente premium/H6/recogida/directorio y pruebas de seguridad/Playwright sobre SHA final.
4. Runbook final con criterios verificables de reversión; autorización posterior para cualquier activación.

Sin merge, despliegue, cambios Supabase operativo ni intervención Fleetia/VPS.
