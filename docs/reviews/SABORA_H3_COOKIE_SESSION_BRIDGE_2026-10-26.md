# H3 — Puente de sesión de cliente mediante cookie segura (candidato)

Fecha: 2026-10-26. Evidencia de implementación, no normativa.

## Fuente de verdad

`docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md` y `docs/architecture/SABORA_CUSTOMER_SESSION_SQL_PRIVILEGES.md`.

## Bloque integrado

- El alta HTTP candidata del PR #27 entrega una cookie HttpOnly/Secure/SameSite=Strict tras persistencia exitosa.
- Este bloque añade un lector estricto de esa cookie y una composición Fastify aislada para `/api/v1/customer/session` y `/api/v1/customer/logout`.
- El verificador existente consulta únicamente el hash del token mediante el boundary SQL de sesiones; no se aceptan identificadores visibles ni un bearer alternativo.
- El cierre de sesión exige `Origin` HTTPS exacto y deniega solicitudes `Sec-Fetch-Site: cross-site`; revoca por hash en PostgreSQL y borra cookie tras resultado válido. No borra cookie si la base de datos falla.
- Las respuestas son `Cache-Control: no-store`; los fallos SQL son genéricos. Tests Fastify comprueban cookie válida, suplantación, origen cruzado, revocación y fallo del verificador.

## Límites obligatorios

Este código es candidato opt-in y **no está montado en `server.mjs`**. Las pruebas de este adaptador usan una simulación controlada del pool; antes de activar se requieren pruebas PostgreSQL 17 desechable con roles mínimos, integración de registro real, CSRF para todas las mutaciones con cookie, revisión de rotación/recuperación/passkey y flujos QR/visita/pedido. El endpoint `/session` solo devuelve un booleano y no revela datos personales. No se han aplicado migraciones operativas, hecho merge ni desplegado en VPS/Supabase. Fleetia intacto.
