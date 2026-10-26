# H3 — Frontera HTTP autenticada de cliente (candidato aislado)

Fecha: 2026-10-26. Documento de evidencia, no normativa.

## Fuentes normativas

- `docs/architecture/SABORA_CUSTOMER_IDENTITY_CONTRACT.md`: el ID visible, alias y empresa no acreditan identidad; sesiones revocables/caducables, verificación server-owned; no abrir rutas antes de completar controles.
- `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`: sin polling y sin exposición de datos ajenos.

## Implementación

`apps/api/src/customer-protected-hook.mjs` implementa un hook de autenticación **inyectable y no montado**. Rechaza encabezados ausentes o no canónicos antes de consultar la sesión; pasa exclusivamente el token opaco al verificador server-owned existente (`customer-session-verifier.mjs`, que consulta el hash parametrizado en SQL). Solo adjunta al request el UUID interno verificado, nunca el ID visible, alias, empresa ni bearer. Las sesiones no encontradas, caducadas o revocadas deben producir `null` desde la función SQL de verificación y devuelven 401. Las averías de DB no se convierten en identidades válidas. Pruebas cubren falsificación, formatos, ausencia, respuesta inválida y fallo del verificador.

## Límite de activación

No se han añadido rutas, logins, permisos SQL, aprovisionamiento de credenciales ni acceso a datos de clientes. `server.mjs` permanece sin importarlo. La activación requiere cerrar el flujo aprobado de emisión y entrega segura de credenciales, visitas y QR, además de preflight SQL. No hay despliegue, merge, cambios en Fleetia/VPS ni en Supabase operativo.
