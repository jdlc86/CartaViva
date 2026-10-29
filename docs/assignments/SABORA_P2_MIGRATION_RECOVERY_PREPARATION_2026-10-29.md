# P2 — auditoría y preparación de migraciones y recuperación (sin ejecución operativa)

Fecha: 2026-10-29. Repositorio: `jdlc86/CartaViva`. Referencia inicial: PR Draft #40, SHA `b0f072f9dd3f65e4cab0ba5a40981f038b8cd37a`.

**Estado:** preparación técnica, no implementación completa ni aprobación de despliegue. Los documentos normativos vigentes del repositorio prevalecen sobre este documento.

## Evidencia inspeccionada

- `docs/runbooks/SABORA_ACTIVATION_CANDIDATE_RUNBOOK_2026-10-28.md`: exige cadena completa en PG17 desechable, grants/RLS negativos, identidades separadas, backup/restauración específica de Sabora, punto de retorno y parada ante pérdida de datos o acceso cruzado. Establece que para SQL no reversible se prefiere desactivar rutas de Sabora y corregir hacia delante; prohíbe rollback destructivo no probado y aprobado.
- `scripts/ci/h6-postgres17.test.mjs`: guardas de prueba que exigen `SABORA_CI_PG_URL`, módulo PostgreSQL desechable y `GITHUB_ACTIONS=true`; restringe el destino a `127.0.0.1`, usuario `postgres`, base `postgres` y contraseña de fixture. Esta guarda es específica del harness y **no** es autorización para usar credenciales operativas.
- `package.json`: `pnpm check` encadena tests, build y `production-config-secrets-gate.mjs`.
- `scripts/ci/production-config-secrets-gate.mjs`: comprueba aislamiento del Compose candidato, ausencia de secretos y comandos globales peligrosos. Es una barrera estática, **no** sustituye pruebas de recuperación ni inspección autorizada de un entorno real.
- P1 reportado en PR #40 y cuatro workflows SUCCESS verificados en el SHA de referencia. Esto no prueba todavía un procedimiento P2.

## Puertas y entregables del hito P2

### A. Inventario y clasificación de migraciones

Localizar todas las migraciones SQL existentes y su orden exacto desde la fuente normativa y el repositorio. Para cada una registrar: dependencias, extensiones, objetos creados/alterados, requisitos de versión PG17/pgcrypto, idempotencia, permisos, reversibilidad, riesgos de bloqueo y datos afectados. **No asumir** que una migración es reversible por existir una sentencia inversa.

### B. Preflight y prohibición de destino operativo

Construir un comando offline que muestre SHA, orden y checksums de migraciones y rechace rutas/URL no desechables antes de conectar. No aceptar `--force` genérico ni variables que salten la guarda. El script de ensayo debe exigir una instancia PG17 de prueba creada por el harness, no aceptar el endpoint Supabase operativo ni permitir que el runner resuelva conexiones externas. Reutilizar validaciones existentes, sin duplicar contratos.

### C. Ensayo de aplicación, fallos y recuperación

En PG17 desechable, aplicar la cadena completa; comprobar grants, RLS, funciones, extensiones, restricciones e identidades. Inyectar fallos deterministas (antes de empezar, durante una transacción y después de una migración ya confirmada) y comprobar limpieza, no duplicación, capacidad de reanudar y consistencia de datos. Ensayar backup y restauración **solo** de los objetos/datos Sabora del fixture, y verificar restauración, integridad y permisos. Si una migración no admite reversión segura, documentar recuperación hacia delante; no inventar SQL destructivo.

### D. Runbook y decisión de activación

Documentar preparación, inventario, checksums, copias, verificación, límites de tiempo, condiciones de parada, recuperación, evidencia, responsables y autorizaciones separadas. El procedimiento futuro de producción requerirá aprobación expresa y aislamiento respecto de Fleetia. La prueba de recuperación local no constituye autorización de ejecución operativa.

### E. CI y aceptación

Integrar pruebas en el CI existente, con timeouts, limpieza y reportes sanitizados. Ejecutar focalizadas, PG17 real desechable, suites y builds. Registrar SHA y enlaces a workflows **del HEAD final**. Entregar matriz requisito → código → prueba → resultado y listar cualquier bloqueo normativo.

## Restricciones innegociables

- Único repositorio permitido: `jdlc86/CartaViva`.
- No merge, despliegue, reinicio de VPS, cambio de Fleetia ni Supabase operativo.
- No provisionar recursos facturables ni secretos reales.
- No utilizar la existencia de CI verde de P1 como evidencia de cierre P2.
- No proceder con rollback destructivo sin procedimiento específico probado y autorización expresa.

## Criterio de salida de esta preparación

Este documento **no declara P2 cerrado**. La fase siguiente debe implementar y verificar las pruebas reales de migración/recuperación y actualizar la documentación normativa únicamente cuando exista un hito material, sin reinterpretar requisitos aprobados.

