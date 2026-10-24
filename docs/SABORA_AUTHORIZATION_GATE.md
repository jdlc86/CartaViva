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
