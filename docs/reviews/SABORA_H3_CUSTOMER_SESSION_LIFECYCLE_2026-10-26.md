# H3 — Ciclo de sesión de cliente y aislamiento HTTP (candidato)

Fecha: 2026-10-26. Evidencia de implementación, no contrato normativo.

Fuente normativa: `docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md`.

## Bloque implementado

- Prueba de integración `Fastify.inject` con dos clientes distintos, tokens opacos emitidos por servidor, lookup por hash parametrizado y separación de identidades.
- Revocación de una sesión sin afectar a la otra; caducidad de la segunda y rechazo del ID visible como credencial sin consulta SQL.
- Rutas ajenas (`/health`) permanecen disponibles y fuera del ámbito de autenticación de cliente.
- La avería de verificación SQL devuelve `503 authentication_unavailable` sin detalles internos, sin conceder identidad ni revelar token o datos de conexión.
- Ajuste de pruebas de contrato del hook para exigir respuesta genérica de fallo cerrado.

## Frontera de activación

El repositorio sigue sin montar estas rutas en `server.mjs`; el lookup SQL se simula en memoria únicamente en pruebas. No se han habilitado altas, emisión HTTP de credenciales, passkeys, QR, visitas ni confirmación de pedidos. La verificación del ciclo real contra PostgreSQL 17 desechable y el preflight normativo siguen siendo obligatorios antes de activar rutas. Sin merge, despliegue, VPS, Fleetia ni Supabase operativo.
