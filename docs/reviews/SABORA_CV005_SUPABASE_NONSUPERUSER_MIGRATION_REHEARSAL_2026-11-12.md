# CV-005 · Dictamen de compatibilidad PG17 CREATEROLE sin superusuario (12-11-2026)

**Naturaleza:** diagnóstico técnico de bloqueo crítico de primera migración, no modificación de normativa ni autorización operativa. [Contrato normativo de validación](../architecture/SABORA_VALIDATION_OBSERVABILITY_METHOD_V1.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md), [seguridad del actor SQL](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md), [informe de continuidad 36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md).

## Objetivo y evidencias trazables

La base **Sabora solamente** observada en la sesión 36 tiene PostgreSQL 17.11 y cuenta `postgres` con `CREATEROLE`, pero **NO SUPERUSER**. Las **99 migraciones** de `main` habían pasado en el laboratorio con superusuario: eso **no** acredita compatibilidad con el proveedor. El [PR #57](https://github.com/jdlc86/CartaViva/pull/57) inició un segundo laboratorio `postgres:17-alpine` aislado `--network none`, sin secretos, para ejecutar la cadena como un LOGIN desechable `NOSUPERUSER/NOBYPASSRLS/CREATEROLE`.

Se reprodujeron sucesivamente:
1. [Run #43184585309](https://github.com/jdlc86/CartaViva/actions/runs/43184585309): `SET ROLE sabora_customer_session_fn_owner` no permitido en migración `20261021030000` al cambiar dueño de función.
2. [Run #43185379839](https://github.com/jdlc86/CartaViva/actions/runs/43185379839): con `createrole_self_grant=set`, `permission denied for schema sabora` al transferir propiedad; el nuevo owner necesitaría `CREATE` durante esa operación.
3. [Run #43185863218](https://github.com/jdlc86/CartaViva/actions/runs/43185863218): conceder `CREATE` temporal en la migración permite llegar a la ACL, que falla `permission denied for function verify_customer_session_hash` por falta de herencia del owner.
4. [Run #43186040203](https://github.com/jdlc86/CartaViva/actions/runs/43186040203): habilitar `createrole_self_grant=set,inherit` supera esas barreras, pero la migración `20261024190000_sabora_order_operation_actor_capability_candidate.sql` rechaza la **membresía automática** en `sabora_order_operations_fn_owner` con `unsafe_sabora_order_operations_fn_owner_membership`. Esa guarda exige que el propietario sellado no tenga membresías entrantes ni salientes; **no puede rebajarse incidentalmente**.

La [documentación oficial PostgreSQL 17](https://www.postgresql.org/docs/17/role-attributes.html) explica que un usuario no superusuario con `CREATEROLE` recibe automáticamente `ADMIN TRUE / SET FALSE / INHERIT FALSE` sobre el rol recién creado, en un grant del bootstrap superuser que ese usuario no puede revocar o alterar. Por tanto, **no existe base para afirmar que las 99 migraciones pueden instalarse tal cual con ese operador y sin revisión de la guarda de propiedad sellada**.

## Decisión técnica: NO-GO sin relajar seguridad

El intento exploratorio de añadir `CREATE` a 14 migraciones históricas y activar `set,inherit` en la sesión migratoria **se descarta**: no resuelve el contrato de NO MEMBRESÍA y alteraría 14 checksums de una cadena versionada. **Los 14 archivos quedan restaurados byte a byte desde `main` en el candidato**, y el laboratorio conserva como puerta negativa la comprobación real de membresía automática. El gate debe **fallar explícitamente** con `sabora_nonsuperuser_provider_no_go`, no marcar la cadena como aprobada.

### Condiciones de desbloqueo sin interpretación de normas

El propietario y revisión de seguridad/DBA deben definir y aprobar una de estas vías **antes de DDL real**:
- Provisionamiento de propietarios `NOLOGIN` sellados mediante un mecanismo privilegiado del proveedor capaz de respetar la guarda de ausencia de membresías y permitir asignaciones de ownership, con pruebas de roles y SQL equivalentes al contrato vigente.
- Una **decisión normativa explícita**, revisada independientemente, que resuelva la incompatibilidad de pertenencia del administrador de migraciones sin permitir membresía runtime ni ampliar las capacidades del actor. No modificar la guarda por conveniencia de CI.

Ambas requieren preflight específico Supabase PG17.11, roles preexistentes, 99 huellas de migración del SHA, copia lógica cifrada/restauración ensayada en plan Free, y autorización separada para Supabase. No hay camino acreditado hacia despliegue VPS hasta cerrar CV-005, CV-010 y CV-011.

## Evidencia y límites

El laboratorio **no tocó Supabase operativo, secretos, datos reales, VPS ni Fleetia**. Un resultado negativo de este gate no contradice las suites integradoras H6/Chromium aprobadas con el superusuario de Docker; revela una diferencia real de privilegios. Mantener el PR #57 Draft/NO-GO, sin integración mientras el contrato no tenga solución probada. No se ha realizado migración, backup real, bootstrap operativo ni aceptación visual.

**Estado del último SHA:** la puerta negativa está implementada; verificar el run nuevo de GitHub antes de declarar también confirmada su señal específica.