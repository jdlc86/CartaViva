# Sabora — authorization and deployment gate

Status: **internal proof-of-concept; not approved for production**.

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
- El preflight opt-in de operaciones comprueba que los dos logins SQL son distintos, no privilegiados y sin membresías, que tienen `USAGE` pero no `CREATE` sobre `sabora`, que no pueden ejecutar la RPC candidata y que carecen de los siete privilegios de tabla sobre **cualquier** tabla o vista privada del esquema. Esta política temporal de cero grants es intencionada; no constituye el modelo positivo final.
- La validación de salidas de tablero e historial (rol, filtro, transiciones, continuidad y unicidad de eventos) es defensa adicional; no sustituye autorización transaccional, RLS ni identidad no falsificable.
- Cualquier futura política positiva de grants requiere diseño aprobado y pruebas reales de denegación, suplantación, concurrencia y revocación en PostgreSQL 17 desechable antes de considerar activación.
- Mantener `apps/api/src/server.mjs` sin registrar las rutas operativas; ningún cambio de documentación o CI implica autorización de despliegue.
