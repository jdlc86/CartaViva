# H3 — Composición aislada de rutas autenticadas de cliente

Fecha: 2026-10-26. Evidencia de implementación, no contrato normativo.

## Normativa

- `docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md`: autenticación de sesión persistente, no usar alias/ID visible como prueba de titularidad, mantener rutas sin activar hasta cerrar seguridad.
- `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`: control de acceso y ausencia de polling.

## Implementación candidata

`apps/api/src/customer-routes-composition.mjs` permite registrar rutas de cliente en un plugin Fastify encapsulado bajo `/api/v1/customer` con hook de sesión server-owned. El caller debe inyectar verificador y registrador explícitos; `server.mjs` no importa el módulo. El hook adjunta únicamente el UUID interno verificado. Las pruebas de integración mediante `Fastify.inject` comprueban 401 anónimo, rechazo de ID público o bearer desconocido, éxito con sesión verificada y aislamiento de `/health`.

## Pendiente para activación

Este cambio no crea ninguna ruta de producción, emisión de credenciales, visita, QR ni confirmación. La emisión y entrega segura de sesiones y la autorización de visita/mesa siguen siendo condiciones previas, así como los preflight SQL. No se modifica Fleetia, VPS ni Supabase operativo. Sin merge o despliegue.
