# Sabora — authorization and deployment gate

Status: **internal proof-of-concept; not approved for production**.

## Vigencia y alcance de las excepciones CV-005 (conciliación normativa, 2026-11-13)

Este documento conserva obligaciones P0 y controles negativos históricos. La cláusula
«sin membresías» de los **LOGIN técnicos del primer corte** y el veto de
`GRANT EXECUTE` antes de admitir la frontera HMAC describían un **preflight
provisional**, no una prohibición que anule automáticamente los contratos
positivos de identidad, capacidades y funciones posteriores que hayan sido
aprobados y probados. Ningún contrato de continuidad modifica esa regla.

La [decisión normativa CV-005 de autoridad DBA PostgreSQL 17](security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md)
reemplaza **exclusivamente** la ausencia absoluta de membresías en roles
propietarios/capacidades `NOLOGIN` creados por el **DBA instalador
`CREATEROLE/NOSUPERUSER`**: se tolera **solo** la membresía administrativa
automática del instalador, con `ADMIN TRUE, SET FALSE, INHERIT FALSE`,
concedida por la identidad privilegiada de arranque PostgreSQL, y ninguna otra.
Los grants temporales indispensables para transferencias de propiedad durante
una migración deben revocarse **antes del COMMIT**. La pertenencia DBA no
equivale a una defensa frente a un instalador comprometido: el DBA puede volver
a concederse `SET TRUE`; esa amenaza residual es parte expresa de CV-005.

**Esto NO permite** que ningún `LOGIN` de API, cocina, sala, PWA, notificador
o trabajador sea miembro de un propietario `SECURITY DEFINER` ni que utilice
credenciales del DBA, `service_role` o `BYPASSRLS`. Las capacidades runtime
positivas, si han sido autorizadas por su **contrato específico** y verificadas
por preflight real de PostgreSQL, solo permiten las funciones y lecturas
expresamente concedidas; no se deducen de la excepción administrativa CV-005,
ni conceden acceso directo general a tablas, DDL, propietario, keyring o
`PUBLIC/anon/authenticated`. En ausencia de contrato y prueba positivos,
se mantiene el rechazo por defecto.

La regla de identidad vinculada a HMAC, `FORCE RLS`, roles separados, mínima
autoridad, auditoría, denegación de suplantación, revocación y controles
económicos **no cambia**. Ni esta conciliación ni la CI verde autorizan un
`GRANT` operativo, migración, provisión de secretos, fusión en `main` o
despliegue. El estado del proveedor Supabase y la aceptación humana se
validan por separado.

## Scope: single restaurant

- Exactly one restaurant, represented by a singleton settings row. There are no tenant IDs, restaurant collections, branches, franchises or cross-restaurant routing in the application data model.
- Roles and account/visit permissions remain mandatory. Isolation from Fleetia is infrastructure isolation, not multitenancy.

## Trust boundary

- All restaurant/order functions remain **ungranted** to `anon`, `authenticated`, and `public`; all Sabora tables use **FORCE RLS** with no policies.
- `assignMember` in the in-memory domain is **test-only trusted setup**. It must never be exposed as an HTTP endpoint.
- `transition_order_status` currently receives `p_actor_user_id` as a parameter. Its membership lookup **does not authenticate that identity**. This RPC MUST NOT be granted to clients or any role that can be invoked on their behalf without a verified principal.
- Before opening routes, verify Supabase Auth JWT server-side (signature, issuer, audience, expiry), derive the actor ID exclusively from the verified token, then authorize staff membership and role inside the same database transaction.
- Do not trust role claims, employee numbers or actor IDs sent in request bodies as proof of authority.
- Order confirmation with a QR token requires rate limiting, durable persistence and a deliberate customer identity policy. Possession of a QR is not a staff credential.
- A restricted DB execution strategy must be reviewed against FORCE RLS. Do not use the Supabase service-role key in the browser or assume SECURITY INVOKER bypasses RLS.
- Verify account privacy, concurrent state transitions, audit integrity, cancellation notifications and token revocation before enabling routes.

## Isolation and deployment

- This repository is **jdlc86/CartaViva** only. No changes to Fleetia or other applications.
- Disposable PostgreSQL 17 CI containers run with `--network none` and are removed afterwards.
- No migrations have been applied to the operational Supabase project.
- No VPS deploy/restart/removal without explicit authorization and complete resource isolation from Fleetia and every other VPS project.

## Puerta específica de cocina y camarero (candidata, no activada)

- La RPC `sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)` recibe un UUID de actor como argumento. Comprobar la membresía de ese UUID **no demuestra** que el login SQL compartido esté actuando por esa persona. No conceder `EXECUTE` a identidades técnicas ni montar las rutas operativas mientras esa vinculación no sea verificable en PostgreSQL.
- **Corte P0 inicial (preflight negativo):** los dos logins SQL se exigían distintos, no privilegiados y sin membresías, con `USAGE` pero no `CREATE` en `sabora`, sin ejecución de la RPC todavía insegura ni los siete privilegios de tabla sobre las tablas/vistas privadas. Ese veto temporal precedía a la frontera HMAC y **no sustituye** los contratos positivos posteriores: cualquier permiso operativo debe seguir siendo específico, auditable y rechazado si falta su preflight. La única excepción administrativa de CV-005 es la descrita arriba; nunca se extiende a membresías LOGIN→owner.
- La validación de salidas de tablero e historial (rol, filtro, transiciones, continuidad y unicidad de eventos) es defensa adicional; no sustituye autorización transaccional, RLS ni identidad no falsificable.
- Cualquier futura política positiva de grants requiere diseño aprobado y pruebas reales de denegación, suplantación, concurrencia y revocación en PostgreSQL 17 desechable antes de considerar activación.
- Mantener `apps/api/src/server.mjs` sin registrar las rutas operativas; ningún cambio de documentación o CI implica autorización de despliegue.

## Resolución candidata de actor y ciclo de personal (2026-10-25)

- La RPC anterior con `p_actor_user_id` libre permanece revocada. La nueva
  frontera firma `session_user`, actor, operación y efecto en una capacidad HMAC
  de vida corta que PostgreSQL verifica dentro de la transacción.
- El alta de personal empieza en `staff_enrollments`, antes de Auth, y admite
  revocación inmediata. Aceptación, credencial, activación, suspensión y
  revocación usan el mismo patrón de capacidad, ledger y auditoría.
- Los propietarios de funciones son roles `NOLOGIN` sellados bajo la
  excepción **DBA instalador exclusivamente** de CV-005 indicada arriba. En
  el **corte original** los logins runtime aún no existían ni tenían
  membresías, DDL, tablas directas ni `GRANT EXECUTE`; esa descripción es
  histórica. Una capacidad positiva posterior exige autorización y
  preflight propios: nunca concede membresía en un owner, DDL, lectura de
  keyrings o ejecución pública. Los keyrings permanecen sin activarse
  hasta la provisión operativa expresamente autorizada.
- La evidencia positiva existe solo en PostgreSQL 17 desechable. Las rutas y la
  UI siguen sin activar hasta aprobar claves, logins, invitación/WebAuthn,
  lecturas y despliegue. Véanse `SABORA_P0_ACTOR_SQL_BINDING_DECISION.md` y
  `SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md`.
