# Sabora — Puerta de privilegios SQL para sesiones de clientes

Fecha: 2026-10-21. Estado: **diseño de seguridad; sin migración operativa**.

## Estado comprobado
- Las tablas `sabora.customer_profiles` y `sabora.customer_sessions` están bajo RLS + FORCE RLS y sin políticas ni grants de navegador.
- El backend dispone de SQL fijado para consulta de sesión y revocación, pero **no** dispone aún de una identidad PostgreSQL mínima habilitada para ambas operaciones.
- El módulo HTTP no está registrado en `server.mjs`. Esta puerta es obligatoria antes de habilitar rutas de clientes.

## Contrato de mínimo privilegio
1. Crear una identidad técnica específica **NOLOGIN, NOBYPASSRLS, NOSUPERUSER, NOCREATEDB, NOCREATEROLE**, separada de `anon`, `authenticated`, `sabora_admin_writer` y la identidad de migración.
2. El rol de conexión deberá recibir solo esa capacidad mediante una cadena de membresía explícita y auditada. No reutilizar credenciales de administración, servicio o migración en la API.
3. Preferir funciones SQL cerradas, con firma tipada y `SECURITY DEFINER` solo tras revisión independiente de propietario, `search_path` fijo, cualificación de objetos, permisos `EXECUTE` revocados a `PUBLIC`, y garantías RLS. Una función `SECURITY DEFINER` propiedad del dueño de tablas con `FORCE RLS` **no** elude automáticamente las políticas: demostrar en PostgreSQL 17 el comportamiento real.
4. La consulta de sesión únicamente debe devolver UUID interno y campos mínimos del perfil si el hash existe, no está revocado y no ha caducado. La revocación solo puede actualizar `revoked_at` de la sesión identificada por hash y debe ser idempotente.
5. Prohibir lectura masiva de perfiles/sesiones, enumeración por ID público, escrituras arbitrarias y cualquier permiso sobre pedidos, mesas, administración y auditoría.
6. La API nunca debe exponer hashes, credenciales, identificadores internos de otras personas ni errores SQL detallados.

## Pruebas de aceptación en PostgreSQL 17 desechable
- Rol técnico puede verificar token válido y revocar exactamente ese token.
- Token desconocido, caducado o revocado no autentica.
- `SELECT * FROM sabora.customer_sessions`, `SELECT * FROM sabora.customer_profiles`, `UPDATE` libre y `DELETE` directo son denegados al rol de conexión.
- `anon`, `authenticated` y `sabora_admin_writer` no adquieren acceso a funciones de sesiones.
- Intento de SQL injection por parámetros, búsqueda por ID público, acceso a sesiones de otro cliente y llamada directa sin token válido son denegados.
- Concurrencia de revocaciones, transacción fallida y errores de DB preservan fail-closed.
- Comprobar propiedad, `proacl`, `relrowsecurity`, `relforcerowsecurity`, `rolbypassrls` y ausencia de privilegios heredados inesperados.

## Decisión de implementación
**No aplicar GRANT directos a tablas ni funciones privilegiadas en producción** hasta tener pruebas SQL completas de lectura y revocación con rol de conexión no privilegiado. La frontera de SQL fijado en Node es defensa adicional, no reemplaza la separación de privilegios de PostgreSQL.

Esta especificación no autoriza despliegue ni cambios en Supabase operativo o VPS. Fleetia permanece totalmente fuera de alcance.
