# Sabora — cierre técnico P2 de migraciones y recuperación

**Fecha:** 2026-10-29

**PR:** #40 Draft, rama `integration/sabora-activation-readiness-20261028`

**HEAD de implementación ensayado:** `b4b1678560f6bb1000c9b47bf9daa3d1ae146bf3`

## Resultado

P2 queda **cerrado dentro de su alcance técnico de preparación y ensayo desechable**. Se han acreditado los criterios A–E del encargo: auditoría individual, preflight fail-closed, cadena real/reanudación, fallo transaccional, recuperación selectiva en clúster PG17 limpio, permisos/RLS, runbook y CI. Este cierre no autoriza producción ni elimina las puertas de activación enumeradas al final.

## Defectos encontrados y corregidos

1. La invocación del ensayo de fallo/reanudación recibida en el HEAD inicial estaba dentro de un comentario por secuencias `\n` literales. Los checks verdes anteriores no ejecutaban ese script. Se separó como comando real y se añadió un test estático que impide repetir el defecto.
2. El inventario de riesgos era únicamente heurístico y dejaba reversibilidad, locks y dependencias como `unverified`. Se sustituyó como evidencia de aceptación por un registro revisado, uno por cada una de las 42 migraciones, enlazado al manifiesto SHA-256 y fail-closed ante cualquier migración nueva o ficha obsoleta.
3. La reanudación anterior solo usaba SQL sintético. El nuevo runner aplica las 42 migraciones reales, registra versión/nombre/checksum, interrumpe después de la versión confirmada `20261021220000`, reanuda sin modificar su timestamp ni reejecutarla y rechaza checksum divergente.
4. La restauración anterior compartía roles globales con la fuente y no acreditaba funciones/esquema/extensión. El nuevo ensayo crea un segundo contenedor `--network none`, reconstruye roles sin contraseñas, preinstala `extensions.pgcrypto`, restaura únicamente `sabora` y compara roles/membresías, extensión, esquema, relaciones/secuencias, owners, privilegios efectivos, FORCE RLS, policies, funciones, constraints, índices, triggers y conteos de datos.
5. PostgreSQL 17 detectó dos defectos del propio ensayo: concatenación de campos internos `"char"` sin cast y una tabla temporal eliminada por `ON COMMIT DROP` bajo autocommit. Se corrigieron en `a671d5c` y `b4b1678`; no se relajó ninguna comparación.

## Evidencia funcional y de seguridad

| Criterio | Evidencia | Resultado |
| --- | --- | --- |
| 42 migraciones, orden y checksums | `migration-manifest.mjs`, `migration-audit.mjs` | PASS, manifest `7ceffee4…405e` |
| Destino ajeno rechazado antes de conexión | `migration-preflight.mjs` y tests | PASS; solo contenedor exacto GHA |
| Compatibilidad PG17.11/pgcrypto | `migration-postgres17-compatibility.test.mjs` | PASS; sin cifrados legacy, `ltree`, `btree_gist` ni operador afectado |
| Cadena real y fallo después de confirmación | `postgres-migration-chain-smoke.sh` | PASS `42:20261021220000` |
| Fallo dentro de transacción | `postgres-migration-failure-smoke.sh` | PASS; no parcial, reintento único |
| Backup/restauración solo Sabora | `postgres-recovery-smoke.sh` | PASS en segundo clúster PG17 |
| Roles/ACL/RLS/funciones/constraints/datos | fingerprints fuente↔destino | PASS, igualdad exacta |
| Principal restringido real | LOGIN `sabora_p2_restore_probe` + `sabora_staff_reader` | PASS lectura autorizada; pedidos y `SET ROLE postgres` denegados |
| Regresión total local | `npm run check` | PASS: 1.044 tests, builds API/cliente/gestión y gate de secretos |
| Regresión UI | workflows Playwright cliente/gestión | PASS |

Marcas sanitizadas verificadas en ambos workflows PG17:

- `sabora_real_migration_chain_resume_ok:42:20261021220000`
- `sabora_disposable_migration_failure_resume_fixture_ok`
- `sabora_disposable_backup_restore_clean_cluster_ok`
- `production_config_gate_ok`

## Commits del bloque

- `316fb59` — inventario revisado, preflight, cadena real, segundo clúster, runbook y tests.
- `a671d5c` — casts explícitos de catálogos PostgreSQL 17.
- `b4b1678` — ciclo de vida correcto de la tabla temporal de fingerprints.

## CI del HEAD ensayado

- [Sabora CI — SUCCESS](https://github.com/jdlc86/CartaViva/actions/runs/40868406144)
- [Bootstrap lockfile + segunda ejecución PG17 — SUCCESS](https://github.com/jdlc86/CartaViva/actions/runs/40868406210)
- [Cliente Playwright — SUCCESS](https://github.com/jdlc86/CartaViva/actions/runs/40868406138)
- [Gestión Playwright — SUCCESS](https://github.com/jdlc86/CartaViva/actions/runs/40868406146)

Las ejecuciones fallidas `40863441418` y `40865992880` se conservan como evidencia de que el ensayo detectó los dos defectos descritos y de que fueron corregidos, no ocultados.

## Decisión y límites

La matriz P2 no deja un criterio normativo de **preparación desechable** sin acreditar, por lo que la decisión es **CERRAR P2**. Permanecen como bloqueos reales para producción, fuera de este cierre:

- medición con volumen/locks representativos y una ventana aprobada;
- backup/PITR y restauración del proyecto Supabase autorizado;
- recuperación de Storage si llega a contener objetos;
- aprovisionamiento/rotación de contraseñas y secretos mediante custodio aprobado;
- verificación material del aislamiento de infraestructura Sabora, sin intervenir en Fleetia;
- autorizaciones separadas de release, DBA, seguridad y propietario del entorno.

No se realizó merge, despliegue, migración operativa, activación de servicios ni acceso a Fleetia/VPS/Supabase.
