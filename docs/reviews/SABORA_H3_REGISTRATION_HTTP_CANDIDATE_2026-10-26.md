# H3 — Alta HTTP de cliente (candidata, no activada)

Fecha: 2026-10-26. Documento de implementación, no normativa.

## Fuente normativa

`docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md`: alias obligatorio, empresa opcional, ID visible generado por servidor, sesión opaca emitida solo tras persistencia, recuperación y protección XSS/CSRF. La normativa no permite activar acceso HTTP sin cerrar la seguridad.

## Implementación

`apps/api/src/customer-registration-http-candidate.mjs` recibe una función `register` transaccional inyectada (puede utilizar `createCustomerRegistrationWithSession`), valida origen HTTPS exacto, JSON y campos de perfil, devuelve solo ID público/alias/empresa y, únicamente tras éxito de registro, emite cookie `HttpOnly; Secure; SameSite=Strict` limitada a `/api/v1/customer`. Respuestas `no-store`, rechazo de payload con identificadores/roles y fallo genérico si la transacción falla. Las pruebas `Fastify.inject` cubren éxito, origen falso, entrada inválida, sesión caducada, resultado inconsistente y errores SQL.

## Bloqueadores expresos de activación

- El hook de autenticación vigente acepta `Authorization: Bearer` y **todavía no consume la cookie**; no conectar el registro a producción hasta implementar lectura segura de cookie, CSRF, logout y rotación conforme al contrato aprobado.
- La función `register` debe vincularse a la transacción real y al rol PostgreSQL mínimo con preflight PG17; las pruebas HTTP actuales usan dobles controlados.
- Validar HTTPS/origen real y estrategia de recuperación/passkey y conservación antes de despliegue.
- No se importa en `server.mjs`, no se monta endpoint operativo, no se modifican Supabase operativo, VPS ni Fleetia. Sin merge o despliegue.
