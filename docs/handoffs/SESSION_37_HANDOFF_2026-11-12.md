# Sabora / CartaViva — continuidad operativa de la sesión 37 (2026-11-12)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA.** Desde esta sesión registrar aquí hitos nuevos y conservar la [sesión 36](SESSION_36_HANDOFF_2026-11-11.md) como antecedente. Ante cualquier discrepancia prevalece la documentación normativa de GitHub. No confundir código implementado, prueba ejecutada y aceptación operacional.

## 1. Índice, normativa y límites

- [Tablero vivo obligatorio](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
- [Sesión 36](SESSION_36_HANDOFF_2026-11-11.md), particularmente S36-17/18 (integración #56 y CI de `main`).
- [Método permanente de validación, diagnóstico y observabilidad](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [límite CartaViva/Fleetia](../architecture/CARTAVIVA_PROJECT_BOUNDARY.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [contrato de actor SQL y función propietaria sellada](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md) y [seguridad de operaciones SQL](../security/SABORA_ORDER_OPERATIONS_SQL_ACCESS_INVENTORY.md).
- [PR #57 Draft](https://github.com/jdlc86/CartaViva/pull/57), único hito nuevo de diagnóstico; [expediente técnico en su rama](https://github.com/jdlc86/CartaViva/blob/feat/sabora-cv005-pg17-provider-compat-20261112/docs/reviews/SABORA_CV005_SUPABASE_NONSUPERUSER_MIGRATION_REHEARSAL_2026-11-12.md).
- [Runbook P2 migración y recuperación](../runbooks/SABORA_P2_MIGRATION_RECOVERY_RUNBOOK_2026-10-29.md) y [runbook P3 continuidad](../runbooks/SABORA_P3_RECOVERY_CONTINUITY_RUNBOOK_2026-10-29.md).

**Invariantes:** solo `jdlc86/CartaViva`; un restaurante Sabora; dos PWA separadas; Fleetia y otros servicios VPS fuera de alcance. Un merge GitHub no autoriza DDL ni despliegue. Solo ejecutar SQL operativo, secretos y cambios VPS tras autorización específica y preflight de aislamiento.

## 2. S37-0 — estado de partida contrastado (12-11-2026)

La integración del [PR #56](https://github.com/jdlc86/CartaViva/pull/56) en `main` y [CI post-merge #43177964808](https://github.com/jdlc86/CartaViva/actions/runs/43177964808) ya estaban acreditadas en S36-18. La rama `main` se consultó en `de1697eb7a779a36e6064497d7e846651f724779`, después de actualizaciones exclusivamente documentales; no afirmar una ejecución CI nueva sobre este SHA si no existe. Hay **99 SQL** en `main`; la API ordinaria está limitada a `health-only` (`/ready=503`). Supabase operativo Sabora `byhvmumqivmunkmomhup` fue observado previamente `ACTIVE_HEALTHY` con PostgreSQL **17.11** y `current_user=postgres`, `rolcreaterole=true`, `rolsuper=false`; ausencia previa de esquema Sabora, ledger y tres LOGIN, no revalidada en esta sesión. El plan Free no acredita backup diario automático ni PITR.

Existe [PR #57](https://github.com/jdlc86/CartaViva/pull/57) para comprobar portabilidad de migraciones con LOGIN `CREATEROLE`, `NOSUPERUSER`, `NOBYPASSRLS` en PostgreSQL 17 desechable `--network none` y sin contraseñas ni red operativa. Se evitó crear otro PR.

## 3. S37-1 — bloque de diagnóstico integral de compatibilidad PG17 no superusuario

**Hechos observados en logs de CI, no presunciones:**

| Evidencia del PR #57 | Resultado |
| --- | --- |
| [#43184585309](https://github.com/jdlc86/CartaViva/actions/runs/43184585309), SHA `c2da8cf5` | El LOGIN restringido pasó preflight. La migración `20261021030000` falló: `must be able to SET ROLE sabora_customer_session_fn_owner` |
| [#43185379839](https://github.com/jdlc86/CartaViva/actions/runs/43185379839), SHA `8080d595` | Con `createrole_self_grant=set` de sesión se alcanzó `permission denied for schema sabora` al transferir ownership |
| [#43185863218](https://github.com/jdlc86/CartaViva/actions/runs/43185863218), SHA `dc54a3df` | `CREATE` transitorio de esquema permitió avanzar, pero `REVOKE` falló sin privilegios de propietario heredados |
| [#43186040203](https://github.com/jdlc86/CartaViva/actions/runs/43186040203), SHA `91b973c9` | Con `set,inherit`, nueva barrera **contractual**: `unsafe_sabora_order_operations_fn_owner_membership` en `20261024190000` |

**Causa material:** PostgreSQL 17 concede membresía ADMIN de forma automática a quien, siendo `CREATEROLE` no superusuario, crea un rol. La migración de operaciones firmadas exige que `sabora_order_operations_fn_owner` esté sellado `NOLOGIN`, `NOINHERIT` **sin ninguna membresía**. Esa condición no debe retirarse, ni puede darse por satisfecha simplemente porque el ensayo ejecutó otras migraciones. Documentación oficial PostgreSQL 17: [Role Attributes](https://www.postgresql.org/docs/17/role-attributes.html).

**Corrección/retirada segura:** se **revirtieron por completo las 14 modificaciones experimentales de migraciones históricas**; el [compare final](https://github.com/jdlc86/CartaViva/compare/main...feat/sabora-cv005-pg17-provider-compat-20261112) confirmó **cuatro rutas distintas** en PR #57: workflow específico PG17, script de ensayo, test contractual e informe. No hay SQL versionado modificado por este PR, ni se altera ningún contrato normativo. Los experimentos no equivalen a instalación aprobada.

En SHA **`4f19e12793e2c260c232593d1476276386f0617f`**, [workflow de compatibilidad #43186789371](https://github.com/jdlc86/CartaViva/actions/runs/43186789371) terminó `completed/failure` con señal **explícita y comprobada** `sabora_nonsuperuser_provider_no_go:automatic_createrole_membership_conflicts_with_sealed_owner`, después de `sabora_nonsuperuser_role_preflight_ok`. La puerta contractual de aislamiento pasó. Este `failure` es evidencia de un **NO-GO**, no una batería de 99 migraciones aprobada. El workflow UI [#43186789389](https://github.com/jdlc86/CartaViva/actions/runs/43186789389) terminó `success`; los integradores H6 y Bootstrap del mismo SHA estaban aún en ejecución en el último corte (no se les atribuye PASS). Las suites históricas verdes con superusuario no acreditan esta compatibilidad.

## 4. S37-2 — decisión de cierre y siguiente bloque integral

**Hito cerrado:** reproducción y clasificación del fallo de portabilidad; documentación del conflicto de seguridad y conservación íntegra de las 99 migraciones de `main`. **Hito no cerrado:** adaptación/aceptación de la cadena PostgreSQL 17.11 de Supabase; el PR #57 queda **Draft, sin merge, NO-GO para activación**. No declarar `CV-005` operativo ni aceptar cambios de normativa por una CI roja.

**Próximo bloque integral recomendado:** dictamen de arquitectura/DBA y seguridad sobre el **provisionamiento del propietario SQL sellado** y la compatibilidad de las 99 migraciones con `postgres` no superusuario del proyecto Supabase Sabora, sin membresías prohibidas ni superpoderes en runtime. Evaluar un camino privilegiado de proveedor si preserva exactamente la normativa, o tramitar una **decisión normativa nueva y revisión independiente** antes de cambiar el modelo. Después, probar cadena completa en laboratorio no superusuario con checksums, RLS, roles, HMAC/JWT y regresión integradora existente; preparar backup lógico Free **realmente restaurable**, identidades/secretos para CV-005, TLS/egress exclusivamente Sabora y observabilidad/alertas reales. El bootstrap ordinario `health-only` todavía no permite uso de restaurante.

**Operaciones expresamente no realizadas:** DDL/migración/cambios de roles en Supabase operativo, aprovisionamiento de los tres secretos del propietario, copia/restauración real, merge de PR #57, aceptación visual en dispositivos, modificación de VPS/Fleetia o despliegue.

## 5. S37-3 — preflight Supabase real, exclusivamente lectura (12-11-2026)

Consulta al conector de la cuenta **RESTAURANTE** y proyecto exacto **`byhvmumqivmunkmomhup`**: `status=ACTIVE_HEALTHY`, región `eu-central-1`, PostgreSQL `17.11`; `current_database()=postgres`, `current_user=postgres`, atributos **`rolcreaterole=true`, `rolsuper=false`, `rolbypassrls=true`**. La configuración de sesión `current_setting('createrole_self_grant',true)` devolvió **cadena vacía**. `to_regnamespace('sabora') IS NOT NULL=false`; `to_regrole('sabora_order_operations_fn_owner') IS NOT NULL=false`; total roles `sabora_*` **0**, membresías Sabora **0**, y no existe el ledger `public.sabora_migration_meta`. Fue **un único SELECT read-only**, sin crear roles, sin DDL, sin obtener contraseñas y sin consultar otros proyectos.

**Implicación que debe conservarse:** el administrador de Supabase **no es superusuario**, pero tiene **BYPASSRLS**. Por tanto, el fixture CI `CREATEROLE NOSUPERUSER NOBYPASSRLS` sigue siendo un ensayo deliberadamente más restringido, no una réplica exacta del rol `postgres` de Supabase. **Nunca** trasladar `postgres` ni BYPASSRLS a runtime; las identidades operativas SQL siguen sujetas a menor privilegio, RLS y actor verificado. La ausencia de roles Sabora deja abierta la fase de provisionamiento, pero no elimina la incompatibilidad entre membresía automática de `CREATEROLE` y la guarda de función propietaria sellada. La solución exige diseño/validación específico de seguridad y proveedor antes de instalar la cadena.

**Estado final de este bloque:** evidencia de proveedor read-only cerrada, instalación **NO-GO**; no backup/restore real, no secretos instalados, no escritura SQL, no despliegue o VPS.

---
_Esta sesión pasa a ser el registro operativo de nuevos hitos. Para cualquier avance reconsultar HEAD y CI exactos; no reciclar fotografías históricas de la sesión 36._