# H3 — Endurecimiento de frontera de sesión de cliente

Fecha: 2026-10-26. Evidencia técnica, no normativa.

## Contratos de referencia

`docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md` y `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`.

## Alcance del bloque

- El hook de autenticación elimina cualquier `customerIdentity` previamente adjuntado a la petición antes de comprobar el bearer; únicamente el verificador server-owned puede establecerlo de nuevo.
- Se marca `Cache-Control: no-store` en respuestas de rutas autenticadas de cliente, incluidas respuestas 401 y 503, para reducir riesgo de exposición por cachés HTTP.
- Pruebas unitarias de suplantación mediante propiedad preexistente y de cabeceras de no-cache.
- Pruebas HTTP con Fastify: respuesta 200 de identidad, 401 de credencial falsa, 503 de verificador indisponible y 36 solicitudes concurrentes de dos identidades con credenciales inválidas intercaladas.

## Límites y activación

El bloque permanece candidato y aislado; `server.mjs` no importa el registrador de rutas. Las pruebas utilizan un adaptador SQL simulado y no sustituyen la verificación real en PostgreSQL 17 desechable. Siguen pendientes emisión de sesión y recuperación segura, QR/visita, confirmación transaccional y preflight SQL antes de habilitar rutas de cliente. Sin merge, despliegue ni cambios en Fleetia, VPS o Supabase operativo.