## Evidencias de ejecución — 2026-10-29

**SHA validado:** `550c20c881f7f2fcf248f2cdfaf986f7743d0788` (PR Draft #40).

| Comprobación | Implementación | Evidencia | Estado |
| --- | --- | --- | --- |
| Inventario offline ordenado con SHA-256, detección de versión duplicada y nombre SQL inválido | `scripts/ci/migration-manifest.mjs`, `scripts/ci/migration-manifest.test.mjs` | Sabora CI, test raíz | PASS |
| Preflight de migraciones dentro de runner desechable | `scripts/ci/postgres-migration-smoke.sh` | Sabora CI | PASS |
| Copia y restauración en PostgreSQL 17 aislado | `scripts/ci/postgres-recovery-smoke.sh` | Sabora CI | PASS |
| Escritura confirmada, fallo de subtransacción y ausencia de escritura parcial | `scripts/ci/postgres-recovery-smoke.sh` | Sabora CI | PASS |
| Integridad de datos de fixture, unicidad y comparación de RLS forzado tras restauración | `scripts/ci/postgres-recovery-smoke.sh` | Sabora CI | PASS |
| Regresión de interfaz cliente y gestión | workflows de conformidad y visual | Actions | PASS |

Workflows del SHA:
- Sabora CI: https://github.com/jdlc86/CartaViva/actions/runs/40852559401
- Bootstrap lockfile: https://github.com/jdlc86/CartaViva/actions/runs/40852559437
- Sabora management browser visual smoke: https://github.com/jdlc86/CartaViva/actions/runs/40852559389
- Sabora client browser conformance: https://github.com/jdlc86/CartaViva/actions/runs/40852559393

**Alcance exacto:** el ensayo usa un fixture nuevo y temporal y restaura en otra base del mismo contenedor de CI. No demuestra recuperación de una base operativa, restauración de todos los privilegios de roles globales, recuperación PITR, ni reanudación después de un fallo real de una migración confirmada. `pg_restore --no-owner --no-acl` deliberadamente no reproduce propietarios y ACL; no debe usarse como evidencia de recuperación completa de permisos. El inventario automatizado todavía no clasifica dependencias, bloqueos o reversibilidad por migración.

### Pendientes para cierre integral de P2

1. Inventario de dependencias y compatibilidad de cada migración conforme a normativa, con evidencia de extensiones y permisos.
2. Ensayo determinista de fallo entre migraciones y reanudación, con detección de migraciones ya aplicadas y checksums; evitar reejecutar SQL no idempotente.
3. Ensayo de recuperación de roles, propietarios y ACL en un entorno PostgreSQL 17 completamente aislado, o documentar explícitamente la alternativa autorizada.
4. Runbook final de parada, copia, restauración y validación de seguridad; las decisiones de producción siguen requiriendo autorización expresa.

**Decisión:** P2 parcialmente implementado y verificado en CI; **no cerrado** y **no autorizado para producción**. Mantener Draft.

## Actualización de verificación — 2026-10-29, SHA 8b88cb477b95205d5a1400173ed2f2589341cca0

Los cuatro workflows de este SHA finalizaron SUCCESS:

- Sabora CI (incluye PostgreSQL 17 desechable y ensayo de restauración): https://github.com/jdlc86/CartaViva/actions/runs/40855885436
- Bootstrap lockfile: https://github.com/jdlc86/CartaViva/actions/runs/40855885650
- Sabora management browser visual smoke: https://github.com/jdlc86/CartaViva/actions/runs/40855885518
- Sabora client browser conformance: https://github.com/jdlc86/CartaViva/actions/runs/40855885515

**Hallazgo corregido:** una ACL explícita del propietario en la base origen puede restaurarse como ACL nula con privilegios implícitos equivalentes. El ensayo ahora compara propietarios, permisos efectivos de los roles enumerados en el script, flags de RLS y definiciones de políticas; conserva comprobaciones de filas, unicidad y transacciones fallidas. No se ha eliminado la puerta de fallo por divergencia de permisos.

**Límites que siguen abiertos:** la copia actual usa `pg_dump` de la base desechable completa, no una copia/restauración selectiva exclusivamente de Sabora; la comparación de permisos no cubre todos los roles ni todos los tipos de objetos SQL (por ejemplo, funciones y esquemas); los roles globales se comparten entre las dos bases del mismo contenedor. Tampoco hay ensayo de fallo entre migraciones con reanudación segura basada en historial y checksum, clasificación individual de dependencias/bloqueos/reversibilidad, ni recuperación PITR. Estos requisitos no deben marcarse PASS por inferencia.

**Decisión:** P2 continúa **abierto**, aunque el ensayo de restauración actualmente implementado ya está verde. No hay autorización para merge, despliegue ni uso de bases operativas.
